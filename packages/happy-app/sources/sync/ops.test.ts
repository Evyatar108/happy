import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Metadata } from './storageTypes';

const mockSessions = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock('./apiSocket', () => ({
    apiSocket: {
        emitWithAck: vi.fn(),
        machineRPC: vi.fn(),
        sessionRPC: vi.fn(),
        request: vi.fn(),
    }
}));

vi.mock('./sync', () => ({
    sync: {
        encryption: {
            getSessionEncryption: vi.fn(),
            getMachineEncryption: vi.fn(),
        }
    }
}));

vi.mock('./storage', () => ({
    storage: {
        getState: () => ({ sessions: mockSessions.value }),
    },
}));

import { apiSocket } from './apiSocket';
import { cancelPendingSwitch, machineForkSession, requestSwitch, sessionEmitAgentConfiguration, sessionUpdateMetadata } from './ops';
import { sync } from './sync';

describe('sessionUpdateMetadata', () => {
    const initialSessionMetadata: Metadata = {
        path: '/workspace/project',
        host: 'devbox',
        summary: {
            text: 'Old title',
            updatedAt: 150,
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockSessions.value = {
            'session-1': {
                metadata: initialSessionMetadata,
                metadataVersion: 7,
            },
        };
    });

    it('applies patchFn to session metadata, retries with freshly-decrypted server metadata on version mismatch', async () => {
        const serverMetadataAfterConflict: Metadata = {
            path: '/workspace/project',
            host: 'devbox',
            currentModelCode: 'claude-sonnet',
            summary: {
                text: 'Old title',
                updatedAt: 150,
            },
        };

        const encryptMetadata = vi
            .fn()
            .mockResolvedValueOnce('encrypted-v7')
            .mockResolvedValueOnce('encrypted-v8');
        const decryptMetadata = vi.fn().mockResolvedValue(serverMetadataAfterConflict);

        vi.mocked(sync.encryption.getSessionEncryption).mockReturnValue({
            encryptMetadata,
            decryptMetadata,
        } as never);

        vi.mocked(apiSocket.emitWithAck)
            .mockResolvedValueOnce({
                result: 'version-mismatch',
                version: 8,
                metadata: 'server-metadata-v8',
            })
            .mockResolvedValueOnce({
                result: 'success',
                version: 9,
                metadata: 'encrypted-v8',
            });

        // patchFn applies only the summary field — simulating the /rename caller
        const patchFn = (latest: Metadata): Metadata => ({
            ...latest,
            summary: { text: 'Renamed chat', updatedAt: 200 },
        });

        const result = await sessionUpdateMetadata('session-1', patchFn, 7);

        expect(result).toEqual({ version: 9, metadata: 'encrypted-v8' });
        // First attempt: patchFn applied to the initial session metadata
        expect(encryptMetadata).toHaveBeenNthCalledWith(1, {
            ...initialSessionMetadata,
            summary: { text: 'Renamed chat', updatedAt: 200 },
        });
        expect(apiSocket.emitWithAck).toHaveBeenNthCalledWith(1, 'update-metadata', {
            sid: 'session-1',
            metadata: 'encrypted-v7',
            expectedVersion: 7,
        });
        expect(decryptMetadata).toHaveBeenCalledWith(8, 'server-metadata-v8');
        // Second attempt: patchFn applied to fresh server metadata, preserving concurrent server fields
        expect(encryptMetadata).toHaveBeenNthCalledWith(2, {
            ...serverMetadataAfterConflict,
            summary: { text: 'Renamed chat', updatedAt: 200 },
        });
        expect(apiSocket.emitWithAck).toHaveBeenNthCalledWith(2, 'update-metadata', {
            sid: 'session-1',
            metadata: 'encrypted-v8',
            expectedVersion: 8,
        });
    });
});

