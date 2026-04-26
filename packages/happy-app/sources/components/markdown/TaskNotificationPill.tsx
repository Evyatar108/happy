import * as React from 'react';
import { ActivityIndicator, Platform, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native-unistyles';

import { Text } from '@/components/StyledText';
import { Typography } from '@/constants/Typography';
import { Modal } from '@/modal';

import { TaskNotificationDetailModal } from './TaskNotificationDetailModal';
import type { TaskNotificationData } from './processClaudeMetaTags';

type TaskNotificationPillProps = {
    data: TaskNotificationData;
};

type TaskNotificationStatusAppearance =
    | { type: 'spinner'; color: string }
    | { type: 'icon'; name: string; color: string };

export function getTaskNotificationStatusAppearance(status: string): TaskNotificationStatusAppearance {
    switch (status.trim().toLowerCase()) {
        case 'completed':
            return { type: 'icon', name: 'checkmark-circle', color: '#34C759' };
        case 'failed':
            return { type: 'icon', name: 'close-circle', color: '#FF3B30' };
        case 'killed':
            return { type: 'icon', name: 'stop-circle', color: '#8E8E93' };
        case 'running':
            return { type: 'spinner', color: '#007AFF' };
        case 'pending':
            return { type: 'icon', name: 'hourglass-outline', color: '#8E8E93' };
        default:
            return { type: 'icon', name: 'hourglass-outline', color: '#8E8E93' };
    }
}

export function TaskNotificationPill({ data }: TaskNotificationPillProps) {
    const statusAppearance = getTaskNotificationStatusAppearance(data.status);

    const handlePress = () => {
        Modal.show({
            component: TaskNotificationDetailModal,
            props: { data },
        });
    };

    return (
        <Pressable style={({ pressed }) => [styles.container, pressed && styles.containerPressed]} onPress={handlePress}>
            <View style={styles.statusContainer}>
                {statusAppearance.type === 'spinner' ? (
                    <ActivityIndicator
                        testID="task-notification-status-spinner"
                        size={Platform.OS === 'ios' ? 'small' : 14 as any}
                        color={statusAppearance.color}
                    />
                ) : (
                    <Ionicons
                        testID="task-notification-status-icon"
                        name={statusAppearance.name as any}
                        size={16}
                        color={statusAppearance.color}
                    />
                )}
            </View>
            <Text style={styles.summary} numberOfLines={2}>
                {data.summary}
            </Text>
        </Pressable>
    );
}

export default React.memo(TaskNotificationPill);

const styles = StyleSheet.create((theme) => ({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginVertical: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: theme.colors.surfaceHighest,
    },
    containerPressed: {
        backgroundColor: theme.colors.surfacePressed,
    },
    statusContainer: {
        width: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    summary: {
        ...Typography.default(),
        flex: 1,
        fontSize: 14,
        lineHeight: 20,
        color: theme.colors.textSecondary,
    },
}));
