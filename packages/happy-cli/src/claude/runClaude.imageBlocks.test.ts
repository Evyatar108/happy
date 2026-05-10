import { beforeEach, describe, expect, it, vi } from 'vitest';
import { claudeRemote } from './claudeRemote';
import type { SDKMessage } from '@/claude/sdk';

const mocks = vi.hoisted(() => ({
    mockQuery: vi.fn(),
    mockClaudeCheckSession: vi.fn(),
    mockParseSpecialCommand: vi.fn(),
}));

vi.mock('@/claude/sdk', () => ({
    AbortError: class AbortError extends Error {},
    query: mocks.mockQuery,
}));

vi.mock('./utils/claudeCheckSession', () => ({
    claudeCheckSession: mocks.mockClaudeCheckSession,
}));

vi.mock('./utils/path', () => ({
    getProjectPath: (path: string) => path,
}));

vi.mock('./utils/systemPrompt', () => ({
    systemPrompt: 'test-system-prompt',
}));

vi.mock('@/modules/watcher/awaitFileExist', () => ({
    awaitFileExist: vi.fn(async () => true),
}));

vi.mock('@/parsers/specialCommands', () => ({
    parseSpecialCommand: mocks.mockParseSpecialCommand,
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

describe('runClaude image block plumbing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.mockClaudeCheckSession.mockReturnValue(true);
        mocks.mockParseSpecialCommand.mockReturnValue({ type: 'none' });
    });

    it('sends queued image attachments as Anthropic vision content blocks', async () => {
        const stagedBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
        const nextMessage = vi
            .fn()
            .mockResolvedValueOnce({
                message: 'describe this image',
                attachments: [{ type: 'image', ref: stagedBase64, mimeType: 'image/png' }],
                mode: { permissionMode: 'default' },
            })
            .mockResolvedValueOnce(null);

        mocks.mockQuery.mockReturnValue(createMessageStream([
            {
                type: 'result',
                subtype: 'success',
                duration_ms: 1,
                duration_api_ms: 1,
                is_error: false,
                num_turns: 1,
                result: 'done',
                stop_reason: null,
                session_id: 'session-image',
                total_cost_usd: 0,
                usage: {},
                modelUsage: {},
                permission_denials: [],
                uuid: '00000000-0000-0000-0000-000000000010',
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
            canCallTool: async () => ({ behavior: 'allow', updatedInput: {} }),
        });

        const prompt = mocks.mockQuery.mock.calls[0][0].prompt as AsyncIterable<any>;
        const first = await prompt[Symbol.asyncIterator]().next();
        expect(first.value.message.content).toEqual([
            { type: 'text', text: 'describe this image' },
            {
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: 'image/png',
                    data: stagedBase64,
                },
            },
        ]);
    });
});
