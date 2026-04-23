import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
    SDKControlInitializeResponse,
    SDKControlReloadPluginsResponse,
    SDKMessage,
    SDKSystemMessage,
} from '@/claude/sdk';

const {
    mockQuery,
    mockLoggerDebug,
    mockLoggerWarn,
} = vi.hoisted(() => ({
    mockQuery: vi.fn(),
    mockLoggerDebug: vi.fn(),
    mockLoggerWarn: vi.fn(),
}));

vi.mock('@/claude/sdk', () => ({
    query: mockQuery,
}));

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: mockLoggerDebug,
        warn: mockLoggerWarn,
    },
}));

type MockQuery = AsyncIterable<SDKMessage> & {
    close: ReturnType<typeof vi.fn>;
    initializationResult: ReturnType<typeof vi.fn>;
    reloadPlugins: ReturnType<typeof vi.fn>;
};

function createInitMessage(
    overrides: Partial<SDKSystemMessage> = {},
): SDKSystemMessage {
    return {
        type: 'system',
        subtype: 'init',
        apiKeySource: 'user',
        claude_code_version: '1.0.0',
        cwd: '/tmp/project',
        session_id: 'session-123',
        tools: ['Read'],
        slash_commands: ['compact'],
        skills: ['review'],
        agents: ['stream-agent'],
        plugins: [{ name: 'stream-plugin', path: '/tmp/stream-plugin' }],
        output_style: 'stream-style',
        mcp_servers: [{ name: 'stream-mcp', status: 'connected' }],
        model: 'claude-sonnet-4',
        permissionMode: 'default',
        uuid: '00000000-0000-0000-0000-000000000010',
        ...overrides,
    };
}

function createMockQuery(messages: SDKMessage[]): MockQuery {
    return {
        async *[Symbol.asyncIterator]() {
            for (const message of messages) {
                yield message;
            }
        },
        initializationResult: vi.fn().mockResolvedValue({}),
        reloadPlugins: vi.fn().mockResolvedValue({}),
        close: vi.fn(),
    };
}

