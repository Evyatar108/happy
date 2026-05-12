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

vi.mock('./storage', () => ({
    storage: {
        getState: () => ({ sessions: mockSessions.value }),
    },
}));

import { apiSocket } from './apiSocket';
import { cancelPendingSwitch, machineForkSession, requestSwitch, sessionEmitAgentConfiguration, sessionUpdateMetadata, sessionWriteFile } from './ops';

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

    it('applies patchFn to session metadata and retries with server metadata on version mismatch', async () => {
        const serverMetadataAfterConflict: Metadata = {
            path: '/workspace/project',
            host: 'devbox',
            currentModelCode: 'claude-sonnet',
            summary: {
                text: 'Old title',
                updatedAt: 150,
            },
        };

        vi.mocked(apiSocket.emitWithAck)
            .mockResolvedValueOnce({
                result: 'version-mismatch',
                version: 8,
                metadata: JSON.stringify(serverMetadataAfterConflict),
            })
            .mockResolvedValueOnce({
                result: 'success',
                version: 9,
                metadata: JSON.stringify({ ...serverMetadataAfterConflict, summary: { text: 'Renamed chat', updatedAt: 200 } }),
            });

        // patchFn applies only the summary field — simulating the /rename caller
        const patchFn = (latest: Metadata): Metadata => ({
            ...latest,
            summary: { text: 'Renamed chat', updatedAt: 200 },
        });

        const result = await sessionUpdateMetadata('session-1', patchFn, 7);

        expect(result.version).toBe(9);
        expect(apiSocket.emitWithAck).toHaveBeenNthCalledWith(1, 'update-metadata', {
            sid: 'session-1',
            metadata: JSON.stringify({ ...initialSessionMetadata, summary: { text: 'Renamed chat', updatedAt: 200 } }),
            expectedVersion: 7,
        });
        expect(apiSocket.emitWithAck).toHaveBeenNthCalledWith(2, 'update-metadata', {
            sid: 'session-1',
            metadata: JSON.stringify({ ...serverMetadataAfterConflict, summary: { text: 'Renamed chat', updatedAt: 200 } }),
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
        vi.mocked(apiSocket.emitWithAck).mockResolvedValue({
            result: 'success',
            version: 5,
            metadata: 'metadata-v4',
        });

        const result = await sessionEmitAgentConfiguration({
            sessionId: 'session-1',
            model: 'gpt-5-high',
            thinkingLevel: 'high',
        });

        expect(result).toEqual({ version: 5, metadata: 'metadata-v4' });
        expect(apiSocket.emitWithAck).toHaveBeenCalledWith('update-metadata', {
            sid: 'session-1',
            metadata: JSON.stringify({
                path: '/workspace/project',
                host: 'devbox',
                currentModelCode: 'gpt-5-high',
                currentPermissionModeCode: 'default',
                currentThoughtLevelCode: 'high',
            }),
            expectedVersion: 4,
        });
    });

    it('updates only the supplied fields', async () => {
        vi.mocked(apiSocket.emitWithAck).mockResolvedValue({
            result: 'success',
            version: 5,
            metadata: 'metadata-v4',
        });

        await sessionEmitAgentConfiguration({
            sessionId: 'session-1',
            permissionMode: 'bypassPermissions',
        });

        expect(apiSocket.emitWithAck).toHaveBeenCalledWith('update-metadata', {
            sid: 'session-1',
            metadata: JSON.stringify({
                path: '/workspace/project',
                host: 'devbox',
                currentModelCode: 'claude-sonnet',
                currentPermissionModeCode: 'bypassPermissions',
                currentThoughtLevelCode: 'medium',
            }),
            expectedVersion: 4,
        });
    });
});

describe('sessionWriteFile', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('keeps the legacy expectedHash argument shape', async () => {
        vi.mocked(apiSocket.sessionRPC).mockResolvedValue({ success: true, hash: 'hash-1' });

        const result = await sessionWriteFile('session-1', 'file.txt', 'aGVsbG8=', 'expected-hash');

        expect(result).toEqual({ success: true, hash: 'hash-1' });
        expect(apiSocket.sessionRPC).toHaveBeenCalledWith('session-1', 'writeFile', {
            path: 'file.txt',
            content: 'aGVsbG8=',
            expectedHash: 'expected-hash',
        });
    });

    it('passes createParents through the writeFile RPC options object', async () => {
        vi.mocked(apiSocket.sessionRPC).mockResolvedValue({ success: true, hash: 'hash-1' });

        const result = await sessionWriteFile('session-1', '.happy/attachments/local/file.txt', 'aGVsbG8=', { createParents: true });

        expect(result).toEqual({ success: true, hash: 'hash-1' });
        expect(apiSocket.sessionRPC).toHaveBeenCalledWith('session-1', 'writeFile', {
            path: '.happy/attachments/local/file.txt',
            content: 'aGVsbG8=',
            createParents: true,
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
