import { describe, expect, it, vi } from 'vitest';

import { ApiMachineClient } from './apiMachine';
import type { Machine, MachineMetadata } from './types';
import type { SpawnInWorktreeOptions, SpawnSessionResult } from '@/modules/common/registerCommonHandlers';

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

function getSpawnInWorktreeRpcHandler(client: ApiMachineClient): (options: any) => Promise<SpawnSessionResult> {
    const manager = (client as any).rpcHandlerManager;
    return (manager as any).handlers.get('machine-1:spawn-in-worktree');
}

describe('spawn-in-worktree machine RPC', () => {
    it('rejects unsupported agents before invoking the daemon handler', async () => {
        const spawnInWorktree = vi.fn();
        const client = new ApiMachineClient('token', createMachine());

        client.setRPCHandlers({
            spawnSession: vi.fn(),
            spawnInWorktree,
            stopSession: vi.fn(),
            requestShutdown: vi.fn(),
        });

        const handler = getSpawnInWorktreeRpcHandler(client);

        await expect(handler({ repoPath: 'C:/repo', agent: 'unsupported' }))
            .resolves.toMatchObject({ type: 'error', errorMessage: expect.stringContaining('agent must be one of') });
        expect(spawnInWorktree).not.toHaveBeenCalled();
    });

    it('forwards a supported agent as the metadata flavor source of truth', async () => {
        const spawnInWorktree = vi.fn(async (_options: SpawnInWorktreeOptions): Promise<SpawnSessionResult> => ({
            type: 'success',
            sessionId: 'session-1',
        }));
        const client = new ApiMachineClient('token', createMachine());

        client.setRPCHandlers({
            spawnSession: vi.fn(),
            spawnInWorktree,
            stopSession: vi.fn(),
            requestShutdown: vi.fn(),
        });

        const handler = getSpawnInWorktreeRpcHandler(client);

        await expect(handler({
            repoPath: 'C:/repo',
            worktreePath: 'C:/repo/.dev/worktree/ralph-12345678',
            runId: 'run-123',
            agent: 'codex',
            token: 'provider-token',
        })).resolves.toEqual({ type: 'success', sessionId: 'session-1' });

        expect(spawnInWorktree).toHaveBeenCalledWith({
            machineId: 'machine-1',
            repoPath: 'C:/repo',
            worktreePath: 'C:/repo/.dev/worktree/ralph-12345678',
            runId: 'run-123',
            agent: 'codex',
            token: 'provider-token',
        });
    });
});
