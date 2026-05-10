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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasCanonicalTaskOutputField(value: Record<string, unknown>): boolean {
    if (['retrieval_status', 'output', 'error', 'status', 'truncated'].some((key) => hasOwn(value, key))) {
        return true;
    }
    return isRecord(value.task) && ['task_id', 'task_type', 'status', 'description', 'output', 'prompt', 'result'].some((key) => hasOwn(value.task as Record<string, unknown>, key));
}

function stringifyUnknownResult(result: unknown): string {
    const json = JSON.stringify(result, null, 2);
    return truncateOutput(json ?? String(result));
}

export const TaskOutputView = React.memo<ToolViewProps>(({ tool }) => {
    const parsedInput = knownTools.TaskOutput.input.safeParse(tool.input);
    if (!parsedInput.success) {
        const message = warnToolInputParseFailure('TaskOutput', parsedInput.error);
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
                    <Text style={styles.summaryText}>{t('tools.taskOutput.running')}</Text>
                    {taskId ? <Text style={styles.metaText}>{t('tools.taskOutput.taskId', { taskId })}</Text> : null}
                    {input.block === true ? <Text style={styles.metaText}>{t('tools.taskOutput.blocking')}</Text> : null}
                    {typeof input.timeout === 'number' ? <Text style={styles.metaText}>{t('tools.taskOutput.timeout', { timeout: input.timeout })}</Text> : null}
                </View>
            </ToolSectionView>
        );
    }

    const result = tool.result;

    if (typeof result === 'string') {
        return (
            <ToolSectionView title={t('toolView.output')}>
                <CodeView code={truncateOutput(result)} scaled />
            </ToolSectionView>
        );
    }

    if (result !== null && result !== undefined) {
        const parsedResult = knownTools.TaskOutput.result.safeParse(result);
        if (parsedResult.success && hasCanonicalTaskOutputField(parsedResult.data)) {
            const data = parsedResult.data;
            const task = isRecord(data.task) ? data.task : null;
            const output = typeof data.output === 'string'
                ? data.output
                : typeof task?.output === 'string'
                    ? task.output
                    : typeof task?.result === 'string'
                        ? task.result
                        : '';
            const status = typeof data.status === 'string'
                ? data.status
                : typeof task?.status === 'string'
                    ? task.status
                    : typeof data.retrieval_status === 'string'
                        ? data.retrieval_status
                        : null;
            const error = typeof data.error === 'string' ? data.error : null;
            const resultTaskId = typeof task?.task_id === 'string' && task.task_id.trim() ? task.task_id : taskId;

            return (
                <ToolSectionView title={t('toolView.output')}>
                    <View style={styles.summaryContainer}>
                        {resultTaskId ? <Text style={styles.metaText}>{t('tools.taskOutput.taskId', { taskId: resultTaskId })}</Text> : null}
                        {status ? <Text style={styles.metaText}>{status}</Text> : null}
                        {data.truncated === true ? <Text style={styles.metaText}>{t('tools.taskOutput.truncated')}</Text> : null}
                    </View>
                    {error ? <ToolError message={error} /> : null}
                    {output ? <CodeView code={truncateOutput(output)} scaled /> : null}
                </ToolSectionView>
            );
        }

        console.warn('TaskOutput unknown result shape', result);
        return (
            <ToolSectionView title={t('toolView.output')}>
                <CodeView code={stringifyUnknownResult(result)} scaled />
            </ToolSectionView>
        );
    }

    console.warn('TaskOutput missing result', result);
    return (
        <ToolSectionView>
            <ToolError message={t('tools.taskOutput.parseError')} />
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
