import type {
    SessionMessageRangeRequest,
    SessionMessageRangeResponse,
} from '@slopus/happy-wire';
import type { ApiMessage } from './apiTypes';
import type { DecryptedMessage } from './storageTypes';
import { normalizeRawMessage, type NormalizedMessage } from './typesRaw';
import type { ActivePrefetch } from './applyPrefetchedRange';

/**
 * Minimal storage surface the prefetch manager depends on. Restricted on
 * purpose — the manager never reads activePrefetch nor compares generations
 * itself; that gate is owned entirely by `storage.applyPrefetchedRange` (which
 * re-checks generation and requestId atomically inside the Zustand `set`).
 */
export interface PrefetchManagerStorage {
    setActivePrefetch(sessionId: string, activePrefetch: ActivePrefetch): void;
    applyPrefetchedRange(
        sessionId: string,
        messages: NormalizedMessage[],
        params: {
            requestedFromSeq: number;
            requestedToSeq: number;
            hasMore: boolean;
            expectedRequestId: string;
            expectedGeneration: number;
            currentGeneration: (sessionId: string) => number;
        }
    ): void;
    clearActivePrefetch(sessionId: string, expectedRequestId: string): void;
}

export interface PrefetchManagerEncryptionAdapter {
    /**
     * Decrypt a batch of encrypted blobs for the given session. Returns
     * null entries for un-decryptable messages, mirroring
     * `SessionEncryption.decryptMessages`.
     */
    decryptMessages(sessionId: string, messages: ApiMessage[]): Promise<(DecryptedMessage | null)[]>;
}

export interface PrefetchManagerTransport {
    requestSessionMessageRange(req: SessionMessageRangeRequest): Promise<SessionMessageRangeResponse>;
    /**
     * Subscribe to reconnect events. Returns an unsubscribe function. Mirrors
     * `apiSocket.onReconnected`'s shape so the production transport plug in
     * directly.
     */
    onReconnected(listener: () => void): () => void;
}

/**
 * The sync layer constructs the manager and supplies a closure that runs the
 * provided commit body inside the per-session AsyncLock. The manager never
 * imports `AsyncLock` directly — the only thing it cares about is "give me a
 * place to put the commit dispatch so it serializes with `loadOlder` and the
 * live new-message queue".
 */
export type RunInSessionLock = (
    sessionId: string,
    body: () => void,
) => Promise<void>;

export interface PrefetchManagerOptions {
    storage: PrefetchManagerStorage;
    encryption: PrefetchManagerEncryptionAdapter;
    transport: PrefetchManagerTransport;
    runInSessionLock: RunInSessionLock;
    /**
     * Optional clock for tests. Defaults to `Date.now()`.
     */
    now?: () => number;
    /**
     * Optional `requestId` factory. Defaults to a `prefetch-<rand>` generator;
     * tests typically inject a deterministic factory.
     */
    generateRequestId?: () => string;
    /**
     * Optional instrumentation hook fired AFTER each terminal exit completes,
     * but BEFORE the per-request terminal Promise<void> resolves. Used by the
     * spec to assert resolution-ordering invariants. Receives the kind of
     * terminal exit and the requestId.
     */
    onTerminal?: (event: PrefetchTerminalEvent) => void;
}

export type PrefetchTerminalKind =
    | 'commit'
    | 'ack-error'
    | 'transport-error'
    | 'decrypt-error'
    | 'stale-discard'
    | 'sync-bail';

export interface PrefetchTerminalEvent {
    sessionId: string;
    requestId: string;
    kind: PrefetchTerminalKind;
    /**
     * For `ack-error`, the wire error code (one of session_not_found,
     * invalid_range, rate_limited, internal). Undefined otherwise.
     */
    errorCode?: 'session_not_found' | 'invalid_range' | 'rate_limited' | 'internal';
}

export interface RequestSessionMessageRangeArgs {
    sessionId: string;
    fromSeq: number;
    toSeq: number;
    limit: number;
    direction: 'older' | 'newer';
}

interface InFlight {
    requestId: string;
    generation: number;
    direction: 'older' | 'newer';
}

let _idCounter = 0;
function defaultRequestId(): string {
    _idCounter += 1;
    const rand = Math.random().toString(36).slice(2, 10);
    return `prefetch-${Date.now()}-${_idCounter}-${rand}`;
}

