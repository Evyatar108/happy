/**
 * Unit tests for the page-turn lazy-load threshold in pageToOlderMessages.
 *
 * The trigger condition must match the plan spec:
 *   nextOffset >= maxOffset - viewportHeight * 0.1
 *
 * i.e. fire loadOlder only when the user is within 10% of a viewport from
 * the oldest-content end. This is stricter (fires later) than the previous
 * `nextOffset >= maxOffset * 0.9` formula when contentHeight >> viewportHeight.
 */
import { describe, it, expect, vi } from 'vitest';
import type {
    SessionMessageRangeRequest,
    SessionMessageRangeResponse,
} from 'codexu-wire';
import { buildChatListBoundaryItems } from './ChatList.boundaryItems';
import type { LatestBoundary } from '@/sync/reducer/reducer';
import type { Message } from '@/sync/typesMessage';
import { computeRenderWindow, computePrefetchOlderRange, shouldPrefetchOlder } from '@/sync/messageWindow';
import { PrefetchManager } from '@/sync/prefetchManager';
import type {
    PrefetchManagerStorage,
    PrefetchManagerEncryptionAdapter,
    PrefetchManagerTransport,
    RunInSessionLock,
    PrefetchTerminalEvent,
} from '@/sync/prefetchManager';
import type { ActivePrefetch } from '@/sync/applyPrefetchedRange';
import { AsyncLock } from '@/utils/lock';

/**
 * Pure replica of the threshold guard from pageToOlderMessages.
 * Returns true when loadOlder should be triggered.
 */
function shouldLoadOlder(
    contentHeight: number,
    viewportHeight: number,
    nextOffset: number,
): boolean {
    const maxOffset = Math.max(0, contentHeight - viewportHeight);
    return maxOffset > 0 && nextOffset >= maxOffset - viewportHeight * 0.1;
}

describe('pageToOlderMessages lazy-load threshold', () => {
    // Scenario: contentHeight 10 000, viewportHeight 800
    //   maxOffset = 9 200
    //   trigger zone starts at: 9 200 - 80 = 9 120
    const contentHeight = 10_000;
    const viewportHeight = 800;
    const maxOffset = contentHeight - viewportHeight; // 9 200
    const triggerEdge = maxOffset - viewportHeight * 0.1; // 9 120

    it('does NOT fire when nextOffset is well below the trigger zone', () => {
        expect(shouldLoadOlder(contentHeight, viewportHeight, triggerEdge - 1)).toBe(false);
    });

    it('fires exactly at the trigger edge (nextOffset === maxOffset - viewportHeight * 0.1)', () => {
        expect(shouldLoadOlder(contentHeight, viewportHeight, triggerEdge)).toBe(true);
    });

    it('fires when nextOffset is between trigger edge and maxOffset', () => {
        expect(shouldLoadOlder(contentHeight, viewportHeight, triggerEdge + 40)).toBe(true);
    });

    it('fires at maxOffset (fully scrolled to oldest end)', () => {
        expect(shouldLoadOlder(contentHeight, viewportHeight, maxOffset)).toBe(true);
    });

    it('does NOT fire when content fits entirely in the viewport (maxOffset === 0)', () => {
        expect(shouldLoadOlder(viewportHeight, viewportHeight, 0)).toBe(false);
        expect(shouldLoadOlder(viewportHeight - 1, viewportHeight, 0)).toBe(false);
    });

    it('divergence from the old * 0.9 formula — the new formula fires later', () => {
        // With the OLD formula: nextOffset >= maxOffset * 0.9
        //   old trigger = 9 200 * 0.9 = 8 280
        // With the NEW formula: nextOffset >= maxOffset - viewportHeight * 0.1
        //   new trigger = 9 200 - 80 = 9 120
        //
        // A nextOffset of 8 300 would have fired under the old formula but
        // must NOT fire under the new formula.
        const oldFormulaWouldFire = 8_300;
        expect(oldFormulaWouldFire).toBeGreaterThanOrEqual(maxOffset * 0.9); // confirms old formula triggers
        expect(shouldLoadOlder(contentHeight, viewportHeight, oldFormulaWouldFire)).toBe(false); // new formula does NOT
    });
});

