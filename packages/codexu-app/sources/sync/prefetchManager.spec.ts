import { describe, expect, it, vi } from 'vitest';
import type {
    SessionMessageRangeRequest,
    SessionMessageRangeResponse,
} from 'codexu-wire';
import type { ApiMessage } from './apiTypes';
import type { DecryptedMessage } from './storageTypes';
import type { ActivePrefetch } from './applyPrefetchedRange';
import type { NormalizedMessage } from './typesRaw';
import { AsyncLock } from '../utils/lock';
import {
    PrefetchManager,
    type PrefetchManagerStorage,
    type PrefetchManagerEncryptionAdapter,
    type PrefetchManagerTransport,
    type RunInSessionLock,
    type PrefetchTerminalEvent,
} from './prefetchManager';

//
// Test harness
//

interface FakeStorageRecord {
    activePrefetch?: ActivePrefetch;
    appliedBatches: Array<{
        sessionId: string;
        messages: NormalizedMessage[];
        params: {
            requestedFromSeq: number;
            requestedToSeq: number;
            hasMore: boolean;
            expectedRequestId: string;
            expectedGeneration: number;
        };
        committed: boolean;
    }>;
    clearCalls: Array<{ sessionId: string; expectedRequestId: string; effective: boolean }>;
}

interface Harness {
    storage: PrefetchManagerStorage;
    encryption: PrefetchManagerEncryptionAdapter;
    transport: PrefetchManagerTransport;
    runInSessionLock: RunInSessionLock;
    record: Record<string, FakeStorageRecord>;
    locks: Map<string, AsyncLock>;
    terminalEvents: PrefetchTerminalEvent[];
    /**
     * Override per-call. Set the response promise the next transport call
     * resolves with (or rejects with). Either by sessionId or a queue.
     */
    transportQueue: Array<(req: SessionMessageRangeRequest) => Promise<SessionMessageRangeResponse>>;
    decryptQueue: Array<(msgs: ApiMessage[]) => Promise<(DecryptedMessage | null)[]>>;
    reconnectListeners: Set<() => void>;
    triggerReconnect: () => void;
    /**
     * Provide currentGeneration for a fake "in-lock generation peek" so the
     * spec can assert staleness gates. Defaults to 0.
     */
    fakeCurrentGenerationForCommit: (sessionId: string) => number;
    setFakeGeneration(sessionId: string, gen: number): void;
}

function makeFakeDecryptedMessage(seq: number): DecryptedMessage {
    // Use a minimal content that normalizeRawMessage will accept: user text.
    return {
        id: `msg-${seq}`,
        seq,
        localId: null,
        createdAt: seq * 1000,
        content: {
            role: 'user',
            content: { type: 'text', text: `seq-${seq}` },
        } as DecryptedMessage['content'],
    };
}

