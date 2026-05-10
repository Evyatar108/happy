import * as React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

(
    globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
    }
).IS_REACT_ACT_ENVIRONMENT = true;

const push = vi.fn((url: string) => url);
const storeTempText = vi.fn((content: string) => 'temp-text-id');
const parseMarkdown = vi.fn((markdown: string, taskNotifications?: unknown[]) => [] as unknown[]);
const processClaudeMetaTags = vi.fn((raw: string) => ({
    renderMarkdown: raw,
    copyMarkdown: raw,
    taskNotifications: [] as unknown[],
}));
const storageState = vi.hoisted(() => ({
    sessionRoot: '/Users/kirilldubovitskiy/projects/happy' as string | null,
}));

vi.mock('react-native', () => ({
    Image: 'Image',
    Platform: {
        OS: 'android',
    },
    Pressable: 'Pressable',
    ScrollView: 'ScrollView',
    StyleSheet: {
        flatten: (style: unknown) => style,
    },
    View: 'View',
}));

vi.mock('react-native-gesture-handler', () => ({
    Gesture: {
        LongPress: () => {
            const gesture: {
                minDuration: () => typeof gesture;
                onStart: undefined | ((callback: () => void) => typeof gesture) | (() => void);
                runOnJS: () => typeof gesture;
            } = {
                minDuration: () => gesture,
                onStart: undefined,
                runOnJS: () => gesture,
            };

            gesture.onStart = (callback: () => void) => {
                gesture.onStart = callback;
                return gesture;
            };

            return gesture;
        },
    },
    GestureDetector: 'GestureDetector',
}));

vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        create: (factory: (theme: { colors: Record<string, string> }) => Record<string, unknown>) => factory({
            colors: new Proxy({}, { get: () => '#000' }) as Record<string, string>,
        }),
    },
}));

vi.mock('../StyledText', () => ({
    AnimatedText: 'AnimatedText',
    Text: 'Text',
}));

vi.mock('../SimpleSyntaxHighlighter', () => ({
    SimpleSyntaxHighlighter: 'SimpleSyntaxHighlighter',
}));

vi.mock('@/constants/Typography', () => ({
    Typography: {
        default: () => ({}),
        mono: () => ({}),
    },
}));

vi.mock('@/modal', () => ({
    Modal: {
        alert: vi.fn(),
    },
}));

vi.mock('@/sync/storage', () => ({
    useLocalSetting: () => true,
    useSession: () => storageState.sessionRoot ? ({ metadata: { path: storageState.sessionRoot } }) : null,
}));

vi.mock('@/sync/persistence', () => ({
    storeTempText: (content: string) => storeTempText(content),
}));

vi.mock('expo-router', () => ({
    useRouter: () => ({ push }),
}));

vi.mock('expo-clipboard', () => ({
    setStringAsync: vi.fn(),
}));

vi.mock('expo-web-browser', () => ({
    openBrowserAsync: vi.fn(),
}));

vi.mock('./MermaidRenderer', () => ({
    MermaidRenderer: 'MermaidRenderer',
}));

vi.mock('@/text', () => ({
    t: (key: string) => key,
}));

vi.mock('./linkUtils', () => ({
    isHttpMarkdownLink: (url: string) => /^https?:\/\//i.test(url.trim()),
    isFileMarkdownLink: (url: string) => /^file:/i.test(url.trim()),
}));

vi.mock('@/hooks/useChatFontScale', () => ({
    useChatScaleAnimatedTextStyle: () => null,
    useChatScaledStyles: (styles: unknown) => styles,
}));

vi.mock('./processClaudeMetaTags', () => ({
    default: (raw: string) => processClaudeMetaTags(raw),
}));

vi.mock('./parseMarkdown', () => ({
    parseMarkdown: (markdown: string, taskNotifications?: unknown[]) => parseMarkdown(markdown, taskNotifications),
}));

vi.mock('./TaskNotificationPill', () => ({
    TaskNotificationPill: 'TaskNotificationPill',
}));

const { MarkdownView } = await import('./MarkdownView');