function userMessage(id: string, seq: number): Message {
    return {
        kind: 'user-text',
        id,
        localId: null,
        createdAt: seq,
        seq,
        text: id,
    };
}

function boundaryMessage(id: string, seq: number): Message {
    return {
        kind: 'agent-event',
        id,
        createdAt: seq,
        seq,
        event: {
            type: 'context-boundary',
            kind: 'clear',
            at: seq * 1000,
        },
    };
}

function latestBoundary(id: string, seq: number): LatestBoundary {
    return {
        id,
        seq,
        kind: 'clear',
        at: seq * 1000,
    };
}

function itemIds(messages: Message[], boundary: LatestBoundary, expanded: boolean): string[] {
    return buildChatListBoundaryItems(messages, boundary, expanded).items.map(item => item.id);
}

describe('ChatList context-boundary pagination rows', () => {
    it('collapses pre-boundary rows by default using latestBoundary.seq', () => {
        const messages = [
            userMessage('after-2', 12),
            userMessage('after-1', 11),
            boundaryMessage('boundary', 10),
            userMessage('before-1', 9),
            userMessage('before-2', 8),
        ];

        const result = buildChatListBoundaryItems(messages, latestBoundary('boundary', 10), false);

        expect(result.hasLoadedBoundary).toBe(true);
        expect(result.hiddenPreBoundaryCount).toBe(2);
        expect(result.items.map(item => item.kind)).toEqual([
            'message',
            'message',
            'message',
            'show-pre-boundary-history',
        ]);
        expect(result.items.map(item => item.id)).toEqual([
            'after-2',
            'after-1',
            'boundary',
            'boundary-show-history',
        ]);
    });

    it('keeps the divider position stable when older pre-boundary messages load', () => {
        const boundary = latestBoundary('boundary', 10);
        const initial = [
            userMessage('after-2', 12),
            userMessage('after-1', 11),
            boundaryMessage('boundary', 10),
        ];
        const withOlderPage = [
            ...initial,
            userMessage('before-1', 9),
            userMessage('before-2', 8),
        ];

        expect(itemIds(initial, boundary, false)).toEqual(['after-2', 'after-1', 'boundary']);
        expect(itemIds(withOlderPage, boundary, false)).toEqual([
            'after-2',
            'after-1',
            'boundary',
            'boundary-show-history',
        ]);
        expect(itemIds(withOlderPage, boundary, true)).toEqual([
            'after-2',
            'after-1',
            'boundary',
            'before-1',
            'before-2',
        ]);
    });

    it('renders a sticky divider while a metadata-seeded boundary row is outside the loaded window', () => {
        const boundary = latestBoundary('boundary', 10);
        const messages = [
            userMessage('after-3', 13),
            userMessage('after-2', 12),
            userMessage('after-1', 11),
        ];

        const result = buildChatListBoundaryItems(messages, boundary, false);

        expect(result.hasLoadedBoundary).toBe(false);
        expect(result.items.map(item => item.kind)).toEqual([
            'message',
            'message',
            'message',
            'sticky-boundary',
            'show-pre-boundary-history',
        ]);
        expect(result.items.map(item => item.id)).toEqual([
            'after-3',
            'after-2',
            'after-1',
            'boundary-sticky',
            'boundary-show-history',
        ]);
    });

    it('transitions from sticky metadata rendering to the loaded boundary row when the older page arrives', () => {
        const boundary = latestBoundary('boundary', 10);
        const initial = [
            userMessage('after-2', 12),
            userMessage('after-1', 11),
        ];
        const withBoundaryPage = [
            ...initial,
            boundaryMessage('boundary', 10),
            userMessage('before-1', 9),
        ];

        expect(buildChatListBoundaryItems(initial, boundary, false).items.map(item => item.kind)).toEqual([
            'message',
            'message',
            'sticky-boundary',
            'show-pre-boundary-history',
        ]);
        expect(buildChatListBoundaryItems(withBoundaryPage, boundary, false).items.map(item => item.kind)).toEqual([
            'message',
            'message',
            'message',
            'show-pre-boundary-history',
        ]);
    });

    it('shows a newly received boundary row on the next ChatList item build without a refresh', () => {
        const beforeSocketUpdate = [
            userMessage('after-1', 11),
            userMessage('before-1', 9),
        ];
        const afterSocketUpdate = [
            userMessage('after-2', 12),
            userMessage('after-1', 11),
            boundaryMessage('boundary', 10),
            userMessage('before-1', 9),
        ];

        expect(buildChatListBoundaryItems(beforeSocketUpdate, null, false).items.map(item => item.id)).toEqual([
            'after-1',
            'before-1',
        ]);
        expect(buildChatListBoundaryItems(afterSocketUpdate, latestBoundary('boundary', 10), false).items.map(item => item.id)).toEqual([
            'after-2',
            'after-1',
            'boundary',
            'boundary-show-history',
        ]);
    });

    it('optimistic local message (seq=MAX_SAFE_INTEGER) stays in the active region after a boundary lands', () => {
        const optimisticMsg: Message = {
            kind: 'user-text',
            id: 'optimistic-1',
            localId: 'optimistic-1',
            createdAt: Date.now(),
            seq: Number.MAX_SAFE_INTEGER,
            text: 'hello',
        };
        const messages = [
            optimisticMsg,
            boundaryMessage('boundary', 10),
            userMessage('before-1', 9),
        ];
        const boundary = latestBoundary('boundary', 10);

        const result = buildChatListBoundaryItems(messages, boundary, false);

        expect(result.hiddenPreBoundaryCount).toBe(1);
        const ids = result.items.map(item => item.id);
        expect(ids).toContain('optimistic-1');
        expect(ids).toContain('boundary');
        expect(ids).not.toContain('before-1');
    });

    it('optimistic local message is excluded from pre-boundary count and not hidden', () => {
        const optimisticMsg: Message = {
            kind: 'user-text',
            id: 'optimistic-2',
            localId: 'optimistic-2',
            createdAt: Date.now(),
            seq: Number.MAX_SAFE_INTEGER,
            text: 'optimistic',
        };
        const messages = [
            optimisticMsg,
            userMessage('confirmed-after', 15),
            userMessage('pre-boundary', 5),
        ];
        const boundary = latestBoundary('boundary', 10);

        const result = buildChatListBoundaryItems(messages, boundary, false);

        expect(result.hiddenPreBoundaryCount).toBe(1);
        const kinds = result.items.map(item => item.kind);
        expect(kinds).toContain('message');
        const messageIds = result.items.filter(i => i.kind === 'message').map(i => i.id);
        expect(messageIds).toContain('optimistic-2');
        expect(messageIds).toContain('confirmed-after');
        expect(messageIds).not.toContain('pre-boundary');
    });

    it('metadata-seeded out-of-window boundary: hasLoadedBoundary is false until pagination brings the row in', () => {
        const boundary = latestBoundary('boundary', 10);

        // Cold-start: only post-boundary messages are loaded; boundary row is outside the window
        const coldStartMessages = [
            userMessage('after-3', 13),
            userMessage('after-2', 12),
            userMessage('after-1', 11),
        ];
        const beforePagination = buildChatListBoundaryItems(coldStartMessages, boundary, false);
        expect(beforePagination.hasLoadedBoundary).toBe(false);

        // After first older-page fetch: more messages arrive but boundary row still not loaded
        const afterPage1Messages = [
            ...coldStartMessages,
            userMessage('near-boundary', 11),
        ];
        expect(buildChatListBoundaryItems(afterPage1Messages, boundary, false).hasLoadedBoundary).toBe(false);

        // After second older-page fetch: boundary row enters the window
        const afterPage2Messages = [
            ...coldStartMessages,
            boundaryMessage('boundary', 10),
            userMessage('before-1', 9),
        ];
        const afterPagination = buildChatListBoundaryItems(afterPage2Messages, boundary, false);
        expect(afterPagination.hasLoadedBoundary).toBe(true);

        // Expanding now shows all messages without a sticky divider
        const expanded = buildChatListBoundaryItems(afterPage2Messages, boundary, true);
        expect(expanded.items.map(item => item.kind)).toEqual([
            'message',
            'message',
            'message',
            'message',
            'message',
        ]);
    });
});

