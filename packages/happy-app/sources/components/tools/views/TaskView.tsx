import * as React from 'react';
import { ToolViewProps } from './_all';
import { View, ActivityIndicator, Platform } from 'react-native';
import { knownTools } from '../../tools/knownTools';
import { Ionicons } from '@expo/vector-icons';
import { Message, ToolCall } from '@/sync/typesMessage';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';
import { AnimatedText } from '@/components/StyledText';
import { useChatScaleAnimatedTextStyle } from '@/hooks/useChatFontScale';

const styles = StyleSheet.create((theme) => ({
    container: {
        paddingVertical: 4,
        paddingBottom: 12,
    },
    toolItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
        paddingLeft: 4,
        paddingRight: 2,
    },
    toolTitle: {
        fontSize: 14,
        fontWeight: '500',
        color: theme.colors.textSecondary,
        fontFamily: 'monospace',
        flex: 1,
    },
    toolTitleContainer: {
        flex: 1,
        minWidth: 0,
    },
    toolSubtitle: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        opacity: 0.8,
        flex: 1,
    },
    statusContainer: {
        marginLeft: 'auto',
        paddingLeft: 8,
    },
}));

export const TaskView = React.memo<ToolViewProps>(({ tool, metadata, messages }) => {
    const { theme } = useUnistyles();
    const animatedToolTitleStyle = useChatScaleAnimatedTextStyle(styles.toolTitle.fontSize);
    const animatedToolSubtitleStyle = useChatScaleAnimatedTextStyle(styles.toolSubtitle.fontSize);
    const lastToolMessage = findLastToolMessage(messages);
    const subagentType = typeof tool.input?.subagent_type === 'string' ? tool.input.subagent_type : null;
    const agentLabel = subagentType ? `${t('tools.names.agent')} (${subagentType})` : t('tools.names.agent');
    const lastActionTitle = lastToolMessage ? getToolTitle(lastToolMessage.tool, metadata) : null;

    return (
        <View style={styles.container}>
            <View style={styles.toolItem}>
                <View style={styles.toolTitleContainer}>
                    <AnimatedText style={[styles.toolTitle, animatedToolTitleStyle]} numberOfLines={1}>{agentLabel}</AnimatedText>
                    {lastActionTitle !== null && (
                        <AnimatedText style={[styles.toolSubtitle, animatedToolSubtitleStyle]} numberOfLines={1}>{lastActionTitle}</AnimatedText>
                    )}
                </View>
                <View style={styles.statusContainer}>
                    {tool.state === 'running' && (
                        <ActivityIndicator size={Platform.OS === 'ios' ? "small" : 14 as any} color={theme.colors.warning} />
                    )}
                    {tool.state === 'completed' && (
                        <Ionicons name="checkmark-circle" size={16} color={theme.colors.success} />
                    )}
                    {tool.state === 'error' && (
                        <Ionicons name="close-circle" size={16} color={theme.colors.textDestructive} />
                    )}
                </View>
            </View>
        </View>
    );
});

function findLastToolMessage(messages: Message[]): Extract<Message, { kind: 'tool-call' }> | null {
    for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];

        if (message.kind === 'tool-call') {
            return message;
        }
    }

    return null;
}

function getToolTitle(tool: ToolCall, metadata: ToolViewProps['metadata']): string {
    const knownTool = knownTools[tool.name as keyof typeof knownTools] as any;

    if (knownTool?.extractDescription && typeof knownTool.extractDescription === 'function') {
        return knownTool.extractDescription({ tool, metadata });
    }

    if (knownTool?.title) {
        return typeof knownTool.title === 'function'
            ? knownTool.title({ tool, metadata })
            : knownTool.title;
    }

    return tool.name;
}
