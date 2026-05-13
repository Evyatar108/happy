import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    const rpcHandlers = new Map<string, (...args: any[]) => any>();
    let eventHandler: ((message: any) => void) | null = null;
    let killSessionHandler: (() => Promise<void>) | null = null;

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
        sendMessageConsumption: vi.fn(),
        sendAgentTreeUpdate: vi.fn(),
        sendPushEvent: vi.fn(),
        sendSessionDeath: vi.fn(),
        flush: vi.fn(async () => {}),
        close: vi.fn(async () => {}),
        getMetadata: vi.fn(() => ({})),
        rpcHandlerManager: {
            registerHandler: vi.fn((name: string, handler: (...args: any[]) => any) => {
                rpcHandlers.set(name, handler);
            }),
            unregisterHandler: vi.fn((name: string) => {
                rpcHandlers.delete(name);
            }),
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
        setEventHandler = vi.fn((handler: (message: any) => void) => {
            eventHandler = handler;
        });
        hasActiveThread = vi.fn(() => true);
        startThread = vi.fn(async () => ({ threadId: 'thread-1' }));
        sendTurnAndWait = vi.fn(async () => ({ aborted: false }));
        abortTurnWithFallback = vi.fn(async () => ({ forcedRestart: false, resumedThread: true }));
    }

    return {
        mockSession,
        MockMessageQueue2,
        MockCodexAppServerClient,
        getEventHandler: () => eventHandler,
        getRpcHandler: (name: string) => rpcHandlers.get(name),
        getKillSessionHandler: () => killSessionHandler,
        resetHandlers: () => {
            rpcHandlers.clear();
            eventHandler = null;
            killSessionHandler = null;
        },
        mockExecSync: vi.fn(() => 'codex-cli 0.120.0'),
        mockApiCreate: vi.fn(),
        mockGetOrCreateSession: vi.fn(async ({ metadata }: { metadata: any }) => ({
            id: 'session-1',
            seq: 0,
            encryptionKey: new Uint8Array(32),
            encryptionVariant: 'legacy',
            metadata,
            metadataVersion: 0,
            agentState: null,
            agentStateVersion: 0,
        })),
        mockReadSettings: vi.fn(async () => ({ machineId: 'machine-1', sandboxConfig: undefined })),
        mockNotifyDaemonSessionStarted: vi.fn(async () => ({ error: null })),
        mockStartHappyServer: vi.fn(async () => ({ url: 'http://127.0.0.1:3000/mcp', stop: vi.fn() })),
        mockRegisterKillSessionHandler: vi.fn((_rpcHandlerManager: unknown, handler: () => Promise<void>) => {
            killSessionHandler = handler;
        }),
        mockSetBackend: vi.fn(),
        mockProjectPath: vi.fn(() => '/tmp/happy'),
        mockLoggerDebug: vi.fn(),
        mockLoggerWarn: vi.fn(),
    };
});

vi.mock('node:child_process', async (importOriginal) => ({
    ...await importOriginal<typeof import('node:child_process')>(),
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
        getOrCreateSession: mocks.mockGetOrCreateSession,
        sessionSyncClient: vi.fn(() => mocks.mockSession),
    };
}

describe('runCodex agent tree RPC wiring', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.resetHandlers();
        mocks.mockApiCreate.mockResolvedValue(createApi());
        mocks.mockReadSettings.mockResolvedValue({ machineId: 'machine-1', sandboxConfig: undefined });
    });

    it('registers sessionGetAgentTree and streams reducer deltas from Codex events', async () => {
        await runCodex({ credentials: { token: 'token' } as any });

        const snapshotHandler = mocks.getRpcHandler('sessionGetAgentTree');
        const eventHandler = mocks.getEventHandler();
        expect(snapshotHandler).toBeDefined();
        expect(eventHandler).toBeDefined();

        eventHandler!({
            type: 'collab_agent_spawn_begin',
            call_id: 'call-a',
            parent_thread_id: 'root-thread',
            agent_role: 'explorer',
            nickname: 'A',
            task_message: 'inspect files',
            started_at: 10,
        });

        expect(mocks.mockSession.sendAgentTreeUpdate).toHaveBeenCalledWith({
            type: 'pending-spawn-started',
            seq: 1,
            callId: 'call-a',
            parentThreadId: 'root-thread',
            agentRole: 'explorer',
            nickname: 'A',
            taskMessage: 'inspect files',
            startedAt: 10,
        });

        eventHandler!({
            type: 'collab_agent_spawn_end',
            call_id: 'call-a',
            thread_id: 'thread-a',
        });
        eventHandler!({
            type: 'collabAgentToolCall',
            tool: 'sendInput',
            threadId: 'thread-a',
            input: 'continue',
        });

        expect(mocks.mockSession.sendAgentTreeUpdate).toHaveBeenLastCalledWith({
            type: 'node-status-changed',
            seq: 3,
            threadId: 'thread-a',
            status: 'running',
            lastTaskMessage: 'continue',
        });

        expect(await snapshotHandler!({})).toEqual({
            nodes: [{
                threadId: 'thread-a',
                agentRole: 'explorer',
                nickname: 'A',
                status: 'running',
                lastTaskMessage: 'continue',
                spawnedAt: 10,
            }],
            edges: [{ parent: 'root-thread', child: 'thread-a' }],
            seq: 3,
        });
    });

    it('unregisters sessionGetAgentTree and clears state during kill-session cleanup', async () => {
        await runCodex({ credentials: { token: 'token' } as any });

        const snapshotHandler = mocks.getRpcHandler('sessionGetAgentTree');
        const eventHandler = mocks.getEventHandler();
        eventHandler!({ type: 'collab_agent_spawn_begin', call_id: 'call-a', parent_thread_id: 'root-thread', started_at: 10 });

        const killSessionHandler = mocks.getKillSessionHandler();
        expect(killSessionHandler).toBeDefined();
        await killSessionHandler!();

        expect(mocks.mockSession.rpcHandlerManager.unregisterHandler).toHaveBeenCalledWith('sessionGetAgentTree');
        expect(await snapshotHandler!({})).toEqual({ nodes: [], edges: [], seq: 0 });
        expect(mocks.getRpcHandler('sessionGetAgentTree')).toBeUndefined();
    });
});
