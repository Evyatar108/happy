import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Metadata } from './storageTypes';

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

import { apiSocket } from './apiSocket';
import { cancelPendingSwitch, requestSwitch, sessionUpdateMetadata } from './ops';
import { sync } from './sync';

describe('sessionUpdateMetadata', () => {
    const targetMetadata: Metadata = {
        path: '/workspace/project',
        host: 'devbox',
        summary: {
            text: 'Renamed chat',
            updatedAt: 200,
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('encrypts metadata, retries on version mismatch, and emits update-metadata with the bumped version', async () => {
        const encryptMetadata = vi
            .fn()
            .mockResolvedValueOnce('encrypted-v7')
            .mockResolvedValueOnce('encrypted-v8');
        const decryptMetadata = vi.fn().mockResolvedValue({
            path: '/workspace/project',
            host: 'devbox',
            currentModelCode: 'claude-sonnet',
            summary: {
                text: 'Old title',
                updatedAt: 150,
            },
        } satisfies Metadata);

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

        const result = await sessionUpdateMetadata('session-1', targetMetadata, 7);

        expect(result).toEqual({ version: 9, metadata: 'encrypted-v8' });
        expect(encryptMetadata).toHaveBeenNthCalledWith(1, targetMetadata);
        expect(apiSocket.emitWithAck).toHaveBeenNthCalledWith(1, 'update-metadata', {
            sid: 'session-1',
            metadata: 'encrypted-v7',
            expectedVersion: 7,
        });
        expect(decryptMetadata).toHaveBeenCalledWith(8, 'server-metadata-v8');
        expect(encryptMetadata).toHaveBeenNthCalledWith(2, {
            path: '/workspace/project',
            host: 'devbox',
            currentModelCode: 'claude-sonnet',
            summary: {
                text: 'Renamed chat',
                updatedAt: 200,
            },
        });
        expect(apiSocket.emitWithAck).toHaveBeenNthCalledWith(2, 'update-metadata', {
            sid: 'session-1',
            metadata: 'encrypted-v8',
            expectedVersion: 8,
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
