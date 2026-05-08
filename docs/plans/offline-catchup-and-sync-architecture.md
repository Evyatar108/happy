# Offline catch-up and sync architecture for Claude + Codex

> **Status:** Research / brainstorm artifacts captured 2026-04-29. NOT yet a plan; this is the seed document for the next plan-with-ralph pass. Scope: Claude Code + Codex only. Gemini/ACP are explicitly out of scope per the maintainer's direction.
>
> **Companion brainstorms (full lens outputs preserved):**
> - `.ralph/jobs/.staging/20260430T003837Z-442467/` — round 1 (streaming-pagination scroll-jump root cause)
> - `.ralph/jobs/.staging/20260430T014037Z-r2-443613/` — round 2 (architecture audit framing)
> - `.ralph/jobs/.staging/20260430T022832Z-444607/` — round 3 (cost-blind ideal architecture)
> - `.ralph/jobs/.staging/20260430T023844Z-r3-445496/` — round 3 round-3 ideal-architecture lens output (final)
> - `.ralph/jobs/.staging/20260430T030309Z-verify-446370/` — Claude offline-catchup verification (Codex lens)
> - `.ralph/jobs/.staging/20260430T031442Z-codex-verify-447311/` — Codex offline-catchup verification (Codex lens)

---

## Why this doc exists

The day of 2026-04-29 we hit five chat-rendering bugs in rapid succession on the BOOX e-ink tablet (skill-body rendered as user-message, task-notification XML, boundary-eviction snap, reducer Phase 5 dedup gap → 357→1098 unbounded message growth, createdAt-vs-seq sort mismatch). Each had a localized fix. Investigating *why so many in one day* led to a question that doesn't have a fix yet:

**What happens if the agent CLI continues a conversation while happy-cli is offline, and Happy is later started up on the same conversation? Can the missed messages reach Happy at all?**

For Claude: today, **NO** — they are lost. For Codex: the failure mode is *different* in shape but also gappy. This document captures everything gathered during investigation, the brainstorm history, candidate directions, and the per-agent fix bundles, so the next planning pass doesn't need to redo the discovery.

