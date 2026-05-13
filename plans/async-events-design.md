# Async events for codexu — design

*Design doc — 2026-05-13. Output of `/plan-with-ralph "async-events-design"`. No code; the doc IS the deliverable. Cross-references [[channels-research]] and the V row in [[parallel-assignments]].*

> **TL;DR.** A long-running agent today can only learn about an async event by **exiting and being re-spawned**. That's wasteful (context loss + restart latency) and coarse (can't subscribe to fine-grained kinds). The cheapest path to real subscription is a **two-stage** plan: (1) **A0 — long-poll v0**: a producer-side event hub in `packages/happy-cli/` exposed to codex as a Node stdio MCP server (folded into the existing `happyMcpStdioBridge.ts`) with `async_events_{subscribe,wait,list}` tools — **zero codex upstream changes**, ships in ~2–3 d, covers U1/U2/U4 immediately and U3a (explicit-wait) via the existing `wait_agent`. (2) **A1 — push bridge**: land [[channels-research]] §6.1's `EventMsg::McpServerNotification` so the same producers can flip from agent-polled to agent-passive between turns; ~3–5 d wall, one overlay crate + two small upstream seams. **U3b (passive sibling notification)** is explicitly **out of v1** and named as a deferred A2 follow-up. Cross-device fan-out (5.d) is **out**, post-v1. The doc surfaces three operator decisions (§7) that must be answered before any follow-up implementation ralph job is filed.

---

## 0 · Why the current model is bad

The status quo for "agent reacts to an external event": a separate process (cron, hook, watcher) **kills the codex session and spawns a new one** with a fresh prompt describing the event. Concretely:

- **Context loss.** Conversation history that wasn't yet committed to a resume marker is gone — the new session starts cold with whatever the prompt-author chose to include.
- **Restart latency.** A fresh `codex app-server` boot + WS handshake + model first-token is on the order of **2–10 s** in practice. Multiply by N events.
- **No fine-grained subscription.** "Fire when a commit lands on `main`" degenerates to "fire on every `.git/` mtime tick" because the wake-up mechanism has no predicate; the agent re-runs and re-checks, paying for false wakes.
- **Hard to compose.** "Wake when *any* of [git-on-main, sibling-finished, timer]" requires N watcher processes each capable of spawning a session.
- **Loses ordering.** Two events firing in quick succession lose their relative order through the spawn-and-discard pattern.

The design below replaces this with a **persistent in-session subscription** without changing how an agent runs in the common case.

---

## 1 · Use cases (the four the operator named)

| # | Use case | Producer (today) | Typical latency budget | False-wake cost |
|---|---|---|---|---|
| **U1** | **Git event** — commit on `main`, branch updated, push to remote | `git fsmonitor` / `inotify` on `.git/refs/` / `git ls-remote` poll | 1–5 s after the ref moves | High — `.git/` churns on every IDE index, `git status` from another shell, pre-commit hooks. **Must filter server-side on ref-SHA transition.** |
| **U2** | **Periodic-task firing** — every N min / cron expr | OS scheduler / in-process timer | seconds | Low — producer-controlled, no spurious fires |
| **U3a** | **Inter-agent — explicit wait** (agent calls `wait_agent` and blocks until sibling sends/closes) | codex `multi_agents_v2` mailbox (`core/src/tools/handlers/multi_agents_v2/{spawn,send_message,wait,close_agent,followup_task,list_agents,message_tool}.rs`) | sub-second | Low — explicit producer |
| **U3b** | **Inter-agent — passive notification** (sibling finishes / asks a question; agent learns *without* having called `wait_agent`) | Same mailbox seq-watch, but no bridge to `tx_event` today | sub-second | Low | **OUT OF v1 (deferred A2)** |
| **U4** | **File-system event** — file created/modified/deleted under cwd | `notify` crate / `chokidar` / `fs.watch` | 1–3 s with debounce | **Very high** — `node_modules/` write storms, build artifacts, `.git/` itself. **Must debounce + glob-filter server-side.** |

**Cross-cutting requirements** that any design must meet:

- **Between-turns delivery, not mid-LLM-call preemption.** Match Claude Code's channels semantics and codex's mailbox preempt point ([[channels-research]] §1.4). Hard mid-call cancellation is a different, multi-week project.
- **Backpressure-safe.** A chatty fs watcher under a `node_modules/` write storm must not stall the rmcp service loop or fill `tx_event`. Per-source token bucket + drop-with-counter; default conservative (e.g. 50 events/s/source).
- **Auth: session-local only in v1.** Producers must inherit session trust — Node-stdio MCP server spawned by happy-cli alongside the session (the existing `happyMcpStdioBridge.ts` path). **No HTTP/WS-transported watchers in v1** (foot-gun: any localhost process can wake any agent).
- **Replay across restart: best-effort, per-producer.** Producers expose a query API so the agent can re-poll on resume. **No durable cross-restart subscription queue in v1.** Per-producer semantics (see §6.4):
  - Git: re-derive from current ref SHA vs persisted last-seen SHA — fully recoverable.
  - Timer: recompute missed schedule slots from persisted last-fire timestamp.
  - Fs: **best-effort, no replay** — fs storms cannot be deterministically reconstructed. Agent re-scans on resume if it cares.
  - U3a (inter-agent): codex's existing mailbox already handles this; out of scope here.
- **Lifecycle teardown.** Watchers/timers/subscriptions are session-scoped. They must be torn down on: codex backend exit, happy session close (`happyServer.stop()` at `packages/happy-cli/src/codex/runCodex.ts:494`), MCP disconnect, and daemon shutdown. Long-running watchers MUST NOT outlive their owning session. v1 acceptance includes a teardown fixture.

---

## 2 · Current options in Claude Code (what we can copy)

Claude Code is the most mature reference. Its agents *do* awaken to async events mid-session, using three composable primitives. Cited from `D:/harness-efforts/claude-code/worktrees/main/`:

### 2.1 Tick-driven polling + priority command queue

- `src/utils/messageQueueManager.ts:40–51` — unified queue with three priorities: `'now' > 'next' > 'later'`. Anything async drops in here.
- `src/cli/print.ts:1845–1854` — the agent's main loop emits a `<tick>` prompt with `priority: 'later'` every iteration (effectively `setImmediate`), creating a between-turn wake point.
- Per-turn, the agent reads the queue. `priority: 'next'` messages run before the user's next input; `'now'` interrupts.

