import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MessageMeta, Metadata, PermissionMode } from '@/api/types';

const mocks = vi.hoisted(() => {
    let userMessageHandler: ((message: any) => void) | null = null;
    let serverMetadata: any = {};

    const mockSession = {
        on: vi.fn(),
        onUserMessage: vi.fn((handler: (message: any) => void) => {
            userMessageHandler = handler;
        }),
        updateMetadata: vi.fn(async (handler: (metadata: any) => any) => {
            serverMetadata = handler(serverMetadata);
        }),
        updateAgentState: vi.fn((handler: (state: Record<string, unknown>) => Record<string, unknown>) => {
            handler({});
        }),
        sendSessionEvent: vi.fn(),
        sendSessionDeath: vi.fn(),
        flush: vi.fn(async () => {}),
        close: vi.fn(async () => {}),
        rpcHandlerManager: {},
    };

    return {
        mockSession,
        mockApiCreate: vi.fn(),
        mockGetOrCreateMachine: vi.fn(async () => ({})),
        mockGetOrCreateSession: vi.fn(async (opts: { metadata: any, state: any }) => {
            serverMetadata = opts.metadata;
            return { id: 'session-1', metadata: opts.metadata };
        }),
        mockReadSettings: vi.fn(async () => ({ machineId: 'machine-1', sandboxConfig: undefined })),
        mockNotifyDaemonSessionStarted: vi.fn(async () => ({ error: null })),
        mockStartHappyServer: vi.fn(async () => ({ url: 'http://127.0.0.1:3000/mcp', toolNames: [], stop: vi.fn() })),
        mockStartHookServer: vi.fn(async () => ({ port: 3845, stop: vi.fn() })),
        mockGenerateHookSettingsFile: vi.fn(() => '/tmp/happy-hooks.json'),
        mockCleanupHookSettingsFile: vi.fn(),
        mockRegisterKillSessionHandler: vi.fn(),
        mockLoop: vi.fn(async (..._args: any[]) => 0),
        mockLoggerDebug: vi.fn(),
        mockLoggerDebugLargeJson: vi.fn(),
        mockLoggerInfoDeveloper: vi.fn(),
        mockSetBackend: vi.fn(),
        mockProjectPath: vi.fn(() => '/tmp/happy'),
        mockStartOfflineReconnection: vi.fn(),
        mockClaudeLocal: vi.fn(),
        mockCreateSessionScanner: vi.fn(),
        getUserMessageHandler: () => userMessageHandler,
        setUserMessageHandler: (handler: ((message: any) => void) | null) => {
            userMessageHandler = handler;
        },
        getServerMetadata: () => serverMetadata,
        setServerMetadata: (metadata: any) => {
            serverMetadata = metadata;
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

vi.mock('@/claude/loop', () => ({
    loop: mocks.mockLoop,
}));

vi.mock('@/claude/utils/startHappyServer', () => ({
    startHappyServer: mocks.mockStartHappyServer,
}));

vi.mock('@/claude/utils/startHookServer', () => ({
    startHookServer: mocks.mockStartHookServer,
}));

vi.mock('@/claude/utils/generateHookSettings', () => ({
    generateHookSettingsFile: mocks.mockGenerateHookSettingsFile,
    cleanupHookSettingsFile: mocks.mockCleanupHookSettingsFile,
}));

vi.mock('./registerKillSessionHandler', () => ({
    registerKillSessionHandler: mocks.mockRegisterKillSessionHandler,
}));

vi.mock('@/projectPath', () => ({
    projectPath: mocks.mockProjectPath,
}));

vi.mock('@/utils/serverConnectionErrors', () => ({
    connectionState: {
        setBackend: mocks.mockSetBackend,
    },
    startOfflineReconnection: mocks.mockStartOfflineReconnection,
}));

vi.mock('@/claude/claudeLocal', () => ({
    claudeLocal: mocks.mockClaudeLocal,
}));

vi.mock('@/claude/utils/sessionScanner', () => ({
    createSessionScanner: mocks.mockCreateSessionScanner,
}));

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: mocks.mockLoggerDebug,
        debugLargeJson: mocks.mockLoggerDebugLargeJson,
        infoDeveloper: mocks.mockLoggerInfoDeveloper,
        logFilePath: '/tmp/happy.log',
    },
}));

const { runClaude } = await import('./runClaude');

class ProcessExit extends Error {
    constructor(readonly code: string | number | null | undefined) {
        super(`process.exit(${code})`);
    }
}

