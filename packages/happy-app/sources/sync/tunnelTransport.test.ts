import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({
    default: { expoConfig: { version: '1.2.3' } },
}));

vi.mock('react-native', () => ({
    Platform: { OS: 'ios' },
}));

import { AuthCredentials } from '@/auth/tokenStorage';
import { buildTunnelSocketOptions, createX25519KeyPair, deriveX25519SessionKey } from './tunnelTransport';

describe('tunnelTransport', () => {
    const credentials: AuthCredentials = {
        machineId: 'machine-1',
        tunnelUrl: 'https://machine.example.test',
        tunnelClaim: 'jwt-1',
        pinnedPubkey: 'server-pubkey',
        sessionKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        firstSeenAt: 123,
        githubToken: 'github-token',
    };

    it('injects X-Tunnel-Authorization on Socket.IO connection options', () => {
        const options = buildTunnelSocketOptions(credentials);

        expect(options.extraHeaders).toMatchObject({
            'X-Tunnel-Authorization': 'tunnel jwt-1',
            'X-Happy-Client': 'ios/1.2.3',
        });
        const transportOptions = options.transportOptions as { websocket?: { extraHeaders?: Record<string, string> } } | undefined;
        expect(transportOptions?.websocket?.extraHeaders).toMatchObject({
            'X-Tunnel-Authorization': 'tunnel jwt-1',
        });
        expect(options.auth).toMatchObject({
            clientType: 'user-scoped',
            machineId: 'machine-1',
        });
    });

    it('derives the same X25519 shared session key on both sides', () => {
        const mobile = createX25519KeyPair();
        const machine = createX25519KeyPair();

        const mobileShared = deriveX25519SessionKey(mobile.secretKey, machine.publicKey);
        const machineShared = deriveX25519SessionKey(machine.secretKey, mobile.publicKey);

        expect(mobileShared).toBe(machineShared);
    });
});
