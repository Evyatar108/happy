import * as React from 'react';
import { ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Item } from '@/components/Item';
import { Text } from '@/components/StyledText';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';

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

export function getTaskNotificationStatusLabel(status: string) {
    switch (status.trim().toLowerCase()) {
        case 'completed':
            return t('chat.taskNotification.status.completed');
        case 'failed':
            return t('chat.taskNotification.status.failed');
        case 'killed':
            return t('chat.taskNotification.status.killed');
        case 'running':
            return t('chat.taskNotification.status.running');
        case 'pending':
            return t('chat.taskNotification.status.pending');
        default:
            return t('chat.taskNotification.status.unknown');
    }
}

export function getTaskNotificationDetailRows(data: TaskNotificationData): TaskNotificationDetailRow[] {
    const rows: TaskNotificationDetailRow[] = [
        { key: 'task-id', title: t('chat.taskNotification.taskId'), value: data.taskId },
        { key: 'output-file', title: t('chat.taskNotification.outputFile'), value: data.outputFile },
    ];

    if (data.taskType) {
        rows.splice(1, 0, { key: 'task-type', title: t('chat.taskNotification.taskType'), value: data.taskType });
    }
    if (data.toolUseId) {
        rows.splice(1, 0, { key: 'tool-use-id', title: t('chat.taskNotification.toolUseId'), value: data.toolUseId });
    }

    return rows;
}

export function TaskNotificationDetailModal({ data }: TaskNotificationDetailModalProps) {
    const rows = getTaskNotificationDetailRows(data);

    return (
        <View style={styles.modal}>
            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                <View style={styles.header}>
                    <Text style={styles.title}>{t('chat.taskNotification.title')}</Text>
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
                    <Text style={styles.summaryLabel}>{t('chat.taskNotification.summary')}</Text>
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
