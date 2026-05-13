import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Metadata, PermissionMode } from '@/api/types';

const mocks = vi.hoisted(() => {
    let userMessageHandler: ((message: any) => void) | null = null;
    let agentConfigurationHandler: ((configuration: any) => void) | null = null;
    let serverMetadata: any = {};
    let sandboxEnabled = false;
    let waitHook: (() => void | Promise<void>) | null = null;
    const pushedModes: any[] = [];

    const mockSession = {
        on: vi.fn(),
        onUserMessage: vi.fn((handler: (message: any) => void) => {
            userMessageHandler = handler;
        }),
        onAgentConfiguration: vi.fn((handler: (configuration: any) => void) => {
            agentConfigurationHandler = handler;
        }),
        keepAlive: vi.fn(),
        updateMetadata: vi.fn(async (handler: (metadata: any) => any) => {
            serverMetadata = handler(serverMetadata);
        }),
        updateAgentState: vi.fn(),
        sendSessionEvent: vi.fn(),
        sendSessionProtocolMessage: vi.fn(),
        sendSessionDeath: vi.fn(),
        flush: vi.fn(async () => {}),
        close: vi.fn(async () => {}),
        getMetadata: vi.fn(() => serverMetadata),
        rpcHandlerManager: {
            registerHandler: vi.fn(),
        },
        sessionId: 'session-1',
    };

    class MockMessageQueue2 {
        constructor(readonly hashMode: (mode: any) => string) {}

        push(_message: string, mode: any) {
            pushedModes.push(mode);
        }

        async waitForMessagesAndGetAsString() {
            await waitHook?.();
            return null;
        }

        size() {
            return 0;
        }
    }

    class MockCodexAppServerClient {
        sandboxEnabled = sandboxEnabled;
        connect = vi.fn(async () => {});
        disconnect = vi.fn(async () => {});
        setApprovalHandler = vi.fn();
        setEventHandler = vi.fn();
        hasActiveThread = vi.fn(() => false);
        startThread = vi.fn(async () => ({ threadId: 'thread-1' }));
        sendTurnAndWait = vi.fn(async () => ({ aborted: false }));
        abortTurnWithFallback = vi.fn(async () => ({ forcedRestart: false, resumedThread: true }));
    }

    return {
        mockSession,
        MockCodexAppServerClient,
        MockMessageQueue2,
        mockExecSync: vi.fn(() => 'codex-cli 0.120.0'),
        mockApiCreate: vi.fn(),
        mockGetOrCreateMachine: vi.fn(async () => ({})),
        mockGetOrCreateSession: vi.fn(async ({ metadata }: { metadata: any }) => {
            serverMetadata = metadata;
            return { id: 'session-1', metadata };
        }),
        mockReadSettings: vi.fn(async () => ({ machineId: 'machine-1', sandboxConfig: undefined })),
        mockNotifyDaemonSessionStarted: vi.fn(async () => ({ error: null })),
        mockStartHappyServer: vi.fn(async () => ({ url: 'http://127.0.0.1:3000/mcp', toolNames: [], stop: vi.fn() })),
        mockRegisterKillSessionHandler: vi.fn(),
        mockSetBackend: vi.fn(),
        mockProjectPath: vi.fn(() => '/tmp/happy'),
        mockLoggerDebug: vi.fn(),
        mockLoggerWarn: vi.fn(),
        getUserMessageHandler: () => userMessageHandler,
        getAgentConfigurationHandler: () => agentConfigurationHandler,
        setUserMessageHandler: (handler: ((message: any) => void) | null) => {
            userMessageHandler = handler;
        },
        setAgentConfigurationHandler: (handler: ((configuration: any) => void) | null) => {
            agentConfigurationHandler = handler;
        },
        getServerMetadata: () => serverMetadata,
        setServerMetadata: (metadata: any) => {
            serverMetadata = metadata;
        },
        setSandboxEnabled: (enabled: boolean) => {
            sandboxEnabled = enabled;
        },
        setWaitHook: (hook: (() => void | Promise<void>) | null) => {
            waitHook = hook;
        },
        getPushedModes: () => pushedModes,
        clearPushedModes: () => {
            pushedModes.length = 0;
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

function createUserMessage(permissionMode: PermissionMode) {
    return {
        role: 'user',
        content: { type: 'text', text: 'hello' },
        meta: { permissionMode },
    };
}

async function runCodexOnce() {
    await runCodex({ credentials: { token: 'token' } as any });
}

async function runCodexOnceWithEffort() {
    await runCodex({ credentials: { token: 'token' } as any, effortLevel: 'high' });
}

describe('runCodex permission mode metadata publishing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.setUserMessageHandler(null);
        mocks.setAgentConfigurationHandler(null);
        mocks.setServerMetadata({});
        mocks.setSandboxEnabled(false);
        mocks.setWaitHook(null);
        mocks.clearPushedModes();
        mocks.mockApiCreate.mockResolvedValue(createApi());
        mocks.mockReadSettings.mockResolvedValue({ machineId: 'machine-1', sandboxConfig: undefined });
    });

    it('does not publish initially without sandbox, then publishes and dedups user picks', async () => {
        mocks.setWaitHook(async () => {
            expect(mocks.getServerMetadata().currentPermissionModeCode).toBeUndefined();
            expect(mocks.mockSession.updateMetadata).not.toHaveBeenCalled();
            mocks.getUserMessageHandler()?.(createUserMessage('read-only'));
            mocks.getUserMessageHandler()?.(createUserMessage('read-only'));
            await Promise.resolve();
        });

        await runCodexOnce();

        const metadata = mocks.mockGetOrCreateSession.mock.calls[0][0].metadata as Metadata;
        expect(metadata.currentPermissionModeCode).toBe('read-only');
        expect(mocks.mockSession.updateMetadata).toHaveBeenCalledTimes(1);
        expect(mocks.getServerMetadata().currentPermissionModeCode).toBe('read-only');
    });

    it('publishes one initial yolo mode when sandbox is enabled and dedups a redundant user pick', async () => {
        mocks.setSandboxEnabled(true);
        mocks.setWaitHook(async () => {
            mocks.getUserMessageHandler()?.(createUserMessage('yolo'));
            await Promise.resolve();
        });

        await runCodexOnce();

        expect(mocks.mockSession.updateMetadata).toHaveBeenCalledTimes(1);
        expect(mocks.getServerMetadata().currentPermissionModeCode).toBe('yolo');
        expect(mocks.getPushedModes()).toEqual([{ permissionMode: 'yolo', model: undefined }]);
    });

    it('publishes a different explicit mode once after sandbox yolo seed', async () => {
        mocks.setSandboxEnabled(true);
        mocks.setWaitHook(async () => {
            mocks.getUserMessageHandler()?.(createUserMessage('read-only'));
            await Promise.resolve();
        });

        await runCodexOnce();

        expect(mocks.mockSession.updateMetadata).toHaveBeenCalledTimes(2);
        expect(mocks.getServerMetadata().currentPermissionModeCode).toBe('read-only');
        expect(mocks.getPushedModes()).toEqual([{ permissionMode: 'read-only', model: undefined }]);
    });

    it('echoes live model and thinking configuration once for next-turn application', async () => {
        mocks.setWaitHook(async () => {
            mocks.getAgentConfigurationHandler()?.({ model: 'gpt-5.2-codex', thinkingLevel: 'high' });
            await Promise.resolve();
        });

        await runCodexOnce();

        expect(mocks.mockSession.updateMetadata).toHaveBeenCalledTimes(1);
        expect(mocks.getServerMetadata().currentModelCode).toBe('gpt-5.2-codex');
        expect(mocks.getServerMetadata().currentThoughtLevelCode).toBe('high');
    });

    it('uses CLI effort as the initial thinking level before the first user message', async () => {
        mocks.setWaitHook(async () => {
            mocks.getUserMessageHandler()?.(createUserMessage('default'));
            await Promise.resolve();
        });

        await runCodexOnceWithEffort();

        expect(mocks.getPushedModes()).toEqual([{ permissionMode: 'default', model: undefined, thinkingLevel: 'high' }]);
    });
});
