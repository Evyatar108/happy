import { beforeEach, describe, expect, it, vi } from 'vitest';

const connect = vi.hoisted(() => ({
    ensureFreshConnectToken: vi.fn(async () => ({ connectToken: 'connect-jwt', connectTokenExpiry: Date.now() + 60_000 })),
}));

vi.mock('@/auth/connectTokenRefresh', () => connect);

import { getMachineAuthHeaders, tunnelFetch } from './machineAuth';
import type { AuthCredentials } from './tokenStorage';

const credentials: AuthCredentials = {
    machineId: 'machine-1',
    tunnelUrl: 'https://machine.example.test',
    firstSeenAt: 1,
    deviceCode: 'device-1',
    deviceCodeExpiresAt: Date.now() + 60_000,
};

describe('machine auth', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns the Dev Tunnels connect token auth header', async () => {
        await expect(getMachineAuthHeaders(credentials)).resolves.toEqual({
            'X-Tunnel-Authorization': 'tunnel connect-jwt',
        });
        expect(connect.ensureFreshConnectToken).toHaveBeenCalledWith(credentials, 'machine-1');
    });

    it('propagates 401 responses raw', async () => {
        global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'other' }), { status: 401 })) as never;
        const response = await tunnelFetch('https://machine.example.test/v2/me/settings', credentials);
        expect(response.status).toBe(401);
        expect(global.fetch).toHaveBeenCalledWith('https://machine.example.test/v2/me/settings', expect.objectContaining({
            headers: { 'X-Tunnel-Authorization': 'tunnel connect-jwt' },
        }));
    });

    it('propagates network errors', async () => {
        global.fetch = vi.fn(async () => { throw new Error('network failure'); }) as never;
        await expect(tunnelFetch('https://machine.example.test/v2/me/settings', credentials))
            .rejects.toThrow('network failure');
    });
});
