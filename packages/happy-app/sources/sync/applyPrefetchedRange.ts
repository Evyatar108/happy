import type { Message } from './typesMessage';
import { DEFAULT_UNSEQUENCED_MESSAGE_SEQ, type NormalizedMessage } from './typesRaw';
import type { AgentState, TodoItem } from './storageTypes';
import type { ReducerState } from './reducer/reducer';
import { reducer } from './reducer/reducer';

export interface ActivePrefetch {
    requestId: string;
    generation: number;
    direction: 'older' | 'newer';
    targetSeq: number;
    issuedAt: number;
}

export interface SessionMergeMeta {
    agentState: AgentState | null | undefined;
    latestUsage: {
        inputTokens: number;
        outputTokens: number;
        cacheCreation: number;
        cacheRead: number;
        contextSize: number;
        timestamp: number;
    } | null | undefined;
    todos: TodoItem[] | undefined;
}

export interface MergeOlderMessagesSession {
    messages: Message[];
    messagesMap: Record<string, Message>;
    reducerState: ReducerState;
    isLoaded: boolean;
    hasOlder: boolean;
    oldestLoadedSeq: number;
    loadingOlder: boolean;
    renderWindow: { firstSeq: number; lastSeq: number } | null;
    activePrefetch?: ActivePrefetch;
}

export interface MergeOlderMessagesInput {
    existingSession: MergeOlderMessagesSession;
    sessionMeta: SessionMergeMeta;
    messages: NormalizedMessage[];
    pagination: {
        newOldestLoadedSeq: number;
        hasOlder: boolean;
    };
}

export interface MergeOlderMessagesResult {
    nextSession: MergeOlderMessagesSession;
    nextSessionMeta: SessionMergeMeta;
}

/**
 * Pure merge of an older-messages batch into a session. No global state access,
 * no Zustand set, no storage.getState(). Both storage.applyOlderMessages and
 * storage.applyPrefetchedRange invoke this helper to share the reducer-replay
 * and meta-extraction logic.
 */
export function mergeOlderMessagesIntoSession({
    existingSession,
    sessionMeta,
    messages,
    pagination,
}: MergeOlderMessagesInput): MergeOlderMessagesResult {
    const normalizedMessages = [...messages].sort((left, right) => left.createdAt - right.createdAt);
    const reducerResult = reducer(existingSession.reducerState, normalizedMessages, sessionMeta.agentState);
    const processedMessages = reducerResult.messages;

    const mergedMessagesMap = { ...existingSession.messagesMap };
    processedMessages.forEach(message => {
        mergedMessagesMap[message.id] = message;
    });

    // Sort by session-local `seq` DESC so older-by-seq messages always land
    // at the array tail (visual top in inverted FlatList). Earlier sort by
    // `createdAt DESC` was unstable for sessions where `seq` order doesn't
    // match `createdAt` order (clock skew, mixed sources, post-clear
    // re-sequencing): an older-seq message with a `createdAt` between the
    // existing first/last would splice into the MIDDLE of the array,
    // shifting indices between the user's viewport and data-index 0, which
    // MVCP would compensate for by shifting the scroll offset → visible
    // snap-back. Diagnosed 2026-04-29 in
    // `.ralph/brainstorms/streaming-pagination-scroll-jump/` round 2.
    //
    // Pending optimistic messages (seq === DEFAULT_UNSEQUENCED_MESSAGE_SEQ
    // === Number.MAX_SAFE_INTEGER) keep landing at index 0 because they
    // have the highest possible seq.
    //
    // `createdAt` remains the deterministic tiebreaker so messages with the
    // same seq (e.g. multiple unsequenced pendings) keep a stable order.
    const messagesArray = Object.values(mergedMessagesMap)
        .sort((a, b) => {
            if (a.seq !== b.seq) {
                return b.seq - a.seq;
            }
            return b.createdAt - a.createdAt;
        });

    const nextSessionMeta: SessionMergeMeta = {
        agentState: sessionMeta.agentState,
        todos: reducerResult.todos !== undefined ? reducerResult.todos : sessionMeta.todos,
        latestUsage: existingSession.reducerState.latestUsage
            ? { ...existingSession.reducerState.latestUsage }
            : sessionMeta.latestUsage,
    };

    return {
        nextSession: {
            ...existingSession,
            messages: messagesArray,
            messagesMap: mergedMessagesMap,
            reducerState: existingSession.reducerState,
            hasOlder: pagination.hasOlder,
            oldestLoadedSeq: pagination.newOldestLoadedSeq,
            loadingOlder: false,
        },
        nextSessionMeta,
    };
}

