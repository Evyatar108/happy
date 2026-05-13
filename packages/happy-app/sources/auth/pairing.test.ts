import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-web-browser', () => ({
    openBrowserAsync: vi.fn(),
}));

vi.mock('@/sync/serverConfig', () => ({
    getServerUrl: () => 'https://machine.example.test',
}));

vi.mock('expo-constants', () => ({
    default: { expoConfig: { version: '1.2.3' } },
}));

vi.mock('react-native', () => ({
    Platform: { OS: 'ios' },
}));

const providerMocks = vi.hoisted(() => ({
    getConnectToken: vi.fn(),
}));

vi.mock('@/sync/tunnelProvider', () => ({
    DevTunnelsClientProvider: vi.fn(() => ({ getConnectToken: providerMocks.getConnectToken })),
}));

import {
    acquireConnectTokenForPair,
    PairingClaimMissingAccountId,
    credentialsFromPairMachine,
    fetchGitHubUserProfile,
    parseTunnelClaimPayload,
    pollPairStatus,
    startPairFlow,
    waitForPairStatus,
} from './pairing';
import { deriveConnectTokenExpiry } from './connectTokenRefresh';
import type { MachineTunnel } from '@/sync/tunnelProvider';

function encodeClaim(payload: unknown): string {
    const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return Buffer.from(JSON.stringify({ p, s: 'signature' })).toString('base64url');
}

const machine: MachineTunnel = {
    machineId: 'machine-1',
    tunnelId: 'tunnel-1',
    url: 'https://machine.example.test',
    tags: ['happy-machine'],
    lastSeenAt: '2026-05-11T12:00:00.000Z',
    owner: 'octocat',
};

