import React from 'react';

import { calculateUnifiedDiff, DiffHunk } from '@/components/diff/calculateDiff';

export function useDiffHunks(
    oldText: string,
    newText: string,
    contextLines: number = 3
): { hunks: DiffHunk[]; totalVisibleLines: number } {
    return React.useMemo(() => {
        const { hunks } = calculateUnifiedDiff(oldText, newText, contextLines);
        const totalVisibleLines = hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0);

        return { hunks, totalVisibleLines };
    }, [oldText, newText, contextLines]);
}
