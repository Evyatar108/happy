import { beforeEach, describe, expect, it, vi } from 'vitest';

const secureStore = vi.hoisted(() => ({
    getItemAsync: vi.fn(),
    setItemAsync: vi.fn(),
    deleteItemAsync: vi.fn(),
}));

vi.mock('expo-secure-store', () => secureStore);

vi.mock('react-native', () => ({
    Platform: { OS: 'ios' },
}));

import { AuthCredentials, TokenStorage } from './tokenStorage';

describe('TokenStorage', () => {
    const credentials: AuthCredentials = {
        machineId: 'machine-1',
        tunnelUrl: 'https://machine.example.test',
        tunnelJwt: 'jwt-1',
        pinnedPubkey: 'ed-pubkey',
        sessionKey: 'shared-session-key',
        firstSeenAt: 123,
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('persists trusted machine credentials in SecureStore', async () => {
        await expect(TokenStorage.setCredentials(credentials)).resolves.toBe(true);

        expect(secureStore.setItemAsync).toHaveBeenCalledWith(
            'machine_credentials',
            JSON.stringify(credentials)
        );
    });

    it('loads trusted machine credentials from SecureStore', async () => {
        secureStore.getItemAsync.mockResolvedValue(JSON.stringify(credentials));

        await expect(TokenStorage.getCredentials()).resolves.toEqual(credentials);
    });
});
