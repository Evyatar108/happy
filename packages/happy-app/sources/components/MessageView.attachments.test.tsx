import * as React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const themeValue = new Proxy({}, {
    get: () => themeValue,
    apply: () => '#000',
}) as unknown as string;

vi.mock('react-native', () => ({
    Text: 'Text',
    View: 'View',
}));

vi.mock('@expo/vector-icons', () => ({ Octicons: 'Octicons', Ionicons: 'Ionicons' }));

vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        create: (factory: (theme: unknown) => Record<string, unknown>) => factory({ colors: themeValue }),
    },
    useUnistyles: () => ({ theme: { colors: themeValue } }),
}));

vi.mock('@/constants/Typography', () => ({
    Typography: { default: () => ({}) },
}));

vi.mock('@/text', () => ({
    t: (key: string) => key,
}));

vi.mock('./markdown/MarkdownView', () => ({
    MarkdownView: 'MarkdownView',
}));

vi.mock('./markdown/skillBody', () => ({
    isSkillBodyMessage: () => false,
}));

vi.mock('./tools/ToolView', () => ({
    ToolView: 'ToolView',
}));

vi.mock('./StyledText', () => ({
    AnimatedText: 'AnimatedText',
    Text: 'Text',
}));

vi.mock('@/hooks/useChatFontScale', () => ({
    useChatScaleAnimatedTextStyle: () => ({}),
}));

vi.mock('./BoundaryDivider', () => ({
    BoundaryDivider: 'BoundaryDivider',
}));

vi.mock('@/sync/sync', () => ({
    sync: { sendMessage: vi.fn() },
}));

const { MessageView } = await import('./MessageView');

function makeUserMessage(overrides: Record<string, unknown> = {}) {
    return {
        kind: 'user-text' as const,
        id: 'msg-1',
        localId: null,
        createdAt: 0,
        seq: 1,
        text: 'Hello',
        ...overrides,
    };
}

describe('MessageView attachment chips', () => {
    it('renders one attachment chip for a user message with meta.attachmentRefs containing one ref', async () => {
        const message = makeUserMessage({
            meta: {
                attachmentRefs: [
                    { name: 'foo.txt', size: 1234, remotePath: '/path/foo.txt' },
                ],
            },
        });

        let renderer!: ReturnType<typeof TestRenderer.create>;
        await act(async () => {
            renderer = TestRenderer.create(
                <MessageView
                    message={message}
                    metadata={null}
                    sessionId="s1"
                    chatBodyWidth={undefined}
                />
            );
        });

        const chips = renderer.root.findAllByProps({ testID: 'message-attachment-chip' });
        expect(chips).toHaveLength(1);

        const chipTexts = renderer.root.findAllByType('Text').map(
            (node: { children: unknown }) => (Array.isArray(node.children) ? node.children.join('') : String(node.children))
        );
        expect(chipTexts).toContain('foo.txt');
        // 1234 bytes → Math.ceil(1234/1024) = 2 KB
        expect(chipTexts).toContain('2 KB');
    });

    it('renders multiple attachment chips when multiple refs are present', async () => {
        const message = makeUserMessage({
            meta: {
                attachmentRefs: [
                    { name: 'a.txt', size: 512, remotePath: '/a.txt' },
                    { name: 'b.png', size: 2048000, remotePath: '/b.png' },
                ],
            },
        });

        let renderer!: ReturnType<typeof TestRenderer.create>;
        await act(async () => {
            renderer = TestRenderer.create(
                <MessageView
                    message={message}
                    metadata={null}
                    sessionId="s1"
                    chatBodyWidth={undefined}
                />
            );
        });

        const chips = renderer.root.findAllByProps({ testID: 'message-attachment-chip' });
        expect(chips).toHaveLength(2);

        const chipTexts = renderer.root.findAllByType('Text').map(
            (node: { children: unknown }) => (Array.isArray(node.children) ? node.children.join('') : String(node.children))
        );
        expect(chipTexts).toContain('a.txt');
        expect(chipTexts).toContain('512 B');
        expect(chipTexts).toContain('b.png');
        // 2048000 bytes → Math.ceil(2048000 / (1024*1024)) = 2 MB
        expect(chipTexts).toContain('2 MB');
    });

    it('renders no attachment chips when meta.attachmentRefs is absent', async () => {
        const message = makeUserMessage();

        let renderer!: ReturnType<typeof TestRenderer.create>;
        await act(async () => {
            renderer = TestRenderer.create(
                <MessageView
                    message={message}
                    metadata={null}
                    sessionId="s1"
                    chatBodyWidth={undefined}
                />
            );
        });

        const chips = renderer.root.findAllByProps({ testID: 'message-attachment-chip' });
        expect(chips).toHaveLength(0);
    });

    it('renders no attachment chips when meta.attachmentRefs is an empty array', async () => {
        const message = makeUserMessage({
            meta: { attachmentRefs: [] },
        });

        let renderer!: ReturnType<typeof TestRenderer.create>;
        await act(async () => {
            renderer = TestRenderer.create(
                <MessageView
                    message={message}
                    metadata={null}
                    sessionId="s1"
                    chatBodyWidth={undefined}
                />
            );
        });

        const chips = renderer.root.findAllByProps({ testID: 'message-attachment-chip' });
        expect(chips).toHaveLength(0);
    });
});
