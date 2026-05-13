import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    const queuedBatches: any[] = [];
    let lastCodexClient: any = null;

    const mockSession = {
        on: vi.fn(),
        onUserMessage: vi.fn(),
        onAgentConfiguration: vi.fn(),
        keepAlive: vi.fn(),
        updateMetadata: vi.fn(async () => {}),
        updateAgentState: vi.fn(),
        sendSessionEvent: vi.fn(),
        sendSessionProtocolMessage: vi.fn(),
        sendMessageConsumption: vi.fn(),
        sendSessionDeath: vi.fn(),
        flush: vi.fn(async () => {}),
        close: vi.fn(async () => {}),
        getMetadata: vi.fn(() => ({})),
        rpcHandlerManager: {
            registerHandler: vi.fn(),
        },
        sessionId: 'session-1',
    };

    class MockMessageQueue2 {
        async waitForMessagesAndGetAsString() {
            return queuedBatches.shift() ?? null;
        }

        size() {
            return 0;
        }
    }

    class MockCodexAppServerClient {
        constructor() {
            lastCodexClient = this;
        }

        sandboxEnabled = false;
        connect = vi.fn(async () => {});
        disconnect = vi.fn(async () => {});
        setApprovalHandler = vi.fn();
        setEventHandler = vi.fn();
        hasActiveThread = vi.fn(() => false);
        startThread = vi.fn(async () => ({ threadId: 'thread-1' }));
        resumeThread = vi.fn(async () => ({ threadId: 'thread-2', model: 'gpt-test' }));
        sendTurnAndWait = vi.fn(async () => ({ aborted: false }));
        abortTurnWithFallback = vi.fn(async () => ({ forcedRestart: false, resumedThread: true }));
    }

    return {
        mockSession,
        MockMessageQueue2,
        MockCodexAppServerClient,
        getLastCodexClient: () => lastCodexClient,
        mockExecSync: vi.fn(() => 'codex-cli 0.120.0'),
        mockApiCreate: vi.fn(),
        mockGetOrCreateMachine: vi.fn(async () => ({})),
        mockGetOrCreateSession: vi.fn(async ({ metadata }: { metadata: any }) => ({
            id: 'session-1',
            metadata,
        })),
        mockReadSettings: vi.fn(async () => ({ machineId: 'machine-1', sandboxConfig: undefined })),
        mockNotifyDaemonSessionStarted: vi.fn(async () => ({ error: null })),
        mockStartHappyServer: vi.fn(async () => ({ url: 'http://127.0.0.1:3000/mcp', stop: vi.fn() })),
        mockRegisterKillSessionHandler: vi.fn(),
        mockSetBackend: vi.fn(),
        mockProjectPath: vi.fn(() => '/tmp/happy'),
        mockLoggerDebug: vi.fn(),
        mockLoggerWarn: vi.fn(),
        queueBatch: (batch: any) => queuedBatches.push(batch),
        clearQueuedBatches: () => { queuedBatches.length = 0; },
    };
});

vi.mock('node:child_process', async (importOriginal) => ({
    ...(await importOriginal<typeof import('node:child_process')>()),
    execSync: mocks.mockExecSync,
}));

vi.mock('@/api/api', () => ({
    ApiClient: {
        create: mocks.mockApiCreate,
    },
}));

vi.mock('@/persistence', async () => {
    const actual = await vi.importActual<typeof import('@/persistence')>('@/persistence');
    return {
        ...actual,
        readSettings: mocks.mockReadSettings,
    };
});

vi.mock('@/daemon/controlClient', () => ({
    notifyDaemonSessionStarted: mocks.mockNotifyDaemonSessionStarted,
}));

vi.mock('@/daemon/run', () => ({
    initialMachineMetadata: { host: 'host', platform: 'test', happyCliVersion: 'test' },
}));

vi.mock('@/claude/utils/startHappyServer', () => ({
    startHappyServer: mocks.mockStartHappyServer,
}));

vi.mock('@/claude/registerKillSessionHandler', () => ({
    registerKillSessionHandler: mocks.mockRegisterKillSessionHandler,
}));

vi.mock('@/projectPath', () => ({
    projectPath: mocks.mockProjectPath,
}));

vi.mock('@/utils/serverConnectionErrors', () => ({
    connectionState: {
        setBackend: mocks.mockSetBackend,
    },
    startOfflineReconnection: vi.fn(),
}));

vi.mock('@/utils/MessageQueue2', () => ({
    MessageQueue2: mocks.MockMessageQueue2,
}));

