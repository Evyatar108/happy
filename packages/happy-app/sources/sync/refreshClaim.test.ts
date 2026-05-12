import { describe, expect, it, vi } from 'vitest';

import { DeviceCodeExpired, refreshTunnelClaim } from './refreshClaim';
import type { AuthCredentials } from '@/auth/tokenStorage';

function makeCredentials(): AuthCredentials {
    return {
        machineId: 'machine-1',
        tunnelUrl: 'https://machine.example.test',
        tunnelClaim: 'stale-claim',
        firstSeenAt: 1,
        deviceCode: 'device-1',
        deviceCodeExpiresAt: Date.now() + 60_000,
    };
}

describe('refreshTunnelClaim status-code-before-body', () => {
    it('throws DeviceCodeExpired on 400 with device_code_expired body', async () => {
        global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'device_code_expired' }), { status: 400 })) as never;
        await expect(refreshTunnelClaim(makeCredentials(), 'machine-4xx-expired'))
            .rejects.toBeInstanceOf(DeviceCodeExpired);
    });

    it('throws DeviceCodeExpired on 401 with access_denied body', async () => {
        global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'access_denied' }), { status: 401 })) as never;
        await expect(refreshTunnelClaim(makeCredentials(), 'machine-4xx-denied'))
            .rejects.toBeInstanceOf(DeviceCodeExpired);
    });

    it('throws transient error on 500 even with device_code_expired body', async () => {
        global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'device_code_expired' }), { status: 500 })) as never;
        const promise = refreshTunnelClaim(makeCredentials(), 'machine-5xx-expired');
        await expect(promise).rejects.not.toBeInstanceOf(DeviceCodeExpired);
        await expect(promise).rejects.toThrow(/Failed to refresh tunnel claim: 500/);
    });

    it('throws transient error on 503 even with access_denied body', async () => {
        global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'access_denied' }), { status: 503 })) as never;
        const promise = refreshTunnelClaim(makeCredentials(), 'machine-5xx-denied');
        await expect(promise).rejects.not.toBeInstanceOf(DeviceCodeExpired);
        await expect(promise).rejects.toThrow(/Failed to refresh tunnel claim: 503/);
    });

    it('throws transient error on 502 with no body', async () => {
        global.fetch = vi.fn(async () => new Response('', { status: 502 })) as never;
        const promise = refreshTunnelClaim(makeCredentials(), 'machine-5xx-nobody');
        await expect(promise).rejects.not.toBeInstanceOf(DeviceCodeExpired);
        await expect(promise).rejects.toThrow(/Failed to refresh tunnel claim: 502/);
    });
});
