import { DEFAULT_UNSEQUENCED_MESSAGE_SEQ } from './typesRaw';

// Effective trigger: prefetch fires when `minVisibleSeq <= oldestLoadedSeq + (overscan + gap)`.
// With page size 80, 60+40 keeps the next older page loading eagerly so a steady
// upward scroll lands on already-decrypted rows instead of stalling at the boundary.
// Diagnosed 2026-04-30 — old 30/15 only triggered at ~44% buffer remaining, perceived as `onEndReached`.
export const RENDER_WINDOW_OVERSCAN_SEQS = 60;
export const PREFETCH_TRIGGER_GAP_SEQS = 40;

export type RenderWindow = {
    firstSeq: number;
    lastSeq: number;
};

export type PrefetchOlderRange = {
    fromSeq: number;
    toSeq: number;
    limit: number;
};

/**
 * RN does not expose FlatList's true overscan range, so this applies a JS-side
 * sequence approximation. Pending messages are excluded before deriving the
 * range, matching ChatList.boundaryItems.ts:59's isConfirmed precedent.
 */
export function computeRenderWindow({ visibleSeqs }: { visibleSeqs: number[] }): RenderWindow | null {
    const confirmedSeqs = visibleSeqs.filter(seq => seq !== DEFAULT_UNSEQUENCED_MESSAGE_SEQ);

    if (confirmedSeqs.length === 0) {
        return null;
    }

    const minSeq = Math.min(...confirmedSeqs);
    const maxSeq = Math.max(...confirmedSeqs);

    return {
        firstSeq: minSeq - RENDER_WINDOW_OVERSCAN_SEQS,
        lastSeq: maxSeq + RENDER_WINDOW_OVERSCAN_SEQS,
    };
}

export function shouldPrefetchOlder({
    renderWindow,
    oldestLoadedSeq,
    activePrefetch,
    hasOlder,
}: {
    renderWindow: RenderWindow | null;
    oldestLoadedSeq: number;
    activePrefetch: unknown | undefined;
    hasOlder: boolean;
}): boolean {
    return renderWindow !== null
        && hasOlder === true
        && renderWindow.firstSeq - oldestLoadedSeq <= PREFETCH_TRIGGER_GAP_SEQS
        && activePrefetch === undefined;
}

export function computePrefetchOlderRange({
    oldestLoadedSeq,
    pageSize,
}: {
    oldestLoadedSeq: number;
    pageSize: number;
}): PrefetchOlderRange | null {
    if (oldestLoadedSeq <= 1) {
        return null;
    }

    return {
        fromSeq: Math.max(0, oldestLoadedSeq - pageSize),
        toSeq: oldestLoadedSeq - 1,
        limit: pageSize,
    };
}
