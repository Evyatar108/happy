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
const platform = { OS: 'android' };
const sessionReadFile = vi.fn();
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
    Platform: platform,
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

vi.mock('@/utils/sessionFileLinks', async () => await vi.importActual('@/utils/sessionFileLinks'));
vi.mock('@/utils/base64url', async () => await vi.importActual('@/utils/base64url'));

vi.mock('@/sync/persistence', () => ({
    storeTempText: (content: string) => storeTempText(content),
}));

vi.mock('@/sync/ops', () => ({
    sessionReadFile: (sessionId: string, path: string) => sessionReadFile(sessionId, path),
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

vi.mock('./linkUtils', async () => await vi.importActual('./linkUtils'));

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
        platform.OS = 'android';
        push.mockReset();
        storeTempText.mockReset();
        storeTempText.mockReturnValue('temp-text-id');
        parseMarkdown.mockReset();
        sessionReadFile.mockReset();
        processClaudeMetaTags.mockReset();
        processClaudeMetaTags.mockImplementation((raw: string) => ({
            renderMarkdown: raw,
            copyMarkdown: raw,
            taskNotifications: [],
        }));
        storageState.sessionRoot = '/Users/kirilldubovitskiy/projects/happy';
    });

    function mockImageMarkdown(url: string, alt = 'Preview image') {
        processClaudeMetaTags.mockReturnValue({
            renderMarkdown: `![${alt}](${url})`,
            copyMarkdown: `![${alt}](${url})`,
            taskNotifications: [],
        });
        parseMarkdown.mockReturnValue([
            { type: 'image', url, alt },
        ]);
    }

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

    it('prefixes web absolute image paths with the current origin', () => {
        platform.OS = 'web';
        vi.stubGlobal('window', { location: { origin: 'http://localhost:8095' } });
        mockImageMarkdown('/tmp/screenshots/result.png');

        let renderer: any;
        act(() => {
            renderer = TestRenderer.create(<MarkdownView markdown="raw" sessionId="session-1" />);
        });

        expect(renderer!.root.findByType('Image').props.source).toEqual({
            uri: 'http://localhost:8095/tmp/screenshots/result.png',
        });
        expect(sessionReadFile).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });

    it('passes through https and data image URIs unchanged', () => {
        platform.OS = 'web';
        mockImageMarkdown('https://example.com/image.png');

        let renderer: any;
        act(() => {
            renderer = TestRenderer.create(<MarkdownView markdown="raw" sessionId="session-1" />);
        });

        expect(renderer!.root.findByType('Image').props.source).toEqual({ uri: 'https://example.com/image.png' });

        mockImageMarkdown('data:image/png;base64,abc123');
        act(() => {
            renderer!.update(<MarkdownView markdown="raw-data" sessionId="session-1" />);
        });

        expect(renderer!.root.findByType('Image').props.source).toEqual({ uri: 'data:image/png;base64,abc123' });
        expect(sessionReadFile).not.toHaveBeenCalled();
    });

    it('falls back to sessionReadFile data URIs after web absolute image load errors', async () => {
        platform.OS = 'web';
        vi.stubGlobal('window', { location: { origin: 'http://localhost:8095' } });
        sessionReadFile.mockResolvedValue({ success: true, content: 'iVBORw0KGgo=' });
        mockImageMarkdown('C:\\Users\\me\\Pictures\\diagram.svg');

        let renderer: any;
        act(() => {
            renderer = TestRenderer.create(<MarkdownView markdown="raw" sessionId="session-1" />);
        });

        await act(async () => {
            renderer!.root.findByType('Image').props.onError();
        });

        expect(sessionReadFile).toHaveBeenCalledWith('session-1', 'C:/Users/me/Pictures/diagram.svg');
        expect(renderer!.root.findByType('Image').props.source).toEqual({
            uri: 'data:image/svg+xml;base64,iVBORw0KGgo=',
        });
        vi.unstubAllGlobals();
    });

    it('renders a placeholder when a web absolute image cannot be read from the session', async () => {
        platform.OS = 'web';
        sessionReadFile.mockResolvedValue({ success: false, error: 'not found' });
        mockImageMarkdown('/tmp/missing.webp', 'Missing preview');

        let renderer: any;
        act(() => {
            renderer = TestRenderer.create(<MarkdownView markdown="raw" sessionId="session-1" />);
        });

        await act(async () => {
            renderer!.root.findByType('Image').props.onError();
        });

        expect(sessionReadFile).toHaveBeenCalledWith('session-1', '/tmp/missing.webp');
        expect(renderer!.root.findAllByType('Image')).toHaveLength(0);
        expect(renderer!.root.findAllByProps({ accessibilityLabel: 'Missing preview' })).toHaveLength(1);
    });

    it('renders a placeholder after web absolute image errors when sessionId is absent', () => {
        platform.OS = 'web';
        mockImageMarkdown('/tmp/no-session.png', 'No session preview');

        let renderer: any;
        act(() => {
            renderer = TestRenderer.create(<MarkdownView markdown="raw" />);
        });

        act(() => {
            renderer!.root.findByType('Image').props.onError();
        });

        expect(sessionReadFile).not.toHaveBeenCalled();
        expect(renderer!.root.findAllByType('Image')).toHaveLength(0);
        expect(renderer!.root.findAllByProps({ accessibilityLabel: 'No session preview' })).toHaveLength(1);
    });

    it('does not call setState after unmount when sessionReadFile resolves late', async () => {
        platform.OS = 'web';
        vi.stubGlobal('window', { location: { origin: 'http://localhost:8095' } });

        let resolveRead!: (value: { success: boolean; content: string }) => void;
        sessionReadFile.mockReturnValue(new Promise<{ success: boolean; content: string }>((res) => { resolveRead = res; }));
        mockImageMarkdown('/tmp/late.png');

        let renderer: any;
        act(() => {
            renderer = TestRenderer.create(<MarkdownView markdown="raw" sessionId="session-1" />);
        });

        act(() => {
            renderer!.root.findByType('Image').props.onError();
        });

        act(() => {
            renderer!.unmount();
        });

        const consoleSpy = vi.spyOn(console, 'error');

        await act(async () => {
            resolveRead({ success: true, content: 'iVBORw0KGgo=' });
        });

        expect(consoleSpy).not.toHaveBeenCalled();
        consoleSpy.mockRestore();
        vi.unstubAllGlobals();
    });

    it('leaves native absolute image paths as pass-through sources', () => {
        platform.OS = 'android';
        mockImageMarkdown('/tmp/screenshots/native.png');

        let renderer: any;
        act(() => {
            renderer = TestRenderer.create(<MarkdownView markdown="raw" sessionId="session-1" />);
        });

        expect(renderer!.root.findByType('Image').props.source).toEqual({ uri: '/tmp/screenshots/native.png' });
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

    it('does not route agent-authored file: links through onLinkPress', () => {
        // An agent can author markdown like [label](file:<base64url>) — this must NOT route
        // through the file viewer because it did not go through splitSessionFileText validation.
        const agentFileUrl = 'file:L1VzZXJzL2V2aWwvc2VjcmV0LnR4dA';
        parseMarkdown.mockReturnValue([
            { type: 'text', content: [{ styles: [], text: 'label', url: agentFileUrl }] },
        ]);

        let renderer: any;
        act(() => {
            renderer = TestRenderer.create(<MarkdownView markdown="raw" sessionId="session-1" />);
        });

        const links = renderer!.root.findAll((node: any) => node.type === 'AnimatedText' && node.props.accessibilityRole === 'link');
        expect(links).toHaveLength(0);
        expect(push).not.toHaveBeenCalled();
    });

    it('does not route agent-authored happy-file: links through onLinkPress', () => {
        // An agent can author markdown like [label](happy-file:<base64url>?line=1&column=0) —
        // the scheme rename alone is not sufficient protection since agents can author any scheme.
        // Only spans produced by addSessionFileLinksToSpans (via splitSessionFileText) are trusted.
        const agentHappyFileUrl = 'happy-file:L1VzZXJzL2V2aWwvc2VjcmV0LnR4dA?line=1&column=0';
        parseMarkdown.mockReturnValue([
            { type: 'text', content: [{ styles: [], text: 'label', url: agentHappyFileUrl }] },
        ]);

        let renderer: any;
        act(() => {
            renderer = TestRenderer.create(<MarkdownView markdown="raw" sessionId="session-1" />);
        });

        const links = renderer!.root.findAll((node: any) => node.type === 'AnimatedText' && node.props.accessibilityRole === 'link');
        expect(links).toHaveLength(0);
        expect(push).not.toHaveBeenCalled();
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