This is **the** wake mechanism. Everything else feeds into it.

### 2.2 MCP channel notifications (the precedent for §3)

- `src/services/mcp/channelNotification.ts:37–47` — `notifications/claude/channel` schema. Server pushes `{ content, meta? }`; handler wraps as `<channel source="…">…</channel>` and enqueues with `priority: 'next'` ([[channels-research]] §1.2).
- Gated by `experimental["claude/channel"]` capability + a multi-tier auth stack (`channelNotification.ts:191–316`).
- **Does not preempt mid-LLM-call.** Channels arrive *between* turns. Claude Code does **not** offer hard interrupt of an in-flight model call.

### 2.3 Cron scheduler + async hook registry

- `src/utils/cronScheduler.ts:40–120` — `.claude/scheduled_tasks.json` watched via chokidar; on fire, calls `onFire(prompt)` which enqueues with `priority: 'next'`. 1 s check interval, lock-based takeover, daemon mode supported.
- `src/utils/hooks/AsyncHookRegistry.ts:30–83` — registers long-running hook processes; `checkForAsyncHookResponses()` is polled every turn (line 113), and `getAsyncHookResponseAttachments()` (`src/utils/attachments.ts:3464–3518`) converts completed hooks to attachments injected before the next turn.
- `src/utils/hooks/fileChangedWatcher.ts:1–80` — chokidar-based fs watcher fires `FileChanged` hooks. Fires *synchronously*; the agent picks up the hook output on the next tick.

### 2.4 Sibling-agent completion

- `src/utils/attachments.ts:3520–3539` — file-based **mailbox** for swarm/teammate sessions; `useInboxPoller` polls between turns and surfaces messages as attachments. Polling, not push.
- Background tasks via `BashTool(run_in_background)` are tracked in `LocalShellTask`; `TaskOutput.getStdout()` is polled.

### 2.5 What's missing in Claude Code (and worth noting)

- **No dedicated "wait for arbitrary X" tool.** `SleepTool` exists (`src/tools/SleepTool/prompt.ts:7–17`) and emits ticks, but it's a fixed-duration sleep, not a subscription primitive.
- **`MonitorTool` is stubbed `null`** (`src/tools/MonitorTool/MonitorTool.ts:1`) — not available in the agent's tool registry.
- **No general "idle" / "wakeup" hook event** in `src/utils/hooks/hookEvents.ts` — only fixed lifecycle hooks (`SessionStart`, `Stop`, `PostToolUse`, etc.).
- File/git watchers trigger synchronous hooks *outside* the agent loop; the agent learns about their effect only via the next-tick attachment collection.

**Bottom line for codex parity:** the proven primitive is **MCP-push-into-priority-queue plus a between-turn tick**. The MCP server-side delivery surface is what we need to clone. Cron and file-watch *consumers* in Claude Code are app-side; codex equivalents will live in `happy-cli`.

---

## 3 · Current options in codex (what already exists)

READ-ONLY survey of `codex/external/repos/codex-patched/codex-rs/` per the minimize-conflict-surface tenet ([[codexu-roadmap]] §"minimize upstream conflict surface", lines 190–228).

### 3.1 Hooks — synchronous taps only

- `config/src/hook_config.rs` (`HookEventsToml` enum) — `PreToolUse`, `PostToolUse`, `PreCompact`, `PostCompact`, `SessionStart`, `UserPromptSubmit`, `PermissionRequest`, `Stop`.
- `core/src/hook_runtime.rs:104–344` — `async fn run_*_hooks()` wrappers fire at the named lifecycle points.
- `app-server-protocol/src/protocol/v2/hook.rs:31–33` — `ExecutionMode::{Sync, Async}` exists, but "async" only describes how the hook **command** runs, not when it **fires**. Triggers are still synchronous lifecycle gates.

**Verdict:** codex hooks are the inverse of what we need. They observe codex's own lifecycle, not external events. They are not a candidate for U1/U2/U4 and add nothing for U3.

### 3.2 Inter-agent fast path — already preempt-safe

- `core/src/tools/handlers/multi_agents_v2/spawn.rs` — spawn entry; child runs in a sibling session with its own `tx_event`.
- `core/src/tools/handlers/multi_agents_v2/send_message.rs` — agent A → agent B's session **mailbox** (in-memory, session-scoped, not durable).
- `core/src/tools/handlers/multi_agents_v2/wait.rs` — blocking `wait_agent` tool: subscribes to `mailbox_seq` (a `tokio::sync::watch::Receiver<u64>` per session), `tokio::select!` with `timeout_at`. Polling-but-fast: any mailbox enqueue increments the seq and wakes the receiver.
- `protocol/src/protocol.rs` — `InterAgentCommunication { …, trigger_turn }` carries the wire shape.

**Verdict:** U3 (inter-agent) is **already solved** for the "explicit wait" case. The remaining gap is "passive notification" — sibling finished but I didn't call `wait_agent`. That's solvable in v2 by emitting an `EventMsg::SiblingAgentEvent` whenever the mailbox-seq watch ticks, but in v1 the existing `wait_agent` covers the use case if the agent is willing to block. **Recommendation: do NOT route U3 through the new MCP bridge.** Latency regression, lock-reentry risk, and the existing path is good.

### 3.3 MCP — bidirectional transport, logging-only handlers

Full inventory in [[channels-research]] §2. Summary:

- `rmcp-client/src/logging_client_handler.rs:49–135` — all seven MCP server→client notifications (`progress`, `cancelled`, `resources/updated`, `resources/list_changed`, `tools/list_changed`, `prompts/list_changed`, `message`) are decoded and **dropped into `tracing::info!`**. No bridge to the agent.
- `codex-mcp/src/elicitation.rs:103–231` — the working **bidirectional precedent**: `ElicitationRequestManager` emits `EventMsg::ElicitationRequest` over `tx_event: async_channel::Sender<Event>` and registers a `tokio::sync::oneshot::Sender` for the reply.
- `codex-mcp/src/connection_manager.rs:175` — `tx_event` is already plumbed into the manager constructor; only currently used for `McpStartupUpdate` / `McpStartupComplete` and elicitation.
- `rmcp-client/src/in_process_transport.rs` — **in-process duplex transport already exists**. This is the cheap path for the v1 watcher: no stdio child, no network, no auth surface — just a `Service` impl over a Tokio `DuplexStream`.

