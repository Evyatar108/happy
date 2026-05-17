# Agent-view research — Claude Code "teammate view" feature

*Output of the `agent-view-research` ralph task. Surfaced 2026-05-13. NO CODE CHANGES — research deliverable.*

Cross-reference: `plans/codexu-roadmap.md` §Phase 6 "Long-lived teammates" (the deferred-polish workstream this research grounds), §Phase 2c (plugin scoping, host vs agent context), and `plans/parallel-assignments.md` tasks `plugin-scope-agents` / `agent-comms` (already blocked-on this research).

Applicability buckets used throughout:
- **(a) codex agent runtime** — fix-site is the codex submodule, an overlay crate in `codex/codex-rs-overlay/`, or `packages/happy-cli/src/codex/`
- **(b) codexu mobile app UI** — fix-site is `packages/happy-app/` (and sometimes `packages/happy-server/` for the wire shape)
- **(c) both** — needs coordinated changes across runtime and mobile

---

## 1. What "agent view" IS

The feature is officially called **"teammate view"** (sometimes "transcript view") in the Claude Code codebase — "agent view" is the colloquial name. It's a **terminal UI affordance** that lets the operator (the "team lead") switch focus between an in-process team of agents running concurrently and inspect each teammate's live transcript.

User-visible behaviour:

- When a parent agent calls the `Agent` tool with a `team_name` parameter, the framework spawns agents as **in-process teammates** in the same Node.js process (AsyncLocalStorage isolation, not separate processes).
- A **spinner tree** displays at the bottom of the terminal: `[team-lead]` on top with team members listed below (e.g., `researcher`, `analyst`), each with live status.
- The operator navigates with **Shift+Up / Shift+Down** to select a teammate; presses **`f`** to view that teammate's transcript, or **Enter** to switch focus.
- Selected teammate's full conversation history is rendered in the main prompt area, with a header `Viewing @researcher · Research markets`.
- Operator can type messages while viewing — queued to the teammate via an in-process message queue.
- **Esc** exits the transcript and returns to the team lead's view.
- Keystrokes: `k` to kill a teammate, Shift+Tab cycles the teammate's permission mode while viewing.

Three named lifecycle states for the view: `viewSelectionMode ∈ { none, selecting-agent, viewing-agent }`. The operator's terminal is always in one of those.

The framework also persists each teammate's transcript to disk (`getTaskOutputPath()`) so completed teammates linger for post-run inspection — 30s grace after completion before eviction; killed/errored teammates remain visible until the session ends.

### Spawning model

- The `Agent` tool with `team_name` parameter is the only spawn surface.
- Capability check: `isInProcessEnabled()` selects in-process vs tmux vs iTerm2 backends. In-process is default.
- Identity assigned at spawn time: `agentId` (format `name@teamName`), `agentName`, `teamName`, random color, `planModeRequired` flag, `parentSessionId`.
- Execution wrapped in `runWithTeammateContext()` using AsyncLocalStorage — no separate process, shared file system, isolated context.
- Three spawn paths total: **Teammate** (in-process or tmux), **Fork** (isolated git worktree, inherits parent context), **Normal** (fresh context, one-shot).

### State / persistence

- **In-memory**: `AppState.tasks[taskId]` carries `InProcessTeammateTaskState` = `{ identity, status, messages (capped at 50), pendingUserMessages, progress, abortController }`. Status = `running | idle | completed | failed | killed`.
- **Selection state**: `viewSelectionMode`, `viewingAgentTaskId`, `selectedIPAgentIndex` — all on the same AppState store.
- **On disk**: per-agent transcript file at `getTaskOutputPath()`. No database; transient to the session.
- Inter-teammate messaging via a separate **mailbox** (`inProcessMailboxes`, `writeToMailbox()`) — distinct from the transcript-view message queue.

### Permissions / scoping

- Per-teammate `permissionMode` field, mutable via Shift+Tab while viewing. Modes: `plan | dontAsk | bypassPermissions | default | acceptEdits`.
- Tool allowlists inherited from parent, narrowable per teammate.
- Sandbox model: in-process teammates share CWD with the leader; isolation is **context-level** (AgentId, messages), not filesystem-level.
- `planModeRequired: true` forces the teammate to produce a plan and wait for approval before proceeding.

---

## 2. Where it lives in Claude Code (file paths)

All paths relative to `D:/harness-efforts/claude-code/worktrees/main/`:

