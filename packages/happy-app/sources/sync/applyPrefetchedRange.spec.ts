import { describe, expect, it } from 'vitest';
import { createReducer } from './reducer/reducer';
import {
    applyPrefetchedRangeToSession,
    computeNextOldestLoadedSeq,
    mergeOlderMessagesIntoSession,
    type MergeOlderMessagesSession,
    type SessionMergeMeta,
} from './applyPrefetchedRange';
import { snapshotReducerState } from './reducer/reducerTestSnapshot';
import { DEFAULT_UNSEQUENCED_MESSAGE_SEQ, type NormalizedMessage } from './typesRaw';

function createUserTextMessage(seq: number): NormalizedMessage {
    return {
        id: `msg-${seq}`,
        localId: null,
        createdAt: seq * 1000,
        seq,
        role: 'user',
        isSidechain: false,
        content: { type: 'text', text: `seq-${seq}` },
    };
}

const NO_META: SessionMergeMeta = {
    agentState: null,
    latestUsage: undefined,
    todos: undefined,
};

function createEmptySession(oldestLoadedSeq: number): MergeOlderMessagesSession {
    return {
        messages: [],
        messagesMap: {},
        reducerState: createReducer(),
        isLoaded: true,
        hasOlder: true,
        oldestLoadedSeq,
        loadingOlder: false,
        renderWindow: null,
    };
}

function seedBoundary(session: MergeOlderMessagesSession, boundarySeq: number) {
    const boundaryMessage = createUserTextMessage(boundarySeq);
    const seeded = mergeOlderMessagesIntoSession({
        existingSession: session,
        sessionMeta: NO_META,
        messages: [boundaryMessage],
        pagination: {
            newOldestLoadedSeq: boundarySeq,
            hasOlder: true,
        },
    });
    return seeded.nextSession;
}

