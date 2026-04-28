import * as React from 'react';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const theme = {
    colors: {
        surface: '#ffffff',
        text: '#000000',
        textSecondary: '#8E8E93',
    },
};

vi.mock('react-native', () => ({
    Text: 'Text',
    View: 'View',
}));

vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        create: (factory: (themeArg: typeof theme) => Record<string, unknown>) => factory(theme),
    },
}));

vi.mock('@/components/StyledText', () => ({
    Text: 'Text',
}));

vi.mock('@/constants/Typography', () => ({
    Typography: {
        default: () => ({}),
    },
}));

vi.mock('@/text', () => ({
    t: (key: string) => ({
        'chat.boundaryDivider.kind.clear': 'Context cleared',
        'chat.boundaryDivider.kind.compact': 'Compacted',
        'chat.boundaryDivider.kind.autocompact': 'Auto-compacted',
        'chat.boundaryDivider.kind.planModeEnter': 'Plan mode entered',
        'chat.boundaryDivider.kind.planModeExit': 'Plan mode exited',
        'chat.boundaryDivider.kind.sessionForkResume': 'Resumed from previous session',
    }[key] ?? key),
}));

const { BoundaryDivider, getBoundaryDividerLabel } = await import('./BoundaryDivider');

function findAllByType(node: React.ReactNode, type: string): Array<React.ReactElement<Record<string, unknown>>> {
    if (Array.isArray(node)) {
        return node.flatMap(child => findAllByType(child, type));
    }

    if (!React.isValidElement<Record<string, unknown>>(node)) {
        return [];
    }

    const children = ('children' in node.props ? node.props.children : undefined) as React.ReactNode;
    const matches = typeof node.type === 'string' && node.type === type ? [node] : [];

    return matches.concat(findAllByType(children, type));
}

describe('BoundaryDivider', () => {
    it('maps every context-boundary kind to its user-facing label', () => {
        expect(getBoundaryDividerLabel('clear')).toBe('Context cleared');
        expect(getBoundaryDividerLabel('compact')).toBe('Compacted');
        expect(getBoundaryDividerLabel('autocompact')).toBe('Auto-compacted');
        expect(getBoundaryDividerLabel('plan-mode-enter')).toBe('Plan mode entered');
        expect(getBoundaryDividerLabel('plan-mode-exit')).toBe('Plan mode exited');
        expect(getBoundaryDividerLabel('session-fork-resume')).toBe('Resumed from previous session');
    });

    it('uses the static e-ink-safe divider style', () => {
        const tree = BoundaryDivider({ kind: 'clear' });
        const views = findAllByType(tree, 'View');
        const text = findAllByType(tree, 'Text')[0];

        expect(views[0]?.props.style).toMatchObject({
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.textSecondary,
            borderWidth: 2,
        });
        expect(views[1]?.props.style).toMatchObject({
            backgroundColor: theme.colors.text,
            width: 4,
        });
        expect(text?.props.children).toBe('Context cleared');
    });

    it('does not import animation primitives', () => {
        const source = readFileSync(new URL('./BoundaryDivider.tsx', import.meta.url), 'utf8');

        expect(source).not.toContain('Animated.');
        expect(source).not.toContain('useNativeDriver');
        expect(source).not.toContain('react-native-reanimated');
    });
});
