# Codex rewind: wire `thread/rollback` and `thread/fork`

> **Status:** plan, not yet implemented. Captured 2026-04-27 from a research conversation about implementing conversation rewind/revert in Happy. See also `docs/plans/codex-fork-extension-strategy.md` (Lens 1 — "Rewind / Esc-Esc backtracking" entry under "What doesn't work / known gaps") which lists this gap; this doc is the implementation-detail expansion.
>
> **Companion brainstorm work:** `.ralph/brainstorms/preserve-turn-on-mode-switch/` (parent brainstorm on switch behavior) and `.ralph/brainstorms/preserve-turn-on-mode-switch/deferred-codex-thread-attach.md` (related deferred Codex-side work).

---

## Why this doc exists

Happy has no conversation revert/rewind affordance today. A user who wants to undo the last few turns, or branch from an earlier point in the conversation, has no UX for it. The Claude Code TUI exposes rewind via the escape key, but the **SDK Happy talks to (`@anthropic-ai/claude-code`) does not surface this primitive** — so Happy can't trigger it programmatically. For Codex, we initially assumed parity-by-hack would be needed (truncate the rollout JSONL and resume).

Investigation of upstream Codex CLI 0.121+ revealed that **Codex already ships native rewind primitives in its app-server protocol**. Happy's pinned types are at Codex 0.107.0 and don't yet surface them, but the user's installed Codex (0.125.0-copilot-api.6) exposes them today. No fork patch is required; no hack is required. This is the simplest deliverable in the rewind space and the cleanest path forward for Codex specifically.

This doc captures everything gathered during the investigation so the implementer doesn't need to redo the discovery.

---

## What Codex provides natively

Confirmed by running `codex app-server generate-ts --out <dir>` against the user's local Codex 0.125 install. Two relevant client-request methods on the JSON-RPC protocol:

### `thread/rollback` — drop N turns from the tail in place

```typescript
// from generated v2/ThreadRollbackParams.ts
export type ThreadRollbackParams = {
  threadId: string;
  /**
   * The number of turns to drop from the end of the thread. Must be >= 1.
   *
   * This only modifies the thread's history and does not revert local file changes
   * that have been made by the agent. Clients are responsible for reverting these changes.
   */
  numTurns: number;
};

// from generated v2/ThreadRollbackResponse.ts
export type ThreadRollbackResponse = {
  /**
   * The updated thread after applying the rollback, with `turns` populated.
   *
   * The ThreadItems stored in each Turn are lossy since we explicitly do not
   * persist all agent interactions, such as command executions. This is the same
   * behavior as `thread/resume`.
   */
  thread: Thread;
};
```

Semantics: same `threadId` survives, history truncated server-side, conversation continues from the new tail on the next `turn/start`. There's even an error variant `threadRollbackFailed` in `CodexErrorInfo` for handling failures.