/**
 * Computes the post-commit `oldestLoadedSeq` for a prefetched batch.
 *
 * Pending entries (`seq === DEFAULT_UNSEQUENCED_MESSAGE_SEQ`) are filtered out
 * upstream before reaching this helper, but we filter defensively here so the
 * boundary derivation matches the messageWindow.ts contract. Returns the prior
 * `oldestLoadedSeq` when the filtered batch is empty, so a sparse server
 * response like `[25..99]` keeps `25` as the new edge instead of falling back
 * to `requestedFromSeq`.
 */
export function computeNextOldestLoadedSeq(
    decryptedMessages: NormalizedMessage[],
    priorOldestLoadedSeq: number,
): number {
    let next = priorOldestLoadedSeq;
    let sawConfirmed = false;
    for (const message of decryptedMessages) {
        if (message.seq === DEFAULT_UNSEQUENCED_MESSAGE_SEQ) {
            continue;
        }
        if (!sawConfirmed || message.seq < next) {
            next = message.seq;
            sawConfirmed = true;
        }
    }
    return sawConfirmed ? next : priorOldestLoadedSeq;
}

export interface ApplyPrefetchedRangeParams {
    requestedFromSeq: number;
    requestedToSeq: number;
    hasMore: boolean;
    expectedRequestId: string;
    expectedGeneration: number;
    actualGeneration: number;
}

export type ApplyPrefetchedRangeResult =
    | { stale: true }
    | {
        stale: false;
        nextSession: MergeOlderMessagesSession;
        nextSessionMeta: SessionMergeMeta;
    };

/**
 * Storage-shaped, side-effect-free entry point for the prefetch commit path.
 * Performs the staleness gates (requestId mismatch, generation mismatch),
 * filters pending sentinel seqs, derives the new `oldestLoadedSeq` via
 * `computeNextOldestLoadedSeq`, and runs the shared
 * `mergeOlderMessagesIntoSession` reducer-survival path. Returns
 * `{ stale: true }` on either staleness gate so the caller can short-circuit
 * the Zustand `set` without mutating store state.
 */
export function applyPrefetchedRangeToSession({
    existingSession,
    sessionMeta,
    messages,
    params,
}: {
    existingSession: MergeOlderMessagesSession;
    sessionMeta: SessionMergeMeta;
    messages: NormalizedMessage[];
    params: ApplyPrefetchedRangeParams;
}): ApplyPrefetchedRangeResult {
    if (existingSession.activePrefetch?.requestId !== params.expectedRequestId) {
        return { stale: true };
    }
    if (params.actualGeneration !== params.expectedGeneration) {
        return { stale: true };
    }

    const newOldestLoadedSeq = computeNextOldestLoadedSeq(
        messages,
        existingSession.oldestLoadedSeq,
    );

    // Defensive contract (Plan §Approach): a server reply with `messages: []`
    // AND `hasMore: true` is a protocol violation — by definition there can't
    // be more older history if the server returned no rows for the requested
    // range. Combined with `oldestLoadedSeq` left at its prior value
    // (computeNextOldestLoadedSeq returns prior seq for an empty filtered
    // batch), the next viewport tick would see the same `oldestLoadedSeq` AND
    // `hasOlder: true` AND `activePrefetch === undefined` (cleared on commit)
    // and re-issue an identical-range request. Override `hasOlder` to false
    // here to guarantee progress and surface the violation via console.warn.
    const filteredMessages = messages.filter(m => m.seq !== DEFAULT_UNSEQUENCED_MESSAGE_SEQ);
    let effectiveHasMore = params.hasMore;
    if (filteredMessages.length === 0 && params.hasMore === true) {
        // eslint-disable-next-line no-console
        console.warn(
            '[applyPrefetchedRange] protocol violation: empty messages with hasMore=true; forcing hasOlder=false to guarantee pagination progress',
        );
        effectiveHasMore = false;
    }

    const { nextSession, nextSessionMeta } = mergeOlderMessagesIntoSession({
        existingSession,
        sessionMeta,
        messages,
        pagination: { newOldestLoadedSeq, hasOlder: effectiveHasMore },
    });

    return {
        stale: false,
        nextSession: { ...nextSession, activePrefetch: undefined },
        nextSessionMeta,
    };
}