[[channels-research]] §6.1 is the design for bridging the seven existing handlers into `tx_event` via an `EventMsg::McpServerNotification` variant; effort ~3–5 d wall.

### 3.4 App-server protocol — unidirectional, no subscription

- `app-server-protocol/src/protocol/v2/notification.rs` defines `DeprecationNoticeNotification`, `WarningNotification`, `ErrorNotification`, `ServerRequestResolvedNotification`. All **server → client only** (one-way).
- `app-server-transport/src/outgoing_message.rs:22–31` — `OutgoingMessage::{Request, AppServerNotification, Response, Error}`. No `Subscribe`/`InjectEvent` variant.
- `app-server/src/fs_watch.rs:1–100` — there IS a `FsWatchManager` (debounced, 200 ms) that emits `FsChangedNotification`, but it's a **client-facing surface** (consumed by an external client over the app-server protocol, not by the in-session agent). The agent's `tx_event` is not on the consumer side of this.
- `app-server/src/mcp_refresh.rs` — handles `notifications/tools/list_changed` but only to re-enumerate the tool registry; doesn't surface to the agent loop.

**Verdict:** the app-server protocol is the wrong layer for U1/U4. Adding a `thread/subscribeEvents` or `thread/injectEvent` RPC would be a bigger seam (protocol bump + permission gating + happy-cli wire change) and **only fires when an app-server client is attached**. That's wrong for headless / TUI / detached daemon mode. Defer to v2 for cross-device fan-out only.

### 3.5 Other facilities surveyed (and why they don't help)

- **Background-task primitives** — `unified_exec/await_background_completion.rs` is **polling-based**: agent calls `await_background_completion(session_id, timeout_ms)`. Not a push channel.
- **Long-poll / streaming tool results** — none. Tools return a single `ToolOutput`. The `ExecCommandOutputDelta` event stream is emitted *while* a tool runs but isn't a generic async-event transport.
- **No `inotify`/`watchexec`/git watchers in codex core** — `notify` crate isn't a dependency of `codex-core`. `fs_watch.rs` in app-server is the only fs watcher and it's client-facing.

### 3.6 Cheapest seam point

Two candidates ranked by minimize-conflict-surface cost:

| Seam | Conflict surface | Reach | Latency | Effort |
|---|---|---|---|---|
| **A — MCP notification bridge** (channels-research §6.1) | 2 upstream files, ~12 + ~30 lines additive ([[channels-research]] §6.1.2–6.1.3); overlay crate carries the bulk | In-session, MCP-server-side producers | ms (in-process duplex transport) | 3–5 d |
| B — App-server `thread/injectEvent` RPC | New protocol variant + new processor + happy-cli wire change | Only when app-server attached; protocol-versioned | ms over WS | 2–3 d but bigger blast radius |

**Choose A.** B is reserved for v2 cross-device fan-out where in-process MCP doesn't apply.

---

## 4 · Codexu's current state (the constraints layer)

READ-ONLY survey of `D:/harness-efforts/codexu/packages/`.

### 4.1 What codexu has

- **`packages/happy-server/sources/app/events/eventRouter.ts`** — Socket.IO fan-out with rooms (`user:<id>:session:<sid>`, `user:<id>:machine:<mid>`), ring-buffer replay (1024 events), persistent vs ephemeral split. Single-user daemon mode per Sprint A.
- **`packages/happy-cli/src/api/apiMachine.ts:151–241`** — registered RPCs: `spawn-happy-session`, `spawn-in-worktree`, `fork-into-worktree`, `stop-session`. **No inter-session inbox RPC** today.
- **`packages/happy-cli/src/api/apiSession.ts`** — session has `pendingOutbox`, `pendingMessages`, `agentState`. No cross-session inbox.
- **`packages/happy-cli/src/codex/runCodex.ts`** — starts codex app-server client, drives `sendTurnAndWait`, wires Happy MCP bridge.
- **`packages/happy-cli/src/codex/happyMcpStdioBridge.ts`** — already exposes Happy MCP tools to codex over stdio. **This is the natural place to add an async-event MCP server-side.**
- **`packages/happy-cli/src/claude/utils/startHappyServer.ts`** — current local MCP server only exposes `change_title`. Thin; easy to extend with notification emission.
- **`packages/happy-cli/src/modules/watcher/startFileWatcher.ts`** — wraps `fs/promises.watch` for a single file, restarts after errors. **Existing primitive** to build U4 on top of.
- **`packages/happy-cli/src/claude/utils/startHookServer.ts:1–210`** — wraps Claude hooks with an HTTP server (`/hook/session-start`, `/hook/stop`, `/hook/user-prompt-submit`, `/hook/notification`). **No analogue exists for codex** — codex's hooks are config-file-driven and don't speak HTTP.

### 4.2 What codexu does **not** have

- **No periodic-task scheduler.** No cron, no daemon-side timer that spawns sessions on a schedule. The "periodic background task that exits to wake the operator/agent" describes a *future* model, not present code. U2 is greenfield.
- **No inter-session inbox.** Sessions cannot enqueue messages for each other. Sibling-agent completion is not signaled to other sessions today (only `session-end` Socket.IO event to the mobile app via `eventRouter`).
- **No git-event watcher.** Git status is queried on-demand (`forkSession.ts:117,136`).
- **No `mcp_servers` declaration in `packages/codexu-plugin/.codex-plugin/plugin.json`.** The plugin ships skills only; MCP wiring lives in happy-cli's runCodex path.

### 4.3 Codexu-specific constraints any design must respect

1. **Single-user daemon.** `eventRouter`'s ring buffer is module-scoped (1024 events, no age eviction). Valid because one daemon per operator. If multi-tenant ever returns, replay buffer must be userId-keyed.
2. **Encrypted state.** Message bodies, metadata, `agentState` are TweetNaCl-encrypted. Async-event payloads MUST follow the same encryption boundary if they flow through `happy-server`.
3. **Socket.IO rooms are hierarchical.** Fan-out filters: `session-scoped`, `machine-scoped`, `user-scoped`. Cross-session push (Scope B in [[parallel-assignments]] T `agent-comms`) extends this layer.
4. **Codex app-server is opaque to codexu hooks.** No analogue of `startHookServer.ts` exists for codex. Async events delivered to a codex session must come through MCP, the app-server WS protocol, or process spawn — there is no third channel.
5. **Push tokens are per-machine.** Mobile push (`pushNotifications.ts`) is explicit `sendSessionPushEvent()` calls, not event-driven. Out of scope for v1 in-session async events; relevant only for v2 cross-device fan-out.