vi.mock('./codexAppServerClient', () => ({
    CodexAppServerClient: mocks.MockCodexAppServerClient,
}));

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: mocks.mockLoggerDebug,
        warn: mocks.mockLoggerWarn,
        getLogPath: vi.fn(() => '/tmp/happy.log'),
    },
}));

const { runCodex } = await import('./runCodex');

const originalCwd = process.cwd();
let tempDir: string | null = null;

function createApi() {
    return {
        getOrCreateMachine: mocks.mockGetOrCreateMachine,
        getOrCreateSession: mocks.mockGetOrCreateSession,
        sessionSyncClient: vi.fn(() => mocks.mockSession),
    };
}

function enqueueUserBatch() {
    mocks.queueBatch({
        message: 'hello',
        mode: { permissionMode: 'default' },
        isolate: false,
        hash: 'default-mode',
        consumedMessages: [],
    });
}

function writeMcpConfig(body: string) {
    writeFileSync(join(tempDir!, '.mcp.json'), body);
}

function writeHttpMcpConfig() {
    writeMcpConfig(JSON.stringify({
        mcpServers: {
            paper: {
                type: 'http',
                url: 'http://127.0.0.1:29979/mcp',
            },
        },
    }));
}

describe('runCodex project .mcp.json discovery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.clearQueuedBatches();
        mocks.mockApiCreate.mockResolvedValue(createApi());
        mocks.mockReadSettings.mockResolvedValue({ machineId: 'machine-1', sandboxConfig: undefined });
        tempDir = mkdtempSync(join(tmpdir(), 'happy-codex-project-mcp-'));
        process.chdir(tempDir);
        enqueueUserBatch();
    });

    afterEach(() => {
        process.chdir(originalCwd);
        if (tempDir) {
            rmSync(tempDir, { recursive: true, force: true });
            tempDir = null;
        }
    });

    it('passes valid HTTP project MCP entries to startThread with type stripped', async () => {
        writeHttpMcpConfig();

        await runCodex({ credentials: { token: 'token' } as any });

        expect(mocks.getLastCodexClient().hasActiveThread).toHaveBeenCalled();
        expect(mocks.getLastCodexClient().startThread).toHaveBeenCalledWith(expect.objectContaining({
            cwd: tempDir,
            mcpServers: {
                paper: {
                    url: 'http://127.0.0.1:29979/mcp',
                },
                happy: expect.objectContaining({
                    command: process.execPath,
                    args: expect.arrayContaining(['--url', 'http://127.0.0.1:3000/mcp']),
                }),
            },
        }));
    });

    it('passes only the Happy bridge to startThread when .mcp.json is absent', async () => {
        await runCodex({ credentials: { token: 'token' } as any });

        expect(mocks.getLastCodexClient().hasActiveThread).toHaveBeenCalled();
        const startArgs = mocks.getLastCodexClient().startThread.mock.calls[0][0];
        expect(startArgs.cwd).toBe(tempDir);
        expect(Object.keys(startArgs.mcpServers)).toEqual(['happy']);
        expect(startArgs.mcpServers.happy).toEqual(expect.objectContaining({
            command: process.execPath,
        }));
    });

    it('warns and falls back to only the Happy bridge when project MCP JSON is broken', async () => {
        writeMcpConfig('{ not valid json');

        await runCodex({ credentials: { token: 'token' } as any });

        expect(mocks.mockLoggerWarn).toHaveBeenCalledWith('[codex] .mcp.json parse failed', {
            path: join(tempDir!, '.mcp.json'),
            reason: expect.any(String),
        });
        const startArgs = mocks.getLastCodexClient().startThread.mock.calls[0][0];
        expect(Object.keys(startArgs.mcpServers)).toEqual(['happy']);
    });

    it('passes valid HTTP project MCP entries through the real resumeExistingThread forwarder', async () => {
        writeHttpMcpConfig();

        await runCodex({ credentials: { token: 'token' } as any, resumeThreadId: 'parent-thread' });

        expect(mocks.getLastCodexClient().hasActiveThread).toHaveBeenCalled();
        expect(mocks.getLastCodexClient().resumeThread).toHaveBeenCalledWith({
            threadId: 'parent-thread',
            cwd: tempDir,
            mcpServers: {
                paper: {
                    url: 'http://127.0.0.1:29979/mcp',
                },
                happy: expect.objectContaining({
                    command: process.execPath,
                    args: expect.arrayContaining(['--url', 'http://127.0.0.1:3000/mcp']),
                }),
            },
        });
    });
});