function createApi() {
    return {
        getOrCreateMachine: mocks.mockGetOrCreateMachine,
        getOrCreateSession: mocks.mockGetOrCreateSession,
        sessionSyncClient: vi.fn(() => mocks.mockSession),
    };
}

function createUserMessage(permissionMode?: PermissionMode) {
    return {
        role: 'user',
        content: { type: 'text', text: 'hello' },
        meta: permissionMode ? { permissionMode } : {},
    };
}

function createTextUserMessage(text: string, meta: MessageMeta = {}) {
    return {
        role: 'user',
        content: { type: 'text', text },
        meta,
    };
}

function createLocalSessionState(overrides: Partial<{
    pendingSwitch: unknown;
    deferredSwitchCompleting: boolean;
}> = {}) {
    return {
        pendingSwitch: overrides.pendingSwitch,
        deferredSwitchCompleting: overrides.deferredSwitchCompleting ?? false,
        notifyLegacyMessageBeforeQueue: vi.fn(),
        cleanup: vi.fn(),
    };
}

async function runClaudeUntilExit(permissionMode?: PermissionMode): Promise<ProcessExit> {
    try {
        await runClaude({ token: 'token' } as any, {
            permissionMode,
            startingMode: 'remote',
        });
    } catch (error) {
        if (error instanceof ProcessExit) {
            return error;
        }
        throw error;
    }
    throw new Error('runClaude returned without process.exit');
}

async function runClaudeWithStartingModeUntilExit(startingMode?: 'local' | 'remote'): Promise<ProcessExit> {
    try {
        await runClaude({ token: 'token' } as any, {
            startingMode,
        });
    } catch (error) {
        if (error instanceof ProcessExit) {
            return error;
        }
        throw error;
    }
    throw new Error('runClaude returned without process.exit');
}

