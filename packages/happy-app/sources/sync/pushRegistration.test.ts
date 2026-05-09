import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    registerPushToken: vi.fn(),
    unregisterPushToken: vi.fn(),
    loadRegisteredPushToken: vi.fn(),
    saveRegisteredPushToken: vi.fn(),
    getPermissionsAsync: vi.fn(),
    requestPermissionsAsync: vi.fn(),
    getExpoPushTokenAsync: vi.fn(),
}));

vi.mock('react-native', () => ({
    Platform: { OS: 'ios' },
    Linking: { openSettings: vi.fn() },
}));

vi.mock('expo-application', () => ({
    nativeApplicationVersion: '1.0.0',
    nativeBuildVersion: '1',
}));

vi.mock('expo-constants', () => ({
    default: {
        expoConfig: { extra: { eas: { projectId: 'project-1' } } },
        easConfig: { projectId: 'project-1' },
    },
}));

vi.mock('expo-device', () => ({
    deviceName: 'Tablet',
    modelName: 'BOOX',
    osName: 'Android',
    osVersion: '13',
    isDevice: true,
}));

vi.mock('expo-notifications', () => ({
    getPermissionsAsync: mocks.getPermissionsAsync,
    requestPermissionsAsync: mocks.requestPermissionsAsync,
    getExpoPushTokenAsync: mocks.getExpoPushTokenAsync,
}));

vi.mock('./persistence', () => ({
    clearRegisteredPushToken: vi.fn(),
    loadRegisteredPushToken: mocks.loadRegisteredPushToken,
    saveRegisteredPushToken: mocks.saveRegisteredPushToken,
}));

vi.mock('./apiPush', () => ({
    registerPushToken: mocks.registerPushToken,
    unregisterPushToken: mocks.unregisterPushToken,
}));

import { syncCurrentPushToken } from './pushRegistration';
import type { AuthCredentials } from '@/auth/tokenStorage';

function credentials(machineId: string): AuthCredentials {
    return {
        machineId,
        tunnelUrl: `https://${machineId}.example.test`,
        tunnelClaim: `jwt-${machineId}`,
        pinnedPubkey: `pub-${machineId}`,
        sessionKey: `session-${machineId}`,
        firstSeenAt: 1,
    };
}

describe('syncCurrentPushToken', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true, canAskAgain: true });
        mocks.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[current]' });
        mocks.loadRegisteredPushToken.mockReturnValue(null);
    });

    it('registers the Expo token once per paired machine', async () => {
        const machines = [credentials('machine-a'), credentials('machine-b')];

        const result = await syncCurrentPushToken(machines);

        expect(result.registered).toBe(true);
        expect(result.registeredMachines).toBe(2);
        expect(mocks.registerPushToken).toHaveBeenCalledTimes(2);
        expect(mocks.registerPushToken).toHaveBeenNthCalledWith(1, machines[0], 'ExponentPushToken[current]');
        expect(mocks.registerPushToken).toHaveBeenNthCalledWith(2, machines[1], 'ExponentPushToken[current]');
        expect(mocks.saveRegisteredPushToken).toHaveBeenCalledWith('ExponentPushToken[current]');
    });
});