/**
 * Per-session prefetch manager. Owns:
 *  - a generation counter per session (bumped on session switch / direction
 *    reversal / reconnect — tested in the spec; wired in US-006 for session
 *    switch; wired here for reconnect)
 *  - an in-flight tracker keyed by sessionId so a synchronous bail can fire
 *    when another prefetch is already in flight (the storage `activePrefetch`
 *    is the durable record; this Map is just a fast pre-check)
 *
 * Lock model: emitWithAck transport AND `encryption.decryptMessages` run
 * OUTSIDE any per-session lock. Only the final `storage.applyPrefetchedRange`
 * commit runs INSIDE the lock. This is the entire reason the manager exists —
 * it lets live `new-message` decrypt continue in parallel while a slow
 * older-page transport/decrypt is in flight.
 *
 * Per-request terminal Promise<void>: `requestSessionMessageRange` returns a
 * Promise that resolves after EXACTLY ONE of (i) the in-lock commit completes,
 * (ii) a closure-mismatch staleness discard inside the lock terminally
 * discards the request, (iii) a synchronous bail (another prefetch already in
 * flight) before transport, or (iv) a non-commit terminal exit
 * (ack-error / transport-error / decrypt-error). The commit/discard/clear
 * happens BEFORE the Promise resolves.
 *
 * Failure-clear contract: for each non-commit terminal exit the manager calls
 * `storage.clearActivePrefetch(sessionId, expectedRequestId)` exactly once
 * before resolving. The clear is guarded by the storage action itself
 * (no-op if `activePrefetch.requestId !== expectedRequestId`), so a late
 * clear arriving after a generation bump and a newer issued prefetch cannot
 * blow away the newer activePrefetch.
 */
export class PrefetchManager {
    private readonly storage: PrefetchManagerStorage;
    private readonly encryption: PrefetchManagerEncryptionAdapter;
    private readonly transport: PrefetchManagerTransport;
    private readonly runInSessionLock: RunInSessionLock;
    private readonly now: () => number;
    private readonly generateRequestId: () => string;
    private readonly onTerminal?: (event: PrefetchTerminalEvent) => void;

    private readonly generations = new Map<string, number>();
    private readonly inFlight = new Map<string, InFlight>();
    private readonly unsubscribeReconnect: () => void;

    constructor(options: PrefetchManagerOptions) {
        this.storage = options.storage;
        this.encryption = options.encryption;
        this.transport = options.transport;
        this.runInSessionLock = options.runInSessionLock;
        this.now = options.now ?? (() => Date.now());
        this.generateRequestId = options.generateRequestId ?? defaultRequestId;
        this.onTerminal = options.onTerminal;

        // US-005 wires the reconnect bump here so sync.ts/apiSocket do not
        // need to poke internal manager state. The transport surface
        // accepts `onReconnected(listener)` returning an unsubscribe fn,
        // matching apiSocket.onReconnected's signature.
        this.unsubscribeReconnect = this.transport.onReconnected(() => {
            this.onReconnected();
        });
    }

    /**
     * Unwire the reconnect listener. Used by tests that want to dispose the
     * manager without tearing down the transport. Production has no caller.
     */
    dispose(): void {
        this.unsubscribeReconnect();
    }

    /**
     * Storage's `applyPrefetchedRange` calls back into this method inside the
     * per-session lock to re-read the manager's authoritative generation and
     * compare it against the request's captured `expectedGeneration`. Exposed
     * publicly so the sync layer can pass `(sid) => manager.getGeneration(sid)`
     * straight through without poking internal state.
     */
    getGeneration(sessionId: string): number {
        return this.generations.get(sessionId) ?? 0;
    }

    /**
     * Bump the generation for a single session. Abandons any in-flight
     * tracker so the next pre-flight check passes. Used by US-006's
     * `sync.onActiveSessionChanged` to invalidate the previous session's
     * pending prefetch on session switch.
     */
    bumpGeneration(sessionId: string): void {
        this.generations.set(sessionId, this.getGeneration(sessionId) + 1);
        this.inFlight.delete(sessionId);
    }

    /**
     * Reconnect path. Bumps generation for every session that has had a
     * prefetch generation tracked, plus every session with an in-flight
     * tracker. There is no mid-prefetch resume — the contract is "abandon and
     * re-issue under a new generation".
     */
    onReconnected(): void {
        const sessionIds = new Set<string>([
            ...this.generations.keys(),
            ...this.inFlight.keys(),
        ]);
        for (const sid of sessionIds) {
            this.generations.set(sid, this.getGeneration(sid) + 1);
        }
        this.inFlight.clear();
    }

