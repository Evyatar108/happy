import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({
    default: { expoConfig: { version: '1.2.3' } },
}));

vi.mock('react-native', () => ({
    Platform: { OS: 'ios' },
}));

vi.mock('@/auth/connectTokenRefresh', () => ({
    ensureFreshConnectToken: vi.fn(async () => ({ connectToken: 'connect-jwt', connectTokenExpiry: Date.now() + 60_000 })),
}));

import { buildTunnelSocketOptions } from './socketOptions';
import type { AuthCredentials } from '@/auth/tokenStorage';

describe('socketOptions', () => {
    it('builds Socket.IO options with Dev Tunnels auth and reconnect disabled', async () => {
        const credentials: AuthCredentials = {
            machineId: 'machine-1',
            tunnelUrl: 'https://machine.example.test',
            firstSeenAt: 123,
            connectToken: 'connect-jwt',
            deviceCode: 'device-1',
            deviceCodeExpiresAt: Date.now() + 60_000,
        };

        const options = await buildTunnelSocketOptions(credentials);
        expect(options.extraHeaders).toMatchObject({
            'X-Tunnel-Authorization': 'tunnel connect-jwt',
            'X-Happy-Client': 'ios/1.2.3',
        });
        expect((options.transportOptions as any).websocket.extraHeaders['X-Tunnel-Authorization']).toBe('tunnel connect-jwt');
        expect((options.auth as Record<string, unknown>)['X-Tunnel-Authorization']).toBeUndefined();
        expect(JSON.stringify(options)).not.toContain('#dt=');
        expect(options.reconnection).toBe(false);
    });

    it('uses the machineId override in the auth payload when provided', async () => {
        const credentials: AuthCredentials = {
            machineId: 'machine-1',
            tunnelUrl: 'https://machine.example.test',
            firstSeenAt: 123,
            connectToken: 'connect-jwt',
            deviceCode: 'device-1',
            deviceCodeExpiresAt: Date.now() + 60_000,
        };

        const options = await buildTunnelSocketOptions(credentials, 'machine-override');
        expect((options.auth as Record<string, unknown>).machineId).toBe('machine-override');
    });

    it('uses credentials.machineId in the auth payload when no override is provided', async () => {
        const credentials: AuthCredentials = {
            machineId: 'machine-1',
            tunnelUrl: 'https://machine.example.test',
            firstSeenAt: 123,
            connectToken: 'connect-jwt',
            deviceCode: 'device-1',
            deviceCodeExpiresAt: Date.now() + 60_000,
        };

        const options = await buildTunnelSocketOptions(credentials);
        expect((options.auth as Record<string, unknown>).machineId).toBe('machine-1');
    });

    it('includes finite lastSeenSeq only when provided', async () => {
        const credentials: AuthCredentials = {
            machineId: 'machine-1',
            tunnelUrl: 'https://machine.example.test',
            firstSeenAt: 123,
            connectToken: 'connect-jwt',
            deviceCode: 'device-1',
            deviceCodeExpiresAt: Date.now() + 60_000,
        };

        const withSeq = await buildTunnelSocketOptions(credentials, 'mA', 42);
        expect((withSeq.auth as Record<string, unknown>).lastSeenSeq).toBe(42);

        const withoutSeq = await buildTunnelSocketOptions(credentials, 'mA');
        expect(withoutSeq.auth as Record<string, unknown>).not.toHaveProperty('lastSeenSeq');

        const nonFiniteSeq = await buildTunnelSocketOptions(credentials, 'mA', Number.POSITIVE_INFINITY);
        expect(nonFiniteSeq.auth as Record<string, unknown>).not.toHaveProperty('lastSeenSeq');
    });
});