// ---------------------------------------------------------------------------
// US-007: Page-turn-mode debounce.
//
// Plan AC #10: a page-turn event in chatPaginatedScroll mode emits intent via
// the same `sync.reportRenderWindow(...)` bridge as the scroll path. When a
// page-turn produces multiple `onViewableItemsChanged` ticks within the same
// JS tick (FlatList commonly emits a "leaving items" tick + "entering items"
// tick after `scrollToOffset`), only ONE `session-message-range` request must
// fire — the rest must observe the in-flight tracker and synchronously bail.
//
// The Sync class transitively imports react-native, which does not boot under
// Vitest's node runner here. We follow the `sync.reportRenderWindow.spec.ts`
// precedent: reproduce the bridge body one-to-one and drive it against a
// REAL `PrefetchManager` (not a mock) so the synchronous-bail semantics are
// exercised end-to-end. Spying at the transport layer captures network calls;
// the manager's in-memory `inFlight` Map gates duplicates.
//
// AC #1's "no separate prefetch caller" invariant is verified at the source-
// import level: this file does not import `prefetchManager` directly into
// ChatList.tsx (covered by ChatList.viewableItemsAdapter.test.ts case (c));
// the page-turn path's only intent surface is `sync.reportRenderWindow(...)`.
// ---------------------------------------------------------------------------

