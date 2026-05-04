import { beforeEach, describe, expect, it, vi } from 'vitest';
import { claudeRemote } from './claudeRemote';
import type { SDKMessage, SDKResultMessage, SDKSystemMessage } from '@/claude/sdk';

const {
    mockQuery,
    mockAwaitFileExist,
    mockClaudeCheckSession,
    mockGetProjectPath,
    mockParseSpecialCommand,
} = vi.hoisted(() => ({
    mockQuery: vi.fn(),
    mockAwaitFileExist: vi.fn(),
    mockClaudeCheckSession: vi.fn(),
    mockGetProjectPath: vi.fn(),
    mockParseSpecialCommand: vi.fn(),
}));

vi.mock('@/claude/sdk', () => ({
    AbortError: class AbortError extends Error {},
    query: mockQuery,
}));

vi.mock('./utils/claudeCheckSession', () => ({
    claudeCheckSession: mockClaudeCheckSession,
}));

vi.mock('./utils/path', () => ({
    getProjectPath: mockGetProjectPath,
}));

vi.mock('./utils/systemPrompt', () => ({
    systemPrompt: 'test-system-prompt',
}));

vi.mock('@/modules/watcher/awaitFileExist', () => ({
    awaitFileExist: mockAwaitFileExist,
}));

vi.mock('@/parsers/specialCommands', () => ({
    parseSpecialCommand: mockParseSpecialCommand,
}));

vi.mock('@/lib', () => ({
    logger: {
        debug: vi.fn(),
        debugLargeJson: vi.fn(),
    },
}));

async function* createMessageStream(messages: SDKMessage[]): AsyncIterable<SDKMessage> {
    for (const message of messages) {
        yield message;
    }
}