| Concern | File | Notes |
|---|---|---|
| AppState fields for view | `src/state/AppStateStore.ts:95-108` | `expandedView`, `viewSelectionMode`, `viewingAgentTaskId`, `selectedIPAgentIndex` |
| View state transitions | `src/state/teammateViewHelpers.ts` | `enterTeammateView()`, `exitTeammateView()`, `stopOrDismissAgent()` |
| Teammate task type | `src/tasks/InProcessTeammateTask/types.ts` | `InProcessTeammateTaskState` |
| Teammate task handler | `src/tasks/InProcessTeammateTask/InProcessTeammateTask.tsx` | Lifecycle, `appendTeammateMessage()`, `injectUserMessageToTeammate()` |
| Spinner tree UI | `src/components/Spinner/TeammateSpinnerTree.tsx` | The visible hierarchy widget |
| Spinner row | `src/components/Spinner/TeammateSpinnerLine.tsx` | Individual teammate row |
| Transcript-view header | `src/components/TeammateViewHeader.tsx` | "Viewing @name · task" banner |
| Keystroke handling | `src/hooks/useBackgroundTaskNavigation.ts` | Shift+Up/Down, Enter, f, k, Esc |
| Auto-exit on inactivity | `src/hooks/useTeammateViewAutoExit.ts` | Exits transcript when teammate dies (except completed) |
| In-process spawn | `src/utils/swarm/spawnInProcess.ts` | Creates `InProcessTeammateTaskState`, registers in AppState |
| In-process runner | `src/utils/swarm/inProcessRunner.ts` | The actual agent execution loop, AsyncLocalStorage-scoped |
| Shared spawn dispatch | `src/tools/shared/spawnMultiAgent.ts` | Picks backend (in-process / tmux / iTerm2) |
| Agent tool params | `src/tools/AgentTool/AgentTool.tsx:85-98` | `team_name`, `run_in_background`, isolation modes |
| Prompt input redirect | `src/components/PromptInput/PromptInput.tsx` | Hides suggestions + redirects keys when in `viewing-agent` mode |

Vocabulary introduced: **teammate**, **team lead / leader**, **transcript view / teammate view**, **in-process teammate**, **swarm**, **agent ID (`name@teamName`)**, **spinner tree**, **selection mode**, **viewing mode**, **mailbox**, **team context (AsyncLocalStorage)**, **plan mode**.

---

## 3. How it differs from codex's existing `multi_agents_v2/spawn.rs`

Codex already has most of the primitives. What's missing is the *view* surface and a few lifecycle conveniences. See `plans/codexu-roadmap.md` §"Pre-existing capabilities (audited 2026-05-02)" for the audit baseline.

### Side-by-side

| Dimension | Claude Code (teammate view) | Codex today |
|---|---|---|
| **Spawn surface** | `Agent` tool with `team_name` arg | `spawn_agent` tool with `agent_type`, `task_name`, `model`, `reasoning_effort`, `fork_turns` (`core/src/tools/handlers/multi_agents_v2/spawn.rs:231-241`) |
| **Role declaration** | None — teammates are ad-hoc per-spawn | `[agents.<role>]` TOML world: `AgentRoleToml { description, config_file, nickname_candidates }` (`config/src/config_toml.rs:668-681`); role's config file carries developer-instructions, model, reasoning-effort |
| **Identity** | `name@teamName`, random color, planModeRequired | `agent_id`, `agent_path`, `agent_nickname` (drawn from `AGENT_NAMES` pool), `agent_role`, `last_task_message` (`registry.rs` `AgentMetadata`) |
| **Spawn semantics** | Async — parent gets back a teammate handle, child runs concurrently | Async — parent's `spawn_agent` returns immediately, child runs independently; events `CollabAgentSpawnBeginEvent` / `CollabAgentSpawnEndEvent` fire (`spawn.rs:71-80`, `189-205`) |
| **Spawn-depth tracking** | Implicit (no nested teammates) | Explicit: `next_thread_spawn_depth()`, `exceeds_thread_spawn_depth_limit()`, default `DEFAULT_AGENT_MAX_DEPTH=1` (`registry.rs:71-77`, `core/src/config/mod.rs:176`) |
| **Inter-agent comms** | In-process mailbox via `writeToMailbox()` + shared message queue | `Mailbox` / `MailboxReceiver` (tokio mpsc + watch), pull-based via `drain()`; supports `trigger_turn` flag (`core/src/agent/mailbox.rs:11-72`); plus `send_message()`, `list_agents()`, `get_status()` tools |
| **Live status** | Implicit — UI watches `AppState.tasks[taskId].status` | Explicit subscription: `subscribe_status(agent_id) -> watch::Receiver<AgentStatus>` (`control.rs:832-840`) |
| **Persistence** | In-memory `AppState`; per-teammate transcript file via `getTaskOutputPath()` | Codex thread storage — every spawned thread becomes a `CodexThread` in `ThreadManagerState`; resumable via `thread/resume` |
| **Resumability** | None — teammates die with the parent session | Built-in: thread IDs persist, can be resumed later (the foundation Phase 6 stands on) |
| **UI surface** | Terminal spinner tree + transcript view (Shift+Up/Down, Enter, f, k, Esc) | **None** — events stream to the TUI consumer but no live tree query, no transcript pull, no "active teammates" pane |
| **Permission inheritance** | Parent → child + per-teammate override (Shift+Tab while viewing) | Parent's `approval_policy`, `shell_environment_policy`, `permission_profile`, `cwd` forwarded at spawn time (`multi_agents_common.rs:258-279`); role can override via its config layer |
| **Plugin scoping** | N/A (no plugin scoping per agent in Claude Code) | Phase 2c work — not yet integrated; spawned agents inherit parent plugin enablement today |
| **Kill semantics** | `k` keystroke from spinner tree kills selected teammate | `close_agent` handler — shuts down descendants but does not surface which were affected or their final status (`close_agent.rs:27-118`) |
| **Lifecycle hooks** | None | None — no `before_spawn` / `after_exit` hooks |
| **Idle timeout** | 30s grace after `completed`; killed/errored linger till session end | Roadmap mentions `inactivity_timeout` (line 856) but not implemented in code as of audit |

