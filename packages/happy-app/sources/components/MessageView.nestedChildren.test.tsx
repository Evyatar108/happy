import * as React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Message, ToolCall } from '@/sync/typesMessage';

(
    globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
    }
).IS_REACT_ACT_ENVIRONMENT = true;

const toolViewProps: Array<{ tool: ToolCall; messages?: Message[] }> = [];

const theme = {
    colors: {
        agentEventText: '#8E8E93',
        textSecondary: '#8E8E93',
        userMessageBackground: '#f4f4f4',
    },
};

vi.mock('react-native', () => ({
    View: 'View',
}));

vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        create: (factory: (themeArg: typeof theme) => Record<string, unknown>) => factory(theme),
    },
}));

vi.mock('@/components/tools/ToolView', () => ({
    ToolView: (props: { tool: ToolCall; messages?: Message[] }) => {
        toolViewProps.push(props);
        return React.createElement('ToolViewMock', { toolName: props.tool.name, messages: props.messages });
    },
}));

vi.mock('./markdown/MarkdownView', () => ({
    MarkdownView: (props: { markdown: string }) => React.createElement('MarkdownViewMock', props),
}));

vi.mock('@/components/BoundaryDivider', () => ({
    BoundaryDivider: (props: { kind: string }) => React.createElement('BoundaryDividerMock', props),
}));

vi.mock('@/components/StyledText', () => ({
    AnimatedText: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('AnimatedText', props, children),
}));

vi.mock('@/hooks/useChatFontScale', () => ({
    useChatScaleAnimatedTextStyle: () => null,
}));

vi.mock('@/sync/sync', () => ({
    sync: {
        sendMessage: vi.fn(),
    },
}));

vi.mock('@/sync/storage', () => ({
    storage: {
        getState: vi.fn(),
    },
}));

vi.mock('@/text', () => ({
    t: (key: string, params?: { count?: number }) => {
        if (key === 'tools.taskView.moreSteps') {
            return `+${params?.count ?? 0} more steps`;
        }

        return key;
    },
}));

const { MessageView } = await import('./MessageView');

type TestNode = {
    props: Record<string, unknown>;
};

function createTool(name: string, state: ToolCall['state'] = 'completed'): ToolCall {
    return {
        name,
        state,
        input: {},
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
        tool: createTool(toolName),
        children,
    };
}

function renderMessage(message: Message) {
    let renderer: ReturnType<typeof TestRenderer.create> | null = null;

    act(() => {
        renderer = TestRenderer.create(
            <MessageView
                message={message}
                metadata={null}
                sessionId="session-1"
                chatBodyWidth={640}
            />
        );
    });

    return renderer as ReturnType<typeof TestRenderer.create>;
}

describe('MessageView nested tool-call children', () => {
    beforeEach(() => {
        toolViewProps.length = 0;
    });

    it('renders child tool calls exactly once after the parent tool view', () => {
        const child = createToolMessage('child-bash', 'Bash');
        const parent = createToolMessage('parent-task', 'Task', [child]);
        const tree = renderMessage(parent);
        const toolViews = tree.root.findAllByType('ToolViewMock') as TestNode[];

        expect(toolViews.map(node => node.props.toolName)).toEqual(['Task', 'Bash']);
        expect(toolViews.filter(node => node.props.toolName === 'Bash')).toHaveLength(1);
    });

    it('collapses children deeper than depth 3 into one summary row', () => {
        const deeplyNested = createToolMessage('depth-0', 'Task', [
            createToolMessage('depth-1', 'Agent', [
                createToolMessage('depth-2', 'Task', [
                    createToolMessage('depth-3', 'Agent', [
                        createToolMessage('depth-4', 'Bash'),
                    ]),
                ]),
            ]),
        ]);

        const tree = renderMessage(deeplyNested);
        const toolViews = tree.root.findAllByType('ToolViewMock') as TestNode[];
        const summaryText = (tree.root.findAllByType('AnimatedText') as TestNode[])
            .map(node => node.props.children)
            .find(child => child === '+1 more steps');

        expect(toolViews.map(node => node.props.toolName)).toEqual(['Task', 'Agent', 'Task', 'Agent']);
        expect(summaryText).toBe('+1 more steps');
    });

    it('still passes children through to ToolView for minimal-tool detection', () => {
        const child = createToolMessage('child-read', 'Read');
        const parent = createToolMessage('parent-agent', 'Agent', [child]);

        renderMessage(parent);

        expect(toolViewProps[0]?.tool.name).toBe('Agent');
        expect(toolViewProps[0]?.messages).toBe(parent.children);
    });

    it('counts only tool-call descendants in summary, ignoring interleaved agent-text messages', () => {
        const agentText = (id: string): Extract<Message, { kind: 'agent-text' }> => ({
            id,
            localId: null,
            createdAt: 1,
            seq: 1,
            kind: 'agent-text',
            text: 'some prose',
        });

        // Structure: depth-0(Task) → depth-1(Agent) → depth-2(Task) → depth-3(Agent)
        //   → depth-4 children: [Bash (tool-call), prose (agent-text)]
        // depth-3 renders at childDepth=4 which is > MAX_NESTED_CHILD_DEPTH(3), so its
        // children are collapsed into NestedStepsSummary. countNestedSteps must return 1
        // (only the Bash tool-call), not 2 (which would incorrectly count the prose too).
        const deeplyNested = createToolMessage('depth-0', 'Task', [
            createToolMessage('depth-1', 'Agent', [
                createToolMessage('depth-2', 'Task', [
                    createToolMessage('depth-3', 'Agent', [
                        createToolMessage('depth-4-tool', 'Bash'),
                        agentText('depth-4-prose'),
                    ]),
                ]),
            ]),
        ]);

        const tree = renderMessage(deeplyNested);
        const summaryText = (tree.root.findAllByType('AnimatedText') as TestNode[])
            .map(node => node.props.children)
            .find(child => typeof child === 'string' && child.startsWith('+'));

        expect(summaryText).toBe('+1 more steps');
    });

    it('uses the e-ink-safe nested child rail style', () => {
        const parent = createToolMessage('parent-task', 'Task', [createToolMessage('child-read', 'Read')]);
        const tree = renderMessage(parent);
        const nestedRail = (tree.root.findAllByType('View') as TestNode[]).find(node => {
            const style = node.props.style as Record<string, unknown> | undefined;
            return style?.marginLeft === 16 && style?.borderLeftWidth === 2;
        });

        expect(nestedRail?.props.style).toMatchObject({
            marginLeft: 16,
            borderLeftWidth: 2,
            borderLeftColor: theme.colors.textSecondary,
            paddingLeft: 12,
        });
    });
});