**Critical caveat from Codex's own docs:** rollback only modifies thread history. It does NOT revert local file changes the agent made (`apply_patch` results, shell side effects, etc.). The client is responsible for any file-state reconciliation. This matches Claude Code's TUI rewind behavior (which also doesn't auto-revert files).

### `thread/fork` — branch off into a new thread

```typescript
// from generated v2/ThreadForkParams.ts (abbreviated)
export type ThreadForkParams = {
  threadId: string;
  path?: string | null;             // alt: fork by rollout path
  // configuration overrides (model, modelProvider, sandbox, approvals, etc.) all optional
  excludeTurns?: boolean;           // if true, omit turns from response
  persistExtendedHistory: boolean;
};

export type ThreadForkResponse = {
  thread: Thread;                   // new thread, with `forkedFromId` pointing at the source
  // ...full session metadata
};
```

The `Thread` schema also includes `forkedFromId: string | null` for tracking ancestry. This gives us "branch from here" UX as a separate-but-related feature: the rewind point lives on as one timeline, the new direction starts as a forked thread.

### Adjacent primitives worth knowing about

- **`thread/inject_items`** — programmatically add items to thread history. Not strictly rewind but useful adjacency (e.g. after a rollback, inject a system message marking the rewind point).
- **`thread/turns/list`** — enumerate the turns of a thread. Needed to map "rewind to message X in the app" → `numTurns` for `thread/rollback`.
- **`thread/read`** — read a thread by id, optionally `includeTurns`. Useful for preview-before-rewind UX.
- **`turn/steer`** — steer an active turn mid-execution. Different from rewind but in the same neighborhood; not in scope here.
- **Existing in Happy:** `thread/resume`, `turn/start`, `turn/interrupt`. These remain unchanged.

### Codex CLI version requirement

`thread/rollback` and `thread/fork` are present in the user's local Codex 0.125; the user's Codex fork (per `docs/plans/codex-fork-extension-strategy.md`) is based on a recent enough upstream that includes them. No fork patch needed. If Happy ever pins itself to an older bundled Codex (`packages/happy-cli/src/codex/codexAppServerTypes.ts` header notes types are "Cherry-picked … from Codex 0.107.0"), bumping the floor to a version with these RPCs is the only prerequisite.

---

## Why this can't be done equivalently for Claude Code today

For full context on the Claude side:

- **Claude Code TUI has rewind** (escape key in the terminal UI), but it's a UI-layer feature.
- **The Claude Code SDK Happy uses** (`@anthropic-ai/claude-code`) does not expose any rewind primitive — no `truncate`, `fork`, `rollback`, `branch`, or equivalent. Verified by inspecting Happy's SDK usage paths.
- **Workaround would be a hack:** truncate the JSONL session file at `~/.claude/projects/<projectId>/<sessionId>.jsonl` to a turn boundary, then spawn `claude --resume <sessionId>`. This would work but:
  - Creates a NEW session ID with all historical message `sessionId` fields rewritten (per `packages/happy-cli/CLAUDE.md` "Session Forking" section). Each rewind hits a known fragile area in Happy's mapper / scanner / metadata code paths.
  - Requires careful turn-boundary detection — `reducer.ts:78-97` keeps "pending tool results so older lazy-loaded tool calls can still attach newer results"; truncating mid-tool would orphan results.
  - Requires atomic file ops (truncate to temp, fsync, rename) since the JSONL is read by a live process.
  - Has no upstream path to replace it short of Anthropic adding a programmatic rewind primitive to the SDK.

**Decision for this plan:** ship Codex-only rewind first. Document the parity gap. Revisit Claude side if/when Anthropic exposes a primitive, or if user demand justifies the JSONL-truncate hack. Breaking Claude/Codex parity for rewind is consistent with the precedent considered for D-005 (Codex thread-attach) in the parent brainstorm.

---

## Implementation plan

### Step 1 — Bump cherry-picked Codex types

**File:** `packages/happy-cli/src/codex/codexAppServerTypes.ts`

The header reads `// Cherry-picked types from `codex app-server generate-ts` (Codex 0.107.0).`. Update by either:

a. **Regenerating from current upstream** (`codex app-server generate-ts --out <tmpdir>`) and copying the files we need into the cherry-picked file. This is the more thorough approach and aligns with the longer-term type-drift concern noted in `docs/plans/codex-fork-extension-strategy.md`.

b. **Hand-porting the minimal set** — `ThreadRollbackParams`, `ThreadRollbackResponse`, optionally `ThreadForkParams`, `ThreadForkResponse`, `Thread` (already partly modelled). Smaller diff, faster.

Recommended: option (b) for this PR, with option (a) deferred to a separate type-refresh task.

Specific additions needed:
```typescript
export type ThreadRollbackParams = { threadId: ThreadId; numTurns: number };
export type ThreadRollbackResponse = { thread: Thread };
export type ThreadForkParams = { threadId: ThreadId; ... };  // see schema above
export type ThreadForkResponse = { thread: Thread; ... };
```

Also add `forkedFromId: string | null` to the existing `Thread` shape if forking is in scope.

Update the header to note the new RPCs are sourced from Codex 0.121+ even if the rest of the file remains pinned at 0.107.

### Step 2 — Add client methods on `CodexAppServerClient`

**File:** `packages/happy-cli/src/codex/codexAppServerClient.ts`

Mirror the existing `resumeThread()` (~line 605) pattern:

```typescript
async rollbackThread(opts: { threadId: ThreadId; numTurns: number }): Promise<ThreadRollbackResponse> {
  return this.request('thread/rollback', { threadId: opts.threadId, numTurns: opts.numTurns });
}

async forkThread(opts: ThreadForkParams): Promise<ThreadForkResponse> {
  return this.request('thread/fork', opts);
}
```

Tests next to `codexAppServerClient.test.ts` covering: happy path, app-server returns `threadRollbackFailed`, invalid `numTurns` (0 or negative), non-existent threadId.

### Step 3 — Session-protocol RPC handler

**File:** `packages/happy-cli/src/codex/runCodex.ts` (and possibly `packages/happy-cli/src/api/apiSession.ts` for the session-side bridge)

Register a new RPC handler on `session.client.rpcHandlerManager` for app-initiated rewind requests. Rough shape:

```typescript
session.client.rpcHandlerManager.registerHandler('rewind', async ({ numTurns }) => {
  // Interrupt any active turn first
  if (hasActiveTurn) {
    await client.abortTurnWithFallback({ gracePeriodMs: 3000, forceRestartOnTimeout: true });
  }
  const response = await client.rollbackThread({ threadId, numTurns });
  // Sync the truncated thread to the app via existing session-event channel
  return { ok: true, thread: response.thread };
});
```

Coordinate with the existing `handleAbort` machinery (`runCodex.ts:248-295`) so rewind doesn't race with an in-flight turn.

The post-rewind app sync needs care: the app's stored message list must be truncated to match. Two reasonable approaches:
- **Server-replay:** after rollback, request `thread/turns/list` and replace the app's session messages with the canonical truncated list.
- **App-side optimistic truncation:** the app drops messages past the rewind point immediately on RPC success and reconciles with the server response.

The protocol mapper (`packages/happy-cli/src/codex/utils/sessionProtocolMapper.ts`) needs to handle a "history reset" event cleanly — current envelopes are append-only. May need a new envelope type or session-event for "rewind happened, drop everything after message X."

### Step 4 — App UX

**Files:**
- `packages/happy-app/sources/-session/SessionView.tsx` — surface a long-press / context-menu action on each message: "Rewind to here" / "Branch from here."
- `packages/happy-app/sources/sync/typesRaw.ts` — add a new `AgentEvent` type (e.g. `'rewound'` with `numTurns` and resulting tail messageId) so the transcript can render a marker indicating the rewind point.
- `packages/happy-app/sources/sync/reducer.ts` — handle the new event by truncating the in-memory message list past the rewind point and inserting the marker.
- `packages/happy-app/sources/sync/ops.ts` and `sync.ts` — wire the new RPC.

Open UX questions to resolve in implementation:
1. **Confirm before rewind?** Especially if file changes are involved; rewinding history while files diverge is a real footgun.
2. **Marker rendering on e-ink?** Per project memory, the user is on an Android e-ink tablet — keep the rewind marker high-contrast, low-animation. Reuse `surface` color per recent `33acb339`.
3. **Rewind vs branch UX choice.** Rollback (in-place) vs fork (new thread alongside). For v1, ship rollback only; add fork as a stretch goal — the underlying primitive cost is similar but the UX is different.

### Step 5 — File-state reconciliation policy

Codex's own docstring is explicit: rollback does not revert local file changes. Decide what Happy promises:

- **Option A — conversation-only rewind (smallest scope).** Document that file changes the agent made are not undone. User reverts via git themselves. Fastest to ship.
- **Option B — auto-detect and offer revert.** Codex's `ResponseItem` types include `ghost_snapshot` with a `GhostCommit`, suggesting Codex already maintains git ghost-commits internally. Investigate whether we can use those to compute a diff between the pre-rewind file state and the current state, and offer the user a one-tap "revert files too" option.
- **Option C — full automated revert.** Always revert files to the rewind-point state. Risky; may surprise users who made manual changes between agent edits.

**Recommendation for v1:** Option A. Layer Option B in a follow-up after observing how users actually use rewind.

### Step 6 — Tests

- Unit tests for `rollbackThread` / `forkThread` on `codexAppServerClient`.
- Integration test: start a Codex thread, do 3 turns, rewind 2, verify thread state via `thread/turns/list`.
- App-side test for new `AgentEvent` type and reducer handling.
- Race-condition test: rewind requested while a turn is mid-stream → assert clean abort + rollback.
- Negative tests: rollback with `numTurns >= total turns` (server should error or drop everything; pick a defined behavior).

### Step 7 — Docs

- Update `docs/plans/codex-fork-extension-strategy.md` "What doesn't work / known gaps" table — flip the Rewind row from gap to shipped, add a back-link to this doc.
- Add a brief note in `packages/happy-cli/CLAUDE.md` describing the new RPC surface.
- Update `docs/protocol.md` (or wherever the Happy session-protocol RPC list lives — confirm in implementation) with the new `rewind` RPC and the `'rewound'` AgentEvent type.
- Add a Claude Code parity gap entry in `docs/fork-notes.md` (or wherever provider-parity gaps are tracked) noting "rewind is Codex-only; Claude Code SDK lacks the primitive."

---

## Operational concerns

### Codex version floor + graceful degradation

`thread/rollback` and `thread/fork` are present in Codex 0.121+. Happy needs to detect older Codex CLIs and disable the rewind UI rather than fail with a confusing JSON-RPC error.

Two reasonable detection paths:
- **Version probe at startup.** `initialize` already returns `userAgent` containing the Codex version string; parse it and gate the rewind UI on `>= 0.121`.
- **Capability probe.** First time rewind is invoked, attempt `thread/rollback` and on `MethodNotFound` (or equivalent), surface a one-time toast: "Rewind requires Codex >= 0.121. Update your `codex` CLI." Cache the result per session.

Either way: never crash, never leave the UI in a half-broken state. Document the version requirement in `packages/happy-cli/CLAUDE.md` and the user-facing release notes.

### Reconciliation pattern: always re-list turns after rollback

The safe-default pattern is: after a successful `thread/rollback`, immediately call `thread/turns/list` and replace the app's session-message list with the canonical turn list from Codex. Do not rely on optimistic app-side truncation alone — the lossy-by-design nature of `Turn.items` (per `ThreadRollbackResponse` docstring: "ThreadItems stored in each Turn are lossy since we explicitly do not persist all agent interactions") can cause silent divergence between what Happy stored and what Codex now considers canonical.

Promote this from "option" to "recommended pattern" in the implementation. Optimistic UI can still happen pre-RPC for snappiness, but the post-RPC reconcile is the source of truth.

### Error handling for `threadRollbackFailed`

`CodexErrorInfo` includes a dedicated `"threadRollbackFailed"` variant. Plan for at least these failure cases:
- Invalid `threadId` (thread archived, deleted, or not yet persisted) — show user "Thread not found" and re-load session.
- `numTurns` exceeds available turns — server may either error or roll back to empty; pick a defined behavior in implementation tests.
- Server crashed mid-rollback — re-invoke `thread/turns/list` to recover canonical state; if Codex backend is unreachable, fall back to `abortTurnWithFallback`'s force-restart pattern.
- Rollback denied because thread is mid-turn — interrupt first (the plan already calls this out, but it should be enforced, not just recommended).

The user-facing copy should be specific ("Could not undo: thread not found" / "Already at the beginning") rather than a generic error toast.

### Token-cost framing in UI copy

Rollback itself costs nothing — it's metadata. But the *next* turn after rewind ships the truncated history to the model, which is a new prompt-token cost. If Happy surfaces token usage anywhere (it likely will), the rewind action should be honest:
- "Rewind 3 turns" — does NOT charge tokens.
- The next message after rewind — DOES charge tokens, just like any new turn.

Don't market rewind as "free" without this caveat.

### Compaction interaction

The protocol exposes `thread/compact/start` (`ThreadCompactStartParams`) which compresses thread history into a single `compaction` `ResponseItem`. Codex's documentation on what happens when you `thread/rollback` past or into a compaction boundary is not obvious from the generated types alone.

Open question for the implementer: does `numTurns` count compacted segments as one turn, as many turns, or refuse to roll back across a compaction? Likely answers (in order of preference):
- Compaction is one logical "turn" for rollback purposes — clean.
- Rollback past a compaction is rejected — needs UI handling.
- Rollback across compaction silently loses the compacted history — most dangerous; verify and disable rewind across compaction boundaries if so.

Verify empirically before shipping; add a test fixture with a compacted thread.

### Reference clients

Both Codex App (the macOS desktop app) and the VS Code Codex extension presumably consume these same RPCs. Before designing the file-state reconciliation policy (Step 5) and the fork UX (Step 4 stretch goal), look at how those clients handle:
- File reconciliation on rollback — do they offer git revert? warn? do nothing?
- Forked-thread visualization — sidebar entry per fork? collapse parent? hide entirely?
- Rewind marker rendering — what does the user see in the transcript after a rollback?

Reusing established UX patterns saves designing from scratch and keeps Happy users' mental model consistent across clients.

### Orthogonal to terminal/multiplexer work

This work is independent of the deferred terminal-close-survival brainstorm (`.ralph/brainstorms/terminal-close-survival/`) and any future psmux/tmux integration. Rewind operates at the JSON-RPC layer between the app and Codex's app-server backend; it does not touch the Happy CLI's process lifecycle, terminal hosting, or multiplexer choice. Ship rewind whenever — it is not gated on B-1 (detach), B-2 (tmux wrap), or any of the other terminal-close-survival directions.

The only weak conceptual link is **`thread/fork`** UX: an OMX-style multi-agent tmux pane-per-thread visualization could one day make forked threads feel more concrete (each branch in its own pane). That is deep stretch-goal territory dependent on Happy adopting OMX-style team mode wholesale, which is not currently scoped. Don't let it influence v1 of rewind.

---

## Open questions

1. **What's the rollback unit?** Codex's `numTurns` counts turns. A "turn" in Codex is one user message → one assistant response (with possibly multiple tool calls). The app's UX likely talks in messages. Need a clear mapping in the implementation: app passes `messageId`; CLI translates to `numTurns` by walking thread turns.
2. **Should Happy reset the session on rewind, or keep the same Happy session ID?** Codex's `threadId` is preserved; Happy's session ID is independent. Probably keep the same Happy session ID so the user sees one continuous thread with a rewind marker.
3. **Permission state.** If a turn approving a sensitive command was rolled back, does the implicit approval still apply going forward? Probably no — fresh turn after rewind should re-prompt. Verify by checking how Codex handles `permissionProfile` state on rolled-back threads.
4. **Concurrent app-vs-terminal rewind.** If both the local terminal user and the phone user issue rewinds at the same time, who wins? `abortTurnWithFallback` already handles concurrent aborts; need to think through the same for rollback.
5. **Rewind during a queued pending switch — concrete precedence rule.** This intersects with the parent brainstorm's D-002 deferred-takeover work. **Recommended rule:** if the user issues a rewind while a `pendingSwitch` is set, cancel the pending switch first (the queued message is dropped, not delivered post-rewind), then perform the rollback. Rationale: the queued message was meant for *this* point in the conversation; after rewind it would arrive in a different context than intended. Document this in the rewind RPC handler and add a test.
6. **Fork UX.** If we do ship `thread/fork` in v1, does Happy expose multiple branches in the session list, or hide the parent and show only the active branch? Reference-client check above should answer this.
7. **Rollback granularity for tool-call boundaries.** `thread/rollback` operates on turns. Mid-turn rewind (e.g. drop just the last tool call but keep the assistant message) is not in scope of the upstream primitive.
8. **Telemetry.** Should Happy emit an event on each rewind (count + numTurns) so the team can measure whether the feature warrants further investment (e.g. layered file-revert, fork UX, etc.)? Decide before shipping; analytics hooks are easier to add up front than retrofit.

---

## File index for the implementer

Files to touch (in approximate dependency order):

1. `packages/happy-cli/src/codex/codexAppServerTypes.ts` — add `ThreadRollbackParams/Response`, optionally `ThreadForkParams/Response`, extend `Thread` with `forkedFromId`.
2. `packages/happy-cli/src/codex/codexAppServerClient.ts` — add `rollbackThread()`, optionally `forkThread()`. ~line 605 is the existing `resumeThread()` to mirror.
3. `packages/happy-cli/src/codex/codexAppServerClient.test.ts` — unit tests for new client methods.
4. `packages/happy-cli/src/codex/runCodex.ts` — register new RPC handler; coordinate with `handleAbort` (~lines 248-295).
5. `packages/happy-cli/src/codex/utils/sessionProtocolMapper.ts` — handle history-reset semantics if needed.
6. `packages/happy-cli/src/api/apiSession.ts` — session-side RPC bridge if a new session-protocol message is needed.
7. `packages/happy-app/sources/sync/typesRaw.ts` — new `'rewound'` `AgentEvent` type (around lines 20-31).
8. `packages/happy-app/sources/sync/reducer.ts` — truncate-on-rewind handling.
9. `packages/happy-app/sources/sync/ops.ts`, `sync.ts` — wire the RPC.
10. `packages/happy-app/sources/-session/SessionView.tsx` — long-press / context-menu UI.
11. `packages/happy-app/sources/components/MessageView.tsx` (or similar — confirm) — render the rewind marker.
12. `docs/plans/codex-fork-extension-strategy.md` — flip the gap row, link this doc.
13. `packages/happy-cli/CLAUDE.md` — note new RPC surface.
14. `docs/protocol.md` (and/or `docs/session-protocol.md`) — add `rewind` RPC + `'rewound'` event.
15. `docs/fork-notes.md` (or equivalent) — Claude parity gap entry.

---

## Effort estimate

Order-of-magnitude: **~1-2 days CLI work + ~1 day app work + ~0.5 day tests/docs.** The CLI side is mostly type-add + client method + RPC handler; the heavy lifting is the app-side reducer truncation and the UX choice. Total fits comfortably in a single PR if scoped to rollback-only (defer fork).

If file-state reconciliation (Option B/C from Step 5) is in scope, add another 2-3 days for the ghost-commit investigation and revert UX.

---

## References

- Generated TS bindings from running `codex app-server generate-ts --out <dir>` against Codex 0.125.0-copilot-api.6 — output in `/tmp/tmp.LReXDJy5KO` during the research session, regenerable on any machine with Codex installed.
- `docs/plans/codex-fork-extension-strategy.md` — strategic context, fork-leverage decisions, and the gap entry this doc expands on.
- `docs/plans/codex-app-server-migration.md` — current Codex integration architecture.
- `.ralph/brainstorms/preserve-turn-on-mode-switch/deferred-codex-thread-attach.md` — adjacent deferred Codex work; both touch `runCodex.ts` and the protocol surface.
- Upstream Codex `ThreadRollbackParams` / `ThreadForkParams` schemas, copied verbatim above.
- `packages/happy-cli/CLAUDE.md` "Session Forking" section — documents Claude Code's `--resume` session-ID-rewriting behavior, which is why the JSONL-truncate hack on the Claude side is fragile.
- Project memory note: user is on Android e-ink tablet — UX choices should account for low refresh / high contrast.
