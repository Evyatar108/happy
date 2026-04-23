import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { CommandSource } from '@/sync/suggestionCommands';

vi.mock('react-native', () => ({
    Text: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('Text', props, children),
    View: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('View', props, children),
}));

vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        create: (factory: (theme: { colors: Record<string, string> }) => Record<string, unknown>) =>
            factory({
                colors: {
                    surfaceHigh: '#eee',
                    text: '#111',
                    textSecondary: '#666',
                },
            }),
    },
}));

vi.mock('@expo/vector-icons', () => ({
    Ionicons: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('Ionicon', props, children),
}));

vi.mock('@/constants/Typography', () => ({
    Typography: {
        default: () => ({}),
    },
}));

vi.mock('@/text', () => ({
    t: (key: string) => key,
}));

const { CommandSuggestion } = await import('./AgentInputSuggestionView');

function renderCommandSuggestion(source: CommandSource): React.ReactElement {
    return (CommandSuggestion as unknown as {
        type: (props: {
            command: string;
            description?: string;
            source: CommandSource;
        }) => React.ReactElement;
    }).type({
        command: 'demo',
        description: 'Demo description',
        source,
    });
}

function countByTestId(node: React.ReactNode, testID: string): number {
    if (Array.isArray(node)) {
        return node.reduce((count, child) => count + countByTestId(child, testID), 0);
    }

    if (!React.isValidElement<{ children?: React.ReactNode; testID?: string }>(node)) {
        return 0;
    }

    return (node.props.testID === testID ? 1 : 0) + countByTestId(node.props.children, testID);
}

describe('CommandSuggestion', () => {
    it.each([
        ['native-prompt', 0],
        ['native-local', 0],
        ['skill', 1],
        ['plugin', 1],
        ['app-synthetic', 0],
    ] as const)('renders source badges only for skill and plugin commands (%s)', (source, badgeCount) => {
        const tree = renderCommandSuggestion(source);

        expect(countByTestId(tree, 'command-source-badge')).toBe(badgeCount);
    });
});
