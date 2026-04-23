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
});
