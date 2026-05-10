import { describe, expect, it, vi } from 'vitest';

import { ApiMachineClient, type ForkSessionOptions } from './apiMachine';
import type { Machine, MachineMetadata } from './types';
import type { SpawnSessionResult } from '@/modules/common/registerCommonHandlers';

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
        debugLargeJson: vi.fn(),
    },
}));

function createMachine(): Machine {
    const metadata: MachineMetadata = {
        host: 'localhost',
        platform: 'win32',
        happyCliVersion: '1.0.0',
        homeDir: 'C:/Users/test',
        happyHomeDir: 'C:/Users/test/.happy',
        happyLibDir: 'C:/happy',
    };

    return {
        id: 'machine-1',
        encryptionKey: new Uint8Array(32),
        encryptionVariant: 'legacy',
        metadata,
        metadataVersion: 1,
        daemonState: null,
        daemonStateVersion: 1,
    };
}

function getForkRpcHandler(client: ApiMachineClient): (options: ForkSessionOptions) => Promise<SpawnSessionResult> {
    const manager = (client as any).rpcHandlerManager;
    return (manager as any).handlers.get('machine-1:fork-into-worktree');
}

describe('fork-into-worktree machine RPC', () => {
    it('registers the handler and forwards accepted params', async () => {
        const forkSession = vi.fn().mockResolvedValue({ type: 'success', sessionId: 'child-local-id' });
        const client = new ApiMachineClient('token', createMachine());

        client.setRPCHandlers({
            spawnSession: vi.fn(),
            resumeSession: vi.fn(),
            forkSession,
            stopSession: vi.fn(),
            requestShutdown: vi.fn(),
        });

        const result = await getForkRpcHandler(client)({
            parentSessionId: 'parent-local-id',
            worktreePath: 'C:/repo/fork',
            model: 'gpt-5.2-codex',
            permissionMode: 'safe-yolo',
            effortLevel: 'high',
        });

        expect(result).toEqual({ type: 'success', sessionId: 'child-local-id' });
        expect(forkSession).toHaveBeenCalledWith({
            parentSessionId: 'parent-local-id',
            worktreePath: 'C:/repo/fork',
            model: 'gpt-5.2-codex',
            permissionMode: 'safe-yolo',
            effortLevel: 'high',
        });
    });

    it('preserves daemon error envelopes for parent missing, worktree missing, and unsupported flavor', async () => {
        const forkSession = vi
            .fn()
            .mockResolvedValueOnce({ type: 'error', errorMessage: 'Session parent-local-id is not tracked by this daemon.' })
            .mockResolvedValueOnce({ type: 'error', errorMessage: 'Failed to fork session: ENOENT' })
            .mockResolvedValueOnce({ type: 'error', errorMessage: 'Forking is currently supported for Codex sessions only.' });
        const client = new ApiMachineClient('token', createMachine());

        client.setRPCHandlers({
            spawnSession: vi.fn(),
            resumeSession: vi.fn(),
            forkSession,
            stopSession: vi.fn(),
            requestShutdown: vi.fn(),
        });

        const handler = getForkRpcHandler(client);
        await expect(handler({ parentSessionId: 'parent-local-id', worktreePath: 'C:/repo/fork' }))
            .resolves.toMatchObject({ type: 'error', errorMessage: expect.stringContaining('not tracked') });
        await expect(handler({ parentSessionId: 'parent-local-id', worktreePath: 'C:/repo/missing' }))
            .resolves.toMatchObject({ type: 'error', errorMessage: expect.stringContaining('ENOENT') });
        await expect(handler({ parentSessionId: 'parent-local-id', worktreePath: 'C:/repo/fork' }))
            .resolves.toMatchObject({ type: 'error', errorMessage: expect.stringContaining('Codex sessions only') });
    });
});