describe('queryInitMetadata', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns merged init metadata on the happy path', async () => {
        const streamInit = createInitMessage();
        const shadowQuery = createMockQuery([streamInit]);
        const initResult: SDKControlInitializeResponse = {
            commands: [
                { name: 'plugin:run', description: 'Run plugin command', argumentHint: '' },
                { name: 'compact', description: 'Compact session', argumentHint: '' },
            ],
            agents: [{ name: 'control-agent', description: 'Control agent' }],
            output_style: 'control-style',
            available_output_styles: ['control-style'],
            models: [],
            account: {
                email: 'dev@example.com',
                organization: 'Happy',
                subscriptionType: 'max',
            },
        };
        const reloadResult: SDKControlReloadPluginsResponse = {
            commands: [],
            agents: [],
            plugins: [{ name: 'reloaded-plugin', path: '/tmp/reloaded-plugin', source: 'marketplace' }],
            mcpServers: [{ name: 'reloaded-mcp', status: 'connected' }],
            error_count: 0,
        };

        shadowQuery.initializationResult.mockResolvedValue(initResult);
        shadowQuery.reloadPlugins.mockResolvedValue(reloadResult);
        mockQuery.mockReturnValue(shadowQuery);

        const { queryInitMetadata } = await import('./queryInitMetadata');

        const metadata = await queryInitMetadata({
            cwd: '/tmp/project',
            settingsPath: '/tmp/settings.json',
            allowedTools: ['Read'],
            claudeEnvVars: { CLAUDE_CODE_ENTRYPOINT: 'shadow' },
            mcpServers: { happy: { type: 'http', url: 'http://localhost:4000' } },
        });

        expect(mockQuery).toHaveBeenCalledWith({
            prompt: '.',
            options: expect.objectContaining({
                cwd: '/tmp/project',
                settingsPath: '/tmp/settings.json',
                allowedTools: ['Read'],
                env: { CLAUDE_CODE_ENTRYPOINT: 'shadow' },
                mcpServers: { happy: { type: 'http', url: 'http://localhost:4000' } },
                abort: expect.any(AbortSignal),
            }),
        });
        expect(metadata).toEqual({
            tools: ['Read'],
            slashCommands: ['plugin:run', 'compact'],
            skills: ['review'],
            agents: ['control-agent'],
            plugins: [{ name: 'reloaded-plugin', path: '/tmp/reloaded-plugin', source: 'marketplace' }],
            outputStyle: 'control-style',
            mcpServers: [{ name: 'reloaded-mcp', status: 'connected' }],
        });
        expect(shadowQuery.close).toHaveBeenCalledTimes(1);
        expect(mockLoggerWarn).not.toHaveBeenCalled();
    });

    it('returns stream-only metadata when control APIs do not provide data', async () => {
        const streamInit = createInitMessage({
            agents: ['stream-agent'],
            plugins: [{ name: 'stream-plugin', path: '/tmp/stream-plugin' }],
        });
        const shadowQuery = createMockQuery([streamInit]);
        shadowQuery.initializationResult.mockResolvedValue({} as SDKControlInitializeResponse);
        shadowQuery.reloadPlugins.mockResolvedValue({} as SDKControlReloadPluginsResponse);
        mockQuery.mockReturnValue(shadowQuery);

        const { queryInitMetadata } = await import('./queryInitMetadata');

        const metadata = await queryInitMetadata({
            cwd: '/tmp/project',
            settingsPath: '/tmp/settings.json',
        });

        expect(metadata).toEqual({
            tools: ['Read'],
            slashCommands: ['compact'],
            skills: ['review'],
            agents: ['stream-agent'],
            plugins: [{ name: 'stream-plugin', path: '/tmp/stream-plugin' }],
            outputStyle: 'stream-style',
            mcpServers: [{ name: 'stream-mcp', status: 'connected' }],
        });
    });

    it('returns control-only metadata when the stream init lacks those fields', async () => {
        const streamInit = createInitMessage({
            slash_commands: undefined,
            agents: undefined,
            plugins: undefined,
            output_style: undefined,
            mcp_servers: undefined,
        });
        const shadowQuery = createMockQuery([streamInit]);
        shadowQuery.initializationResult.mockResolvedValue({
            commands: [{ name: 'plugin:control', description: 'Plugin control command', argumentHint: '' }],
            agents: [{ name: 'control-agent', description: 'Control agent' }],
            output_style: 'control-style',
            available_output_styles: ['control-style'],
            models: [],
            account: {
                email: 'dev@example.com',
                organization: 'Happy',
                subscriptionType: 'max',
            },
        } satisfies SDKControlInitializeResponse);
        shadowQuery.reloadPlugins.mockResolvedValue({
            commands: [{ name: 'plugin:control', description: 'Plugin control command', argumentHint: '' }],
            agents: [{ name: 'control-agent', description: 'Control agent' }],
            plugins: [{ name: 'control-plugin', path: '/tmp/control-plugin', source: 'marketplace' }],
            mcpServers: [{ name: 'control-mcp', status: 'connected' }],
            error_count: 0,
        } satisfies SDKControlReloadPluginsResponse);
        mockQuery.mockReturnValue(shadowQuery);

        const { queryInitMetadata } = await import('./queryInitMetadata');

        const metadata = await queryInitMetadata({
            cwd: '/tmp/project',
            settingsPath: '/tmp/settings.json',
        });

        expect(metadata).toEqual({
            tools: ['Read'],
            slashCommands: ['plugin:control'],
            skills: ['review'],
            agents: ['control-agent'],
            plugins: [{ name: 'control-plugin', path: '/tmp/control-plugin', source: 'marketplace' }],
            outputStyle: 'control-style',
            mcpServers: [{ name: 'control-mcp', status: 'connected' }],
        });
    });

    it('returns empty metadata and logs when the shadow query times out', async () => {
        mockQuery.mockImplementation(({ options }: { options?: { abort?: AbortSignal } }) => {
            const abortSignal = options?.abort;
            const iterator = {
                async next() {
                    if (abortSignal?.aborted) {
                        throw abortSignal.reason ?? new Error('aborted');
                    }

                    await new Promise<never>((_resolve, reject) => {
                        abortSignal?.addEventListener('abort', () => {
                            reject(abortSignal.reason ?? new Error('aborted'));
                        }, { once: true });
                    });

                    return { done: true, value: undefined };
                },
            };

            return {
                [Symbol.asyncIterator]() {
                    return iterator;
                },
                initializationResult: vi.fn().mockResolvedValue({}),
                reloadPlugins: vi.fn().mockResolvedValue({}),
                close: vi.fn(),
            } as MockQuery;
        });

        const { queryInitMetadata } = await import('./queryInitMetadata');

        await expect(queryInitMetadata({
            cwd: '/tmp/project',
            settingsPath: '/tmp/settings.json',
            timeoutMs: 25,
        })).resolves.toEqual({});
        expect(mockLoggerDebug).toHaveBeenCalledWith(
            expect.stringContaining('Timed out after 25ms'),
        );
    }, 10_000);

    it('returns empty metadata and logs when the SDK wrapper throws', async () => {
        mockQuery.mockImplementation(() => {
            throw new Error('sdk exploded');
        });

        const { queryInitMetadata } = await import('./queryInitMetadata');

        await expect(queryInitMetadata({
            cwd: '/tmp/project',
            settingsPath: '/tmp/settings.json',
        })).resolves.toEqual({});
        expect(mockLoggerDebug).toHaveBeenCalledWith(
            '[queryInitMetadata] Failed to query init metadata: sdk exploded',
        );
    });

    it('propagates external aborts through the shadow query signal', async () => {
        const externalAbort = new AbortController();
        let receivedSignal: AbortSignal | undefined;

        mockQuery.mockImplementation(({ options }: { options?: { abort?: AbortSignal } }) => {
            receivedSignal = options?.abort;
            const iterator = {
                async next() {
                    if (receivedSignal?.aborted) {
                        throw receivedSignal.reason ?? new Error('aborted');
                    }

                    await new Promise<never>((_resolve, reject) => {
                        receivedSignal?.addEventListener('abort', () => {
                            reject(receivedSignal?.reason ?? new Error('aborted'));
                        }, { once: true });
                    });

                    return { done: true, value: undefined };
                },
            };

            return {
                [Symbol.asyncIterator]() {
                    return iterator;
                },
                initializationResult: vi.fn().mockResolvedValue({}),
                reloadPlugins: vi.fn().mockResolvedValue({}),
                close: vi.fn(),
            } as MockQuery;
        });

        const { queryInitMetadata } = await import('./queryInitMetadata');
        const promise = queryInitMetadata({
            cwd: '/tmp/project',
            settingsPath: '/tmp/settings.json',
            abort: externalAbort.signal,
            timeoutMs: 1_000,
        });

        externalAbort.abort(new Error('user canceled'));

        await expect(promise).resolves.toEqual({});
        expect(receivedSignal?.aborted).toBe(true);
    });

    it('warns when a non-init shadow-session message is observed before init', async () => {
        const shadowQuery = createMockQuery([
            {
                type: 'result',
                subtype: 'success',
                duration_ms: 1,
                duration_api_ms: 1,
                is_error: false,
                num_turns: 1,
                result: 'unexpected result',
                stop_reason: null,
                session_id: 'session-123',
                total_cost_usd: 0,
                usage: {
                    cache_creation: {
                        ephemeral_1h_input_tokens: 0,
                        ephemeral_5m_input_tokens: 0,
                    },
                    input_tokens: 0,
                    output_tokens: 0,
                    cache_creation_input_tokens: 0,
                    cache_read_input_tokens: 0,
                    inference_geo: 'us',
                    iterations: [],
                    server_tool_use: {
                        web_search_requests: 0,
                        web_fetch_requests: 0,
                    },
                    service_tier: 'standard',
                    speed: 'standard',
                },
                modelUsage: {},
                permission_denials: [],
                uuid: '00000000-0000-0000-0000-000000000012',
            },
            createInitMessage(),
        ]);
        mockQuery.mockReturnValue(shadowQuery);

        const { queryInitMetadata } = await import('./queryInitMetadata');

        await queryInitMetadata({
            cwd: '/tmp/project',
            settingsPath: '/tmp/settings.json',
        });

        expect(mockLoggerWarn).toHaveBeenCalledWith(
            '[queryInitMetadata] Unexpected shadow-session message: result/success',
        );
    });

    it('closes before iterating past the first init message', async () => {
        let nextCalls = 0;
        const shadowQuery: MockQuery = {
            [Symbol.asyncIterator]() {
                return {
                    async next() {
                        nextCalls += 1;

                        if (nextCalls === 1) {
                            return { done: false, value: createInitMessage() };
                        }

                        return {
                            done: false,
                            value: {
                                type: 'result',
                                subtype: 'success',
                                duration_ms: 1,
                                duration_api_ms: 1,
                                is_error: false,
                                num_turns: 1,
                                result: 'late result',
                                stop_reason: null,
                                session_id: 'session-123',
                                total_cost_usd: 0,
                                usage: {
                                    cache_creation: {
                                        ephemeral_1h_input_tokens: 0,
                                        ephemeral_5m_input_tokens: 0,
                                    },
                                    input_tokens: 0,
                                    output_tokens: 0,
                                    cache_creation_input_tokens: 0,
                                    cache_read_input_tokens: 0,
                                    inference_geo: 'us',
                                    iterations: [],
                                    server_tool_use: {
                                        web_search_requests: 0,
                                        web_fetch_requests: 0,
                                    },
                                    service_tier: 'standard',
                                    speed: 'standard',
                                },
                                modelUsage: {},
                                permission_denials: [],
                                uuid: '00000000-0000-0000-0000-000000000011',
                            },
                        };
                    },
                };
            },
            initializationResult: vi.fn().mockResolvedValue({} as SDKControlInitializeResponse),
            reloadPlugins: vi.fn().mockResolvedValue({} as SDKControlReloadPluginsResponse),
            close: vi.fn(),
        };

        mockQuery.mockReturnValue(shadowQuery);

        const { queryInitMetadata } = await import('./queryInitMetadata');

        await queryInitMetadata({
            cwd: '/tmp/project',
            settingsPath: '/tmp/settings.json',
        });

        expect(nextCalls).toBe(1);
        expect(shadowQuery.close).toHaveBeenCalledTimes(1);
        expect(mockLoggerWarn).not.toHaveBeenCalled();
    });
});
