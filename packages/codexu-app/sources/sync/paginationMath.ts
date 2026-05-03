export type PaginationWindow = {
    afterSeq: number;
    /** Pre-fetch gate: should we issue a request? */
    hasOlder: boolean;
    /** Post-fetch state: will there still be older messages after this fetch lands? Undefined for `computeInitialAfterSeq`. */
    hasOlderAfterFetch?: boolean;
};

export function computeInitialAfterSeq(sessionSeq: number, windowSize: number): PaginationWindow {
    if (sessionSeq <= windowSize) {
        return { afterSeq: 0, hasOlder: false };
    }

    return {
        afterSeq: sessionSeq - windowSize,
        hasOlder: true,
    };
}

export function computeOlderPageAfterSeq(oldestLoadedSeq: number, pageSize: number): PaginationWindow {
    if (oldestLoadedSeq <= 1) {
        return { afterSeq: 0, hasOlder: false, hasOlderAfterFetch: false };
    }

    const afterSeq = Math.max(0, oldestLoadedSeq - pageSize - 1);
    return {
        afterSeq,
        hasOlder: true,
        hasOlderAfterFetch: afterSeq > 0,
    };
}
