import { EventEmitter } from 'node:events';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocketServer, type WebSocket } from 'ws';
import type { SandboxConfig } from '@/persistence';
import type { CodexAppServerTransport } from './codexAppServerClient';

const {
    mockExecSync,
    mockInitializeSandbox,
    mockWrapForMcpTransport,
    mockSandboxCleanup,
    mockSpawn,
    mockPickFreeLoopbackPort,
    mockLogger,
    mockOpenSync,
    mockCloseSync,
} = vi.hoisted(() => ({
    mockExecSync: vi.fn(),
    mockInitializeSandbox: vi.fn(),
    mockWrapForMcpTransport: vi.fn(),
    mockSandboxCleanup: vi.fn(),
    mockSpawn: vi.fn(),
    mockPickFreeLoopbackPort: vi.fn(),
    mockLogger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
    },
    mockOpenSync: vi.fn(),
    mockCloseSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
    execSync: mockExecSync,
    spawn: mockSpawn,
}));

vi.mock('cross-spawn', () => ({
    spawn: mockSpawn,
}));

vi.mock('node:fs', async (importActual) => {
    const actual = await importActual<typeof import('node:fs')>();
    return {
        ...actual,
        openSync: mockOpenSync,
        closeSync: mockCloseSync,
    };
});

vi.mock('@/sandbox/manager', () => ({
    initializeSandbox: mockInitializeSandbox,
    wrapForMcpTransport: mockWrapForMcpTransport,
}));

vi.mock('@/ui/logger', () => ({
    logger: mockLogger,
}));

vi.mock('@/utils/pickFreeLoopbackPort', () => ({
    pickFreeLoopbackPort: mockPickFreeLoopbackPort,
}));

vi.mock('../package.json', () => ({
    default: { version: '0.0.1-test' },
}));

type MockRpcMessage = {
    id?: number;
    method?: string;
    params?: any;
    result?: any;
};

function pushJsonLine(stdout: NodeJS.ReadableStream & { push: (chunk: string) => void }, payload: unknown) {
    stdout.push(JSON.stringify(payload) + '\n');
}

type SendJson = (payload: unknown) => void;

type MockAppServerOptions = {
    pid?: number;
    initializeDelayMs?: number;
    onRequest?: (msg: MockRpcMessage, send: SendJson) => void;
};

// Mock child process with stdin/stdout/stderr
function createMockProcess(opts?: {
    pid?: number;
    initializeDelayMs?: number;
    onRequest?: (msg: MockRpcMessage, stdout: NodeJS.ReadableStream & { push: (chunk: string) => void }) => void;
}) {
    const { Readable, Writable } = require('stream');
    const initializeDelayMs = opts?.initializeDelayMs ?? 5;
    const stdin = new Writable({ write: (_: any, __: any, cb: () => void) => cb() });
    const stdout = new Readable({ read() {} });
    const stderr = new Readable({ read() {} });
    const proc = Object.assign(new (require('events').EventEmitter)(), {
        stdin,
        stdout,
        stderr,
        pid: opts?.pid ?? 12345,
        kill: vi.fn(),
    });
    // Send initialize response immediately when stdin is written to
    const origWrite = stdin.write.bind(stdin);
    stdin.write = (data: any, ...args: any[]) => {
        try {
            const msg = JSON.parse(typeof data === 'string' ? data : data.toString());
            if (msg.method === 'initialize' && msg.id != null) {
                // Send response on next tick
                setTimeout(() => {
                    pushJsonLine(stdout, { id: msg.id, result: { userAgent: 'test' } });
                }, initializeDelayMs);
            }
            opts?.onRequest?.(msg, stdout);
        } catch {}
        return origWrite(data, ...args);
    };
    return proc;
}

const activeWsServers: WebSocketServer[] = [];
const activeWsSockets: WebSocket[] = [];

async function closeWsServer(wss: WebSocketServer): Promise<void> {
    for (const client of wss.clients) {
        try { client.close(); } catch { /* ignore */ }
    }
    await new Promise<void>((resolve) => {
        wss.close(() => resolve());
    });
}

async function createMockWsAppServer(opts?: MockAppServerOptions) {
    const initializeDelayMs = opts?.initializeDelayMs ?? 5;
    const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    activeWsServers.push(wss);
    await new Promise<void>((resolve) => wss.once('listening', resolve));
    const address = wss.address() as AddressInfo;

    const proc = Object.assign(new EventEmitter(), {
        pid: opts?.pid ?? 12345,
        kill: vi.fn((signal?: NodeJS.Signals) => {
            queueMicrotask(() => proc.emit('exit', signal === 'SIGKILL' ? 1 : 0, signal ?? null));
            return true;
        }),
    });

    wss.on('connection', (socket) => {
        activeWsSockets.push(socket);
        socket.on('message', (data) => {
            const send = (payload: unknown) => socket.send(JSON.stringify(payload));
            try {
                const msg = JSON.parse(data.toString()) as MockRpcMessage;
                if (msg.method === 'initialize' && msg.id != null) {
                    setTimeout(() => {
                        send({ id: msg.id, result: { userAgent: 'test' } });
                    }, initializeDelayMs);
                }
                opts?.onRequest?.(msg, send);
            } catch {}
        });
    });

    return { port: address.port, proc, wss };
}

