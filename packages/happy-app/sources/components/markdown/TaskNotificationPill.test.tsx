import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('react-native', () => ({
    ActivityIndicator: 'ActivityIndicator',
    Platform: {
        OS: 'android',
        select: <T,>(specifics: Record<string, T | undefined> & { default?: T }) => specifics.android ?? specifics.default,
    },
    Pressable: 'Pressable',
    ScrollView: 'ScrollView',
    Text: 'Text',
    View: 'View',
}));

vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        create: (factory: (theme: { colors: Record<string, string> }) => Record<string, unknown>) =>
            factory({
                colors: {
                    divider: '#ddd',
                    surface: '#fff',
                    surfaceHighest: '#f0f0f0',
                    surfacePressed: '#e0e0e0',
                    text: '#000',
                    textSecondary: '#8E8E93',
                },
            }),
    },
}));

vi.mock('@expo/vector-icons', () => ({
    Ionicons: 'Ionicons',
}));

vi.mock('@/components/Item', () => ({
    Item: 'Item',
}));

vi.mock('@/components/StyledText', () => ({
    Text: 'Text',
}));

vi.mock('@/constants/Typography', () => ({
    Typography: {
        default: () => ({}),
    },
}));

const showModal = vi.fn();

vi.mock('@/modal', () => ({
    Modal: {
        show: (...args: unknown[]) => showModal(...args),
    },
}));

const {
    TaskNotificationPill,
    getTaskNotificationStatusAppearance,
} = await import('./TaskNotificationPill');
const {
    TaskNotificationDetailModal,
    getTaskNotificationDetailRows,
} = await import('./TaskNotificationDetailModal');

const baseData = {
    taskId: 'task-123',
    taskType: 'review',
    outputFile: '/tmp/task-123.output',
    status: 'completed',
    summary: 'Agent finished the requested work.',
};

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

describe('TaskNotificationPill', () => {
    beforeEach(() => {
        showModal.mockReset();
    });

    it.each([
        ['completed', { type: 'icon', name: 'checkmark-circle', color: '#34C759' }],
        ['failed', { type: 'icon', name: 'close-circle', color: '#FF3B30' }],
        ['killed', { type: 'icon', name: 'stop-circle', color: '#8E8E93' }],
        ['running', { type: 'spinner', color: '#007AFF' }],
        ['pending', { type: 'icon', name: 'hourglass-outline', color: '#8E8E93' }],
        ['unknown', { type: 'icon', name: 'hourglass-outline', color: '#8E8E93' }],
    ] as const)('maps %s to the expected task-notification status indicator', (status, expected) => {
        expect(getTaskNotificationStatusAppearance(status)).toEqual(expected);
    });

    it('opens the detail modal with the task data on press', () => {
        const tree = TaskNotificationPill({ data: baseData });
        const pressable = findAllByType(tree, 'Pressable')[0];

        expect(pressable).toBeDefined();

        const onPress = pressable.props.onPress as undefined | (() => void);
        onPress?.();

        expect(showModal).toHaveBeenCalledWith({
            component: TaskNotificationDetailModal,
            props: { data: baseData },
        });
    });

    it('omits the tool-use-id row when no tool use id is present', () => {
        const tree = TaskNotificationDetailModal({ data: baseData });
        const itemRows = findAllByType(tree, 'Item');

        expect(getTaskNotificationDetailRows(baseData).map(row => row.key)).toEqual([
            'task-id',
            'task-type',
            'output-file',
        ]);
        expect(itemRows.map(row => row.props.title)).toEqual(['Task ID', 'Task Type', 'Output File']);
        expect(itemRows.some(row => row.props.title === 'Tool Use ID')).toBe(false);
    });

    it('renders the tool-use-id row through Item with copy set to the value when present', () => {
        const data = { ...baseData, toolUseId: 'toolu_456', status: 'failed' };
        const tree = TaskNotificationDetailModal({ data });
        const itemRows = findAllByType(tree, 'Item');
        const toolUseIdRow = itemRows.find(row => row.props.title === 'Tool Use ID');

        expect(getTaskNotificationDetailRows(data).map(row => row.key)).toEqual([
            'task-id',
            'tool-use-id',
            'task-type',
            'output-file',
        ]);
        expect(toolUseIdRow).toBeDefined();
        expect(toolUseIdRow?.props.copy).toBe('toolu_456');
        expect(toolUseIdRow?.props.subtitle).toBe('toolu_456');
        expect(toolUseIdRow?.props.showChevron).toBe(false);
    });
});
