import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    removeMachineCredentials: vi.fn(async () => true),
    getCredentials: vi.fn(async () => null as null | { machineId: string }),
    deleteMachine: vi.fn(),
    disconnect: vi.fn(),
    request: vi.fn(),
    logout: vi.fn(async () => {}),
    refreshCredentials: vi.fn(async () => {}),
    getCurrentAuth: vi.fn(() => null as null | { credentials: { machineId: string } | null; logout: () => Promise<void>; refreshCredentials: () => Promise<void> }),
}));

vi.mock('@/auth/tokenStorage', () => ({
    TokenStorage: {
        removeMachineCredentials: mocks.removeMachineCredentials,
        getCredentials: mocks.getCredentials,
    },
}));

vi.mock('./storage', () => ({
    storage: { getState: () => ({ deleteMachine: mocks.deleteMachine }) },
}));

vi.mock('./apiSocket', () => ({
    apiSocket: { request: mocks.request, disconnect: mocks.disconnect },
}));

vi.mock('./sync', () => ({
    sync: {},
}));

vi.mock('@/auth/AuthContext', () => ({
    getCurrentAuth: mocks.getCurrentAuth,
}));

import { machineDelete } from './ops';

describe('machineDelete', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('logically unpairs a machine locally without deleting the Dev Tunnel', async () => {
        mocks.getCurrentAuth.mockReturnValue(null);
        await expect(machineDelete('machine-1')).resolves.toEqual({ success: true });
        expect(mocks.removeMachineCredentials).toHaveBeenCalledWith('machine-1');
        expect(mocks.deleteMachine).toHaveBeenCalledWith('machine-1');
        expect(mocks.request).not.toHaveBeenCalled();
    });

    it('disconnects the socket for the deleted machine', async () => {
        mocks.getCurrentAuth.mockReturnValue(null);
        await machineDelete('machine-1');
        expect(mocks.disconnect).toHaveBeenCalledWith('machine-1');
    });

    it('calls logout when the deleted machine was the active credential and no machines remain', async () => {
        mocks.getCurrentAuth.mockReturnValue({
            credentials: { machineId: 'machine-1' },
            logout: mocks.logout,
            refreshCredentials: mocks.refreshCredentials,
        });
        mocks.getCredentials.mockResolvedValue(null);

        await machineDelete('machine-1');

        expect(mocks.logout).toHaveBeenCalled();
        expect(mocks.refreshCredentials).not.toHaveBeenCalled();
    });

    it('calls refreshCredentials when the deleted machine was the active credential but others remain', async () => {
        mocks.getCurrentAuth.mockReturnValue({
            credentials: { machineId: 'machine-1' },
            logout: mocks.logout,
            refreshCredentials: mocks.refreshCredentials,
        });
        mocks.getCredentials.mockResolvedValue({ machineId: 'machine-2' });

        await machineDelete('machine-1');

        expect(mocks.refreshCredentials).toHaveBeenCalled();
        expect(mocks.logout).not.toHaveBeenCalled();
    });

    it('does not touch auth state when a non-active machine is deleted', async () => {
        mocks.getCurrentAuth.mockReturnValue({
            credentials: { machineId: 'machine-2' },
            logout: mocks.logout,
            refreshCredentials: mocks.refreshCredentials,
        });

        await machineDelete('machine-1');

        expect(mocks.logout).not.toHaveBeenCalled();
        expect(mocks.refreshCredentials).not.toHaveBeenCalled();
    });
});