The scope is intentionally narrowed:
- **In scope:** Claude Code (file-tailing architecture) and Codex (child-process JSON-RPC architecture)
- **Out of scope:** Gemini and generic ACP (the maintainer doesn't use Gemini through Happy today)

---

## Goals (success criteria)

A successful offline-catch-up implementation should:

1. **No data loss** — any agent-CLI activity (Claude or Codex) that happens while happy-cli is offline becomes available in Happy after happy-cli is restarted, **without manual intervention**.
2. **Idempotent re-forwarding** — the same wire message forwarded twice (e.g. across two happy-cli restarts) does not produce two server-side rows. Today the server dedups by `localId` which is `randomUUID()` per `enqueueMessage` call, so re-forwarding currently DOES create duplicates.
3. **Correct ordering** — caught-up messages are interleaved into the conversation at their canonical seq position, not appended as a "post-script" block. Already correct on the server side (per-session monotonic seq). The producer must respect this.
4. **Crash-resilient** — happy-cli crashing mid-turn doesn't lose messages it had received from the agent CLI but hadn't yet acked from the server.
5. **Boundary fidelity** — context-clear, plan-mode-exit, compact, and `session-fork-resume` boundaries all reach the server even when they happened during an offline window.
6. **No E2EE compromise** — server still stores ciphertext-only; producer-side persistence files do not leak plaintext outside `~/.happy-dev/` on the device.
7. **Multi-device coherence preserved** — the existing per-device reducer + per-session seq invariants continue to hold; offline catch-up does not introduce divergence between phone/Air5C/TabX.

---

## Architectural context: Claude vs Codex

The two agents have **fundamentally different event-source architectures**, which means the same offline-catch-up question has different shape per agent.

### Claude — JSONL tail + on-disk truth

- happy-cli tails `~/.claude/projects/<dir>/<sid>.jsonl` via `packages/happy-cli/src/claude/utils/sessionScanner.ts`.
- Claude Code (the upstream binary) writes JSONL files to disk independently of happy-cli; the JSONL persists across happy-cli crashes/restarts and across Claude Code restarts.
- `claude --resume <oldSid>` creates a **NEW** JSONL file with a **NEW** sessionId; the new file contains the complete prior history rewritten under the new sid (per `packages/happy-cli/CLAUDE.md` "Session Forking" section).
- Local-mode and remote-mode launchers are different code paths (`claudeLocalLauncher.ts` vs `claudeRemoteLauncher.ts`); only remote-mode emits `session-fork-resume`.

**Implication:** the source of truth for Claude conversations *survives* happy-cli's lifetime. The catch-up problem is "happy-cli failed to read it," not "the data doesn't exist anywhere."

### Codex — child-process JSON-RPC over stdio or loopback ws

- happy-cli spawns `codex app-server` as a child process and speaks JSON-RPC over either newline-delimited stdio or a loopback WebSocket (`ws://127.0.0.1:<port>`), selected by the `transport` option on `CodexAppServerClient` and adapted via `createStdioTransport` / `createWsTransport` in `packages/happy-cli/src/codex/transport/`. The `connect()` method dispatches on transport, with a sandbox+ws→stdio override for non-Windows sandboxed runs.
- Events arrive only while the child is alive. Lifetime of the child is **transport-dependent**:
  - **stdio transport:** the child is bound to happy-cli's process — when happy-cli exits, the app-server child is killed too (the stdio adapter in `createStdioTransport` does not detach the child, and `disconnectInternal` tears it down).
  - **ws transport:** the child is **detached** at spawn time and the ws-mode `disconnect()` is **preserve-by-default** (see `packages/happy-cli/CLAUDE.md` "Codex Transport Security Model" and "Force-Restart and Termination Invariants" for the full invariant set). A successful `initialize` writes `~/.happy/codex-active-<cwdHash>.json` (per-realpath(cwd) discovery record), and a later `CodexAppServerClient.connect()` in the same cwd will probe-and-reattach to the live app-server rather than spawn a fresh one. Only callers that pass `disconnect({ terminateAppServer: true })` (cleanup, kill-session, tests, force-restart through `reconnectAndResumeThread`) actually invoke `closeWsChild` and tear the backend down.
- Codex's underlying binary persists conversation rollouts to `~/.codex/sessions/...` independently (via the `persistExtendedHistory: true` flag passed during `newConversation` in `codexAppServerClient.ts`), but happy-cli does not read those rollout files.
- happy-cli stores `metadata.codexThreadId` server-side after thread start (`runCodex.ts`); resume via `happy resume <id>` re-attaches a fresh app-server to the same thread (`resumeExistingThread.ts`).

**Implication:** the source of truth for Codex conversations is **transport-dependent**. Under stdio it dies with happy-cli's process, so "miss events while offline" can't happen because there's no event stream when happy-cli isn't running. Under ws the detached app-server can outlive a foreground happy-cli exit and keep emitting events into the void until reattached on the next `CodexAppServerClient.connect()` in the same cwd — meaning the ws path has its own gap shape (events emitted during the no-client window are not buffered by the producer side). The actual gap per transport is different — see below.

---

## Verified findings (file:line)

These claims were independently verified by two lenses (general-purpose Agent + Codex). All cite specific file:line evidence.

### Claude offline-catchup gap

| Claim | Verdict | Evidence |
|---|---|---|
| `processedMessageKeys` is in-memory only (resets on restart) | ✅ TRUE | `packages/happy-cli/src/claude/utils/sessionScanner.ts:35` (function-local Set, fresh per `createSessionScanner` invocation). No persistence in `packages/happy-cli/src/persistence.ts`. |
| Scanner pre-marks all existing JSONL messages as processed on startup | ⚠️ PARTIALLY TRUE | The pre-marking branch at `sessionScanner.ts:38-43` only fires when `opts.sessionId` is non-null. **Production cold-start callers all pass `null`** (`loop.ts:51-56`, `runClaude.ts:132-136`, `claudeLocalLauncher.ts:24`). So the branch doesn't fire on a fresh CLI restart. |
| Offline Claude messages are lost because of pre-marking | ❌ FALSE (wrong mechanism, right outcome) | Offline messages DO get lost, but NOT because of pre-marking. **The actual reason:** the scanner only enumerates sids registered via Claude's `SessionStart` hook — i.e., sids belonging to a Claude-Code instance happy-cli launched. A bare `claude` invocation outside happy-cli writes to its own JSONL with a sid happy-cli never learns about. The orphan JSONL is invisible to the scanner. There IS a `claudeFindLastSession.ts` that enumerates project-dir JSONLs, but it's only used to resolve `--continue`/`--resume` flag values — NOT wired into the scanner. |
| `claude --resume` while Happy offline → no retroactive `session-fork-resume` | ⚠️ PARTIALLY TRUE (worse than initially stated) | Per `CLAUDE.md` "Session Forking", `--resume` creates a NEW JSONL with a NEW sid. The fork-resume emit is only on the **remote** path (`claudeRemoteLauncher.ts:363-375`, gated by live `system.init` SDK message at `claudeRemote.ts:190`). **Local mode does NOT emit `session-fork-resume` AT ALL**, even when Happy IS running and the fork happens live. |
| Server dedups by wire/realID and allocates monotonic seq | ❌ HALF FALSE | Per-session seq IS correct (`packages/happy-server/sources/storage/seq.ts:20-44`). But **server dedups by `localId`, not realID** (`v3SessionRoutes.ts:127-160`, `prisma/schema.prisma:121-128`). And `localId = randomUUID()` per `enqueueMessage` call (`apiSession.ts:402-412`). **Re-forwarding the same JSONL line on a later run creates a server-side duplicate.** |
| No on-disk catch-up state in happy-cli | ✅ TRUE | `persistence.ts` only stores Settings, Credentials, DaemonLocallyPersistedState. `pendingOutbox` is in-memory (`apiSession.ts:131`). `lastSeq` is in-memory (`apiSession.ts:130`) and only used for inbound user-message replay. No symmetric outbound catch-up endpoint on the server. |

**Synthesis for Claude:** the bare-`claude`-while-Happy-offline scenario produces messages that are stored on disk (Claude writes its JSONL) but completely invisible to happy-cli on restart. Even if happy-cli were taught to enumerate orphan JSONLs, naive re-forwarding would create server-side duplicates due to random-localId dedup.

### Codex offline-catchup gap

| Claim | Verdict | Evidence |
|---|---|---|
| Codex uses a JSONL tailer like Claude | ❌ FALSE | Codex uses JSON-RPC with a `codex app-server` child over either a loopback WebSocket (default) or newline-delimited stdio (fallback), wired through `createWsTransport` / `createStdioTransport` and dispatched by `CodexAppServerClient.connect`. No tailer. Grep for `scanner|tail|watcher|jsonl` under `src/codex/` returns no matches. |
| "Happy offline during Codex activity" loses messages | ⚠️ TRANSPORT-DEPENDENT | **stdio:** N/A by construction — if happy-cli isn't running, no `codex app-server` child is running either, so there are no events being emitted. **ws:** the detached app-server can outlive happy-cli (preserve-by-default `disconnect()`; rediscover via `~/.happy/codex-active-<cwdHash>.json`) and continues to consume turns; events emitted while no ws client is attached are not producer-buffered, so they are lost from happy-cli's perspective even though the backend kept running. See `packages/happy-cli/CLAUDE.md` "Codex Transport Security Model" + "Force-Restart and Termination Invariants" for the discovery/reattach contract. |
| happy-cli crash mid-turn loses in-flight events | ❌ TRUE (real Codex gap) | Events emitted by the app-server child between the last successful socket forward and happy-cli's exit are lost. The `pendingOutbox` is in-memory only. **stdio:** SIGTERM/SIGKILL kills the child too (see `CodexAppServerClient.disconnectInternal` and the stdio teardown in `createStdioTransport`). **ws:** only `disconnect({ terminateAppServer: true })` tears the child down; bare `disconnect()` preserves it and a fresh happy-cli in the same cwd reattaches via the discovery file. The crash-mid-turn loss is therefore narrowed under ws to "events the live ws client did not receive before the foreground process died" — the backend itself survives. |
| External `codex` invocation (no Happy) ever ingested | ❌ FALSE | Architecturally impossible without a new code path. happy-cli has zero code to enumerate `~/.codex/sessions/...` rollout files. The daemon's session map is in-memory and only tracks happy-cli–launched processes (`daemon/run.ts:188-198`). |
| Resume via `happy resume <id>` works for Codex | ⚠️ PARTIALLY | Forward-only resume via `metadata.codexThreadId` (`runCodex.ts:548-558`, `resumeExistingThread.ts:29`). **Pre-resume gap is not backfilled.** No code reads Codex's own `~/.codex/` rollout files to fetch historical turns. |

**Synthesis for Codex:** the equivalent gaps are (a) crash-mid-turn loses any unsent events (in-memory `pendingOutbox` dies with the process), (b) bare `codex` runs are permanently invisible, (c) resume is forward-only with no backfill of pre-resume gap.

### Cross-agent comparison

| Failure mode | Claude | Codex |
|---|---|---|
| Happy offline + agent CLI continues | ❌ Lost (orphan JSONL not enumerated) | ⚠️ Transport-dependent — stdio: N/A by construction; ws: detached child can outlive happy-cli, but events emitted with no ws client attached are not producer-buffered |
| happy-cli crash mid-turn → in-flight events | ⚠️ JSONL still on disk; not replayed on restart | ❌ Lost (in-memory outbox dies); under ws the backend survives via preserve-by-default `disconnect()` and rediscovery, but events not yet received by the dying ws client are still lost |
| External CLI invocation (bare `claude`/`codex`) | ❌ Invisible (architectural; orphan JSONLs reachable in principle on disk) | ❌ Invisible (architectural; rollouts unreached) |
| Resume after restart | ⚠️ Forward-only via `metadata.claudeSessionId` | ⚠️ Forward-only via `metadata.codexThreadId` |
| `session-fork-resume` boundary on `--resume` | ⚠️ Remote-mode only | N/A (different fork semantics; rollback uses `thread/rollback` per `codex-rewind-thread-rollback-fork.md`) |

---

## Brainstorm history

Three rounds of brainstorm-with-ralph led to this document. Capturing the decision tree.

### Round 1 — streaming-pagination scroll-jump root cause

The trigger event was a UI snap-back when scrolling to a specific message. Three lenses (Devil's Advocate, Codex, Copilot) converged on a multi-cause root: D-001 boundary-key flip + eviction; D-002 MVCP anchor unmount; D-003 live-tail re-sort instability. Implementations of D-001 and D-003 + a separate Phase 5 reducer dedup fix shipped same-day.

**Outcome:** Five bugs fixed. But the post-mortem question — "is the architecture amplifying complexity, or is this just regression debt?" — was unanswered.

### Round 2 — sync architecture audit

Asked whether Happy should redesign the sync pipeline to fix the bug-class amplifier. Lenses produced three directions:

- **D-001 (recommended, 3-lens consensus):** don't refactor; pay regression debt with three property tests (mergeOlderMessagesIntoSession seq/createdAt fuzz, reducer idempotency, typesRaw Skill-body fixture). ~3 days.
- **D-002 (Codex + Copilot):** producer canonical event log + agent-native projection under shared primitives. CLI emits richer encrypted envelopes with `sourceOrdinal` / boundary lifecycle / tool lifecycle, keeping plaintext encrypted. Reducer becomes deterministic projection over typed events. Multi-month effort.
- **D-003 (Codex + Copilot, all 3 flag highest-regret-if-rolled-back):** server-side canonical reducer. Rejected on E2EE grounds — requires either decrypt-on-server (kills the self-hosted-Windows-service rationale) or richer envelope leaking role/type/tool metadata.

**Outcome:** D-001 recommended as the cheapest credible path. D-002 carved out as the structural option to revisit after the test layer is in place.

### Round 3 — cost-blind ideal architecture

Asked: if engineering budget were unlimited, what's the IDEAL sync architecture? Lenses split:

- **D-001 (Codex + Copilot):** mesh-first CRDT session graph with encrypted relay (Yjs/Automerge). Devil's Advocate pushed back hard with concrete production failure modes: NAT traversal complexity (TURN = the server we just rebuilt), mobile sleep arbiter requirement, BOOX cold-start cost on 30k-message conversation, conversation events are non-mergeable forks (`session-fork-resume`), Yjs E2EE is experimental.
- **D-002 (Codex + Copilot):** Happy-native agent protocol as canonical source. Each agent CLI emits Happy-native `SessionEnvelope` events directly; JSONL becomes import/debug evidence only. **Already 60% in flight** via existing per-CLI mappers. Eliminates format-drift bug class by construction.
- **D-003 (Codex + Copilot):** producer-side canonical projection with verifiable WASM reducer. DA's blocker: producer-CLI can't see all writes (phone-typed messages, cross-device updates).
- **D-004 (DA-only):** stay + maximum invariants. DA argued the IDEAL architecture might literally be the current one + maximum invariant guards (round 2's D-001 is not a compromise, it's optimal). Every architectural alternative imports a permanent forever-tax that unlimited migration budget doesn't pay.

**Outcome:** No single recommendation; the four optimize for different things. Each direction wins on a different dimension. DA's recurrence-rate test: track today's 5 bug classes for 90 days; if zero recurrences, D-004 is vindicated; if any recurrence, structural critique earns weight.

### Round 4 — offline-catchup verification

Triggered by the maintainer's direct question: *"what about cases the cli continues the conversation without happy active and then happy is active on the same conversation? how in these cases can we sync the conversations so they are fully available with the right history?"*

Two independent verifiers (general-purpose Agent + Codex) confirmed the gap shape per agent (above tables). The maintainer narrowed scope to Claude + Codex only.

---

## Candidate solutions

The offline-catchup work fits into two of the round-3 directions; how it interacts depends on which path is chosen.

### Under D-004 (stay + invariants — maintainer's likely default)

Ship per-agent fix bundles. Two separate efforts because the architectures differ.

#### Claude fix bundle

| Fix | Description | Effort | File touchpoints |
|---|---|---|---|
| **C-1: Persisted scanner offsets** | Store `lastForwardedMessageKey` per `(claudeSessionId)` on disk under `~/.happy-dev/state/scanner-<sid>.json`. On startup, re-forward all JSONL lines past that offset rather than suppressing them. | M (~3 days) | `sessionScanner.ts`, `persistence.ts` (new schema) |
| **C-2: Cold-start orphan-JSONL enumeration** | On happy-cli startup, scan the project directory for JSONL files whose summary line references a sessionId Happy already knows. Wire `claudeFindLastSession.ts` into the scanner. When found, emit `session-fork-resume` retroactively via `sendContextBoundary`. | M (~3 days) | `sessionScanner.ts`, `claudeFindLastSession.ts`, `apiSession.ts` |
| **C-3: Local-mode `session-fork-resume` parity** | Move the boundary emit logic from `claudeRemoteLauncher.ts:363-375` into a shared helper called from both `claudeLocalLauncher.ts` and `claudeRemoteLauncher.ts` `onSessionFound`. | S (~1 day) | `claudeLocalLauncher.ts`, `claudeRemoteLauncher.ts`, new shared helper |
| **C-4: Deterministic localId for catch-up** | Derive `localId` from `getSessionLogMessageKey(message)` (deterministic per the existing title-event normalization pattern) when forwarding catch-up rather than live. The server's existing `(sessionId, localId)` unique constraint then becomes load-bearing for idempotency. | M (~2 days) | `apiSession.ts`, `sessionProtocolMapper.ts` |

**Total Claude effort:** ~1.5 weeks of focused work. All in `happy-cli`. No server schema change.

#### Codex fix bundle

| Fix | Description | Effort | File touchpoints |
|---|---|---|---|
| **X-1: Durable Happy outbox** | Persist the in-memory `pendingOutbox` queue (`apiSession.ts:131`, flushed at `apiSession.ts:355`) to disk so a happy-cli crash mid-turn doesn't lose unsent events. WAL-style append, truncated on ack. | M (~3 days) | `apiSession.ts`, `setupOfflineReconnection.ts`, new persistence file |
| **X-2: Codex thread history import on resume** | When happy-cli does `happy resume <codexThreadId>`, before re-attaching the live app-server, query the app-server (or read `~/.codex/sessions/`) for any historical events not yet on the Happy server. Backfill via `mapCodexMcpMessageToSessionEnvelopes`. Forward-buffer protection so the import + live stream don't race. | L (~1-2 weeks) | `codexAppServerClient.ts`, `runCodex.ts`, `resumeExistingThread.ts` |
| **X-3: Local cache of `codexThreadId`** | Today the thread ID is only stored server-side in encrypted metadata. If the server is unreachable, resume fails. Add a local cache under `~/.happy-dev/state/codex-threads.json` keyed by `(workdir, lastThreadId)`. | S (~1 day) | `persistence.ts`, `runCodex.ts` |
| **X-4: External codex-rollout enumeration** *(stretch)* | Read `~/.codex/sessions/` on startup; surface threads happy-cli doesn't know about as "orphan threads" in the daemon doctor output. Optionally offer `happy adopt-codex-thread <id>` to import. **Decision pending — see open question 4 below.** | XL (~2-3 weeks) | New `~/.codex/` reader; daemon enhancements |

**Total Codex effort (X-1..X-3):** ~2-3 weeks. X-4 is a separate decision.

#### Combined D-004 effort

~5-6 weeks for full Claude + Codex parity (excluding X-4). Server-side changes: zero.

### Under D-002 (Happy-native canonical protocol)

Push the impedance match upstream. happy-cli emits `SessionEnvelope` events directly to its own encrypted append-only WAL on disk; the server is purely an encrypted relay; the app reads from the WAL. Single offline-catchup story for ALL agents (Claude + Codex + future). Effort: multi-month, schema-changing, but absorbs all four Claude fixes and all four Codex fixes into one unified producer architecture.

### Hybrid option

Ship D-004's Claude fix bundle (it's mostly self-contained and high-value) immediately, then revisit D-002 as a longer-term direction. Codex fixes can be deferred behind X-1 (the durable outbox) which is the only Codex fix that's purely defensive.

---

## Open questions

1. **Recurrence threshold for re-opening the architectural decision.** DA's round-3 framing: track the 5 bug classes from 2026-04-29 over 90 days. Zero recurrence → D-004 is vindicated. Any recurrence → structural critique (D-002) earns weight. **Should the offline-catchup work itself count toward this rate?** It surfaced as a reactive answer to the user's question, not as a new bug. Lean: no, it's a pre-existing latent gap, not a regression.

2. **Should the catch-up state be keyed by Claude sid, Happy server session id, working directory, or all three?** Codex round-2 verifier raised this. Today's `metadata.claudeSessionId` is per-Happy-session. If `(workdir, claudeSessionId)` is the key, multi-machine scenarios get cleaner.

3. **Idempotent localId derivation strategy.** The deterministic localId fix (C-4) needs a strategy for what `getSessionLogMessageKey(...)` returns. Today it's used for in-memory dedup. Making it the wire-level identity for Happy server dedup is a stronger contract — does the existing helper produce values stable across CLI restarts? Across Claude Code versions? Across `--resume` re-keying?

4. **External CLI runs (Claude or Codex) outside Happy: in scope or not?** Today both are invisible. C-2 makes external Claude runs visible (orphan JSONL enumeration). X-4 would make external Codex runs visible (rollout file enumeration). Both are XL effort and there's a UX question — when Happy "adopts" a CLI session that wasn't started under it, who owns it? **Decision lever:** if the maintainer's workflow includes running `claude`/`codex` outside Happy frequently and wanting them to show up, in scope. If they always start through `happy claude` / `happy codex`, out of scope.

5. **Boundary emission for `--resume` retroactive backfill.** When C-2 detects an orphan JSONL with a summary line referencing a known sid (i.e., `claude --resume <oldSid>` was run while Happy was offline), the new JSONL contains the entire prior history rewritten under a new sid. Should happy-cli emit `session-fork-resume` retroactively (preserving the link), OR forward only the genuinely-new tail (treating the rewritten history as duplicates)? The first preserves UX expectations; the second avoids re-forwarding ~hundreds of messages with deterministic localIds (which would be no-ops via dedup but generate write traffic).

6. **Crash-vs-restart semantics for X-1's durable outbox.** Should the WAL persist across happy-cli `daemon stop && daemon start` (a clean shutdown), or only across crashes? Clean shutdown could flush the in-memory outbox synchronously before exit; crashes can't.

7. **Server-side support — do we need any?** The offline-catchup fixes work entirely on the producer side IF we accept "re-forwarding deterministic-localId messages is idempotent due to existing `(sessionId, localId)` unique constraint." That constraint exists today (`prisma/schema.prisma:121-128`). No server changes needed. **But** if we ever want a "what's the server's last-known seq for this session?" endpoint as a sanity check, that would require a new server route. Defer until we observe the producer-side fix isn't enough.

---

## Decision criteria

When the next planning pass asks "ship per-agent D-004 fixes vs. start D-002 migration":

**Ship D-004 fixes if:**
- Recurrence rate of the 5 bug classes over 90 days is zero.
- The offline-catchup gap is the only multi-week structural issue surfaced.
- Maintainer values "no new architectural surface" (single-maintainer cadence).

**Start D-002 migration if:**
- Any of the 5 bug classes recurs in a different file/component.
- A second multi-week structural gap surfaces (e.g., display-state coherency across devices, or a Codex-thread-vs-Claude-session reconciliation issue).
- Multi-agent (Claude + Codex + future) becomes the dominant traffic and per-agent fix bundles are accumulating duplicate work.

**Hybrid (recommended default):** ship D-004's Claude fix bundle (C-1 through C-4) immediately — it's high-value and self-contained. Ship X-1 (Codex durable outbox) as defensive measure. Defer X-2/X-3/X-4 and D-002 until a second multi-week gap surfaces.

---

## Related docs

- `docs/plans/codex-rewind-thread-rollback-fork.md` — Codex `thread/rollback` + `thread/fork` primitives (separate from offline catch-up but lives in the same producer-side rewind/resume design space).
- `docs/plans/codex-app-server-migration.md` — broader Codex app-server architecture context.
- `docs/plans/session-protocol-impl.md`, `docs/plans/session-protocol-unification-v2-draft.md` — the wire envelope contract that any D-002-style change would extend.
- `docs/plans/streaming-pagination.md` — round 1 brainstorm's parent document; the three-extent rule and prefetch invariants documented there are still load-bearing under any solution path.
- `docs/plans/synthetic-xml-tags-future-coverage.md` — adjacent to the Skill-body and task-notification bugs from 2026-04-29.
- `docs/fork-notes.md` — the "Claude Code injections that are NOT XML tags" subsection captures the same bug-source pattern.
- `packages/happy-app/CLAUDE.md` — three-extent rule, MVCP invariants, sync reducer contracts.
- `packages/happy-cli/CLAUDE.md` — Session Forking semantics (`--resume` creates new sid, complete history rewrite), wrapped-slash-command detection, hook settings.

---

## Lens output preservation

Full lens outputs (Devil's Advocate, Codex, Copilot) for each brainstorm round live in their respective `.ralph/jobs/.staging/` directories. They are NOT summarized verbatim in this document — only the synthesis is. If a future planning pass needs the raw arguments (e.g., DA's specific failure modes for P2P/CRDT), read them at:

- Round 2: `.ralph/jobs/.staging/20260430T022832Z-444607/{devils-advocate,codex,copilot}-brainstorm.txt`
- Round 3: `.ralph/jobs/.staging/20260430T023844Z-r3-445496/{devils-advocate,codex,copilot}-brainstorm.txt`
- Claude verification: `.ralph/jobs/.staging/20260430T030309Z-verify-446370/codex-verify.txt`
- Codex verification: `.ralph/jobs/.staging/20260430T031442Z-codex-verify-447311/codex-codex-verify.txt`

Verifications come back as JSON with `directions[].change_surface` arrays naming exact files — a future planner can drop those directly into a PRD.
