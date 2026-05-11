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

        close() {}
    }

    return {
        mockSession,
        MockMessageQueue2,
        mockApiCreate: vi.fn(),
        mockGetOrCreateMachine: vi.fn(async () => ({})),
        mockGetOrCreateSession: vi.fn(async ({ metadata }: { metadata: any }) => ({
            id: 'session-1',
            encryptionKey: new Uint8Array(32),
            encryptionVariant: 'legacy' as const,
            seq: 0,
            metadataVersion: 0,
            agentStateVersion: 0,
            metadata,
        })),
        mockReadSettings: vi.fn(async () => ({ machineId: 'machine-1', sandboxConfig: undefined })),
        mockNotifyDaemonSessionStarted: vi.fn(async () => ({ error: null })),
        mockSetupOfflineReconnection: vi.fn(),
        mockRegisterKillSessionHandler: vi.fn(),
        mockSetBackend: vi.fn(),
        mockLoggerDebug: vi.fn(),
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

vi.mock('@/utils/setupOfflineReconnection', () => ({
    setupOfflineReconnection: mocks.mockSetupOfflineReconnection,
}));

vi.mock('@/claude/registerKillSessionHandler', () => ({
    registerKillSessionHandler: mocks.mockRegisterKillSessionHandler,
}));

vi.mock('@/utils/serverConnectionErrors', () => ({
    connectionState: {
        setBackend: mocks.mockSetBackend,
    },
}));

vi.mock('@/utils/MessageQueue2', () => ({
    MessageQueue2: mocks.MockMessageQueue2,
}));

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: mocks.mockLoggerDebug,
        warn: vi.fn(),
        getLogPath: vi.fn(() => '/tmp/happy.log'),
    },
}));

vi.mock('@/utils/publishPermissionMode', () => ({
    publishAgentConfigurationMetadataIfChanged: vi.fn(async () => {}),
}));

vi.mock('./OpenClawBackend', () => ({
    OpenClawBackend: class {
        onMessage = vi.fn();
        offMessage = vi.fn();
        startSession = vi.fn(async () => ({ sessionId: 'openclaw-session-1' }));
        sendPrompt = vi.fn(async () => {});
        cancel = vi.fn(async () => {});
        dispose = vi.fn(async () => {});
        retryConnect = vi.fn();
    },
}));

const { runOpenClaw } = await import('./runOpenClaw');

function createApi() {
    return {
        getOrCreateMachine: mocks.mockGetOrCreateMachine,
        getOrCreateSession: mocks.mockGetOrCreateSession,
    };
}

describe('runOpenClaw attachment ignore behavior', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.setUserMessageHandler(null);
        mocks.clearPushedMessages();
        mocks.mockApiCreate.mockResolvedValue(createApi());
        mocks.mockReadSettings.mockResolvedValue({ machineId: 'machine-1', sandboxConfig: undefined });
        mocks.mockSetupOfflineReconnection.mockImplementation(() => ({
            session: mocks.mockSession,
            reconnectionHandle: { cancel: vi.fn() },
        }));
    });

    it('accepts attachment-bearing user messages while keeping OpenClaw queueing text-only', async () => {
        const runPromise = runOpenClaw({
            credentials: { token: 'token' } as any,
            gatewayUrl: 'ws://127.0.0.1:9999',
        });

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
