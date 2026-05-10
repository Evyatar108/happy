import * as React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { Message, ToolCall } from '@/sync/typesMessage';

(
    globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
    }
).IS_REACT_ACT_ENVIRONMENT = true;

const theme = {
    colors: {
        textSecondary: '#8E8E93',
        warning: '#FF9500',
        success: '#34C759',
        textDestructive: '#FF3B30',
    },
};

vi.mock('react-native', () => ({
    View: 'View',
    ActivityIndicator: 'ActivityIndicator',
    Platform: { OS: 'ios' },
}));

vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        create: (factory: (themeArg: typeof theme) => Record<string, unknown>) => factory(theme),
    },
    useUnistyles: () => ({ theme }),
}));

vi.mock('@expo/vector-icons', () => ({
    Ionicons: (props: Record<string, unknown>) => React.createElement('Ionicons', props),
}));

vi.mock('@/components/StyledText', () => ({
    AnimatedText: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('AnimatedText', props, children),
}));

vi.mock('@/hooks/useChatFontScale', () => ({
    useChatScaleAnimatedTextStyle: () => null,
}));

vi.mock('@/text', () => ({
    t: (key: string) => key,
}));

vi.mock('@/components/tools/knownTools', () => ({
    knownTools: {},
}));

const { TaskView } = await import('./TaskView');

type TestNode = {
    props: Record<string, unknown>;
};

function createTool(state: ToolCall['state'] = 'running', input: Record<string, unknown> = {}): ToolCall {
    return {
        name: 'Task',
        state,
        input,
        createdAt: 1,
        startedAt: 1,
        completedAt: state === 'running' ? null : 2,
        description: null,
    };
}

function createToolMessage(id: string, toolName: string, children: Message[] = []): Extract<Message, { kind: 'tool-call' }> {
    return {
        id,
        localId: null,
        createdAt: 1,
        seq: 1,
        kind: 'tool-call',
        tool: { name: toolName, state: 'completed', input: {}, createdAt: 1, startedAt: 1, completedAt: 2, description: null },
        children,
    };
}

function renderTaskView(tool: ToolCall, messages: Message[]) {
    let renderer: ReturnType<typeof TestRenderer.create> | null = null;

    act(() => {
        renderer = TestRenderer.create(
            <TaskView
                tool={tool}
                metadata={null}
                messages={messages}
            />
        );
    });

    return renderer as ReturnType<typeof TestRenderer.create>;
}

describe('TaskView', () => {
    it('renders agent label header even when children list is empty', () => {
        const tool = createTool('running');
        const tree = renderTaskView(tool, []);
        const texts = (tree.root.findAllByType('AnimatedText') as TestNode[]).map(node => node.props.children);

        expect(texts).toContain('tools.names.agent');
    });

    it('does not render subtitle when children list is empty', () => {
        const tool = createTool('running');
        const tree = renderTaskView(tool, []);
        const animatedTexts = tree.root.findAllByType('AnimatedText') as TestNode[];

        expect(animatedTexts).toHaveLength(1);
    });

    it('renders subtitle when a child tool-call message exists', () => {
        const tool = createTool('running');
        const child = createToolMessage('child-bash', 'Bash');
        const tree = renderTaskView(tool, [child]);
        const texts = (tree.root.findAllByType('AnimatedText') as TestNode[]).map(node => node.props.children);

        expect(texts).toContain('tools.names.agent');
        expect(texts).toHaveLength(2);
    });

    it('renders subagent_type label when provided', () => {
        const tool = createTool('running', { subagent_type: 'planner' });
        const tree = renderTaskView(tool, []);
        const texts = (tree.root.findAllByType('AnimatedText') as TestNode[]).map(node => node.props.children);

        expect(texts[0]).toContain('planner');
    });

    it('renders status indicator when running', () => {
        const tool = createTool('running');
        const tree = renderTaskView(tool, []);
        const indicators = tree.root.findAllByType('ActivityIndicator') as TestNode[];

        expect(indicators).toHaveLength(1);
    });
});
