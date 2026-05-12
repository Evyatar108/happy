import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({
    default: { expoConfig: { version: '1.2.3' } },
}));

vi.mock('react-native', () => ({
    Platform: { OS: 'ios' },
}));

vi.mock('@/sync/refreshClaim', () => ({
    refreshTunnelClaim: vi.fn(async () => 'fresh-socket-claim'),
}));

import { buildTunnelSocketOptions } from './socketOptions';
import type { AuthCredentials } from '@/auth/tokenStorage';

describe('socketOptions', () => {
    it('builds Socket.IO options with fresh tunnel claim auth and reconnect disabled', async () => {
        const credentials: AuthCredentials = {
            machineId: 'machine-1',
            tunnelUrl: 'https://machine.example.test',
            tunnelClaim: 'stale-claim',
            firstSeenAt: 123,
            connectToken: 'connect-jwt',
            deviceCode: 'device-1',
            deviceCodeExpiresAt: Date.now() + 60_000,
        };

        const options = await buildTunnelSocketOptions(credentials);
        expect(options.extraHeaders).toMatchObject({
            'X-Tunnel-Authorization': 'tunnel fresh-socket-claim',
            'X-Happy-Client': 'ios/1.2.3',
        });
        expect(JSON.stringify(options)).not.toContain('connect-jwt');
        expect(options.reconnection).toBe(false);
    });

    it('uses the machineId override in the auth payload when provided', async () => {
        const credentials: AuthCredentials = {
            machineId: 'machine-1',
            tunnelUrl: 'https://machine.example.test',
            tunnelClaim: 'stale-claim',
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
            tunnelClaim: 'stale-claim',
            firstSeenAt: 123,
            connectToken: 'connect-jwt',
            deviceCode: 'device-1',
            deviceCodeExpiresAt: Date.now() + 60_000,
        };

        const options = await buildTunnelSocketOptions(credentials);
        expect((options.auth as Record<string, unknown>).machineId).toBe('machine-1');
    });
});