const PAGE_SIZE = 80;

interface FakeSessionMessages {
    oldestLoadedSeq: number;
    hasOlder: boolean;
    loadingOlder: boolean;
    renderWindow: { firstSeq: number; lastSeq: number } | null;
    activePrefetch: ActivePrefetch | undefined;
}

function createFakeBridgeStorage(initial: { sessions: Record<string, FakeSessionMessages> }) {
    const state = {
        localSettings: { enableSocketRangeFetch: true },
        sessionMessages: { ...initial.sessions },
    };
    return {
        getState: () => ({
            localSettings: state.localSettings,
            sessionMessages: state.sessionMessages,
            setRenderWindow: (sessionId: string, window: { firstSeq: number; lastSeq: number } | null) => {
                const s = state.sessionMessages[sessionId];
                if (s) {
                    state.sessionMessages[sessionId] = { ...s, renderWindow: window };
                }
            },
        }),
        rawState: () => state,
    };
}

interface ManagerHarness {
    storage: PrefetchManagerStorage;
    encryption: PrefetchManagerEncryptionAdapter;
    transport: PrefetchManagerTransport;
    runInSessionLock: RunInSessionLock;
    transportSpy: ReturnType<typeof vi.fn>;
    terminalEvents: PrefetchTerminalEvent[];
    activePrefetchByeSession: Map<string, ActivePrefetch | undefined>;
}

function createManagerHarness(): ManagerHarness {
    const activePrefetchByeSession = new Map<string, ActivePrefetch | undefined>();
    const terminalEvents: PrefetchTerminalEvent[] = [];

    const storage: PrefetchManagerStorage = {
        setActivePrefetch(sessionId, activePrefetch) {
            activePrefetchByeSession.set(sessionId, activePrefetch);
        },
        applyPrefetchedRange(sessionId, _messages, params) {
            // Mirror real storage gate: only commit when requestId AND
            // generation match — irrelevant here since the test does not
            // resolve the transport before asserting.
            const cur = activePrefetchByeSession.get(sessionId);
            const requestIdMatches = cur?.requestId === params.expectedRequestId;
            const genMatches = params.currentGeneration(sessionId) === params.expectedGeneration;
            if (requestIdMatches && genMatches) {
                activePrefetchByeSession.set(sessionId, undefined);
            }
        },
        clearActivePrefetch(sessionId, expectedRequestId) {
            const cur = activePrefetchByeSession.get(sessionId);
            if (cur?.requestId === expectedRequestId) {
                activePrefetchByeSession.set(sessionId, undefined);
            }
        },
    };

    const transportSpy = vi.fn(async (req: SessionMessageRangeRequest): Promise<SessionMessageRangeResponse> => {
        // Do not resolve immediately so the manager keeps the inFlight tracker
        // alive across multiple bridge calls in the test. The fixture only
        // asserts call counts, not commit ordering.
        await new Promise<void>(() => { /* never resolves */ });
        // Unreachable, but keeps TS happy:
        return {
            ok: true,
            requestId: req.requestId,
            sessionId: req.sessionId,
            fromSeq: req.fromSeq,
            toSeq: req.toSeq,
            messages: [],
            hasMore: false,
        };
    });

    const transport: PrefetchManagerTransport = {
        requestSessionMessageRange: transportSpy,
        onReconnected: () => () => { /* no-op */ },
    };

    const encryption: PrefetchManagerEncryptionAdapter = {
        async decryptMessages() {
            return [];
        },
    };

    const locks = new Map<string, AsyncLock>();
    const runInSessionLock: RunInSessionLock = async (sessionId, body) => {
        let lock = locks.get(sessionId);
        if (!lock) {
            lock = new AsyncLock();
            locks.set(sessionId, lock);
        }
        await lock.inLock(() => {
            body();
        });
    };

    return {
        storage,
        encryption,
        transport,
        runInSessionLock,
        transportSpy,
        terminalEvents,
        activePrefetchByeSession,
    };
}

