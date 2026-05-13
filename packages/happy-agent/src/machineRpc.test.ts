import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.hoisted(() => {
    const emitWithAck = vi.fn();
    const socket = {
        connected: true,
        connect: vi.fn(),
        close: vi.fn(),
        timeout: vi.fn((_ms?: number) => ({ emitWithAck })),
        once: vi.fn(),
        off: vi.fn(),
    };
    return {
        emitWithAck,
        socket,
        io: vi.fn((_url: string, options: { auth?: { tunnelAuthorization?: string } }) => {
            if (!options.auth?.tunnelAuthorization?.startsWith('tunnel ')) {
                emitWithAck.mockRejectedValueOnce(new Error('missing_tunnel_authorization'));
            }
            return socket;
        }),
    };
});

vi.mock('socket.io-client', () => ({
    io: rpcMock.io,
}));

const { resumeSessionOnMachine, spawnInWorktreeOnMachine, spawnSessionOnMachine } = await import('./machineRpc');

function lastIoCall(): [string, { auth: { tunnelAuthorization: string }; extraHeaders: Record<string, string>; transportOptions: { websocket: { extraHeaders: Record<string, string> }; polling: { extraHeaders: Record<string, string> } }; path: string; transports: string[]; autoConnect: boolean; reconnection: boolean }] {
    return rpcMock.io.mock.calls.at(-1) as ReturnType<typeof lastIoCall>;
}

function lastRpcCall(): { method: string; params: Record<string, unknown> } {
    return rpcMock.emitWithAck.mock.calls.at(-1)?.[1] as { method: string; params: Record<string, unknown> };
}

function expectPlainParams(params: unknown): asserts params is Record<string, unknown> {
    expect(typeof params).toBe('object');
    expect(params).not.toBeNull();
    expect(Array.isArray(params)).toBe(false);
    expect(params).not.toHaveProperty('encrypted');
    expect(params).not.toHaveProperty('nonce');
    expect(params).not.toHaveProperty('ciphertext');
}

function expectResultDiscriminator(result: unknown): void {
    expect(typeof result).toBe('object');
    expect(result).not.toBeNull();
    expect(['success', 'requestToApproveDirectoryCreation', 'error']).toContain((result as { type?: unknown }).type);
}

