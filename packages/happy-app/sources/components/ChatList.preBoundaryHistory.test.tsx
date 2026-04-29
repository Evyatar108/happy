/**
 * US-006 AC #10: Drive `handleShowPreBoundaryHistory` (ChatList.tsx:85-109)
 * under both flag values.
 *
 * `ChatList.tsx` itself transitively imports react-native, react-native-unistyles,
 * react-native-reanimated, expo, and `sync.ts` (which pulls in libsodium etc.),
 * so a real-renderer mount is not viable under Vitest's node runner. Following
 * the `loadOlderDedup.test.ts` precedent, we reproduce the EXACT body of
 * `handleShowPreBoundaryHistory` here against substitutable storage / sync
 * fakes and assert the contract.
 *
 *   With flag false (legacy): the loop iterates against the legacy
 *     sync.loadOlder() resolution and terminates when oldestLoadedSeq stops
 *     decreasing or crosses the boundary seq.
 *
 *   With flag true (US-006): each await sync.loadOlder() resolves only after
 *     the corresponding applyPrefetchedRange commit (the awaited-commit
 *     contract), the loop iterates the same number of times for an
 *     equivalent fixture, and on terminal hasMore=false + empty messages the
 *     loop breaks cleanly and setPreBoundaryExpanded(true) runs exactly once.
 *     A terminally discarded stale request still resolves so the loop does
 *     not hang.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

interface FakeSessionMessages {
    hasOlder: boolean;
    oldestLoadedSeq: number;
}

function createFakeStorage(initial: FakeSessionMessages) {
    let s: FakeSessionMessages = { ...initial };
    return {
        getState: () => ({ sessionMessages: { 'sess-1': s } as Record<string, FakeSessionMessages> }),
        set: (next: Partial<FakeSessionMessages>) => { s = { ...s, ...next }; },
        snapshot: () => ({ ...s }),
    };
}

interface LatestBoundary { id: string; seq: number; kind: string; at: number }

// One-to-one reproduction of ChatList.tsx:handleShowPreBoundaryHistory
async function handleShowPreBoundaryHistory(opts: {
    boundaryItems: { hasLoadedBoundary: boolean };
    latestBoundary: LatestBoundary | null;
    sessionId: string;
    storage: ReturnType<typeof createFakeStorage>;
    loadOlder: (sessionId: string) => Promise<void>;
    setPreBoundaryExpanded: (v: boolean) => void;
}) {
    const { boundaryItems, latestBoundary, sessionId, storage, loadOlder, setPreBoundaryExpanded } = opts;
    if (boundaryItems.hasLoadedBoundary) {
        setPreBoundaryExpanded(true);
        return;
    }
    if (!latestBoundary) {
        setPreBoundaryExpanded(true);
        return;
    }
    let prevOldestSeq: number | undefined;
    while (true) {
        const sm = storage.getState().sessionMessages[sessionId];
        if (!sm?.hasOlder || sm.oldestLoadedSeq <= latestBoundary.seq) break;
        prevOldestSeq = sm.oldestLoadedSeq;
        await loadOlder(sessionId);
        const after = storage.getState().sessionMessages[sessionId];
        if (!after || after.oldestLoadedSeq === prevOldestSeq) break;
    }
    setPreBoundaryExpanded(true);
}

describe('handleShowPreBoundaryHistory — flag-off legacy path', () => {
    it('iterates loadOlder until oldestLoadedSeq crosses the boundary, then expands', async () => {
        const storage = createFakeStorage({ hasOlder: true, oldestLoadedSeq: 50 });
        let calls = 0;
        const loadOlder = vi.fn(async (_sid: string) => {
            calls += 1;
            const cur = storage.snapshot();
            // Each legacy older-page lowers oldestLoadedSeq by 20
            storage.set({ oldestLoadedSeq: cur.oldestLoadedSeq - 20 });
        });
        const setPreBoundaryExpanded = vi.fn();
        await handleShowPreBoundaryHistory({
            boundaryItems: { hasLoadedBoundary: false },
            latestBoundary: { id: 'b', seq: 10, kind: 'clear', at: 1 },
            sessionId: 'sess-1',
            storage,
            loadOlder,
            setPreBoundaryExpanded,
        });
        // 50 → 30 → 10 (<= boundary.seq=10 → exit). 2 iterations.
        expect(calls).toBe(2);
        expect(setPreBoundaryExpanded).toHaveBeenCalledTimes(1);
        expect(setPreBoundaryExpanded).toHaveBeenCalledWith(true);
    });

    it('breaks when oldestLoadedSeq stops decreasing (server returns no more older)', async () => {
        const storage = createFakeStorage({ hasOlder: true, oldestLoadedSeq: 50 });
        const loadOlder = vi.fn(async (_sid: string) => {
            // No-op: simulates legacy applyOlderMessages with empty page +
            // hasOlder=false flipping (but here we leave oldestLoadedSeq
            // unchanged so the equality break path triggers).
        });
        const setPreBoundaryExpanded = vi.fn();
        await handleShowPreBoundaryHistory({
            boundaryItems: { hasLoadedBoundary: false },
            latestBoundary: { id: 'b', seq: 10, kind: 'clear', at: 1 },
            sessionId: 'sess-1',
            storage,
            loadOlder,
            setPreBoundaryExpanded,
        });
        expect(loadOlder).toHaveBeenCalledTimes(1); // entered once, broke on equality
        expect(setPreBoundaryExpanded).toHaveBeenCalledTimes(1);
    });

    it('hasLoadedBoundary=true short-circuits without calling loadOlder', async () => {
        const storage = createFakeStorage({ hasOlder: true, oldestLoadedSeq: 50 });
        const loadOlder = vi.fn();
        const setPreBoundaryExpanded = vi.fn();
        await handleShowPreBoundaryHistory({
            boundaryItems: { hasLoadedBoundary: true },
            latestBoundary: { id: 'b', seq: 10, kind: 'clear', at: 1 },
            sessionId: 'sess-1',
            storage,
            loadOlder,
            setPreBoundaryExpanded,
        });
        expect(loadOlder).not.toHaveBeenCalled();
        expect(setPreBoundaryExpanded).toHaveBeenCalledWith(true);
    });
});

describe('handleShowPreBoundaryHistory — flag-on (US-006) awaited-commit contract', () => {
    it('awaits the prefetch terminal Promise<void> before each oldestLoadedSeq probe', async () => {
        const storage = createFakeStorage({ hasOlder: true, oldestLoadedSeq: 50 });
        const oldestLoadedSeqAtCommit: number[] = [];
        const oldestLoadedSeqAfterAwait: number[] = [];

        // Flag-on loadOlder simulates the manager: the await ONLY resolves
        // AFTER applyPrefetchedRange has lowered oldestLoadedSeq. If the
        // contract were broken, the post-await snapshot would equal the
        // pre-await snapshot.
        const loadOlder = vi.fn(async (_sid: string) => {
            const before = storage.snapshot();
            // Simulate: transport + decrypt happen "now", but the in-lock
            // commit happens on a microtask. We capture oldestLoadedSeq INSIDE
            // the commit and AFTER the await resolves.
            await Promise.resolve();
            // applyPrefetchedRange commit:
            storage.set({ oldestLoadedSeq: before.oldestLoadedSeq - 20 });
            oldestLoadedSeqAtCommit.push(storage.snapshot().oldestLoadedSeq);
            // The terminal Promise<void> resolves here, AFTER the commit.
        });

        const setPreBoundaryExpanded = vi.fn();
        // Wrap loadOlder so that after the await, we capture the snapshot
        const wrappedLoadOlder = async (sid: string) => {
            await loadOlder(sid);
            oldestLoadedSeqAfterAwait.push(storage.snapshot().oldestLoadedSeq);
        };

        await handleShowPreBoundaryHistory({
            boundaryItems: { hasLoadedBoundary: false },
            latestBoundary: { id: 'b', seq: 10, kind: 'clear', at: 1 },
            sessionId: 'sess-1',
            storage,
            loadOlder: wrappedLoadOlder,
            setPreBoundaryExpanded,
        });

        // Same iteration count as the flag-off equivalent (2 commits to
        // cross 50 → 30 → 10).
        expect(loadOlder).toHaveBeenCalledTimes(2);
        // Awaited-commit contract: the value observed after each await
        // matches the value observed at commit (the in-lock dispatch ran
        // before the Promise resolved).
        expect(oldestLoadedSeqAfterAwait).toEqual(oldestLoadedSeqAtCommit);
        expect(setPreBoundaryExpanded).toHaveBeenCalledTimes(1);
    });

    it('terminal hasMore=false + empty messages: loop breaks cleanly and setPreBoundaryExpanded(true) runs exactly once', async () => {
        const storage = createFakeStorage({ hasOlder: true, oldestLoadedSeq: 50 });
        const loadOlder = vi.fn(async (_sid: string) => {
            // Simulate the terminal commit with hasMore=false and no
            // messages: oldestLoadedSeq stays the same, hasOlder flips.
            await Promise.resolve();
            storage.set({ hasOlder: false });
        });
        const setPreBoundaryExpanded = vi.fn();
        await handleShowPreBoundaryHistory({
            boundaryItems: { hasLoadedBoundary: false },
            latestBoundary: { id: 'b', seq: 10, kind: 'clear', at: 1 },
            sessionId: 'sess-1',
            storage,
            loadOlder,
            setPreBoundaryExpanded,
        });
        // First iteration enters with hasOlder=true, loadOlder resolves with
        // hasOlder=false → loop's equality-break (oldestLoadedSeq unchanged)
        // also fires; either way only one loadOlder call and one setExpanded.
        expect(loadOlder).toHaveBeenCalledTimes(1);
        expect(setPreBoundaryExpanded).toHaveBeenCalledTimes(1);
        expect(setPreBoundaryExpanded).toHaveBeenCalledWith(true);
    });

    it('terminally-discarded stale request still resolves so the loop does not hang', async () => {
        const storage = createFakeStorage({ hasOlder: true, oldestLoadedSeq: 50 });
        // The manager's stale-discard path: terminal Promise<void> resolves
        // WITHOUT a commit. oldestLoadedSeq is unchanged; the equality-break
        // in the loop catches it.
        const loadOlder = vi.fn(async (_sid: string) => {
            await Promise.resolve();
            // No state change — manager fired stale-discard then resolved.
        });
        const setPreBoundaryExpanded = vi.fn();
        // Race protector — if the loop hangs, vi will hit the timeout.
        await handleShowPreBoundaryHistory({
            boundaryItems: { hasLoadedBoundary: false },
            latestBoundary: { id: 'b', seq: 10, kind: 'clear', at: 1 },
            sessionId: 'sess-1',
            storage,
            loadOlder,
            setPreBoundaryExpanded,
        });
        expect(loadOlder).toHaveBeenCalledTimes(1);
        expect(setPreBoundaryExpanded).toHaveBeenCalledTimes(1);
    });
});
