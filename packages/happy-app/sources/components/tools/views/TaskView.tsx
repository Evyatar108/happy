import * as React from 'react';
import { ToolViewProps } from './_all';
import { View, ActivityIndicator, Platform } from 'react-native';
import { knownTools } from '../../tools/knownTools';
import { Ionicons } from '@expo/vector-icons';
import { ToolCall } from '@/sync/typesMessage';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';
import { AnimatedText } from '@/components/StyledText';
import { useChatScaleAnimatedTextStyle } from '@/hooks/useChatFontScale';

interface FilteredTool {
    tool: ToolCall;
    title: string;
    state: 'running' | 'completed' | 'error';
}

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
    statusContainer: {
        marginLeft: 'auto',
        paddingLeft: 8,
    },
    moreToolsItem: {
        paddingVertical: 4,
        paddingHorizontal: 4,
    },
    moreToolsText: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        fontStyle: 'italic',
        opacity: 0.7,
    },
}));

export const TaskView = React.memo<ToolViewProps>(({ tool, metadata, messages }) => {
    const { theme } = useUnistyles();
    const animatedMoreToolsTextStyle = useChatScaleAnimatedTextStyle(styles.moreToolsText.fontSize);
    const animatedToolTitleStyle = useChatScaleAnimatedTextStyle(styles.toolTitle.fontSize);
    const filtered: FilteredTool[] = [];

    for (let m of messages) {
        if (m.kind === 'tool-call') {
            const knownTool = knownTools[m.tool.name as keyof typeof knownTools] as any;
            
            // Extract title using extractDescription if available, otherwise use title
            let title = m.tool.name;
            if (knownTool) {
                if ('extractDescription' in knownTool && typeof knownTool.extractDescription === 'function') {
                    title = knownTool.extractDescription({ tool: m.tool, metadata });
                } else if (knownTool.title) {
                    // Handle optional title and function type
                    if (typeof knownTool.title === 'function') {
                        title = knownTool.title({ tool: m.tool, metadata });
                    } else {
                        title = knownTool.title;
                    }
                }
            }

            if (m.tool.state === 'running' || m.tool.state === 'completed' || m.tool.state === 'error') {
                filtered.push({
                    tool: m.tool,
                    title,
                    state: m.tool.state
                });
            }
        }
    }

    if (filtered.length === 0) {
        return null;
    }

    const visibleTools = filtered.slice(filtered.length - 3);
    const remainingCount = filtered.length - 3;

    return (
        <View style={styles.container}>
            {visibleTools.map((item, index) => (
                <View key={`${item.tool.name}-${index}`} style={styles.toolItem}>
                    <AnimatedText style={[styles.toolTitle, animatedToolTitleStyle]}>{item.title}</AnimatedText>
                    <View style={styles.statusContainer}>
                        {item.state === 'running' && (
                            <ActivityIndicator size={Platform.OS === 'ios' ? "small" : 14 as any} color={theme.colors.warning} />
                        )}
                        {item.state === 'completed' && (
                            <Ionicons name="checkmark-circle" size={16} color={theme.colors.success} />
                        )}
                        {item.state === 'error' && (
                            <Ionicons name="close-circle" size={16} color={theme.colors.textDestructive} />
                        )}
                    </View>
                </View>
            ))}
            {remainingCount > 0 && (
                <View style={styles.moreToolsItem}>
                    <AnimatedText style={[styles.moreToolsText, animatedMoreToolsTextStyle]}>
                        {t('tools.taskView.moreTools', { count: remainingCount })}
                    </AnimatedText>
                </View>
            )}
        </View>
    );
});
