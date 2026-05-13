import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    let userMessageHandler: ((message: any) => void) | null = null;
    const pushedMessages: Array<{ text: string; mode: any }> = [];

    const mockSession = {
        on: vi.fn(),
        onUserMessage: vi.fn((handler: (message: any) => void) => {
            userMessageHandler = handler;
        }),
        onAgentConfiguration: vi.fn(),
        keepAlive: vi.fn(),
        updateMetadata: vi.fn(async () => {}),
        updateAgentState: vi.fn(),
        sendSessionEvent: vi.fn(),
        sendSessionProtocolMessage: vi.fn(),
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
        constructor(readonly hashMode: (mode: any) => string) {}

        push(text: string, mode: any) {
            pushedMessages.push({ text, mode });
        }

        async waitForMessagesAndGetAsString() {
            return null;
        }

        size() {
            return 0;
        }
    }

    class MockCodexAppServerClient {
        sandboxEnabled = false;
        connect = vi.fn(async () => {});
        disconnect = vi.fn(async () => {});
        setApprovalHandler = vi.fn();
        setEventHandler = vi.fn();
        hasActiveThread = vi.fn(() => true);
        startThread = vi.fn(async () => ({ threadId: 'thread-1' }));
        sendTurnAndWait = vi.fn(async () => ({ aborted: false }));
        abortTurnWithFallback = vi.fn(async () => ({ forcedRestart: false, resumedThread: true }));
    }

    return {
        mockSession,
        MockMessageQueue2,
        MockCodexAppServerClient,
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
        getUserMessageHandler: () => userMessageHandler,
        setUserMessageHandler: (handler: ((message: any) => void) | null) => {
            userMessageHandler = handler;
        },
        getPushedMessages: () => pushedMessages,
        clearPushedMessages: () => {
            pushedMessages.length = 0;
        },
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

function createApi() {
    return {
        getOrCreateMachine: mocks.mockGetOrCreateMachine,
        getOrCreateSession: mocks.mockGetOrCreateSession,
        sessionSyncClient: vi.fn(() => mocks.mockSession),
    };
}

describe('runCodex attachment ignore behavior', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.setUserMessageHandler(null);
        mocks.clearPushedMessages();
        mocks.mockApiCreate.mockResolvedValue(createApi());
        mocks.mockReadSettings.mockResolvedValue({ machineId: 'machine-1', sandboxConfig: undefined });
    });

    it('accepts attachment-bearing user messages while keeping Codex queueing text-only', async () => {
        const runPromise = runCodex({ credentials: { token: 'token' } as any });

        await vi.waitFor(() => {
            expect(mocks.getUserMessageHandler()).toBeTypeOf('function');
        });

        expect(() =>
            mocks.getUserMessageHandler()!({
                role: 'user',
                content: {
                    type: 'text',
                    text: 'hello',
                    attachments: [{ type: 'image', ref: 'AAA=', mimeType: 'image/png' }],
                },
                meta: {},
            })
        ).not.toThrow();

        await runPromise;

        const pushed = mocks.getPushedMessages();
        expect(pushed).toHaveLength(1);
        expect(pushed[0].text).toBe('hello');
    });
});