describe('claudeRemote SDK metadata forwarding', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAwaitFileExist.mockResolvedValue(true);
        mockClaudeCheckSession.mockReturnValue(true);
        mockGetProjectPath.mockImplementation((path: string) => path);
        mockParseSpecialCommand.mockReturnValue({ type: 'none' });
    });

    it('forwards skills, agents, plugins, outputStyle, and mcpServers from init metadata', async () => {
        const onSDKMetadata = vi.fn();
        const onMessage = vi.fn();
        const onReady = vi.fn();
        const nextMessage = vi
            .fn()
            .mockResolvedValueOnce({
                message: 'hello',
                mode: {
                    permissionMode: 'default',
                },
            })
            .mockResolvedValueOnce(null);

        const initMessage: SDKSystemMessage = {
            type: 'system',
            subtype: 'init',
            apiKeySource: 'user',
            claude_code_version: '1.0.0',
            cwd: '/tmp/project',
            session_id: 'session-123',
            tools: ['Read', 'Write'],
            slash_commands: ['compact', 'plugin:run'],
            skills: ['review', 'plan'],
            agents: ['explorer', 'worker'],
            plugins: [{ name: 'plugin', path: '/tmp/.claude/plugins/plugin' }],
            output_style: 'verbose',
            mcp_servers: [{ name: 'happy', status: 'connected' }],
            model: 'claude-sonnet-4',
            permissionMode: 'default',
            uuid: '00000000-0000-0000-0000-000000000001',
        };

        const resultMessage: SDKResultMessage = {
            type: 'result',
            subtype: 'success',
            duration_ms: 1,
            duration_api_ms: 1,
            is_error: false,
            num_turns: 1,
            result: 'done',
            stop_reason: null,
            session_id: 'session-123',
            total_cost_usd: 0,
            usage: {
                cache_creation: {
                    ephemeral_1h_input_tokens: 0,
                    ephemeral_5m_input_tokens: 0,
                },
                input_tokens: 1,
                output_tokens: 1,
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 0,
                inference_geo: 'us',
                iterations: [
                    {
                        type: 'message',
                        cache_creation: {
                            ephemeral_1h_input_tokens: 0,
                            ephemeral_5m_input_tokens: 0,
                        },
                        cache_creation_input_tokens: 0,
                        cache_read_input_tokens: 0,
                        input_tokens: 1,
                        output_tokens: 1,
                    },
                ],
                server_tool_use: {
                    web_search_requests: 0,
                    web_fetch_requests: 0,
                },
                service_tier: 'standard',
                speed: 'standard',
            },
            modelUsage: {},
            permission_denials: [],
            uuid: '00000000-0000-0000-0000-000000000002',
        };

        mockQuery.mockReturnValue(createMessageStream([
            initMessage as SDKMessage,
            resultMessage as SDKMessage,
        ]));

        await claudeRemote({
            sessionId: null,
            path: '/tmp/project',
            allowedTools: [],
            hookSettingsPath: '/tmp/settings.json',
            nextMessage,
            onReady,
            isAborted: () => false,
            onSessionFound: vi.fn(),
            onMessage,
            onSDKMetadata,
            canCallTool: async () => ({ behavior: 'allow', updatedInput: {} }),
        });

        expect(onSDKMetadata).toHaveBeenCalledWith({
            tools: ['Read', 'Write'],
            slashCommands: ['compact', 'plugin:run'],
            skills: ['review', 'plan'],
            agents: ['explorer', 'worker'],
            plugins: [{ name: 'plugin', path: '/tmp/.claude/plugins/plugin' }],
            outputStyle: 'verbose',
            mcpServers: [{ name: 'happy', status: 'connected' }],
        });
        expect(onReady).toHaveBeenCalledTimes(1);
        expect(onMessage).toHaveBeenCalledTimes(2);
    });

    it('emits /clear context boundary before resetting the Claude session id', async () => {
        const events: string[] = [];
        const nextMessage = vi.fn().mockResolvedValueOnce({
            message: '/clear',
            mode: {
                permissionMode: 'default',
            },
        });
        const onContextBoundary = vi.fn(async () => {
            events.push('boundary');
            await Promise.resolve();
        });
        const onSessionReset = vi.fn(() => {
            events.push('reset');
        });
        const onCompletionEvent = vi.fn();
        mockParseSpecialCommand.mockReturnValueOnce({ type: 'clear' });

        await claudeRemote({
            sessionId: null,
            path: '/tmp/project',
            allowedTools: [],
            hookSettingsPath: '/tmp/settings.json',
            nextMessage,
            onReady: vi.fn(),
            isAborted: () => false,
            onSessionFound: vi.fn(),
            onMessage: vi.fn(),
            onContextBoundary,
            onSessionReset,
            onCompletionEvent,
            canCallTool: async () => ({ behavior: 'allow', updatedInput: {} }),
        });

        expect(onContextBoundary).toHaveBeenCalledWith({
            kind: 'clear',
            triggeredBy: 'user',
            at: expect.any(Number),
        });
        expect(events).toEqual(['boundary', 'reset']);
        expect(onCompletionEvent).not.toHaveBeenCalled();
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('emits /compact context boundary when compaction completes', async () => {
        const nextMessage = vi
            .fn()
            .mockResolvedValueOnce({
                message: '/compact summarize older context',
                mode: {
                    permissionMode: 'default',
                },
            })
            .mockResolvedValueOnce(null);
        const onContextBoundary = vi.fn(async () => undefined);
        const onCompletionEvent = vi.fn();
        mockParseSpecialCommand.mockReturnValueOnce({
            type: 'compact',
            originalMessage: '/compact summarize older context',
            contextBoundaryKind: 'compact',
        });
        mockQuery.mockReturnValue(createMessageStream([
            {
                type: 'result',
                subtype: 'success',
                duration_ms: 1,
                duration_api_ms: 1,
                is_error: false,
                num_turns: 1,
                result: 'done',
                stop_reason: null,
                session_id: 'session-compact',
                total_cost_usd: 0,
                usage: {},
                modelUsage: {},
                permission_denials: [],
                uuid: '00000000-0000-0000-0000-000000000003',
            } as unknown as SDKMessage,
        ]));

        await claudeRemote({
            sessionId: null,
            path: '/tmp/project',
            allowedTools: [],
            hookSettingsPath: '/tmp/settings.json',
            nextMessage,
            onReady: vi.fn(),
            isAborted: () => false,
            onSessionFound: vi.fn(),
            onMessage: vi.fn(),
            onContextBoundary,
            onCompletionEvent,
            canCallTool: async () => ({ behavior: 'allow', updatedInput: {} }),
        });

        expect(onCompletionEvent).toHaveBeenCalledWith('Compaction started');
        expect(onCompletionEvent).not.toHaveBeenCalledWith('Compaction completed');
        expect(onContextBoundary).toHaveBeenCalledWith({
            kind: 'compact',
            triggeredBy: 'user',
            at: expect.any(Number),
        });
    });
});
