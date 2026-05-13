import { describe, expect, it, vi } from 'vitest';

import { DevTunnelsClientProvider, type DevTunnelsCredentials } from './clientProvider';

function credentials(token: string | null = 'ghu-token'): DevTunnelsCredentials {
    return {
        getDevTunnelsToken: vi.fn().mockResolvedValue(token),
        setDevTunnelsToken: vi.fn().mockResolvedValue(undefined),
    };
}

describe('DevTunnelsClientProvider', () => {
    it('lists happy-machine tunnels through the Dev Tunnels API', async () => {
        const httpClient = {
            get: vi.fn().mockResolvedValue({
                data: {
                    value: [{
                        value: [{
                            tunnelId: 'tunnel-1',
                            labels: ['happy-machine', 'machineId:machine-1'],
                            webForwardingUri: 'https://tunnel-1.devtunnels.ms',
                            lastHostConnectionTime: '2026-05-11T12:00:00.000Z',
                            owner: { login: 'evy' },
                        }],
                    }],
                },
            }),
            delete: vi.fn(),
        };
        const provider = new DevTunnelsClientProvider({
            credentials: credentials(),
            apiBaseUrl: 'https://devtunnels.test',
            httpClient,
        });

        const tunnels = await provider.listMachineTunnels();

        expect(tunnels).toEqual([{
            machineId: 'machine-1',
            tunnelId: 'tunnel-1',
            url: 'https://tunnel-1.devtunnels.ms',
            tags: ['happy-machine', 'machineId:machine-1'],
            lastSeenAt: '2026-05-11T12:00:00.000Z',
            owner: 'evy',
        }]);
        expect(httpClient.get).toHaveBeenCalledWith('https://devtunnels.test/tunnels', {
            headers: {
                Authorization: 'github ghu-token',
                'X-Tunnel-User-Agent': 'happy-agent/0.1.0',
            },
            params: {
                includePorts: true,
                global: true,
                labels: 'happy-machine',
                'api-version': '2023-09-27-preview',
            },
        });
    });

    it('gets a connect token and deletes tunnels with injected credentials', async () => {
        const httpClient = {
            get: vi.fn().mockResolvedValue({ data: { accessTokens: { connect: 'connect-jwt' } } }),
            delete: vi.fn().mockResolvedValue({ data: {} }),
        };
        const provider = new DevTunnelsClientProvider({
            credentials: credentials(),
            apiBaseUrl: 'https://devtunnels.test',
            httpClient,
        });

        await expect(provider.getConnectToken('tunnel-1')).resolves.toBe('connect-jwt');
        await provider.deleteTunnel('tunnel-1');

        expect(httpClient.get).toHaveBeenCalledWith('https://devtunnels.test/tunnels/tunnel-1', {
            headers: {
                Authorization: 'github ghu-token',
                'X-Tunnel-User-Agent': 'happy-agent/0.1.0',
            },
            params: {
                tokenScopes: 'connect',
                'api-version': '2023-09-27-preview',
            },
        });
        expect(httpClient.delete).toHaveBeenCalledWith('https://devtunnels.test/tunnels/tunnel-1', {
            headers: {
                Authorization: 'github ghu-token',
                'X-Tunnel-User-Agent': 'happy-agent/0.1.0',
            },
            params: { 'api-version': '2023-09-27-preview' },
        });
    });

    it('reports login state from the injected credentials getter', async () => {
        await expect(new DevTunnelsClientProvider({ credentials: credentials('token') }).isLoggedIn()).resolves.toBe(true);
        await expect(new DevTunnelsClientProvider({ credentials: credentials(null) }).isLoggedIn()).resolves.toBe(false);
    });

    it('stores the token returned by interactive login', async () => {
        const store = credentials(null);
        const provider = new DevTunnelsClientProvider({
            credentials: store,
            loginInteractive: vi.fn().mockResolvedValue('new-token'),
        });

        await provider.loginInteractive();

        expect(store.setDevTunnelsToken).toHaveBeenCalledWith('new-token');
    });
});
