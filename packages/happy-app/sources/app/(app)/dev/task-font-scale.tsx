import * as React from 'react';
import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { TaskView } from '@/components/tools/views/TaskView';
import { ChatFontScaleProvider, useChatFontScaleOverride } from '@/hooks/useChatFontScale';

const taskMessages = [
    {
        kind: 'tool-call',
        tool: {
            name: 'Read',
            state: 'completed',
            input: {},
        },
    },
    {
        kind: 'tool-call',
        tool: {
            name: 'Edit',
            state: 'running',
            input: {},
        },
    },
    {
        kind: 'tool-call',
        tool: {
            name: 'Write',
            state: 'error',
            input: {},
        },
    },
] as any;

const taskTool = {
    name: 'Task',
    state: 'completed',
    input: {},
} as any;

function ResolvedToolTitleFontSize() {
    const override = useChatFontScaleOverride(14);
    const resolvedFontSize = override?.fontSize ?? 14;

    return (
        <Text style={styles.debugText}>Resolved toolTitle fontSize: {resolvedFontSize.toFixed(2)}</Text>
    );
}

export default function TaskFontScaleDevScreen() {
    return (
        <>
            <Stack.Screen options={{ title: 'Task Font Scale' }} />
            <ScrollView contentContainerStyle={styles.container}>
                <Text style={styles.title}>TaskView font scale preview</Text>
                <Text style={styles.subtitle}>Both previews render the same TaskView data with different chatFontScale overrides.</Text>
                <ChatFontScaleProvider scale={1.0}>
                    <View style={styles.example}>
                        <Text style={styles.label}>chatFontScale override: 1.0</Text>
                        <ResolvedToolTitleFontSize />
                        <TaskView tool={taskTool} metadata={null} messages={taskMessages} />
                    </View>
                </ChatFontScaleProvider>
                <ChatFontScaleProvider scale={1.4}>
                    <View style={styles.example}>
                        <Text style={styles.label}>chatFontScale override: 1.4</Text>
                        <ResolvedToolTitleFontSize />
                        <TaskView tool={taskTool} metadata={null} messages={taskMessages} />
                    </View>
                </ChatFontScaleProvider>
            </ScrollView>
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 16,
        gap: 16,
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
    },
    subtitle: {
        fontSize: 14,
        color: '#666',
    },
    example: {
        gap: 8,
        padding: 12,
        borderRadius: 12,
        backgroundColor: '#f4f4f5',
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
    },
    debugText: {
        fontSize: 13,
        color: '#444',
    },
});
