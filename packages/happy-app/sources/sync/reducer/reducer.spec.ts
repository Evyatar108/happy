import { describe, it, expect } from 'vitest';
import { NormalizedMessage } from '../typesRaw';
import { createReducer, seedLatestBoundary } from './reducer';
import { reducer } from './reducer';
import { AgentState } from '../storageTypes';
import type { SessionContextBoundaryKind } from '@slopus/happy-wire';

type ReducerMessageSnapshot = ReturnType<typeof createReducer>['messages'] extends Map<string, infer TValue>
    ? TValue
    : never;

function stableSort<T>(values: T[]): T[] {
    return [...values].sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right))
    );
}

function serializeReducerMessage(message: ReducerMessageSnapshot | null) {
    if (!message) {
        return null;
    }

    return {
        createdAt: message.createdAt,
        realID: message.realID,
        role: message.role,
        text: message.text,
        isThinking: message.isThinking ?? false,
        event: message.event,
        tool: message.tool
            ? {
                name: message.tool.name,
                state: message.tool.state,
                input: message.tool.input,
                createdAt: message.tool.createdAt,
                startedAt: message.tool.startedAt,
                completedAt: message.tool.completedAt,
                description: message.tool.description,
                result: message.tool.result ?? null,
                permission: message.tool.permission ?? null,
            }
            : null,
        meta: message.meta ?? null,
    };
}

function snapshotReducerState(state: ReturnType<typeof createReducer>) {
    return {
        localIds: Array.from(state.localIds.keys()).sort(),
        messageIds: Array.from(state.messageIds.keys()).sort(),
        latestTodos: state.latestTodos
            ? {
                todos: state.latestTodos.todos,
                timestamp: state.latestTodos.timestamp,
            }
            : null,
        latestUsage: state.latestUsage
            ? {
                ...state.latestUsage,
            }
            : null,
        latestBoundary: state.latestBoundary ? { ...state.latestBoundary } : null,
        messages: stableSort(
            Array.from(state.messages.values()).map((message) => serializeReducerMessage(message))
        ),
        sidechains: stableSort(
            Array.from(state.sidechains.entries()).map(([sidechainId, messages]) => ({
                sidechainId,
                messages: stableSort(messages.map((message) => serializeReducerMessage(message))),
            }))
        ),
        toolLinks: Array.from(state.toolIdToMessageId.entries())
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([toolId, messageId]) => ({
                toolId,
                message: serializeReducerMessage(state.messages.get(messageId) ?? null),
            })),
        pendingToolResults: Array.from(state.pendingToolResults.entries())
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([toolId, result]) => ({
                toolId,
                result,
            })),
    };
}

function seedActiveContextState(state: ReturnType<typeof createReducer>) {
    state.latestTodos = {
        todos: [{ content: 'Keep active task', status: 'pending' }],
        timestamp: 900,
    };
    state.latestUsage = {
        inputTokens: 11,
        outputTokens: 7,
        cacheCreation: 3,
        cacheRead: 5,
        contextSize: 19,
        timestamp: 900,
    };
}

function createContextBoundaryMessage(
    id: string,
    createdAt: number,
    seq: number,
    kind: SessionContextBoundaryKind,
    meta?: NormalizedMessage['meta'],
): NormalizedMessage {
    return {
        id,
        localId: null,
        createdAt,
        seq,
        role: 'event',
        isSidechain: false,
        content: {
            type: 'context-boundary',
            kind,
            at: createdAt,
        },
        ...(meta ? { meta } : {}),
    };
}

function createLegacyBoundaryMessage(
    id: string,
    createdAt: number,
    message: 'Context was reset' | 'Compaction completed',
    meta?: NormalizedMessage['meta'],
): NormalizedMessage {
    return {
        id,
        localId: null,
        createdAt,
        seq: 1,
        role: 'event',
        isSidechain: false,
        content: {
            type: 'message',
            message,
        },
        ...(meta ? { meta } : {}),
    };
}

function createUserTextMessage(id: string, createdAt: number, text: string): NormalizedMessage {
    return {
        id,
        localId: null,
        createdAt,
        seq: 1,
        role: 'user',
        isSidechain: false,
        content: {
            type: 'text',
            text,
        },
    };
}

function createAgentTextMessage(
    id: string,
    createdAt: number,
    text: string,
    usage?: NormalizedMessage['usage'],
): NormalizedMessage {
    return {
        id,
        localId: null,
        createdAt,
        seq: 1,
        role: 'agent',
        isSidechain: false,
        content: [{
            type: 'text',
            text,
            uuid: `${id}-uuid`,
            parentUUID: null,
        }],
        ...(usage ? { usage } : {}),
    };
}

function createToolCallMessage(
    id: string,
    createdAt: number,
    toolId: string,
    name: string,
    input: unknown,
): NormalizedMessage {
    return {
        id,
        localId: null,
        createdAt,
        seq: 1,
        role: 'agent',
        isSidechain: false,
        content: [{
            type: 'tool-call',
            id: toolId,
            name,
            input,
            description: null,
            uuid: `${toolId}-uuid`,
            parentUUID: null,
        }],
    };
}

function createToolResultMessage(
    id: string,
    createdAt: number,
    toolId: string,
    content: unknown,
    usage?: NormalizedMessage['usage'],
): NormalizedMessage {
    return {
        id,
        localId: null,
        createdAt,
        seq: 1,
        role: 'agent',
        isSidechain: false,
        content: [{
            type: 'tool-result',
            tool_use_id: toolId,
            content,
            is_error: false,
            uuid: `${toolId}-uuid`,
            parentUUID: null,
        }],
        ...(usage ? { usage } : {}),
    };
}

function createOutOfOrderHistoryMessage(index: number): NormalizedMessage {
    const createdAt = index * 10;

    switch (index) {
        case 10:
            return createToolCallMessage(
                'msg-010-plan-enter',
                createdAt,
                'tool-plan-enter',
                'EnterPlanMode',
                { reason: 'Investigate large chat cold-open perf' },
            );
        case 20:
            return createToolCallMessage(
                'msg-020-todo-call',
                createdAt,
                'tool-todo',
                'TodoWrite',
                {
                    todos: [{
                        content: 'Measure large chat cold-open on tablet',
                        status: 'pending',
                    }],
                },
            );
        case 30:
            return createToolCallMessage(
                'msg-030-bash-call',
                createdAt,
                'tool-bash',
                'Bash',
                { command: 'git status --short' },
            );
        case 70:
            return createToolResultMessage(
                'msg-070-todo-result',
                createdAt,
                'tool-todo',
                {
                    oldTodos: [],
                    newTodos: [{
                        content: 'Measure large chat cold-open on tablet',
                        status: 'completed',
                    }],
                },
            );
        case 80:
            return createToolResultMessage(
                'msg-080-bash-result',
                createdAt,
                'tool-bash',
                'working tree clean',
            );
        case 90:
            return createToolCallMessage(
                'msg-090-plan-exit',
                createdAt,
                'tool-plan-exit',
                'ExitPlanMode',
                {},
            );
        case 100:
            return createAgentTextMessage(
                'msg-100-usage',
                createdAt,
                'Tail message carrying the newest usage sample.',
                {
                    input_tokens: 120,
                    output_tokens: 45,
                    cache_creation_input_tokens: 12,
                    cache_read_input_tokens: 34,
                },
            );
        default:
            return index % 2 === 0
                ? createUserTextMessage(
                    `msg-${String(index).padStart(3, '0')}-user`,
                    createdAt,
                    `User message ${index}`,
                )
                : createAgentTextMessage(
                    `msg-${String(index).padStart(3, '0')}-agent`,
                    createdAt,
                    `Agent message ${index}`,
                );
    }
}

function createOutOfOrderHistoryScenario() {
    const allMessages = Array.from({ length: 100 }, (_, offset) =>
        createOutOfOrderHistoryMessage(offset + 1)
    );
    const olderBatch = allMessages.slice(0, 50);
    const newerBatch = allMessages.slice(50);
    const interleavedStreamingMessage = createAgentTextMessage(
        'msg-110-stream',
        1100,
        'Streaming message after the initial newer batch.',
        {
            input_tokens: 140,
            output_tokens: 60,
            cache_creation_input_tokens: 20,
            cache_read_input_tokens: 10,
        },
    );

    return {
        olderBatch,
        newerBatch,
        interleavedStreamingMessage,
        allAtOnce: allMessages,
        allAtOnceWithStreaming: [...allMessages, interleavedStreamingMessage],
    };
}

