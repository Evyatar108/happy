/**
 * Verifies that rapid concurrent calls to loadOlder produce exactly one
 * server request. The fix sets loadingOlder=true synchronously BEFORE
 * awaiting the AsyncLock, so subsequent callers observe the flag and no-op.
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
            setLoadingOlder: (sessionId: string, value: boolean) => {
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

// Mirrors the fixed loadOlder implementation (set loadingOlder=true before lock)
async function makeLoadOlder(
    storage: ReturnType<typeof createFakeStorage>,
    lock: AsyncLock,
    fetchFn: () => Promise<void>,
) {
    return async (sessionId: string): Promise<void> => {
        const sessionMessages = storage.getState().sessionMessages[sessionId];
        if (!sessionMessages || !sessionMessages.hasOlder || sessionMessages.loadingOlder) {
            return;
        }
        storage.getState().setLoadingOlder(sessionId, true);

        await lock.inLock(async () => {
            const current = storage.getState().sessionMessages[sessionId];
            if (!current || !current.hasOlder) {
                return;
            }
            try {
                await fetchFn();
                storage.getState().applyOlderMessages(sessionId, [], { hasOlder: false });
            } catch (error) {
                storage.getState().setLoadingOlder(sessionId, false);
                throw error;
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
});