describe('machine RPC client', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        rpcMock.socket.connected = true;
        rpcMock.io.mockImplementation((_url: string, options: { auth?: { tunnelAuthorization?: string } }) => {
            if (!options.auth?.tunnelAuthorization?.startsWith('tunnel ')) {
                rpcMock.emitWithAck.mockRejectedValueOnce(new Error('missing_tunnel_authorization'));
            }
            return rpcMock.socket;
        });
    });

    it('wraps spawn-in-worktree with tunnel auth and plaintext params', async () => {
        const resultPayload = {
            type: 'success',
            sessionId: 'session-1',
            worktreePath: '/repo/.dev/worktree/ralph-12345678',
            branchName: 'ralph-12345678',
            runId: 'run-1',
        };
        rpcMock.emitWithAck.mockResolvedValueOnce({ ok: true, result: resultPayload });

        const result = await spawnInWorktreeOnMachine('https://abc.devtunnels.ms', 'claim-1', 'connect-1', {
            machineId: 'machine-1',
            repoPath: '/repo',
            worktreePath: '/repo/.dev/worktree/ralph-12345678',
            runId: 'run-1',
            agent: 'codex',
        });

        const [url, options] = lastIoCall();
        expect(url).toBe('https://abc.devtunnels.ms');
        expect(options).toMatchObject({
            auth: { tunnelAuthorization: 'tunnel claim-1' },
            extraHeaders: { 'X-Tunnel-Connect': 'connect-1' },
            transportOptions: {
                websocket: { extraHeaders: { 'X-Tunnel-Connect': 'connect-1' } },
                polling: { extraHeaders: { 'X-Tunnel-Connect': 'connect-1' } },
            },
            path: '/v1/updates',
            transports: ['websocket'],
            autoConnect: false,
            reconnection: false,
        });
        expect(options.auth.tunnelAuthorization.startsWith('tunnel ')).toBe(true);
        expect(lastRpcCall().method).toBe('machine-1:spawn-in-worktree');
        expectPlainParams(lastRpcCall().params);
        expect(lastRpcCall().params).toEqual({
            machineId: 'machine-1',
            repoPath: '/repo',
            worktreePath: '/repo/.dev/worktree/ralph-12345678',
            runId: 'run-1',
            agent: 'codex',
            token: undefined,
        });
        expectResultDiscriminator(result);
        expect(result).toEqual(resultPayload);
    });

    it('keeps spawn-in-directory result and discriminator shape', async () => {
        const resultPayload = { type: 'requestToApproveDirectoryCreation', directory: '/repo' };
        rpcMock.emitWithAck.mockResolvedValueOnce({ ok: true, result: resultPayload });

        const result = await spawnSessionOnMachine('http://127.0.0.1:41000', 'claim-2', 'connect-2', {
            machineId: 'machine-1',
            directory: '/repo',
            approvedNewDirectoryCreation: true,
            agent: 'claude',
        });

        expect(lastIoCall()[0]).toBe('http://127.0.0.1:41000');
        expect(lastRpcCall().method).toBe('machine-1:spawn-happy-session');
        expectPlainParams(lastRpcCall().params);
        expect(lastRpcCall().params).toEqual({
            machineId: 'machine-1',
            type: 'spawn-in-directory',
            directory: '/repo',
            approvedNewDirectoryCreation: true,
            token: undefined,
            agent: 'claude',
        });
        expectResultDiscriminator(result);
        expect(result).toEqual(resultPayload);
    });

    it('sends resume params with machineId and sessionId', async () => {
        const resultPayload = { type: 'success', sessionId: 'session-resumed' };
        rpcMock.emitWithAck.mockResolvedValueOnce({ ok: true, result: resultPayload });

        const result = await resumeSessionOnMachine('https://abc.devtunnels.ms', 'claim-3', 'connect-3', {
            machineId: 'machine-1',
            sessionId: 'session-original',
        });

        expect(lastRpcCall().method).toBe('machine-1:resume-happy-session');
        expectPlainParams(lastRpcCall().params);
        expect(lastRpcCall().params).toEqual({ machineId: 'machine-1', sessionId: 'session-original' });
        expect(result).toEqual(resultPayload);
    });

    it('returns daemon error union results without decrypting', async () => {
        const resultPayload = { type: 'error', errorMessage: 'daemon refused' };
        rpcMock.emitWithAck.mockResolvedValueOnce({ ok: true, result: resultPayload });

        const result = await spawnSessionOnMachine('https://abc.devtunnels.ms', 'claim-4', 'connect-4', {
            machineId: 'machine-1',
            directory: '/repo',
        });

        expectResultDiscriminator(result);
        expect(result).toEqual(resultPayload);
    });

    it('maps RPC ack errors and timeout rejections', async () => {
        rpcMock.emitWithAck.mockResolvedValueOnce({ ok: false, error: 'RPC method not available' });
        await expect(spawnSessionOnMachine('https://abc.devtunnels.ms', 'claim-5', 'connect-5', {
            machineId: 'machine-1',
            directory: '/repo',
        })).rejects.toThrow('Machine machine-1 is offline or its daemon is not connected.');

        rpcMock.emitWithAck.mockRejectedValueOnce(new Error('operation has timed out'));
        await expect(spawnSessionOnMachine('https://abc.devtunnels.ms', 'claim-6', 'connect-6', {
            machineId: 'machine-1',
            directory: '/repo',
        })).rejects.toThrow('operation has timed out');
    });

    it('rejects invalid plaintext result shapes', async () => {
        rpcMock.emitWithAck.mockResolvedValueOnce({ ok: true, result: 'encrypted-base64' });
        await expect(spawnSessionOnMachine('https://abc.devtunnels.ms', 'claim-7', 'connect-7', {
            machineId: 'machine-1',
            directory: '/repo',
        })).rejects.toThrow('RPC call returned invalid data');

        rpcMock.emitWithAck.mockResolvedValueOnce({ ok: true, result: { type: 'unknown' } });
        await expect(spawnSessionOnMachine('https://abc.devtunnels.ms', 'claim-8', 'connect-8', {
            machineId: 'machine-1',
            directory: '/repo',
        })).rejects.toThrow('RPC call returned unexpected data');
    });

    it('local mock rejects missing tunnelAuthorization prefix', async () => {
        const socket = rpcMock.io('https://abc.devtunnels.ms', {
            auth: { tunnelAuthorization: 'claim-without-prefix' },
        });

        await expect(socket.timeout(30_000).emitWithAck('rpc-call', { method: 'machine-1:spawn-happy-session', params: {} }))
            .rejects.toThrow('missing_tunnel_authorization');
    });
});
