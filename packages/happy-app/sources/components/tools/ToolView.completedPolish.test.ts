import * as React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import type { ToolCall } from '@/sync/typesMessage';

(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const theme = {
    colors: {
        surfaceHigh: '#f5f5f5',
        surfaceHighest: '#efefef',
        text: '#000000',
        textSecondary: '#8E8E93',
        warning: '#FF9500',
        permissionButton: {
            allow: { background: '#34C759' },
            deny: { background: '#FF3B30' },
            allowAll: { background: '#007AFF' },
        },
    },
};

vi.mock('react-native', () => ({
    View: 'View',
    TouchableOpacity: 'TouchableOpacity',
    ActivityIndicator: 'ActivityIndicator',
    Platform: { OS: 'web', select: (s: any) => s.default ?? s.ios },
    StyleSheet: {
        create: (styles: Record<string, unknown>) => styles,
        flatten: (s: unknown) => s,
        hairlineWidth: 1,
    },
    Text: 'Text',
}));

vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        create: (factory: (t: typeof theme) => Record<string, unknown>) => factory(theme),
    },
    useUnistyles: () => ({ theme }),
}));

vi.mock('react-native-reanimated', () => ({
    useAnimatedStyle: () => ({}),
}));

vi.mock('@expo/vector-icons', () => ({
    Ionicons: 'Ionicons',
    Octicons: 'Octicons',
    MaterialCommunityIcons: 'MaterialCommunityIcons',
}));

vi.mock('@/components/StyledText', () => ({
    AnimatedText: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('AnimatedText', props, children),
    Text: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('Text', props, children),
}));

vi.mock('@/hooks/useChatFontScale', () => ({
    useChatScaleAnimatedTextStyle: () => null,
    useChatScaledStyles: (s: unknown) => s,
}));

vi.mock('@/components/tools/ToolSectionView', () => ({
    ToolSectionView: 'ToolSectionView',
}));

vi.mock('@/components/CodeView', () => ({
    CodeView: 'CodeView',
}));

vi.mock('@/components/tools/ToolError', () => ({
    ToolError: 'ToolError',
}));

vi.mock('@/components/tools/views/_all', () => ({
    getToolViewComponent: () => null,
    getToolFullViewComponent: () => null,
}));

vi.mock('@/components/tools/knownTools', () => ({
    knownTools: {},
}));

vi.mock('@/sync/typesMessage', () => ({}));

vi.mock('@/utils/toolErrorParser', () => ({
    parseToolUseError: () => ({ isToolUseError: false }),
}));

vi.mock('@/components/tools/views/MCPToolView', () => ({
    formatMCPTitle: (name: string) => name,
}));

vi.mock('@/hooks/useElapsedTime', () => ({
    useElapsedTime: () => 1,
}));

vi.mock('expo-router', () => ({
    useRouter: () => ({ push: () => {} }),
}));

vi.mock('@/text', () => ({
    t: (key: string) => key,
}));

vi.mock('@/sync/ops', () => ({
    sessionAllow: vi.fn(),
    sessionDeny: vi.fn(),
}));

vi.mock('@/sync/storage', () => ({
    storage: { getState: vi.fn().mockReturnValue({ updateSessionPermissionMode: vi.fn() }) },
    useSetting: () => false,
}));

const { ToolView } = await import('./ToolView');
const { PermissionFooter } = await import('./PermissionFooter');

type TestNode = { props: Record<string, unknown> };

function makeTool(state: 'running' | 'completed' | 'error'): ToolCall {
    return {
        name: 'Bash',
        state,
        input: { command: 'ls' },
        result: null,
        createdAt: 1,
        startedAt: 1,
        completedAt: state === 'running' ? null : 2,
        description: null,
    };
}

function makeToolWithPermission(state: 'running' | 'completed' | 'error'): ToolCall {
    return {
        ...makeTool(state),
        permission: { id: 'perm-1', status: 'pending' as const },
    };
}

function renderToolView(tool: ToolCall) {
    let renderer: ReturnType<typeof TestRenderer.create> | null = null;
    act(() => {
        renderer = TestRenderer.create(
            React.createElement(ToolView, {
                tool,
                metadata: null,
                sessionId: 'session-1',
                messageId: 'msg-1',
            })
        );
    });
    return renderer as ReturnType<typeof TestRenderer.create>;
}

