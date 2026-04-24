export type PaginationWindow = {
    afterSeq: number;
    hasOlder: boolean;
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
    if (oldestLoadedSeq <= pageSize + 1) {
        return { afterSeq: 0, hasOlder: false };
    }

    return {
        afterSeq: Math.max(0, oldestLoadedSeq - pageSize - 1),
        hasOlder: true,
    };
}
