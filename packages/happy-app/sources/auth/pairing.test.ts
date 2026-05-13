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
    completePair,
    credentialsFromPairMachine,
    parseTunnelClaimPayload,
} from './pairing';
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

    it('completes the pair against /pair/complete with gateway X-Tunnel-Authorization', async () => {
        const tunnelClaim = encodeClaim({ sub: 'local-user', iat: 1, exp: 3601, jti: 'jti-1', accountId: 42 });
        (global.fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                githubLogin: 'octocat',
                machine: {
                    machineId: 'machine-1',
                    tunnelUrl: 'https://58l8c10h-51371.usw2.devtunnels.ms',
                    ed25519PublicKey: 'ed-pubkey',
                    x25519PublicKey: 'x-pubkey',
                    ed25519Fingerprint: 'SHA256:test',
                    tunnelClaim,
                },
            }),
        });

        const result = await completePair(machine, 'connect-jwt');

        expect(global.fetch).toHaveBeenCalledWith('https://machine.example.test/pair/complete', expect.objectContaining({
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Tunnel-Authorization': 'tunnel connect-jwt',
            },
            body: '{}',
        }));
        expect(result.githubLogin).toBe('octocat');
        expect(result.machine.machineId).toBe('machine-1');
        expect(parseTunnelClaimPayload(tunnelClaim)).toMatchObject({ sub: 'local-user', accountId: 42, jti: 'jti-1' });

        const credentials = credentialsFromPairMachine(machine, result.machine, {
            login: 'octocat',
            avatarUrl: 'https://avatars.example.test/octocat.png',
            connectToken: 'connect-jwt',
            connectTokenExpiry: Date.now() + 3_300_000,
        });
        expect(credentials).toMatchObject({
            machineId: 'machine-1',
            tunnelId: 'tunnel-1',
            tunnelUrl: 'https://58l8c10h-51371.usw2.devtunnels.ms',
            tunnelClaim,
            login: 'octocat',
            connectToken: 'connect-jwt',
        });
    });

    it('rejects /pair/complete responses whose claim is missing accountId', async () => {
        const tunnelClaim = encodeClaim({ sub: 'local-user', iat: 1, exp: 3601, jti: 'jti-1' });
        (global.fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                githubLogin: 'octocat',
                machine: {
                    machineId: 'machine-1',
                    tunnelUrl: 'https://58l8c10h-51371.usw2.devtunnels.ms',
                    ed25519PublicKey: 'ed-pubkey',
                    x25519PublicKey: 'x-pubkey',
                    tunnelClaim,
                },
            }),
        });

        await expect(completePair(machine, 'connect-jwt')).rejects.toBeInstanceOf(PairingClaimMissingAccountId);
    });

    it('throws on non-200 /pair/complete responses', async () => {
        (global.fetch as any).mockResolvedValueOnce({ ok: false, status: 503 });
        await expect(completePair(machine, 'connect-jwt')).rejects.toThrow('Failed to complete pairing: 503');
    });
});