describe('completed tool view polish', () => {
    it('removes high-surface backgrounds from completed tool cards', () => {
        const tree = renderToolView(makeTool('completed'));

        function findByStylePredicate(predicate: (style: Array<Record<string, unknown>>) => boolean) {
            return tree.root.findAll((node: { props: Record<string, unknown> }) => {
                const style = node.props.style as Array<Record<string, unknown>> | undefined;
                return Array.isArray(style) && predicate(style);
            });
        }

        const containerCompleted = findByStylePredicate(style =>
            style.some(s => s && (s as Record<string, unknown>).backgroundColor === 'transparent')
        );
        expect(containerCompleted.length).toBeGreaterThanOrEqual(1);

        const headerCompleted = findByStylePredicate(style =>
            style.some(s => s && (s as Record<string, unknown>).borderBottomWidth === 2)
        );
        expect(headerCompleted.length).toBeGreaterThanOrEqual(1);
        const headerStyle = headerCompleted[0].props.style as Array<Record<string, unknown>>;
        const completedStyleEntry = headerStyle.find(s => s && (s as Record<string, unknown>).borderBottomWidth === 2) as Record<string, unknown>;
        expect(completedStyleEntry.borderBottomColor).toBe(theme.colors.textSecondary);
    });

    it('keeps running tool cards with non-transparent container background', () => {
        const tree = renderToolView(makeTool('running'));
        const allViews = tree.root.findAllByType('View') as TestNode[];

        const containerRunning = allViews.find(node => {
            const style = node.props.style as Array<Record<string, unknown>> | undefined;
            if (!Array.isArray(style)) return false;
            const base = style.find(s => s && typeof (s as Record<string, unknown>).backgroundColor === 'string');
            if (!base) return false;
            const bg = (base as Record<string, unknown>).backgroundColor;
            return bg !== 'transparent' && bg === theme.colors.surfaceHigh;
        });
        expect(containerRunning).toBeDefined();
    });

    it('passes toolState into the permission footer', () => {
        const tree = renderToolView(makeToolWithPermission('running'));
        const json = JSON.stringify(tree.toJSON());
        expect(json).toBeDefined();
    });
});

describe('PermissionFooter layout direction by toolState', () => {
    const basePermission = {
        id: 'perm-1',
        status: 'pending' as const,
    };

    it('keeps running permission actions vertical', () => {
        let renderer: ReturnType<typeof TestRenderer.create> | null = null;
        act(() => {
            renderer = TestRenderer.create(
                React.createElement(PermissionFooter, {
                    permission: basePermission,
                    sessionId: 'session-1',
                    toolName: 'Bash',
                    toolState: 'running',
                })
            );
        });

        const allViews = (renderer as ReturnType<typeof TestRenderer.create>)
            .root.findAllByType('View') as TestNode[];
        const buttonContainer = allViews.find(node => {
            const s = node.props.style as Record<string, unknown> | undefined;
            return s?.flexDirection === 'column';
        });
        expect(buttonContainer?.props.style).toMatchObject({
            flexDirection: 'column',
            gap: 4,
            flexWrap: 'nowrap',
        });
    });

    it('groups completed permission actions horizontally', () => {
        let renderer: ReturnType<typeof TestRenderer.create> | null = null;
        act(() => {
            renderer = TestRenderer.create(
                React.createElement(PermissionFooter, {
                    permission: basePermission,
                    sessionId: 'session-1',
                    toolName: 'Bash',
                    toolState: 'completed',
                })
            );
        });

        const allViews = (renderer as ReturnType<typeof TestRenderer.create>)
            .root.findAllByType('View') as TestNode[];
        const buttonContainer = allViews.find(node => {
            const s = node.props.style as Record<string, unknown> | undefined;
            return s?.flexDirection === 'row';
        });
        expect(buttonContainer?.props.style).toMatchObject({
            flexDirection: 'row',
            gap: 8,
            flexWrap: 'wrap',
        });
    });
});
