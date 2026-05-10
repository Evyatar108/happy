import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    let userMessageHandler: ((message: any) => void) | null = null;
    const pushedMessages: Array<{ text: string; mode: any }> = [];

    const mockSession = {
        onUserMessage: vi.fn((handler: (message: any) => void) => {
            userMessageHandler = handler;
        }),
        keepAlive: vi.fn(),
        sendSessionProtocolMessage: vi.fn(),
        sendSessionEvent: vi.fn(),
        updateMetadata: vi.fn(),
        sendSessionDeath: vi.fn(),
        flush: vi.fn(async () => {}),
        close: vi.fn(async () => {}),
        updateAgentState: vi.fn((handler: (state: Record<string, unknown>) => Record<string, unknown>) => {
            handler({});
        }),
        rpcHandlerManager: {
            registerHandler: vi.fn(),
        },
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
        mockReadSettings: vi.fn(async () => ({ machineId: 'machine-1', sandboxConfig: undefined })),
        mockApiCreate: vi.fn(),
        mockGetOrCreateMachine: vi.fn(async () => ({})),
        mockGetOrCreateSession: vi.fn(async () => ({
            id: 'session-1',
            encryptionKey: new Uint8Array(32),
            encryptionVariant: 'legacy' as const,
            seq: 0,
            metadataVersion: 0,
            agentStateVersion: 0,
        })),
        mockSetupOfflineReconnection: vi.fn(),
        mockNotifyDaemonSessionStarted: vi.fn(async () => ({ error: null })),
        mockStartHappyServer: vi.fn(),
        mockProjectPath: vi.fn(() => '/tmp/happy'),
        mockSetBackend: vi.fn(),
        mockKillRegister: vi.fn(),
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

vi.mock('@/persistence', async () => {
    const actual = await vi.importActual<typeof import('@/persistence')>('@/persistence');
    return {
        ...actual,
        readSettings: mocks.mockReadSettings,
    };
});

vi.mock('@/api/api', () => ({
    ApiClient: {
        create: mocks.mockApiCreate,
    },
}));

vi.mock('@/daemon/run', () => ({
    initialMachineMetadata: { host: 'host', platform: 'darwin', happyCliVersion: 'test', homeDir: '/tmp', happyHomeDir: '/tmp/.happy', happyLibDir: '/tmp/happy' },
}));

vi.mock('@/utils/setupOfflineReconnection', () => ({
    setupOfflineReconnection: mocks.mockSetupOfflineReconnection,
}));

vi.mock('@/daemon/controlClient', () => ({
    notifyDaemonSessionStarted: mocks.mockNotifyDaemonSessionStarted,
}));

vi.mock('@/claude/registerKillSessionHandler', () => ({
    registerKillSessionHandler: mocks.mockKillRegister,
}));

vi.mock('@/claude/utils/startHappyServer', () => ({
    startHappyServer: mocks.mockStartHappyServer,
}));

vi.mock('@/projectPath', () => ({
    projectPath: mocks.mockProjectPath,
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
    },
}));

vi.mock('./AcpBackend', () => ({
    AcpBackend: class MockAcpBackend {
        onMessage(handler: (message: any) => void) {}
        offMessage(handler: (message: any) => void) {}
        async startSession() {
            return { sessionId: 'acp-session-1' };
        }
        async sendPrompt() {}
        async setSessionConfigOption() { return true; }
        async setSessionMode() { return true; }
        async setSessionModel() { return true; }
        async cancel() {}
        async dispose() {}
    },
}));

import { runAcp } from './runAcp';

describe('runAcp attachment ignore behavior', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.setUserMessageHandler(null);
        mocks.clearPushedMessages();

        mocks.mockApiCreate.mockResolvedValue({
            getOrCreateMachine: mocks.mockGetOrCreateMachine,
            getOrCreateSession: mocks.mockGetOrCreateSession,
        });
        mocks.mockSetupOfflineReconnection.mockImplementation(() => ({
            session: mocks.mockSession,
            reconnectionHandle: { cancel: vi.fn() },
            isOffline: false,
        }));
        mocks.mockStartHappyServer.mockResolvedValue({
            url: 'http://127.0.0.1:9876',
            stop: vi.fn(),
        });
    });

    it('accepts attachment-bearing user messages while keeping ACP queueing text-only', async () => {
        const runPromise = runAcp({
            credentials: { token: 'token', encryption: { type: 'legacy', secret: new Uint8Array(32) } } as any,
            agentName: 'opencode',
            command: 'opencode',
            args: ['--acp'],
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
