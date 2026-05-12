import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    removeMachineCredentials: vi.fn(async () => true),
    deleteMachine: vi.fn(),
    request: vi.fn(),
}));

vi.mock('@/auth/tokenStorage', () => ({
    TokenStorage: { removeMachineCredentials: mocks.removeMachineCredentials },
}));

vi.mock('./storage', () => ({
    storage: { getState: () => ({ deleteMachine: mocks.deleteMachine }) },
}));

vi.mock('./apiSocket', () => ({
    apiSocket: { request: mocks.request },
}));

vi.mock('./sync', () => ({
    sync: {},
}));

import { machineDelete } from './ops';

describe('machineDelete', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('logically unpairs a machine locally without deleting the Dev Tunnel', async () => {
        await expect(machineDelete('machine-1')).resolves.toEqual({ success: true });
        expect(mocks.removeMachineCredentials).toHaveBeenCalledWith('machine-1');
        expect(mocks.deleteMachine).toHaveBeenCalledWith('machine-1');
        expect(mocks.request).not.toHaveBeenCalled();
    });
});