---

## 5 · Design options compared

Five candidates per the prompt, plus the convergent recommendation in §6.

### 5.a — MCP with 2-way channels (server-push)

> **What it is.** Land [[channels-research]] §6.1: bridge codex's seven existing logging-only notification handlers and the missing `sampling/createMessage` request handler through `tx_event`. Then build *producer* MCP servers in happy-cli that emit notifications for U1/U2/U4.

**Pros**
- Single transport across all four use cases (modulo U3 keeping its mailbox).
- Builds on the elicitation precedent — pattern is proven in codex.
- Overlay-crate-shaped: bulk lives in `codex-rs-overlay/codex-mcp-bridge/`, only 2 upstream seams (~12 + ~30 lines).
- In-process duplex transport (`rmcp-client/src/in_process_transport.rs`) means no stdio child for the watcher — lower latency, no auth surface.
- Between-turns delivery matches MCP semantics out of the box; no preemption design needed.

**Cons**
- Requires the channels-research §6.1 bridge to land *first* — sequential dependency.
- "MCP transport" without producers is half a system. Someone (us) writes one watcher MCP server.
- Replay across codex restart is lost — rmcp connection tears down, queue evaporates. Producers must be queryable for re-poll on resume.

**Effort:** 3–5 d (bridge) + 2–3 d (watcher MCP server in happy-cli) = ~5–8 d wall for all four use cases.

### 5.b — Periodic background task that exits to wake the agent (the current model)

> **What it is.** External scheduler spawns a fresh codex session with an event-describing prompt. The session reads the prompt, acts, exits.

**Pros**
- Trivially implementable today — `happy-cli` already has `spawn-happy-session` RPC.
- No codex upstream changes.
- Crash-safe — every event is a new session; no in-memory state to lose.

**Cons**
- Loses context unless every event prompt is exhaustively self-contained.
- Restart latency: 2–10 s per event.
- No fine-grained subscription — coarse "agent reacts to event" only.
- Doesn't compose — multi-source subscriptions need a meta-scheduler.
- Bad UX for U3 (inter-agent) — the sibling already has the receiving session running.

**Verdict:** **Fallback only.** It's what we have now; the design is to *replace* it for the common case. May still be the right choice for "wake the operator at 9am" style events that target a *human*, not a *running agent*.

### 5.c — Long-poll MCP tool (block until event)

> **What it is.** Agent calls a tool like `async_events_wait({ subscriptionId, timeoutMs })` that blocks on the server side until an event fires or timeout expires.

**Pros**
- **Implementable TODAY** with zero codex upstream changes. MCP tools can block; codex waits.
- Trivially shaped on the agent side: "call tool, get result, continue."
- No new protocol; no `EventMsg` variant; no overlay crate.
- Works under any MCP transport codex already supports (stdio, streamable HTTP, in-process).
- Producer-side (happy-cli) is the same code as 5.a — write the watchers once, expose them either way.

**Cons**
- **Occupies a tool slot and a model turn while waiting.** Not passive background delivery — the agent has to *want* to wait.
- Doesn't compose naturally with "wake on any of N sources" unless the tool itself supports multi-kind subscription.
- Burns context window if events arrive rapidly (each result is a tool-output turn).
- Doesn't help the "I'm doing something else and want to be interrupted" case at all.

**Verdict:** **Excellent zero-codex-patch v0 / fallback.** Worth implementing the *producer* side (the watchers in happy-cli) first; expose long-poll tools immediately; light up the bridge later to flip from active-wait to passive-push **without changing producers**.

### 5.d — Subscription RPC on the codex app-server side

> **What it is.** New JSON-RPC method `thread/subscribeEvents` or `thread/injectEvent` in `app-server-protocol`. External processes (happy-cli daemon) push events into the session via WS; codex routes to `tx_event`.

**Pros**
- Clean architectural layer — async events as a first-class protocol concept.
- Permission model is explicit (RPC auth).
- Can support cross-machine / cross-device delivery if the WS endpoint is reachable.

**Cons**
- **Requires app-server attached to fire.** Headless `happy` CLI runs / TUI / detached daemons go dark. Fundamentally breaks the headless use case.
- Bigger upstream seam: new protocol variant + new request processor + protocol version bump + happy-cli wire change.
- Duplicates what the MCP bridge gives us in-process — at higher cost and worse liveness.
- Auth gating needs design: who's allowed to inject? Today the WS auth is capability-token-per-spawn (Phase 1b); extending to event injection is a security question.

**Verdict:** **Defer to v2** for cross-device fan-out specifically. Not the right primitive for the four in-session use cases.

### 5.e — Hybrid (hooks for in-session, channels for cross-session)

> **What it is.** Use codex hooks for triggers that fire on codex's own lifecycle; use MCP channels for everything else.

**Pros**
- Reuses existing hook surface.

**Cons**
- **None of U1–U4 is a codex lifecycle event.** Hooks fire on `PreToolUse`/`Stop`/`SessionStart` — git/fs/timer/inter-agent don't match any of these. There's nothing for hooks to do here.
- Adds confusion to a design that already has a clear answer.

**Verdict:** **Reject.** Hooks are the wrong primitive for the four use cases. Keep hooks for what they're good at (per-tool policy, session-start setup) and don't conflate them with async-event delivery.

---

## 6 · Recommendation — smallest viable subset

### 6.1 The shape