function makeReportRenderWindowBridge(
    storage: ReturnType<typeof createFakeBridgeStorage>,
    manager: PrefetchManager,
) {
    // One-to-one reproduction of sync.ts:reportRenderWindow (US-006), the only
    // viewport→prefetch entrypoint. Both the scroll path AND the page-turn
    // path route through this bridge.
    return (sessionId: string, visibleSeqs: number[]) => {
        const flag = storage.getState().localSettings.enableSocketRangeFetch;
        if (!flag) return;
        const window = computeRenderWindow({ visibleSeqs });
        if (window === null) return;
        storage.getState().setRenderWindow(sessionId, window);
        const sm = storage.getState().sessionMessages[sessionId];
        if (!sm) return;
        const should = shouldPrefetchOlder({
            renderWindow: window,
            oldestLoadedSeq: sm.oldestLoadedSeq,
            activePrefetch: sm.activePrefetch,
            hasOlder: sm.hasOlder,
        });
        if (!should) return;
        const range = computePrefetchOlderRange({ oldestLoadedSeq: sm.oldestLoadedSeq, pageSize: PAGE_SIZE });
        if (!range) return;
        void manager.requestSessionMessageRange({
            sessionId,
            fromSeq: range.fromSeq,
            toSeq: range.toSeq,
            limit: range.limit,
            direction: 'older',
        });
    };
}

