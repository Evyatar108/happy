import * as React from 'react';
import { ScrollView, View } from 'react-native';
import type { DiffHunk } from '@/components/diff/calculateDiff';
import { DiffView } from '@/components/diff/DiffView';
import { PierreDiffView } from '@/components/diff/PierreDiffView';
import { useSetting } from '@/sync/storage';

interface ToolDiffViewProps {
    /** Pre-built unified-diff patch string. Preferred when available (upstream PierreDiff path). */
    patch?: string;
    /** Pair used to derive a patch if `patch` isn't supplied. */
    oldText?: string;
    newText?: string;
    /** File name — used for language detection in syntax highlighting (PierreDiff path). */
    fileName?: string;
    /** Pre-computed hunks (legacy DiffView path — used by collapse-diff fork feature). */
    hunks?: DiffHunk[];
    /** When supplied alongside `hunks`, routes to legacy DiffView with collapse support. */
    maxVisibleLines?: number;
    style?: any;
    /** No-op in the new renderer (pierre/diffs always draws line numbers via gutter). Kept for source compat. */
    showLineNumbers?: boolean;
    /** No-op in the new renderer; pierre/diffs uses classic indicators. */
    showPlusMinusSymbols?: boolean;
}

export const ToolDiffView = React.memo<ToolDiffViewProps>(({
    patch,
    oldText,
    newText,
    fileName,
    hunks,
    maxVisibleLines,
    style,
    showLineNumbers,
    showPlusMinusSymbols = false,
}) => {
    const wrapLines = useSetting('wrapLinesInDiffs');
    const showLineNumbersInToolViews = useSetting('showLineNumbersInToolViews');

    // Legacy DiffView path — fork's collapse-diff feature uses pre-computed hunks
    // with maxVisibleLines truncation. PierreDiffView doesn't support this yet,
    // so we keep DiffView for hunks-driven callers (EditView, MultiEditView,
    // GeminiEditView) and use PierreDiffView for the new patch/oldText path
    // (CodexDiffView, CodexPatchView).
    if (hunks !== undefined || maxVisibleLines !== undefined) {
        const effectiveShowLineNumbers = showLineNumbers ?? showLineNumbersInToolViews;
        const diffView = (
            <DiffView
                oldText={oldText ?? ''}
                newText={newText ?? ''}
                hunks={hunks}
                maxVisibleLines={maxVisibleLines}
                wrapLines={wrapLines}
                showLineNumbers={effectiveShowLineNumbers}
                showPlusMinusSymbols={showPlusMinusSymbols}
                style={{ flex: 1, ...style }}
            />
        );
        if (wrapLines) {
            return <View style={{ flex: 1 }}>{diffView}</View>;
        }
        return (
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ flex: 1 }}
                contentContainerStyle={{ flexGrow: 1 }}
            >
                {diffView}
            </ScrollView>
        );
    }

    const effectiveFileName = fileName ?? 'file.txt';

    // Chat tool diffs are always inline unified — the split view lives on the
    // dedicated InlineFileDiff pane (controlled via the diffStyle setting).
    const common = {
        overflow: wrapLines ? ('wrap' as const) : ('scroll' as const),
        disableLineNumbers: !(showLineNumbers ?? showLineNumbersInToolViews),
        disableFileHeader: true,
        diffStyle: 'unified' as const,
    };

    if (patch) {
        return (
            <View style={[{ flex: 1 }, style]}>
                <PierreDiffView patch={patch} {...common} />
            </View>
        );
    }

    return (
        <View style={[{ flex: 1 }, style]}>
            <PierreDiffView
                oldFile={{ name: effectiveFileName, contents: oldText ?? '' }}
                newFile={{ name: effectiveFileName, contents: newText ?? '' }}
                {...common}
            />
        </View>
    );
});