```
┌─────────────────────────────────────────────────────────────────┐
│  happy-cli (Node/TypeScript) — the producer layer               │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ git watcher │  │ fs watcher  │  │ timer       │              │
│  │ (refs/SHA   │  │ (glob+debnc)│  │ scheduler   │              │
│  │  predicate) │  │             │  │ (in-process)│              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         └──────────┬─────┴────────────────┘                     │
│                    │                                            │
│            ┌───────▼──────────┐                                 │
│            │ async-events MCP │   folded into existing          │
│            │ surface inside   │   happyMcpStdioBridge.ts        │
│            │ happyMcpStdio-   │   (stdio child of codex)        │
│            │ Bridge.ts        │                                 │
│            └───────┬──────────┘                                 │
└────────────────────┼────────────────────────────────────────────┘
                     │ stdio (rmcp StdioServerTransport,
                     │ existing wiring at runCodex.ts:693)
┌────────────────────▼────────────────────────────────────────────┐
│  codex (Rust) — the consumer layer                              │
│                                                                 │
│   A0 (long-poll v0) — agent calls async_events_wait tool,       │
│       blocks until producer fires. ZERO codex changes.          │
│                                                                 │
│   A1 (push bridge) — channels-research §6.1:                    │
│     logging_client_handler ──┐                                  │
│                              ▼                                  │
│   ┌─────────────────────────────────────┐                       │
│   │ NotificationBridge (overlay crate)  │                       │
│   └──────────────┬──────────────────────┘                       │
│                  │  emits EventMsg::McpServerNotification        │
│                  ▼                                              │
│   tx_event: Sender<Event> ──► agent turn loop                   │
│                                                                 │
│   (mailbox path for U3a UNCHANGED — wait_agent + send_message)  │
└─────────────────────────────────────────────────────────────────┘
```

> **Producer hosting decision is settled (Q3 default — Ciii throughout):** producers live in the existing Node stdio MCP child process at `packages/happy-cli/src/codex/happyMcpStdioBridge.ts` (called from `runCodex.ts:693`). Codex's in-process duplex transport (`rmcp-client/src/in_process_transport.rs`) is reserved for **Rust** built-in MCP servers and is the wrong layer for TypeScript watchers. The doc previously mentioned it as a candidate; that's been retired — see §5.a/§7 Q3.

### 6.2 Per-use-case mapping