describe('pairing', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        global.fetch = vi.fn();
        providerMocks.getConnectToken.mockResolvedValue('connect-jwt');
    });

    it('acquires a connect token once for the selected tunnel', async () => {
        await expect(acquireConnectTokenForPair(machine)).resolves.toMatchObject({ connectToken: 'connect-jwt' });
        expect(providerMocks.getConnectToken).toHaveBeenCalledOnce();
        expect(providerMocks.getConnectToken).toHaveBeenCalledWith('tunnel-1');
    });

    it('starts and polls the selected machine pair flow without connect-token transport auth', async () => {
        const tunnelClaim = encodeClaim({ sub: 'local-user', iat: 1, exp: 3601, jti: 'jti-1', accountId: 42 });
        (global.fetch as any)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    device_code: 'device-1',
                    user_code: 'ABCD-EFGH',
                    verification_uri: 'https://github.com/login/device',
                    interval: 5,
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    status: 'authorized',
                    machines: [{
                        machineId: 'machine-1',
                        tunnelUrl: 'https://machine.example.test',
                        ed25519PublicKey: 'ed-pubkey',
                        x25519PublicKey: 'x-pubkey',
                        ed25519Fingerprint: 'SHA256:test',
                        tunnelClaim,
                        mobileSharedSecret: 'legacy-secret',
                    }],
                }),
            });

        const start = await startPairFlow(machine, 'connect-jwt');
        const status = await pollPairStatus(machine, start.device_code, start.interval, 'connect-jwt');

        expect(global.fetch).toHaveBeenNthCalledWith(1, 'https://machine.example.test/pair/start', {
            headers: { 'X-Tunnel-Connect': 'connect-jwt' },
        });
        expect(global.fetch).toHaveBeenNthCalledWith(2, 'https://machine.example.test/pair/status', expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Tunnel-Connect': 'connect-jwt' },
            body: expect.stringContaining('"device_code":"device-1"'),
        }));
        expect(JSON.stringify((global.fetch as any).mock.calls)).not.toContain('/pair/connect');
        expect(JSON.stringify((global.fetch as any).mock.calls)).not.toContain('X-Tunnel-Authorization');
        expect(start.expires_in).toBe(900);
        expect(start.interval).toBe(12);
        expect(status).toMatchObject({
            status: 'authorized',
            machines: [{ machineId: 'machine-1', tunnelUrl: 'https://machine.example.test' }],
        });
        expect(parseTunnelClaimPayload(tunnelClaim)).toMatchObject({ sub: 'local-user', accountId: 42, jti: 'jti-1' });
        const credentials = credentialsFromPairMachine(machine, status.machines![0]!, {
            login: 'octocat',
            avatarUrl: 'https://avatars.example.test/octocat.png',
            deviceCode: 'device-1',
            deviceCodeExpiresAt: Date.now() + 900_000,
            connectToken: 'connect-jwt',
            connectTokenExpiry: Date.now() + 3_300_000,
        });
        expect(credentials).toMatchObject({
            machineId: 'machine-1',
            tunnelId: 'tunnel-1',
            tunnelUrl: 'https://machine.example.test',
            tunnelClaim,
            login: 'octocat',
            avatarUrl: 'https://avatars.example.test/octocat.png',
            deviceCode: 'device-1',
            connectToken: 'connect-jwt',
        });
        expect(credentials.deviceCodeExpiresAt).toBeGreaterThanOrEqual(Date.now() + 895_000);
        expect(credentials.deviceCodeExpiresAt).toBeLessThanOrEqual(Date.now() + 905_000);
        expect(credentials).not.toHaveProperty('pinnedPubkey');
        expect(credentials).not.toHaveProperty('sessionKey');
    });

    it('rejects authorized pair status without accountId and backs off rate-limited polls', async () => {
        (global.fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                status: 'authorized',
                machines: [{
                    machineId: 'machine-1',
                    tunnelUrl: 'https://machine.example.test',
                    ed25519PublicKey: 'ed-pubkey',
                    x25519PublicKey: 'x-pubkey',
                    tunnelClaim: encodeClaim({ sub: 'local-user', iat: 1, exp: 3601, jti: 'jti-2' }),
                }],
            }),
        });

        await expect(pollPairStatus(machine, 'device-1', 5, 'connect-jwt')).rejects.toBeInstanceOf(PairingClaimMissingAccountId);

        (global.fetch as any).mockResolvedValueOnce({
            ok: false,
            status: 429,
            json: async () => ({ error: 'rate_limited' }),
        });

        await expect(pollPairStatus(machine, 'device-1', 5, 'connect-jwt')).resolves.toEqual({
            status: 'pending',
            retryAfterMs: 12_000,
        });
    });

    it('rejects authorized pair status with zero machines or more than one machine', async () => {
        (global.fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ status: 'authorized', machines: [] }),
        });

        await expect(pollPairStatus(machine, 'device-1', 5, 'connect-jwt')).rejects.toThrow('exactly one machine');

        (global.fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                status: 'authorized',
                machines: [
                    { machineId: 'machine-1', tunnelUrl: 'https://m1.example.test', tunnelClaim: encodeClaim({ accountId: 1 }) },
                    { machineId: 'machine-2', tunnelUrl: 'https://m2.example.test', tunnelClaim: encodeClaim({ accountId: 2 }) },
                ],
            }),
        });

        await expect(pollPairStatus(machine, 'device-1', 5, 'connect-jwt')).rejects.toThrow('exactly one machine');
    });

    it('best-effort fetches GitHub user profile metadata from the OAuth token', async () => {
        (global.fetch as any).mockResolvedValue({
            ok: true,
            json: async () => ({ login: 'octocat', avatar_url: 'https://avatars.example.test/octocat.png' }),
        });

        await expect(fetchGitHubUserProfile('ghu-token')).resolves.toEqual({
            login: 'octocat',
            avatarUrl: 'https://avatars.example.test/octocat.png',
        });

        expect(global.fetch).toHaveBeenCalledWith('https://api.github.com/user', {
            headers: {
                Accept: 'application/vnd.github+json',
                Authorization: 'Bearer ghu-token',
            },
        });
    });

    it('returns empty GitHub profile metadata when the best-effort user fetch fails', async () => {
        (global.fetch as any).mockResolvedValue({ ok: false });

        await expect(fetchGitHubUserProfile('ghu-token')).resolves.toEqual({ login: '', avatarUrl: '' });
    });

    it('persisted expiry is within 5s of pair-completion timestamp when computed after waitForPairStatus', async () => {
        vi.useFakeTimers();
        try {
            const tunnelClaim = encodeClaim({ sub: 'local-user', iat: 1, exp: 3601, jti: 'jti-3', accountId: 42 });
            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    status: 'authorized',
                    machines: [{ machineId: 'machine-1', tunnelUrl: 'https://machine.example.test', tunnelClaim }],
                }),
            });

            const flow = { device_code: 'device-1', user_code: 'ABCD', verification_uri: 'https://github.com/login/device', interval: 1, expires_in: 900 };
            const pairPromise = waitForPairStatus(machine, flow, 'connect-jwt');
            await vi.runAllTimersAsync();
            await pairPromise;

            const realNow = Date.now();
            const connectTokenExpiry = deriveConnectTokenExpiry(realNow);

            const CONNECT_TOKEN_TTL_MS = 55 * 60_000;
            expect(connectTokenExpiry).toBeGreaterThanOrEqual(realNow + CONNECT_TOKEN_TTL_MS);
            expect(connectTokenExpiry).toBeLessThanOrEqual(realNow + CONNECT_TOKEN_TTL_MS + 5_000);
        } finally {
            vi.useRealTimers();
        }
    });
});
