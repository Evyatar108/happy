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

import { fetchGitHubUserProfile, pollPairing, startPairing } from './pairing';

describe('pairing', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        global.fetch = vi.fn();
    });

    it('starts GitHub device flow and polls machine discovery status', async () => {
        (global.fetch as any)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    device_code: 'device-1',
                    user_code: 'ABCD-EFGH',
                    verification_uri: 'https://github.com/login/device',
                    expires_in: 900,
                    interval: 1,
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
                        tunnelClaim: 'jwt-1',
                    }],
                }),
            });

        const start = await startPairing();
        const status = await pollPairing(start.device_code);

        expect(global.fetch).toHaveBeenNthCalledWith(1, 'https://machine.example.test/pair/start');
        expect(global.fetch).toHaveBeenNthCalledWith(2, 'https://machine.example.test/pair/status', expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: expect.stringContaining('"device_code":"device-1"'),
        }));
        expect(status).toMatchObject({
            status: 'authorized',
            machines: [{ machineId: 'machine-1', tunnelUrl: 'https://machine.example.test' }],
        });
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
});
