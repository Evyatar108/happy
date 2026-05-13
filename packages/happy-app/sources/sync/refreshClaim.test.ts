import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const connect = vi.hoisted(() => ({
    ensureFreshConnectToken: vi.fn(async () => ({ connectToken: 'connect-jwt', connectTokenExpiry: Date.now() + 60_000 })),
}));

vi.mock('@/auth/connectTokenRefresh', () => connect);

import { DeviceCodeExpired, MachineNotInRefreshResponse, refreshTunnelClaim } from './refreshClaim';
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

    it('attaches X-Tunnel-Connect from the refresh helper on pair/status', async () => {
        const now = Math.floor(Date.now() / 1000);
        const claim = Buffer.from(JSON.stringify({
            p: Buffer.from(JSON.stringify({ accountId: 1, iat: now, exp: now + 600, jti: 'jti-1' })).toString('base64url'),
            s: 'sig',
        })).toString('base64url');
        global.fetch = vi.fn(async () => new Response(JSON.stringify({
            status: 'authorized',
            machines: [{ machineId: 'machine-1', tunnelClaim: claim }],
        }), { status: 200 })) as never;

        await expect(refreshTunnelClaim(makeCredentials(), 'machine-1')).resolves.toBe(claim);
        expect(connect.ensureFreshConnectToken).toHaveBeenCalledWith(expect.objectContaining({ machineId: 'machine-1' }), 'machine-1');
        expect(global.fetch).toHaveBeenCalledWith('https://machine.example.test/pair/status', expect.objectContaining({
            headers: { 'Content-Type': 'application/json', 'X-Tunnel-Connect': 'connect-jwt' },
        }));
    });

    it('does not import machineAuth and recurse through tunnelFetch', () => {
        const source = readFileSync(resolve(__dirname, 'refreshClaim.ts'), 'utf8');
        expect(source).not.toContain('getMachineAuthHeaders');
        expect(source).not.toContain('tunnelFetch');
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

describe('refreshTunnelClaim clock-skew leeway', () => {
    it('accepts a claim with exp = now+10s even when client clock is 20s ahead of server', async () => {
        const realNow = Math.floor(Date.now() / 1000);
        const exp = realNow + 10;
        const iat = realNow - 5;

        const claim = Buffer.from(JSON.stringify({
            p: Buffer.from(JSON.stringify({ accountId: 1, iat, exp, jti: 'jti-skew' })).toString('base64url'),
            s: 'sig',
        })).toString('base64url');

        const advancedNow = (realNow + 20) * 1000;
        vi.spyOn(Date, 'now').mockReturnValue(advancedNow);

        global.fetch = vi.fn(async () => new Response(JSON.stringify({
            status: 'authorized',
            machines: [{ machineId: 'machine-skew', tunnelClaim: claim }],
        }), { status: 200 })) as never;

        try {
            await expect(
                refreshTunnelClaim(
                    { ...makeCredentials(), deviceCodeExpiresAt: advancedNow + 60_000 },
                    'machine-skew',
                ),
            ).resolves.toBe(claim);
        } finally {
            vi.restoreAllMocks();
        }
    });
});

describe('refreshTunnelClaim machine identity binding', () => {
    it('throws MachineNotInRefreshResponse when requested machine is absent from a single-machine response', async () => {
        global.fetch = vi.fn(async () => new Response(JSON.stringify({
            status: 'authorized',
            machines: [{ machineId: 'other-machine', tunnelClaim: 'claim-for-other' }],
        }), { status: 200 })) as never;
        const promise = refreshTunnelClaim(makeCredentials(), 'machine-missing');
        await expect(promise).rejects.toBeInstanceOf(MachineNotInRefreshResponse);
    });

    it('throws when the pair status response contains zero machines', async () => {
        global.fetch = vi.fn(async () => new Response(JSON.stringify({
            status: 'authorized',
            machines: [],
        }), { status: 200 })) as never;
        const promise = refreshTunnelClaim(makeCredentials(), 'machine-zero');
        await expect(promise).rejects.not.toBeInstanceOf(MachineNotInRefreshResponse);
        await expect(promise).rejects.toThrow(/exactly one machine, got 0/);
    });

    it('rejects multi-machine responses even when the requested machineId is present', async () => {
        global.fetch = vi.fn(async () => new Response(JSON.stringify({
            status: 'authorized',
            machines: [
                { machineId: 'machine-multi', tunnelClaim: 'claim-for-requested' },
                { machineId: 'other-machine', tunnelClaim: 'claim-for-other' },
            ],
        }), { status: 200 })) as never;
        const promise = refreshTunnelClaim(makeCredentials(), 'machine-multi');
        await expect(promise).rejects.not.toBeInstanceOf(MachineNotInRefreshResponse);
        await expect(promise).rejects.toThrow(/exactly one machine, got 2/);
    });
});