describe('MarkdownView', () => {
    const taskNotificationData = {
        taskId: 'task-123',
        toolUseId: 'toolu_456',
        taskType: 'review',
        outputFile: '/tmp/task-123.output',
        status: 'completed',
        summary: 'Task finished cleanly.',
    };

    beforeEach(() => {
        push.mockReset();
        storeTempText.mockReset();
        storeTempText.mockReturnValue('temp-text-id');
        parseMarkdown.mockReset();
        processClaudeMetaTags.mockReset();
        processClaudeMetaTags.mockImplementation((raw: string) => ({
            renderMarkdown: raw,
            copyMarkdown: raw,
            taskNotifications: [],
        }));
        storageState.sessionRoot = '/Users/kirilldubovitskiy/projects/happy';
    });

    it('threads task notifications into parseMarkdown and renders the pill block', () => {
        processClaudeMetaTags.mockReturnValue({
            renderMarkdown: '__HAPPY_TASK_NOTIFICATION_0__',
            copyMarkdown: 'Task finished cleanly.',
            taskNotifications: [taskNotificationData],
        });
        parseMarkdown.mockReturnValue([
            { type: 'task-notification', data: taskNotificationData },
        ]);

        let renderer: any;
        act(() => {
            renderer = TestRenderer.create(<MarkdownView markdown="raw" />);
        });

        expect(processClaudeMetaTags).toHaveBeenCalledWith('raw');
        expect(parseMarkdown).toHaveBeenCalledWith('__HAPPY_TASK_NOTIFICATION_0__', [taskNotificationData]);
        expect(renderer!.root.findByType('TaskNotificationPill').props.data).toEqual(taskNotificationData);
    });

    it('stores copyMarkdown for native long-press selection instead of renderMarkdown', () => {
        processClaudeMetaTags.mockReturnValue({
            renderMarkdown: '__HAPPY_TASK_NOTIFICATION_0__',
            copyMarkdown: 'Task finished cleanly.',
            taskNotifications: [taskNotificationData],
        });
        parseMarkdown.mockReturnValue([
            { type: 'task-notification', data: taskNotificationData },
        ]);

        let renderer: any;
        act(() => {
            renderer = TestRenderer.create(<MarkdownView markdown="raw" />);
        });

        act(() => {
            renderer!.root.findByType('GestureDetector').props.gesture.onStart();
        });

        expect(storeTempText).toHaveBeenCalledWith('Task finished cleanly.');
        expect(storeTempText).not.toHaveBeenCalledWith('__HAPPY_TASK_NOTIFICATION_0__');
        expect(push).toHaveBeenCalledWith('/text-selection?textId=temp-text-id');
    });

    it.each([
        ['POSIX absolute', '/Users/kirilldubovitskiy/projects/happy/packages/happy-app/App.tsx:12:3', '/Users/kirilldubovitskiy/projects/happy'],
        ['Windows absolute', 'C:\\Users\\kirilldubovitskiy\\projects\\happy\\packages\\happy-app\\App.tsx:12', 'C:/Users/kirilldubovitskiy/projects/happy'],
        ['relative dot', './packages/happy-app/App.tsx', '/Users/kirilldubovitskiy/projects/happy'],
        ['parent relative', '../happy/packages/happy-app/App.tsx', '/Users/kirilldubovitskiy/projects/happy'],
        ['home relative', '~/projects/happy/packages/happy-app/App.tsx', '/Users/kirilldubovitskiy/projects/happy'],
    ])('renders %s file path text as an internal link span', (_label, filePath, sessionRoot) => {
        storageState.sessionRoot = sessionRoot;
        parseMarkdown.mockReturnValue([
            { type: 'text', content: [{ styles: [], text: `Open ${filePath} now`, url: null }] },
        ]);

        let renderer: any;
        act(() => {
            renderer = TestRenderer.create(<MarkdownView markdown="raw" sessionId="session-1" />);
        });

        const links = renderer!.root.findAll((node: any) => node.type === 'AnimatedText' && node.props.accessibilityRole === 'link');
        expect(links).toHaveLength(1);
        expect(links[0].props.children).toBe(filePath);
        expect(links[0].props.onPress).toEqual(expect.any(Function));
    });

    it('leaves HTTP links, code spans, markdown links, and ambiguous bare words unchanged', () => {
        parseMarkdown.mockReturnValue([
            {
                type: 'text',
                content: [
                    { styles: [], text: 'https://example.com/docs ', url: null },
                    { styles: ['code'], text: 'packages/happy-app/App.tsx ', url: null },
                    { styles: [], text: 'linked file', url: 'https://example.com/file' },
                    { styles: [], text: 'README ', url: null },
                ],
            },
        ]);

        let renderer: any;
        act(() => {
            renderer = TestRenderer.create(<MarkdownView markdown="raw" sessionId="session-1" />);
        });

        const links = renderer!.root.findAll((node: any) => node.type === 'AnimatedText' && node.props.accessibilityRole === 'link');
        expect(links).toHaveLength(1);
        expect(links[0].props.children).toBe('linked file');
        expect(links[0].props.onPress).toEqual(expect.any(Function));
    });

    it('renders out-of-root file path matches as plain text', () => {
        parseMarkdown.mockReturnValue([
            { type: 'text', content: [{ styles: [], text: 'Open /Users/kirilldubovitskiy/other/file.ts now', url: null }] },
        ]);

        let renderer: any;
        act(() => {
            renderer = TestRenderer.create(<MarkdownView markdown="raw" sessionId="session-1" />);
        });

        const links = renderer!.root.findAll((node: any) => node.type === 'AnimatedText' && node.props.accessibilityRole === 'link');
        expect(links).toHaveLength(0);
    });

    it('skips session file link processing when no session root is available', () => {
        storageState.sessionRoot = null;
        parseMarkdown.mockReturnValue([
            { type: 'text', content: [{ styles: [], text: 'Open packages/happy-app/App.tsx now', url: null }] },
        ]);

        let renderer: any;
        act(() => {
            renderer = TestRenderer.create(<MarkdownView markdown="raw" sessionId="session-1" />);
        });

        const links = renderer!.root.findAll((node: any) => node.type === 'AnimatedText' && node.props.accessibilityRole === 'link');
        expect(links).toHaveLength(0);
    });

    it('routes internal file link presses to the full-screen viewer URL', () => {
        parseMarkdown.mockReturnValue([
            { type: 'text', content: [{ styles: [], text: 'Open packages/happy-app/App.tsx:12:3 now', url: null }] },
        ]);

        let renderer: any;
        act(() => {
            renderer = TestRenderer.create(<MarkdownView markdown="raw" sessionId="session-1" />);
        });

        const link = renderer!.root.findAll((node: any) => node.type === 'AnimatedText' && node.props.accessibilityRole === 'link')[0];
        act(() => {
            link.props.onPress();
        });

        expect(push).toHaveBeenCalledWith('/session/session-1/file?path=L1VzZXJzL2tpcmlsbGR1Ym92aXRza2l5L3Byb2plY3RzL2hhcHB5L3BhY2thZ2VzL2hhcHB5LWFwcC9BcHAudHN4&line=12&column=3&refresh=1&view=file');
    });
});
