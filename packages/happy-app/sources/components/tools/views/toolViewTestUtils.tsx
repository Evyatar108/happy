import * as React from 'react';
import { Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { vi } from 'vitest';
import type { ToolCall } from '@/sync/typesMessage';

(
    globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
    }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', () => ({
    Pressable: 'Pressable',
    Platform: {
        OS: 'ios',
        select: (specifics: Record<string, unknown>) => specifics.ios ?? specifics.default,
    },
    ScrollView: 'ScrollView',
    StyleSheet: {
        create: (styles: unknown) => styles,
        flatten: (style: unknown) => style,
    },
    Text: 'Text',
    View: 'View',
}));

const diffColors = new Proxy({}, { get: () => '#111111' }) as Record<string, string>;
const theme = {
    colors: new Proxy({
        box: {
            error: { background: '#111111', border: '#111111', text: '#111111' },
            warning: { text: '#111111' },
        },
        diff: diffColors,
    }, {
        get: (target, prop) => prop in target ? target[prop as keyof typeof target] : '#111111',
    }) as Record<string, string> & {
        box: {
            error: { background: string; border: string; text: string };
            warning: { text: string };
        };
        diff: Record<string, string>;
    },
};

vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        create: (factory: unknown) => typeof factory === 'function' ? (factory as (themeArg: typeof theme, runtime: unknown) => Record<string, unknown>)(theme, {}) : factory,
    },
    useUnistyles: () => ({ theme }),
}));

vi.mock('react-native-reanimated', () => ({
    useAnimatedStyle: () => ({}),
}));

vi.mock('@expo/vector-icons', () => ({
    Ionicons: 'Ionicons',
    MaterialCommunityIcons: 'MaterialCommunityIcons',
    Octicons: 'Octicons',
}));

vi.mock('@/sync/storage', () => ({
    useSetting: () => false,
}));

vi.mock('@/text', () => ({
    t: (key: string, params?: Record<string, unknown>) => {
        switch (key) {
            case 'toolView.output':
                return 'Output';
            case 'tools.multiEdit.editNumber':
                return `Edit ${params?.index} of ${params?.total}`;
            case 'tools.multiEdit.replaceAll':
                return 'Replace All';
            case 'tools.taskOutput.running':
                return 'Waiting for task output';
            case 'tools.taskOutput.taskId':
            case 'tools.taskStop.taskId':
                return `Task ${params?.taskId}`;
            case 'tools.taskOutput.blocking':
                return 'Blocking';
            case 'tools.taskOutput.timeout':
                return `Timeout ${params?.timeout}`;
            case 'tools.taskOutput.truncated':
                return 'Truncated';
            case 'tools.taskOutput.parseError':
                return 'Task output result could not be parsed';
            case 'tools.taskStop.running':
                return 'Stopping task...';
            case 'tools.taskStop.stopped':
                return 'Stopped';
            case 'tools.taskStop.notFound':
                return 'Task not found';
            case 'tools.taskStop.alreadyStopped':
                return 'Task already stopped';
            case 'tools.taskStop.parseError':
                return 'Task stop result could not be parsed';
            default:
                return key;
        }
    },
}));

vi.mock('@/components/StyledText', () => ({
    AnimatedText: 'Text',
    Text: 'Text',
}));

vi.mock('@/constants/Typography', () => ({
    Typography: {
        default: () => ({}),
        mono: () => ({}),
    },
}));

vi.mock('@/hooks/useChatFontScale', () => ({
    useChatScaleAnimatedTextStyle: () => null,
    useChatScaledStyles: (styles: unknown) => styles,
}));

vi.mock('@/components/diff/CollapsibleDiffPreview', () => ({
    CollapsibleDiffPreview: ({ oldText, newText, renderDiff }: {
        oldText: string;
        newText: string;
        renderDiff: (args: { hunks: unknown[]; maxVisibleLines: number }) => React.ReactNode;
    }) => (
        <React.Fragment>
            <Text>{`Preview old:${oldText} new:${newText}`}</Text>
            {renderDiff({ hunks: [], maxVisibleLines: 10 })}
        </React.Fragment>
    ),
}));

vi.mock('@/components/tools/ToolDiffView', () => ({
    ToolDiffView: ({ fileName, oldText, newText, patch }: {
        fileName?: string;
        oldText?: string;
        newText?: string;
        patch?: string;
    }) => (
        <Text>{`ToolDiffView file:${fileName ?? ''} old:${oldText ?? ''} new:${newText ?? ''} patch:${patch ?? ''}`}</Text>
    ),
}));

vi.mock('@/components/tools/ToolSectionView', () => ({
    ToolSectionView: ({ title, children }: { title?: string; children: React.ReactNode }) => (
        <View>
            {title ? <Text>{`Section:${title}`}</Text> : null}
            {children}
        </View>
    ),
}));

vi.mock('@/components/tools/ToolError', () => ({
    ToolError: ({ message }: { message: string }) => <Text>{`ToolError:${message}`}</Text>,
}));

vi.mock('@/components/CodeView', () => ({
    CodeView: ({ code }: { code: string }) => <Text>{`CodeView:${code}`}</Text>,
}));

export const pathMetadata = { path: '/Users/steve/project', host: 'devbox' };

export function makeTool(overrides: Partial<ToolCall>): ToolCall {
    return {
        name: 'TestTool',
        state: 'completed',
        input: {},
        createdAt: 1,
        startedAt: 1,
        completedAt: 2,
        description: null,
        ...overrides,
    };
}

type Renderer = ReturnType<typeof TestRenderer.create>;

export function renderTree(element: React.ReactElement): Renderer {
    let renderer: Renderer;
    act(() => {
        renderer = TestRenderer.create(element);
    });
    return renderer!;
}

export function treeText(renderer: Renderer): string {
    return JSON.stringify(renderer.toJSON());
}