    /**
     * Issue a session-message-range request. Returns a per-request
     * `Promise<void>` that resolves after a terminal commit/discard/clear (or
     * a synchronous bail). Never resolves while merely in flight.
     *
     * On direction reversal, bumps the generation BEFORE issuing under the
     * new generation so any commit attempt for the old direction's request
     * fails the staleness gate inside the lock.
     */
    async requestSessionMessageRange(args: RequestSessionMessageRangeArgs): Promise<void> {
        const { sessionId, fromSeq, toSeq, limit, direction } = args;

        // Direction reversal: bump generation so any in-flight commit attempt
        // under the old direction is short-circuited inside the lock by the
        // expectedGeneration mismatch.
        const inFlight = this.inFlight.get(sessionId);
        if (inFlight && inFlight.direction !== direction) {
            this.bumpGeneration(sessionId);
        }

        // Synchronous bail when another prefetch is already in flight.
        if (this.inFlight.has(sessionId)) {
            const requestId = '<sync-bailed>';
            this.fireTerminal({ sessionId, requestId, kind: 'sync-bail' });
            return;
        }

        const requestId = this.generateRequestId();
        const generation = this.getGeneration(sessionId);
        // Seed the generations Map so onReconnected() picks this session up
        // even on the first request (before any explicit bumpGeneration call).
        this.generations.set(sessionId, generation);
        const issuedAt = this.now();
        const targetSeq = direction === 'older' ? fromSeq : toSeq;

        const activePrefetch: ActivePrefetch = {
            requestId,
            generation,
            direction,
            targetSeq,
            issuedAt,
        };

        this.inFlight.set(sessionId, { requestId, generation, direction });
        this.storage.setActivePrefetch(sessionId, activePrefetch);

        let response: SessionMessageRangeResponse;
        try {
            response = await this.transport.requestSessionMessageRange({
                requestId,
                sessionId,
                fromSeq,
                toSeq,
                limit,
            });
        } catch (_err) {
            this.inFlight.delete(sessionId);
            this.storage.clearActivePrefetch(sessionId, requestId);
            this.fireTerminal({ sessionId, requestId, kind: 'transport-error' });
            return;
        }

        if (!response.ok) {
            this.inFlight.delete(sessionId);
            this.storage.clearActivePrefetch(sessionId, requestId);
            this.fireTerminal({
                sessionId,
                requestId,
                kind: 'ack-error',
                errorCode: response.error.code,
            });
            return;
        }

        // OK ack. Decrypt OUTSIDE the lock.
        let decrypted: (DecryptedMessage | null)[];
        try {
            decrypted = await this.encryption.decryptMessages(sessionId, response.messages);
        } catch (_err) {
            this.inFlight.delete(sessionId);
            this.storage.clearActivePrefetch(sessionId, requestId);
            this.fireTerminal({ sessionId, requestId, kind: 'decrypt-error' });
            return;
        }

        const normalized: NormalizedMessage[] = [];
        for (const dec of decrypted) {
            if (!dec) {
                continue;
            }
            const norm = normalizeRawMessage(
                dec.id,
                dec.localId,
                dec.createdAt,
                dec.seq,
                dec.content,
            );
            if (norm) {
                normalized.push(norm);
            }
        }

        // Capture the storage snapshot of "are we still the in-flight" before
        // entering the lock so we can decide whether to fire `stale-discard`
        // vs `commit` after the lock body runs. The authoritative gate is
        // still inside `applyPrefetchedRange` — this is just for terminal
        // event classification.
        let committed = false;
        await this.runInSessionLock(sessionId, () => {
            const generationBeforeCommit = this.getGeneration(sessionId);
            const stale = generationBeforeCommit !== generation;
            this.storage.applyPrefetchedRange(sessionId, normalized, {
                requestedFromSeq: response.fromSeq,
                requestedToSeq: response.toSeq,
                hasMore: response.hasMore,
                expectedRequestId: requestId,
                expectedGeneration: generation,
                currentGeneration: (sid) => this.getGeneration(sid),
            });
            if (!stale) {
                committed = true;
            }
        });

        // Whether the in-lock dispatch committed or staleness-discarded, the
        // in-flight tracker is no longer ours.
        this.inFlight.delete(sessionId);

        if (committed) {
            this.fireTerminal({ sessionId, requestId, kind: 'commit' });
            return;
        }

        // Staleness path: storage.applyPrefetchedRange short-circuited
        // (requestId mismatch or generation mismatch). Emit the failure-clear
        // for the discarded request. The clear is guarded by storage so it
        // cannot blow away a newer in-flight prefetch issued after a
        // generation bump.
        this.storage.clearActivePrefetch(sessionId, requestId);
        this.fireTerminal({ sessionId, requestId, kind: 'stale-discard' });
    }

    private fireTerminal(event: PrefetchTerminalEvent): void {
        if (this.onTerminal) {
            this.onTerminal(event);
        }
    }
}
