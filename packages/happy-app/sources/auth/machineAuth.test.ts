import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const refresh = vi.hoisted(() => ({
    refreshTunnelClaim: vi.fn(async () => 'fresh-claim'),
    DeviceCodeExpired: class DeviceCodeExpired extends Error {
        readonly machineId: string;
        constructor(machineId: string) {
            super(`Device code expired for machine ${machineId}.`);
            this.name = 'DeviceCodeExpired';
            this.machineId = machineId;
        }
    },
}));

vi.mock('@/sync/refreshClaim', () => refresh);

import { ClaimExpired, getMachineAuthHeaders, registerDeviceCodeExpiredHandler, tunnelFetch } from './machineAuth';
import type { AuthCredentials } from './tokenStorage';

const credentials: AuthCredentials = {
    machineId: 'machine-1',
    tunnelUrl: 'https://machine.example.test',
    tunnelClaim: 'stale-claim',
    firstSeenAt: 1,
    deviceCode: 'device-1',
    deviceCodeExpiresAt: Date.now() + 60_000,
};

describe('machine auth', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('mints a fresh claim and returns prefixed tunnel auth', async () => {
        await expect(getMachineAuthHeaders(credentials)).resolves.toEqual({
            'X-Tunnel-Authorization': 'tunnel fresh-claim',
        });
        expect(refresh.refreshTunnelClaim).toHaveBeenCalledWith(credentials, 'machine-1');
    });

    it('throws ClaimExpired for tunnel_claim_expired responses', async () => {
        global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'tunnel_claim_expired' }), { status: 401 })) as never;
        await expect(tunnelFetch('https://machine.example.test/v2/me/settings', credentials))
            .rejects.toBeInstanceOf(ClaimExpired);
    });

    it('propagates non-claim 401 responses raw', async () => {
        global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'other' }), { status: 401 })) as never;
        const response = await tunnelFetch('https://machine.example.test/v2/me/settings', credentials);
        expect(response.status).toBe(401);
    });

    it('invokes registered handlers and re-throws on ClaimExpired', async () => {
        global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'tunnel_claim_expired' }), { status: 401 })) as never;
        const handler = vi.fn();
        const unregister = registerDeviceCodeExpiredHandler(handler);
        try {
            await expect(tunnelFetch('https://machine.example.test/v2/me/settings', credentials))
                .rejects.toBeInstanceOf(ClaimExpired);
            expect(handler).toHaveBeenCalledOnce();
            expect(handler).toHaveBeenCalledWith('machine-1');
        } finally {
            unregister();
        }
    });

    it('invokes registered handlers and re-throws on DeviceCodeExpired from refreshTunnelClaim', async () => {
        refresh.refreshTunnelClaim.mockRejectedValueOnce(new refresh.DeviceCodeExpired('machine-1'));
        const handler = vi.fn();
        const unregister = registerDeviceCodeExpiredHandler(handler);
        try {
            await expect(tunnelFetch('https://machine.example.test/v2/me/settings', credentials))
                .rejects.toMatchObject({ name: 'DeviceCodeExpired', machineId: 'machine-1' });
            expect(handler).toHaveBeenCalledOnce();
            expect(handler).toHaveBeenCalledWith('machine-1');
        } finally {
            unregister();
        }
    });

    it('does not invoke handlers for non-auth errors', async () => {
        global.fetch = vi.fn(async () => { throw new Error('network failure'); }) as never;
        const handler = vi.fn();
        const unregister = registerDeviceCodeExpiredHandler(handler);
        try {
            await expect(tunnelFetch('https://machine.example.test/v2/me/settings', credentials))
                .rejects.toThrow('network failure');
            expect(handler).not.toHaveBeenCalled();
        } finally {
            unregister();
        }
    });

    it('relies on Sprint A socket middleware to populate socket.data.accountId', () => {
        const socketSource = readFileSync(
            resolve(__dirname, '../../../happy-server/sources/app/api/socket.ts'),
            'utf8'
        );

        expect(socketSource).toContain('socket.data.accountId = accountId');
    });
});