describe('reducer', () => {
    // it('should process golden cases', () => {
    //     for (let i = 0; i <= 3; i++) {

    //         // Load raw data
    //         const raw = require(`./__testdata__/log_${i}.json`) as any[];
    //         const rawParsed = raw.map((v: any) => RawRecordSchema.parse(v.content));
    //         for (let i = 0; i < rawParsed.length; i++) {
    //             expect(rawParsed[i]).not.toBeNull();
    //         }
    //         expect(rawParsed, `raw_${i}`).toMatchSnapshot();

    //         const normalized = rawParsed.map((v: any, i) => normalizeRawMessage(`${i}`, null, 0, v));
    //         for (let i = 0; i < normalized.length; i++) {
    //             if (rawParsed[i].role === 'agent' && ((rawParsed[i] as any).content.data.type === 'system' || (rawParsed[i] as any).content.data.type === 'result')) {
    //                 continue;
    //             }
    //             expect(normalized[i]).not.toBeNull();
    //         }
    //         expect(normalized, `normalized_${i}`).toMatchSnapshot();

    //         const state = createReducer();
    //         const newMessages = reducer(state, normalized.filter(v => v !== null));
    //         expect(newMessages, `log_${i}`).toMatchSnapshot();
    //     }
    // });

    describe('user message handling', () => {
        it('should process user messages with localId', () => {
            const state = createReducer();
            const messages: NormalizedMessage[] = [
                {
                    id: 'msg1',
                    localId: 'local123',
                    createdAt: 1000,
                    seq: 1,
                    role: 'user',
                    content: { type: 'text', text: 'Hello' },
                    isSidechain: false
                }
            ];

            const result = reducer(state, messages);
            expect(result.messages).toHaveLength(1);
            expect(result.messages[0].kind).toBe('user-text');
            if (result.messages[0].kind === 'user-text') {
                expect(result.messages[0].text).toBe('Hello');
            }
            expect(state.localIds.has('local123')).toBe(true);
        });

        it('should deduplicate user messages by localId', () => {
            const state = createReducer();
            
            // First message with localId
            const messages1: NormalizedMessage[] = [
                {
                    id: 'msg1',
                    localId: 'local123',
                    createdAt: 1000,
                    seq: 1,
                    role: 'user',
                    content: { type: 'text', text: 'First' },
                    isSidechain: false
                }
            ];
            
            const result1 = reducer(state, messages1);
            expect(result1.messages).toHaveLength(1);

            // Second message with same localId should be ignored
            const messages2: NormalizedMessage[] = [
                {
                    id: 'msg2',
                    localId: 'local123',
                    createdAt: 2000,
                    seq: 1,
                    role: 'user',
                    content: { type: 'text', text: 'Second' },
                    isSidechain: false
                }
            ];
            
            const result2 = reducer(state, messages2);
            expect(result2.messages).toHaveLength(0);
        });

        it('should deduplicate user messages by message id when no localId', () => {
            const state = createReducer();
            
            // First message without localId
            const messages1: NormalizedMessage[] = [
                {
                    id: 'msg1',
                    localId: null,
                    createdAt: 1000,
                    seq: 1,
                    role: 'user',
                    content: { type: 'text', text: 'First' },
                    isSidechain: false
                }
            ];
            
            const result1 = reducer(state, messages1);
            expect(result1.messages).toHaveLength(1);

            // Second message with same id should be ignored
            const messages2: NormalizedMessage[] = [
                {
                    id: 'msg1',
                    localId: null,
                    createdAt: 2000,
                    seq: 1,
                    role: 'user',
                    content: { type: 'text', text: 'Second' },
                    isSidechain: false
                }
            ];
            
            const result2 = reducer(state, messages2);
            expect(result2.messages).toHaveLength(0);
        });

        it('should process multiple user messages with different localIds', () => {
            const state = createReducer();
            const messages: NormalizedMessage[] = [
                {
                    id: 'msg1',
                    localId: 'local123',
                    createdAt: 1000,
                    seq: 1,
                    role: 'user',
                    content: { type: 'text', text: 'First' },
                    isSidechain: false
                },
                {
                    id: 'msg2',
                    localId: 'local456',
                    createdAt: 2000,
                    seq: 1,
                    role: 'user',
                    content: { type: 'text', text: 'Second' },
                    isSidechain: false
                },
                {
                    id: 'msg3',
                    localId: null,
                    createdAt: 3000,
                    seq: 1,
                    role: 'user',
                    content: { type: 'text', text: 'Third' },
                    isSidechain: false
                }
            ];

            const result = reducer(state, messages);
            expect(result.messages).toHaveLength(3);
            if (result.messages[0].kind === 'user-text') {
                expect(result.messages[0].text).toBe('First');
            }
            if (result.messages[1].kind === 'user-text') {
                expect(result.messages[1].text).toBe('Second');
            }
            if (result.messages[2].kind === 'user-text') {
                expect(result.messages[2].text).toBe('Third');
            }
        });
    });

    describe('agent text message handling', () => {
        it('should process agent text messages', () => {
            const state = createReducer();
            const messages: NormalizedMessage[] = [
                {
                    id: 'agent1',
                    localId: null,
                    createdAt: 1000,
                    seq: 1,
                    role: 'agent',
                    isSidechain: false,
                    content: [{
                        type: 'text',
                        text: 'Hello from Claude!',
                        uuid: 'test-uuid-1',
                        parentUUID: null
                    }]
                }
            ];

            const result = reducer(state, messages);
            expect(result.messages).toHaveLength(1);
            expect(result.messages[0].kind).toBe('agent-text');
            if (result.messages[0].kind === 'agent-text') {
                expect(result.messages[0].text).toBe('Hello from Claude!');
            }
        });

        it('should process multiple text blocks in one agent message', () => {
            const state = createReducer();
            const messages: NormalizedMessage[] = [
                {
                    id: 'agent1',
                    localId: null,
                    createdAt: 1000,
                    seq: 1,
                    role: 'agent',
                    isSidechain: false,
                    content: [
                        {
                            type: 'text',
                            text: 'Part 1',
                            uuid: 'test-uuid-2',
                            parentUUID: null
                        },
                        {
                            type: 'text',
                            text: 'Part 2',
                            uuid: 'test-uuid-2',
                            parentUUID: null
                        }
                    ]
                }
            ];

            const result = reducer(state, messages);
            expect(result.messages).toHaveLength(2);
            if (result.messages[0].kind === 'agent-text') {
                expect(result.messages[0].text).toBe('Part 1');
            }
            if (result.messages[1].kind === 'agent-text') {
                expect(result.messages[1].text).toBe('Part 2');
            }
        });
    });

    describe('mixed message processing', () => {
        it('should handle interleaved user and agent messages', () => {
            const state = createReducer();
            const messages: NormalizedMessage[] = [
                {
                    id: 'user1',
                    localId: 'local1',
                    createdAt: 1000,
                    seq: 1,
                    role: 'user',
                    content: { type: 'text', text: 'Question 1' },
                    isSidechain: false
                },
                {
                    id: 'agent1',
                    localId: null,
                    createdAt: 2000,
                    seq: 1,
                    role: 'agent',
                    content: [{
                        type: 'text',
                        text: 'Answer 1',
                        uuid: 'test-uuid-3',
                        parentUUID: null
                    }],
                    isSidechain: false
                },
                {
                    id: 'user2',
                    localId: 'local2',
                    createdAt: 3000,
                    seq: 1,
                    role: 'user',
                    content: { type: 'text', text: 'Question 2' },
                    isSidechain: false
                },
                {
                    id: 'agent2',
                    localId: null,
                    createdAt: 4000,
                    seq: 1,
                    role: 'agent',
                    content: [{
                        type: 'text',
                        text: 'Answer 2',
                        uuid: 'test-uuid-4',
                        parentUUID: null
                    }],
                    isSidechain: false
                }
            ];

            const result = reducer(state, messages);
            expect(result.messages).toHaveLength(4);
            expect(result.messages[0].kind).toBe('user-text');
            if (result.messages[0].kind === 'user-text') {
                expect(result.messages[0].text).toBe('Question 1');
            }
            expect(result.messages[1].kind).toBe('agent-text');
            if (result.messages[1].kind === 'agent-text') {
                expect(result.messages[1].text).toBe('Answer 1');
            }
            expect(result.messages[2].kind).toBe('user-text');
            if (result.messages[2].kind === 'user-text') {
                expect(result.messages[2].text).toBe('Question 2');
            }
            expect(result.messages[3].kind).toBe('agent-text');
            if (result.messages[3].kind === 'agent-text') {
                expect(result.messages[3].text).toBe('Answer 2');
            }
        });
    });

    describe('edge cases', () => {
        it('should handle empty message array', () => {
            const state = createReducer();
            const result = reducer(state, []);
            expect(result.messages).toHaveLength(0);
        });

        it('should not duplicate agent messages when applied multiple times', () => {
            const state = createReducer();
            const messages: NormalizedMessage[] = [
                {
                    id: 'agent1',
                    localId: null,
                    createdAt: 1000,
                    seq: 1,
                    role: 'agent',
                    content: [{
                        type: 'text',
                        text: 'Hello world!',
                        uuid: 'test-uuid-5',
                        parentUUID: null
                    }],
                    isSidechain: false
                }
            ];

            // Apply the same messages multiple times
            const result1 = reducer(state, messages);
            expect(result1.messages).toHaveLength(1);
            
            const result2 = reducer(state, messages);
            expect(result2.messages).toHaveLength(0); // Should not add duplicates
            
            const result3 = reducer(state, messages);
            expect(result3.messages).toHaveLength(0); // Still no duplicates
        });

        it('should filter out null normalized messages', () => {
            const state = createReducer();
            const messages: NormalizedMessage[] = [
                {
                    id: 'user1',
                    localId: 'local1',
                    createdAt: 1000,
                    seq: 1,
                    role: 'user',
                    content: { type: 'text', text: 'Valid' },
                    isSidechain: false
                }
            ];

            const result = reducer(state, messages);
            expect(result.messages).toHaveLength(1);
            if (result.messages[0].kind === 'user-text') {
                expect(result.messages[0].text).toBe('Valid');
            }
        });

        it('should handle summary messages', () => {
            const state = createReducer();
            const messages: NormalizedMessage[] = [
                {
                    id: 'agent1',
                    localId: null,
                    createdAt: 1000,
                    seq: 1,
                    role: 'event',
                    content: {
                        type: 'message',
                        message: 'This is a summary'
                    },
                    isSidechain: false
                }
            ];

            const result = reducer(state, messages);
            // Summary messages should be processed but may not appear in output
            expect(result).toBeDefined();
        });
    });

    describe('AgentState permissions', () => {
        it('should create tool messages for pending permission requests', () => {
            const state = createReducer();
            const agentState: AgentState = {
                requests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'ls -la' },
                        createdAt: 1000
                    }
                }
            };

            const result = reducer(state, [], agentState);
            
            expect(result.messages).toHaveLength(1);
            expect(result.messages[0].kind).toBe('tool-call');
            if (result.messages[0].kind === 'tool-call') {
                expect(result.messages[0].tool.name).toBe('Bash');
                expect(result.messages[0].tool.state).toBe('running');
                expect(result.messages[0].tool.permission).toEqual({
                    id: 'tool-1',
                    status: 'pending'
                });
            }
        });

        it('should update permission status for completed requests', () => {
            const state = createReducer();
            
            // First create a pending permission
            const agentState1: AgentState = {
                requests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'ls -la' },
                        createdAt: 1000
                    }
                }
            };
            
            const result1 = reducer(state, [], agentState1);
            expect(result1.messages).toHaveLength(1);

            // Then mark it as completed
            const agentState2: AgentState = {
                completedRequests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'ls -la' },
                        createdAt: 1000,
                        completedAt: 2000,
                        status: 'denied',
                        reason: 'User denied permission'
                    }
                }
            };

            const result2 = reducer(state, [], agentState2);
            expect(result2.messages).toHaveLength(1);
            if (result2.messages[0].kind === 'tool-call') {
                expect(result2.messages[0].tool.state).toBe('error');
                expect(result2.messages[0].tool.permission?.status).toBe('denied');
                expect(result2.messages[0].tool.permission?.reason).toBe('User denied permission');
            }
        });

        it('should match incoming tool calls to approved permission messages', () => {
            const state = createReducer();
            
            // First create an approved permission
            const agentState: AgentState = {
                completedRequests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'ls -la' },
                        createdAt: 1000,
                        completedAt: 2000,
                        status: 'approved'
                    }
                }
            };
            
            const result1 = reducer(state, [], agentState);
            expect(result1.messages).toHaveLength(1);
            
            // Then receive the actual tool call from the agent
            const messages: NormalizedMessage[] = [
                {
                    id: 'msg-1',
                    localId: null,
                    createdAt: 3000,
                    seq: 1,
                    role: 'agent',
                    isSidechain: false,
                    content: [{
                        type: 'tool-call',
                        id: 'tool-1',
                        name: 'Bash',
                        input: { command: 'ls -la' },
                        description: null,
                        uuid: 'msg-1-uuid',
                        parentUUID: null
                    }]
                }
            ];

            const result2 = reducer(state, messages, agentState);
            
            // The tool call should be matched to the existing permission message
            // So we should get an update to the existing message, not a new one
            expect(result2.messages).toHaveLength(1);
            if (result2.messages[0].kind === 'tool-call') {
                expect(result2.messages[0].tool.permission?.status).toBe('approved');
                expect(result2.messages[0].tool.state).toBe('running');
                expect(result2.messages[0].tool.name).toBe('Bash');
            }
        });

        it('should merge real tool-call patch args into matched permission messages', () => {
            const state = createReducer();
            const fileChanges = {
                'src/example.ts': {
                    modify: {
                        old_content: 'before',
                        new_content: 'after'
                    }
                }
            };
            const changes = {
                'src/example.ts': {
                    modify: {
                        old_content: 'before',
                        new_content: 'after'
                    }
                }
            };
            const agentState: AgentState = {
                completedRequests: {
                    'tool-1': {
                        tool: 'CodexPatch',
                        arguments: { fileChanges },
                        createdAt: 1000,
                        completedAt: 2000,
                        status: 'approved'
                    }
                }
            };

            reducer(state, [], agentState);

            const messages: NormalizedMessage[] = [
                {
                    id: 'msg-1',
                    localId: null,
                    createdAt: 3000,
                    seq: 1,
                    role: 'agent',
                    isSidechain: false,
                    content: [{
                        type: 'tool-call',
                        id: 'tool-1',
                        name: 'CodexPatch',
                        input: {
                            auto_approved: false,
                            changes
                        },
                        description: 'Apply patch to 1 file',
                        uuid: 'msg-1-uuid',
                        parentUUID: null
                    }]
                }
            ];

            const result = reducer(state, messages, agentState);

            expect(result.messages).toHaveLength(1);
            expect(result.messages[0].kind).toBe('tool-call');
            if (result.messages[0].kind === 'tool-call') {
                expect(result.messages[0].tool.input).toEqual({
                    auto_approved: false,
                    changes,
                    fileChanges
                });
                expect(result.messages[0].tool.startedAt).toBe(3000);
            }
        });

        it('should match tool calls by ID regardless of arguments', () => {
            const state = createReducer();
            
            // Create multiple pending permission requests
            const agentState1: AgentState = {
                requests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'ls -la' },
                        createdAt: 1000
                    },
                    'tool-2': {
                        tool: 'Bash',
                        arguments: { command: 'pwd' },
                        createdAt: 2000
                    }
                }
            };
            
            const result1 = reducer(state, [], agentState1);
            expect(result1.messages).toHaveLength(2);

            // Approve both permissions
            const agentState2: AgentState = {
                completedRequests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'ls -la' },
                        createdAt: 1000,
                        completedAt: 3000,
                        status: 'approved'
                    },
                    'tool-2': {
                        tool: 'Bash',
                        arguments: { command: 'pwd' },
                        createdAt: 2000,
                        completedAt: 3000,
                        status: 'approved'
                    }
                }
            };
            
            reducer(state, [], agentState2);

            // Now receive a tool call from the agent
            const messages: NormalizedMessage[] = [
                {
                    id: 'msg-1',
                    localId: null,
                    createdAt: 4000,
                    seq: 1,
                    role: 'agent',
                    isSidechain: false,
                    content: [{
                        type: 'tool-call',
                        id: 'tool-1',
                        name: 'Bash',
                        input: { command: 'pwd' },
                        description: null,
                        uuid: 'msg-2-uuid',
                        parentUUID: null
                    }]
                }
            ];

            // Pass agentState2 - it's always provided as current state
            const result3 = reducer(state, messages, agentState2);
            
            // Should return the updated permission message (ID match)
            expect(result3.messages).toHaveLength(1);
            expect(result3.messages[0].kind).toBe('tool-call');
            if (result3.messages[0].kind === 'tool-call') {
                // With ID matching, keeps original permission arguments
                expect(result3.messages[0].tool.input).toEqual({ command: 'ls -la' });
            }
            
            // Verify that tool-1 is in the map
            expect(state.toolIdToMessageId.has('tool-1')).toBe(true);
            // Should have both tool IDs in the map
            expect(state.toolIdToMessageId.size).toBe(2);
        });

        it('should not create new message when tool can be matched to existing permission (priority to newest)', () => {
            const state = createReducer();
            
            // Create multiple approved permissions with same tool but different times
            const agentState: AgentState = {
                completedRequests: {
                    'tool-old': {
                        tool: 'Bash',
                        arguments: { command: 'ls' },
                        createdAt: 1000,
                        completedAt: 2000,
                        status: 'approved'
                    },
                    'tool-new': {
                        tool: 'Bash',
                        arguments: { command: 'ls' },
                        createdAt: 3000,
                        completedAt: 4000,
                        status: 'approved'
                    }
                }
            };
            
            const result1 = reducer(state, [], agentState);
            expect(result1.messages).toHaveLength(2);
            
            // Store the message IDs
            const oldMessageId = state.toolIdToMessageId.get('tool-old');
            const newMessageId = state.toolIdToMessageId.get('tool-new');
            
            // Now receive a tool call that matches both
            const messages: NormalizedMessage[] = [
                {
                    id: 'msg-1',
                    localId: null,
                    createdAt: 5000,
                    seq: 1,
                    role: 'agent',
                    isSidechain: false,
                    content: [{
                        type: 'tool-call',
                        id: 'tool-1',
                        name: 'Bash',
                        input: { command: 'ls' },
                        description: null,
                        uuid: 'msg-3-uuid',
                        parentUUID: null
                    }]
                }
            ];

            // Pass agentState - it's always provided as current state
            const result2 = reducer(state, messages, agentState);
            
            // Should only return the updated message that matched
            expect(result2.messages).toHaveLength(1);
            expect(result2.messages[0].kind).toBe('tool-call');
            if (result2.messages[0].kind === 'tool-call') {
                expect(result2.messages[0].tool.input).toEqual({ command: 'ls' });
            }
            
            // With new design, tool-1 creates a new message since it doesn't match tool-old or tool-new
            expect(state.toolIdToMessageId.has('tool-1')).toBe(true);
            expect(state.toolIdToMessageId.has('tool-old')).toBe(true);
            expect(state.toolIdToMessageId.has('tool-new')).toBe(true);
            
            // Verify that old messages were not updated (tool-1 is different ID)
            const newMessage = state.messages.get(newMessageId!);
            expect(newMessage?.tool?.startedAt).toBeNull();
            
            const oldMessage = state.messages.get(oldMessageId!);
            expect(oldMessage?.tool?.startedAt).toBeNull();
        });

        it('should not create duplicate messages when called twice with same AgentState', () => {
            const state = createReducer();
            
            // AgentState with both pending and completed permissions
            const agentState: AgentState = {
                requests: {
                    'tool-pending': {
                        tool: 'Read',
                        arguments: { file: 'test.txt' },
                        createdAt: 1000
                    }
                },
                completedRequests: {
                    'tool-completed': {
                        tool: 'Write',
                        arguments: { file: 'output.txt', content: 'hello' },
                        createdAt: 2000,
                        completedAt: 3000,
                        status: 'approved'
                    }
                }
            };
            
            // First call - should create messages
            const result1 = reducer(state, [], agentState);
            expect(result1.messages).toHaveLength(2);
            
            // Verify the messages were created
            expect(state.toolIdToMessageId.has('tool-pending')).toBe(true);
            expect(state.toolIdToMessageId.has('tool-completed')).toBe(true);
            
            // Second call with same AgentState - should not create duplicates
            const result2 = reducer(state, [], agentState);
            expect(result2.messages).toHaveLength(0); // No new messages
            
            // Verify the mappings still exist and haven't changed
            expect(state.toolIdToMessageId.size).toBe(2);
            
            // Third call with a message and same AgentState - still no duplicates
            const messages: NormalizedMessage[] = [
                {
                    id: 'msg-1',
                    localId: null,
                    createdAt: 4000,
                    seq: 1,
                    role: 'user',
                    content: { type: 'text', text: 'Hello' },
                    isSidechain: false
                }
            ];
            
            const result3 = reducer(state, messages, agentState);
            expect(result3.messages).toHaveLength(1); // Only the user message
            expect(result3.messages[0].kind).toBe('user-text');
            
            // Verify permission messages weren't duplicated
            expect(state.toolIdToMessageId.size).toBe(2);
        });

        it('should prioritize tool call over permission request when both provided simultaneously', () => {
            const state = createReducer();
            
            // AgentState with approved permission
            const agentState: AgentState = {
                completedRequests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'ls' },
                        createdAt: 1000,
                        completedAt: 2000,
                        status: 'approved'
                    }
                }
            };
            
            // Tool call message with different timestamp
            const messages: NormalizedMessage[] = [
                {
                    id: 'tool-msg-1',
                    localId: null,
                    createdAt: 5000,
                    seq: 1,
                    role: 'agent',
                    content: [{
                        type: 'tool-call',
                        id: 'tool-1',
                        name: 'Bash',
                        input: { command: 'ls' },
                        description: null,
                        uuid: 'tool-uuid-1',
                        parentUUID: null
                    }],
                    isSidechain: false
                }
            ];
            
            // Process both simultaneously
            const result = reducer(state, messages, agentState);
            
            // Should create only one message (the tool call takes priority)
            expect(result.messages).toHaveLength(1);
            expect(result.messages[0].kind).toBe('tool-call');
            if (result.messages[0].kind === 'tool-call') {
                // Should use tool call's timestamp, not permission's
                expect(result.messages[0].createdAt).toBe(5000);
                expect(result.messages[0].id).toBeDefined();
                
                // Should have permission info from AgentState (it was skipped in Phase 0 but attached in Phase 2)
                expect(result.messages[0].tool.permission).toBeDefined();
                expect(result.messages[0].tool.permission?.id).toBe('tool-1');
                expect(result.messages[0].tool.permission?.status).toBe('approved');
            }
            
            // Verify only the tool message was created, not a separate permission message
            expect(state.toolIdToMessageId.has('tool-1')).toBe(true);
            expect(state.toolIdToMessageId.has('tool-1')).toBe(true);
            // Tool ID maps to message ID
            const toolMsgId = state.toolIdToMessageId.get('tool-1');
            expect(toolMsgId).toBeDefined();
        });

        it('should preserve original timestamps when request received first, then tool call', () => {
            const state = createReducer();
            
            // First: Process permission request
            const agentState1: AgentState = {
                requests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'ls' },
                        createdAt: 1000
                    }
                }
            };
            
            const result1 = reducer(state, [], agentState1);
            expect(result1.messages).toHaveLength(1);
            
            const permMessageId = state.toolIdToMessageId.get('tool-1');
            const originalMessage = state.messages.get(permMessageId!);
            expect(originalMessage?.createdAt).toBe(1000);
            expect(originalMessage?.realID).toBeNull();
            
            // Then: Approve the permission
            const agentState2: AgentState = {
                completedRequests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'ls' },
                        createdAt: 1000,
                        completedAt: 2000,
                        status: 'approved'
                    }
                }
            };
            
            const result2 = reducer(state, [], agentState2);
            expect(result2.messages).toHaveLength(1); // Same message, updated
            
            // Finally: Receive the actual tool call
            const messages: NormalizedMessage[] = [
                {
                    id: 'tool-msg-1',
                    localId: null,
                    createdAt: 5000,
                    seq: 1,
                    role: 'agent',
                    content: [{
                        type: 'tool-call',
                        id: 'tool-1',
                        name: 'Bash',
                        input: { command: 'ls' },
                        description: null,
                        uuid: 'tool-uuid-1',
                        parentUUID: null
                    }],
                    isSidechain: false
                }
            ];
            
            const result3 = reducer(state, messages, agentState2);
            expect(result3.messages).toHaveLength(1); // Same message, updated
            
            // Check the final state of the message
            const finalMessage = state.messages.get(permMessageId!);
            
            // Original timestamp should be preserved
            expect(finalMessage?.createdAt).toBe(1000);
            
            // But realID should be updated to the tool message's ID
            expect(finalMessage?.realID).toBe('tool-msg-1');
            
            // Tool should be updated with execution details
            expect(finalMessage?.tool?.startedAt).toBe(5000);
            expect(finalMessage?.tool?.permission?.status).toBe('approved');
            
            // Verify the tool is properly linked
            expect(state.toolIdToMessageId.get('tool-1')).toBe(permMessageId);
        });

        it('should create separate messages for same tool name with different arguments', () => {
            const state = createReducer();
            
            // AgentState with two approved permissions for same tool but different arguments
            const agentState: AgentState = {
                completedRequests: {
                    'tool-ls': {
                        tool: 'Bash',
                        arguments: { command: 'ls -la' },
                        createdAt: 1000,
                        completedAt: 2000,
                        status: 'approved'
                    },
                    'tool-pwd': {
                        tool: 'Bash',
                        arguments: { command: 'pwd' },
                        createdAt: 1500,
                        completedAt: 2000,
                        status: 'approved'
                    }
                }
            };
            
            // Process permissions
            const result1 = reducer(state, [], agentState);
            expect(result1.messages).toHaveLength(2);
            
            // Both should be separate messages
            const lsMessageId = state.toolIdToMessageId.get('tool-ls');
            const pwdMessageId = state.toolIdToMessageId.get('tool-pwd');
            expect(lsMessageId).toBeDefined();
            expect(pwdMessageId).toBeDefined();
            expect(lsMessageId).not.toBe(pwdMessageId);
            
            // Verify the messages have correct arguments
            const lsMessage = state.messages.get(lsMessageId!);
            const pwdMessage = state.messages.get(pwdMessageId!);
            expect(lsMessage?.tool?.input).toEqual({ command: 'ls -la' });
            expect(pwdMessage?.tool?.input).toEqual({ command: 'pwd' });
            
            // Now receive the first tool call (pwd)
            const messages1: NormalizedMessage[] = [
                {
                    id: 'msg-1',
                    localId: null,
                    createdAt: 3000,
                    seq: 1,
                    role: 'agent',
                    content: [{
                        type: 'tool-call',
                        id: 'tool-pwd',
                        name: 'Bash',
                        input: { command: 'pwd' },
                        description: null,
                        uuid: 'tool-uuid-1',
                        parentUUID: null
                    }],
                    isSidechain: false
                }
            ];
            
            const result2 = reducer(state, messages1, agentState);
            expect(result2.messages).toHaveLength(1);
            
            // Should match to the pwd permission (newer one, matching arguments)
            expect(state.toolIdToMessageId.get('tool-pwd')).toBe(pwdMessageId);
            // ls permission should have its own message
            expect(state.toolIdToMessageId.has('tool-ls')).toBe(true);
            
            // Now receive the second tool call (ls)
            const messages2: NormalizedMessage[] = [
                {
                    id: 'msg-2',
                    localId: null,
                    createdAt: 4000,
                    seq: 1,
                    role: 'agent',
                    content: [{
                        type: 'tool-call',
                        id: 'tool-ls',
                        name: 'Bash',
                        input: { command: 'ls -la' },
                        description: null,
                        uuid: 'tool-uuid-2',
                        parentUUID: null
                    }],
                    isSidechain: false
                }
            ];
            
            const result3 = reducer(state, messages2, agentState);
            expect(result3.messages).toHaveLength(1);
            
            // Should match to the ls permission
            expect(state.toolIdToMessageId.get('tool-ls')).toBe(lsMessageId);
            
            // Both tools should be in the map
            expect(state.toolIdToMessageId.size).toBe(2);
            
            // Verify final states
            const finalLsMessage = state.messages.get(lsMessageId!);
            const finalPwdMessage = state.messages.get(pwdMessageId!);
            expect(finalLsMessage?.tool?.startedAt).toBe(4000);
            expect(finalPwdMessage?.tool?.startedAt).toBe(3000);
        });

        it('should update permission message when tool call has matching ID', () => {
            const state = createReducer();
            
            // AgentState with a pending permission request
            const agentState: AgentState = {
                requests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'ls -la' },
                        createdAt: 1000
                    }
                }
            };
            
            // Tool call with matching ID (arguments don't matter with ID matching)
            const messages: NormalizedMessage[] = [
                {
                    id: 'tool-msg-1',
                    localId: null,
                    createdAt: 2000,
                    seq: 1,
                    role: 'agent',
                    content: [{
                        type: 'tool-call',
                        id: 'tool-1',
                        name: 'Bash',
                        input: { command: 'pwd' },
                        description: null,
                        uuid: 'tool-uuid-1',
                        parentUUID: null
                    }],
                    isSidechain: false
                }
            ];
            
            // Process both simultaneously
            const result = reducer(state, messages, agentState);
            
            // Should update the existing permission message
            expect(result.messages).toHaveLength(1);
            
            // Verify the message was updated with tool execution details
            if (result.messages[0].kind === 'tool-call') {
                // Should keep original permission data
                expect(result.messages[0].tool.permission?.id).toBe('tool-1');
                expect(result.messages[0].tool.permission?.status).toBe('pending');
                // Should keep original arguments from permission
                expect(result.messages[0].tool.input).toEqual({ command: 'ls -la' });
                // Should keep original timestamp
                expect(result.messages[0].createdAt).toBe(1000);
            }
            
            // Verify internal state - should be the same message
            expect(state.toolIdToMessageId.has('tool-1')).toBe(true);
            expect(state.toolIdToMessageId.has('tool-1')).toBe(true);
            
            // They should be the same message now
            const permMsgId = state.toolIdToMessageId.get('tool-1');
            const toolMsgId = state.toolIdToMessageId.get('tool-1');
            expect(permMsgId).toBe(toolMsgId);
            
            // Now approve the permission and send its tool call
            const agentState2: AgentState = {
                completedRequests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'ls -la' },
                        createdAt: 1000,
                        completedAt: 3000,
                        status: 'approved'
                    }
                }
            };
            
            const messages2: NormalizedMessage[] = [
                {
                    id: 'tool-msg-2',
                    localId: null,
                    createdAt: 4000,
                    seq: 1,
                    role: 'agent',
                    content: [{
                        type: 'tool-call',
                        id: 'tool-1',  // Must match permission ID
                        name: 'Bash',
                        input: { command: 'ls -la' },
                        description: null,
                        uuid: 'tool-uuid-2',
                        parentUUID: null
                    }],
                    isSidechain: false
                }
            ];
            
            const result2 = reducer(state, messages2, agentState2);
            
            // Should update the permission message
            expect(result2.messages).toHaveLength(1);
            expect(result2.messages[0].kind).toBe('tool-call');
            if (result2.messages[0].kind === 'tool-call') {
                expect(result2.messages[0].tool.input).toEqual({ command: 'ls -la' });
                expect(result2.messages[0].tool.permission?.status).toBe('approved');
            }
            
            // Verify it matched to the correct permission (same ID now)
            // Should resolve to the permission message since it was created first
            expect(state.toolIdToMessageId.get('tool-1')).toBe(permMsgId);
        });

        it('should handle full permission lifecycle: pending -> approved -> tool execution -> completion', () => {
            const state = createReducer();
            
            // Step 1: Create pending permission
            const agentState1: AgentState = {
                requests: {
                    'tool-1': {
                        tool: 'Read',
                        arguments: { file: '/test.txt' },
                        createdAt: 1000
                    }
                }
            };
            
            const result1 = reducer(state, [], agentState1);
            expect(result1.messages).toHaveLength(1);
            expect(result1.messages[0].kind).toBe('tool-call');
            if (result1.messages[0].kind === 'tool-call') {
                expect(result1.messages[0].tool.state).toBe('running');
                expect(result1.messages[0].tool.permission?.status).toBe('pending');
            }
            
            // Step 2: Approve permission
            const agentState2: AgentState = {
                completedRequests: {
                    'tool-1': {
                        tool: 'Read',
                        arguments: { file: '/test.txt' },
                        createdAt: 1000,
                        completedAt: 2000,
                        status: 'approved'
                    }
                }
            };
            
            const result2 = reducer(state, [], agentState2);
            expect(result2.messages).toHaveLength(1);
            if (result2.messages[0].kind === 'tool-call') {
                expect(result2.messages[0].tool.permission?.status).toBe('approved');
                expect(result2.messages[0].tool.state).toBe('running');
            }
            
            // Step 3: Tool call arrives
            const toolMessages: NormalizedMessage[] = [
                {
                    id: 'msg-1',
                    localId: null,
                    createdAt: 3000,
                    seq: 1,
                    role: 'agent',
                    content: [{
                        type: 'tool-call',
                        id: 'tool-1',
                        name: 'Read',
                        input: { file: '/test.txt' },
                        description: null,
                        uuid: 'tool-uuid-1',
                        parentUUID: null
                    }],
                    isSidechain: false
                }
            ];
            
            const result3 = reducer(state, toolMessages, agentState2);
            expect(result3.messages).toHaveLength(1);
            if (result3.messages[0].kind === 'tool-call') {
                expect(result3.messages[0].tool.startedAt).toBe(3000);
            }
            
            // Step 4: Tool result arrives
            const resultMessages: NormalizedMessage[] = [
                {
                    id: 'msg-2',
                    localId: null,
                    createdAt: 4000,
                    seq: 1,
                    role: 'agent',
                    content: [{
                        type: 'tool-result',
                        tool_use_id: 'tool-1',
                        content: 'File contents',
                        is_error: false,
                        uuid: 'result-uuid-1',
                        parentUUID: null
                    }],
                    isSidechain: false
                }
            ];
            
            const result4 = reducer(state, resultMessages, agentState2);
            expect(result4.messages).toHaveLength(1);
            if (result4.messages[0].kind === 'tool-call') {
                expect(result4.messages[0].tool.state).toBe('completed');
                expect(result4.messages[0].tool.result).toBe('File contents');
                expect(result4.messages[0].tool.completedAt).toBe(4000);
            }
        });

        it('should handle denied and canceled permissions correctly', () => {
            const state = createReducer();
            
            // Create two permissions
            const agentState1: AgentState = {
                requests: {
                    'tool-deny': {
                        tool: 'Write',
                        arguments: { file: '/secure.txt', content: 'hack' },
                        createdAt: 1000
                    },
                    'tool-cancel': {
                        tool: 'Delete',
                        arguments: { file: '/important.txt' },
                        createdAt: 1500
                    }
                }
            };
            
            const result1 = reducer(state, [], agentState1);
            expect(result1.messages).toHaveLength(2);
            
            // Deny first, cancel second
            const agentState2: AgentState = {
                completedRequests: {
                    'tool-deny': {
                        tool: 'Write',
                        arguments: { file: '/secure.txt', content: 'hack' },
                        createdAt: 1000,
                        completedAt: 2000,
                        status: 'denied',
                        reason: 'Unauthorized access'
                    },
                    'tool-cancel': {
                        tool: 'Delete',
                        arguments: { file: '/important.txt' },
                        createdAt: 1500,
                        completedAt: 2500,
                        status: 'canceled',
                        reason: 'User canceled'
                    }
                }
            };
            
            const result2 = reducer(state, [], agentState2);
            expect(result2.messages).toHaveLength(2);
            
            const deniedMsg = result2.messages.find(m => 
                m.kind === 'tool-call' && m.tool.name === 'Write'
            );
            const canceledMsg = result2.messages.find(m => 
                m.kind === 'tool-call' && m.tool.name === 'Delete'
            );
            
            if (deniedMsg?.kind === 'tool-call') {
                expect(deniedMsg.tool.state).toBe('error');
                expect(deniedMsg.tool.permission?.status).toBe('denied');
                expect(deniedMsg.tool.permission?.reason).toBe('Unauthorized access');
                expect(deniedMsg.tool.result).toEqual({ error: 'Unauthorized access' });
            }
            
            if (canceledMsg?.kind === 'tool-call') {
                expect(canceledMsg.tool.state).toBe('error');
                expect(canceledMsg.tool.permission?.status).toBe('canceled');
                expect(canceledMsg.tool.permission?.reason).toBe('User canceled');
                expect(canceledMsg.tool.result).toEqual({ error: 'User canceled' });
            }
        });

        it('should handle tool result arriving before tool call (race condition)', () => {
            const state = createReducer();
            
            // Tool result arrives first
            const resultMessages: NormalizedMessage[] = [
                {
                    id: 'msg-1',
                    localId: null,
                    createdAt: 1000,
                    seq: 1,
                    role: 'agent',
                    content: [{
                        type: 'tool-result',
                        tool_use_id: 'tool-1',
                        content: 'Success',
                        is_error: false,
                        uuid: 'result-uuid-1',
                        parentUUID: null
                    }],
                    isSidechain: false
                }
            ];
            
            const result1 = reducer(state, resultMessages);
            expect(result1.messages).toHaveLength(0); // Should not create anything
            
            // Tool call arrives later
            const toolMessages: NormalizedMessage[] = [
                {
                    id: 'msg-2',
                    localId: null,
                    createdAt: 2000,
                    seq: 1,
                    role: 'agent',
                    content: [{
                        type: 'tool-call',
                        id: 'tool-1',
                        name: 'Test',
                        input: { test: true },
                        description: null,
                        uuid: 'tool-uuid-1',
                        parentUUID: null
                    }],
                    isSidechain: false
                }
            ];
            
            const result2 = reducer(state, toolMessages);
            expect(result2.messages).toHaveLength(1);
            if (result2.messages[0].kind === 'tool-call') {
                expect(result2.messages[0].tool.state).toBe('completed');
                expect(result2.messages[0].tool.result).toBe('Success');
                expect(result2.messages[0].tool.completedAt).toBe(1000);
            }
            
            // Result arrives again (with different message ID since it's a new message)
            const resultMessages2: NormalizedMessage[] = [
                {
                    id: 'msg-3',
                    localId: null,
                    createdAt: 3000,
                    seq: 1,
                    role: 'agent',
                    content: [{
                        type: 'tool-result',
                        tool_use_id: 'tool-1',
                        content: 'Success',
                        is_error: false,
                        uuid: 'result-uuid-2',
                        parentUUID: null
                    }],
                    isSidechain: false
                }
            ];
            
            const result3 = reducer(state, resultMessages2, null);

            expect(result3.messages).toHaveLength(0);
            expect(state.pendingToolResults.size).toBe(0);
        });

        it('should handle interleaved messages from multiple sources correctly', () => {
            const state = createReducer();
            
            // Mix of user messages, permissions, and tool calls
            const agentState: AgentState = {
                requests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'echo "hello"' },
                        createdAt: 1500
                    }
                },
                completedRequests: {
                    'tool-2': {
                        tool: 'Read',
                        arguments: { file: 'test.txt' },
                        createdAt: 500,
                        completedAt: 1000,
                        status: 'approved'
                    }
                }
            };
            
            const messages: NormalizedMessage[] = [
                // User message
                {
                    id: 'user-1',
                    localId: 'local-1',
                    createdAt: 1000,
                    seq: 1,
                    role: 'user',
                    content: { type: 'text', text: 'Do something' },
                    isSidechain: false
                },
                // Agent text
                {
                    id: 'agent-1',
                    localId: null,
                    createdAt: 2000,
                    seq: 1,
                    role: 'agent',
                    content: [{
                        type: 'text',
                        text: 'I will help you',
                        uuid: 'agent-uuid-1',
                        parentUUID: null
                    }],
                    isSidechain: false
                },
                // Tool call
                {
                    id: 'tool-1',
                    localId: null,
                    createdAt: 3000,
                    seq: 1,
                    role: 'agent',
                    content: [{
                        type: 'tool-call',
                        id: 'tool-new',
                        name: 'Write',
                        input: { file: 'output.txt', content: 'data' },
                        description: null,
                        uuid: 'tool-uuid-1',
                        parentUUID: null
                    }],
                    isSidechain: false
                }
            ];
            
            const result = reducer(state, messages, agentState);
            
            // Should create: 1 user, 1 agent text, 1 tool from permission request,
            // 1 tool from completed permission, 1 new tool call
            expect(result.messages).toHaveLength(5);
            
            const types = result.messages.map(m => m.kind).sort();
            expect(types).toEqual(['agent-text', 'tool-call', 'tool-call', 'tool-call', 'user-text']);
            
            // Verify each has correct properties
            const userMsg = result.messages.find(m => m.kind === 'user-text');
            expect(userMsg?.createdAt).toBe(1000);
            
            const pendingPerm = result.messages.find(m => 
                m.kind === 'tool-call' && m.tool.permission?.status === 'pending'
            );
            expect(pendingPerm).toBeDefined();
            
            const approvedPerm = result.messages.find(m => 
                m.kind === 'tool-call' && m.tool.permission?.status === 'approved'
            );
            expect(approvedPerm).toBeDefined();
        });

        it('should not allow multiple tool results for the same tool ID', () => {
            const state = createReducer();
            
            // Create a tool call
            const toolMessages: NormalizedMessage[] = [
                {
                    id: 'msg-1',
                    localId: null,
                    createdAt: 1000,
                    seq: 1,
                    role: 'agent',
                    content: [{
                        type: 'tool-call',
                        id: 'tool-1',
                        name: 'Test',
                        input: {},
                        description: null,
                        uuid: 'tool-uuid-1',
                        parentUUID: null
                    }],
                    isSidechain: false
                }
            ];
            
            reducer(state, toolMessages);
            
            // First result
            const result1Messages: NormalizedMessage[] = [
                {
                    id: 'msg-2',
                    localId: null,
                    createdAt: 2000,
                    seq: 1,
                    role: 'agent',
                    content: [{
                        type: 'tool-result',
                        tool_use_id: 'tool-1',
                        content: 'First result',
                        is_error: false,
                        uuid: 'result-uuid-1',
                        parentUUID: null
                    }],
                    isSidechain: false
                }
            ];
            
            const result1 = reducer(state, result1Messages);
            expect(result1.messages).toHaveLength(1);
            if (result1.messages[0].kind === 'tool-call') {
                expect(result1.messages[0].tool.state).toBe('completed');
                expect(result1.messages[0].tool.result).toBe('First result');
            }
            
            // Second result (should be ignored)
            const result2Messages: NormalizedMessage[] = [
                {
                    id: 'msg-3',
                    localId: null,
                    createdAt: 3000,
                    seq: 1,
                    role: 'agent',
                    content: [{
                        type: 'tool-result',
                        tool_use_id: 'tool-1',
                        content: 'Should not override',
                        is_error: true,
                        uuid: 'result-uuid-2',
                        parentUUID: null
                    }],
                    isSidechain: false
                }
            ];
            
            const result2 = reducer(state, result2Messages);
            expect(result2.messages).toHaveLength(0); // No changes
            
            // Verify original result is preserved
            const toolMsgId = state.toolIdToMessageId.get('tool-1');
            const toolMsg = state.messages.get(toolMsgId!);
            expect(toolMsg?.tool?.state).toBe('completed');
            expect(toolMsg?.tool?.result).toBe('First result');
        });

        it('should handle permission updates after tool execution started', () => {
            const state = createReducer();
            
            // Create approved permission
            const agentState1: AgentState = {
                completedRequests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'ls' },
                        createdAt: 1000,
                        completedAt: 2000,
                        status: 'approved'
                    }
                }
            };
            
            reducer(state, [], agentState1);
            
            // Tool call arrives and matches
            const toolMessages: NormalizedMessage[] = [
                {
                    id: 'msg-1',
                    localId: null,
                    createdAt: 3000,
                    seq: 1,
                    role: 'agent',
                    content: [{
                        type: 'tool-call',
                        id: 'tool-1',
                        name: 'Bash',
                        input: { command: 'ls' },
                        description: null,
                        uuid: 'tool-uuid-1',
                        parentUUID: null
                    }],
                    isSidechain: false
                }
            ];
            
            reducer(state, toolMessages, agentState1);
            
            // Try to change permission status (should not affect running tool)
            const agentState2: AgentState = {
                completedRequests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'ls' },
                        createdAt: 1000,
                        completedAt: 4000,
                        status: 'denied',
                        reason: 'Changed mind'
                    }
                }
            };
            
            const result = reducer(state, [], agentState2);
            expect(result.messages).toHaveLength(0); // No changes, tool already started
            
            // Verify tool is still running
            const permMsgId = state.toolIdToMessageId.get('tool-1');
            const permMsg = state.messages.get(permMsgId!);
            expect(permMsg?.tool?.state).toBe('running');
            expect(permMsg?.tool?.permission?.status).toBe('approved'); // Status unchanged
        });

        it('should handle empty or null AgentState gracefully', () => {
            const state = createReducer();
            
            // Test with null
            const result1 = reducer(state, [], null);
            expect(result1.messages).toHaveLength(0);
            
            // Test with undefined
            const result2 = reducer(state, [], undefined);
            expect(result2.messages).toHaveLength(0);
            
            // Test with empty AgentState
            const emptyState: AgentState = {};
            const result3 = reducer(state, [], emptyState);
            expect(result3.messages).toHaveLength(0);
            
            // Test with null requests/completedRequests
            const partialState: AgentState = {
                requests: null,
                completedRequests: null
            };
            const result4 = reducer(state, [], partialState);
            expect(result4.messages).toHaveLength(0);
        });

        it('should match completed permissions and tool calls by ID even with different arguments', () => {
            const state = createReducer();
            
            // AgentState has completed permission for Bash with 'ls' command
            const agentState: AgentState = {
                completedRequests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'ls' },
                        createdAt: 1000,
                        completedAt: 1500,
                        status: 'approved'
                    }
                }
            };
            
            // Incoming messages have tool call for Bash with 'pwd' command
            const messages: NormalizedMessage[] = [
                {
                    id: 'msg-1',
                    localId: null,
                    createdAt: 2000,
                    seq: 1,
                    role: 'agent',
                    content: [{
                        type: 'tool-call',
                        id: 'tool-1',
                        name: 'Bash',
                        input: { command: 'pwd' },
                        description: null,
                        uuid: 'tool-uuid-1',
                        parentUUID: null
                    }],
                    isSidechain: false
                }
            ];
            
            const result = reducer(state, messages, agentState);
            
            // Should update the existing permission message (ID match)
            expect(result.messages).toHaveLength(1);
            
            // The message should have the permission's arguments
            const toolMessage = result.messages[0];
            expect(toolMessage.kind).toBe('tool-call');
            if (toolMessage.kind === 'tool-call') {
                expect(toolMessage.tool.name).toBe('Bash');
                // Keeps original permission arguments
                expect(toolMessage.tool.input).toEqual({ command: 'ls' });
                expect(toolMessage.tool.permission?.status).toBe('approved');
            }
        });

        it('should maintain correct state across many operations', () => {
            const state = createReducer();
            let totalMessages = 0;
            
            // Simulate a long conversation with many operations
            for (let i = 0; i < 10; i++) {
                // Add user message
                const userMsg: NormalizedMessage[] = [
                    {
                        id: `user-${i}`,
                        localId: `local-${i}`,
                        createdAt: i * 1000,
                        seq: 1,
                        role: 'user',
                        content: { type: 'text', text: `Message ${i}` },
                        isSidechain: false
                    }
                ];
                
                const userResult = reducer(state, userMsg);
                expect(userResult.messages).toHaveLength(1);
                totalMessages++;
                
                // Add permission
                const agentState: AgentState = {
                    requests: {
                        [`perm-${i}`]: {
                            tool: 'Test',
                            arguments: { index: i },
                            createdAt: i * 1000 + 100
                        }
                    }
                };
                
                const permResult = reducer(state, [], agentState);
                expect(permResult.messages).toHaveLength(1);
                totalMessages++;
                
                // Approve permission
                const approvedState: AgentState = {
                    completedRequests: {
                        [`perm-${i}`]: {
                            tool: 'Test',
                            arguments: { index: i },
                            createdAt: i * 1000 + 100,
                            completedAt: i * 1000 + 200,
                            status: 'approved'
                        }
                    }
                };
                
                reducer(state, [], approvedState);
            }
            
            // Verify state integrity
            expect(state.messages.size).toBe(totalMessages);
            expect(state.toolIdToMessageId.size).toBe(10);
            expect(state.localIds.size).toBe(10);
            
            // Try to add duplicates (should not increase count)
            const duplicateUser: NormalizedMessage[] = [
                {
                    id: 'user-0',
                    localId: 'local-0',
                    createdAt: 0,
                    seq: 1,
                    role: 'user',
                    content: { type: 'text', text: 'Duplicate' },
                    isSidechain: false
                }
            ];
            
            const dupResult = reducer(state, duplicateUser);
            expect(dupResult.messages).toHaveLength(0);
            expect(state.messages.size).toBe(totalMessages); // No increase
        });

        it('should NOT create duplicate messages for pending permission requests', () => {
            const state = createReducer();
            
            // AgentState with a pending permission request
            const agentState: AgentState = {
                requests: {
                    'tool-pending-1': {
                        tool: 'Bash',
                        arguments: { command: 'ls -la' },
                        createdAt: 1000
                    }
                }
            };
            
            // Process the pending permission - should create exactly ONE message
            const result1 = reducer(state, [], agentState);
            expect(result1.messages).toHaveLength(1);
            expect(result1.messages[0].kind).toBe('tool-call');
            
            // Verify only one message exists
            const pendingMessageId = state.toolIdToMessageId.get('tool-pending-1');
            expect(pendingMessageId).toBeDefined();
            expect(state.messages.size).toBe(1);
            
            // Process again with same state - should not create duplicate
            const result2 = reducer(state, [], agentState);
            expect(result2.messages).toHaveLength(0); // No new messages
            expect(state.messages.size).toBe(1); // Still only one message
            
            // Verify the message has correct permission status
            const message = state.messages.get(pendingMessageId!);
            expect(message?.tool?.permission?.status).toBe('pending');
            expect(message?.tool?.permission?.id).toBe('tool-pending-1');
        });

        it('should match permissions when tool messages are loaded BEFORE AgentState', () => {
            const state = createReducer();
            
            // First, process the tool call message (as if loaded from storage)
            const toolMessage: NormalizedMessage = {
                id: 'msg-1',
                localId: null,
                createdAt: 1000,
                seq: 1,
                role: 'agent',
                content: [{
                    type: 'tool-call',
                    id: 'tool-1',
                    name: 'Bash',
                    input: { command: 'ls -la' },
                    description: null,
                    uuid: 'tool-uuid-1',
                    parentUUID: null
                }],
                isSidechain: false
            };
            
            const messages = [toolMessage];
            const result1 = reducer(state, messages);
            
            // Should create the tool message
            expect(result1.messages).toHaveLength(1);
            expect(state.messages.size).toBe(1);
            
            // Now process the AgentState with pending permission
            const agentState: AgentState = {
                requests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'ls -la' },
                        createdAt: 900  // Permission requested before the tool call
                    }
                }
            };
            
            const result2 = reducer(state, [], agentState);
            
            // Should NOT create a new message, but update the existing one
            expect(result2.messages).toHaveLength(1); // The updated message
            expect(state.messages.size).toBe(1); // Still only one message
            
            // The existing tool message should now have the permission attached
            const messageId = state.toolIdToMessageId.get('tool-1');
            expect(messageId).toBeDefined();
            
            const message = state.messages.get(messageId!);
            expect(message?.tool?.name).toBe('Bash');
            expect(message?.tool?.permission?.status).toBe('pending');
            expect(message?.tool?.permission?.id).toBe('tool-1');
        });

        it('should match permissions when tool messages are loaded AFTER AgentState', () => {
            const state = createReducer();
            
            // First, process the AgentState with pending permission
            const agentState: AgentState = {
                requests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'ls -la' },
                        createdAt: 900
                    }
                }
            };
            
            const result1 = reducer(state, [], agentState);
            
            // Should create a permission message
            expect(result1.messages).toHaveLength(1);
            expect(state.messages.size).toBe(1);
            
            // Now process the tool call message
            const toolMessage: NormalizedMessage = {
                id: 'msg-1',
                localId: null,
                createdAt: 1000,
                seq: 1,
                role: 'agent',
                content: [{
                    type: 'tool-call',
                    id: 'tool-1',
                    name: 'Bash',
                    input: { command: 'ls -la' },
                    description: null,
                    uuid: 'tool-uuid-1',
                    parentUUID: null
                }],
                isSidechain: false
            };
            
            const messages = [toolMessage];
            const result2 = reducer(state, messages, agentState);
            
            // Should NOT create a new message, but update the existing permission message
            expect(result2.messages).toHaveLength(1); // The updated message
            expect(state.messages.size).toBe(1); // Still only one message
            
            // The permission message should now be linked to the tool
            const messageId = state.toolIdToMessageId.get('tool-1');
            expect(messageId).toBeDefined();
            
            const message = state.messages.get(messageId!);
            expect(message?.tool?.name).toBe('Bash');
            expect(message?.tool?.permission?.status).toBe('pending');
            expect(message?.tool?.permission?.id).toBe('tool-1');
            expect(message?.tool?.startedAt).toBe(1000); // From the tool message
        });

        it('should not downgrade approved permission to pending when AgentState has both', () => {
            const state = createReducer();
            
            // AgentState with both pending and completed for same permission
            // This can happen when server sends stale data
            const agentState: AgentState = {
                requests: {
                    'tool-1': {
                        tool: 'Bash', 
                        arguments: { command: 'ls -la' },
                        createdAt: 1000
                    }
                },
                completedRequests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'ls -la' },
                        createdAt: 1000,
                        completedAt: 2000,
                        status: 'approved'
                    }
                }
            };
            
            // Process tool message
            const toolMessage: NormalizedMessage = {
                id: 'msg-1',
                localId: null,
                createdAt: 1500,
                seq: 1,
                role: 'agent',
                content: [{
                    type: 'tool-call',
                    id: 'tool-1',
                    name: 'Bash',
                    input: { command: 'ls -la' },
                    description: null,
                    uuid: 'tool-uuid-1',
                    parentUUID: null
                }],
                isSidechain: false
            };
            
            const messages = [toolMessage];
            const result = reducer(state, messages, agentState);
            
            // Should create one message
            expect(result.messages).toHaveLength(1);
            
            // Permission should be approved, NOT pending
            const messageId = state.toolIdToMessageId.get('tool-1');
            expect(messageId).toBeDefined();
            const message = state.messages.get(messageId!);
            expect(message).toBeDefined();
            expect(message?.tool).toBeDefined();
            expect(message?.tool?.permission).toBeDefined();
            expect(message?.tool?.permission?.status).toBe('approved'); // Not 'pending'!
        });

        it('should update permission status when AgentState changes from pending to approved', () => {
            const state = createReducer();
            
            // First, create a tool message with pending permission
            const agentState1: AgentState = {
                requests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'ls -la' },
                        createdAt: 1000
                    }
                }
            };
            
            const toolMessage: NormalizedMessage = {
                id: 'msg-1',
                localId: null,
                createdAt: 1500,
                seq: 1,
                role: 'agent',
                content: [{
                    type: 'tool-call',
                    id: 'tool-1',
                    name: 'Bash',
                    input: { command: 'ls -la' },
                    description: null,
                    uuid: 'tool-uuid-1',
                    parentUUID: null
                }],
                isSidechain: false
            };
            
            // Process with pending permission
            const messages = [toolMessage];
            const result1 = reducer(state, messages, agentState1);
            
            // Should create one message with pending permission
            expect(result1.messages).toHaveLength(1);
            expect(state.messages.size).toBe(1);
            
            const messageId = state.toolIdToMessageId.get('tool-1');
            expect(messageId).toBeDefined();
            
            let message = state.messages.get(messageId!);
            expect(message?.tool?.permission?.status).toBe('pending');
            
            // Now update AgentState to approved
            const agentState2: AgentState = {
                completedRequests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'ls -la' },
                        createdAt: 1000,
                        completedAt: 2000,
                        status: 'approved'
                    }
                }
            };
            
            // Process only the new AgentState (simulating applySessions update)
            const result2 = reducer(state, [], agentState2);
            
            // Should return the updated message
            expect(result2.messages).toHaveLength(1);
            expect(state.messages.size).toBe(1); // Still only one message
            
            // Check that the permission status was updated
            message = state.messages.get(messageId!);
            expect(message?.tool?.permission?.status).toBe('approved');
            expect(message?.tool?.permission?.id).toBe('tool-1');
        });

        it('should handle app loading flow: tool loaded first, then AgentState with approved permission', () => {
            const state = createReducer();
            
            // Step 1: Load tool message first (without AgentState) - simulates messages loaded before sessions
            const toolMessage: NormalizedMessage = {
                id: 'msg-1',
                localId: null,
                createdAt: 1500,
                seq: 1,
                role: 'agent',
                content: [{
                    type: 'tool-call',
                    id: 'tool-1',
                    name: 'Bash',
                    input: { command: 'ls -la' },
                    description: null,
                    uuid: 'tool-uuid-1',
                    parentUUID: null
                }],
                isSidechain: false
            };
            
            const messages = [toolMessage];
            const result1 = reducer(state, messages); // No AgentState
            
            // Tool should be created without permission
            expect(result1.messages).toHaveLength(1);
            const toolMsgId = state.toolIdToMessageId.get('tool-1');
            expect(toolMsgId).toBeDefined();
            let toolMsg = state.messages.get(toolMsgId!);
            expect(toolMsg?.tool?.permission).toBeUndefined();
            expect(toolMsg?.tool?.state).toBe('running');
            
            // Step 2: AgentState arrives with both pending and approved (sessions loaded)
            const agentState: AgentState = {
                requests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'ls -la' },
                        createdAt: 1000
                    }
                },
                completedRequests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'ls -la' },
                        createdAt: 1000,
                        completedAt: 2000,
                        status: 'approved'
                    }
                }
            };
            
            const result2 = reducer(state, [], agentState);
            
            // Should update the existing tool with approved permission
            expect(result2.messages).toHaveLength(1); // Updated message
            expect(state.messages.size).toBe(1); // Still only one message
            
            toolMsg = state.messages.get(toolMsgId!);
            expect(toolMsg?.tool?.permission).toBeDefined();
            expect(toolMsg?.tool?.permission?.status).toBe('approved');
            expect(toolMsg?.tool?.permission?.id).toBe('tool-1');
            expect(toolMsg?.tool?.state).toBe('running'); // Should stay running for approved
        });

        it('should handle app loading flow: tool loaded first, then AgentState with denied permission', () => {
            const state = createReducer();
            
            // Step 1: Load tool message first
            const toolMessage: NormalizedMessage = {
                id: 'msg-1',
                localId: null,
                createdAt: 1500,
                seq: 1,
                role: 'agent',
                content: [{
                    type: 'tool-call',
                    id: 'tool-1',
                    name: 'Bash',
                    input: { command: 'rm -rf /' },
                    description: null,
                    uuid: 'tool-uuid-1',
                    parentUUID: null
                }],
                isSidechain: false
            };
            
            const messages = [toolMessage];
            reducer(state, messages);
            
            // Step 2: AgentState arrives with denied permission
            const agentState: AgentState = {
                requests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'rm -rf /' },
                        createdAt: 1000
                    }
                },
                completedRequests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'rm -rf /' },
                        createdAt: 1000,
                        completedAt: 2000,
                        status: 'denied',
                        reason: 'Dangerous command'
                    }
                }
            };
            
            const result2 = reducer(state, [], agentState);
            
            // Should update the existing tool with denied permission
            expect(result2.messages).toHaveLength(1);
            
            const toolMsgId = state.toolIdToMessageId.get('tool-1');
            const toolMsg = state.messages.get(toolMsgId!);
            expect(toolMsg?.tool?.permission?.status).toBe('denied');
            expect(toolMsg?.tool?.permission?.reason).toBe('Dangerous command');
            expect(toolMsg?.tool?.state).toBe('error'); // Should change to error
            expect(toolMsg?.tool?.completedAt).toBeDefined();
            expect(toolMsg?.tool?.result).toEqual({ error: 'Dangerous command' });
        });

        it('should handle app loading flow: tool loaded first, then AgentState with canceled permission', () => {
            const state = createReducer();
            
            // Step 1: Load tool message first
            const toolMessage: NormalizedMessage = {
                id: 'msg-1',
                localId: null,
                createdAt: 1500,
                seq: 1,
                role: 'agent',
                content: [{
                    type: 'tool-call',
                    id: 'tool-1',
                    name: 'Bash',
                    input: { command: 'sleep 3600' },
                    description: null,
                    uuid: 'tool-uuid-1',
                    parentUUID: null
                }],
                isSidechain: false
            };
            
            const messages = [toolMessage];
            reducer(state, messages);
            
            // Step 2: AgentState arrives with canceled permission
            const agentState: AgentState = {
                requests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'sleep 3600' },
                        createdAt: 1000
                    }
                },
                completedRequests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'sleep 3600' },
                        createdAt: 1000,
                        completedAt: 2000,
                        status: 'canceled',
                        reason: 'User canceled'
                    }
                }
            };
            
            const result2 = reducer(state, [], agentState);
            
            // Should update the existing tool with canceled permission
            expect(result2.messages).toHaveLength(1);
            
            const toolMsgId = state.toolIdToMessageId.get('tool-1');
            const toolMsg = state.messages.get(toolMsgId!);
            expect(toolMsg?.tool?.permission?.status).toBe('canceled');
            expect(toolMsg?.tool?.permission?.reason).toBe('User canceled');
            expect(toolMsg?.tool?.state).toBe('error'); // Should change to error
            expect(toolMsg?.tool?.completedAt).toBeDefined();
            expect(toolMsg?.tool?.result).toEqual({ error: 'User canceled' });
        });

        it('should handle permission state transitions correctly', () => {
            const state = createReducer();
            
            // Start with pending permission
            const agentState1: AgentState = {
                requests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'echo test' },
                        createdAt: 1000
                    }
                }
            };
            
            const result1 = reducer(state, [], agentState1);
            expect(result1.messages).toHaveLength(1);
            
            const permMsgId = state.toolIdToMessageId.get('tool-1');
            let msg = state.messages.get(permMsgId!);
            expect(msg?.tool?.permission?.status).toBe('pending');
            expect(msg?.tool?.state).toBe('running');
            
            // Transition to approved
            const agentState2: AgentState = {
                completedRequests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'echo test' },
                        createdAt: 1000,
                        completedAt: 2000,
                        status: 'approved'
                    }
                }
            };
            
            const result2 = reducer(state, [], agentState2);
            expect(result2.messages).toHaveLength(1);
            
            msg = state.messages.get(permMsgId!);
            expect(msg?.tool?.permission?.status).toBe('approved');
            expect(msg?.tool?.state).toBe('running'); // Should stay running
            expect(msg?.tool?.completedAt).toBeNull(); // Not completed yet
            
            // Now simulate a different scenario: transition from pending to denied
            const state2 = createReducer();
            const agentState3: AgentState = {
                requests: {
                    'tool-2': {
                        tool: 'Bash',
                        arguments: { command: 'echo denied' },
                        createdAt: 3000
                    }
                }
            };
            
            reducer(state2, [], agentState3);
            
            const agentState4: AgentState = {
                completedRequests: {
                    'tool-2': {
                        tool: 'Bash',
                        arguments: { command: 'echo denied' },
                        createdAt: 3000,
                        completedAt: 4000,
                        status: 'denied',
                        reason: 'Not allowed'
                    }
                }
            };
            
            const result4 = reducer(state2, [], agentState4);
            expect(result4.messages).toHaveLength(1);
            
            const permMsgId2 = state2.toolIdToMessageId.get('tool-2');
            const msg2 = state2.messages.get(permMsgId2!);
            expect(msg2?.tool?.permission?.status).toBe('denied');
            expect(msg2?.tool?.state).toBe('error'); // Should change to error
            expect(msg2?.tool?.completedAt).toBe(4000);
            expect(msg2?.tool?.result).toEqual({ error: 'Not allowed' });
        });

        it('should handle finished tool: completed successfully, then AgentState with approved permission', () => {
            const state = createReducer();
            
            // Step 1: Load tool message that's already completed
            const toolMessage: NormalizedMessage = {
                id: 'msg-1',
                localId: null,
                createdAt: 1500,
                seq: 1,
                role: 'agent',
                isSidechain: false,
                content: [{
                    type: 'tool-call',
                    id: 'tool-1',
                    name: 'Bash',
                    input: { command: 'echo success' },
                    description: null,
                    uuid: 'tool-uuid-1',
                    parentUUID: null
                }]
            };
            
            // Tool result message
            const resultMessage: NormalizedMessage = {
                id: 'msg-2',
                localId: null,
                createdAt: 2000,
                seq: 1,
                role: 'agent',
                isSidechain: false,
                content: [{
                    type: 'tool-result',
                    tool_use_id: 'tool-1',
                    content: 'success\n',
                    is_error: false,
                    uuid: 'tool-uuid-2',
                    parentUUID: null
                }]
            };
            
            const messages = [toolMessage, resultMessage];
            reducer(state, messages);
            
            // Verify tool is completed
            const toolMsgId = state.toolIdToMessageId.get('tool-1');
            let toolMsg = state.messages.get(toolMsgId!);
            expect(toolMsg?.tool?.state).toBe('completed');
            expect(toolMsg?.tool?.result).toBe('success\n');
            expect(toolMsg?.tool?.permission).toBeUndefined();
            
            // Step 2: AgentState arrives with approved permission
            const agentState: AgentState = {
                requests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'echo success' },
                        createdAt: 1000
                    }
                },
                completedRequests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'echo success' },
                        createdAt: 1000,
                        completedAt: 1400,
                        status: 'approved'
                    }
                }
            };
            
            const result = reducer(state, [], agentState);
            
            // Permission should be attached but tool should remain completed
            expect(result.messages).toHaveLength(1);
            toolMsg = state.messages.get(toolMsgId!);
            expect(toolMsg?.tool?.permission?.status).toBe('approved');
            expect(toolMsg?.tool?.state).toBe('completed'); // Should stay completed
            expect(toolMsg?.tool?.result).toBe('success\n'); // Result unchanged
        });

        it('should handle finished tool: completed successfully, then AgentState with denied permission', () => {
            const state = createReducer();
            
            // Step 1: Load completed tool
            const toolMessage: NormalizedMessage = {
                id: 'msg-1',
                localId: null,
                createdAt: 1500,
                seq: 1,
                role: 'agent',
                isSidechain: false,
                content: [{
                    type: 'tool-call',
                    id: 'tool-1',
                    name: 'Bash',
                    input: { command: 'rm important.txt' },
                    description: null,
                    uuid: 'tool-uuid-1',
                    parentUUID: null
                }]
            };
            
            const resultMessage: NormalizedMessage = {
                id: 'msg-2',
                localId: null,
                createdAt: 2000,
                seq: 1,
                role: 'agent',
                isSidechain: false,
                content: [{
                    type: 'tool-result',
                    tool_use_id: 'tool-1',
                    content: 'file removed',
                    is_error: false,
                    uuid: 'tool-uuid-2',
                    parentUUID: null
                }]
            };
            
            reducer(state, [toolMessage, resultMessage]);
            
            const toolMsgId = state.toolIdToMessageId.get('tool-1');
            let toolMsg = state.messages.get(toolMsgId!);
            expect(toolMsg?.tool?.state).toBe('completed');
            
            // Step 2: AgentState with denied permission (too late!)
            const agentState: AgentState = {
                requests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'rm important.txt' },
                        createdAt: 1000
                    }
                },
                completedRequests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'rm important.txt' },
                        createdAt: 1000,
                        completedAt: 1400,
                        status: 'denied',
                        reason: 'Dangerous operation'
                    }
                }
            };
            
            reducer(state, [], agentState);
            
            // Tool should NOT change to error (already executed)
            toolMsg = state.messages.get(toolMsgId!);
            expect(toolMsg?.tool?.permission?.status).toBe('denied');
            expect(toolMsg?.tool?.permission?.reason).toBe('Dangerous operation');
            expect(toolMsg?.tool?.state).toBe('completed'); // Should stay completed, not error
            expect(toolMsg?.tool?.result).toBe('file removed'); // Result unchanged
        });

        it('should handle finished tool: errored, then AgentState with approved permission', () => {
            const state = createReducer();
            
            // Step 1: Load tool that errored
            const toolMessage: NormalizedMessage = {
                id: 'msg-1',
                localId: null,
                createdAt: 1500,
                seq: 1,
                role: 'agent',
                isSidechain: false,
                content: [{
                    type: 'tool-call',
                    id: 'tool-1',
                    name: 'Bash',
                    input: { command: 'cat /nonexistent' },
                    description: null,
                    uuid: 'tool-uuid-1',
                    parentUUID: null
                }]
            };
            
            const errorMessage: NormalizedMessage = {
                id: 'msg-2',
                localId: null,
                createdAt: 2000,
                seq: 1,
                role: 'agent',
                isSidechain: false,
                content: [{
                    type: 'tool-result',
                    tool_use_id: 'tool-1',
                    content: 'File not found',
                    is_error: true,
                    uuid: 'tool-uuid-2',
                    parentUUID: null
                }]
            };
            
            reducer(state, [toolMessage, errorMessage]);
            
            const toolMsgId = state.toolIdToMessageId.get('tool-1');
            let toolMsg = state.messages.get(toolMsgId!);
            expect(toolMsg?.tool?.state).toBe('error');
            expect(toolMsg?.tool?.result).toBe('File not found');
            
            // Step 2: AgentState with approved permission (too late to help)
            const agentState: AgentState = {
                completedRequests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'cat /nonexistent' },
                        createdAt: 1000,
                        completedAt: 1400,
                        status: 'approved'
                    }
                }
            };
            
            reducer(state, [], agentState);
            
            // Permission attached but error state maintained
            toolMsg = state.messages.get(toolMsgId!);
            expect(toolMsg?.tool?.permission?.status).toBe('approved');
            expect(toolMsg?.tool?.state).toBe('error'); // Should stay error
            expect(toolMsg?.tool?.result).toBe('File not found'); // Error unchanged
        });

        it('should handle finished tool: errored, then AgentState with denied permission', () => {
            const state = createReducer();
            
            // Step 1: Load tool that errored
            const toolMessage: NormalizedMessage = {
                id: 'msg-1',
                localId: null,
                createdAt: 1500,
                seq: 1,
                role: 'agent',
                isSidechain: false,
                content: [{
                    type: 'tool-call',
                    id: 'tool-1',
                    name: 'Bash',
                    input: { command: 'sudo rm -rf /' },
                    description: null,
                    uuid: 'tool-uuid-1',
                    parentUUID: null
                }]
            };
            
            const errorMessage: NormalizedMessage = {
                id: 'msg-2',
                localId: null,
                createdAt: 2000,
                seq: 1,
                role: 'agent',
                isSidechain: false,
                content: [{
                    type: 'tool-result',
                    tool_use_id: 'tool-1',
                    content: 'Permission denied',
                    is_error: true,
                    uuid: 'tool-uuid-2',
                    parentUUID: null
                }]
            };
            
            reducer(state, [toolMessage, errorMessage]);
            
            // Step 2: AgentState with denied permission
            const agentState: AgentState = {
                completedRequests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'sudo rm -rf /' },
                        createdAt: 1000,
                        completedAt: 1400,
                        status: 'denied',
                        reason: 'Extremely dangerous'
                    }
                }
            };
            
            reducer(state, [], agentState);
            
            // Both permission and error should be present
            const toolMsgId = state.toolIdToMessageId.get('tool-1');
            const toolMsg = state.messages.get(toolMsgId!);
            expect(toolMsg?.tool?.permission?.status).toBe('denied');
            expect(toolMsg?.tool?.permission?.reason).toBe('Extremely dangerous');
            expect(toolMsg?.tool?.state).toBe('error');
            expect(toolMsg?.tool?.result).toBe('Permission denied'); // Original error
        });

        it('should handle finished tool: with multiple messages in sequence', () => {
            const state = createReducer();
            
            // Step 1: Tool call
            const toolMessage: NormalizedMessage = {
                id: 'msg-1',
                localId: null,
                createdAt: 1500,
                seq: 1,
                role: 'agent',
                isSidechain: false,
                content: [{
                    type: 'tool-call',
                    id: 'tool-1',
                    name: 'Bash',
                    input: { command: 'ls -la' },
                    description: null,
                    uuid: 'tool-uuid-1',
                    parentUUID: null
                }]
            };
            
            reducer(state, [toolMessage]);
            
            // Step 2: Tool result arrives
            const resultMessage: NormalizedMessage = {
                id: 'msg-2',
                localId: null,
                createdAt: 2000,
                seq: 1,
                role: 'agent',
                isSidechain: false,
                content: [{
                    type: 'tool-result',
                    tool_use_id: 'tool-1',
                    content: 'file1.txt\nfile2.txt',
                    is_error: false,
                    uuid: 'tool-uuid-2',
                    parentUUID: null
                }]
            };
            
            reducer(state, [resultMessage]);
            
            const toolMsgId = state.toolIdToMessageId.get('tool-1');
            let toolMsg = state.messages.get(toolMsgId!);
            expect(toolMsg?.tool?.state).toBe('completed');
            expect(toolMsg?.tool?.result).toBe('file1.txt\nfile2.txt');
            
            // Step 3: AgentState arrives later with permission info
            const agentState: AgentState = {
                requests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'ls -la' },
                        createdAt: 1000
                    }
                },
                completedRequests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'ls -la' },
                        createdAt: 1000,
                        completedAt: 1400,
                        status: 'approved'
                    }
                }
            };
            
            const result = reducer(state, [], agentState);
            
            // Permission should be attached to completed tool
            expect(result.messages).toHaveLength(1);
            toolMsg = state.messages.get(toolMsgId!);
            expect(toolMsg?.tool?.permission?.status).toBe('approved');
            expect(toolMsg?.tool?.state).toBe('completed');
            expect(toolMsg?.tool?.result).toBe('file1.txt\nfile2.txt');
        });

        it('should handle real-world scenario: messages and AgentState received simultaneously', () => {
            const state = createReducer();
            
            // Simulate a tool call message from the agent
            const toolMessage: NormalizedMessage = {
                id: 'msg-1',
                localId: null,
                createdAt: 1000,
                seq: 1,
                role: 'agent',
                content: [{
                    type: 'tool-call',
                    id: 'tool-1',
                    name: 'Bash',
                    input: { command: 'ls -la' },
                    description: null,
                    uuid: 'tool-uuid-1',
                    parentUUID: null
                }],
                isSidechain: false
            };
            
            // AgentState with the pending permission for the same tool
            const agentState: AgentState = {
                requests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'ls -la' },
                        createdAt: 900  // Permission requested before the tool call
                    }
                }
            };
            
            // Process both simultaneously (as would happen when loading from storage)
            const messages = [toolMessage];
            const result = reducer(state, messages, agentState);
            
            // Should create exactly ONE message, not two
            expect(result.messages).toHaveLength(1);
            expect(state.messages.size).toBe(1);
            
            // The message should be the tool call with the permission attached
            const messageId = state.toolIdToMessageId.get('tool-1');
            expect(messageId).toBeDefined();
            
            const message = state.messages.get(messageId!);
            expect(message?.tool?.name).toBe('Bash');
            expect(message?.tool?.permission?.status).toBe('pending');
            expect(message?.tool?.permission?.id).toBe('tool-1');
        });

        it('should retroactively match permissions when tools are processed without AgentState initially', () => {
            const state = createReducer();
            
            // Step 1: Process tool messages WITHOUT AgentState (simulating messages loading before session)
            const toolMessage: NormalizedMessage = {
                id: 'msg-1',
                localId: null,
                createdAt: 2000,
                seq: 1,
                role: 'agent',
                isSidechain: false,
                content: [{
                    type: 'tool-call',
                    id: 'tool-1',
                    name: 'Bash',
                    input: { command: 'echo hello' },
                    description: null,
                    uuid: 'tool-uuid-1',
                    parentUUID: null
                }]
            };
            
            // Process WITHOUT AgentState (undefined)
            const result1 = reducer(state, [toolMessage], undefined);
            
            // Should create a tool message WITHOUT permission
            expect(result1.messages).toHaveLength(1);
            expect(result1.messages[0].kind).toBe('tool-call');
            if (result1.messages[0].kind === 'tool-call') {
                expect(result1.messages[0].tool.permission).toBeUndefined();
                expect(result1.messages[0].tool.state).toBe('running');
            }
            
            // Verify tool is registered in state
            expect(state.toolIdToMessageId.has('tool-1')).toBe(true);
            const toolMsgId = state.toolIdToMessageId.get('tool-1');
            
            // Step 2: Later, AgentState arrives with permission for this tool
            const agentState: AgentState = {
                requests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'echo hello' },
                        createdAt: 1000  // Permission was requested BEFORE the tool ran
                    }
                }
            };
            
            // Process with AgentState but no new messages
            const result2 = reducer(state, [], agentState);
            
            // The reducer SHOULD match the permission to the existing tool
            expect(result2.messages).toHaveLength(1);
            expect(result2.messages[0].kind).toBe('tool-call');
            if (result2.messages[0].kind === 'tool-call') {
                // The existing tool should now have the permission attached
                expect(result2.messages[0].tool.permission?.status).toBe('pending');
                expect(result2.messages[0].tool.permission?.id).toBe('tool-1');
            }
            
            // Should still only have ONE message - the tool was updated
            expect(state.messages.size).toBe(1);
            
            // The original tool message should now have permission
            const originalTool = state.messages.get(toolMsgId!);
            expect(originalTool?.tool?.permission).toBeDefined();
            expect(originalTool?.tool?.permission?.status).toBe('pending');
            
            // The permission should be linked to the existing tool
            const permMsgId = state.toolIdToMessageId.get('tool-1');
            expect(permMsgId).toBeDefined();
            expect(permMsgId).toBe(toolMsgId); // Same message ID
        });

        it('should handle the full race condition scenario: messages load, then session with AgentState, then new message', () => {
            const state = createReducer();
            
            // Step 1: Messages load WITHOUT AgentState (session hasn't arrived yet)
            const existingMessages: NormalizedMessage[] = [
                // User message
                {
                    id: 'user-1',
                    localId: 'local-1',
                    createdAt: 1000,
                    seq: 1,
                    role: 'user',
                    isSidechain: false,
                    content: {
                        type: 'text',
                        text: 'Please list files'
                    }
                },
                // Tool call that should have permission
                {
                    id: 'tool-msg-1',
                    localId: null,
                    createdAt: 2000,
                    seq: 1,
                    role: 'agent',
                    isSidechain: false,
                    content: [{
                        type: 'tool-call',
                        id: 'tool-1',
                        name: 'Bash',
                        input: { command: 'ls -la' },
                        description: 'List files',
                        uuid: 'tool-uuid-1',
                        parentUUID: null
                    }]
                },
                // Tool result
                {
                    id: 'result-1',
                    localId: null,
                    createdAt: 3000,
                    seq: 1,
                    role: 'agent',
                    isSidechain: false,
                    content: [{
                        type: 'tool-result',
                        tool_use_id: 'tool-1',
                        content: 'file1.txt\nfile2.txt',
                        is_error: false,
                        uuid: 'result-uuid-1',
                        parentUUID: null
                    }]
                }
            ];
            
            // Process messages WITHOUT AgentState
            const result1 = reducer(state, existingMessages, undefined);
            
            // Should create user message and tool message
            expect(result1.messages.length).toBeGreaterThanOrEqual(2);
            
            // Find the tool message
            const toolMsg = result1.messages.find(m => m.kind === 'tool-call');
            expect(toolMsg).toBeDefined();
            if (toolMsg?.kind === 'tool-call') {
                expect(toolMsg.tool.permission).toBeUndefined(); // No permission yet
                expect(toolMsg.tool.state).toBe('completed'); // Tool completed
                expect(toolMsg.tool.result).toBe('file1.txt\nfile2.txt');
            }
            
            // Step 2: Session arrives with AgentState containing permission info
            const agentState: AgentState = {
                completedRequests: {
                    'tool-1': {
                        tool: 'Bash',
                        arguments: { command: 'ls -la' },
                        createdAt: 1500,
                        completedAt: 1800,
                        status: 'approved'
                    }
                }
            };
            
            // Process AgentState (simulating session arrival)
            const result2 = reducer(state, [], agentState);
            
            // Should update the existing tool with permission info
            expect(result2.messages).toHaveLength(1);
            if (result2.messages[0].kind === 'tool-call') {
                expect(result2.messages[0].tool.permission?.status).toBe('approved');
                // The tool should still be completed
                expect(result2.messages[0].tool.state).toBe('completed');
            }
            
            // Step 3: User sends a new message, triggering a new reducer call
            const newUserMessage: NormalizedMessage = {
                id: 'user-2',
                localId: 'local-2',
                createdAt: 4000,
                seq: 1,
                role: 'user',
                isSidechain: false,
                content: {
                    type: 'text',
                    text: 'Thanks!'
                }
            };
            
            // Process new message WITH AgentState (as would happen in real app)
            const result3 = reducer(state, [newUserMessage], agentState);
            
            // Should only create the new user message
            expect(result3.messages).toHaveLength(1);
            expect(result3.messages[0].kind).toBe('user-text');
            
            // The tool and permission should be the SAME message (matched correctly)
            expect(state.toolIdToMessageId.has('tool-1')).toBe(true);
            expect(state.toolIdToMessageId.has('tool-1')).toBe(true);
            
            const toolMsgId = state.toolIdToMessageId.get('tool-1');
            const permMsgId = state.toolIdToMessageId.get('tool-1');
            expect(toolMsgId).toBe(permMsgId); // Same message - properly matched!
        });

        it('permission-request placeholder stays in active region after a typed context-boundary lands', () => {
            const state = createReducer();

            // Phase 1: create a pending permission placeholder via agentState
            const agentState: AgentState = {
                requests: {
                    'perm-inflight': {
                        tool: 'Bash',
                        arguments: { command: 'rm -rf /tmp/scratch' },
                        createdAt: 1000,
                    },
                },
            };
            const result1 = reducer(state, [], agentState);
            expect(result1.messages).toHaveLength(1);

            // The placeholder must carry the unsequenced sentinel, not seq=0
            const placeholder = result1.messages[0];
            expect(placeholder.seq).toBe(Number.MAX_SAFE_INTEGER);

            // Phase 2: a typed context-boundary lands with seq=5 (post-boundary)
            const result2 = reducer(state, [
                createContextBoundaryMessage('boundary-clear', 2000, 5, 'clear'),
            ]);
            expect(state.latestBoundary?.seq).toBe(5);

            // The permission placeholder must NOT satisfy isConfirmed(msg) && msg.seq < boundary.seq
            // because seq===MAX_SAFE_INTEGER is treated as unconfirmed.
            // Verify it is still present in state.messages with the sentinel seq.
            const storedMsg = Array.from(state.messages.values()).find(
                m => m.tool?.permission?.id === 'perm-inflight',
            );
            expect(storedMsg).toBeDefined();
            expect(storedMsg!.seq).toBe(Number.MAX_SAFE_INTEGER);

            // The returned message from result1 likewise has the sentinel seq, confirming
            // buildChatListBoundaryItems treats it as unconfirmed (not pre-boundary).
            expect(result2.messages.some(m => m.seq === Number.MAX_SAFE_INTEGER)).toBe(false);
            const refreshed = Array.from(state.messages.values())
                .find(m => m.tool?.permission?.id === 'perm-inflight');
            expect(refreshed!.seq).toBe(Number.MAX_SAFE_INTEGER);
        });

        it('completed permission placeholder stays in active region after a typed context-boundary lands', () => {
            const state = createReducer();

            // Phase 1: create a completed permission placeholder (completedRequests path)
            const agentState: AgentState = {
                completedRequests: {
                    'perm-approved': {
                        tool: 'Bash',
                        arguments: { command: 'ls /tmp' },
                        createdAt: 1000,
                        completedAt: 1500,
                        status: 'approved',
                    },
                },
            };
            const result1 = reducer(state, [], agentState);
            expect(result1.messages).toHaveLength(1);

            // The placeholder must carry the unsequenced sentinel, not seq=0
            expect(result1.messages[0].seq).toBe(Number.MAX_SAFE_INTEGER);

            // Phase 2: a typed context-boundary lands with seq=3
            reducer(state, [
                createContextBoundaryMessage('boundary-clear-2', 2000, 3, 'clear'),
            ]);
            expect(state.latestBoundary?.seq).toBe(3);

            // Completed permission placeholder must still carry the sentinel
            const storedMsg = Array.from(state.messages.values()).find(
                m => m.tool?.permission?.id === 'perm-approved',
            );
            expect(storedMsg).toBeDefined();
            expect(storedMsg!.seq).toBe(Number.MAX_SAFE_INTEGER);
        });
    });

    describe('session protocol lifecycle and subagent sidechains', () => {
        it('sets hasReadyEvent for ready events without creating visible messages', () => {
            const state = createReducer();
            const result = reducer(state, [{
                id: 'ready-1',
                localId: null,
                createdAt: 1000,
                seq: 1,
                role: 'event',
                content: { type: 'ready' },
                isSidechain: false
            }]);

            expect(result.messages).toHaveLength(0);
            expect(result.hasReadyEvent).toBe(true);
        });

        it('hides turn-start lifecycle messages', () => {
            const state = createReducer();
            const result = reducer(state, [{
                id: 'turn-start-1',
                localId: null,
                createdAt: 1000,
                seq: 1,
                role: 'event',
                content: { type: 'message', message: 'Turn started' },
                isSidechain: false
            }]);

            expect(result.messages).toHaveLength(0);
        });

        it('nests subagent-linked sidechain messages under parent tool calls', () => {
            const state = createReducer();
            const result = reducer(state, [
                {
                    id: 'parent-msg',
                    localId: null,
                    createdAt: 1000,
                    seq: 1,
                    role: 'agent',
                    isSidechain: false,
                    content: [{
                        type: 'tool-call',
                        id: 'tool-parent',
                        name: 'Task',
                        input: { prompt: 'Inspect auth flow' },
                        description: null,
                        uuid: 'parent-uuid',
                        parentUUID: null
                    }]
                },
                {
                    id: 'child-msg',
                    localId: null,
                    createdAt: 1100,
                    seq: 1,
                    role: 'agent',
                    isSidechain: true,
                    content: [{
                        type: 'text',
                        text: 'Subagent output',
                        uuid: 'child-uuid',
                        parentUUID: 'tool-parent'
                    }]
                }
            ]);

            expect(result.messages).toHaveLength(1);
            expect(result.messages[0].kind).toBe('tool-call');
            if (result.messages[0].kind === 'tool-call') {
                expect(result.messages[0].children).toHaveLength(1);
                expect(result.messages[0].children[0].kind).toBe('agent-text');
                if (result.messages[0].children[0].kind === 'agent-text') {
                    expect(result.messages[0].children[0].text).toBe('Subagent output');
                }
            }
        });

        it('nests Agent sidechains via sessionSubagent and suppresses the duplicated prompt echo', () => {
            const state = createReducer();
            const result = reducer(state, [
                {
                    id: 'agent-parent-msg',
                    localId: null,
                    createdAt: 1000,
                    seq: 1,
                    role: 'agent',
                    isSidechain: false,
                    content: [{
                        type: 'tool-call',
                        id: 'tool-agent-parent',
                        name: 'Agent',
                        input: {
                            description: 'Add translations for switchMachinesHint',
                            prompt: 'Add translations for switchMachinesHint',
                            sessionSubagent: 'session-subagent-1',
                        },
                        description: 'Add translations for switchMachinesHint',
                        uuid: 'agent-parent-uuid',
                        parentUUID: null
                    }]
                },
                {
                    id: 'agent-prompt-echo',
                    localId: null,
                    createdAt: 1100,
                    seq: 1,
                    role: 'agent',
                    isSidechain: true,
                    content: [{
                        type: 'text',
                        text: 'Add translations for switchMachinesHint',
                        uuid: 'agent-prompt-uuid',
                        parentUUID: 'session-subagent-1'
                    }]
                },
                {
                    id: 'agent-child-tool',
                    localId: null,
                    createdAt: 1200,
                    seq: 1,
                    role: 'agent',
                    isSidechain: true,
                    content: [{
                        type: 'tool-call',
                        id: 'tool-read-child',
                        name: 'Read',
                        input: { file_path: '/tmp/example.ts' },
                        description: null,
                        uuid: 'agent-child-tool-uuid',
                        parentUUID: 'session-subagent-1'
                    }]
                }
            ]);

            expect(result.messages).toHaveLength(1);
            expect(result.messages[0].kind).toBe('tool-call');
            if (result.messages[0].kind === 'tool-call') {
                expect(result.messages[0].tool.name).toBe('Agent');
                expect(result.messages[0].children).toHaveLength(1);
                expect(result.messages[0].children[0].kind).toBe('tool-call');
                if (result.messages[0].children[0].kind === 'tool-call') {
                    expect(result.messages[0].children[0].tool.name).toBe('Read');
                }
            }
        });
    });

    describe('context boundary handling', () => {
        it('records typed clear boundaries and resets active-context state', () => {
            const state = createReducer();
            seedActiveContextState(state);

            const result = reducer(state, [
                createContextBoundaryMessage('boundary-clear', 1000, 25, 'clear'),
            ]);

            expect(state.latestBoundary).toEqual({
                id: 'boundary-clear',
                kind: 'clear',
                seq: 25,
                at: 1000,
                forkedFromSid: undefined,
            });
            expect(state.latestTodos).toEqual({ todos: [], timestamp: 1000 });
            expect(state.latestUsage).toEqual({
                inputTokens: 0,
                outputTokens: 0,
                cacheCreation: 0,
                cacheRead: 0,
                contextSize: 0,
                timestamp: 1000,
            });
            expect(result.messages).toHaveLength(1);
            expect(result.messages[0].kind).toBe('agent-event');
            if (result.messages[0].kind === 'agent-event') {
                expect(result.messages[0].event).toEqual({
                    type: 'context-boundary',
                    kind: 'clear',
                    at: 1000,
                });
                expect(result.messages[0].seq).toBe(25);
            }
        });

        it('records typed compact boundaries and resets usage without clearing todos', () => {
            const state = createReducer();
            seedActiveContextState(state);

            reducer(state, [
                createContextBoundaryMessage('boundary-compact', 1100, 30, 'compact'),
            ]);

            expect(state.latestBoundary).toEqual({
                id: 'boundary-compact',
                kind: 'compact',
                seq: 30,
                at: 1100,
                forkedFromSid: undefined,
            });
            expect(state.latestTodos).toEqual({
                todos: [{ content: 'Keep active task', status: 'pending' }],
                timestamp: 900,
            });
            expect(state.latestUsage).toEqual({
                inputTokens: 0,
                outputTokens: 0,
                cacheCreation: 0,
                cacheRead: 0,
                contextSize: 0,
                timestamp: 1100,
            });
        });

        it('records typed autocompact boundaries and resets usage without clearing todos', () => {
            const state = createReducer();
            seedActiveContextState(state);

            reducer(state, [
                createContextBoundaryMessage('boundary-autocompact', 1150, 31, 'autocompact'),
            ]);

            expect(state.latestBoundary).toEqual({
                id: 'boundary-autocompact',
                kind: 'autocompact',
                seq: 31,
                at: 1150,
                forkedFromSid: undefined,
            });
            expect(state.latestTodos).toEqual({
                todos: [{ content: 'Keep active task', status: 'pending' }],
                timestamp: 900,
            });
            expect(state.latestUsage).toEqual({
                inputTokens: 0,
                outputTokens: 0,
                cacheCreation: 0,
                cacheRead: 0,
                contextSize: 0,
                timestamp: 1150,
            });
        });

        it('preserves unflagged legacy-only fallback without recording latestBoundary', () => {
            const state = createReducer();
            seedActiveContextState(state);

            const result = reducer(state, [
                createLegacyBoundaryMessage('legacy-clear', 1200, 'Context was reset'),
            ]);

            expect(state.latestBoundary).toBeUndefined();
            expect(state.latestTodos).toEqual({ todos: [], timestamp: 1200 });
            expect(state.latestUsage).toEqual({
                inputTokens: 0,
                outputTokens: 0,
                cacheCreation: 0,
                cacheRead: 0,
                contextSize: 0,
                timestamp: 1200,
            });
            expect(result.messages).toHaveLength(1);
        });

        it('suppresses flagged legacy fallback when dual-emitted with a typed boundary', () => {
            const state = createReducer();
            seedActiveContextState(state);

            const result = reducer(state, [
                createContextBoundaryMessage('boundary-dual', 1300, 40, 'clear'),
                createLegacyBoundaryMessage('legacy-dual', 1301, 'Context was reset', {
                    contextBoundaryFallback: true,
                }),
            ]);

            expect(state.latestBoundary).toEqual({
                id: 'boundary-dual',
                kind: 'clear',
                seq: 40,
                at: 1300,
                forkedFromSid: undefined,
            });
            expect(state.latestTodos).toEqual({ todos: [], timestamp: 1300 });
            expect(state.latestUsage?.timestamp).toBe(1300);
            expect(result.messages).toHaveLength(1);
            expect(state.messageIds.has('legacy-dual')).toBe(true);
        });

        it('suppresses flagged legacy fallback even when it arrives without the typed envelope', () => {
            const state = createReducer();
            seedActiveContextState(state);

            const result = reducer(state, [
                createLegacyBoundaryMessage('legacy-first', 1400, 'Context was reset', {
                    contextBoundaryFallback: true,
                }),
            ]);

            expect(state.latestBoundary).toBeUndefined();
            expect(state.latestTodos).toEqual({
                todos: [{ content: 'Keep active task', status: 'pending' }],
                timestamp: 900,
            });
            expect(state.latestUsage).toEqual({
                inputTokens: 11,
                outputTokens: 7,
                cacheCreation: 3,
                cacheRead: 5,
                contextSize: 19,
                timestamp: 900,
            });
            expect(result.messages).toHaveLength(0);
            expect(state.messageIds.has('legacy-first')).toBe(true);
        });

        it('seeds latestBoundary from metadata and lets newer stream boundaries supersede it', () => {
            const state = createReducer();

            seedLatestBoundary(state, {
                id: 'metadata-boundary',
                kind: 'compact',
                seq: 50,
                at: 1500,
            });

            expect(state.latestBoundary).toEqual({
                id: 'metadata-boundary',
                kind: 'compact',
                seq: 50,
                at: 1500,
            });

            reducer(state, [
                createContextBoundaryMessage('older-boundary', 1490, 49, 'clear'),
                createContextBoundaryMessage('newer-boundary', 1510, 51, 'clear'),
            ]);

            expect(state.latestBoundary).toEqual({
                id: 'newer-boundary',
                kind: 'clear',
                seq: 51,
                at: 1510,
                forkedFromSid: undefined,
            });
        });

        it('suppresses legacy plan-mode synthesis when typed plan-mode boundary is in the same batch', () => {
            const state = createReducer();

            const result = reducer(state, [
                createToolCallMessage('plan-enter-tool', 1600, 'tool-plan-enter', 'EnterPlanMode', {}),
                createContextBoundaryMessage('boundary-plan-enter', 1601, 60, 'plan-mode-enter'),
            ]);

            expect(result.messages.some((message) => message.kind === 'agent-event'
                && message.event.type === 'message'
                && message.event.message === 'Entering plan mode')).toBe(false);
            expect(result.messages.some((message) => message.kind === 'agent-event'
                && message.event.type === 'context-boundary'
                && message.event.kind === 'plan-mode-enter')).toBe(true);
        });

        it('preserves legacy plan-mode synthesis when latestBoundary is plan-mode-enter but the current batch has no typed boundary', () => {
            const state = createReducer();
            seedLatestBoundary(state, {
                id: 'metadata-plan-enter',
                kind: 'plan-mode-enter',
                seq: 60,
                at: 1601,
            });

            const result = reducer(state, [
                createToolCallMessage('plan-enter-tool', 1602, 'tool-plan-enter', 'EnterPlanMode', {}),
            ]);

            expect(result.messages.some((message) => message.kind === 'agent-event'
                && message.event.type === 'message'
                && message.event.message === 'Entering plan mode')).toBe(true);
        });

        it('records typed plan-mode-exit boundary in latestBoundary', () => {
            const state = createReducer();
            seedLatestBoundary(state, {
                id: 'boundary-plan-enter',
                kind: 'plan-mode-enter',
                seq: 60,
                at: 1600,
            });

            reducer(state, [
                createContextBoundaryMessage('boundary-plan-exit', 1700, 70, 'plan-mode-exit'),
            ]);

            expect(state.latestBoundary).toMatchObject({
                id: 'boundary-plan-exit',
                kind: 'plan-mode-exit',
                seq: 70,
            });
        });

        it('typed plan-mode-exit boundary supersedes typed plan-mode-enter in the same batch', () => {
            const state = createReducer();

            reducer(state, [
                createContextBoundaryMessage('boundary-plan-enter', 1600, 60, 'plan-mode-enter'),
                createContextBoundaryMessage('boundary-plan-exit', 1700, 70, 'plan-mode-exit'),
            ]);

            expect(state.latestBoundary?.kind).toBe('plan-mode-exit');
        });
    });

    describe('TodoWrite latestTodos handling', () => {
        it('does not update todos from a running TodoWrite input', () => {
            const state = createReducer();
            const result = reducer(state, [{
                id: 'todo-call-only',
                localId: null,
                createdAt: 1000,
                seq: 1,
                role: 'agent',
                isSidechain: false,
                content: [{
                    type: 'tool-call',
                    id: 'tool-todos',
                    name: 'TodoWrite',
                    input: {
                        todos: [{
                            content: 'Do the thing',
                            status: 'pending'
                        }]
                    },
                    description: null,
                    uuid: 'tool-uuid',
                    parentUUID: null
                }]
            }]);

            expect(result.todos).toBeUndefined();
        });

        it('updates todos from successful TodoWrite result newTodos', () => {
            const state = createReducer();
            const result = reducer(state, [
                {
                    id: 'todo-call',
                    localId: null,
                    createdAt: 1000,
                    seq: 1,
                    role: 'agent',
                    isSidechain: false,
                    content: [{
                        type: 'tool-call',
                        id: 'tool-success',
                        name: 'TodoWrite',
                        input: {
                            todos: [{
                                content: 'Old task state',
                                status: 'pending'
                            }]
                        },
                        description: null,
                        uuid: 'tool-uuid-success',
                        parentUUID: null
                    }]
                },
                {
                    id: 'todo-result',
                    localId: null,
                    createdAt: 1010,
                    seq: 1,
                    role: 'agent',
                    isSidechain: false,
                    content: [{
                        type: 'tool-result',
                        tool_use_id: 'tool-success',
                        content: {
                            oldTodos: [],
                            newTodos: [{
                                content: 'New authoritative task state',
                                status: 'completed'
                            }]
                        },
                        is_error: false,
                        uuid: 'tool-uuid-success',
                        parentUUID: null
                    }]
                }
            ]);

            expect(result.todos).toEqual([{
                content: 'New authoritative task state',
                status: 'completed'
            }]);
        });

        it('ignores malformed TodoWrite input that later fails validation', () => {
            const state = createReducer();
            const result = reducer(state, [
                {
                    id: 'bad-todo-call',
                    localId: null,
                    createdAt: 1000,
                    seq: 1,
                    role: 'agent',
                    isSidechain: false,
                    content: [{
                        type: 'tool-call',
                        id: 'tool-bad',
                        name: 'TodoWrite',
                        input: {
                            todos: '[{"content":"Broken","status":"pending"}]'
                        },
                        description: null,
                        uuid: 'tool-uuid-bad',
                        parentUUID: null
                    }]
                },
                {
                    id: 'bad-todo-result',
                    localId: null,
                    createdAt: 1010,
                    seq: 1,
                    role: 'agent',
                    isSidechain: false,
                    content: [{
                        type: 'tool-result',
                        tool_use_id: 'tool-bad',
                        content: 'InputValidationError',
                        is_error: true,
                        uuid: 'tool-uuid-bad',
                        parentUUID: null
                    }]
                }
            ]);

            expect(result.todos).toBeUndefined();
        });
    });

    describe('out-of-order history arrival', () => {
        it('matches the all-at-once reducer state when a newer batch of 50 arrives before an older batch of 50', () => {
            const scenario = createOutOfOrderHistoryScenario();

            expect(scenario.olderBatch).toHaveLength(50);
            expect(scenario.newerBatch).toHaveLength(50);

            const allAtOnceState = createReducer();
            reducer(allAtOnceState, scenario.allAtOnce);

            const paginatedState = createReducer();
            reducer(paginatedState, scenario.newerBatch);
            reducer(paginatedState, scenario.olderBatch);

            expect(snapshotReducerState(paginatedState)).toEqual(snapshotReducerState(allAtOnceState));
        });

        it('matches the all-at-once reducer state when a streaming message lands between the newer and older batches', () => {
            const scenario = createOutOfOrderHistoryScenario();

            const allAtOnceState = createReducer();
            reducer(allAtOnceState, scenario.allAtOnceWithStreaming);

            const paginatedState = createReducer();
            reducer(paginatedState, scenario.newerBatch);
            reducer(paginatedState, [scenario.interleavedStreamingMessage]);
            reducer(paginatedState, scenario.olderBatch);

            expect(snapshotReducerState(paginatedState)).toEqual(snapshotReducerState(allAtOnceState));
        });

        it('resolves sidechain tool stuck in running when its tool-result arrives before its tool-call via lazy-load', () => {
            // Scenario: a Task sidechain contains a Bash tool-call (older page) and its
            // tool-result (newer page). The newer page arrives first, so the sidechain
            // tool-result must be buffered and applied once the tool-call page arrives.
            const parentToolCallMsg: NormalizedMessage = {
                id: 'parent-msg',
                localId: null,
                createdAt: 1000,
                seq: 1,
                role: 'agent',
                isSidechain: false,
                content: [{
                    type: 'tool-call',
                    id: 'tool-task',
                    name: 'Task',
                    input: { prompt: 'Check git status' },
                    description: null,
                    uuid: 'parent-uuid',
                    parentUUID: null
                }],
            };

            // Older batch: sidechain prompt + sidechain tool-call
            const olderBatch: NormalizedMessage[] = [
                {
                    id: 'sc-prompt-msg',
                    localId: null,
                    createdAt: 1100,
                    seq: 1,
                    role: 'agent',
                    isSidechain: true,
                    content: [{
                        type: 'sidechain',
                        prompt: 'Check git status',
                        uuid: 'sc-prompt-uuid',
                    }],
                },
                {
                    id: 'sc-bash-call-msg',
                    localId: null,
                    createdAt: 1200,
                    seq: 1,
                    role: 'agent',
                    isSidechain: true,
                    content: [{
                        type: 'tool-call',
                        id: 'tool-sc-bash',
                        name: 'Bash',
                        input: { command: 'git status --short' },
                        description: null,
                        uuid: 'sc-bash-uuid',
                        parentUUID: 'sc-prompt-uuid',
                    }],
                },
            ];

            // Newer batch: sidechain tool-result for the Bash call above
            const newerBatch: NormalizedMessage[] = [
                {
                    id: 'sc-bash-result-msg',
                    localId: null,
                    createdAt: 1300,
                    seq: 1,
                    role: 'agent',
                    isSidechain: true,
                    content: [{
                        type: 'tool-result',
                        tool_use_id: 'tool-sc-bash',
                        content: 'M  src/foo.ts',
                        is_error: false,
                        uuid: 'sc-bash-result-uuid',
                        parentUUID: 'sc-prompt-uuid',
                    }],
                },
            ];

            // All-at-once: reference state
            const allAtOnceState = createReducer();
            reducer(allAtOnceState, [parentToolCallMsg, ...olderBatch, ...newerBatch]);

            // Out-of-order: newer (with tool-result) arrives before older (with tool-call)
            const paginatedState = createReducer();
            reducer(paginatedState, [parentToolCallMsg, ...newerBatch]);
            reducer(paginatedState, olderBatch);

            // The sidechain Bash tool must be 'completed', not stuck in 'running'
            const sidechains = Array.from(paginatedState.sidechains.values());
            expect(sidechains).toHaveLength(1);
            const bashToolMsg = sidechains[0].find(m => m.tool?.name === 'Bash');
            expect(bashToolMsg).toBeDefined();
            expect(bashToolMsg!.tool!.state).toBe('completed');
            expect(bashToolMsg!.tool!.result).toBe('M  src/foo.ts');

            // Full state must match all-at-once
            expect(snapshotReducerState(paginatedState)).toEqual(snapshotReducerState(allAtOnceState));
        });
    });
});
