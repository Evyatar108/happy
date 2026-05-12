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

import { AuthCredentials, isOldShape, TokenStorage } from './tokenStorage';

describe('TokenStorage', () => {
    const credentials: AuthCredentials = {
        machineId: 'machine-1',
        tunnelUrl: 'https://machine.example.test',
        tunnelClaim: 'jwt-1',
        firstSeenAt: 123,
        tunnelId: 'tunnel-1',
        login: 'octocat',
        avatarUrl: 'https://avatars.example.test/octocat.png',
        deviceCode: 'device-1',
        deviceCodeExpiresAt: 456,
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('persists trusted machine credentials in SecureStore', async () => {
        await expect(TokenStorage.setCredentials(credentials)).resolves.toBe(true);

        expect(secureStore.setItemAsync).toHaveBeenCalledWith(
            'machine_credentials',
            JSON.stringify({
                primaryMachineId: 'machine-1',
                machines: [credentials],
                devTunnelsAccess: null,
            })
        );
    });

    it('loads trusted machine credentials from SecureStore', async () => {
        secureStore.getItemAsync.mockResolvedValue(JSON.stringify(credentials));

        await expect(TokenStorage.getCredentials()).resolves.toEqual(credentials);
    });

    it('appends additional trusted machines and returns the full paired list', async () => {
        const second: AuthCredentials = {
            ...credentials,
            machineId: 'machine-2',
            tunnelUrl: 'https://machine-2.example.test',
            tunnelClaim: 'jwt-2',
        };
        secureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify({
            primaryMachineId: 'machine-1',
            machines: [credentials],
            devTunnelsAccess: 'oauth-token-1',
        }));

        await expect(TokenStorage.setCredentials(second)).resolves.toBe(true);

        expect(secureStore.setItemAsync).toHaveBeenCalledWith(
            'machine_credentials',
            JSON.stringify({
                primaryMachineId: 'machine-2',
                machines: [credentials, second],
                devTunnelsAccess: 'oauth-token-1',
            })
        );
    });

    it('loads legacy single-machine storage as a one-entry credential list', async () => {
        secureStore.getItemAsync.mockResolvedValue(JSON.stringify(credentials));

        await expect(TokenStorage.getCredentialsList()).resolves.toEqual([credentials]);
    });

    it('round-trips the top-level Dev Tunnels token without paired machines', async () => {
        secureStore.getItemAsync.mockResolvedValueOnce(null).mockResolvedValueOnce(JSON.stringify({
            primaryMachineId: null,
            machines: [],
            devTunnelsAccess: 'oauth-token-2',
        }));

        await expect(TokenStorage.setDevTunnelsToken('oauth-token-2')).resolves.toBeUndefined();
        await expect(TokenStorage.getDevTunnelsToken()).resolves.toBe('oauth-token-2');

        expect(secureStore.setItemAsync).toHaveBeenCalledWith(
            'machine_credentials',
            JSON.stringify({
                primaryMachineId: null,
                machines: [],
                devTunnelsAccess: 'oauth-token-2',
            })
        );
    });

    it('loads an empty machine bundle with Dev Tunnels OAuth preserved', async () => {
        secureStore.getItemAsync.mockResolvedValue(JSON.stringify({
            primaryMachineId: null,
            machines: [],
            devTunnelsAccess: 'oauth-token-3',
        }));

        await expect(TokenStorage.getCredentials()).resolves.toBeNull();
        await expect(TokenStorage.getDevTunnelsToken()).resolves.toBe('oauth-token-3');
    });

    it('removes a single machine and preserves Dev Tunnels OAuth', async () => {
        const second: AuthCredentials = { ...credentials, machineId: 'machine-2', tunnelUrl: 'https://machine-2.example.test' };
        secureStore.getItemAsync.mockResolvedValue(JSON.stringify({
            primaryMachineId: 'machine-1',
            machines: [credentials, second],
            devTunnelsAccess: 'oauth-token-4',
        }));

        await expect(TokenStorage.removeMachineCredentials('machine-1')).resolves.toBe(true);

        expect(secureStore.setItemAsync).toHaveBeenCalledWith(
            'machine_credentials',
            JSON.stringify({
                primaryMachineId: 'machine-2',
                machines: [second],
                devTunnelsAccess: 'oauth-token-4',
            })
        );
    });

    it('detects old-shape records', () => {
        expect(isOldShape({ ...credentials, pinnedPubkey: 'ed-pubkey' })).toBe(true);
        expect(isOldShape({ ...credentials, sessionKey: 'shared-session-key' })).toBe(true);
        expect(isOldShape({ ...credentials, tunnelClaim: undefined })).toBe(true);
        expect(isOldShape(credentials)).toBe(false);
    });

    it('wipes old-shape records while preserving Dev Tunnels OAuth and rolling primary machine', async () => {
        const cleanSecond: AuthCredentials = {
            ...credentials,
            machineId: 'machine-2',
            tunnelUrl: 'https://machine-2.example.test',
            tunnelClaim: 'jwt-2',
        };
        const oldPinned = { ...credentials, pinnedPubkey: 'legacy-pubkey' };
        const oldSession = { ...credentials, machineId: 'machine-3', sessionKey: 'legacy-session' };
        const missingClaim = { ...credentials, machineId: 'machine-4', tunnelClaim: undefined };
        secureStore.getItemAsync.mockResolvedValue(JSON.stringify({
            primaryMachineId: 'machine-1',
            machines: [oldPinned, cleanSecond, oldSession, missingClaim],
            devTunnelsAccess: 'oauth-token-5',
        }));

        await expect(TokenStorage.getCredentialsList()).resolves.toEqual([cleanSecond]);

        expect(secureStore.setItemAsync).toHaveBeenCalledWith(
            'machine_credentials',
            JSON.stringify({
                primaryMachineId: 'machine-2',
                machines: [cleanSecond],
                devTunnelsAccess: 'oauth-token-5',
            })
        );
    });
});
