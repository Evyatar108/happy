import * as React from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { CodeView } from '@/components/CodeView';
import { Text } from '@/components/StyledText';
import { ToolError } from '@/components/tools/ToolError';
import { ToolSectionView } from '@/components/tools/ToolSectionView';
import { knownTools } from '@/components/tools/knownTools';
import { t } from '@/text';
import { ToolViewProps } from './_all';
import { warnToolInputParseFailure } from './parseFailure';

const MAX_OUTPUT_CHARS = 2048;

function truncateOutput(value: string): string {
    if (value.length <= MAX_OUTPUT_CHARS) {
        return value;
    }
    return `${value.slice(0, MAX_OUTPUT_CHARS)}...`;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, key);
}

function hasCanonicalTaskStopField(value: Record<string, unknown>): boolean {
    return ['stopped', 'error', 'status'].some((key) => hasOwn(value, key));
}

function stringifyUnknownResult(result: unknown): string {
    const json = JSON.stringify(result, null, 2);
    return truncateOutput(json ?? String(result));
}

function getTaskStopOutcome(data: { stopped?: boolean; error?: string; status?: string }): string {
    if (typeof data.error === 'string' && data.error.trim()) {
        return data.error;
    }
    if (data.stopped === true) {
        return t('tools.taskStop.stopped');
    }
    if (data.status === 'not_found') {
        return t('tools.taskStop.notFound');
    }
    if (data.status === 'already_stopped') {
        return t('tools.taskStop.alreadyStopped');
    }
    if (data.status === 'completed' || data.status === 'success') {
        return t('tools.taskStop.stopped');
    }
    if (typeof data.status === 'string' && data.status.trim()) {
        return data.status;
    }
    if (data.stopped === false) {
        return t('tools.taskStop.notFound');
    }
    return t('tools.taskStop.stopped');
}

export const TaskStopView = React.memo<ToolViewProps>(({ tool }) => {
    const parsedInput = knownTools.TaskStop.input.safeParse(tool.input);
    if (!parsedInput.success) {
        const message = warnToolInputParseFailure('TaskStop', parsedInput.error, t('tools.taskStop.parseError'));
        return (
            <ToolSectionView>
                <ToolError message={message} />
            </ToolSectionView>
        );
    }

    const input = parsedInput.data;
    const taskId = typeof input.task_id === 'string' && input.task_id.trim() ? input.task_id : null;

    if (tool.state === 'running') {
        return (
            <ToolSectionView title={t('toolView.output')}>
                <View style={styles.summaryContainer}>
                    <Text style={styles.summaryText}>{t('tools.taskStop.running')}</Text>
                    {taskId ? <Text style={styles.metaText}>{t('tools.taskStop.taskId', { taskId })}</Text> : null}
                </View>
            </ToolSectionView>
        );
    }

    const result = tool.result;

    if (typeof result === 'string') {
        return (
            <ToolSectionView title={t('toolView.output')}>
                <Text style={styles.summaryText}>{truncateOutput(result)}</Text>
            </ToolSectionView>
        );
    }

    if (result !== null && result !== undefined) {
        const parsedResult = knownTools.TaskStop.result.safeParse(result);
        if (parsedResult.success && hasCanonicalTaskStopField(parsedResult.data)) {
            const data = parsedResult.data;
            return (
                <ToolSectionView title={t('toolView.output')}>
                    <View style={styles.summaryContainer}>
                        {taskId ? <Text style={styles.metaText}>{t('tools.taskStop.taskId', { taskId })}</Text> : null}
                        <Text style={styles.summaryText}>{getTaskStopOutcome(data)}</Text>
                    </View>
                </ToolSectionView>
            );
        }

        console.warn('TaskStop unknown result shape', result);
        return (
            <ToolSectionView title={t('toolView.output')}>
                <CodeView code={stringifyUnknownResult(result)} scaled />
            </ToolSectionView>
        );
    }

    console.warn('TaskStop missing result', result);
    return (
        <ToolSectionView>
            <ToolError message={t('tools.taskStop.parseError')} />
        </ToolSectionView>
    );
});

const styles = StyleSheet.create((theme) => ({
    summaryContainer: {
        gap: 4,
        marginBottom: 8,
    },
    summaryText: {
        fontSize: 14,
        color: theme.colors.text,
        fontWeight: '500',
        marginHorizontal: 12,
    },
    metaText: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginHorizontal: 12,
    },
}));