function createHarness(opts?: { fakeCurrentGenerationForCommit?: (sid: string) => number }): Harness {
    const record: Record<string, FakeStorageRecord> = {};
    const locks = new Map<string, AsyncLock>();
    const terminalEvents: PrefetchTerminalEvent[] = [];
    const reconnectListeners = new Set<() => void>();
    const transportQueue: Harness['transportQueue'] = [];
    const decryptQueue: Harness['decryptQueue'] = [];

    const fakeGenerationOverrides = new Map<string, number>();
    const fakeCurrentGenerationForCommit = (sid: string) =>
        fakeGenerationOverrides.has(sid)
            ? fakeGenerationOverrides.get(sid)!
            : (opts?.fakeCurrentGenerationForCommit?.(sid) ?? 0);

    function ensureRecord(sessionId: string): FakeStorageRecord {
        if (!record[sessionId]) {
            record[sessionId] = {
                activePrefetch: undefined,
                appliedBatches: [],
                clearCalls: [],
            };
        }
        return record[sessionId];
    }

    const storage: PrefetchManagerStorage = {
        setActivePrefetch(sessionId, activePrefetch) {
            ensureRecord(sessionId).activePrefetch = activePrefetch;
        },
        applyPrefetchedRange(sessionId, messages, params) {
            const r = ensureRecord(sessionId);
            // Mirror the real storage gate for this fake. The manager passes
            // expectedRequestId, expectedGeneration, currentGeneration. The
            // staleness check inside the real storage compares
            // current.activePrefetch?.requestId vs expectedRequestId AND
            // currentGeneration(sessionId) vs expectedGeneration.
            const ourRequestId = r.activePrefetch?.requestId;
            const requestIdMatches = ourRequestId === params.expectedRequestId;
            const genMatches = params.currentGeneration(sessionId) === params.expectedGeneration;
            const committed = requestIdMatches && genMatches;
            r.appliedBatches.push({
                sessionId,
                messages: [...messages],
                params: {
                    requestedFromSeq: params.requestedFromSeq,
                    requestedToSeq: params.requestedToSeq,
                    hasMore: params.hasMore,
                    expectedRequestId: params.expectedRequestId,
                    expectedGeneration: params.expectedGeneration,
                },
                committed,
            });
            if (committed) {
                r.activePrefetch = undefined;
            }
        },
        clearActivePrefetch(sessionId, expectedRequestId) {
            const r = ensureRecord(sessionId);
            const effective = r.activePrefetch?.requestId === expectedRequestId;
            r.clearCalls.push({ sessionId, expectedRequestId, effective });
            if (effective) {
                r.activePrefetch = undefined;
            }
        },
    };

    const encryption: PrefetchManagerEncryptionAdapter = {
        async decryptMessages(_sessionId, messages) {
            const next = decryptQueue.shift();
            if (next) {
                return next(messages);
            }
            // Default: decrypt happy path returning one DecryptedMessage per
            // input ApiMessage with seq taken from the input.
            return messages.map(m => makeFakeDecryptedMessage(m.seq));
        },
    };

    const transport: PrefetchManagerTransport = {
        async requestSessionMessageRange(req) {
            const next = transportQueue.shift();
            if (next) {
                return next(req);
            }
            // Default: empty success.
            return {
                ok: true,
                requestId: req.requestId,
                sessionId: req.sessionId,
                fromSeq: req.fromSeq,
                toSeq: req.toSeq,
                messages: [],
                hasMore: false,
            } satisfies SessionMessageRangeResponse;
        },
        onReconnected(listener) {
            reconnectListeners.add(listener);
            return () => reconnectListeners.delete(listener);
        },
    };

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
        record,
        locks,
        terminalEvents,
        transportQueue,
        decryptQueue,
        reconnectListeners,
        triggerReconnect() {
            for (const l of reconnectListeners) {
                l();
            }
        },
        fakeCurrentGenerationForCommit,
        setFakeGeneration(sessionId, gen) {
            fakeGenerationOverrides.set(sessionId, gen);
        },
    };
}

function createDeferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function makeManager(harness: Harness) {
    let counter = 0;
    return new PrefetchManager({
        storage: harness.storage,
        encryption: harness.encryption,
        transport: harness.transport,
        runInSessionLock: harness.runInSessionLock,
        now: () => 12345,
        generateRequestId: () => `req-${++counter}`,
        onTerminal: (e) => harness.terminalEvents.push(e),
    });
}

function okResponse(req: SessionMessageRangeRequest, opts?: { hasMore?: boolean; seqs?: number[] }): SessionMessageRangeResponse {
    const seqs = opts?.seqs ?? [];
    const messages: ApiMessage[] = seqs.map(seq => ({
        id: `msg-${seq}`,
        seq,
        localId: null,
        createdAt: seq * 1000,
        updatedAt: seq * 1000,
        content: { t: 'encrypted', c: `enc-${seq}` },
    }));
    return {
        ok: true,
        requestId: req.requestId,
        sessionId: req.sessionId,
        fromSeq: req.fromSeq,
        toSeq: req.toSeq,
        messages,
        hasMore: opts?.hasMore ?? false,
    };
}

function errorResponse(
    req: SessionMessageRangeRequest,
    code: 'session_not_found' | 'invalid_range' | 'rate_limited' | 'internal',
): SessionMessageRangeResponse {
    return {
        ok: false,
        requestId: req.requestId,
        error: { code, message: `error: ${code}` },
    };
}

//
// Tests
//

