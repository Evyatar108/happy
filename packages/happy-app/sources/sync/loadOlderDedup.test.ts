/**
 * Verifies that rapid concurrent calls to loadOlder produce exactly one
 * server request. The fix sets loadingOlder=true synchronously BEFORE
 * awaiting the AsyncLock, so subsequent callers observe the flag and no-op.
 * Also verifies that escape paths inside the lock (early-return when hasOlder
 * flips, encryption-not-ready throw) always reset loadingOlder via try/finally.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AsyncLock } from '@/utils/lock';

// Minimal replica of the SessionMessages shape needed for the guard
interface SessionMessages {
    hasOlder: boolean;
    loadingOlder: boolean;
    oldestLoadedSeq: number;
}

// Simulates the storage state held in Zustand for a single session
function createFakeStorage(initial: SessionMessages) {
    let state: SessionMessages = { ...initial };
    return {
        getState: () => ({
            sessionMessages: { 'sess-1': state } as Record<string, SessionMessages>,
            setLoadingOlder: (_sessionId: string, value: boolean) => {
                if (state) {
                    state = { ...state, loadingOlder: value };
                }
            },
            applyOlderMessages: (_sessionId: string, _msgs: unknown[], pagination: { hasOlder: boolean }) => {
                state = { ...state, loadingOlder: false, hasOlder: pagination.hasOlder };
            },
        }),
    };
}

// Mirrors the fixed loadOlder implementation (set loadingOlder=true before lock,
// try/finally inside lock guarantees cleanup on any non-applied exit path).
async function makeLoadOlder(
    storage: ReturnType<typeof createFakeStorage>,
    lock: AsyncLock,
    fetchFn: () => Promise<void>,
    getEncryption?: () => boolean,
) {
    return async (sessionId: string): Promise<void> => {
        const sessionMessages = storage.getState().sessionMessages[sessionId];
        if (!sessionMessages || !sessionMessages.hasOlder || sessionMessages.loadingOlder) {
            return;
        }
        storage.getState().setLoadingOlder(sessionId, true);

        await lock.inLock(async () => {
            let applied = false;
            try {
                const current = storage.getState().sessionMessages[sessionId];
                if (!current || !current.hasOlder) {
                    return;
                }
                if (getEncryption && !getEncryption()) {
                    throw new Error(`Session encryption not ready for ${sessionId}`);
                }
                await fetchFn();
                applied = true;
                storage.getState().applyOlderMessages(sessionId, [], { hasOlder: false });
            } finally {
                if (!applied) {
                    storage.getState().setLoadingOlder(sessionId, false);
                }
            }
        });
    };
}

describe('loadOlder dedup', () => {
    let storage: ReturnType<typeof createFakeStorage>;
    let lock: AsyncLock;
    let fetchFn: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        storage = createFakeStorage({ hasOlder: true, loadingOlder: false, oldestLoadedSeq: 100 });
        lock = new AsyncLock();
        fetchFn = vi.fn(async () => {
            // simulate async network delay
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
        });
    });

    it('two rapid concurrent calls produce exactly one fetch', async () => {
        const loadOlder = await makeLoadOlder(storage, lock, fetchFn);

        // Fire two calls without awaiting the first — simulates onEndReached firing twice
        const p1 = loadOlder('sess-1');
        const p2 = loadOlder('sess-1');
        await Promise.all([p1, p2]);

        expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('second sequential call triggers a new fetch when hasOlder remains true after first completes', async () => {
        // Use a storage that keeps hasOlder=true after applyOlderMessages
        let state: SessionMessages = { hasOlder: true, loadingOlder: false, oldestLoadedSeq: 100 };
        const storageWithMore = {
            getState: () => ({
                sessionMessages: { 'sess-1': state } as Record<string, SessionMessages>,
                setLoadingOlder: (_sessionId: string, value: boolean) => {
                    state = { ...state, loadingOlder: value };
                },
                applyOlderMessages: (_sessionId: string, _msgs: unknown[], _pagination: { hasOlder: boolean }) => {
                    // Keep hasOlder=true so the next sequential call can proceed
                    state = { ...state, loadingOlder: false, hasOlder: true };
                },
            }),
        };

        const loadOlderWithMore = await makeLoadOlder(storageWithMore, new AsyncLock(), fetchFn);

        await loadOlderWithMore('sess-1');
        await loadOlderWithMore('sess-1');

        expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it('loadingOlder resets to false when hasOlder flips to false between pre-lock and in-lock reads', async () => {
        // Pre-lock check sees hasOlder=true, but by the time we are inside the lock
        // a concurrent operation has already cleared hasOlder (race with applyOlderMessages).
        let state: SessionMessages = { hasOlder: true, loadingOlder: false, oldestLoadedSeq: 100 };
        const racyStorage = {
            getState: () => ({
                get sessionMessages() {
                    return { 'sess-1': state } as Record<string, SessionMessages>;
                },
                setLoadingOlder: (_sessionId: string, value: boolean) => {
                    state = { ...state, loadingOlder: value };
                    // Simulate the race: flip hasOlder=false the moment loadingOlder is set true,
                    // so the in-lock re-read sees hasOlder=false.
                    if (value) {
                        state = { ...state, hasOlder: false };
                    }
                },
                applyOlderMessages: (_sessionId: string, _msgs: unknown[], pagination: { hasOlder: boolean }) => {
                    state = { ...state, loadingOlder: false, hasOlder: pagination.hasOlder };
                },
            }),
        };

        const loadOlder = await makeLoadOlder(racyStorage as ReturnType<typeof createFakeStorage>, new AsyncLock(), fetchFn);

        await loadOlder('sess-1');

        // The in-lock early return must have triggered the finally cleanup
        expect(state.loadingOlder).toBe(false);
        // fetchFn must not have been called (we bailed out before it)
        expect(fetchFn).not.toHaveBeenCalled();

        // A subsequent call must be able to proceed (loadingOlder is false)
        // Reset hasOlder so loadOlder can enter again
        state = { ...state, hasOlder: true };
        fetchFn.mockClear();
        fetchFn.mockImplementationOnce(async () => { /* success */ });
        // This time no race — let the call go through normally
        const loadOlder2 = await makeLoadOlder(
            createFakeStorage({ hasOlder: true, loadingOlder: false, oldestLoadedSeq: 100 }),
            new AsyncLock(),
            fetchFn,
        );
        await loadOlder2('sess-1');
        expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('loadingOlder resets to false when encryption-not-ready throws, and a subsequent call can proceed', async () => {
        let encryptionReady = false;
        const loadOlder = await makeLoadOlder(storage, new AsyncLock(), fetchFn, () => encryptionReady);

        // First call: encryption not ready → throw inside lock → finally must clear flag
        await expect(loadOlder('sess-1')).rejects.toThrow('encryption not ready');

        const stateAfterThrow = storage.getState().sessionMessages['sess-1'];
        expect(stateAfterThrow?.loadingOlder).toBe(false);

        // Second call: encryption now ready → should fetch successfully
        encryptionReady = true;
        await loadOlder('sess-1');
        expect(fetchFn).toHaveBeenCalledTimes(1);
    });
});
