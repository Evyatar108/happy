import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecryptedMachine } from './api';
import type { Config } from './config';
import { decodeBase64, decrypt, encodeBase64, encrypt } from './encryption';

const rpcMock = vi.hoisted(() => {
    const emitWithAck = vi.fn();
    const socket = {
        connected: true,
        connect: vi.fn(),
        close: vi.fn(),
        timeout: vi.fn(() => ({ emitWithAck })),
        once: vi.fn(),
        off: vi.fn(),
    };
    return {
        emitWithAck,
        socket,
        io: vi.fn(() => socket),
    };
});

vi.mock('socket.io-client', () => ({
    io: rpcMock.io,
}));

const { spawnInWorktreeOnMachine, spawnSessionOnMachine } = await import('./machineRpc');

const key = new Uint8Array(32).fill(7);

const config: Config = {
    serverUrl: 'http://server.test',
    homeDir: '/tmp/happy-agent-test',
    credentialPath: '/tmp/happy-agent-test/agent.key',
};

const machine: DecryptedMachine = {
    id: 'machine-1',
    seq: 1,
    createdAt: 1,
    updatedAt: 1,
    active: true,
    activeAt: 1,
    metadata: {},
    metadataVersion: 1,
    daemonState: null,
    daemonStateVersion: 0,
    dataEncryptionKey: null,
    encryption: {
        key,
        variant: 'legacy',
    },
};

function encryptedResult(result: unknown): string {
    return encodeBase64(encrypt(key, 'legacy', result));
}

function lastRpcCall(): { method: string; params: string } {
    return rpcMock.emitWithAck.mock.calls.at(-1)?.[1] as { method: string; params: string };
}

function decryptedParams(): unknown {
    return decrypt(key, 'legacy', decodeBase64(lastRpcCall().params));
}

describe('machine RPC client', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        rpcMock.socket.connected = true;
    });

    it('wraps spawn-in-worktree and returns rich success fields', async () => {
        rpcMock.emitWithAck.mockResolvedValueOnce({
            ok: true,
            result: encryptedResult({
                type: 'success',
                sessionId: 'session-1',
                worktreePath: '/repo/.dev/worktree/ralph-12345678',
                branchName: 'ralph-12345678',
                runId: 'run-1',
            }),
        });

        const result = await spawnInWorktreeOnMachine(config, machine, 'token-1', {
            repoPath: '/repo',
            worktreePath: '/repo/.dev/worktree/ralph-12345678',
            runId: 'run-1',
            agent: 'codex',
        });

        expect(lastRpcCall().method).toBe('machine-1:spawn-in-worktree');
        expect(decryptedParams()).toEqual({
            repoPath: '/repo',
            worktreePath: '/repo/.dev/worktree/ralph-12345678',
            runId: 'run-1',
            agent: 'codex',
            token: undefined,
        });
        expect(result).toEqual({
            type: 'success',
            sessionId: 'session-1',
            worktreePath: '/repo/.dev/worktree/ralph-12345678',
            branchName: 'ralph-12345678',
            runId: 'run-1',
        });
    });

    it('keeps legacy spawn-in-directory RPC behavior', async () => {
        rpcMock.emitWithAck.mockResolvedValueOnce({
            ok: true,
            result: encryptedResult({ type: 'success', sessionId: 'session-legacy' }),
        });

        const result = await spawnSessionOnMachine(config, machine, 'token-1', {
            directory: '/repo',
            approvedNewDirectoryCreation: true,
            agent: 'claude',
        });

        expect(lastRpcCall().method).toBe('machine-1:spawn-happy-session');
        expect(decryptedParams()).toEqual({
            type: 'spawn-in-directory',
            directory: '/repo',
            approvedNewDirectoryCreation: true,
            token: undefined,
            agent: 'claude',
        });
        expect(result).toEqual({ type: 'success', sessionId: 'session-legacy' });
    });
});