describe('ChatList page-turn-mode debounce (US-007 / Plan AC #10)', () => {
    it('a page-turn that emits two onViewableItemsChanged ticks fires exactly one session-message-range request', () => {
        // oldestLoadedSeq=100, RENDER_WINDOW_OVERSCAN_SEQS=60, PREFETCH_TRIGGER_GAP_SEQS=40
        // visible min seq 110 → window.firstSeq=50 → gap = -50 ≤ 40 → triggers older prefetch.
        const storage = createFakeBridgeStorage({
            sessions: {
                'sess-1': {
                    oldestLoadedSeq: 100,
                    hasOlder: true,
                    loadingOlder: false,
                    renderWindow: null,
                    activePrefetch: undefined,
                },
            },
        });
        const harness = createManagerHarness();
        const manager = new PrefetchManager({
            storage: harness.storage,
            encryption: harness.encryption,
            transport: harness.transport,
            runInSessionLock: harness.runInSessionLock,
            now: () => 0,
            generateRequestId: (() => {
                let n = 0;
                return () => `req-${++n}`;
            })(),
            onTerminal: (e) => harness.terminalEvents.push(e),
        });
        const reportRenderWindow = makeReportRenderWindowBridge(storage, manager);

        // Simulate a page-turn event that emits TWO onViewableItemsChanged
        // ticks in the same JS tick (FlatList typically emits a "leaving" tick
        // and an "entering" tick after scrollToOffset). Both ticks compute a
        // qualifying render window — without debounce, both would fire a
        // network request.
        reportRenderWindow('sess-1', [110, 120, 130]);
        reportRenderWindow('sess-1', [108, 115, 125]);

        // Exactly one transport call, regardless of the second tick.
        expect(harness.transportSpy).toHaveBeenCalledTimes(1);
        expect(harness.transportSpy.mock.calls[0]![0]).toMatchObject({
            sessionId: 'sess-1',
        });

        // Second tick should have produced a `sync-bail` terminal event,
        // proving the manager's in-memory inFlight tracker (NOT a storage
        // round-trip) is what gates the debounce.
        expect(harness.terminalEvents.filter(e => e.kind === 'sync-bail')).toHaveLength(1);
    });

    it('after the first page-turn commits and clears in-flight, a second page-turn produces exactly one more request (rate-limited, not unbounded)', async () => {
        const storage = createFakeBridgeStorage({
            sessions: {
                'sess-1': {
                    oldestLoadedSeq: 100,
                    hasOlder: true,
                    loadingOlder: false,
                    renderWindow: null,
                    activePrefetch: undefined,
                },
            },
        });

        // Variant harness: transport resolves with empty success so the
        // manager's per-request commit completes and inFlight clears.
        const activePrefetchByeSession = new Map<string, ActivePrefetch | undefined>();
        const terminalEvents: PrefetchTerminalEvent[] = [];

        const transportSpy = vi.fn(async (req: SessionMessageRangeRequest): Promise<SessionMessageRangeResponse> => {
            // Mirror the bridge by also writing through to our fake
            // `oldestLoadedSeq` after commit so the second page-turn computes
            // a fresh prefetch range — but here we only assert call counts,
            // not state, so leave it alone.
            return {
                ok: true,
                requestId: req.requestId,
                sessionId: req.sessionId,
                fromSeq: req.fromSeq,
                toSeq: req.toSeq,
                messages: [],
                hasMore: false,
            };
        });
        const storageAdapter: PrefetchManagerStorage = {
            setActivePrefetch(sessionId, activePrefetch) {
                activePrefetchByeSession.set(sessionId, activePrefetch);
            },
            applyPrefetchedRange(sessionId, _messages, params) {
                const cur = activePrefetchByeSession.get(sessionId);
                const requestIdMatches = cur?.requestId === params.expectedRequestId;
                const genMatches = params.currentGeneration(sessionId) === params.expectedGeneration;
                if (requestIdMatches && genMatches) {
                    activePrefetchByeSession.set(sessionId, undefined);
                }
            },
            clearActivePrefetch(sessionId, expectedRequestId) {
                const cur = activePrefetchByeSession.get(sessionId);
                if (cur?.requestId === expectedRequestId) {
                    activePrefetchByeSession.set(sessionId, undefined);
                }
            },
        };

        const locks = new Map<string, AsyncLock>();
        const runInSessionLock: RunInSessionLock = async (sessionId, body) => {
            let lock = locks.get(sessionId);
            if (!lock) {
                lock = new AsyncLock();
                locks.set(sessionId, lock);
            }
            await lock.inLock(() => { body(); });
        };

        const manager = new PrefetchManager({
            storage: storageAdapter,
            encryption: { async decryptMessages() { return []; } },
            transport: {
                requestSessionMessageRange: transportSpy,
                onReconnected: () => () => { /* no-op */ },
            },
            runInSessionLock,
            now: () => 0,
            generateRequestId: (() => {
                let n = 0;
                return () => `req-${++n}`;
            })(),
            onTerminal: (e) => terminalEvents.push(e),
        });

        const reportRenderWindow = makeReportRenderWindowBridge(storage, manager);

        // First page-turn: two ticks → one request.
        reportRenderWindow('sess-1', [110, 120, 130]);
        reportRenderWindow('sess-1', [108, 115, 125]);
        expect(transportSpy).toHaveBeenCalledTimes(1);

        // Drain microtasks so the first request's commit/clear settles and
        // the manager's inFlight tracker is released. Without the await,
        // the synchronous bail would still gate the second page-turn.
        await new Promise<void>((r) => setTimeout(r, 0));

        // Second page-turn: two more ticks → exactly one MORE request.
        reportRenderWindow('sess-1', [110, 120, 130]);
        reportRenderWindow('sess-1', [108, 115, 125]);
        expect(transportSpy).toHaveBeenCalledTimes(2);
    });
});