### Key insight

**Codex has the runtime primitives; what's missing is the observability surface.** The spawn tree, status subscriptions, and mailbox are all already in `core/src/agent/`. What doesn't exist is:
1. A queryable app-server RPC that returns the live tree as a single payload (for a UI to render).
2. A streaming subscription that survives WebSocket reconnect (today's `subscribe_status` is a local `watch::Receiver`, not a persistent server-emitted event).
3. A "transcript pull" RPC that returns a teammate's message history.
4. Lifecycle hooks (`before_spawn`, `after_exit`) for cleanup or notification.
5. Kill-tree visibility — `close_agent` doesn't return the affected descendants.

---

## 4. What concepts we'd want to bring to codexu

For each, the applicability bucket is marked.

| Concept | Bucket | Why valuable here |
|---|---|---|
| Live spawn-tree query RPC | (a) | Foundation for any "richer view". Codex has the data (`AgentRegistry.agent_tree`); just needs a structured query. |
| Streaming `agent-spawn-edge` event over WebSocket | (c) | Today `CollabAgentSpawnBeginEvent` exists but only inside codex; mobile sees nothing. Bridging through happy-cli → happy-server → app gives the mobile UI a live event stream. |
| Per-role `keepalive` / `inactivity_timeout: never` flag | (a) | Phase 6 roadmap explicitly names this gap (line 2463-2464). Required for "long-lived teammate" types like `Researcher`. |
| Lifecycle hooks (`before_spawn`, `after_exit`) | (a) | Useful for plugin-scope enforcement (Phase 2c) and for tooling like roadmap-plugin's `take-task`. |
| Transcript-pull RPC | (c) | Mobile equivalent of pressing `f` in Claude Code. Needs codex to expose a thread's last-N-messages by thread ID. |
| Per-teammate permission-mode override at runtime | (a) | Today permissions are set at spawn time. Claude Code's Shift+Tab cycles modes while viewing — would close a UX gap for codex once the view exists. |
| Top-level-vs-subagent plugin scope (Phase 2c extension) | (a) | `plugin-scope-agents` task already exists and is blocked on this research. Confirmed: codex needs scope=top-level vs scope=subagent for plugins like `ralph-orchestration`. |

The plugin-scoping piece is already tracked as task `plugin-scope-agents` in `plans/parallel-assignments.md` — this research validates the design.

---

## 5. What concepts we'd want to bring to the happy/codexu mobile app UI

Today the mobile app is a **flat list** with date-grouped inactive sessions and a single "active sessions" group at the top (`packages/happy-app/sources/components/SessionsList.tsx` — see the `SessionsList` function). Every Session is a peer; no parent-child relationships, no in-app spawn affordance. Agent-role surfacing (flavor + model + permission-mode pills) landed via the `session-role-pill` task; tree-depth indentation is still pending the `mobile-tree-view` task.

### Today's data model (relevant gaps)

`Session` interface (`packages/happy-app/sources/sync/storageTypes.ts:130-163`):
- Has `metadata.flavor`, `metadata.currentModelCode`, `metadata.currentPermissionModeCode`, `metadata.currentThoughtLevelCode` — all stored. `currentThoughtLevelCode` is still drawer-only; the other three are now surfaced inline in the session row via the role-pill row added by the `session-role-pill` task (see `SessionsList.tsx` `SessionItem` `sessionRolePillRow`).
- Has `agentState.controlledByUser` — local-vs-remote indicator, also not surfaced in row.
- **Does NOT have**: `parentSessionId`, `spawnedChildren`, `spawnedAt`, `agentRole` (as distinct from flavor).

### Mutation surface today (`packages/happy-app/sources/sync/ops.ts`)

- `machineSpawnNewSession(machine, path, agent, permission, model)` — creates a top-level session
- No `spawnSessionFromSession(parentSid, childConfig)` — can't spawn child from app

### Sync invariants the app honors (from `packages/happy-app/CLAUDE.md`)

Any UI work for agent-view-style features must respect:

1. Session/machine-scoped network calls must go through `apiSocket.forSession(sid)` / `forMachine(mid)` — no embedding composite session IDs in payloads.
2. Per-event MMKV persist of `lastSeenUpdateSeqByMachineId` (monotonic).
3. `session.seq` and `updateData.seq` are distinct namespaces — must not be conflated.
4. Older-page pagination sorts by `seq DESC`, not `createdAt DESC` (synthetic messages can have drifting timestamps).
5. `renderWindow` is viewport-managed; prefetch and live updates must not write it.

### Mapping Claude Code concepts → mobile UI (bucket (b))

| Claude Code concept | Mobile UI translation |
|---|---|
| Spinner tree | Tree-style session list with depth indentation + expand/collapse; replaces the flat-list-of-active-sessions group |
| `name@teamName` identity | Session row pill showing `agentRole · model` (e.g., `researcher · gpt-5-codex`) |
| Shift+Up/Down + `f` to view transcript | Tap session → existing session detail view (already works); new thing is a parent-breadcrumb at the top |
| `k` to kill teammate | Existing long-press / swipe context menu — add "kill agent" action |
| `Agent` tool with `team_name` | New "spawn child" action on a session row + new RPC `spawnSessionFromSession` |
| Per-teammate `planModeRequired` flag | Plan-mode indicator pill on the row (use existing `currentPermissionModeCode` field) |
| Mailbox / inter-agent comms | (Out of scope for first cut — surface in `agent-comms` task later) |

### What it would touch (file:line)

- **Data model** — `packages/happy-app/sources/sync/storageTypes.ts` (Session + Metadata extension), `packages/happy-server/sources/app/` (wire shape if backend tracks parent links)
- **List builder** — `packages/happy-app/sources/sync/storage.ts:250-343` (`buildSessionListViewData`) and `:395-570` (`applySessions` reducer) for tree construction
- **List UI** — `packages/happy-app/sources/components/SessionsList.tsx` `SessionsList` function (FlatList → tree, pending `mobile-tree-view`), `SessionItem` memo (already has role pills via `session-role-pill`; tree-view will add depth indent).
- **Mutation** — `packages/happy-app/sources/sync/ops.ts` (`machineSpawnNewSession` neighbour, add `spawnSessionFromSession`)
- **CLI side** — `packages/happy-cli/src/api/apiMachine.ts` / `apiSession.ts` (new spawn-child-of-session RPC handler)

### Hostile patterns to fight

1. **FlatList vs tree** — `SessionsList` is a `FlatList` with a flat `SessionListViewItem[]`. A real tree needs either a custom tree component (expensive) or a flattened-with-depth-metadata approach (more complex key/index tracking but cheap). The latter is the pragmatic choice.
2. **Composite session IDs** — `${machineId}:${localSessionId}`. Parent references must respect this or use composite-aware helpers from `machineSessionId.ts`.
3. **Active vs inactive grouping** — today the active-sessions group is a single flat row group; mixing active children under an inactive parent (or vice versa) breaks the grouping semantics. Options: (i) flatten tree so child inherits parent's active-state for grouping; (ii) introduce a "mixed-depth group" item type. Recommend (i) for the first cut.
4. **Avatar determinism** — `getSessionAvatarId(session)` uses `machineId:path`; child sessions on the same machine + path would collide. Add `parentSessionId` to the avatar hash if children should look distinct.

---

## 6. Decomposition into follow-up ralph tasks

Six follow-ups emerge from this research. All are tagged `spawnedFrom=agent-view-research` in `plans/overview-data.js` and added as task sections in `plans/parallel-assignments.md`.

| Task ID | Bucket | Effort | Risk | Size | Blocks on | Summary |
|---|---|---|---|---|---|---|
| `agent-tree-rpc` | (a) | 8h | medium | medium | ✅ delivered (branch `agent-tree-rpc`) | App-server RPC exposing codex's live spawn tree as `sessionGetAgentTree` plus live `agent-tree-update` deltas through happy-cli and happy-server |
| `session-parent-link` | (b) | 4h | medium | small | ✅ shipped | Add `parentSessionId` + `spawnedChildren[]` to `Session` metadata; read-side contract, ingress normalization, storage helpers, and tests landed |
| `mobile-tree-view` | (b) | 12h | medium | large | `session-parent-link` | Tree-style session list with depth indentation + expand/collapse |
| `session-role-pill` | (b) | 3h | low | small | — | Surface `metadata.flavor` + `currentModelCode` + `currentPermissionModeCode` inline in session row (parallel-safe, no schema changes) |
| `spawn-from-app` | (c) | 8h | medium | medium | `session-parent-link` | "Spawn child session" affordance + new `spawnSessionFromSession` RPC end-to-end |
| `agent-status-stream` | (c) | 10h | high | large | `agent-tree-rpc` | Bridge codex's `CollabAgentSpawnBegin/EndEvent` + `subscribe_status` through happy-cli → happy-server → happy-app as a live "active teammates" overlay |

### Effort estimates by bucket

- **(a) codex agent runtime only**: 8h (`agent-tree-rpc`)
- **(b) codexu mobile app UI only**: 19h (`session-parent-link` + `mobile-tree-view` + `session-role-pill`)
- **(c) both**: 18h (`spawn-from-app` + `agent-status-stream`)

**Total**: ~45h of code work. Phase 6 ("Long-lived teammates") un-defer condition (operator reports friction with re-spawning) is the trigger; this research provides the implementation plan.

### Parallel-safety

- `session-role-pill` is parallel-safe with everything (~3h, list-row visual only).
- `agent-tree-rpc` is parallel-safe with everything (touches happy-cli + new RPC, no overlap with batch 1).
- `session-parent-link` must land before `mobile-tree-view` and `spawn-from-app`.
- `agent-tree-rpc` must land before `agent-status-stream`.
- `mobile-tree-view` and `spawn-from-app` both touch `SessionsList.tsx` + `ops.ts` — serialize.

### Cross-references to existing roadmap

- Phase 6 (`codexu-roadmap.md:2455-2479`) — these tasks ARE the Phase 6 implementation. After they land, Phase 6 moves from "deferred polish" to "delivered".
- Phase 2c (plugin scoping, host vs agent) — out of scope here; tracked as `plugin-scope-agents` (already blocked on this research).
- `agent-comms` task — depends on the spawn surface from `spawn-from-app` + the channel design from `channels-research`.
- `roadmap-plugin`'s `take-task` operation could re-use `spawn-from-app`'s `spawnSessionFromSession` RPC; coordinate at implementation time.

---

## 7. Gaps in this research

1. **V2 Team/SendMessage tool**: Claude Code's source has both `Agent` tool with `team_name` AND references to separate `Team` / `SendMessage` tools. Couldn't fully trace which is the modern API and which is legacy.
2. **Coordinator mode**: `CoordinatorAgentStatus.tsx` component exists, suggesting a `COORDINATOR_MODE` feature flag with different teammate representation. Not explored.
3. **Remote agent eligibility**: `checkRemoteAgentEligibility()` exists — the teammate view likely extends to remote agents, but the wire shape wasn't read.
4. **Mailbox-vs-transcript-queue distinction**: Inter-agent messaging uses `inProcessMailboxes`, distinct from the transcript-view's `pendingUserMessages`. Didn't fully document the mailbox SendMessage API.
5. **Exact feature release date**: Confirmed in production, not pinned to a Claude Code version.
6. **Codex `inactivity_timeout`**: Roadmap mentions it (line 856) but spawn.rs / control.rs don't show an implementation today — would need a fresh grep at implementation time.

---

## 8. Recommended next step

Operator should review this doc and decide which of the six follow-ups to schedule. Recommended ordering:

1. **First wave (parallel, no blockers)**: `session-role-pill` (3h) — quick UX win, validates the data model is sufficient before bigger changes. `session-parent-link` (4h) — foundation for the tree work. `agent-tree-rpc` (8h) — foundation for status streaming.
2. **Second wave** (after first wave lands): `mobile-tree-view`, `spawn-from-app`, `agent-status-stream`.
3. **Promote Phase 6 to active** in `codexu-roadmap.md` once first-wave tasks land.

Do NOT open any follow-up code tasks until operator has signed off on this doc.
