import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HAPPY_FORKED_FROM_SESSION_ID } from '@/utils/envNames';

const mocks = vi.hoisted(() => {
    const mockSession = {
        on: vi.fn(),
        onUserMessage: vi.fn(),
        onAgentConfiguration: vi.fn(),
        keepAlive: vi.fn(),
        updateMetadata: vi.fn(async () => {}),
        updateAgentState: vi.fn(),
        sendSessionEvent: vi.fn(),
        sendSessionProtocolMessage: vi.fn(),
        sendContextBoundary: vi.fn(async () => {}),
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
        mockResumeExistingThread: vi.fn(async () => ({ threadId: 'new-codex-thread', model: 'gpt-5.4' })),
    };
});

vi.mock('node:child_process', () => ({
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

vi.mock('./resumeExistingThread', () => ({
    resumeExistingThread: mocks.mockResumeExistingThread,
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

async function runResume() {
    await runCodex({
        credentials: { token: 'token' } as any,
        resumeThreadId: 'parent-codex-thread',
    });
}

describe('runCodex fork boundary emission', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env[HAPPY_FORKED_FROM_SESSION_ID];
        mocks.mockApiCreate.mockResolvedValue(createApi());
        mocks.mockReadSettings.mockResolvedValue({ machineId: 'machine-1', sandboxConfig: undefined });
    });

    it('emits a session-fork-resume boundary after resuming when fork env is set', async () => {
        process.env[HAPPY_FORKED_FROM_SESSION_ID] = 'parent-happy-session';

        await runResume();

        expect(mocks.mockResumeExistingThread).toHaveBeenCalledWith(expect.objectContaining({
            threadId: 'parent-codex-thread',
        }));
        expect(mocks.mockSession.sendContextBoundary).toHaveBeenCalledWith({
            kind: 'session-fork-resume',
            triggeredBy: 'user',
            at: expect.any(Number),
            forkedFromSid: 'parent-happy-session',
        });
        expect(mocks.mockResumeExistingThread.mock.invocationCallOrder[0])
            .toBeLessThan(mocks.mockSession.sendContextBoundary.mock.invocationCallOrder[0]);
    });

    it('does not emit a fork boundary when fork env is unset', async () => {
        await runResume();

        expect(mocks.mockResumeExistingThread).toHaveBeenCalled();
        expect(mocks.mockSession.sendContextBoundary).not.toHaveBeenCalled();
    });
});