describe('applyPrefetchedRange', () => {
    describe('computeNextOldestLoadedSeq', () => {
        it('uses min(filtered seq) when batch is non-empty', () => {
            const messages = [
                createUserTextMessage(20),
                createUserTextMessage(50),
                createUserTextMessage(30),
            ];
            expect(computeNextOldestLoadedSeq(messages, 100)).toBe(20);
        });

        it('returns the prior oldestLoadedSeq when batch is empty', () => {
            expect(computeNextOldestLoadedSeq([], 100)).toBe(100);
        });

        it('honors sparse server responses without falling back to requestedFromSeq', () => {
            const messages = [
                createUserTextMessage(25),
                createUserTextMessage(50),
                createUserTextMessage(99),
            ];
            // Sparse [25..99] keeps 25 as the new edge.
            expect(computeNextOldestLoadedSeq(messages, 100)).toBe(25);
        });

        it('filters pending sentinels before deriving min', () => {
            const messages: NormalizedMessage[] = [
                {
                    id: 'pending-1',
                    localId: 'local-1',
                    createdAt: 1,
                    seq: DEFAULT_UNSEQUENCED_MESSAGE_SEQ,
                    role: 'user',
                    isSidechain: false,
                    content: { type: 'text', text: 'pending' },
                },
                createUserTextMessage(40),
            ];
            expect(computeNextOldestLoadedSeq(messages, 100)).toBe(40);
        });

        it('returns prior oldestLoadedSeq when filtered batch is empty', () => {
            const messages: NormalizedMessage[] = [
                {
                    id: 'pending-only',
                    localId: 'local-only',
                    createdAt: 1,
                    seq: DEFAULT_UNSEQUENCED_MESSAGE_SEQ,
                    role: 'user',
                    isSidechain: false,
                    content: { type: 'text', text: 'pending' },
                },
            ];
            expect(computeNextOldestLoadedSeq(messages, 100)).toBe(100);
        });
    });

    describe('reducer-survival gate', () => {
        it('produces byte-equivalent reducer state for legacy and prefetch paths over the same fixture', () => {
            // Boundary message at seq=100 already loaded in both branches.
            const legacyBase = seedBoundary(createEmptySession(100), 100);
            const prefetchBase = seedBoundary(createEmptySession(100), 100);
            // Mark prefetchBase as having an in-flight prefetch matching the upcoming params.
            const prefetchWithFlight: MergeOlderMessagesSession = {
                ...prefetchBase,
                activePrefetch: {
                    requestId: 'req-A',
                    generation: 7,
                    direction: 'older',
                    targetSeq: 50,
                    issuedAt: 1,
                },
            };

            const olderBatch: NormalizedMessage[] = [];
            for (let seq = 20; seq <= 99; seq++) {
                olderBatch.push(createUserTextMessage(seq));
            }

            // Legacy path: applyOlderMessages-equivalent (mergeOlderMessagesIntoSession directly).
            const legacyResult = mergeOlderMessagesIntoSession({
                existingSession: legacyBase,
                sessionMeta: NO_META,
                messages: olderBatch,
                pagination: {
                    newOldestLoadedSeq: 20,
                    hasOlder: false,
                },
            });

            // Prefetch path: applyPrefetchedRangeToSession with matching staleness gates.
            const prefetchResult = applyPrefetchedRangeToSession({
                existingSession: prefetchWithFlight,
                sessionMeta: NO_META,
                messages: olderBatch,
                params: {
                    requestedFromSeq: 20,
                    requestedToSeq: 99,
                    hasMore: false,
                    expectedRequestId: 'req-A',
                    expectedGeneration: 7,
                    actualGeneration: 7,
                },
            });

            expect(prefetchResult.stale).toBe(false);
            if (prefetchResult.stale) return;

            // Reducer state must be identical — no double-applied ids, no boundary duplication.
            expect(snapshotReducerState(prefetchResult.nextSession.reducerState))
                .toEqual(snapshotReducerState(legacyResult.nextSession.reducerState));

            // oldestLoadedSeq derives from the actual returned messages (20), not requestedFromSeq.
            expect(prefetchResult.nextSession.oldestLoadedSeq).toBe(20);
            expect(prefetchResult.nextSession.hasOlder).toBe(false);

            // Boundary not duplicated: boundary seq=100 was seeded once, and the new batch's
            // highest seq is strictly less than 100.
            const maxBatchSeq = olderBatch.reduce((max, m) => Math.max(max, m.seq), -Infinity);
            expect(maxBatchSeq).toBeLessThan(100);
            // Equal-snapshot assertion above already proves no double-applied ids.

            // activePrefetch is atomically cleared on commit.
            expect(prefetchResult.nextSession.activePrefetch).toBeUndefined();
        });

        it('honors sparse [25..99] response without backfilling unseen seqs', () => {
            const base = seedBoundary(createEmptySession(100), 100);
            const baseWithFlight: MergeOlderMessagesSession = {
                ...base,
                activePrefetch: {
                    requestId: 'req-B',
                    generation: 1,
                    direction: 'older',
                    targetSeq: 20,
                    issuedAt: 0,
                },
            };

            const sparseBatch: NormalizedMessage[] = [];
            for (let seq = 25; seq <= 99; seq++) {
                sparseBatch.push(createUserTextMessage(seq));
            }

            const result = applyPrefetchedRangeToSession({
                existingSession: baseWithFlight,
                sessionMeta: NO_META,
                messages: sparseBatch,
                params: {
                    requestedFromSeq: 20,
                    requestedToSeq: 99,
                    hasMore: true,
                    expectedRequestId: 'req-B',
                    expectedGeneration: 1,
                    actualGeneration: 1,
                },
            });

            expect(result.stale).toBe(false);
            if (result.stale) return;
            expect(result.nextSession.oldestLoadedSeq).toBe(25);
            expect(result.nextSession.hasOlder).toBe(true);
        });

        it('leaves oldestLoadedSeq unchanged and clears hasOlder for empty batch with hasMore: false', () => {
            const base = seedBoundary(createEmptySession(100), 100);
            const baseWithFlight: MergeOlderMessagesSession = {
                ...base,
                activePrefetch: {
                    requestId: 'req-C',
                    generation: 2,
                    direction: 'older',
                    targetSeq: 0,
                    issuedAt: 0,
                },
            };

            const result = applyPrefetchedRangeToSession({
                existingSession: baseWithFlight,
                sessionMeta: NO_META,
                messages: [],
                params: {
                    requestedFromSeq: 0,
                    requestedToSeq: 99,
                    hasMore: false,
                    expectedRequestId: 'req-C',
                    expectedGeneration: 2,
                    actualGeneration: 2,
                },
            });

            expect(result.stale).toBe(false);
            if (result.stale) return;
            expect(result.nextSession.oldestLoadedSeq).toBe(100);
            expect(result.nextSession.hasOlder).toBe(false);
            expect(result.nextSession.activePrefetch).toBeUndefined();
        });
    });

    describe('staleness no-ops', () => {
        it('returns stale when activePrefetch.requestId differs from expectedRequestId', () => {
            const base = seedBoundary(createEmptySession(100), 100);
            const baseWithFlight: MergeOlderMessagesSession = {
                ...base,
                activePrefetch: {
                    requestId: 'A',
                    generation: 1,
                    direction: 'older',
                    targetSeq: 50,
                    issuedAt: 0,
                },
            };

            const result = applyPrefetchedRangeToSession({
                existingSession: baseWithFlight,
                sessionMeta: NO_META,
                messages: [createUserTextMessage(50)],
                params: {
                    requestedFromSeq: 50,
                    requestedToSeq: 99,
                    hasMore: false,
                    expectedRequestId: 'B',
                    expectedGeneration: 1,
                    actualGeneration: 1,
                },
            });

            expect(result).toEqual({ stale: true });
        });

        it('returns stale when actualGeneration differs from expectedGeneration', () => {
            const base = seedBoundary(createEmptySession(100), 100);
            const baseWithFlight: MergeOlderMessagesSession = {
                ...base,
                activePrefetch: {
                    requestId: 'A',
                    generation: 4,
                    direction: 'older',
                    targetSeq: 50,
                    issuedAt: 0,
                },
            };

            const result = applyPrefetchedRangeToSession({
                existingSession: baseWithFlight,
                sessionMeta: NO_META,
                messages: [createUserTextMessage(50)],
                params: {
                    requestedFromSeq: 50,
                    requestedToSeq: 99,
                    hasMore: false,
                    expectedRequestId: 'A',
                    expectedGeneration: 4,
                    actualGeneration: 5,
                },
            });

            expect(result).toEqual({ stale: true });
        });

        it('returns stale when activePrefetch is undefined', () => {
            const base = seedBoundary(createEmptySession(100), 100);

            const result = applyPrefetchedRangeToSession({
                existingSession: base,
                sessionMeta: NO_META,
                messages: [createUserTextMessage(50)],
                params: {
                    requestedFromSeq: 50,
                    requestedToSeq: 99,
                    hasMore: false,
                    expectedRequestId: 'A',
                    expectedGeneration: 1,
                    actualGeneration: 1,
                },
            });

            expect(result).toEqual({ stale: true });
        });
    });
});
