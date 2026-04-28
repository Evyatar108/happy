import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Metadata } from '@/api/types';
import { mergeSDKInitMetadata } from './utils/sdkMetadata';

const {
    mockClaudeLocal,
    mockCreateSessionScanner,
    mockQueryInitMetadata,
    mockLoggerDebug,
} = vi.hoisted(() => ({
    mockClaudeLocal: vi.fn(),
    mockCreateSessionScanner: vi.fn(),
    mockQueryInitMetadata: vi.fn(),
    mockLoggerDebug: vi.fn(),
}));

vi.mock('./claudeLocal', () => ({
    claudeLocal: mockClaudeLocal,
    ExitCodeError: class ExitCodeError extends Error {
        readonly exitCode: number;

        constructor(exitCode: number) {
            super(`Process exited with code: ${exitCode}`);
            this.exitCode = exitCode;
        }
    },
}));

vi.mock('./utils/sessionScanner', () => ({
    createSessionScanner: mockCreateSessionScanner,
}));

vi.mock('./utils/queryInitMetadata', () => ({
    queryInitMetadata: mockQueryInitMetadata,
}));

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: mockLoggerDebug,
    },
}));

describe('claudeLocalLauncher shadow metadata wiring', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mockCreateSessionScanner.mockResolvedValue({
            onNewSession: vi.fn(),
            cleanup: vi.fn().mockResolvedValue(undefined),
        });
    });

    function createSessionMock() {
        const sendClaudeSessionMessage = vi.fn();
        const updateMetadata = vi.fn();
        const session: Record<string, any> = {
            sessionId: null,
            path: '/workspace/project',
            client: {
                sendClaudeSessionMessage,
                closeClaudeSessionTurn: vi.fn(),
                sendSessionEvent: vi.fn(),
                updateMetadata,
                rpcHandlerManager: {
                    registerHandler: vi.fn(),
                },
            },
            queue: {
                setOnMessage: vi.fn(),
                size: vi.fn(() => 0),
                reset: vi.fn(),
            },
            pendingSwitch: undefined,
            deferredSwitchCompleting: false,
            switchFired: false,
            turnActive: false,
            setPendingSwitch: vi.fn((pendingSwitch: any) => {
                session.pendingSwitch = pendingSwitch;
            }),
            setTurnActive: vi.fn((turnActive: boolean) => {
                session.turnActive = turnActive;
            }),
            clearDeferredSwitchState: vi.fn(() => {
                session.pendingSwitch = undefined;
                session.deferredSwitchCompleting = false;
                session.turnActive = false;
            }),
            setNotifyLegacyMessageBeforeQueue: vi.fn(),
            addTurnCompleteCallback: vi.fn(),
            removeTurnCompleteCallback: vi.fn(),
            onSessionFound: vi.fn(),
            onThinkingChange: vi.fn(),
            claudeEnvVars: { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
            claudeArgs: ['--debug'],
            mcpServers: { happy: { command: 'happy-mcp' } },
            allowedTools: ['Read', 'Write'],
            hookSettingsPath: '/tmp/hook-settings.json',
            sandboxConfig: null,
            addSessionFoundCallback: vi.fn(),
            removeSessionFoundCallback: vi.fn(),
            consumeOneTimeFlags: vi.fn(),
        };

        return {
            sendClaudeSessionMessage,
            updateMetadata,
            session,
        };
    }

    function createSessionMockWithHandlers() {
        const created = createSessionMock();
        const handlers = new Map<string, (params?: unknown) => unknown>();

        created.session.client.rpcHandlerManager.registerHandler.mockImplementation(
            (name: string, handler: (params?: unknown) => unknown) => {
                handlers.set(name, handler);
            },
        );

        return { ...created, handlers };
    }

    it('queries init metadata once per unique session and merges non-empty results into session metadata', async () => {
        const startingMetadata: Metadata = {
            path: '/workspace/project',
            host: 'devbox',
            homeDir: '/home/dev',
            happyHomeDir: '/home/dev/.happy',
            happyLibDir: '/home/dev/.happy/lib',
            happyToolsDir: '/home/dev/.happy/tools',
            flavor: 'claude',
            slashCommands: ['existing:command'],
        };
        let currentMetadata = startingMetadata;
        const updateMetadata = vi.fn((updater: (metadata: Metadata) => Metadata) => {
            currentMetadata = updater(currentMetadata);
        });
        const addSessionFoundCallback = vi.fn();
        const removeSessionFoundCallback = vi.fn();
        const onSessionFound = vi.fn();

        const session = {
            sessionId: null,
            path: '/workspace/project',
            client: {
                sendClaudeSessionMessage: vi.fn(),
                closeClaudeSessionTurn: vi.fn(),
                sendSessionEvent: vi.fn(),
                updateMetadata,
                rpcHandlerManager: {
                    registerHandler: vi.fn(),
                },
            },
            queue: {
                setOnMessage: vi.fn(),
                size: vi.fn(() => 0),
                reset: vi.fn(),
            },
            pendingSwitch: undefined,
            turnActive: false,
            setPendingSwitch: vi.fn(function (this: any, pendingSwitch: any) {
                session.pendingSwitch = pendingSwitch;
            }),
            setNotifyLegacyMessageBeforeQueue: vi.fn(),
            clearDeferredSwitchState: vi.fn(),
            addTurnCompleteCallback: vi.fn(),
            removeTurnCompleteCallback: vi.fn(),
            onSessionFound,
            onThinkingChange: vi.fn(),
            claudeEnvVars: { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
            claudeArgs: ['--debug'],
            mcpServers: { happy: { command: 'happy-mcp' } },
            allowedTools: ['Read', 'Write'],
            hookSettingsPath: '/tmp/hook-settings.json',
            sandboxConfig: null,
            addSessionFoundCallback,
            removeSessionFoundCallback,
            consumeOneTimeFlags: vi.fn(),
        };

        mockQueryInitMetadata
            .mockResolvedValueOnce({
                slashCommands: ['plugin:run'],
                plugins: [{ name: 'plugin', path: '/plugins/plugin' }],
            })
            .mockResolvedValueOnce({});

        mockClaudeLocal.mockImplementation(async (opts: { onSessionFound: (sessionId: string) => void }) => {
            opts.onSessionFound('session-1');
            opts.onSessionFound('session-1');
            opts.onSessionFound('session-2');
        });

        const { claudeLocalLauncher } = await import('./claudeLocalLauncher');

        const result = await claudeLocalLauncher(session as any);
        await Promise.resolve();
        await Promise.resolve();

        expect(result).toEqual({ type: 'exit', code: 0 });
        expect(onSessionFound).toHaveBeenNthCalledWith(1, 'session-1');
        expect(onSessionFound).toHaveBeenNthCalledWith(2, 'session-1');
        expect(onSessionFound).toHaveBeenNthCalledWith(3, 'session-2');
        expect(mockQueryInitMetadata).toHaveBeenCalledTimes(2);
        expect(mockQueryInitMetadata).toHaveBeenNthCalledWith(1, {
            cwd: '/workspace/project',
            settingsPath: '/tmp/hook-settings.json',
            mcpServers: { happy: { command: 'happy-mcp' } },
            allowedTools: ['Read', 'Write'],
            claudeEnvVars: { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
            abort: expect.any(AbortSignal),
        });
        expect(mockQueryInitMetadata).toHaveBeenNthCalledWith(2, {
            cwd: '/workspace/project',
            settingsPath: '/tmp/hook-settings.json',
            mcpServers: { happy: { command: 'happy-mcp' } },
            allowedTools: ['Read', 'Write'],
            claudeEnvVars: { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
            abort: expect.any(AbortSignal),
        });
        expect(updateMetadata).toHaveBeenCalledTimes(1);
        expect(currentMetadata).toEqual(mergeSDKInitMetadata(startingMetadata, {
            slashCommands: ['plugin:run'],
            plugins: [{ name: 'plugin', path: '/plugins/plugin' }],
        }));
    });

    it('forwards summary messages from the local session scanner', async () => {
        let scannerOnMessage: ((message: unknown) => void) | null = null;
        mockCreateSessionScanner.mockImplementation(async (opts: { onMessage: (message: unknown) => void }) => {
            scannerOnMessage = opts.onMessage;
            return {
                onNewSession: vi.fn(),
                cleanup: vi.fn().mockResolvedValue(undefined),
            };
        });
        mockClaudeLocal.mockImplementation(async () => {
            scannerOnMessage?.({
                type: 'summary',
                summary: 'Local Summary',
                leafUuid: 'summary-leaf',
            });
        });

        const { session, sendClaudeSessionMessage } = createSessionMock();
        const { claudeLocalLauncher } = await import('./claudeLocalLauncher');

        const result = await claudeLocalLauncher(session as any);

        expect(result).toEqual({ type: 'exit', code: 0 });
        expect(sendClaudeSessionMessage).toHaveBeenCalledTimes(1);
        expect(sendClaudeSessionMessage).toHaveBeenCalledWith({
            type: 'summary',
            summary: 'Local Summary',
            leafUuid: 'summary-leaf',
        });
    });

    it('forwards scanner-normalized title summaries for custom-title and ai-title events', async () => {
        let scannerOnMessage: ((message: unknown) => void) | null = null;
        mockCreateSessionScanner.mockImplementation(async (opts: { onMessage: (message: unknown) => void }) => {
            scannerOnMessage = opts.onMessage;
            return {
                onNewSession: vi.fn(),
                cleanup: vi.fn().mockResolvedValue(undefined),
            };
        });
        mockClaudeLocal.mockImplementation(async () => {
            scannerOnMessage?.({
                type: 'summary',
                summary: 'Renamed From Claude',
                leafUuid: 'custom-title:session-1',
            });
            scannerOnMessage?.({
                type: 'summary',
                summary: 'Suggested By Claude',
                leafUuid: 'ai-title:session-1',
            });
        });

        const { session, sendClaudeSessionMessage } = createSessionMock();
        const { claudeLocalLauncher } = await import('./claudeLocalLauncher');

        const result = await claudeLocalLauncher(session as any);

        expect(result).toEqual({ type: 'exit', code: 0 });
        expect(sendClaudeSessionMessage).toHaveBeenCalledTimes(2);
        expect(sendClaudeSessionMessage).toHaveBeenNthCalledWith(1, {
            type: 'summary',
            summary: 'Renamed From Claude',
            leafUuid: 'custom-title:session-1',
        });
        expect(sendClaudeSessionMessage).toHaveBeenNthCalledWith(2, {
            type: 'summary',
            summary: 'Suggested By Claude',
            leafUuid: 'ai-title:session-1',
        });
    });

    it('request-switch now delegates to the existing local switch path', async () => {
        const handlers = new Map<string, (params?: unknown) => unknown>();
        const closeClaudeSessionTurn = vi.fn();
        const setPendingSwitch = vi.fn((pendingSwitch: any) => {
            session.pendingSwitch = pendingSwitch;
        });
        const session = {
            sessionId: null,
            path: '/workspace/project',
            client: {
                sendClaudeSessionMessage: vi.fn(),
                closeClaudeSessionTurn,
                sendSessionEvent: vi.fn(),
                updateMetadata: vi.fn(),
                rpcHandlerManager: {
                    registerHandler: vi.fn((name: string, handler: (params?: unknown) => unknown) => {
                        handlers.set(name, handler);
                    }),
                },
            },
            queue: {
                setOnMessage: vi.fn(),
                size: vi.fn(() => 0),
                reset: vi.fn(),
            },
            pendingSwitch: undefined,
            turnActive: true,
            setPendingSwitch,
            setNotifyLegacyMessageBeforeQueue: vi.fn(),
            clearDeferredSwitchState: vi.fn(),
            addTurnCompleteCallback: vi.fn(),
            removeTurnCompleteCallback: vi.fn(),
            onSessionFound: vi.fn(),
            onThinkingChange: vi.fn(),
            claudeEnvVars: {},
            claudeArgs: undefined,
            mcpServers: {},
            allowedTools: [],
            hookSettingsPath: '/tmp/hook-settings.json',
            sandboxConfig: null,
            addSessionFoundCallback: vi.fn(),
            removeSessionFoundCallback: vi.fn(),
            consumeOneTimeFlags: vi.fn(),
        };

        mockClaudeLocal.mockImplementation(async (opts: { abort: AbortSignal }) => {
            await new Promise<void>((resolve) => opts.abort.addEventListener('abort', () => resolve(), { once: true }));
        });

        const { claudeLocalLauncher } = await import('./claudeLocalLauncher');
        const launcher = claudeLocalLauncher(session as any);
        await vi.waitFor(() => expect(handlers.has('request-switch')).toBe(true));

        const response = await handlers.get('request-switch')!({ mode: 'now' });
        const result = await launcher;

        expect(response).toEqual({ deferred: false });
        expect(closeClaudeSessionTurn).toHaveBeenCalledWith('cancelled');
        expect(result).toEqual({ type: 'switch' });
    });

    it('request-switch when-idle records pending switch only while a turn is active', async () => {
        const handlers = new Map<string, (params?: unknown) => unknown>();
        const closeClaudeSessionTurn = vi.fn();
        const setPendingSwitch = vi.fn((pendingSwitch: any) => {
            session.pendingSwitch = pendingSwitch;
        });
        const session = {
            sessionId: null,
            path: '/workspace/project',
            client: {
                sendClaudeSessionMessage: vi.fn(),
                closeClaudeSessionTurn,
                sendSessionEvent: vi.fn(),
                updateMetadata: vi.fn(),
                rpcHandlerManager: {
                    registerHandler: vi.fn((name: string, handler: (params?: unknown) => unknown) => {
                        handlers.set(name, handler);
                    }),
                },
            },
            queue: {
                setOnMessage: vi.fn(),
                size: vi.fn(() => 0),
                reset: vi.fn(),
            },
            pendingSwitch: undefined,
            turnActive: true,
            setPendingSwitch,
            setNotifyLegacyMessageBeforeQueue: vi.fn(),
            clearDeferredSwitchState: vi.fn(),
            addTurnCompleteCallback: vi.fn(),
            removeTurnCompleteCallback: vi.fn(),
            onSessionFound: vi.fn(),
            onThinkingChange: vi.fn(),
            claudeEnvVars: {},
            claudeArgs: undefined,
            mcpServers: {},
            allowedTools: [],
            hookSettingsPath: '/tmp/hook-settings.json',
            sandboxConfig: null,
            addSessionFoundCallback: vi.fn(),
            removeSessionFoundCallback: vi.fn(),
            consumeOneTimeFlags: vi.fn(),
        };

        mockClaudeLocal.mockImplementation(async (opts: { abort: AbortSignal }) => {
            await new Promise<void>((resolve) => opts.abort.addEventListener('abort', () => resolve(), { once: true }));
        });

        const { claudeLocalLauncher } = await import('./claudeLocalLauncher');
        const launcher = claudeLocalLauncher(session as any);
        await vi.waitFor(() => expect(handlers.has('request-switch')).toBe(true));

        const response = await handlers.get('request-switch')!({ mode: 'when-idle', messagePreview: 'hello' });

        expect(response).toEqual({ deferred: true });
        expect(session.pendingSwitch).toEqual({ requestedAt: expect.any(Number), messagePreview: 'hello' });
        expect(closeClaudeSessionTurn).not.toHaveBeenCalled();

        await handlers.get('switch')!();
        await expect(launcher).resolves.toEqual({ type: 'switch' });
    });

    it('request-switch when-idle switches immediately with completed status when no turn is active', async () => {
        const handlers = new Map<string, (params?: unknown) => unknown>();
        const closeClaudeSessionTurn = vi.fn();
        const setPendingSwitch = vi.fn((pendingSwitch: any) => {
            session.pendingSwitch = pendingSwitch;
        });
        const session = {
            sessionId: null,
            path: '/workspace/project',
            client: {
                sendClaudeSessionMessage: vi.fn(),
                closeClaudeSessionTurn,
                sendSessionEvent: vi.fn(),
                updateMetadata: vi.fn(),
                rpcHandlerManager: {
                    registerHandler: vi.fn((name: string, handler: (params?: unknown) => unknown) => {
                        handlers.set(name, handler);
                    }),
                },
            },
            queue: {
                setOnMessage: vi.fn(),
                size: vi.fn(() => 0),
                reset: vi.fn(),
            },
            pendingSwitch: undefined,
            turnActive: false,
            setPendingSwitch,
            setNotifyLegacyMessageBeforeQueue: vi.fn(),
            clearDeferredSwitchState: vi.fn(),
            addTurnCompleteCallback: vi.fn(),
            removeTurnCompleteCallback: vi.fn(),
            onSessionFound: vi.fn(),
            onThinkingChange: vi.fn(),
            claudeEnvVars: {},
            claudeArgs: undefined,
            mcpServers: {},
            allowedTools: [],
            hookSettingsPath: '/tmp/hook-settings.json',
            sandboxConfig: null,
            addSessionFoundCallback: vi.fn(),
            removeSessionFoundCallback: vi.fn(),
            consumeOneTimeFlags: vi.fn(),
        };

        mockClaudeLocal.mockImplementation(async (opts: { abort: AbortSignal }) => {
            await new Promise<void>((resolve) => opts.abort.addEventListener('abort', () => resolve(), { once: true }));
        });

        const { claudeLocalLauncher } = await import('./claudeLocalLauncher');
        const launcher = claudeLocalLauncher(session as any);
        await vi.waitFor(() => expect(handlers.has('request-switch')).toBe(true));

        const response = await handlers.get('request-switch')!({ mode: 'when-idle' });
        const result = await launcher;

        expect(response).toEqual({ deferred: false });
        expect(session.pendingSwitch).toBeUndefined();
        expect(closeClaudeSessionTurn).toHaveBeenCalledWith('completed');
        expect(result).toEqual({ type: 'switch' });
    });

    it('rejects a second when-idle request while pending switch is already set', async () => {
        const handlers = new Map<string, (params?: unknown) => unknown>();
        const initialPendingSwitch = { requestedAt: 1234, messagePreview: 'first' };
        const setPendingSwitch = vi.fn((pendingSwitch: any) => {
            session.pendingSwitch = pendingSwitch;
        });
        const session = {
            sessionId: null,
            path: '/workspace/project',
            client: {
                sendClaudeSessionMessage: vi.fn(),
                closeClaudeSessionTurn: vi.fn(),
                sendSessionEvent: vi.fn(),
                updateMetadata: vi.fn(),
                rpcHandlerManager: {
                    registerHandler: vi.fn((name: string, handler: (params?: unknown) => unknown) => {
                        handlers.set(name, handler);
                    }),
                },
            },
            queue: {
                setOnMessage: vi.fn(),
                size: vi.fn(() => 0),
                reset: vi.fn(),
            },
            pendingSwitch: initialPendingSwitch,
            turnActive: true,
            setPendingSwitch,
            setNotifyLegacyMessageBeforeQueue: vi.fn(),
            clearDeferredSwitchState: vi.fn(),
            addTurnCompleteCallback: vi.fn(),
            removeTurnCompleteCallback: vi.fn(),
            onSessionFound: vi.fn(),
            onThinkingChange: vi.fn(),
            claudeEnvVars: {},
            claudeArgs: undefined,
            mcpServers: {},
            allowedTools: [],
            hookSettingsPath: '/tmp/hook-settings.json',
            sandboxConfig: null,
            addSessionFoundCallback: vi.fn(),
            removeSessionFoundCallback: vi.fn(),
            consumeOneTimeFlags: vi.fn(),
        };

        mockClaudeLocal.mockImplementation(async (opts: { abort: AbortSignal }) => {
            await new Promise<void>((resolve) => opts.abort.addEventListener('abort', () => resolve(), { once: true }));
        });

        const { claudeLocalLauncher } = await import('./claudeLocalLauncher');
        const launcher = claudeLocalLauncher(session as any);
        await vi.waitFor(() => expect(handlers.has('request-switch')).toBe(true));

        await expect(handlers.get('request-switch')!({ mode: 'when-idle' })).rejects.toThrow('already-pending');

        expect(session.pendingSwitch).toBe(initialPendingSwitch);
        expect(setPendingSwitch).not.toHaveBeenCalled();

        await handlers.get('switch')!();
        await expect(launcher).resolves.toEqual({ type: 'switch' });
    });

    it('cancel-pending-switch clears pending state and resets the queue when a deferred switch is pending', async () => {
        const { session, handlers } = createSessionMockWithHandlers();
        session.pendingSwitch = { requestedAt: 1234, messagePreview: 'hello' };
        session.turnActive = true;
        mockClaudeLocal.mockImplementation(async (opts: { abort: AbortSignal }) => {
            await new Promise<void>((resolve) => opts.abort.addEventListener('abort', () => resolve(), { once: true }));
        });

        const { claudeLocalLauncher } = await import('./claudeLocalLauncher');
        const launcher = claudeLocalLauncher(session as any);
        await vi.waitFor(() => expect(handlers.has('cancel-pending-switch')).toBe(true));

        await handlers.get('cancel-pending-switch')!();

        expect(session.pendingSwitch).toBeUndefined();
        expect(session.setPendingSwitch).toHaveBeenCalledWith(undefined);
        expect(session.queue.reset).toHaveBeenCalledTimes(1);
        expect(session.client.closeClaudeSessionTurn).not.toHaveBeenCalled();

        await handlers.get('switch')!();
        await expect(launcher).resolves.toEqual({ type: 'switch' });
    });

    it('cancel-pending-switch is a pure no-op while truly idle', async () => {
        const { session, handlers } = createSessionMockWithHandlers();
        session.pendingSwitch = undefined;
        session.deferredSwitchCompleting = false;
        mockClaudeLocal.mockImplementation(async (opts: { abort: AbortSignal }) => {
            await new Promise<void>((resolve) => opts.abort.addEventListener('abort', () => resolve(), { once: true }));
        });

        const { claudeLocalLauncher } = await import('./claudeLocalLauncher');
        const launcher = claudeLocalLauncher(session as any);
        await vi.waitFor(() => expect(handlers.has('cancel-pending-switch')).toBe(true));

        await handlers.get('cancel-pending-switch')!();

        expect(session.setPendingSwitch).not.toHaveBeenCalled();
        expect(session.queue.reset).not.toHaveBeenCalled();
        expect(session.deferredSwitchCompleting).toBe(false);

        await handlers.get('switch')!();
        await expect(launcher).resolves.toEqual({ type: 'switch' });
    });

    it('cancel-pending-switch is a pure no-op during the deferred completion window', async () => {
        const { session, handlers } = createSessionMockWithHandlers();
        session.pendingSwitch = undefined;
        mockClaudeLocal.mockImplementation(async (opts: { abort: AbortSignal }) => {
            await new Promise<void>((resolve) => opts.abort.addEventListener('abort', () => resolve(), { once: true }));
        });

        const { claudeLocalLauncher } = await import('./claudeLocalLauncher');
        const launcher = claudeLocalLauncher(session as any);
        await vi.waitFor(() => expect(handlers.has('cancel-pending-switch')).toBe(true));
        session.deferredSwitchCompleting = true;

        await handlers.get('cancel-pending-switch')!();

        expect(session.setPendingSwitch).not.toHaveBeenCalled();
        expect(session.queue.reset).not.toHaveBeenCalled();
        expect(session.deferredSwitchCompleting).toBe(true);

        await handlers.get('switch')!();
        await expect(launcher).resolves.toEqual({ type: 'switch' });
    });

    it('registers the legacy message hook to use the local switch path', async () => {
        let legacyHook: (() => void) | null = null;
        const closeClaudeSessionTurn = vi.fn();
        const session = {
            sessionId: null,
            path: '/workspace/project',
            client: {
                sendClaudeSessionMessage: vi.fn(),
                closeClaudeSessionTurn,
                sendSessionEvent: vi.fn(),
                updateMetadata: vi.fn(),
                rpcHandlerManager: {
                    registerHandler: vi.fn(),
                },
            },
            queue: {
                setOnMessage: vi.fn(),
                size: vi.fn(() => 0),
                reset: vi.fn(),
            },
            pendingSwitch: undefined,
            turnActive: true,
            setPendingSwitch: vi.fn(),
            setNotifyLegacyMessageBeforeQueue: vi.fn((handler: (() => void) | null) => {
                legacyHook = handler;
            }),
            clearDeferredSwitchState: vi.fn(),
            addTurnCompleteCallback: vi.fn(),
            removeTurnCompleteCallback: vi.fn(),
            onSessionFound: vi.fn(),
            onThinkingChange: vi.fn(),
            claudeEnvVars: {},
            claudeArgs: undefined,
            mcpServers: {},
            allowedTools: [],
            hookSettingsPath: '/tmp/hook-settings.json',
            sandboxConfig: null,
            addSessionFoundCallback: vi.fn(),
            removeSessionFoundCallback: vi.fn(),
            consumeOneTimeFlags: vi.fn(),
        };

        mockClaudeLocal.mockImplementation(async (opts: { abort: AbortSignal }) => {
            await vi.waitFor(() => expect(legacyHook).not.toBeNull());
            const aborted = new Promise<void>((resolve) => opts.abort.addEventListener('abort', () => resolve(), { once: true }));
            legacyHook!();
            await aborted;
        });

        const { claudeLocalLauncher } = await import('./claudeLocalLauncher');

        await expect(claudeLocalLauncher(session as any)).resolves.toEqual({ type: 'switch' });
        expect(closeClaudeSessionTurn).toHaveBeenCalledWith('cancelled');
    });

    it('disables queue-level message switching while local mode is active', async () => {
        const { session } = createSessionMock();
        mockClaudeLocal.mockResolvedValue(undefined);

        const { claudeLocalLauncher } = await import('./claudeLocalLauncher');

        await expect(claudeLocalLauncher(session as any)).resolves.toEqual({ type: 'exit', code: 0 });
        expect(session.queue.setOnMessage).toHaveBeenCalledWith(null);
    });

    it('switches once with completed status when the Stop hook completes a pending deferred switch', async () => {
        let turnCompleteCallback: (() => Promise<void>) | null = null;
        const { session } = createSessionMock();
        session.pendingSwitch = { requestedAt: 1234, messagePreview: 'hello' };
        session.turnActive = true;
        session.addTurnCompleteCallback.mockImplementation((callback: () => Promise<void>) => {
            turnCompleteCallback = callback;
        });
        mockClaudeLocal.mockImplementation(async (opts: { abort: AbortSignal }) => {
            await vi.waitFor(() => expect(turnCompleteCallback).not.toBeNull());
            const aborted = new Promise<void>((resolve) => opts.abort.addEventListener('abort', () => resolve(), { once: true }));
            void turnCompleteCallback!();
            void turnCompleteCallback!();
            await aborted;
        });

        const { claudeLocalLauncher } = await import('./claudeLocalLauncher');

        await expect(claudeLocalLauncher(session as any)).resolves.toEqual({ type: 'switch' });
        expect(session.client.closeClaudeSessionTurn).toHaveBeenCalledTimes(1);
        expect(session.client.closeClaudeSessionTurn).toHaveBeenCalledWith('completed');
        expect(session.pendingSwitch).toBeUndefined();
        expect(session.deferredSwitchCompleting).toBe(true);
        expect(session.removeTurnCompleteCallback).toHaveBeenCalledWith(turnCompleteCallback);
        expect(session.clearDeferredSwitchState).not.toHaveBeenCalled();
    });

    it('collapses cancel, switch, and Stop-hook races around a pending deferred switch', async () => {
        let turnCompleteCallback: (() => Promise<void>) | null = null;
        const { session, handlers } = createSessionMockWithHandlers();
        session.pendingSwitch = { requestedAt: 1234, messagePreview: 'hello' };
        session.turnActive = true;
        session.addTurnCompleteCallback.mockImplementation((callback: () => Promise<void>) => {
            turnCompleteCallback = callback;
        });
        mockClaudeLocal.mockImplementation(async (opts: { abort: AbortSignal }) => {
            await vi.waitFor(() => expect(turnCompleteCallback).not.toBeNull());
            await new Promise<void>((resolve) => opts.abort.addEventListener('abort', () => resolve(), { once: true }));
        });

        const { claudeLocalLauncher } = await import('./claudeLocalLauncher');
        const launcher = claudeLocalLauncher(session as any);
        await vi.waitFor(() => expect(handlers.has('cancel-pending-switch')).toBe(true));

        const stopSwitch = turnCompleteCallback!();
        await handlers.get('cancel-pending-switch')!();
        await handlers.get('switch')!();
        await stopSwitch;
        await expect(launcher).resolves.toEqual({ type: 'switch' });

        expect(session.client.closeClaudeSessionTurn).toHaveBeenCalledTimes(1);
        expect(session.client.closeClaudeSessionTurn).toHaveBeenCalledWith('completed');
        expect(session.queue.reset).not.toHaveBeenCalled();
        expect(session.pendingSwitch).toBeUndefined();
        expect(session.deferredSwitchCompleting).toBe(true);
        expect(session.switchFired).toBe(true);
    });

    it('clears deferred-switch turn state and subscriptions on non-Stop exits', async () => {
        let turnCompleteCallback: (() => Promise<void>) | null = null;
        const { session } = createSessionMock();
        session.pendingSwitch = { requestedAt: 1234, messagePreview: 'hello' };
        session.turnActive = true;
        session.addTurnCompleteCallback.mockImplementation((callback: () => Promise<void>) => {
            turnCompleteCallback = callback;
        });
        mockClaudeLocal.mockResolvedValue(undefined);

        const { claudeLocalLauncher } = await import('./claudeLocalLauncher');

        await expect(claudeLocalLauncher(session as any)).resolves.toEqual({ type: 'exit', code: 0 });
        expect(session.removeTurnCompleteCallback).toHaveBeenCalledWith(turnCompleteCallback);
        expect(session.clearDeferredSwitchState).toHaveBeenCalledTimes(1);
        expect(session.pendingSwitch).toBeUndefined();
        expect(session.turnActive).toBe(false);
    });
});