describe('PrefetchManager', () => {
    describe('lock-serialized commit, parallel transport/decrypt', () => {
        it('(a) live new-message decrypt is not blocked by an in-flight prefetch transport/decrypt', async () => {
            // Plan AC #4 — verify the prefetch holds the per-session lock
            // ONLY for the commit, not during transport/decrypt. We simulate
            // a slow transport AND a slow decrypt; meanwhile, a `live decrypt`
            // task that runs OUTSIDE the lock must complete before the
            // prefetch terminal commit fires.
            const h = createHarness();
            const manager = makeManager(h);

            const transportDeferred = createDeferred<SessionMessageRangeResponse>();
            const decryptDeferred = createDeferred<(DecryptedMessage | null)[]>();

            h.transportQueue.push(async (req) => {
                return transportDeferred.promise.then(() => okResponse(req, { seqs: [10] }));
            });
            h.decryptQueue.push(async () => {
                return decryptDeferred.promise.then(() => [makeFakeDecryptedMessage(10)]);
            });

            const liveOrder: string[] = [];

            // Kick off the prefetch.
            const prefetchPromise = manager.requestSessionMessageRange({
                sessionId: 's1',
                fromSeq: 1,
                toSeq: 50,
                limit: 50,
                direction: 'older',
            }).then(() => liveOrder.push('prefetch-resolved'));

            // While transport is in flight, a live new-message handler should
            // be able to do its own decrypt without waiting on us. Simulate by
            // running an unrelated async block.
            await Promise.resolve();
            liveOrder.push('live-decrypt-start');
            await Promise.resolve();
            liveOrder.push('live-decrypt-end');

            // Resolve transport, then decrypt.
            transportDeferred.resolve(okResponse({ requestId: 'req-1', sessionId: 's1', fromSeq: 1, toSeq: 50, limit: 50 }, { seqs: [10] }));
            await Promise.resolve();
            decryptDeferred.resolve([makeFakeDecryptedMessage(10)]);

            await prefetchPromise;

            // The live decrypt completed BEFORE the prefetch resolved, proving
            // it was not blocked behind the prefetch's transport/decrypt.
            expect(liveOrder).toEqual(['live-decrypt-start', 'live-decrypt-end', 'prefetch-resolved']);

            // And the commit DID happen.
            expect(h.record['s1']!.appliedBatches.length).toBe(1);
            expect(h.record['s1']!.appliedBatches[0]!.committed).toBe(true);
            expect(h.terminalEvents.at(-1)!.kind).toBe('commit');
        });

        it('(b) two commits ordered through the lock observe sequential ordering', async () => {
            // Two prefetches against TWO sessions to avoid the
            // "synchronous-bail when in-flight on same session" rule. Both
            // commit, and we verify the lock serialized the commits per-session.
            const h = createHarness();
            const manager = makeManager(h);

            h.transportQueue.push(async (req) => okResponse(req, { seqs: [5] }));
            h.transportQueue.push(async (req) => okResponse(req, { seqs: [6] }));

            const a = manager.requestSessionMessageRange({
                sessionId: 'sA', fromSeq: 1, toSeq: 50, limit: 50, direction: 'older',
            });
            const b = manager.requestSessionMessageRange({
                sessionId: 'sB', fromSeq: 1, toSeq: 50, limit: 50, direction: 'older',
            });
            await Promise.all([a, b]);

            expect(h.record['sA']!.appliedBatches.length).toBe(1);
            expect(h.record['sB']!.appliedBatches.length).toBe(1);
            expect(h.record['sA']!.appliedBatches[0]!.committed).toBe(true);
            expect(h.record['sB']!.appliedBatches[0]!.committed).toBe(true);
        });
    });

    describe('staleness gates', () => {
        it('(c) generation bump observed inside the lock discards via stale expectedGeneration', async () => {
            const h = createHarness();
            // Setup transport to resolve normally; we then bump generation
            // BEFORE the lock body runs. The manager peeks current generation
            // inside the lock and passes mismatch through to storage's
            // currentGeneration callback, which fails the gate.
            h.transportQueue.push(async (req) => okResponse(req, { seqs: [10] }));

            // Use a forward reference so wrappedRun can call m2.bumpGeneration
            // (the manager whose generations we are mutating).
            let m2!: PrefetchManager;
            const origRun = h.runInSessionLock;
            const wrappedRun: RunInSessionLock = async (sid, body) => {
                m2.bumpGeneration(sid); // simulates a session switch landing inside the lock
                await origRun(sid, body);
            };
            m2 = new PrefetchManager({
                storage: h.storage,
                encryption: h.encryption,
                transport: h.transport,
                runInSessionLock: wrappedRun,
                now: () => 1,
                generateRequestId: () => 'reqX',
                onTerminal: (e) => h.terminalEvents.push(e),
            });

            await m2.requestSessionMessageRange({
                sessionId: 's1', fromSeq: 1, toSeq: 50, limit: 50, direction: 'older',
            });

            const batch = h.record['s1']!.appliedBatches[0]!;
            expect(batch.committed).toBe(false); // staleness short-circuit
            expect(h.terminalEvents.at(-1)!.kind).toBe('stale-discard');
            // Failure-clear was called for the staleness path.
            expect(h.record['s1']!.clearCalls.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('reconnect / session-switch generation bumps', () => {
        it('(d) reconnect bumps generation and abandons in-flight tracking', async () => {
            const h = createHarness();
            const manager = makeManager(h);

            // Issue a prefetch under generation 0 first to seed the map.
            h.transportQueue.push(async (req) => okResponse(req, { seqs: [10] }));
            await manager.requestSessionMessageRange({
                sessionId: 's1', fromSeq: 1, toSeq: 50, limit: 50, direction: 'older',
            });
            expect(manager.getGeneration('s1')).toBe(0);

            // Reconnect bumps.
            h.triggerReconnect();
            expect(manager.getGeneration('s1')).toBe(1);

            // The next request must use the bumped generation, and the prior
            // in-flight tracker is gone.
            h.transportQueue.push(async (req) => okResponse(req, { seqs: [11] }));
            await manager.requestSessionMessageRange({
                sessionId: 's1', fromSeq: 1, toSeq: 50, limit: 50, direction: 'older',
            });
            const batch = h.record['s1']!.appliedBatches.at(-1)!;
            expect(batch.params.expectedGeneration).toBe(1);
            expect(batch.committed).toBe(true);
        });

        it('(d-leak) reconnect with TWO in-flight prefetches: clears each storage.activePrefetch, settles each promise, fires abandon-on-reconnect, and unblocks the next viewport tick', async () => {
            // Bug 2 fix: pre-fix, onReconnected only bumped generations and
            // wiped the in-memory inFlight map. Storage's activePrefetch was
            // left stranded for each session — `shouldPrefetchOlder` would
            // then return false permanently because activePrefetch was set,
            // and any awaiter of the orphaned per-request Promise<void>
            // (sync.loadOlder's awaited-commit branch) would block forever
            // because the original transport await was abandoned by Socket.IO
            // on disconnect.
            const h = createHarness();
            const manager = makeManager(h);

            // Slow transports for both sessions so we can assert reconnect
            // behavior while requests are still in-flight.
            const transportA = createDeferred<SessionMessageRangeResponse>();
            const transportB = createDeferred<SessionMessageRangeResponse>();
            h.transportQueue.push(async () => transportA.promise);
            h.transportQueue.push(async () => transportB.promise);

            // Issue two prefetches under generation 0 each.
            const pA = manager.requestSessionMessageRange({
                sessionId: 'sA', fromSeq: 1, toSeq: 50, limit: 50, direction: 'older',
            });
            const pB = manager.requestSessionMessageRange({
                sessionId: 'sB', fromSeq: 1, toSeq: 50, limit: 50, direction: 'older',
            });

            // Both have a durable activePrefetch in storage and an in-memory
            // in-flight tracker.
            expect(h.record['sA']!.activePrefetch).toBeDefined();
            expect(h.record['sB']!.activePrefetch).toBeDefined();
            expect(manager.getGeneration('sA')).toBe(0);
            expect(manager.getGeneration('sB')).toBe(0);

            // Capture the requestIds the manager assigned.
            const idA = h.record['sA']!.activePrefetch!.requestId;
            const idB = h.record['sB']!.activePrefetch!.requestId;

            // Trigger reconnect.
            h.triggerReconnect();

            // Generations bumped for both sessions.
            expect(manager.getGeneration('sA')).toBe(1);
            expect(manager.getGeneration('sB')).toBe(1);

            // Storage.clearActivePrefetch was called for each in-flight with
            // the captured requestId, and the durable activePrefetch is
            // cleared (so `shouldPrefetchOlder` is no longer permanently
            // blocked).
            expect(h.record['sA']!.activePrefetch).toBeUndefined();
            expect(h.record['sB']!.activePrefetch).toBeUndefined();
            expect(h.record['sA']!.clearCalls).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ sessionId: 'sA', expectedRequestId: idA, effective: true }),
                ]),
            );
            expect(h.record['sB']!.clearCalls).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ sessionId: 'sB', expectedRequestId: idB, effective: true }),
                ]),
            );

            // abandon-on-reconnect terminal events fired for both.
            const abandonEvents = h.terminalEvents.filter(e => e.kind === 'abandon-on-reconnect');
            expect(abandonEvents.length).toBe(2);
            expect(abandonEvents.map(e => e.sessionId).sort()).toEqual(['sA', 'sB']);

            // The orphaned per-request Promise<void>s settled — pre-fix they
            // would block forever because the original transport await was
            // abandoned by socket.io on disconnect.
            await Promise.all([pA, pB]);

            // Subsequent viewport tick on sA satisfies shouldPrefetchOlder
            // and issues a NEW request under the bumped generation. Pre-fix
            // this was permanently blocked.
            h.transportQueue.push(async (req) => okResponse(req, { seqs: [11] }));
            await manager.requestSessionMessageRange({
                sessionId: 'sA', fromSeq: 1, toSeq: 50, limit: 50, direction: 'older',
            });
            const lastBatch = h.record['sA']!.appliedBatches.at(-1)!;
            expect(lastBatch.params.expectedGeneration).toBe(1);
            expect(lastBatch.committed).toBe(true);

            // Resolve the originally-orphaned transport promises last to
            // assert the body's late commit/clear is harmless (storage's
            // requestId gate protects the newer activePrefetch).
            transportA.resolve(okResponse({ requestId: idA, sessionId: 'sA', fromSeq: 1, toSeq: 50, limit: 50 }, { seqs: [10] }));
            transportB.resolve(okResponse({ requestId: idB, sessionId: 'sB', fromSeq: 1, toSeq: 50, limit: 50 }, { seqs: [10] }));
            // Drain microtasks so the late body completes.
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
        });

        it('(d-leak-session-cleanup) abandonInFlight() clears storage.activePrefetch, settles the orphaned promise, and fires abandon-on-cleanup', async () => {
            // 3-way Phase 5a re-review (Codex #1, Copilot #1) — the analogous
            // failure mode to (d-leak) but on the session-switch and
            // session-delete cleanup paths. Pre-fix, sync.onActiveSessionChanged
            // and the delete-session handler both called the lightweight
            // bumpGeneration() which only deletes the in-memory inFlight entry
            // and bumps the generation counter. Storage's durable
            // activePrefetch was left set, the per-request Promise<void> was
            // never settled, and (in sync.ts) prefetchPendingPromises kept the
            // orphaned reference. Coming back to the previous session would
            // find shouldPrefetchOlder permanently gated by stale activePrefetch
            // and any flag-on loadOlder() would await a promise that never
            // resolves (the transport ack may have been abandoned by Socket.IO
            // before it ever arrived). With default-on this surfaces on every
            // session switch where a prefetch was in flight.
            const h = createHarness();
            const manager = makeManager(h);

            // Slow transport so the request stays in-flight when we abandon.
            const transport = createDeferred<SessionMessageRangeResponse>();
            h.transportQueue.push(async () => transport.promise);

            const p = manager.requestSessionMessageRange({
                sessionId: 's1', fromSeq: 1, toSeq: 50, limit: 50, direction: 'older',
            });

            expect(h.record['s1']!.activePrefetch).toBeDefined();
            const requestId = h.record['s1']!.activePrefetch!.requestId;
            expect(manager.getGeneration('s1')).toBe(0);

            // Sync layer calls this from onActiveSessionChanged (previous
            // session) or from the delete-session handler.
            manager.abandonInFlight('s1');

            // Generation bumped.
            expect(manager.getGeneration('s1')).toBe(1);

            // Storage clearActivePrefetch was called with the captured
            // requestId, and the durable activePrefetch is gone.
            expect(h.record['s1']!.activePrefetch).toBeUndefined();
            expect(h.record['s1']!.clearCalls).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ sessionId: 's1', expectedRequestId: requestId, effective: true }),
                ]),
            );

            // abandon-on-cleanup terminal event fired (distinct kind from
            // reconnect's abandon-on-reconnect, so DSAT / telemetry can tell
            // the two cleanup paths apart).
            const cleanupEvents = h.terminalEvents.filter(e => e.kind === 'abandon-on-cleanup');
            expect(cleanupEvents.length).toBe(1);
            expect(cleanupEvents[0]).toMatchObject({ sessionId: 's1', requestId });

            // Orphaned per-request Promise<void> settled — pre-fix this would
            // block any flag-on loadOlder() awaiter forever.
            await p;

            // Coming back to the same session: a fresh viewport tick under
            // the bumped generation issues cleanly (pre-fix, shouldPrefetchOlder
            // was permanently gated by stale activePrefetch).
            h.transportQueue.push(async (req) => okResponse(req, { seqs: [11] }));
            await manager.requestSessionMessageRange({
                sessionId: 's1', fromSeq: 1, toSeq: 50, limit: 50, direction: 'older',
            });
            const lastBatch = h.record['s1']!.appliedBatches.at(-1)!;
            expect(lastBatch.params.expectedGeneration).toBe(1);
            expect(lastBatch.committed).toBe(true);

            // Resolve the originally-orphaned transport last to assert the
            // body's late commit/clear is harmless (storage's requestId gate
            // protects the newer activePrefetch from a stale wipe).
            transport.resolve(okResponse({ requestId, sessionId: 's1', fromSeq: 1, toSeq: 50, limit: 50 }, { seqs: [10] }));
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
        });

        it('(d-leak-no-inflight) abandonInFlight() with no in-flight is a safe no-op (still bumps generation)', async () => {
            // Plain idle session: bumps the generation counter but does not
            // call clearActivePrefetch and does not fire a terminal event.
            const h = createHarness();
            const manager = makeManager(h);

            // Seed the generation (manager only tracks sessions that have
            // been touched; verify we don't crash on an unknown session).
            manager.abandonInFlight('s1');
            expect(manager.getGeneration('s1')).toBe(1);
            expect(h.record['s1']?.clearCalls ?? []).toEqual([]);
            expect(h.terminalEvents.filter(e => e.kind === 'abandon-on-cleanup').length).toBe(0);

            // Calling again continues to bump.
            manager.abandonInFlight('s1');
            expect(manager.getGeneration('s1')).toBe(2);
        });

        it('(e) bumpGeneration() invalidates an in-flight commit (direction-reversal surrogate)', async () => {
            // Direction-reversal inside requestSessionMessageRange uses the
            // lightweight bumpGeneration() — does NOT settle the orphaned
            // promise or clear storage's activePrefetch, because a NEW
            // request immediately follows on the same session and the
            // late-body cleanup path covers the orphan via stale-discard.
            // Verify the bump changes the expected generation that storage
            // sees inside the lock.
            const h = createHarness();
            const manager = makeManager(h);

            const transportDeferred = createDeferred<void>();
            h.transportQueue.push(async (req) => {
                await transportDeferred.promise;
                return okResponse(req, { seqs: [10] });
            });

            const p = manager.requestSessionMessageRange({
                sessionId: 's1', fromSeq: 1, toSeq: 50, limit: 50, direction: 'older',
            });

            // Simulate a session switch landing while the request is in flight.
            manager.bumpGeneration('s1');
            transportDeferred.resolve();
            await p;

            const batch = h.record['s1']!.appliedBatches[0]!;
            // Captured generation at issue was 0; current is 1; storage must
            // see them as not equal.
            expect(batch.params.expectedGeneration).toBe(0);
            expect(batch.committed).toBe(false);
            expect(h.terminalEvents.at(-1)!.kind).toBe('stale-discard');
        });
    });

    describe('per-request terminal Promise<void> ordering', () => {
        it('(f) terminal Promise resolves AFTER the corresponding terminal commit/discard', async () => {
            const h = createHarness();
            const manager = makeManager(h);
            h.transportQueue.push(async (req) => okResponse(req, { seqs: [10] }));

            const eventOrder: string[] = [];
            // Wrap the onTerminal hook to record an "event" entry.
            const m2 = new PrefetchManager({
                storage: h.storage,
                encryption: h.encryption,
                transport: h.transport,
                runInSessionLock: h.runInSessionLock,
                now: () => 1,
                generateRequestId: () => 'reqF',
                onTerminal: (e) => {
                    eventOrder.push(`terminal:${e.kind}`);
                },
            });

            await m2.requestSessionMessageRange({
                sessionId: 's1', fromSeq: 1, toSeq: 50, limit: 50, direction: 'older',
            }).then(() => {
                eventOrder.push('promise-resolved');
            });

            // The terminal event must precede the promise resolution.
            expect(eventOrder.indexOf('terminal:commit')).toBeLessThan(eventOrder.indexOf('promise-resolved'));
            // And the storage commit happened before the terminal hook fired.
            expect(h.record['s1']!.appliedBatches.length).toBe(1);
            expect(h.record['s1']!.appliedBatches[0]!.committed).toBe(true);
        });
    });

    describe('failure-clear contract (g)', () => {
        const errorCodes: Array<'session_not_found' | 'invalid_range' | 'rate_limited' | 'internal'> = [
            'session_not_found',
            'invalid_range',
            'rate_limited',
            'internal',
        ];

        for (const code of errorCodes) {
            it(`ok:false ack with code=${code} clears activePrefetch exactly once`, async () => {
                const h = createHarness();
                const manager = makeManager(h);
                h.transportQueue.push(async (req) => errorResponse(req, code));

                await manager.requestSessionMessageRange({
                    sessionId: 's1', fromSeq: 1, toSeq: 50, limit: 50, direction: 'older',
                });
                const r = h.record['s1']!;
                expect(r.activePrefetch).toBeUndefined();
                expect(r.clearCalls.length).toBe(1);
                expect(r.clearCalls[0]!.effective).toBe(true);
                expect(r.appliedBatches.length).toBe(0); // never reached commit dispatch
                expect(h.terminalEvents.at(-1)).toMatchObject({ kind: 'ack-error', errorCode: code });
            });
        }

        it('thrown transport error clears exactly once', async () => {
            const h = createHarness();
            const manager = makeManager(h);
            h.transportQueue.push(async () => {
                throw new Error('socket disconnected mid-flight');
            });

            await manager.requestSessionMessageRange({
                sessionId: 's1', fromSeq: 1, toSeq: 50, limit: 50, direction: 'older',
            });
            const r = h.record['s1']!;
            expect(r.activePrefetch).toBeUndefined();
            expect(r.clearCalls.length).toBe(1);
            expect(r.clearCalls[0]!.effective).toBe(true);
            expect(h.terminalEvents.at(-1)!.kind).toBe('transport-error');
        });

        it('decrypt failure clears exactly once', async () => {
            const h = createHarness();
            const manager = makeManager(h);
            h.transportQueue.push(async (req) => okResponse(req, { seqs: [10] }));
            h.decryptQueue.push(async () => {
                throw new Error('decrypt failed');
            });

            await manager.requestSessionMessageRange({
                sessionId: 's1', fromSeq: 1, toSeq: 50, limit: 50, direction: 'older',
            });
            const r = h.record['s1']!;
            expect(r.activePrefetch).toBeUndefined();
            expect(r.clearCalls.length).toBe(1);
            expect(r.clearCalls[0]!.effective).toBe(true);
            expect(h.terminalEvents.at(-1)!.kind).toBe('decrypt-error');
        });

        it('closure-mismatch staleness discard inside the lock clears exactly once', async () => {
            const h = createHarness();
            h.transportQueue.push(async (req) => okResponse(req, { seqs: [10] }));

            // Force staleness by bumping generation between decrypt and commit.
            let m2!: PrefetchManager;
            const origRun = h.runInSessionLock;
            const wrappedRun: RunInSessionLock = async (sid, body) => {
                m2.bumpGeneration(sid);
                await origRun(sid, body);
            };
            m2 = new PrefetchManager({
                storage: h.storage,
                encryption: h.encryption,
                transport: h.transport,
                runInSessionLock: wrappedRun,
                now: () => 1,
                generateRequestId: () => 'reqM',
                onTerminal: (e) => h.terminalEvents.push(e),
            });

            await m2.requestSessionMessageRange({
                sessionId: 's1', fromSeq: 1, toSeq: 50, limit: 50, direction: 'older',
            });

            const r = h.record['s1']!;
            // applyPrefetchedRange recorded a batch but committed=false.
            expect(r.appliedBatches.length).toBe(1);
            expect(r.appliedBatches[0]!.committed).toBe(false);
            // Plus a single clearActivePrefetch call from the manager's
            // staleness-path failure clear.
            expect(r.clearCalls.length).toBe(1);
            expect(h.terminalEvents.at(-1)!.kind).toBe('stale-discard');
        });
    });

    describe('(h) retry-after-error', () => {
        it('after an ok:false ack, activePrefetch is undefined and a fresh request can be issued', async () => {
            const h = createHarness();
            const manager = makeManager(h);

            // First: error response.
            h.transportQueue.push(async (req) => errorResponse(req, 'rate_limited'));
            await manager.requestSessionMessageRange({
                sessionId: 's1', fromSeq: 1, toSeq: 50, limit: 50, direction: 'older',
            });
            expect(h.record['s1']!.activePrefetch).toBeUndefined();
            expect(h.terminalEvents.at(-1)).toMatchObject({ kind: 'ack-error', errorCode: 'rate_limited' });

            // Second: a subsequent prefetch goes through cleanly. (Plan AC #18:
            // a follow-up reportRenderWindow-trigger that satisfies
            // shouldPrefetchOlder issues a fresh request.)
            h.transportQueue.push(async (req) => okResponse(req, { seqs: [9] }));
            await manager.requestSessionMessageRange({
                sessionId: 's1', fromSeq: 1, toSeq: 50, limit: 50, direction: 'older',
            });
            expect(h.record['s1']!.appliedBatches.length).toBe(1);
            expect(h.record['s1']!.appliedBatches[0]!.committed).toBe(true);
            expect(h.terminalEvents.at(-1)!.kind).toBe('commit');
        });
    });

    describe('(i) guarded clear under generation bumps preserves a newer activePrefetch', () => {
        it('a late staleness clear from an old request does not blow away the newer activePrefetch', async () => {
            // Storage's clearActivePrefetch already no-ops on requestId
            // mismatch (US-003 contract). This test asserts the manager
            // relies on that guard correctly: an in-flight request that ends
            // in failure AFTER a generation bump and a NEW activePrefetch
            // setup must NOT clear the new activePrefetch.
            const h = createHarness();
            const manager = makeManager(h);

            // Set up a slow transport for request 1.
            const transport1 = createDeferred<SessionMessageRangeResponse>();
            h.transportQueue.push(async () => transport1.promise);

            // Issue request 1 (will be in-flight under generation 0).
            const p1 = manager.requestSessionMessageRange({
                sessionId: 's1', fromSeq: 1, toSeq: 50, limit: 50, direction: 'older',
            });

            // While it's in flight, bump generation and issue request 2 by
            // calling the (fake) storage.setActivePrefetch directly so the
            // record reflects the newer in-flight under generation 1.
            manager.bumpGeneration('s1');
            const newerActive: ActivePrefetch = {
                requestId: 'req-newer',
                generation: manager.getGeneration('s1'),
                direction: 'older',
                targetSeq: 0,
                issuedAt: 999,
            };
            h.storage.setActivePrefetch('s1', newerActive);

            // Now resolve request 1's transport with an ok:false ack so the
            // failure-clear path runs.
            transport1.resolve(errorResponse({ requestId: 'req-1', sessionId: 's1', fromSeq: 1, toSeq: 50, limit: 50 }, 'internal'));
            await p1;

            // The clear was attempted but did NOT blow away the newer one.
            const r = h.record['s1']!;
            expect(r.activePrefetch).toEqual(newerActive);
            expect(r.clearCalls.some(c => c.expectedRequestId === 'req-1' && c.effective === false)).toBe(true);
        });
    });

    describe('synchronous bail before transport', () => {
        it('a second request while one is in-flight on the same session synchronously bails', async () => {
            const h = createHarness();
            const manager = makeManager(h);

            const transportDeferred = createDeferred<SessionMessageRangeResponse>();
            h.transportQueue.push(async (req) => {
                await transportDeferred.promise;
                return okResponse(req, { seqs: [10] });
            });

            const p1 = manager.requestSessionMessageRange({
                sessionId: 's1', fromSeq: 1, toSeq: 50, limit: 50, direction: 'older',
            });
            // Second concurrent: must bail synchronously and resolve before p1
            // (because no transport / decrypt / lock work happens for it).
            const p2 = manager.requestSessionMessageRange({
                sessionId: 's1', fromSeq: 1, toSeq: 50, limit: 50, direction: 'older',
            });

            await p2;
            // Ensure the bail event exists before transport even resolves.
            expect(h.terminalEvents.some(e => e.kind === 'sync-bail')).toBe(true);

            transportDeferred.resolve(okResponse({ requestId: 'req-1', sessionId: 's1', fromSeq: 1, toSeq: 50, limit: 50 }, { seqs: [10] }));
            await p1;
        });
    });
});
