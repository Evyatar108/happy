import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { DiffHunk } from '@/components/diff/calculateDiff';
import { useDiffHunks } from '@/components/diff/useDiffHunks';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';

export interface CollapsibleDiffPreviewProps {
    oldText: string;
    newText: string;
    contextLines?: number;
    collapsedLines: number;
    renderDiff: (args: { hunks: DiffHunk[]; maxVisibleLines: number | undefined }) => React.ReactNode;
}

export const CollapsibleDiffPreview = React.memo<CollapsibleDiffPreviewProps>(({
    oldText,
    newText,
    contextLines,
    collapsedLines,
    renderDiff,
}) => {
    const [isExpanded, setIsExpanded] = React.useState<boolean>(false);
    const { hunks, totalVisibleLines } = useDiffHunks(oldText, newText, contextLines ?? 3);
    const showToggle = totalVisibleLines > collapsedLines;
    const hiddenLineCount = Math.max(totalVisibleLines - collapsedLines, 0);

    return (
        <View>
            {renderDiff({
                hunks,
                maxVisibleLines: isExpanded ? undefined : collapsedLines,
            })}
            {showToggle && (
                <ExpandToggleButton
                    isExpanded={isExpanded}
                    hiddenLineCount={hiddenLineCount}
                    onPress={(event) => {
                        event.stopPropagation?.();
                        setIsExpanded((current) => !current);
                    }}
                />
            )}
        </View>
    );
});

function ExpandToggleButton(props: {
    isExpanded: boolean;
    hiddenLineCount: number;
    onPress: React.ComponentProps<typeof Pressable>['onPress'];
}) {
    const label = props.isExpanded
        ? t('tools.diff.collapse')
        : t('tools.diff.showMore', { count: props.hiddenLineCount });

    return (
        <Pressable style={styles.toggleButton} onPress={props.onPress}>
            <View style={styles.toggleAccent} />
            <Text style={styles.toggleLabel}>{label}</Text>
        </Pressable>
    );
}

const styles = StyleSheet.create((theme, runtime) => ({
    toggleButton: {
        position: 'relative',
        overflow: 'hidden',
        minHeight: 44,
        justifyContent: 'center',
        backgroundColor: theme.colors.userMessageBackground,
        borderColor: theme.colors.textSecondary,
        borderWidth: 2,
        borderRadius: 8,
        paddingVertical: 10,
        paddingHorizontal: 16,
    },
    toggleAccent: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 4,
        backgroundColor: theme.colors.text,
    },
    toggleLabel: {
        ...Typography.default(),
        color: theme.colors.text,
        fontSize: 14,
    },
}));
