import * as React from 'react';
import { ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Item } from '@/components/Item';
import { Text } from '@/components/StyledText';
import { Typography } from '@/constants/Typography';

import type { TaskNotificationData } from './processClaudeMetaTags';

type TaskNotificationDetailModalProps = {
    data: TaskNotificationData;
    onClose?: () => void;
};

type TaskNotificationDetailRow = {
    key: 'task-id' | 'tool-use-id' | 'task-type' | 'output-file';
    title: string;
    value: string;
};

const DETAIL_LABELS = {
    title: 'Task notification',
    taskId: 'Task ID',
    toolUseId: 'Tool Use ID',
    taskType: 'Task Type',
    outputFile: 'Output File',
    summary: 'Summary',
    completed: 'Completed',
    failed: 'Failed',
    killed: 'Stopped',
    running: 'Running',
    pending: 'Pending',
    unknown: 'Unknown',
} as const;

export function getTaskNotificationStatusLabel(status: string) {
    switch (status.trim().toLowerCase()) {
        case 'completed':
            return DETAIL_LABELS.completed;
        case 'failed':
            return DETAIL_LABELS.failed;
        case 'killed':
            return DETAIL_LABELS.killed;
        case 'running':
            return DETAIL_LABELS.running;
        case 'pending':
            return DETAIL_LABELS.pending;
        default:
            return DETAIL_LABELS.unknown;
    }
}

export function getTaskNotificationDetailRows(data: TaskNotificationData): TaskNotificationDetailRow[] {
    const rows: TaskNotificationDetailRow[] = [
        { key: 'task-id', title: DETAIL_LABELS.taskId, value: data.taskId },
        { key: 'task-type', title: DETAIL_LABELS.taskType, value: data.taskType },
        { key: 'output-file', title: DETAIL_LABELS.outputFile, value: data.outputFile },
    ];

    if (data.toolUseId) {
        rows.splice(1, 0, { key: 'tool-use-id', title: DETAIL_LABELS.toolUseId, value: data.toolUseId });
    }

    return rows;
}

export function TaskNotificationDetailModal({ data }: TaskNotificationDetailModalProps) {
    const rows = getTaskNotificationDetailRows(data);

    return (
        <View style={styles.modal}>
            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                <View style={styles.header}>
                    <Text style={styles.title}>{DETAIL_LABELS.title}</Text>
                    <Text style={styles.status}>{getTaskNotificationStatusLabel(data.status)}</Text>
                </View>

                <View style={styles.rows}>
                    {rows.map((row, index) => (
                        <Item
                            key={row.key}
                            title={row.title}
                            subtitle={row.value}
                            subtitleLines={0}
                            copy={row.value}
                            showChevron={false}
                            showDivider={index < rows.length - 1}
                        />
                    ))}
                </View>

                <View style={styles.summarySection}>
                    <Text style={styles.summaryLabel}>{DETAIL_LABELS.summary}</Text>
                    <Text style={styles.summaryText}>{data.summary}</Text>
                </View>
            </ScrollView>
        </View>
    );
}

export default React.memo(TaskNotificationDetailModal);

const styles = StyleSheet.create((theme) => ({
    modal: {
        width: '100%',
        maxWidth: 480,
        maxHeight: 560,
        marginHorizontal: 16,
        borderRadius: 16,
        backgroundColor: theme.colors.surface,
        overflow: 'hidden',
    },
    scrollView: {
        flexGrow: 0,
    },
    scrollContent: {
        paddingVertical: 20,
    },
    header: {
        paddingHorizontal: 20,
        paddingBottom: 16,
    },
    title: {
        ...Typography.default('semiBold'),
        fontSize: 18,
        lineHeight: 24,
        color: theme.colors.text,
    },
    status: {
        ...Typography.default(),
        marginTop: 4,
        fontSize: 14,
        lineHeight: 20,
        color: theme.colors.textSecondary,
    },
    rows: {
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: theme.colors.divider,
    },
    summarySection: {
        paddingHorizontal: 20,
        paddingTop: 20,
    },
    summaryLabel: {
        ...Typography.default('semiBold'),
        fontSize: 14,
        lineHeight: 20,
        color: theme.colors.textSecondary,
    },
    summaryText: {
        ...Typography.default(),
        marginTop: 8,
        fontSize: 16,
        lineHeight: 24,
        color: theme.colors.text,
    },
}));
