import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import type { IncomingHttpHeaders } from 'node:http';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket, { WebSocketServer, type WebSocket as ServerWebSocket } from 'ws';
import type { SandboxConfig } from '@/persistence';
import type { CodexAppServerTransport } from './codexAppServerClient';
import { discoveryFilePath, lockFilePath, readDiscoveryRecord, writeDiscoveryRecord, type CodexDiscoveryRecord } from './codexAppServerDiscovery';
import packageJson from '../../package.json';

const {
    mockConfiguration,
    mockExecSync,
    mockInitializeSandbox,
    mockWrapForMcpTransport,
    mockSandboxCleanup,
    mockSpawn,
    mockPickFreeLoopbackPort,
    mockLogger,
    mockOpenSync,
    mockCloseSync,
    mockWriteDiscoveryRecord,
} = vi.hoisted(() => ({
    mockConfiguration: {
        happyHomeDir: require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'happy-codex-discovery-')),
    },
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
    mockWriteDiscoveryRecord: vi.fn(),
}));

vi.mock('@/configuration', () => ({
    configuration: mockConfiguration,
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
    const realFds = new Set<number>();
    const shouldUseRealFd = (path: unknown) =>
        typeof path === 'string' && (path.endsWith('.lock') || /codex-active-[a-f0-9]{64}\.json$/.test(path));
    return {
        ...actual,
        openSync: ((path: Parameters<typeof actual.openSync>[0], ...args: any[]) => {
            if (shouldUseRealFd(path)) {
                const fd = actual.openSync(path, ...(args as [any, any?]));
                realFds.add(fd);
                return fd;
            }
            return mockOpenSync(path, ...args);
        }) as typeof actual.openSync,
        closeSync: ((fd: number) => {
            if (realFds.delete(fd)) {
                return actual.closeSync(fd);
            }
            return mockCloseSync(fd);
        }) as typeof actual.closeSync,
    };
});

vi.mock('./codexAppServerDiscovery', async (importActual) => {
    const actual = await importActual<typeof import('./codexAppServerDiscovery')>();
    mockWriteDiscoveryRecord.mockImplementation(actual.writeDiscoveryRecord);
    return {
        ...actual,
        writeDiscoveryRecord: ((...args: Parameters<typeof actual.writeDiscoveryRecord>) => mockWriteDiscoveryRecord(...args)) as typeof actual.writeDiscoveryRecord,
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

vi.mock('../../package.json', () => ({
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
type VerifyClient = (
    info: { req: { headers: IncomingHttpHeaders } },
    done: (result: boolean, code?: number, name?: string) => void,
) => void;

type MockAppServerOptions = {
    pid?: number;
    initializeDelayMs?: number;
    onRequest?: (msg: MockRpcMessage, send: SendJson) => void;
    verifyClient?: VerifyClient;
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
        unref: vi.fn(),
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
const activeWsSockets: ServerWebSocket[] = [];

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
    const wss = new WebSocketServer({ host: '127.0.0.1', port: 0, verifyClient: opts?.verifyClient });
    activeWsServers.push(wss);
    await new Promise<void>((resolve) => wss.once('listening', resolve));
    const address = wss.address() as AddressInfo;

    const proc = Object.assign(new EventEmitter(), {
        pid: opts?.pid ?? 12345,
        unref: vi.fn(),
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
    (process.kill as typeof process.kill & { mockRestore?: () => void }).mockRestore?.();
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

function expectWsSpawnArgs(listenUrl: string) {
    return [
        'app-server',
        '--listen',
        listenUrl,
        '--ws-auth',
        'capability-token',
        '--ws-token-sha256',
        expect.stringMatching(/^[a-f0-9]{64}$/),
    ];
}

function getSpawnWsTokenSha256(spawnCallIndex: number): string {
    const args = mockSpawn.mock.calls[spawnCallIndex]?.[1] as string[] | undefined;
    const tokenArgIndex = args?.indexOf('--ws-token-sha256') ?? -1;
    if (!args || tokenArgIndex < 0) {
        throw new Error(`No --ws-token-sha256 argument in spawn call ${spawnCallIndex}`);
    }
    return args[tokenArgIndex + 1];
}

function sha256hex(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

function testDiscoveryRecord(overrides: Partial<CodexDiscoveryRecord> = {}): CodexDiscoveryRecord {
    const token = 'test-token';
    return {
        version: 1,
        pid: 98765,
        port: 43210,
        startedAt: new Date(0).toISOString(),
        happyCliVersion: '0.0.1-test',
        cwd: process.cwd(),
        capabilityToken: token,
        capabilityTokenSha256: sha256hex(token),
        transport: 'ws',
        ...overrides,
    };
}

function bearerToken(headers: IncomingHttpHeaders): string {
    const value = headers.authorization;
    if (typeof value !== 'string' || !value.startsWith('Bearer ')) {
        throw new Error(`Missing bearer Authorization header: ${String(value)}`);
    }
    return value.slice('Bearer '.length);
}

describe('CodexAppServerClient sandbox integration', () => {
    const originalRustLog = process.env.RUST_LOG;
    const originalPlatform = process.platform;

    beforeEach(() => {
        mockConfiguration.happyHomeDir = mkdtempSync(join(tmpdir(), 'happy-codex-discovery-'));
        Object.defineProperty(process, 'platform', { value: 'linux' });
        mockExecSync.mockReset();
        mockInitializeSandbox.mockReset();
        mockWrapForMcpTransport.mockReset();
        mockSandboxCleanup.mockReset();
        mockSpawn.mockReset();
        mockPickFreeLoopbackPort.mockReset();
        mockOpenSync.mockReset();
        mockCloseSync.mockReset();
        mockLogger.debug.mockClear();
        mockLogger.info.mockClear();
        mockLogger.warn.mockClear();
        mockWriteDiscoveryRecord.mockReset();
        mockWriteDiscoveryRecord.mockImplementation((path: string, record: CodexDiscoveryRecord) => {
            const fs = require('node:fs') as typeof import('node:fs');
            const pathModule = require('node:path') as typeof import('node:path');
            fs.mkdirSync(pathModule.dirname(path), { recursive: true });
            fs.writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
        });
        process.env.RUST_LOG = originalRustLog;
        mockExecSync.mockImplementation((cmd: string) => {
            if (cmd === 'codex --version') return 'codex-cli 0.107.0';
            if (cmd === 'codex app-server --help') return 'Usage: codex app-server --listen <URL> --ws-auth capability-token';
            return 'codex-cli 0.107.0';
        });
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
        const wrappedArgs = mockWrapForMcpTransport.mock.calls[0][1] as string[];
        expect(wrappedArgs).not.toContain('--ws-auth');
        expect(wrappedArgs).not.toContain('--ws-token-sha256');
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

    it('sends ws bearer auth whose token hashes to the spawn argv digest', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        const capturedHeaders: IncomingHttpHeaders[] = [];
        const { proc, wss } = await createMockWsAppServer({
            pid: 4301,
            verifyClient: (info, done) => {
                capturedHeaders.push(info.req.headers);
                done(true);
            },
        });
        const port = (wss.address() as AddressInfo).port;
        mockPickFreeLoopbackPort.mockResolvedValueOnce(port);
        mockSpawn.mockImplementationOnce(() => proc);

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, { transport: 'ws' });

        await client.connect();

        expect(capturedHeaders).toHaveLength(1);
        const token = bearerToken(capturedHeaders[0]);
        expect(capturedHeaders[0].authorization).toBe(`Bearer ${token}`);
        expect(sha256hex(token)).toBe(getSpawnWsTokenSha256(0));

        await client.disconnect();
    });

    it('writes a discovery record after successful ws initialize', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        const capturedHeaders: IncomingHttpHeaders[] = [];
        const { proc, wss } = await createMockWsAppServer({
            pid: 4311,
            verifyClient: (info, done) => {
                capturedHeaders.push(info.req.headers);
                done(true);
            },
        });
        const port = (wss.address() as AddressInfo).port;
        mockPickFreeLoopbackPort.mockResolvedValueOnce(port);
        mockSpawn.mockImplementationOnce(() => proc);

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, { transport: 'ws' });

        await client.connect();

        const record = readDiscoveryRecord(discoveryFilePath());
        expect(record).toEqual(expect.objectContaining({
            version: 1,
            pid: 4311,
            port,
            happyCliVersion: packageJson.version,
            cwd: realpathSync(process.cwd()),
            capabilityTokenSha256: getSpawnWsTokenSha256(0),
            transport: 'ws',
        }));
        expect(record?.startedAt).toEqual(expect.any(String));
        expect(record?.capabilityToken).toBe(bearerToken(capturedHeaders[0]));
        expect(sha256hex(record?.capabilityToken ?? '')).toBe(record?.capabilityTokenSha256);
        expect((client as any).wsAppServerOwner).toBe('spawned');
        expect((client as any).currentDiscovery).toEqual(record);

        await client.disconnect();
        expect(existsSync(discoveryFilePath())).toBe(false);
    });

    it('cleans up the spawned child and releases the lock when discovery write fails', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        const { proc, wss } = await createMockWsAppServer({ pid: 4312 });
        mockPickFreeLoopbackPort.mockResolvedValueOnce((wss.address() as AddressInfo).port);
        mockSpawn.mockImplementationOnce(() => proc);
        const writeError = new Error('discovery write failed');
        mockWriteDiscoveryRecord.mockRejectedValueOnce(writeError);

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const closeSpy = vi.spyOn(CodexAppServerClient.prototype as any, 'closeWsChild');
        const client = new CodexAppServerClient(undefined, { transport: 'ws' });

        await expect(client.connect()).rejects.toBe(writeError);

        expect(closeSpy).toHaveBeenCalledTimes(1);
        expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
        expect((client as any).connection).toBeNull();
        expect((client as any).wsAppServerOwner).toBeNull();
        expect((client as any).currentDiscovery).toBeNull();
        expect((client as any).connected).toBe(false);
        expect(existsSync(discoveryFilePath())).toBe(false);
        expect(existsSync(lockFilePath())).toBe(false);

        closeSpy.mockRestore();
    });

    it('reattaches to a persisted ws app-server using the recorded token', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        const requests: MockRpcMessage[] = [];
        const token = 'persisted-token';
        const { wss } = await createMockWsAppServer({
            pid: 4321,
            verifyClient: (info, done) => done(bearerToken(info.req.headers) === token),
            onRequest: (msg) => requests.push(msg),
        });
        const record = testDiscoveryRecord({
            pid: 4321,
            port: (wss.address() as AddressInfo).port,
            capabilityToken: token,
            capabilityTokenSha256: sha256hex(token),
        });
        writeDiscoveryRecord(discoveryFilePath(), record);
        let terminated = false;
        const killSpy = vi.spyOn(process, 'kill').mockImplementation(((pid: number, signal?: string | number) => {
            if (pid !== record.pid) return true;
            if (signal === 'SIGTERM') {
                terminated = true;
                return true;
            }
            if (signal === 0 && terminated) {
                const error = new Error('dead') as NodeJS.ErrnoException;
                error.code = 'ESRCH';
                throw error;
            }
            return true;
        }) as typeof process.kill);

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, { transport: 'ws' });

        await client.connect();

        expect(mockSpawn).not.toHaveBeenCalled();
        expect(requests.filter((msg) => msg.method === 'initialize')).toHaveLength(1);
        expect((client as any).wsAppServerOwner).toBe('attached');
        expect((client as any).currentDiscovery).toEqual(record);
        expect((client as any).processEpoch).toBe(1);

        await client.disconnect({ terminateAppServer: true });
        expect(killSpy).toHaveBeenCalledWith(record.pid, 'SIGTERM');
        expect(existsSync(discoveryFilePath())).toBe(false);
        killSpy.mockRestore();
    });

    it('falls through to spawn when a persisted PID is dead without sending a reattach initialize', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        const record = testDiscoveryRecord({ pid: 4322 });
        writeDiscoveryRecord(discoveryFilePath(), record);
        const killSpy = vi.spyOn(process, 'kill').mockImplementation(((pid: number, signal?: string | number) => {
            if (pid === record.pid && signal === 0) {
                const error = new Error('dead') as NodeJS.ErrnoException;
                error.code = 'ESRCH';
                throw error;
            }
            return true;
        }) as typeof process.kill);
        const spawnedRequests: MockRpcMessage[] = [];
        await mockNextAppServer('ws', { pid: 4323, onRequest: (msg) => spawnedRequests.push(msg) });

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, { transport: 'ws' });

        await client.connect();

        expect(mockSpawn).toHaveBeenCalledTimes(1);
        expect(spawnedRequests.filter((msg) => msg.method === 'initialize')).toHaveLength(1);
        expect(readDiscoveryRecord(discoveryFilePath())?.pid).toBe(4323);

        await client.disconnect();
        killSpy.mockRestore();
    });

    it('deletes probe-failed discovery records and falls through to spawn without throwing', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        const denied = await createMockWsAppServer({
            pid: 4324,
            verifyClient: (_info, done) => done(false, 401, 'Unauthorized'),
        });
        const record = testDiscoveryRecord({ pid: 4324, port: (denied.wss.address() as AddressInfo).port });
        writeDiscoveryRecord(discoveryFilePath(), record);
        const killSpy = vi.spyOn(process, 'kill').mockImplementation(((pid: number, signal?: string | number) => {
            if (pid === record.pid && signal === 0) return true;
            return true;
        }) as typeof process.kill);
        await mockNextAppServer('ws', { pid: 4325 });

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, { transport: 'ws' });

        await expect(client.connect()).resolves.toBeUndefined();

        expect(mockSpawn).toHaveBeenCalledTimes(1);
        expect(readDiscoveryRecord(discoveryFilePath())?.pid).toBe(4325);

        await client.disconnect();
        killSpy.mockRestore();
    });

    it('deletes ws-refused discovery records and falls through to spawn without throwing', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        const closedServer = createServer();
        await new Promise<void>((resolve) => closedServer.listen(0, '127.0.0.1', resolve));
        const refusedPort = (closedServer.address() as AddressInfo).port;
        await new Promise<void>((resolve) => closedServer.close(() => resolve()));
        const record = testDiscoveryRecord({ pid: 4332, port: refusedPort });
        writeDiscoveryRecord(discoveryFilePath(), record);
        const killSpy = vi.spyOn(process, 'kill').mockImplementation(((pid: number, signal?: string | number) => {
            if (pid === record.pid && signal === 0) return true;
            return true;
        }) as typeof process.kill);
        await mockNextAppServer('ws', { pid: 4333 });

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, { transport: 'ws' });

        await expect(client.connect()).resolves.toBeUndefined();

        expect(mockSpawn).toHaveBeenCalledTimes(1);
        expect(readDiscoveryRecord(discoveryFilePath())?.pid).toBe(4333);

        await client.disconnect();
        killSpy.mockRestore();
    });

    it('falls through to spawn when reattach initialize times out and terminates the old PID', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        const reattachRequests: MockRpcMessage[] = [];
        const attached = await createMockWsAppServer({
            pid: 4326,
            initializeDelayMs: 5_000,
            onRequest: (msg) => reattachRequests.push(msg),
        });
        const record = testDiscoveryRecord({ pid: 4326, port: (attached.wss.address() as AddressInfo).port });
        writeDiscoveryRecord(discoveryFilePath(), record);
        let terminated = false;
        const killSpy = vi.spyOn(process, 'kill').mockImplementation(((pid: number, signal?: string | number) => {
            if (pid !== record.pid) return true;
            if (signal === 'SIGTERM') {
                terminated = true;
                return true;
            }
            if (signal === 0 && terminated) {
                const error = new Error('dead') as NodeJS.ErrnoException;
                error.code = 'ESRCH';
                throw error;
            }
            return true;
        }) as typeof process.kill);
        const spawnedRequests: MockRpcMessage[] = [];
        await mockNextAppServer('ws', { pid: 4327, onRequest: (msg) => spawnedRequests.push(msg) });

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, { transport: 'ws' });

        await client.connect();

        expect(reattachRequests.filter((msg) => msg.method === 'initialize')).toHaveLength(1);
        expect(spawnedRequests.filter((msg) => msg.method === 'initialize')).toHaveLength(1);
        expect(killSpy).toHaveBeenCalledWith(record.pid, 'SIGTERM');
        expect(readDiscoveryRecord(discoveryFilePath())?.pid).toBe(4327);

        await client.disconnect();
        killSpy.mockRestore();
    }, 8_000);

    it('terminates alive version-mismatched records without initialize before spawning', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        const reattachRequests: MockRpcMessage[] = [];
        const attached = await createMockWsAppServer({ pid: 4328, onRequest: (msg) => reattachRequests.push(msg) });
        const record = testDiscoveryRecord({
            pid: 4328,
            port: (attached.wss.address() as AddressInfo).port,
            happyCliVersion: '0.0.0-old',
        });
        writeDiscoveryRecord(discoveryFilePath(), record);
        let terminated = false;
        const killSpy = vi.spyOn(process, 'kill').mockImplementation(((pid: number, signal?: string | number) => {
            if (pid !== record.pid) return true;
            if (signal === 'SIGTERM') {
                terminated = true;
                return true;
            }
            if (signal === 0 && terminated) {
                const error = new Error('dead') as NodeJS.ErrnoException;
                error.code = 'ESRCH';
                throw error;
            }
            return true;
        }) as typeof process.kill);
        await mockNextAppServer('ws', { pid: 4329 });

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, { transport: 'ws' });

        await client.connect();

        expect(reattachRequests.filter((msg) => msg.method === 'initialize')).toHaveLength(0);
        expect(killSpy).toHaveBeenCalledWith(record.pid, 'SIGTERM');
        expect(readDiscoveryRecord(discoveryFilePath())?.pid).toBe(4329);

        await client.disconnect();
        killSpy.mockRestore();
    });

    it('deletes dead version-mismatched records before spawning', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        const record = testDiscoveryRecord({ pid: 4330, happyCliVersion: '0.0.0-old' });
        writeDiscoveryRecord(discoveryFilePath(), record);
        const killSpy = vi.spyOn(process, 'kill').mockImplementation(((pid: number, signal?: string | number) => {
            if (pid === record.pid && signal === 0) {
                const error = new Error('dead') as NodeJS.ErrnoException;
                error.code = 'ESRCH';
                throw error;
            }
            return true;
        }) as typeof process.kill);
        await mockNextAppServer('ws', { pid: 4331 });

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, { transport: 'ws' });

        await client.connect();

        expect(mockSpawn).toHaveBeenCalledTimes(1);
        expect(readDiscoveryRecord(discoveryFilePath())?.pid).toBe(4331);

        await client.disconnect();
        killSpy.mockRestore();
    });

    it('rejects ws auth failure immediately without retrying the spawn loop', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        const capturedHeaders: IncomingHttpHeaders[] = [];
        const { proc, wss } = await createMockWsAppServer({
            pid: 4302,
            verifyClient: (info, done) => {
                capturedHeaders.push(info.req.headers);
                done(false, 401, 'Unauthorized');
            },
        });
        mockPickFreeLoopbackPort.mockResolvedValueOnce((wss.address() as AddressInfo).port);
        mockSpawn.mockImplementationOnce(() => proc);

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, { transport: 'ws' });

        await expect(client.connect()).rejects.toThrow(/Codex app-server ws auth failed \(HTTP 401\)/);
        expect(capturedHeaders).toHaveLength(1);
        expect(mockSpawn).toHaveBeenCalledTimes(1);
        expect(mockPickFreeLoopbackPort).toHaveBeenCalledTimes(1);
    });

    it('falls back to stdio once when default ws transport lacks auth support', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        mockExecSync.mockImplementation((cmd: string) => {
            if (cmd === 'codex --version') return 'codex-cli 0.107.0';
            if (cmd === 'codex app-server --help') return 'Usage: codex app-server --listen <URL>';
            return 'codex-cli 0.107.0';
        });
        await mockNextAppServer('stdio', { pid: 4101 });
        await mockNextAppServer('stdio', { pid: 4102 });

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, { transport: 'ws', transportSource: 'default' });

        await client.connect();
        await client.disconnect();
        await client.connect();

        expect(mockExecSync).toHaveBeenCalledWith('codex app-server --help', {
            encoding: 'utf8',
            windowsHide: true,
            timeout: 3000,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        expect(mockExecSync.mock.calls.filter(([cmd]) => cmd === 'codex app-server --help')).toHaveLength(1);
        expect(mockSpawn).toHaveBeenCalledTimes(2);
        expect(mockSpawn).toHaveBeenNthCalledWith(1,
            'codex',
            ['app-server', '--listen', 'stdio://'],
            expect.any(Object),
        );
        expect(mockLogger.warn).toHaveBeenCalledTimes(1);
        expect(mockLogger.warn).toHaveBeenCalledWith('[CodexAppServer] Installed codex lacks --ws-auth; falling back to stdio transport. Upgrade codex to enable ws transport.');

        await client.disconnect();
    });

    it('fails closed for explicit ws transport when codex lacks auth support', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        mockExecSync.mockImplementation((cmd: string) => {
            if (cmd === 'codex --version') return 'codex-cli 0.107.0';
            if (cmd === 'codex app-server --help') return 'Usage: codex app-server --listen <URL>';
            return 'codex-cli 0.107.0';
        });

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, { transport: 'ws', transportSource: 'explicit' });

        await expect(client.connect()).rejects.toThrow(/Installed codex lacks --ws-auth.*--codex-transport=ws.*upgrade codex.*omit --codex-transport=ws.*stdio fallback/i);
        expect(mockSpawn).not.toHaveBeenCalled();
        expect(mockPickFreeLoopbackPort).not.toHaveBeenCalled();
    });

    it('does not probe ws auth for explicit stdio transport', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        mockExecSync.mockImplementation((cmd: string) => {
            if (cmd === 'codex --version') return 'codex-cli 0.107.0';
            if (cmd === 'codex app-server --help') throw new Error('should not probe');
            return 'codex-cli 0.107.0';
        });
        await mockNextAppServer('stdio', { pid: 4201 });

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, { transport: 'stdio', transportSource: 'explicit' });

        await expect(client.connect()).resolves.toBeUndefined();
        expect(mockExecSync.mock.calls.some(([cmd]) => cmd === 'codex app-server --help')).toBe(false);
        expect(mockSpawn).toHaveBeenCalledWith(
            'codex',
            ['app-server', '--listen', 'stdio://'],
            expect.any(Object),
        );

        await client.disconnect();
    });

    it('rejects ws connect when the app-server exits during handshake', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        const proc = Object.assign(new EventEmitter(), {
            pid: 5001,
            kill: vi.fn(),
            unref: vi.fn(),
        });
        mockSpawn.mockImplementation(() => {
            queueMicrotask(() => proc.emit('exit', 1, null));
            return proc;
        });

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, {
            transport: 'ws',
            logFilePath: join(tmpdir(), 'codex-app-server-test.log'),
        });

        await expect(client.connect()).rejects.toThrow('Codex app-server exited during ws handshake');
        expect(mockSpawn).toHaveBeenCalledWith(
            'codex',
            expectWsSpawnArgs('ws://127.0.0.1:30123'),
            expect.objectContaining({ detached: true, stdio: ['ignore', expect.any(Number), expect.any(Number)] }),
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

    it('regenerates ws auth token hashes across reconnects', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        await mockNextAppServer('ws', { pid: 4401 });
        await mockNextAppServer('ws', { pid: 4402 });

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, { transport: 'ws' });

        await client.connect();
        await client.disconnect();
        await client.connect();

        expect(mockSpawn).toHaveBeenCalledTimes(2);
        const firstHash = getSpawnWsTokenSha256(0);
        const secondHash = getSpawnWsTokenSha256(1);
        expect(firstHash).toMatch(/^[a-f0-9]{64}$/);
        expect(secondHash).toMatch(/^[a-f0-9]{64}$/);
        expect(secondHash).not.toBe(firstHash);

        await client.disconnect();
    });

    it('does not leak raw ws auth tokens through spawn argv, env, or logger output', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        const capturedHeaders: IncomingHttpHeaders[] = [];
        for (const pid of [4501, 4502]) {
            const { proc, wss } = await createMockWsAppServer({
                pid,
                verifyClient: (info, done) => {
                    capturedHeaders.push(info.req.headers);
                    done(true);
                },
            });
            mockPickFreeLoopbackPort.mockResolvedValueOnce((wss.address() as AddressInfo).port);
            mockSpawn.mockImplementationOnce(() => proc);
        }

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, { transport: 'ws' });

        await client.connect();
        await client.disconnect();
        await client.connect();

        expect(capturedHeaders).toHaveLength(2);
        const tokens = capturedHeaders.map(bearerToken);
        expect(tokens[1]).not.toBe(tokens[0]);

        const spawnSurface = mockSpawn.mock.calls.map(([, args, options]) => ({ args, env: options?.env }));
        const loggerSurface = [mockLogger.debug, mockLogger.info, mockLogger.warn]
            .flatMap((fn) => fn.mock.calls);
        for (const token of tokens) {
            expect(JSON.stringify(spawnSurface)).not.toContain(token);
            expect(JSON.stringify(loggerSurface)).not.toContain(token);
            for (const [, args] of mockSpawn.mock.calls) {
                expect(args[2]).not.toContain(token);
            }
        }

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

    it('ignores stale completion from an interrupted turn while the next turn is starting', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        const events: Array<Record<string, unknown>> = [];
        await mockNextAppServer('stdio', {
            pid: 4601,
            onRequest: (msg, send) => {
                if (msg.method === 'thread/start' && msg.id != null) {
                    setTimeout(() => {
                        send({
                            id: msg.id,
                            result: {
                                thread: { id: 'thread-stale-1', path: '/tmp/thread-stale-1' },
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
                    send({
                        method: 'turn/completed',
                        params: { threadId: 'thread-stale-1', turn: { id: 'old-turn', status: 'completed', error: null } },
                    });
                    setTimeout(() => {
                        send({ id: msg.id, result: { turn: { id: 'new-turn', items: [], status: 'inProgress', error: null } } });
                        send({
                            method: 'item/completed',
                            params: {
                                threadId: 'thread-stale-1',
                                turnId: 'new-turn',
                                item: { type: 'agentMessage', id: 'msg-new', text: 'new turn finished', phase: 'final_answer' },
                            },
                        });
                    }, 0);
                }
            },
        });

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, { transport: 'stdio' });
        client.setEventHandler((msg) => events.push(msg as Record<string, unknown>));

        await client.connect();
        await client.startThread({ model: 'gpt-test', approvalPolicy: 'never', sandbox: 'danger-full-access' });
        (client as any)._turnId = 'old-turn';
        (client as any).pendingInterrupt = Promise.resolve();

        await expect(client.sendTurnAndWait('continue after interrupt')).resolves.toEqual({ aborted: false });
        expect(events).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'task_complete', turn_id: 'old-turn' }),
            expect.objectContaining({ type: 'agent_message', message: 'new turn finished' }),
        ]));

        await client.disconnect();
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
            unref: vi.fn(),
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

    it('spawns ws app-server detached and unrefs the child handle', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        const { proc, wss } = await createMockWsAppServer({ pid: 7101 });
        mockPickFreeLoopbackPort.mockResolvedValueOnce((wss.address() as AddressInfo).port);
        mockSpawn.mockImplementationOnce(() => proc);

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, { transport: 'ws' });

        await client.connect();

        expect(mockSpawn).toHaveBeenCalledWith(
            'codex',
            expectWsSpawnArgs(`ws://127.0.0.1:${(wss.address() as AddressInfo).port}`),
            expect.objectContaining({
                detached: true,
                stdio: ['ignore', expect.any(Number), expect.any(Number)],
                windowsHide: true,
            }),
        );
        expect(proc.unref).toHaveBeenCalledTimes(1);

        await client.disconnect();
    });

    it('preserves a detached ws app-server without retaining the child handle', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        const { proc, wss } = await createMockWsAppServer({ pid: 7201 });
        const port = (wss.address() as AddressInfo).port;
        mockPickFreeLoopbackPort.mockResolvedValueOnce(port);
        mockSpawn.mockImplementationOnce(() => proc);

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, { transport: 'ws' });

        await client.connect();
        await (client as any).disconnectInternal({ terminateAppServer: false });

        expect((client as any).wsChild).toBeNull();
        expect((process as any)._getActiveHandles?.().includes(proc)).toBe(false);
        expect(proc.kill).not.toHaveBeenCalled();

        const freshSocket = new WebSocket(`ws://127.0.0.1:${port}`);
        activeWsSockets.push(freshSocket as unknown as ServerWebSocket);
        await new Promise<void>((resolve, reject) => {
            freshSocket.once('open', () => resolve());
            freshSocket.once('error', reject);
        });
        await expect(Promise.race([
            new Promise((resolve) => setTimeout(resolve, 0)),
            new Promise((_, reject) => setTimeout(() => reject(new Error('event loop did not drain')), 1_500)),
        ])).resolves.toBeUndefined();
    });

    it('does not double-kill on intentional disconnect close, but does kill on unsolicited close', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        const first = await createMockWsAppServer({ pid: 7301 });
        mockPickFreeLoopbackPort.mockResolvedValueOnce((first.wss.address() as AddressInfo).port);
        mockSpawn.mockImplementationOnce(() => first.proc);

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const intentionalClient = new CodexAppServerClient(undefined, { transport: 'ws' });
        await intentionalClient.connect();
        await intentionalClient.disconnect();

        expect(first.proc.kill).toHaveBeenCalledTimes(1);
        expect(first.proc.kill).toHaveBeenCalledWith('SIGTERM');

        const second = await createMockWsAppServer({ pid: 7302 });
        mockPickFreeLoopbackPort.mockResolvedValueOnce((second.wss.address() as AddressInfo).port);
        mockSpawn.mockImplementationOnce(() => second.proc);
        const unsolicitedClient = new CodexAppServerClient(undefined, { transport: 'ws' });
        await unsolicitedClient.connect();

        await closeWsServer(second.wss);

        await waitFor(() => (second.proc.kill as ReturnType<typeof vi.fn>).mock.calls.length > 0);
        expect(second.proc.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('clears attached discovery state before unsolicited close cleanup', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        const { proc, wss } = await createMockWsAppServer({ pid: 7401 });
        mockPickFreeLoopbackPort.mockResolvedValueOnce((wss.address() as AddressInfo).port);
        mockSpawn.mockImplementationOnce(() => proc);
        const record = testDiscoveryRecord({ pid: 7401, port: (wss.address() as AddressInfo).port });
        writeDiscoveryRecord(discoveryFilePath(), record);
        const killSpy = vi.spyOn(process, 'kill').mockImplementation(((pid: number, signal?: string | number) => {
            if (pid === record.pid && signal === 0) return true;
            if (pid === record.pid) throw new Error('should not kill orphaned attached PID');
            return true;
        }) as typeof process.kill);

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, { transport: 'ws' });
        await client.connect();
        (client as any).wsAppServerOwner = 'attached';
        (client as any).currentDiscovery = record;
        (client as any).wsChild = null;

        await closeWsServer(wss);
        await waitFor(() => (client as any).currentDiscovery === null);

        expect((client as any).wsAppServerOwner).toBeNull();
        expect((client as any).currentDiscovery).toBeNull();
        await client.disconnect({ terminateAppServer: true });
        expect(killSpy).not.toHaveBeenCalledWith(record.pid, 'SIGTERM');
        killSpy.mockRestore();
    });

    it('terminates attached app-server PIDs and deletes only the matching discovery record', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        const record = testDiscoveryRecord({ pid: 7501 });
        writeDiscoveryRecord(discoveryFilePath(), record);
        let terminated = false;
        const killSpy = vi.spyOn(process, 'kill').mockImplementation(((pid: number, signal?: string | number) => {
            if (pid !== record.pid) return true;
            if (signal === 'SIGTERM') {
                terminated = true;
                return true;
            }
            if (signal === 0 && terminated) {
                const error = new Error('dead') as NodeJS.ErrnoException;
                error.code = 'ESRCH';
                throw error;
            }
            return true;
        }) as typeof process.kill);

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, { transport: 'ws' });
        (client as any).connected = true;
        (client as any).connection = { close: vi.fn().mockResolvedValue(undefined) };
        (client as any).wsAppServerOwner = 'attached';
        (client as any).currentDiscovery = record;

        await client.disconnect({ terminateAppServer: true });

        expect(killSpy).toHaveBeenCalledWith(record.pid, 'SIGTERM');
        expect(existsSync(discoveryFilePath())).toBe(false);
        killSpy.mockRestore();
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

    it('retries pick+spawn when first ws child exits with a bind error in the log file', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });

        // First spawn: child exits immediately, log file contains a bind-error indicator.
        const failProc = Object.assign(new EventEmitter(), {
            pid: 8001,
            kill: vi.fn(),
            unref: vi.fn(),
        });
        const failPort = 39999;
        const bindRetryLogPath = join(tmpdir(), 'codex-app-server-bind-retry-test.log');
        mockPickFreeLoopbackPort.mockResolvedValueOnce(failPort);
        mockSpawn.mockImplementationOnce(() => {
            queueMicrotask(() => {
                writeFileSync(bindRetryLogPath, 'error binding address: address already in use\n');
                failProc.emit('exit', 1, null);
            });
            return failProc;
        });

        // Second spawn: real ws server that handles the initialize handshake.
        const { proc: successProc, wss } = await createMockWsAppServer({ pid: 8002 });
        mockPickFreeLoopbackPort.mockResolvedValueOnce((wss.address() as AddressInfo).port);
        mockSpawn.mockImplementationOnce(() => successProc);

        const { CodexAppServerClient } = await import('./codexAppServerClient');
        const client = new CodexAppServerClient(undefined, {
            transport: 'ws',
            logFilePath: bindRetryLogPath,
        });

        await expect(client.connect()).resolves.toBeUndefined();
        expect(mockPickFreeLoopbackPort).toHaveBeenCalledTimes(2);
        expect(mockSpawn).toHaveBeenCalledTimes(2);
        expect(mockSpawn).toHaveBeenNthCalledWith(1,
            'codex',
            expectWsSpawnArgs(`ws://127.0.0.1:${failPort}`),
            expect.objectContaining({ detached: true, stdio: ['ignore', expect.any(Number), expect.any(Number)] }),
        );
        const firstHash = getSpawnWsTokenSha256(0);
        const secondHash = getSpawnWsTokenSha256(1);
        expect(firstHash).toMatch(/^[a-f0-9]{64}$/);
        expect(secondHash).toMatch(/^[a-f0-9]{64}$/);
        expect(secondHash).not.toBe(firstHash);

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

        expect(mockOpenSync).toHaveBeenCalledWith(expectedLogPath, 'a', 0o600);

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
            unref: vi.fn(),
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