async function mockNextAppServer(transport: CodexAppServerTransport, opts?: MockAppServerOptions) {
    if (transport === 'stdio') {
        const proc = createMockProcess({
            ...opts,
            onRequest: opts?.onRequest
                ? (msg, stdout) => opts.onRequest?.(msg, (payload) => pushJsonLine(stdout, payload))
                : undefined,
        });
        mockSpawn.mockImplementationOnce(() => proc);
        return { proc, port: null };
    }

    const server = await createMockWsAppServer(opts);
    mockPickFreeLoopbackPort.mockResolvedValueOnce(server.port);
    mockSpawn.mockImplementationOnce(() => server.proc);
    return { proc: server.proc, port: server.port };
}

afterEach(async () => {
    vi.useRealTimers();
    for (const socket of activeWsSockets.splice(0)) {
        try { socket.close(); } catch { /* ignore */ }
    }
    await Promise.all(activeWsServers.splice(0).map((server) => closeWsServer(server)));
});

async function waitFor(predicate: () => boolean, timeoutMs: number = 1000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
        if (Date.now() >= deadline) {
            throw new Error(`Timed out after ${timeoutMs}ms`);
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}

const sandboxConfig: SandboxConfig = {
    enabled: true,
    workspaceRoot: '~/projects',
    sessionIsolation: 'workspace',
    customWritePaths: [],
    denyReadPaths: ['~/.ssh'],
    extraWritePaths: ['/tmp'],
    denyWritePaths: ['.env'],
    networkMode: 'allowed',
    allowedDomains: [],
    deniedDomains: [],
    allowLocalBinding: true,
};

describe('CodexAppServerClient sandbox integration', () => {
    const originalRustLog = process.env.RUST_LOG;
    const originalPlatform = process.platform;

    beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'linux' });
        vi.clearAllMocks();
        process.env.RUST_LOG = originalRustLog;
        mockExecSync.mockReturnValue('codex-cli 0.107.0');
        mockPickFreeLoopbackPort.mockResolvedValue(30123);
        mockInitializeSandbox.mockResolvedValue(mockSandboxCleanup);
        mockWrapForMcpTransport.mockResolvedValue({ command: 'sh', args: ['-c', 'wrapped codex app-server'] });
        mockSpawn.mockImplementation(() => createMockProcess());
        mockOpenSync.mockReturnValue(99);
    });

    afterAll(() => {
        process.env.RUST_LOG = originalRustLog;
        Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('wraps transport when sandbox is enabled', async () => {
        // Dynamic import to ensure mocks are applied
        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(sandboxConfig);

        await client.connect();

        expect(mockInitializeSandbox).toHaveBeenCalledWith(sandboxConfig, process.cwd());
        expect(mockWrapForMcpTransport).toHaveBeenCalledWith('codex', ['app-server', '--listen', 'stdio://']);
        expect(mockSpawn).toHaveBeenCalledWith(
            'sh',
            ['-c', 'wrapped codex app-server'],
            expect.objectContaining({
                env: expect.objectContaining({
                    CODEX_SANDBOX: 'seatbelt',
                    RUST_LOG: expect.stringContaining('codex_core::rollout::list=off'),
                }),
            }),
        );
        expect(client.sandboxEnabled).toBe(true);

        await client.disconnect();
    });

    it('forces stdio transport when sandbox is enabled and ws is requested', async () => {
        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(sandboxConfig, { transport: 'ws' });

        await client.connect();

        expect(mockPickFreeLoopbackPort).not.toHaveBeenCalled();
        expect(mockWrapForMcpTransport).toHaveBeenCalledWith('codex', ['app-server', '--listen', 'stdio://']);
        expect(mockSpawn).toHaveBeenCalledWith(
            'sh',
            ['-c', 'wrapped codex app-server'],
            expect.objectContaining({
                env: expect.objectContaining({
                    CODEX_SANDBOX: 'seatbelt',
                }),
            }),
        );
        expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('forcing stdio transport instead of ws'));

        await client.disconnect();
    });

    it('rejects ws connect when the app-server exits during handshake', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        const proc = Object.assign(new EventEmitter(), {
            pid: 5001,
            kill: vi.fn(),
        });
        mockSpawn.mockImplementation(() => proc);

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, {
            transport: 'ws',
            logFilePath: join(tmpdir(), 'codex-app-server-test.log'),
        });

        const connect = client.connect();
        queueMicrotask(() => proc.emit('exit', 1, null));

        await expect(connect).rejects.toThrow('Codex app-server exited during ws handshake');
        expect(mockSpawn).toHaveBeenCalledWith(
            'codex',
            ['app-server', '--listen', 'ws://127.0.0.1:30123'],
            expect.objectContaining({ stdio: ['ignore', expect.any(Number), 'pipe'] }),
        );
    });

    it('falls back to non-sandbox transport when sandbox initialization fails', async () => {
        mockInitializeSandbox.mockRejectedValue(new Error('sandbox init failed'));
        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(sandboxConfig);

        await client.connect();

        expect(mockWrapForMcpTransport).not.toHaveBeenCalled();
        expect(mockSpawn).toHaveBeenCalledWith(
            'codex',
            ['app-server', '--listen', 'stdio://'],
            expect.objectContaining({
                env: expect.objectContaining({
                    RUST_LOG: expect.stringContaining('codex_core::rollout::list=off'),
                }),
            }),
        );
        expect(client.sandboxEnabled).toBe(false);

        await client.disconnect();
    });

    it('resets sandbox on disconnect', async () => {
        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(sandboxConfig);

        await client.connect();
        await client.disconnect();

        expect(mockSandboxCleanup).toHaveBeenCalledTimes(1);
        expect(client.sandboxEnabled).toBe(false);
    });

    it('appends rollout log filter to existing RUST_LOG', async () => {
        process.env.RUST_LOG = 'info,codex_core=warn';
        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(sandboxConfig);

        await client.connect();

        expect(mockSpawn).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            expect.objectContaining({
                env: expect.objectContaining({
                    RUST_LOG: 'info,codex_core=warn,codex_core::rollout::list=off',
                }),
            }),
        );

        await client.disconnect();
    });

    it.each([{ transport: 'stdio' as const }, { transport: 'ws' as const }])(
        'ignores stale process exit during reconnect initialize over $transport',
        async ({ transport }) => {
        const proc1 = await mockNextAppServer(transport, { pid: 1001, initializeDelayMs: 5 });
        await mockNextAppServer(transport, { pid: 1002, initializeDelayMs: 50 });
        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, { transport });

        await client.connect();
        await client.disconnect();

        const reconnect = client.connect();
        setTimeout(() => {
            proc1.proc.emit('exit', 0, null);
        }, 10);

        await expect(reconnect).resolves.toBeUndefined();
        await client.disconnect();
    });

    it.each([{ transport: 'stdio' as const }, { transport: 'ws' as const }])(
        'reconnects and resumes the same thread after forced restart timeout over $transport',
        async ({ transport }) => {
        const firstProcessRequests: MockRpcMessage[] = [];
        const secondProcessRequests: MockRpcMessage[] = [];
        type CapturedEvent = { type: string; [key: string]: unknown };

        await mockNextAppServer(transport, {
            pid: 2001,
            onRequest: (msg, send) => {
                firstProcessRequests.push(msg);

                if (msg.method === 'thread/start' && msg.id != null) {
                    setTimeout(() => {
                        send({
                            id: msg.id,
                            result: {
                                thread: { id: 'thread-1', path: '/tmp/thread-1' },
                                model: 'gpt-test',
                                modelProvider: 'openai',
                                cwd: '/tmp/project',
                                approvalPolicy: 'on-request',
                                sandbox: { type: 'readOnly' },
                                reasoningEffort: null,
                            },
                        });
                    }, 0);
                }

                if (msg.method === 'turn/start' && msg.id != null) {
                    setTimeout(() => {
                        send({ id: msg.id, result: {} });
                        send({
                            method: 'codex/event',
                            params: { msg: { type: 'task_started', turn_id: 'turn-1' } },
                        });
                    }, 0);
                }

                if (msg.method === 'turn/interrupt' && msg.id != null) {
                    setTimeout(() => {
                        send({ id: msg.id, result: { abortReason: 'interrupted' } });
                    }, 0);
                }
            },
        });

        await mockNextAppServer(transport, {
            pid: 2002,
            onRequest: (msg, send) => {
                secondProcessRequests.push(msg);

                if (msg.method === 'thread/resume' && msg.id != null) {
                    setTimeout(() => {
                        send({
                            id: msg.id,
                            result: {
                                thread: { id: 'thread-1', path: '/tmp/thread-1' },
                                model: 'gpt-test',
                                modelProvider: 'openai',
                                cwd: '/tmp/project',
                                approvalPolicy: 'on-request',
                                sandbox: { type: 'readOnly' },
                                reasoningEffort: null,
                            },
                        });
                    }, 0);
                }

                if (msg.method === 'turn/start' && msg.id != null) {
                    setTimeout(() => {
                        send({ id: msg.id, result: {} });
                        send({
                            method: 'codex/event',
                            params: { msg: { type: 'task_started', turn_id: 'turn-2' } },
                        });
                        send({
                            method: 'codex/event',
                            params: { msg: { type: 'task_complete', turn_id: 'turn-2' } },
                        });
                    }, 0);
                }
            },
        });

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, { transport });
        const events: CapturedEvent[] = [];
        client.setEventHandler((msg) => {
            events.push(msg as CapturedEvent);
        });

        await client.connect();
        await client.startThread({
            model: 'gpt-test',
            cwd: '/tmp/project',
            approvalPolicy: 'on-request',
            sandbox: 'read-only',
        });

        const pendingTurn = client.sendTurnAndWait('hang forever', { turnTimeoutMs: 5000 });
        await waitFor(() => firstProcessRequests.some((msg) => msg.method === 'turn/start'));

        const abortResult = await client.abortTurnWithFallback({
            gracePeriodMs: 1,
            forceRestartOnTimeout: true,
        });

        await expect(pendingTurn).resolves.toEqual({ aborted: true });
        expect(abortResult).toEqual({
            hadActiveTurn: true,
            aborted: true,
            forcedRestart: true,
            resumedThread: true,
        });
        expect(events).toContainEqual(expect.objectContaining({
            type: 'turn_aborted',
            reason: 'interrupted',
            turn_id: 'turn-1',
            forced_restart: true,
        }));

        const resumeRequest = secondProcessRequests.find((msg) => msg.method === 'thread/resume');
        expect(resumeRequest?.params).toEqual(expect.objectContaining({
            threadId: 'thread-1',
            model: 'gpt-test',
            cwd: '/tmp/project',
            approvalPolicy: 'on-request',
            sandbox: 'read-only',
            persistExtendedHistory: true,
        }));
        expect(client.threadId).toBe('thread-1');

        await expect(client.sendTurnAndWait('follow up after reconnect')).resolves.toEqual({ aborted: false });

        await client.disconnect();
    });

    it.each([{ transport: 'stdio' as const }, { transport: 'ws' as const }])(
        'maps raw item notifications into legacy events and deduplicates turn completion over $transport',
        async ({ transport }) => {
        const requests: MockRpcMessage[] = [];
        await mockNextAppServer(transport, {
            pid: 3001,
            onRequest: (msg, send) => {
                requests.push(msg);

                if (msg.method === 'thread/start' && msg.id != null) {
                    setTimeout(() => {
                        send({
                            id: msg.id,
                            result: {
                                thread: { id: 'thread-raw-1', path: '/tmp/thread-raw-1' },
                                model: 'gpt-test',
                                modelProvider: 'openai',
                                cwd: '/tmp/project',
                                approvalPolicy: 'never',
                                sandbox: { type: 'dangerFullAccess' },
                                reasoningEffort: null,
                            },
                        });
                    }, 0);
                }

                if (msg.method === 'turn/start' && msg.id != null) {
                    setTimeout(() => {
                        send({ id: msg.id, result: { turn: { id: 'turn-raw-1', items: [], status: 'inProgress', error: null } } });
                        send({
                            method: 'thread/status/changed',
                            params: { threadId: 'thread-raw-1', status: { type: 'active', activeFlags: [] } },
                        });
                        send({
                            method: 'turn/started',
                            params: {
                                threadId: 'thread-raw-1',
                                turn: { id: 'turn-raw-1', items: [], status: 'inProgress', error: null },
                            },
                        });
                        send({
                            method: 'item/started',
                            params: {
                                threadId: 'thread-raw-1',
                                turnId: 'turn-raw-1',
                                item: {
                                    type: 'commandExecution',
                                    id: 'call-1',
                                    command: '/bin/zsh -lc pwd',
                                    cwd: '/tmp/project',
                                    status: 'inProgress',
                                },
                            },
                        });
                        send({
                            method: 'item/completed',
                            params: {
                                threadId: 'thread-raw-1',
                                turnId: 'turn-raw-1',
                                item: {
                                    type: 'commandExecution',
                                    id: 'call-1',
                                    command: '/bin/zsh -lc pwd',
                                    cwd: '/tmp/project',
                                    aggregatedOutput: '/tmp/project\n',
                                    exitCode: 0,
                                    durationMs: 1,
                                    status: 'completed',
                                },
                            },
                        });
                        send({
                            method: 'item/completed',
                            params: {
                                threadId: 'thread-raw-1',
                                turnId: 'turn-raw-1',
                                item: {
                                    type: 'agentMessage',
                                    id: 'msg-1',
                                    text: 'done',
                                    phase: 'final_answer',
                                },
                            },
                        });
                        send({
                            method: 'thread/status/changed',
                            params: { threadId: 'thread-raw-1', status: { type: 'idle' } },
                        });
                        send({
                            method: 'turn/completed',
                            params: {
                                threadId: 'thread-raw-1',
                                turn: { id: 'turn-raw-1', items: [], status: 'completed', error: null },
                            },
                        });
                    }, 0);
                }
            },
        });

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, { transport });
        const events: Array<Record<string, unknown>> = [];
        client.setEventHandler((msg) => {
            events.push(msg as Record<string, unknown>);
        });

        await client.connect();
        await client.startThread({
            model: 'gpt-test',
            cwd: '/tmp/project',
            approvalPolicy: 'never',
            sandbox: 'danger-full-access',
        });

        await expect(client.sendTurnAndWait('run pwd')).resolves.toEqual({ aborted: false });

        expect(events).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'task_started', turn_id: 'turn-raw-1' }),
            expect.objectContaining({ type: 'exec_command_begin', callId: 'call-1' }),
            expect.objectContaining({ type: 'exec_command_end', callId: 'call-1', output: '/tmp/project\n' }),
            expect.objectContaining({ type: 'agent_message', message: 'done' }),
        ]));
        expect(events.filter((event) => event.type === 'task_complete')).toHaveLength(1);

        await client.disconnect();
    });

    it.each([{ transport: 'stdio' as const }, { transport: 'ws' as const }])(
        'maps raw file change items into legacy patch events over $transport',
        async ({ transport }) => {
        await mockNextAppServer(transport, {
            pid: 3003,
            onRequest: (msg, send) => {
                if (msg.method === 'thread/start' && msg.id != null) {
                    setTimeout(() => {
                        send({
                            id: msg.id,
                            result: {
                                thread: { id: 'thread-raw-3', path: '/tmp/thread-raw-3' },
                                model: 'gpt-test',
                                modelProvider: 'openai',
                                cwd: '/tmp/project',
                                approvalPolicy: 'never',
                                sandbox: { type: 'dangerFullAccess' },
                                reasoningEffort: null,
                            },
                        });
                    }, 0);
                }

                if (msg.method === 'turn/start' && msg.id != null) {
                    setTimeout(() => {
                        send({
                            id: msg.id,
                            result: {
                                turn: { id: 'turn-raw-3', items: [], status: 'inProgress', error: null },
                            },
                        });
                        send({
                            method: 'turn/started',
                            params: {
                                threadId: 'thread-raw-3',
                                turn: { id: 'turn-raw-3', items: [], status: 'inProgress', error: null },
                            },
                        });
                        send({
                            method: 'item/started',
                            params: {
                                threadId: 'thread-raw-3',
                                turnId: 'turn-raw-3',
                                item: {
                                    type: 'fileChange',
                                    id: 'patch-1',
                                    status: 'inProgress',
                                    changes: [{
                                        path: 'README.md',
                                        kind: { type: 'update', move_path: null },
                                        diff: '@@ -1 +1 @@',
                                    }],
                                },
                            },
                        });
                        send({
                            method: 'item/completed',
                            params: {
                                threadId: 'thread-raw-3',
                                turnId: 'turn-raw-3',
                                item: {
                                    type: 'fileChange',
                                    id: 'patch-1',
                                    status: 'completed',
                                    changes: [{
                                        path: 'README.md',
                                        kind: { type: 'update', move_path: null },
                                        diff: '@@ -1 +1 @@',
                                    }],
                                },
                            },
                        });
                        send({
                            method: 'item/completed',
                            params: {
                                threadId: 'thread-raw-3',
                                turnId: 'turn-raw-3',
                                item: {
                                    type: 'agentMessage',
                                    id: 'msg-3',
                                    text: 'patched',
                                    phase: 'final_answer',
                                },
                            },
                        });
                    }, 0);
                }
            },
        });

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, { transport });
        const events: Array<Record<string, unknown>> = [];
        client.setEventHandler((msg) => {
            events.push(msg as Record<string, unknown>);
        });

        await client.connect();
        await client.startThread({
            model: 'gpt-test',
            cwd: '/tmp/project',
            approvalPolicy: 'never',
            sandbox: 'danger-full-access',
        });

        await expect(client.sendTurnAndWait('patch the file')).resolves.toEqual({ aborted: false });

        expect(events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: 'patch_apply_begin',
                callId: 'patch-1',
                changes: {
                    'README.md': {
                        diff: '@@ -1 +1 @@',
                        kind: { type: 'update', move_path: null },
                    },
                },
            }),
            expect.objectContaining({
                type: 'patch_apply_end',
                callId: 'patch-1',
                status: 'completed',
            }),
        ]));

        await client.disconnect();
    });

    it.each([{ transport: 'stdio' as const }, { transport: 'ws' as const }])(
        'hydrates v2 file change approvals from raw item metadata over $transport',
        async ({ transport }) => {
        const approvals: Array<Record<string, unknown>> = [];
        await mockNextAppServer(transport, {
            pid: 3004,
            onRequest: (msg, send) => {
                if (msg.method === 'thread/start' && msg.id != null) {
                    setTimeout(() => {
                        send({
                            id: msg.id,
                            result: {
                                thread: { id: 'thread-raw-4', path: '/tmp/thread-raw-4' },
                                model: 'gpt-test',
                                modelProvider: 'openai',
                                cwd: '/tmp/project',
                                approvalPolicy: 'on-request',
                                sandbox: { type: 'workspaceWrite', writableRoots: [], networkAccess: true, excludeTmpdirEnvVar: false, excludeSlashTmp: false },
                                reasoningEffort: null,
                            },
                        });
                        send({
                            method: 'item/started',
                            params: {
                                threadId: 'thread-raw-4',
                                turnId: 'turn-raw-4',
                                item: {
                                    type: 'fileChange',
                                    id: 'patch-approval-1',
                                    status: 'inProgress',
                                    changes: [{
                                        path: 'README.md',
                                        kind: { type: 'update', move_path: null },
                                        diff: '@@ -1 +1 @@',
                                    }],
                                },
                            },
                        });
                        send({
                            id: 99,
                            method: 'item/fileChange/requestApproval',
                            params: {
                                threadId: 'thread-raw-4',
                                turnId: 'turn-raw-4',
                                itemId: 'patch-approval-1',
                                reason: null,
                                grantRoot: null,
                            },
                        });
                    }, 0);
                }
            },
        });

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, { transport });
        client.setApprovalHandler(async (params) => {
            approvals.push(params as Record<string, unknown>);
            return 'approved';
        });

        await client.connect();
        await client.startThread({
            model: 'gpt-test',
            cwd: '/tmp/project',
            approvalPolicy: 'on-request',
            sandbox: 'workspace-write',
        });

        await waitFor(() => approvals.length === 1);

        expect(approvals[0]).toEqual(expect.objectContaining({
            type: 'patch',
            callId: 'patch-approval-1',
            fileChanges: {
                'README.md': {
                    diff: '@@ -1 +1 @@',
                    kind: { type: 'update', move_path: null },
                },
            },
            reason: null,
        }));

        await client.disconnect();
    });

    it.each([{ transport: 'stdio' as const }, { transport: 'ws' as const }])(
        'falls back to final answer completion when raw turn/completed is missing over $transport',
        async ({ transport }) => {
        await mockNextAppServer(transport, {
            pid: 3002,
            onRequest: (msg, send) => {
                if (msg.method === 'thread/start' && msg.id != null) {
                    setTimeout(() => {
                        send({
                            id: msg.id,
                            result: {
                                thread: { id: 'thread-raw-2', path: '/tmp/thread-raw-2' },
                                model: 'gpt-test',
                                modelProvider: 'openai',
                                cwd: '/tmp/project',
                                approvalPolicy: 'never',
                                sandbox: { type: 'dangerFullAccess' },
                                reasoningEffort: null,
                            },
                        });
                    }, 0);
                }

                if (msg.method === 'turn/start' && msg.id != null) {
                    setTimeout(() => {
                        send({
                            id: msg.id,
                            result: {
                                turn: { id: 'turn-raw-2', items: [], status: 'inProgress', error: null },
                            },
                        });
                        send({
                            method: 'turn/started',
                            params: {
                                threadId: 'thread-raw-2',
                                turn: { id: 'turn-raw-2', items: [], status: 'inProgress', error: null },
                            },
                        });
                        send({
                            method: 'item/completed',
                            params: {
                                threadId: 'thread-raw-2',
                                turnId: 'turn-raw-2',
                                item: {
                                    type: 'agentMessage',
                                    id: 'msg-2',
                                    text: 'still works',
                                    phase: 'final_answer',
                                },
                            },
                        });
                    }, 0);
                }
            },
        });

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, { transport });
        const events: Array<Record<string, unknown>> = [];
        client.setEventHandler((msg) => {
            events.push(msg as Record<string, unknown>);
        });

        await client.connect();
        await client.startThread({
            model: 'gpt-test',
            cwd: '/tmp/project',
            approvalPolicy: 'never',
            sandbox: 'danger-full-access',
        });

        await expect(client.sendTurnAndWait('say hi')).resolves.toEqual({ aborted: false });
        expect(events).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'task_started', turn_id: 'turn-raw-2' }),
            expect.objectContaining({ type: 'agent_message', message: 'still works' }),
            expect.objectContaining({ type: 'task_complete', turn_id: 'turn-raw-2' }),
        ]));

        await client.disconnect();
    });

    it.each([{ transport: 'stdio' as const }, { transport: 'ws' as const }])(
        'responds to MCP elicitation requests with an action payload over $transport',
        async ({ transport }) => {
        const approvals: Array<Record<string, unknown>> = [];
        const requests: MockRpcMessage[] = [];
        await mockNextAppServer(transport, {
            pid: 3007,
            onRequest: (msg, send) => {
                requests.push(msg);
                if (msg.method === 'thread/start' && msg.id != null) {
                    setTimeout(() => {
                        send({
                            id: msg.id,
                            result: {
                                thread: { id: 'thread-raw-7', path: '/tmp/thread-raw-7' },
                                model: 'gpt-test',
                                modelProvider: 'openai',
                                cwd: '/tmp/project',
                                approvalPolicy: 'on-request',
                                sandbox: { type: 'workspaceWrite', writableRoots: [], networkAccess: true, excludeTmpdirEnvVar: false, excludeSlashTmp: false },
                                reasoningEffort: null,
                            },
                        });
                        send({
                            id: 77,
                            method: 'mcpServer/elicitation/request',
                            params: {
                                threadId: 'thread-raw-7',
                                turnId: 'turn-raw-7',
                                serverName: 'happy',
                                mode: 'form',
                                _meta: {
                                    codex_approval_kind: 'mcp_tool_call',
                                    tool_title: 'Change Chat Title',
                                    tool_description: 'Change the title of the current chat session',
                                    tool_params: { title: 'Casual Greeting' },
                                },
                                message: 'Allow the happy MCP server to run tool "change_title"?',
                                requestedSchema: {
                                    type: 'object',
                                    properties: {},
                                },
                            },
                        });
                    }, 0);
                }
            },
        });

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, { transport });
        client.setApprovalHandler(async (params) => {
            approvals.push(params as Record<string, unknown>);
            return 'approved';
        });

        await client.connect();
        await client.startThread({
            model: 'gpt-test',
            cwd: '/tmp/project',
            approvalPolicy: 'on-request',
            sandbox: 'workspace-write',
        });

        await waitFor(() => approvals.length === 1);
        await waitFor(() => requests.some((msg) => msg.id === 77 && msg.result?.action === 'accept'));

        expect(approvals[0]).toEqual(expect.objectContaining({
            type: 'mcp',
            callId: 'happy:77',
            toolName: 'change_title',
            input: { title: 'Casual Greeting' },
            serverName: 'happy',
        }));
        expect(requests).toEqual(expect.arrayContaining([
            expect.objectContaining({
                id: 77,
                result: {
                    action: 'accept',
                    content: {},
                    _meta: null,
                },
            }),
        ]));

        await client.disconnect();
    });

    it('cleans up pending requests when transport send rejects', async () => {
        vi.useFakeTimers();
        const sendError = new Error('send failed');
        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient();
        const send = vi.fn().mockRejectedValue(sendError);

        (client as any).connection = {
            open: vi.fn(),
            send,
            onMessage: vi.fn(),
            onError: vi.fn(),
            onClose: vi.fn(),
            close: vi.fn(),
        };

        await expect((client as any).request('thread/start', {})).rejects.toThrow('send failed');
        expect(send).toHaveBeenCalledTimes(1);
        expect((client as any).pending.size).toBe(0);

        await vi.advanceTimersByTimeAsync(30_001);
        expect((client as any).pending.size).toBe(0);
    });

    it('rejects ws connect when the open handshake times out', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        const sockets: Array<{ destroy: () => void }> = [];
        const server = createServer((socket) => {
            sockets.push(socket);
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address() as AddressInfo;
        mockPickFreeLoopbackPort.mockResolvedValueOnce(address.port);
        const proc = Object.assign(new EventEmitter(), {
            pid: 6001,
            kill: vi.fn((signal?: NodeJS.Signals) => {
                queueMicrotask(() => proc.emit('exit', 0, signal ?? null));
                return true;
            }),
        });
        mockSpawn.mockImplementationOnce(() => proc);

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, {
            transport: 'ws',
            logFilePath: join(tmpdir(), 'codex-app-server-timeout-test.log'),
        });

        try {
            await expect(client.connect()).rejects.toThrow('Timed out opening Codex app-server ws transport after 5000ms');
        } finally {
            for (const socket of sockets) socket.destroy();
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    }, 10_000);

    it('kills the ws child process when the ws socket closes unexpectedly', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        const { proc, wss } = await createMockWsAppServer({ pid: 7001 });
        mockPickFreeLoopbackPort.mockResolvedValueOnce((wss.address() as AddressInfo).port);
        mockSpawn.mockImplementationOnce(() => proc);

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, {
            transport: 'ws',
            logFilePath: join(tmpdir(), 'codex-app-server-onclose-kill-test.log'),
        });

        await client.connect();
        expect(proc.kill).not.toHaveBeenCalled();

        await closeWsServer(wss);

        await waitFor(() => (proc.kill as ReturnType<typeof vi.fn>).mock.calls.length > 0);
        expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('surfaces a ws port-pick failure and connects after a subsequent resolved pick', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        mockPickFreeLoopbackPort.mockRejectedValueOnce(new Error('Failed to pick free loopback port after 3 attempts'));

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const firstClient = new CodexAppServerClient(undefined, {
            transport: 'ws',
            logFilePath: join(tmpdir(), 'codex-app-server-port-failure-test.log'),
        });

        await expect(firstClient.connect()).rejects.toThrow('Failed to pick free loopback port after 3 attempts');
        expect(mockSpawn).not.toHaveBeenCalled();

        await mockNextAppServer('ws', { pid: 6002 });
        const secondClient = new CodexAppServerClient(undefined, {
            transport: 'ws',
            logFilePath: join(tmpdir(), 'codex-app-server-port-success-test.log'),
        });

        await expect(secondClient.connect()).resolves.toBeUndefined();
        expect(mockPickFreeLoopbackPort).toHaveBeenCalledTimes(2);
        await secondClient.disconnect();
    });

    it('retries pick+spawn when first ws child exits with a bind error in stderr', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });

        // First spawn: child exits immediately, stderr contains a bind-error indicator.
        const failProc = Object.assign(new EventEmitter(), {
            pid: 8001,
            kill: vi.fn(),
            stderr: new (require('stream').PassThrough)(),
        });
        const failPort = 39999;
        mockPickFreeLoopbackPort.mockResolvedValueOnce(failPort);
        mockSpawn.mockImplementationOnce(() => failProc);

        // Second spawn: real ws server that handles the initialize handshake.
        const { proc: successProc, wss } = await createMockWsAppServer({ pid: 8002 });
        mockPickFreeLoopbackPort.mockResolvedValueOnce((wss.address() as AddressInfo).port);
        mockSpawn.mockImplementationOnce(() => successProc);

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, {
            transport: 'ws',
            logFilePath: join(tmpdir(), 'codex-app-server-bind-retry-test.log'),
        });

        const connectPromise = client.connect();

        // Emit bind-error on stderr then exit the first child.
        queueMicrotask(() => {
            failProc.stderr.push('error binding address: address already in use\n');
            failProc.stderr.push(null);
            queueMicrotask(() => failProc.emit('exit', 1, null));
        });

        await expect(connectPromise).resolves.toBeUndefined();
        expect(mockPickFreeLoopbackPort).toHaveBeenCalledTimes(2);
        expect(mockSpawn).toHaveBeenCalledTimes(2);
        expect(mockSpawn).toHaveBeenNthCalledWith(1,
            'codex',
            ['app-server', '--listen', `ws://127.0.0.1:${failPort}`],
            expect.objectContaining({ stdio: ['ignore', expect.any(Number), 'pipe'] }),
        );

        await client.disconnect();
    });

    it('opens the ws log file at the configuration.logsDir-derived path and closes the fd on disconnect', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });

        // Simulate how runCodex.ts derives the log path from configuration.logsDir:
        //   join(configuration.logsDir, `codex-app-server-${sessionTag}.log`)
        // where configuration.logsDir = join(HAPPY_HOME_DIR, 'logs')
        const fakeHappyHomeDir = '/fake-happy-home';
        const fakeLogsDir = join(fakeHappyHomeDir, 'logs');
        const expectedLogPath = join(fakeLogsDir, 'codex-app-server-ac12.log');
        const fakeLogFd = 42;

        mockOpenSync.mockReturnValueOnce(fakeLogFd);
        mockCloseSync.mockReturnValue(undefined);

        const { proc, wss } = await createMockWsAppServer({ pid: 9001 });
        mockPickFreeLoopbackPort.mockResolvedValueOnce((wss.address() as AddressInfo).port);
        mockSpawn.mockImplementationOnce(() => proc);

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, {
            transport: 'ws',
            logFilePath: expectedLogPath,
        });

        await client.connect();

        expect(mockOpenSync).toHaveBeenCalledWith(expectedLogPath, 'a');

        await client.disconnect();

        expect(mockCloseSync).toHaveBeenCalledWith(fakeLogFd);
    });

    it('disconnect resolves within the close-timeout window when the ws server never emits close', async () => {
        // Build a WS server that silently absorbs the close handshake but never
        // sends its own close frame back, so the socket stays half-open forever.
        const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
        activeWsServers.push(wss);
        await new Promise<void>((resolve) => wss.once('listening', resolve));
        const { port } = wss.address() as AddressInfo;

        // Prevent the server socket from completing the closing handshake.
        wss.on('connection', (socket) => {
            activeWsSockets.push(socket);
            socket.on('message', (data) => {
                const msg = JSON.parse(data.toString()) as MockRpcMessage;
                if (msg.method === 'initialize' && msg.id != null) {
                    socket.send(JSON.stringify({ id: msg.id, result: { userAgent: 'test' } }));
                }
            });
            // Intercept 'close' so the server-side socket never echoes close back.
            socket.on('close', () => { /* swallow — never re-emit to client */ });
        });

        const proc = Object.assign(new EventEmitter(), {
            pid: 9900,
            kill: vi.fn((signal?: NodeJS.Signals) => {
                queueMicrotask(() => proc.emit('exit', signal === 'SIGKILL' ? 1 : 0, signal ?? null));
                return true;
            }),
        });

        mockPickFreeLoopbackPort.mockResolvedValueOnce(port);
        mockSpawn.mockImplementationOnce(() => proc);
        mockOpenSync.mockReturnValueOnce(88);

        vi.useFakeTimers({ shouldAdvanceTime: true });

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, { transport: 'ws' });
        await client.connect();

        // Start disconnect and advance fake timers past the 2 s close-timeout
        // so the transport falls through without waiting for the server close frame.
        const disconnectPromise = client.disconnect();
        await vi.advanceTimersByTimeAsync(3_000);

        const start = Date.now();
        await disconnectPromise;
        // Should have resolved promptly once timers advanced, not hung indefinitely.
        expect(Date.now() - start).toBeLessThan(500);

        // The child process must have received SIGTERM so the WS server process is cleaned up.
        expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
    });
});
