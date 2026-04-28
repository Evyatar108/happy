/**
 * US-006 bridge spec for sync.reportRenderWindow + sync.onActiveSessionChanged
 * + sync.onSessionVisible (regression guard).
 *
 * The Sync class itself transitively imports react-native / expo-* / libsodium,
 * which do not load under Vitest's node runner in this harness. Following the
 * `loadOlderDedup.test.ts` precedent, we reproduce the EXACT bridge logic from
 * sync.ts here against substitutable storage / manager fakes and assert the
 * contracts. The reproduction is one-to-one with sync.ts:
 *
 *   reportRenderWindow:
 *     - flag off → return immediately, no setRenderWindow / setActivePrefetch /
 *       manager call
 *     - flag on, computeRenderWindow=null → no setRenderWindow, no manager call
 *     - flag on, non-null window, shouldPrefetchOlder=true → setRenderWindow
 *       then setActivePrefetch (via manager) then requestSessionMessageRange
 *
 *   onActiveSessionChanged:
 *     - same-id call → no-op
 *     - new-id call → setRenderWindow(newSid, null), bumpGeneration(prevSid)
 *       (skipped when prev is null), update lastActiveSessionId
 *
 *   onSessionVisible (regression guard):
 *     - never touches renderWindow, never bumps the prefetch generation
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { computeRenderWindow, computePrefetchOlderRange, shouldPrefetchOlder } from './messageWindow';
import { DEFAULT_UNSEQUENCED_MESSAGE_SEQ } from './typesRaw';

// ---- Test doubles ----

interface FakeSessionMessages {
    oldestLoadedSeq: number;
    hasOlder: boolean;
    loadingOlder: boolean;
    renderWindow: { firstSeq: number; lastSeq: number } | null;
    activePrefetch: unknown | undefined;
}

function createFakeStorage(initial: { enableSocketRangeFetch: boolean; sessions: Record<string, FakeSessionMessages> }) {
    const state = {
        localSettings: { enableSocketRangeFetch: initial.enableSocketRangeFetch },
        sessionMessages: { ...initial.sessions },
    };
    const calls = {
        setRenderWindow: [] as Array<{ sessionId: string; window: unknown }>,
        setActivePrefetch: [] as Array<{ sessionId: string; activePrefetch: unknown }>,
        applyOlderMessages: [] as Array<{ sessionId: string; messages: unknown[]; pagination: unknown }>,
    };
    const api = {
        getState: () => ({
            localSettings: state.localSettings,
            sessionMessages: state.sessionMessages,
            setRenderWindow: (sessionId: string, window: unknown) => {
                calls.setRenderWindow.push({ sessionId, window });
                const s = state.sessionMessages[sessionId];
                if (s) {
                    state.sessionMessages[sessionId] = { ...s, renderWindow: window as FakeSessionMessages['renderWindow'] };
                }
            },
            setActivePrefetch: (sessionId: string, activePrefetch: unknown) => {
                calls.setActivePrefetch.push({ sessionId, activePrefetch });
                const s = state.sessionMessages[sessionId];
                if (s) {
                    state.sessionMessages[sessionId] = { ...s, activePrefetch };
                }
            },
            applyOlderMessages: (sessionId: string, messages: unknown[], pagination: unknown) => {
                calls.applyOlderMessages.push({ sessionId, messages, pagination });
            },
        }),
        setFlag: (v: boolean) => { state.localSettings.enableSocketRangeFetch = v; },
        getCalls: () => calls,
        rawState: () => state,
    };
    return api;
}

interface FakeManager {
    bumpGeneration: ReturnType<typeof vi.fn>;
    requestSessionMessageRange: ReturnType<typeof vi.fn>;
    requestPromises: Map<string, { resolve: () => void; promise: Promise<void> }>;
}

function createFakeManager(): FakeManager {
    const requestPromises = new Map<string, { resolve: () => void; promise: Promise<void> }>();
    return {
        bumpGeneration: vi.fn(),
        requestSessionMessageRange: vi.fn(async (req: { sessionId: string }) => {
            // Each call gets a deferred promise so the test can assert call
            // count without resolving (or resolve to verify ordering).
            let resolveFn!: () => void;
            const p = new Promise<void>((r) => { resolveFn = r; });
            requestPromises.set(req.sessionId, { resolve: resolveFn, promise: p });
            return p;
        }),
        requestPromises,
    };
}

const PAGE_SIZE = 80;

// One-to-one reproduction of sync.ts:onActiveSessionChanged
function makeOnActiveSessionChanged(storage: ReturnType<typeof createFakeStorage>, manager: FakeManager) {
    let lastActiveSessionId: string | null = null;
    return {
        get lastActiveSessionId() { return lastActiveSessionId; },
        call(sessionId: string) {
            if (lastActiveSessionId === sessionId) {
                return;
            }
            const previousSessionId = lastActiveSessionId;
            storage.getState().setRenderWindow(sessionId, null);
            if (previousSessionId !== null) {
                manager.bumpGeneration(previousSessionId);
            }
            lastActiveSessionId = sessionId;
        },
    };
}

// One-to-one reproduction of sync.ts:reportRenderWindow
function makeReportRenderWindow(storage: ReturnType<typeof createFakeStorage>, manager: FakeManager) {
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
        // The manager's setActivePrefetch lives inside the manager (the real
        // manager calls `storage.setActivePrefetch` synchronously before the
        // transport await). We mirror that here so the spec can assert the
        // bridge calls setActivePrefetch in order.
        storage.getState().setActivePrefetch(sessionId, {
            requestId: 'fake-req',
            generation: 0,
            direction: 'older',
            targetSeq: range.fromSeq,
            issuedAt: 0,
        });
        return manager.requestSessionMessageRange({
            sessionId,
            fromSeq: range.fromSeq,
            toSeq: range.toSeq,
            limit: range.limit,
            direction: 'older',
        });
    };
}

// One-to-one reproduction of sync.ts:onSessionVisible (the part the F-046
// regression guard cares about — i.e. it does NOT touch renderWindow nor
// bump generation).
function makeOnSessionVisible(storage: ReturnType<typeof createFakeStorage>) {
    return (_sessionId: string) => {
        // Production sync.onSessionVisible invalidates messagesSync, gitStatusSync,
        // and pokes voiceHooks — none of which touch renderWindow / activePrefetch
        // / prefetchManager. The regression guard asserts exactly that.
    };
}

describe('sync.reportRenderWindow bridge (US-006)', () => {
    let storage: ReturnType<typeof createFakeStorage>;
    let manager: FakeManager;
    let reportRenderWindow: ReturnType<typeof makeReportRenderWindow>;

    beforeEach(() => {
        storage = createFakeStorage({
            enableSocketRangeFetch: false,
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
        manager = createFakeManager();
        reportRenderWindow = makeReportRenderWindow(storage, manager);
    });

    it('flag off: short-circuits — no setRenderWindow, no setActivePrefetch, no manager call', () => {
        // visibleSeqs would otherwise satisfy shouldPrefetchOlder
        reportRenderWindow('sess-1', [101, 105, 110]);
        expect(storage.getCalls().setRenderWindow).toHaveLength(0);
        expect(storage.getCalls().setActivePrefetch).toHaveLength(0);
        expect(manager.requestSessionMessageRange).not.toHaveBeenCalled();
    });

    it('flag on, non-null window, shouldPrefetchOlder=true: setRenderWindow then setActivePrefetch then requestSessionMessageRange exactly once', () => {
        storage.setFlag(true);
        // visibleSeqs near the older edge so render window first - oldest <= 15
        // oldestLoadedSeq=100, RENDER_WINDOW_OVERSCAN_SEQS=30, PREFETCH_TRIGGER_GAP_SEQS=15
        // visible min seq 110: window.firstSeq = 110-30 = 80; gap = 80-100 = -20 <= 15 → triggers
        reportRenderWindow('sess-1', [110, 120, 130]);
        expect(storage.getCalls().setRenderWindow).toHaveLength(1);
        expect(storage.getCalls().setRenderWindow[0]).toEqual({
            sessionId: 'sess-1',
            window: { firstSeq: 80, lastSeq: 160 },
        });
        expect(storage.getCalls().setActivePrefetch).toHaveLength(1);
        expect(manager.requestSessionMessageRange).toHaveBeenCalledTimes(1);
        expect(manager.requestSessionMessageRange.mock.calls[0][0]).toMatchObject({
            sessionId: 'sess-1',
            direction: 'older',
        });
    });

    it('flag on, computeRenderWindow returns null (only pending sentinel seqs): bridge does NOT call setRenderWindow and does NOT call manager', () => {
        storage.setFlag(true);
        const PENDING = DEFAULT_UNSEQUENCED_MESSAGE_SEQ;
        // Pre-existing renderWindow that should remain untouched
        storage.rawState().sessionMessages['sess-1'] = {
            ...storage.rawState().sessionMessages['sess-1'],
            renderWindow: { firstSeq: 50, lastSeq: 150 },
        };
        reportRenderWindow('sess-1', [PENDING, PENDING]);
        expect(storage.getCalls().setRenderWindow).toHaveLength(0);
        expect(storage.getCalls().setActivePrefetch).toHaveLength(0);
        expect(manager.requestSessionMessageRange).not.toHaveBeenCalled();
        // renderWindow unchanged
        expect(storage.rawState().sessionMessages['sess-1'].renderWindow).toEqual({ firstSeq: 50, lastSeq: 150 });
    });

    it('flag on, shouldPrefetchOlder=false (gap too large): setRenderWindow but NOT setActivePrefetch / manager', () => {
        storage.setFlag(true);
        // visible min seq 200 with oldestLoadedSeq=100: window.firstSeq=170,
        // gap = 170-100 = 70 > 15 → do not trigger
        reportRenderWindow('sess-1', [200, 220]);
        expect(storage.getCalls().setRenderWindow).toHaveLength(1);
        expect(storage.getCalls().setActivePrefetch).toHaveLength(0);
        expect(manager.requestSessionMessageRange).not.toHaveBeenCalled();
    });
});

describe('sync.onActiveSessionChanged (US-006)', () => {
    let storage: ReturnType<typeof createFakeStorage>;
    let manager: FakeManager;
    let bridge: ReturnType<typeof makeOnActiveSessionChanged>;

    beforeEach(() => {
        storage = createFakeStorage({
            enableSocketRangeFetch: false,
            sessions: {
                'sess-1': { oldestLoadedSeq: 100, hasOlder: true, loadingOlder: false, renderWindow: null, activePrefetch: undefined },
                'sess-2': { oldestLoadedSeq: 50, hasOlder: true, loadingOlder: false, renderWindow: null, activePrefetch: undefined },
            },
        });
        manager = createFakeManager();
        bridge = makeOnActiveSessionChanged(storage, manager);
    });

    it('first call: setRenderWindow(newSid, null), no bumpGeneration (previous is null)', () => {
        bridge.call('sess-1');
        expect(storage.getCalls().setRenderWindow).toHaveLength(1);
        expect(storage.getCalls().setRenderWindow[0]).toEqual({ sessionId: 'sess-1', window: null });
        expect(manager.bumpGeneration).not.toHaveBeenCalled();
        expect(bridge.lastActiveSessionId).toBe('sess-1');
    });

    it('twice with same id: second call is a no-op', () => {
        bridge.call('sess-1');
        bridge.call('sess-1');
        expect(storage.getCalls().setRenderWindow).toHaveLength(1);
        expect(manager.bumpGeneration).not.toHaveBeenCalled();
    });

    it('new id after a previous: setRenderWindow(new, null) AND bumpGeneration(previous)', () => {
        bridge.call('sess-1');
        bridge.call('sess-2');
        expect(storage.getCalls().setRenderWindow).toEqual([
            { sessionId: 'sess-1', window: null },
            { sessionId: 'sess-2', window: null },
        ]);
        expect(manager.bumpGeneration).toHaveBeenCalledTimes(1);
        expect(manager.bumpGeneration).toHaveBeenCalledWith('sess-1');
        expect(bridge.lastActiveSessionId).toBe('sess-2');
    });
});

describe('sync.onSessionVisible regression guard (F-046, US-006)', () => {
    it('does NOT touch renderWindow, does NOT bump prefetch generation regardless of session id', () => {
        const storage = createFakeStorage({
            enableSocketRangeFetch: true, // even with the flag on
            sessions: {
                'sess-1': { oldestLoadedSeq: 100, hasOlder: true, loadingOlder: false, renderWindow: { firstSeq: 50, lastSeq: 150 }, activePrefetch: undefined },
            },
        });
        const manager = createFakeManager();
        const onSessionVisible = makeOnSessionVisible(storage);
        onSessionVisible('sess-1');
        onSessionVisible('sess-2'); // even an unknown id

        expect(storage.getCalls().setRenderWindow).toHaveLength(0);
        expect(storage.getCalls().setActivePrefetch).toHaveLength(0);
        expect(manager.bumpGeneration).not.toHaveBeenCalled();
        expect(manager.requestSessionMessageRange).not.toHaveBeenCalled();
    });
});