describe('sessionEmitAgentConfiguration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSessions.value = {
            'session-1': {
                metadata: {
                    path: '/workspace/project',
                    host: 'devbox',
                    currentModelCode: 'claude-sonnet',
                    currentPermissionModeCode: 'default',
                    currentThoughtLevelCode: 'medium',
                },
                metadataVersion: 4,
            },
        };
    });

    it('layers supplied config fields over current metadata and emits update-metadata', async () => {
        const encryptMetadata = vi.fn().mockResolvedValue('encrypted-v4');
        vi.mocked(sync.encryption.getSessionEncryption).mockReturnValue({
            encryptMetadata,
            decryptMetadata: vi.fn(),
        } as never);
        vi.mocked(apiSocket.emitWithAck).mockResolvedValue({
            result: 'success',
            version: 5,
            metadata: 'encrypted-v4',
        });

        const result = await sessionEmitAgentConfiguration({
            sessionId: 'session-1',
            model: 'gpt-5-high',
            thinkingLevel: 'high',
        });

        expect(result).toEqual({ version: 5, metadata: 'encrypted-v4' });
        expect(encryptMetadata).toHaveBeenCalledWith({
            path: '/workspace/project',
            host: 'devbox',
            currentModelCode: 'gpt-5-high',
            currentPermissionModeCode: 'default',
            currentThoughtLevelCode: 'high',
        });
        expect(apiSocket.emitWithAck).toHaveBeenCalledWith('update-metadata', {
            sid: 'session-1',
            metadata: 'encrypted-v4',
            expectedVersion: 4,
        });
    });

    it('updates only the supplied fields', async () => {
        const encryptMetadata = vi.fn().mockResolvedValue('encrypted-v4');
        vi.mocked(sync.encryption.getSessionEncryption).mockReturnValue({
            encryptMetadata,
            decryptMetadata: vi.fn(),
        } as never);
        vi.mocked(apiSocket.emitWithAck).mockResolvedValue({
            result: 'success',
            version: 5,
            metadata: 'encrypted-v4',
        });

        await sessionEmitAgentConfiguration({
            sessionId: 'session-1',
            permissionMode: 'bypassPermissions',
        });

        expect(encryptMetadata).toHaveBeenCalledWith({
            path: '/workspace/project',
            host: 'devbox',
            currentModelCode: 'claude-sonnet',
            currentPermissionModeCode: 'bypassPermissions',
            currentThoughtLevelCode: 'medium',
        });
    });
});

describe('requestSwitch', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('calls the request-switch session RPC with the requested mode', async () => {
        vi.mocked(apiSocket.sessionRPC).mockResolvedValue({ deferred: true });

        const result = await requestSwitch('session-1', 'when-idle');

        expect(result).toEqual({ deferred: true });
        expect(apiSocket.sessionRPC).toHaveBeenCalledWith('session-1', 'request-switch', {
            mode: 'when-idle',
        });
    });
});

describe('machineForkSession', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('strips the machine prefix before sending the fork RPC payload', async () => {
        vi.mocked(apiSocket.machineRPC).mockResolvedValue({ type: 'success', sessionId: 'forked-session' });

        const result = await machineForkSession({
            machineId: 'machine-1',
            parentSessionId: 'machine-1:parent-session',
            worktreePath: '/workspace/fork',
            model: 'gpt-5.2',
            permissionMode: 'safe-yolo',
            effortLevel: 'high',
        });

        expect(result).toEqual({ type: 'success', sessionId: 'forked-session' });
        expect(apiSocket.machineRPC).toHaveBeenCalledWith('machine-1', 'fork-into-worktree', {
            parentSessionId: 'parent-session',
            worktreePath: '/workspace/fork',
            model: 'gpt-5.2',
            permissionMode: 'safe-yolo',
            effortLevel: 'high',
        });
        const payload = vi.mocked(apiSocket.machineRPC).mock.calls[0][2] as { parentSessionId: string };
        expect(payload.parentSessionId).not.toContain(':');
    });
});

describe('cancelPendingSwitch', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('calls the cancel-pending-switch session RPC with an empty payload', async () => {
        vi.mocked(apiSocket.sessionRPC).mockResolvedValue(undefined);

        await cancelPendingSwitch('session-1');

        expect(apiSocket.sessionRPC).toHaveBeenCalledWith('session-1', 'cancel-pending-switch', {});
    });
});
