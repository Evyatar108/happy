import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Metadata } from './storageTypes';
import { parseCompositeSessionId } from './machineSessionId';

const mockSessions = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
const FALLBACK_MACHINE_ID = 'primary-machine';

// Shared scope mocks: every forSession/forMachine call returns the SAME mock
// scope so tests can assert against `sessionScope.rpc`, `sessionScope.emitWithAck`,
// etc. directly. The scope's `ref` is computed from the most recent call so
// assertions can read `sessionScope.ref.localSessionId`.
const sessionScope = vi.hoisted(() => ({
    ref: { machineId: '', localSessionId: '' },
    request: vi.fn(),
    rpc: vi.fn(),
    machineRpc: vi.fn(),
    emitWithAck: vi.fn(),
    send: vi.fn(),
}));
const machineScope = vi.hoisted(() => ({
    machineId: '',
    request: vi.fn(),
    rpc: vi.fn(),
    emitWithAck: vi.fn(),
    send: vi.fn(),
}));

vi.mock('./apiSocket', async () => {
    const { parseCompositeSessionId } = await import('./machineSessionId');
    return {
        apiSocket: {
            forSession: vi.fn((sessionId: string) => {
                sessionScope.ref = parseCompositeSessionId(sessionId, FALLBACK_MACHINE_ID);
                return sessionScope;
            }),
            forMachine: vi.fn((machineId: string) => {
                machineScope.machineId = machineId;
                return machineScope;
            }),
            forPrimaryMachine: vi.fn(() => {
                machineScope.machineId = FALLBACK_MACHINE_ID;
                return machineScope;
            }),
        }
    };
});

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
            'machine-1:session-1': {
                metadata: initialSessionMetadata,
                metadataVersion: 7,
            },
        };
    });

    it('routes to the session\'s machine and strips the composite prefix from the update-metadata payload', async () => {
        const serverMetadataAfterConflict: Metadata = {
            path: '/workspace/project',
            host: 'devbox',
            currentModelCode: 'claude-sonnet',
            summary: {
                text: 'Old title',
                updatedAt: 150,
            },
        };

        sessionScope.emitWithAck
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

        const result = await sessionUpdateMetadata('machine-1:session-1', patchFn, 7);

        expect(result.version).toBe(9);
        // forSession was given the composite id ...
        expect(apiSocket.forSession).toHaveBeenCalledWith('machine-1:session-1');
        // ... and the payload contains the BARE local id, not the composite.
        expect(sessionScope.emitWithAck).toHaveBeenNthCalledWith(1, 'update-metadata', {
            sid: 'session-1',
            metadata: JSON.stringify({ ...initialSessionMetadata, summary: { text: 'Renamed chat', updatedAt: 200 } }),
            expectedVersion: 7,
        });
        expect(sessionScope.emitWithAck).toHaveBeenNthCalledWith(2, 'update-metadata', {
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
            'machine-1:session-1': {
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

    it('layers supplied config fields over current metadata and emits update-metadata with bare sid', async () => {
        sessionScope.emitWithAck.mockResolvedValue({
            result: 'success',
            version: 5,
            metadata: 'metadata-v4',
        });

        const result = await sessionEmitAgentConfiguration({
            sessionId: 'machine-1:session-1',
            model: 'gpt-5-high',
            thinkingLevel: 'high',
        });

        expect(result).toEqual({ version: 5, metadata: 'metadata-v4' });
        expect(apiSocket.forSession).toHaveBeenCalledWith('machine-1:session-1');
        expect(sessionScope.emitWithAck).toHaveBeenCalledWith('update-metadata', {
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
        sessionScope.emitWithAck.mockResolvedValue({
            result: 'success',
            version: 5,
            metadata: 'metadata-v4',
        });

        await sessionEmitAgentConfiguration({
            sessionId: 'machine-1:session-1',
            permissionMode: 'bypassPermissions',
        });

        expect(sessionScope.emitWithAck).toHaveBeenCalledWith('update-metadata', {
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
        sessionScope.rpc.mockResolvedValue({ success: true, hash: 'hash-1' });

        const result = await sessionWriteFile('session-1', 'file.txt', 'aGVsbG8=', 'expected-hash');

        expect(result).toEqual({ success: true, hash: 'hash-1' });
        expect(apiSocket.forSession).toHaveBeenCalledWith('session-1');
        expect(sessionScope.rpc).toHaveBeenCalledWith('writeFile', {
            path: 'file.txt',
            content: 'aGVsbG8=',
            expectedHash: 'expected-hash',
        });
    });

    it('passes createParents through the writeFile RPC options object', async () => {
        sessionScope.rpc.mockResolvedValue({ success: true, hash: 'hash-1' });

        const result = await sessionWriteFile('session-1', '.happy/attachments/local/file.txt', 'aGVsbG8=', { createParents: true });

        expect(result).toEqual({ success: true, hash: 'hash-1' });
        expect(sessionScope.rpc).toHaveBeenCalledWith('writeFile', {
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
        sessionScope.rpc.mockResolvedValue({ deferred: true });

        const result = await requestSwitch('session-1', 'when-idle');

        expect(result).toEqual({ deferred: true });
        expect(apiSocket.forSession).toHaveBeenCalledWith('session-1');
        expect(sessionScope.rpc).toHaveBeenCalledWith('request-switch', {
            mode: 'when-idle',
        });
    });
});

describe('machineForkSession', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('routes to the parent session\'s machine and strips the composite prefix from the fork RPC payload', async () => {
        sessionScope.machineRpc.mockResolvedValue({ type: 'success', sessionId: 'forked-session' });

        const result = await machineForkSession({
            machineId: 'machine-1',
            parentSessionId: 'machine-1:parent-session',
            worktreePath: '/workspace/fork',
            model: 'gpt-5.2',
            permissionMode: 'safe-yolo',
            effortLevel: 'high',
        });

        expect(result).toEqual({ type: 'success', sessionId: 'forked-session' });
        expect(apiSocket.forSession).toHaveBeenCalledWith('machine-1:parent-session');
        expect(sessionScope.machineRpc).toHaveBeenCalledWith('fork-into-worktree', {
            parentSessionId: 'parent-session',
            worktreePath: '/workspace/fork',
            model: 'gpt-5.2',
            permissionMode: 'safe-yolo',
            effortLevel: 'high',
        });
        const payload = sessionScope.machineRpc.mock.calls[0][1] as { parentSessionId: string };
        expect(payload.parentSessionId).not.toContain(':');
    });
});

describe('cancelPendingSwitch', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('calls the cancel-pending-switch session RPC with an empty payload', async () => {
        sessionScope.rpc.mockResolvedValue(undefined);

        await cancelPendingSwitch('session-1');

        expect(apiSocket.forSession).toHaveBeenCalledWith('session-1');
        expect(sessionScope.rpc).toHaveBeenCalledWith('cancel-pending-switch', {});
    });
});