| Use case | Producer (happy-cli, to be built) | Consumer mechanism | v1 stance |
|---|---|---|---|
| **U1 — git event** | `gitRefWatcher` (new module under `packages/happy-cli/src/modules/watcher/`) — polls `git rev-parse <ref>` every 2 s (or hooks `git fsmonitor` if available), stores last-seen SHA per watched ref, emits ONLY on transition. Replay: re-derive from current SHA on resume. | MCP notification once A1 bridge lands; long-poll tool from A0. | Ship A0 (long-poll) immediately; flip to push at A1. |
| **U2 — periodic timer** | `cronScheduler` (new module) — in-process timers (Claude Code's `cronScheduler.ts` shape, simplified). Replay: recompute missed slots from persisted last-fire timestamp. | Same as U1. | Same. |
| **U3a — inter-agent explicit wait** | **UNCHANGED.** Use codex's existing `multi_agents_v2/wait.rs` mailbox seq-watch. | Existing `wait_agent` tool returns `message` / `timed_out` per `wait.rs:114`. | Do nothing. Already works. |
| **U3b — inter-agent passive notify** | None today (no producer, no consumer). | None. | **OUT OF v1.** Deferred to A2 (emit `EventMsg::MailboxTick` off `mailbox_seq` watch, ~0.5 d). |
| **U4 — file-system event** | `fsWatcher` (new module) — chokidar with glob allowlist, 200 ms debounce, hard ceiling on event rate (drop with counter). **chokidar is a NEW dependency for `packages/happy-cli/`** (existing `startFileWatcher.ts:5` uses `fs/promises.watch` which is single-file, non-recursive — insufficient for U4). Replay: **best-effort, no replay**; agent re-scans on resume if needed. | Same as U1. | Same. Producer-side glob filter MANDATORY; do not push raw events. |

### 6.2.1 Async-event wire envelope (the gap codex review flagged)

Bridging codex's existing MCP notifications gives fixed handlers (`on_progress`, `on_resource_updated`, `on_logging_message`, …). The bridge alone does NOT distinguish a `gitRefUpdated` from a `fsChanged` from an arbitrary log message. We must define the envelope; otherwise the bridge would forward raw logs as agent prompts.

**v1 envelope (carried in the `params._meta` of MCP notifications emitted by the happy-cli MCP server):**

```jsonc
{
  "method": "notifications/message",   // standard MCP, post-A1 bridged via §6.1
  "params": {
    "level": "info",
    "data": { /* opaque to MCP layer */ },
    "_meta": {
      "codexu/async-event": {           // capability key; gates forwarding
        "schema": 1,                    // envelope version
        "kind": "git" | "fs" | "timer", // discriminator
        "eventId": "evt_01HXYZ…",       // ULID, monotonic, persisted
        "source": "gitRefWatcher",      // producer module name
        "subscriptionId": "sub_…",      // tied to subscribe call
        "sessionId": "sid_…",           // owning codex session
        "createdAt": 1715600000000,     // ms epoch
        "payload": { /* kind-specific */ }
      }
    }
  }
}
```

**Forwarding rule (A1, NotificationBridge):**
- Only `notifications/message` carrying `_meta["codexu/async-event"].schema == 1` is forwarded to `tx_event` as `EventMsg::McpServerNotification`.
- All other `notifications/message` (plain logs) stay logging-only — matches today's behaviour.
- The capability `experimental["codexu/async-event"]` advertised in `initialize` gates whether the bridge even installs the forwarding callback for that MCP server.

**Kind-specific `payload` shapes:**
- `git`: `{ ref: "refs/heads/main", oldSha: "abc…", newSha: "def…", reason: "fast-forward" | "force-push" | "unknown" }`
- `fs`: `{ path: "<absolute>", kind: "create" | "modify" | "delete", isDir: bool, mtime: ms }`
- `timer`: `{ scheduleId: "sub_…", firedAt: ms, missedFires: int }`

**Long-poll v0 (A0) returns the same envelope** as the tool result — same producer code, two delivery shapes.

This deliberately reuses `notifications/message` rather than minting a new method like `notifications/codexu/event`, because (a) the existing bridge in channels-research §6.1 already wires `on_logging_message`, and (b) MCP servers that pre-date our capability negotiation can be safely ignored by checking `_meta.codexu/async-event` presence. If a future v2 wants its own method, the schema can carry the migration cleanly.

### 6.3 Why this is the minimum

- **Zero codex upstream changes for A0** — long-poll v0 is purely a Node MCP server in happy-cli plus three watcher modules. Ships independently of channels-research §6.1.
- **One upstream seam for A1** (only when we're ready to flip from poll to push): the channels-research §6.1 bridge. ~12 + ~30 additive lines in two upstream-canonical files; the bulk lives in the `codex-mcp-bridge` overlay crate. No other upstream patches.
- **One new MCP surface** added to the existing `happyMcpStdioBridge.ts` — not a separate process. Reuses existing stdio wiring, auth surface, lifecycle.
- **Zero changes to U3a.** The mailbox path already works; routing it through MCP would regress latency and add lock-reentry risk.
- **Zero protocol bumps** to `app-server-protocol`. App-server subscription RPC is deferred.
- **Producer-side filters everywhere.** Predicate logic (ref-SHA transition, fs glob+debounce) lives in the *producer*, never in the agent. The LLM doesn't filter; it acts on filtered events.

### 6.3.1 Per-use-case v1 acceptance criteria

| # | Acceptance bullet |
|---|---|
| **U1** | Vitest fixture creates a temp git repo, commits to `main`, asserts exactly ONE event emitted; commits to a different branch and asserts ZERO events; force-pushes `main` and asserts ONE event with `reason: "force-push"`. False-wake rate on `.git/` churn (`git status` from another shell, IDE-style `.git/index.lock` toggles) measured at 0 events. |
| **U2** | Cron expression `"*/2 * * * *"` fires within ±2 s of slot; on resume after a 5-min pause, `missedFires == 2` reported; minimum cadence (10 s) enforced; sub-10 s expressions rejected at subscribe time. |
| **U3a** | Existing `wait_agent` test surface unchanged; v1 adds no new tests for inter-agent. Doc explicitly notes that codex's existing coverage is the regression gate. |
| **U3b** | **Out of v1.** Explicitly named as deferred A2 work; no v1 acceptance bullet beyond "no regression of `wait_agent`." |
| **U4** | Vitest fixture with chokidar glob `["**/*.md"]`, ignore `["**/node_modules/**", "**/.git/**"]`: create/modify/delete `.md` files asserts 3 events; create 1000 files in `node_modules/` asserts 0 events; sustained write storm at 200 events/s within glob asserts rate-cap kicks in (≤50 emitted, drop-counter event surfaces). |
| **Lifecycle** | Killing the codex backend mid-session asserts all watchers stopped (no orphaned chokidar handles, no leaked timer); `happyServer.stop()` triggers same teardown; reconnect after MCP disconnect re-subscribes from persisted cursor. |
| **Envelope** | Plain `notifications/message` (no `_meta.codexu/async-event`) asserts NOT forwarded to `tx_event`. Malformed envelope (missing required fields, wrong schema version) asserts dropped with a single counter event. |

### 6.4 What's explicitly out of scope for v1

- **U3b passive inter-agent notification.** Deferred to A2 (~0.5 d when wanted).
- **Cross-device fan-out.** A second daemon on a different machine subscribing to events from the first is the `agent-comms` Scope A problem (see [[parallel-assignments]] T). Don't solve it here.
- **Durable cross-restart replay queue.** Producers expose query APIs with per-producer replay semantics (git: SHA compare; timer: missed-slot math; fs: best-effort/no-replay). No persistent cross-restart event log in v1.
- **Hard mid-LLM-call preemption.** Matches Claude channels' non-preempt semantics ([[channels-research]] §1.4) and codex's existing mailbox preempt point in `turn.rs`. Mid-call cancellation is a different multi-week project.
- **Server-initiated LLM calls** (MCP `sampling/createMessage`) and **Claude-style permission relay.** Channels-on-top work, gated on the operator deciding whether `codex-channels` ([[parallel-assignments]] U.2) is the right primitive.
- **Generic 3rd-party watcher servers (HTTP/WS-transported).** Auth foot-gun. Producers must live inside `happyMcpStdioBridge.ts` (the existing stdio child) in v1.

### 6.5 Phasing

| Phase | Deliverable | Effort | Depends on | Exit / test gate |
|---|---|---|---|---|
| **A0 — long-poll v0** | New async-events tools (`async_events_subscribe` / `_wait` / `_list`) folded into `packages/happy-cli/src/codex/happyMcpStdioBridge.ts`. Producers for git (ref-SHA predicate), fs (glob+debounce, chokidar), timer. Envelope per §6.2.1. | ~2–3 d | nothing | §6.3.1 U1/U2/U4 acceptance bullets pass; chokidar added to `packages/happy-cli/package.json`; lifecycle teardown fixture green. |
| **A1 — push bridge** | Land [[parallel-assignments]] U.1 `mcp-server-notifications` with the envelope filter (§6.2.1). Same A0 producers now ALSO flow as `EventMsg::McpServerNotification`; long-poll tools remain for explicit-wait UX. | ~3–5 d ([[channels-research]] §6.5) | A0 (producers exist; envelope frozen) | §6.3.1 envelope acceptance passes; fixture: producer emits notification → agent receives `EventMsg::McpServerNotification` without calling any tool. |
| **A2 — passive U3b** | Emit `EventMsg::MailboxTick` whenever `mailbox_seq` watch changes; gate behind `Feature::MailboxTickEvents` (default off). | ~0.5 d | A1 | U3b acceptance bullet added (deferred from v1). |
| **B — cross-device** | App-server `thread/subscribeEvents` or `_injectEvent` RPC; happy-server fan-out across daemons. Tied to [[parallel-assignments]] T `agent-comms` Scope A. | TBD | B-scope decision (relay vs tunnel vs broker) | per agent-comms Scope A acceptance |
| **B' — channels-on-top** | [[parallel-assignments]] U.2 `codex-channels` (Claude-Code-parity envelope for external-user messages). | ~1.5–2 d ([[channels-research]] §6.2) | A1, operator decision | per U.2 |

**A0 alone is a complete v1 increment that covers U1/U2/U4 + U3a.** A1 is the recommended fast-follow that adds passive (non-tool-call) delivery on top of the same producers. **U3b is explicitly NOT in v1** and is the only one of the four original use cases not covered. The TL;DR statement of coverage is qualified accordingly.

### 6.6 Risk register

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| **`tx_event` flooded by chatty fs watcher** | High under `node_modules/` writes | High — stalls agent loop | Producer-side debounce + glob filter; per-source token bucket with drop-counter event. Default 50/s ceiling. |
| **False wakes on git events** | High (IDE indexers, pre-commit hooks) | Medium — wastes turns, no data loss | Predicate: only fire on `refs/heads/main` SHA transition. Watcher stores last-seen per ref. |
| **Replay loss across codex restart** | Certain on every restart | Low if producers queryable, High otherwise | Hard requirement: every producer exposes `_list({afterEventId})`. Agent re-polls on resume. |
| **Lock contention via mailbox re-entry** | Low (we don't route U3 through MCP) | Was high under candidate 5.a-only | By construction: U3 stays on existing mailbox, never re-enters `McpConnectionManager` from a notification handler. |
| **Auth bypass via 3rd-party watcher MCP server** | Medium if HTTP/WS transports allowed | High — any localhost process wakes the agent | v1 rule: in-process or stdio-spawned-by-session only. No HTTP/WS watcher servers. Document in plugin guide. |
| **Producer in happy-cli (Node) misses events while daemon is paused/restarting** | Medium | Medium — undetectable from agent side | Producers persist last-event-id to disk at `~/.happy/async-events/<source>/cursor.json` with atomic write-then-rename (no partial-read races); on daemon restart, query underlying source from cursor. Per-producer replay semantics defined in §1 cross-cutting requirements. |
| **U3b passive-notification regression after A2** | Low | Medium — sibling tick floods agent | A2 carries a per-mailbox rate cap and a "noise filter" (only emit when the sibling **transitions** to idle, not on every send). Feature-flagged default off. |
| **Watchers leak after session/codex/MCP teardown** | High without explicit handling | High — file handles, timer leaks, ghost subscriptions | Subscriptions are session-scoped objects in `happyMcpStdioBridge.ts`; teardown hook on stdio EOF, on `happyServer.stop()` (`runCodex.ts:494`), and on explicit MCP disconnect. v1 acceptance includes a teardown fixture that asserts zero open chokidar handles + zero pending timers after session close. |
| **Subscription quota abuse** | Low (single-user daemon) | Medium — runaway agent creates 1000 fs watchers | Per-session quotas: max 32 subscriptions, max 16 watched globs, min 10 s timer cadence. Enforced at subscribe time; reject with structured error. |
| **Bridge forwards arbitrary log messages as agent prompts** | Medium without envelope filter | High — agent confused / spammed | §6.2.1 envelope: NotificationBridge ONLY forwards `notifications/message` with `_meta["codexu/async-event"].schema == 1`. Plain logs stay logging-only. Capability `experimental["codexu/async-event"]` gates the forwarding callback installation. |

---

## 7 · Operator decisions to surface BEFORE filing follow-up ralph jobs

The recommendation in §6 is opinionated. Three architectural choices must be made by the operator before a `/plan-with-ralph` job is filed for the implementation. Do **not** add follow-up ralph rows to `parallel-assignments.md` until these are answered.

### Q1 — Order of A0 and A1: ship long-poll first, or hold for the push bridge?

- **(Ai) — Long-poll first (A0 → A1, recommended).** Producer-first. Long-poll tools in happy-cli become useful immediately; bridge adds passive delivery later. Cost: agents that *can't* call a tool to wait (e.g. paused on permission) miss events until bridge lands.
- **(Aii) — Push-first (A1 → A0).** Block on the bridge. Cleaner end state; nothing temporary to deprecate. Cost: nothing usable for ~1 wk; can't validate producer design until A0 is also built.
- **(Aiii) — A1 only, no long-poll tools.** Push-only, agent-passive. Cost: no v0 to validate watcher design before committing to the bridge. Higher chance of design churn.

> Default if no answer: **(Ai)** long-poll first. Production value within a week; bridge follows.

### Q2 — Replay stance: best-effort vs. cursor-based

- **(Bi) — Best-effort, query-on-resume (recommended).** Producers persist last-event cursor, expose `_list({afterEventId})`. Agent calls on resume. Simplest; matches MCP transport semantics.
- **(Bii) — Producer-managed seq per subscription.** Producer-side ordered queue; agent passes last-seen seq on `initialize`. Stronger guarantees, ~1 d more.
- **(Biii) — Don't replay.** Document "events fire while agent is online, period." Risk: silent miss every restart.

> Default if no answer: **(Bi)** best-effort with query-on-resume.

### Q3 — Producer hosting: in-process Service vs. stdio sidecar

- **(Ciii) — happy-cli-side stdio MCP, fold into existing `happyMcpStdioBridge.ts` (recommended).** Reuses existing stdio wiring (called from `runCodex.ts:693`), existing auth surface (capability-token-per-spawn), existing teardown hook (`happyServer.stop()` at `runCodex.ts:494`). One MCP connection covers existing happy tools + new events. **Producers in Node/TS where chokidar/`simple-git`/`fs/promises.watch` are first-class.**
- **(Ci) — In-process Rust `Service` impl over codex's in-process duplex transport** (`rmcp-client/src/in_process_transport.rs`). Lower latency, no auth surface, but **requires writing watchers in Rust inside `codex-rs-overlay/`**. Codex's in-process transport is currently used only for Rust built-in MCP servers (`codex-mcp/src/{rmcp_client.rs:575,builtin.rs:21}`). Higher implementation cost; loses Node ecosystem leverage.
- **(Cii) — stdio MCP server as a SEPARATE child process** spawned by codex independently of the happy bridge. Process isolation; survives if the watcher crashes. Higher cost: process lifecycle, restart policy, log capture, second auth surface.

> Default if no answer: **(Ciii)** — fold async-events tools/notifications into the existing `happyMcpStdioBridge.ts` MCP server. One MCP connection, one auth surface, no new process. **(Ci) is rejected** because it requires implementing watchers in Rust inside an overlay crate — significant extra effort with no offsetting benefit given that happy-cli already runs alongside every codex session.

---

## 8 · Cross-task implications

- **[[parallel-assignments]] U.1 `mcp-server-notifications`** — the bridge half. This doc names it as the upstream-canonical dependency. Surfacing of `EventMsg::McpServerNotification` is the only consumer-side change.
- **[[parallel-assignments]] U.2 `codex-channels`** — orthogonal. `codex-channels` is "Claude-Code-parity envelope for external-user messages into the prompt queue." Async events use the same bridge transport but a different `EventMsg` variant and a different agent-loop policy. Do NOT couple them.
- **[[parallel-assignments]] T `agent-comms`** — Scope B (same-daemon cross-session) gets a clean primitive via the in-session MCP server: one session's MCP server can emit notifications that another session subscribes to. Scope A (cross-daemon) is post-v1 and the right place for the deferred app-server subscription RPC (§5.d).
- **[[parallel-assignments]] V `async-events-design`** — this doc. After operator answers §7, file `async-events-v0-longpoll` and `async-events-v1-push` rows.
- **[[parallel-assignments]] X `roadmap-plugin`** — once async events ship, the roadmap plugin gains a natural "wake when a task's status changes" trigger via the same bridge.
- **[[codexu-roadmap]] §"minimize upstream conflict surface"** — this design's one upstream seam is the bridge from channels-research §6.1; everything else lives in `codex-rs-overlay/` and `packages/happy-cli/`. Respects rules 1 & 2 of the tenet, accepts rule 3 for the bridge with a clear scope.

---

## 9 · Sources

### Codex (READ-ONLY)
- `codex/external/repos/codex-patched/codex-rs/config/src/hook_config.rs` — hook event enum, synchronous lifecycle taps
- `codex/external/repos/codex-patched/codex-rs/core/src/hook_runtime.rs:104–344` — hook execution
- `codex/external/repos/codex-patched/codex-rs/app-server-protocol/src/protocol/v2/hook.rs:31–33` — `ExecutionMode::{Sync, Async}` semantics
- `codex/external/repos/codex-patched/codex-rs/core/src/tools/handlers/multi_agents_v2/{spawn,send_message,wait,close_agent,list_agents,followup_task,message_tool}.rs` — multi-agent fast path
- `codex/external/repos/codex-patched/codex-rs/rmcp-client/src/logging_client_handler.rs:49–135` — logging-only notification handlers
- `codex/external/repos/codex-patched/codex-rs/rmcp-client/src/in_process_transport.rs` — in-process duplex transport (the cheap path)
- `codex/external/repos/codex-patched/codex-rs/rmcp-client/src/elicitation_client_service.rs` — bidirectional precedent (service trait impl)
- `codex/external/repos/codex-patched/codex-rs/codex-mcp/src/elicitation.rs:103–231` — `tx_event` emission pattern
- `codex/external/repos/codex-patched/codex-rs/codex-mcp/src/connection_manager.rs:175` — `tx_event` constructor parameter, currently used only for startup + elicitation
- `codex/external/repos/codex-patched/codex-rs/app-server-protocol/src/protocol/v2/notification.rs` — unidirectional notification types
- `codex/external/repos/codex-patched/codex-rs/app-server/src/fs_watch.rs:1–100` — client-facing fs watcher (NOT in-session)
- `codex/external/repos/codex-patched/codex-rs/app-server/src/mcp_refresh.rs` — `tools/list_changed` handling
- `codex/external/repos/codex-patched/codex-rs/core/src/tools/handlers/unified_exec/await_background_completion.rs` — polling primitive
- `codex/external/repos/codex-patched/codex-rs/protocol/src/protocol.rs` — `EventMsg` enum, `InterAgentCommunication`

### Claude Code (READ-ONLY)
- `D:/harness-efforts/claude-code/worktrees/main/src/utils/messageQueueManager.ts:40–51` — priority queue
- `D:/harness-efforts/claude-code/worktrees/main/src/cli/print.ts:1845–1854` — tick emission, agent loop entry
- `D:/harness-efforts/claude-code/worktrees/main/src/services/mcp/channelNotification.ts:37–47, 191–316` — channels schema + multi-gate registration
- `D:/harness-efforts/claude-code/worktrees/main/src/utils/cronScheduler.ts:40–120` — cron scheduler
- `D:/harness-efforts/claude-code/worktrees/main/src/utils/hooks/AsyncHookRegistry.ts:30–83, 113` — async hook polling
- `D:/harness-efforts/claude-code/worktrees/main/src/utils/hooks/fileChangedWatcher.ts:1–80` — chokidar fs watcher
- `D:/harness-efforts/claude-code/worktrees/main/src/utils/attachments.ts:3464–3518, 3520–3539` — async hook attachments, mailbox
- `D:/harness-efforts/claude-code/worktrees/main/src/tools/SleepTool/prompt.ts:7–17` — tick-yielding sleep
- `D:/harness-efforts/claude-code/worktrees/main/src/tools/MonitorTool/MonitorTool.ts:1` — `null`, not in agent registry

### Codexu
- `packages/happy-server/sources/app/events/eventRouter.ts` — Socket.IO fan-out, ring buffer, rooms
- `packages/happy-cli/src/api/apiMachine.ts:151–241` — registered RPCs (no inter-session inbox today)
- `packages/happy-cli/src/api/apiSession.ts` — session state, no cross-session inbox
- `packages/happy-cli/src/codex/runCodex.ts` — codex app-server client + happy MCP bridge wiring
- `packages/happy-cli/src/codex/happyMcpStdioBridge.ts` — existing happy MCP server (natural extension point)
- `packages/happy-cli/src/claude/utils/startHappyServer.ts` — current MCP surface (just `change_title`)
- `packages/happy-cli/src/claude/utils/startHookServer.ts:1–210` — claude hook HTTP wrapper (no codex analogue)
- `packages/happy-cli/src/modules/watcher/{startFileWatcher,awaitFileExist}.ts` — existing fs-watch primitives
- `packages/happy-cli/src/claude/utils/sessionScanner.ts:178` — JSONL polling, 3 s interval
- `packages/happy-cli/src/daemon/forkSession.ts:63–192` — fork pattern, on-demand git
- `packages/happy-server/sources/app/push/pushNotifications.ts:25–46, 77–100` — Expo push, per-machine token

### Local planning context
- `plans/channels-research.md` — full design for `EventMsg::McpServerNotification` (§6.1) and channels-on-top (§6.2)
- `plans/codexu-roadmap.md:190–228` — minimize-conflict-surface tenet
- `plans/parallel-assignments.md:254–326` — T (agent-comms), U/U.1/U.2 (channels-research / mcp-server-notifications / codex-channels), V (this doc), X (roadmap-plugin)
- `codex/docs/implementation/patch-surface.md` — registry for sandbox-patch rows

### MCP spec (current revision 2025-11-25 as of 2026-05-13)
- [Specification index](https://modelcontextprotocol.io/specification/2025-11-25)
- [Transports — stdio + Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [Tasks utility (experimental)](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks) — relevant if A2/B' wants long-running task subscription primitives
- [2026 MCP Roadmap](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/) — trend is away from persistent stateful connections; no spec-level "async-events" primitive in flight
