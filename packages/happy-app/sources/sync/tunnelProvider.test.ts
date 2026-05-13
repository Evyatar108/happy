import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({
    default: { expoConfig: { version: '1.2.3' } },
}));

import { DevTunnelsClientProvider, DevTunnelsTokenExpired, type DevTunnelsCredentials } from './tunnelProvider';

function credentials(token: string | null = 'ghu-token'): DevTunnelsCredentials {
    return {
        getDevTunnelsToken: vi.fn().mockResolvedValue(token),
        setDevTunnelsToken: vi.fn().mockResolvedValue(undefined),
    };
}

function response(status: number, data: unknown = {}): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => data,
    } as Response;
}

describe('DevTunnelsClientProvider', () => {
    it('lists machine tunnels through fetch with Dev Tunnels auth headers', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(response(200, {
            value: [{
                value: [{
                    tunnelId: 'tunnel-1',
                    labels: ['happy-machine', 'machineId:machine-1'],
                    webForwardingUri: 'https://tunnel-1.devtunnels.ms',
                    lastHostConnectionTime: '2026-05-11T12:00:00.000Z',
                    owner: { login: 'evy' },
                }],
            }],
        }));
        const provider = new DevTunnelsClientProvider({
            credentials: credentials(),
            apiBaseUrl: 'https://devtunnels.test',
            fetchImpl,
        });

        await expect(provider.listMachineTunnels()).resolves.toEqual([{
            machineId: 'machine-1',
            tunnelId: 'tunnel-1',
            url: 'https://tunnel-1.devtunnels.ms',
            tags: ['happy-machine', 'machineId:machine-1'],
            lastSeenAt: '2026-05-11T12:00:00.000Z',
            owner: 'evy',
        }]);

        expect(fetchImpl).toHaveBeenCalledWith(
            'https://devtunnels.test/tunnels?includePorts=true&global=true&labels=happy-machine&api-version=2023-09-27-preview',
            { headers: { Authorization: 'github ghu-token', 'X-Tunnel-User-Agent': 'happy-agent/1.2.3' } },
        );
    });

    it('gets connect tokens and deletes tunnels by tunnelId', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(response(200, { accessTokens: { connect: 'connect-jwt' } }))
            .mockResolvedValueOnce(response(204));
        const provider = new DevTunnelsClientProvider({
            credentials: credentials(),
            apiBaseUrl: 'https://devtunnels.test',
            fetchImpl,
        });

        await expect(provider.getConnectToken('tunnel-1')).resolves.toBe('connect-jwt');
        await expect(provider.deleteTunnel('tunnel-1')).resolves.toBeUndefined();

        expect(fetchImpl).toHaveBeenNthCalledWith(1,
            'https://devtunnels.test/tunnels/tunnel-1?tokenScopes=connect&api-version=2023-09-27-preview',
            { headers: { Authorization: 'github ghu-token', 'X-Tunnel-User-Agent': 'happy-agent/1.2.3' } },
        );
        expect(fetchImpl).toHaveBeenNthCalledWith(2,
            'https://devtunnels.test/tunnels/tunnel-1?api-version=2023-09-27-preview',
            { method: 'DELETE', headers: { Authorization: 'github ghu-token', 'X-Tunnel-User-Agent': 'happy-agent/1.2.3' } },
        );
    });

    it('reports login state, persists interactive login, and surfaces expired tokens', async () => {
        await expect(new DevTunnelsClientProvider({ credentials: credentials('token') }).isLoggedIn()).resolves.toBe(true);
        await expect(new DevTunnelsClientProvider({ credentials: credentials(null) }).isLoggedIn()).resolves.toBe(false);

        const store = credentials(null);
        await new DevTunnelsClientProvider({
            credentials: store,
            loginInteractive: vi.fn().mockResolvedValue('new-token'),
        }).loginInteractive();
        expect(store.setDevTunnelsToken).toHaveBeenCalledWith('new-token');

        const provider = new DevTunnelsClientProvider({
            credentials: credentials(),
            fetchImpl: vi.fn().mockResolvedValue(response(401)),
        });
        await expect(provider.listMachineTunnels()).rejects.toBeInstanceOf(DevTunnelsTokenExpired);
    });

    it('surfaces expired tokens from getConnectToken', async () => {
        const provider = new DevTunnelsClientProvider({
            credentials: credentials(),
            fetchImpl: vi.fn().mockResolvedValue(response(401)),
        });

        await expect(provider.getConnectToken('tunnel-1')).rejects.toBeInstanceOf(DevTunnelsTokenExpired);
    });
});