describe('runClaude permission mode metadata publishing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.setUserMessageHandler(null);
        mocks.setServerMetadata({});
        mocks.mockApiCreate.mockResolvedValue(createApi());
        mocks.mockReadSettings.mockResolvedValue({ machineId: 'machine-1', sandboxConfig: undefined });
        mocks.mockLoop.mockImplementation(async () => 0);
        vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined): never => {
            throw new ProcessExit(code);
        });
    });

    it('seeds initial metadata with the effective initial permission mode', async () => {
        await runClaudeUntilExit('bypassPermissions');

        expect(mocks.mockGetOrCreateSession).toHaveBeenCalledTimes(1);
        const metadata = mocks.mockGetOrCreateSession.mock.calls[0][0].metadata as Metadata;
        expect(metadata.currentPermissionModeCode).toBe('bypassPermissions');
        expect(mocks.mockSession.updateMetadata).not.toHaveBeenCalled();
    });

    it('publishes a changed message permission mode through updateMetadata', async () => {
        mocks.mockLoop.mockImplementation(async () => {
            mocks.getUserMessageHandler()?.(createUserMessage('bypassPermissions'));
            await Promise.resolve();
            return 0;
        });

        await runClaudeUntilExit('default');

        expect(mocks.mockSession.updateMetadata).toHaveBeenCalledTimes(1);
        expect(mocks.getServerMetadata().currentPermissionModeCode).toBe('bypassPermissions');
    });

    it('does not publish when the user message keeps the current effective mode', async () => {
        mocks.mockLoop.mockImplementation(async () => {
            mocks.getUserMessageHandler()?.(createUserMessage('default'));
            await Promise.resolve();
            return 0;
        });

        await runClaudeUntilExit('default');

        expect(mocks.mockSession.updateMetadata).not.toHaveBeenCalled();
        expect(mocks.getServerMetadata().currentPermissionModeCode).toBe('default');
    });

    it.each([
        ['local', true],
        ['remote', false],
        [undefined, true],
    ] as const)('seeds controlledByUser before session creation for startingMode %s', async (startingMode, controlledByUser) => {
        await runClaudeWithStartingModeUntilExit(startingMode);

        expect(mocks.mockGetOrCreateSession).toHaveBeenCalledTimes(1);
        expect(mocks.mockGetOrCreateSession.mock.calls[0][0].state).toMatchObject({
            controlledByUser,
            pendingSwitch: null,
            turnActive: false,
        });
    });

    it.each([
        ['normal text', 'hello', false],
        ['/compact', '/compact', true],
        ['/clear', '/clear', true],
    ] as const)('runs legacy switch dispatch before queueing untagged %s messages', async (_name, text, isolate) => {
        const localSession = createLocalSessionState();
        mocks.mockLoop.mockImplementation(async (opts: any) => {
            opts.onSessionReady(localSession);
            mocks.getUserMessageHandler()?.(createTextUserMessage(text));
            await Promise.resolve();
            expect(localSession.notifyLegacyMessageBeforeQueue).toHaveBeenCalledTimes(1);
            expect(opts.messageQueue.queue).toHaveLength(1);
            expect(opts.messageQueue.queue[0]).toMatchObject({
                message: text,
                isolate,
            });
            return 0;
        });

        await runClaudeWithStartingModeUntilExit('local');
    });

    it.each([
        ['normal text', 'hello', false],
        ['/compact', '/compact', true],
        ['/clear', '/clear', true],
    ] as const)('silently queues tagged %s messages while a pending switch exists', async (_name, text, isolate) => {
        const localSession = createLocalSessionState({
            pendingSwitch: { requestedAt: 1234, messagePreview: text },
        });
        mocks.mockLoop.mockImplementation(async (opts: any) => {
            opts.onSessionReady(localSession);
            mocks.getUserMessageHandler()?.(createTextUserMessage(text, {
                capabilities: { deferredSwitch: true },
            }));
            await Promise.resolve();
            expect(localSession.notifyLegacyMessageBeforeQueue).not.toHaveBeenCalled();
            expect(opts.messageQueue.queue).toHaveLength(1);
            expect(opts.messageQueue.queue[0]).toMatchObject({
                message: text,
                isolate,
            });
            return 0;
        });

        await runClaudeWithStartingModeUntilExit('local');
    });

    it.each([
        ['normal text', 'hello'],
        ['/compact', '/compact'],
        ['/clear', '/clear'],
    ] as const)('drops tagged %s messages when no pending switch or completion window exists', async (_name, text) => {
        const localSession = createLocalSessionState();
        mocks.mockLoop.mockImplementation(async (opts: any) => {
            opts.onSessionReady(localSession);
            mocks.getUserMessageHandler()?.(createTextUserMessage(text, {
                capabilities: { deferredSwitch: true },
                model: 'must-not-stick',
            }));
            mocks.getUserMessageHandler()?.(createTextUserMessage('after-drop'));
            await Promise.resolve();
            expect(localSession.notifyLegacyMessageBeforeQueue).toHaveBeenCalledTimes(1);
            expect(opts.messageQueue.queue).toHaveLength(1);
            expect(opts.messageQueue.queue[0].message).toBe('after-drop');
            expect(opts.messageQueue.queue[0].mode.model).toBeUndefined();
            return 0;
        });

        await runClaudeWithStartingModeUntilExit('local');
    });

    it('queues and consumes a tagged message during the deferred-switch completion window', async () => {
        const localSession = createLocalSessionState({ deferredSwitchCompleting: true });
        mocks.mockLoop.mockImplementation(async (opts: any) => {
            opts.onSessionReady(localSession);
            mocks.getUserMessageHandler()?.(createTextUserMessage('hello', {
                capabilities: { deferredSwitch: true },
            }));
            await Promise.resolve();
            expect(localSession.notifyLegacyMessageBeforeQueue).not.toHaveBeenCalled();
            expect(localSession.deferredSwitchCompleting).toBe(false);
            expect(opts.messageQueue.queue).toHaveLength(1);
            expect(opts.messageQueue.queue[0].message).toBe('hello');
            return 0;
        });

        await runClaudeWithStartingModeUntilExit('local');
    });

    it.each([
        ['tagged then untagged', ['tagged', 'untagged']],
        ['untagged then tagged', ['untagged', 'tagged']],
    ] as const)('keeps multi-client deferred-switch dispatch per-message: %s', async (_name, order) => {
        const localSession = createLocalSessionState({
            pendingSwitch: { requestedAt: 1234, messagePreview: 'tagged' },
        });
        mocks.mockLoop.mockImplementation(async (opts: any) => {
            opts.onSessionReady(localSession);
            for (const kind of order) {
                mocks.getUserMessageHandler()?.(createTextUserMessage(kind, kind === 'tagged'
                    ? { capabilities: { deferredSwitch: true } }
                    : {}));
            }
            await Promise.resolve();
            expect(localSession.notifyLegacyMessageBeforeQueue).toHaveBeenCalledTimes(1);
            expect(opts.messageQueue.queue.map((item: { message: string }) => item.message)).toEqual(order);
            return 0;
        });

        await runClaudeWithStartingModeUntilExit('local');
    });
});
