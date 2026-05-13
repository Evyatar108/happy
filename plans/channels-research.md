# Channels research — Claude Code's "channels" + a codex equivalent

*Research doc — 2026-05-13. Output of `/plan-with-ralph "channels-research"`. No code; this is design + gap analysis.*

> **TL;DR.** Claude Code ships a real, branded **"channels"** feature: typed JSON-RPC notifications layered on top of MCP that let an external server push user messages and permission decisions into the agent's prompt queue mid-turn. Codex's MCP client (`codex-rmcp-client`, wrapping `rmcp` 0.15.0) **already has a bidirectional transport** — stdio + Streamable HTTP — and **already decodes** every server→client notification kind the spec defines, but every handler is currently *logging-only*: the dispatch path stops at `tracing::info!` and never reaches the agent's `tx_event: Sender<Event>` sink. The minimal codex equivalent is therefore *not* a transport change, *not* an overlay-crate net-new transport, and *not* an MCP spec extension. It is **wiring the existing handlers' callbacks through `tx_event`**, defining a small `EventMsg::McpServerNotification` variant in `codex-protocol`, and gating it behind a feature flag — modelled on the elicitation path that's already live (`elicitation.rs:103–231`). Effort estimate: **~3–5 d** for a feature-gated end-to-end (handler bridge + event variant + app-server forwarding + one fixture test). The risk surface is small and localized; the work is mostly plumbing.

---

## 1 · What Claude Code calls "channels"

### 1.1 The term is branded, not generic

`channels` in the Claude Code source is a **specific MCP extension** for two-way comms with external messaging platforms (Slack, Telegram, Discord, SMS bridges). It is *not* a general pub/sub primitive. Three dedicated files implement it (all under `D:/harness-efforts/claude-code/worktrees/main/src/services/mcp/`):

| File | Purpose |
|---|---|
| `channelNotification.ts:37–316` | Schemas + capability discovery + handler-registration gate |
| `channelPermissions.ts:1–241` | Permission-relay struct, deterministic request-ID hashing, race-resolution between local UI / channel / hook / classifier |
| `channelAllowlist.ts` | Marketplace+plugin allowlist enforcement |

### 1.2 Wire shape

Three JSON-RPC methods, all using MCP's existing transports (stdio / SSE / Streamable HTTP / WebSocket; see `client.ts:673–904`):

- **`notifications/claude/channel`** — server→agent. Carries a chat message from an external platform user. Schema (`channelNotification.ts:37–47`):
  ```
  { method: "notifications/claude/channel",
    params: { content: string, meta?: Record<string,string> } }
  ```
  Handler wraps content as `<channel source="...">…</channel>` and enqueues as a prompt with `priority: "next"`, `skipSlashCommands: true`, `origin: { kind: "channel", server }` (see `useManageMCPConnections.ts:505–560`).

- **`notifications/claude/channel/permission_request`** — agent→server. Outbound when a permission dialog opens; carries `{ request_id, tool_name, description, input_preview }` (200-char JSON truncation).

- **`notifications/claude/channel/permission`** — server→agent. Reply with `{ request_id, behavior: 'allow' | 'deny' }`. Schema at `channelNotification.ts:64–72`.

The `request_id` is a deterministic FNV-1a hash of `toolUseID`, mapped to a 25⁵ space (~9.8M) with a profanity blocklist and salt-retry capped at 10 (`channelPermissions.ts:112–152`). Five-character codes like `"yes abcde"` are how the platform user replies — and the channel server is responsible for parsing those replies and emitting the structured notification (which avoids social-engineering via free-text "yes" relayed as a notification).

### 1.3 Lifecycle

- **Capability declaration.** Server advertises `capabilities.experimental["claude/channel"]` (presence-signal; value can be `{}` or `true`) and optionally `capabilities.experimental["claude/channel/permission"]` (`channelNotification.ts:196–206`). This is standard MCP capability negotiation during `initialize` — *not* a new handshake.
- **Multi-gate registration** (`channelNotification.ts:191–316`):
  1. Server declares the capability.
  2. Runtime gate: `isChannelsEnabled()` (GrowthBook `tengu_harbor`, default off).
  3. Auth gate: OAuth-only — API-key users blocked.
  4. Policy gate: Teams/Enterprise managed-setting `channelsEnabled: true`.
  5. Session gate: `--channels plugin:name@marketplace` or `--channels server:my-channel` flag at invocation.
  6. Marketplace gate: plugin source matches declared tag.
  7. Allowlist gate: `{marketplace, plugin}` pair in the GrowthBook ledger, with `--dangerously-load-development-channels` as the escape hatch.
- **Handler attach** at registration time via `client.setNotificationHandler(...)` (`useManageMCPConnections.ts:505–560`).
- **Close** is implicit — when the MCP client disconnects, the handlers are dropped with it; there is no explicit channel-close RPC.

### 1.4 Back-pressure / interrupt model

- **No server-side cancellation of tool calls.** A channel server cannot unilaterally cancel a tool in flight. The agent's own `AbortController` owns tool lifetime.
- **No reasoning-loop preemption.** Channels enqueue into the prompt queue; the agent reads them *between* turns, not mid-LLM-call. "Interrupt" is soft (UI close, race resolution), not hard (signal).
- **Race resolution exists for permissions** via a request-ID map: local UI / bridge / hook / classifier / channel race; first `claim()` wins (`channelPermissions.ts:209–240`). No timeout/back-pressure beyond that.
- **Elicitation abort signals** are present (`elicitationHandler.ts:34,119,152`) but are server→server: they let the *server* cancel its own pending elicitation, not the agent cancel the server.

### 1.5 Surprises worth flagging

1. **"Channels" is the inbound half only.** A server must additionally declare an MCP *tool* (e.g., `send_message`) to let the agent reply outward. Channels carry user→agent messages; tools carry agent→user.
2. **Permission relay is feature-gated separately** from channels themselves (two distinct GrowthBook flags). It can ship independently.
3. **No `sampling/createMessage` implementation** in Claude Code's tree — the MCP spec primitive for server-asks-client-to-call-LLM is unused. Elicitation *is* implemented (`elicitationHandler.ts:68–212`).
4. **Channels can't trigger permission approval via text.** A compromised channel piping `"yes abcde"` back as a chat message would not be honored — only the structured `notifications/claude/channel/permission` is parsed (`channelPermissions.ts:56–60`).
5. **Elicitation hooks can short-circuit the UI entirely** (`elicitationHandler.ts:91–107`) — useful for automation but easy to miss.

---

## 2 · Codex's current MCP client

### 2.1 The live client is `codex-rmcp-client`

The authoritative path:

- **Crate:** `codex/external/repos/codex-patched/codex-rs/rmcp-client/` — wraps the official `rmcp` 0.15.0 SDK.
- **Struct:** `RmcpClient` at `rmcp-client/src/rmcp_client.rs:273–370`.
- **Wrapper for filtering/metadata:** `ManagedClient` at `codex-mcp/src/rmcp_client.rs:88–98`.
- **Manager:** `McpConnectionManager` at `codex-mcp/src/connection_manager.rs:567–602` — owns the `call_tool()` entry point and an `Arc<RwLock<...>>` over the live client set.

Tool-call path: session → `session::mcp::call_tool()` → `McpConnectionManager::call_tool()` → `RmcpClient::call_tool()`, all driven by an `rmcp::service::serve_client()` task spawned per client.

### 2.2 Transports supported today

Declared in `rmcp-client/Cargo.toml:33–43`:

| Transport | Feature flag | Location | Notes |
|---|---|---|---|
| **stdio** (child process) | `transport-child-process` | `rmcp_client.rs:322–336` `new_stdio_client()` | Wraps `StdioServerTransport`; full-duplex over a pipe. |
| **Streamable HTTP** | `transport-streamable-http-client-reqwest` | `rmcp_client.rs:340–371` `new_streamable_http_client()` | `StreamableHttpClientTransport<StreamableHttpClientAdapter>`; supports SSE for server-initiated push per MCP spec. |
| **In-process duplex** | `transport-async-rw` | `rmcp_client.rs:285–303` `new_in_process_client()` | Tokio `DuplexStream`; fully bidirectional. |

**No SSE-only transport, no WebSocket transport.** The deprecated MCP HTTP+SSE transport is not implemented; WebSocket (SEP-1288) is upstream-draft and not in `rmcp` 0.15.0.

### 2.3 Does the wire today permit server-initiated messages?

**Yes, structurally. No, functionally.**

- All three transports are bidirectional at the byte level.
- The `rmcp` SDK runs an internal service loop (`rmcp::service::serve_client()`, invoked at `rmcp_client.rs:824–864`) that **does** dispatch incoming `ServerRequest` → `Service::handle_request()` and `ServerNotification` → `Service::handle_notification()`.
- Codex implements the `Service` trait via `ElicitationClientService` (`rmcp-client/src/elicitation_client_service.rs:1–108`), which delegates notifications to `LoggingClientHandler` (`rmcp-client/src/logging_client_handler.rs:49–135`).

**The functional dead-end:** every notification handler in `LoggingClientHandler` is logging-only:

| MCP notification | Handler | Status |
|---|---|---|
| `notifications/progress` | `on_progress` `logging_client_handler.rs:60–69` | 🚫 logs only |
| `notifications/cancelled` | `on_cancelled` `:49–58` | 🚫 logs only |
| `notifications/resources/updated` | `on_resource_updated` `:71–77` | 🚫 logs only |
| `notifications/resources/list_changed` | `on_resource_list_changed` `:79–81` | 🚫 logs only |
| `notifications/tools/list_changed` | `on_tool_list_changed` `:83–85` | 🚫 logs only |
| `notifications/prompts/list_changed` | `on_prompt_list_changed` `:87–89` | 🚫 logs only |
| `notifications/message` (logging) | `on_logging_message` `:95–135` | 🚫 routed to `tracing`, not agent |
| `elicitation/create` (server request) | `ElicitationClientService::handle_request` `elicitation_client_service.rs:69–90` | ✅ **fully wired** — see §2.4 |
| `sampling/createMessage` (server request) | — | ❌ not implemented |

So the answer is: codex *receives* every server→client message kind the MCP spec defines, but only **elicitations** propagate into the agent.

### 2.4 The elicitation precedent (the template to copy)

Elicitations are the working bidirectional path and the model the rest of this design follows:

- `ElicitationRequestManager::make_sender()` at `codex-mcp/src/elicitation.rs:103–231` wraps a `SendElicitation` callback.
- On incoming `CreateElicitationRequest`, `ElicitationClientService::handle_request()` (`elicitation_client_service.rs:69–90`) invokes the callback.
- The callback emits `Event { msg: EventMsg::ElicitationRequest(...) }` over `tx_event: async_channel::Sender<Event>` (`elicitation.rs:208–225`).
- The agent's main turn loop drains `tx_event`, surfaces the elicitation to the user (TUI bottom pane at `tui/src/bottom_pane/mcp_server_elicitation.rs`, or app-server clients via the existing protocol), and posts the response back through a `tokio::sync::oneshot::channel()` registered in the manager (`elicitation.rs:203–206`).
- The `tx_event` sink itself is plumbed in at `codex-mcp/src/connection_manager.rs:175` (`tx_event: Sender<Event>` constructor parameter) and is currently used **only** for `McpStartupUpdate` / `McpStartupComplete` (`connection_manager.rs:309, 695`) and elicitation forwarding.

**Implication for channels:** the `tx_event` sink is already wired all the way to the agent loop. Adding a "channels" path is mostly defining new `EventMsg` variants and pointing the existing `LoggingClientHandler` notification methods at the same sink — instead of letting them die in `tracing`.

---

## 3 · MCP spec status (2025-11-25 revision, current as of 2026-05-13)

Full sourcing in §8 below. Key points:

- **The term "channels" does not appear in the spec, the 2025-11-25 changelog, or the 2026 roadmap.** No active SEP for a generic channels primitive. Claude Code's `notifications/claude/channel*` are deliberately namespaced under `claude/` precisely because they are a vendor extension carried in `experimental.*` capabilities.
- **Server→client primitives already standardized** (all reach codex's `LoggingClientHandler` today, all currently log-only):
  - Notifications: `progress`, `cancelled`, `message` (logging), `resources/updated`, `resources/list_changed`, `tools/list_changed`, `prompts/list_changed`, `tasks/status` (new, experimental).
  - Server requests: `sampling/createMessage`, `elicitation/create`, `roots/list`, `ping`.
- **Transports supporting full duplex:** stdio (long-lived, symmetric) and Streamable HTTP (server→client push via SSE streams that the server *may* open in response to a POST or on a client-issued GET — `Last-Event-ID` resumability). Codex supports both. WebSocket is SEP-1288 draft and not adopted.
- **Cancellation:** `notifications/cancelled` is bidirectional; `tasks/cancel` exists for experimental tasks. **No spec primitive for "server preempts agent reasoning."**
- **Direction of travel** per the [2026 roadmap](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/) and [Dec 2025 transport-future post](https://blog.modelcontextprotocol.io/posts/2025-12-19-mcp-transport-future/): *away from* persistent stateful connections, *toward* statelessness + polled Tasks. A spec-level "channels" primitive is not on the roadmap.

**Bottom line:** for the "server pushes messages / state changes" use case, the spec primitives *are* sufficient (notifications + Streamable HTTP SSE). For "server interrupts the agent" (preemption of an in-flight LLM call), the spec offers nothing — any solution must be application-layer policy on top of notifications.

---

## 4 · Cross-reference: Phase 2d `ask_user_question`

Spec: `plans/codexu-roadmap.md:1602–1832`. Status: planned codex-patch (lives in `codex/docs/implementation/patch-surface.md` "upcoming patches").

**What it is:** a first-class structured-choice tool on the codex side, with 1–4 questions/call, 2–4 options/question, single- or multi-select, optional "Other" escape, plus mid-turn routing through the spawn chain for spawned sub-agents. Wire shape exists in TypeScript schema land at `codex/external/repos/codex-patched/codex-rs/app-server-protocol/schema/typescript/v2/`. TUI affordance reuses the existing elicitation bottom pane at `tui/src/bottom_pane/mcp_server_elicitation.rs`. Mobile rendering is in happy-app: `packages/happy-app/sources/components/tools/views/AskUserQuestionView.tsx`.

**Relationship to channels:**

| Layer | Phase 2d `ask_user_question` | Hypothetical codex channels |
|---|---|---|
| What it carries | Bounded structured questions to the user | Free-form server→agent messages and state |
| Direction | Agent→user (asker is the agent) | Server→agent (asker is the server) |
| Transport | Codex app-server protocol (not MCP) | Layered on MCP (stdio / Streamable HTTP) |
| Trigger | Tool call from the agent | Server-initiated push at any time |
| Routing complexity | Mid-turn routing through spawn chain (Phase 2d's hard problem) | Mid-turn delivery into the agent's prompt/event queue |
| Reuses elicitation pattern? | TUI yes (bottom pane); transport no | TUI yes (bottom pane); transport yes (rmcp service loop + `tx_event`) |

**Practical overlap.** Both want a typed envelope reaching the active agent mid-turn and a structured response path. Phase 2d's contribution is the **UI/UX schema + spawn-chain routing**. A channels primitive's contribution is the **MCP-side transport + handler bridge**. They are complementary and could share TUI affordances, but neither blocks the other. Phase 2d's `EventMsg::AskUserQuestion` variant in `codex-protocol` is a precise structural sibling to a future `EventMsg::McpServerNotification`.

---

## 5 · Gap analysis

The goal stated in the task is: *MCP servers can push messages back / stream state changes / interrupt the agent.* Decomposing that goal against current codex state:

| Sub-goal | Today | Gap | Fix shape |
|---|---|---|---|
| Server pushes typed messages to the agent | Wire works, handler logs only | **Handler→agent bridge missing** | Bridge `LoggingClientHandler` methods through `tx_event` |
| Server pushes state changes (`*/list_changed`, `resources/updated`) | Decoded, logged | Bridge missing | Same |
| Server asks the user a question | ✅ elicitation works | — | — |
| Server asks the client to invoke its LLM (sampling) | Not implemented | `Service::handle_request` for `sampling/createMessage` missing | Add a handler symmetrical to elicitation |
| Server interrupts agent reasoning mid-LLM-call | Not possible; MCP spec offers nothing | **Spec-level gap**; only soft-interrupt feasible | Treat as policy: agent's main loop decides whether a pushed notification triggers a checkpoint between turns |
| Server pushes a Claude-style "channel" chat message that enters the prompt queue | Not possible | App-layer envelope + agent-loop policy | Define `experimental["codex/channel"]` capability + an `EventMsg::McpChannelMessage` that the agent loop treats as a queued prompt |

**No transport upgrade is required.** No new MCP spec contribution is required. No new overlay crate is *necessary* for the minimal patch — the patch is small enough to fit as a direct edit to two upstream files (`logging_client_handler.rs` and `connection_manager.rs`) plus a new module under `rmcp-client/src/` and an additive `EventMsg` variant in `codex-protocol`. Whether to absorb that as an overlay crate or as a `// SANDBOX PATCH:` is a tradeoff covered in §6.3.

---

## 6 · Implementation sketch (no code; file:line targets + tradeoffs)

> Per the minimize-conflict-surface tenet (`plans/codexu-roadmap.md:190–228`), all proposals favor **new files** over **edits to upstream-canonical files**. Where an edit is unavoidable, it must be a minimal seam.

### 6.1 The minimum viable patch (codex-side)

**Goal:** route the seven existing logging-only notification handlers through the agent event sink, and add a `sampling/createMessage` request handler for symmetry with elicitation.

1. **New file** `rmcp-client/src/notification_bridge.rs` (≈100–150 LOC):
   - Holds an `async_channel::Sender<Event>` (cloned from `connection_manager.rs:175`'s `tx_event`).
   - Exposes a small struct `NotificationBridge` with methods `forward_progress`, `forward_cancelled`, `forward_resource_updated`, `forward_list_changed`, `forward_logging_message`.
   - Each method packages the notification params into a new `EventMsg::McpServerNotification` variant and sends to `tx_event`. Drops (with `tracing::warn!`) if the sink is closed — never blocks the rmcp service loop.

2. **Minimal seam in upstream file** `rmcp-client/src/logging_client_handler.rs:49–135`:
   - Add an optional `Arc<NotificationBridge>` field on the handler struct.
   - In each of `on_progress` / `on_cancelled` / `on_resource_updated` / `on_resource_list_changed` / `on_tool_list_changed` / `on_prompt_list_changed` / `on_logging_message`, *append* a `bridge.forward_…(...)` call after the existing `tracing` line.
   - Net diff: ~12 lines, additive only. Mark with `// SANDBOX PATCH: <ref to patch-surface.md row>` comments per tenet rule 3.
   - Alternative if absolute zero-edit is required: introduce a new `Service` impl `BridgedClientService` in `rmcp-client/src/bridged_client_service.rs` that wraps the existing handler. Swap the constructor call in `rmcp_client.rs:398–402` (still a one-line edit, but in a different file). Whichever approach minimises future-rebase delta — the operator picks at planning time.

3. **Minimal seam in upstream file** `rmcp-client/src/elicitation_client_service.rs:69–90`:
   - Add a parallel `handle_request` branch for `ServerRequest::CreateSamplingMessageRequest` that emits `EventMsg::McpSamplingRequest` over `tx_event` (using the elicitation oneshot pattern). Net diff: ~30 lines.

4. **Constructor wiring** `codex-mcp/src/connection_manager.rs:175` (already takes `tx_event`):
   - Pass `tx_event.clone()` into a new `NotificationBridge::new(tx_event)` and forward to `RmcpClient` constructors at `connection_manager.rs:567–602`. Net diff: ~5 lines additive.

5. **Protocol additions** `codex-protocol/src/protocol/mod.rs` (or the `events.rs` submodule — locate at planning time):
   - Add `EventMsg::McpServerNotification { server: String, kind: McpNotificationKind, params: serde_json::Value }`.
   - Add `EventMsg::McpSamplingRequest { server: String, request_id: ..., params: ..., reply: oneshot::Sender<...> }` mirroring elicitation.
   - Bump the protocol version per the existing patch-surface convention; document in `codex/docs/implementation/patch-surface.md`.

6. **App-server forwarding** (`codex-rs/app-server/...`):
   - The existing `EventMsg` fan-out already serialises events to app-server clients (happy-cli, TUI). New variants will appear automatically if `serde` derives are in place. Verify with a fixture test.

7. **Feature flag** `core/src/session/features.rs` (or equivalent — Feature enum location to verify at planning time):
   - `Feature::McpServerNotifications`. Default off. Gate `NotificationBridge::forward_*` on the flag.

### 6.2 The "channels" extension on top (Claude-Code-parity layer)

Once §6.1 lands, a Claude-Code-parity "channels" primitive is a thin app-layer addition:

- **Capability key** `experimental["codex/channel"]` advertised by participating servers (parallel to Claude's `claude/channel`). Discovery happens during MCP `initialize` — no new RPC.
- **Notification methods** `notifications/codex/channel` and `notifications/codex/channel/permission` mirroring Claude Code's shape; codex would use its own namespace rather than reusing `claude/*` (avoid cross-vendor naming collisions, and the wire is incompatible with Claude's GrowthBook gating anyway).
- **Handler path**: extend `NotificationBridge` with `forward_channel_message` and `forward_channel_permission`; emit `EventMsg::McpChannelMessage` and `EventMsg::McpChannelPermissionReply`.
- **Agent-loop policy**: when an `McpChannelMessage` arrives between turns, enqueue as a prompt with the equivalent of Claude Code's `priority: "next"` semantics. When one arrives *during* an LLM call, buffer until the call completes (matches Claude Code's behaviour — channels never preempt mid-turn).
- **Permission gating**: out of scope for the first cut. If/when codex grows a real interactive permission dialog with race resolution (codex has approval modes, not Claude-style real-time dialogs), the permission half of channels can land. Track as a follow-up, not a blocker.

### 6.3 Overlay-crate vs upstream-patch decision

The minimize-conflict-surface tenet (`plans/codexu-roadmap.md:190–228`) prefers new packages in `codex/codex-rs-overlay/`. Two viable shapes:

| Option | Pros | Cons |
|---|---|---|
| **Overlay crate** `codex-rs-overlay/codex-mcp-bridge/` containing `NotificationBridge` + new `EventMsg` glue. The only upstream-canonical edits are the constructor wiring in `connection_manager.rs:175` and the optional handler-field hook in `logging_client_handler.rs:49–135`. | Zero conflict surface on rebase for the bulk of the code. Follows the precedent of `codex-copilot/` (overlay lib with a tiny constructor hook). | The `EventMsg` enum and the `Service` trait impls live in upstream crates and *must* be edited; the overlay can hold helpers but not the trait impl. Some duplication. |
| **Inline patch** with `// SANDBOX PATCH:` markers in `logging_client_handler.rs` + `elicitation_client_service.rs` + new sibling file `rmcp-client/src/notification_bridge.rs`. Patch surface row in `codex/docs/implementation/patch-surface.md`. | One coherent change, lives next to the code it modifies. | Two upstream files carry diffs; future `rmcp` 0.16+ rebases will need re-application. |

**Recommendation:** overlay-crate for `NotificationBridge` + the new `EventMsg` variants in `codex-protocol` (additive, low-rebase-risk), with **two** minimal seams in `logging_client_handler.rs` and `elicitation_client_service.rs` marked as sandbox patches. This is the same shape as `codex-copilot/` (overlay lib + tiny upstream hook) and respects rule 2 of the tenet while accepting rule 3 for the unavoidable seams. Surface to operator before implementation.

### 6.4 Risk areas

1. **Backpressure in `tx_event`.** The elicitation path drops the message and logs if `tx_event` is closed (`elicitation.rs:113–115`). The new bridge must do the same — *never* await a full channel from inside the rmcp service loop, or stdout reads back up and stalls every other tool call.
2. **Lock contention.** `McpConnectionManager` is `Arc<RwLock<...>>` inside the session (`core/src/session/session.rs:821`). Notification handlers must not re-enter the manager (`call_tool`, etc.) under any lock held by the service loop. Keep handlers lock-free: send to `tx_event` and return.
3. **Event volume.** A chatty `notifications/progress` server can flood `tx_event`. Cap with a per-server token bucket in `NotificationBridge` (e.g., 100 events/s, drop with a counter for diagnostics). Tunable; default conservative.
4. **Protocol-version bump.** Adding `EventMsg` variants is additive but consumers must tolerate unknown variants. Verify happy-cli and TUI's `EventMsg` decoders skip-on-unknown rather than hard-failing.
5. **Feature-flag drift.** The existing invariant tests (`codex-rs-overlay/codex-invariant-tests/`) currently include "background notifications" coverage (Invariant #16–17 per agent 2's report). Add a new invariant test asserting the bridge is off by default and only forwards when `Feature::McpServerNotifications` is set.
6. **`sampling/createMessage` is sharp.** Sampling lets the server *call the client's LLM* — a server with bad intent could exfiltrate via prompt injection or rack up token cost. Default off, OAuth-only, per-server allowlist before this lands. Mirror Claude Code's multi-gate approach (`channelNotification.ts:191–316`) at least at the auth + allowlist tiers.
7. **Naming.** Don't reuse `claude/channel`; use `codex/channel`. Cross-vendor experimental keys are not coordinated and the wire formats may diverge.

### 6.5 Effort estimate

Assuming the §6.1 minimum patch (no §6.2 channels yet):

| Item | Estimate |
|---|---|
| `NotificationBridge` overlay crate | 0.5 d |
| `EventMsg` variants + protocol bump + serde + tests | 0.5 d |
| Sandbox-patch seams in `logging_client_handler.rs` + `elicitation_client_service.rs` (incl. patch-surface.md row) | 0.5 d |
| `sampling/createMessage` handler (parallel to elicitation) | 0.5 d |
| App-server fan-out smoke test (one fixture covering progress + tool-list-changed) | 0.5 d |
| Feature flag wiring + invariant test | 0.5 d |
| Documentation in `codex/docs/implementation/architecture.md` | 0.25 d |
| **Subtotal** | **~3.25 d engineering** |
| Buffer for rebase / review / cross-crate cargo build pain | ~1.5 d |
| **Total** | **~3–5 d wall** |

§6.2 channels-on-top adds ~1.5–2 d more (capability advertisement, channel-specific `EventMsg`, agent-loop prompt-queue policy, one happy-app rendering shim if a mobile-side surface is wanted).

---

## 7 · Recommendation + follow-up tasks

**Recommendation:** proceed in two stages.

1. **Stage A — `mcp-server-notifications`** (concrete, ralph-able): land the §6.1 minimum patch. Routes existing MCP notifications + sampling into the codex agent event loop, feature-gated, with the elicitation precedent as the model. ~3–5 d. Unblocks `async-events-design` directly (long-poll MCP notifications become a viable async-event transport).

2. **Stage B — `codex-channels`** (deferred, decision required first): once Stage A is live, decide whether to ship a Claude-Code-parity "channels" envelope (`experimental["codex/channel"]` + prompt-queue policy + optional permission relay). The architectural question for the operator is *whether channels are the right primitive for the use cases* — Stage A's notifications cover state-change push perfectly; channels are specifically for "external user pipes messages into the agent's prompt queue," which has narrower applicability.

**Spec contribution:** none required. The MCP spec already has the right primitives; the gap is local to codex.

**Cross-task implications:**
- `agent-comms` (Scope A/B/C, blocked on plugin-scope-agents + channels-research) — Stage A's `EventMsg::McpServerNotification` is a viable transport for Scope B (same-daemon agent-to-agent) when the sending agent owns the MCP server side and the receiving agent's session subscribes. Worth discussing in `agent-comms` design.
- `async-events-design` (blocked on channels-research) — unblocked by the *conclusion* of this doc; can begin design even before Stage A lands. The doc gives `async-events-design` a clear transport option to compare against the alternatives.
- `roadmap-plugin` — uses MCP stdio. Doesn't need this work, but could later use Stage A to push live "task updated" events to subscribed agents.

---

## 8 · Sources

### Claude Code source (read-only, `D:/harness-efforts/claude-code/worktrees/main/`)
- `src/services/mcp/channelNotification.ts:37–316`
- `src/services/mcp/channelPermissions.ts:1–241`
- `src/services/mcp/channelAllowlist.ts`
- `src/services/mcp/elicitationHandler.ts:1–314`
- `src/services/mcp/client.ts:673–904`
- `src/hooks/useManageMCPConnections.ts:470–706`

### Codex source (read-only per minimize-conflict-surface, `codex/external/repos/codex-patched/codex-rs/`)
- `rmcp-client/Cargo.toml:33–43` — transport feature flags
- `rmcp-client/src/rmcp_client.rs:77–91, 273–434, 824–864` — `RmcpClient`, transport enum, service-loop spawn
- `rmcp-client/src/elicitation_client_service.rs:1–108` — service trait impl
- `rmcp-client/src/logging_client_handler.rs:49–135` — notification handlers (logging only)
- `codex-mcp/src/connection_manager.rs:175, 309, 567–695` — manager, `tx_event` sink, `call_tool`
- `codex-mcp/src/rmcp_client.rs:88–98` — `ManagedClient` wrapper
- `codex-mcp/src/elicitation.rs:103–231` — `ElicitationRequestManager`, the working bidirectional precedent
- `core/src/session/session.rs:821` — session-side `Arc<RwLock<...>>` over the manager

### Codex overlay crates (`codex/codex-rs-overlay/`)
- `codex-copilot/`, `codex-copilot-launcher/`, `codex-invariant-tests/` — overlay-crate precedents

### Local planning context
- `plans/codexu-roadmap.md:190–228` — minimize-conflict-surface tenet
- `plans/codexu-roadmap.md:415–447` — agent-arch workstream (this task's parent)
- `plans/codexu-roadmap.md:1602–1832` — Phase 2d `ask_user_question` spec
- `plans/parallel-assignments.md:254–294` — `agent-comms`, `channels-research`, `async-events-design` task entries
- `codex/docs/implementation/patch-surface.md` — patch-surface registry (target for sandbox-patch row)

### MCP spec (current revision 2025-11-25 as of 2026-05-13)
- [Specification index](https://modelcontextprotocol.io/specification/2025-11-25)
- [Base protocol / messages](https://modelcontextprotocol.io/specification/2025-11-25/basic)
- [Transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) — stdio + Streamable HTTP
- [Lifecycle & capability negotiation](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)
- [Tasks utility (experimental)](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks)
- [Server features overview](https://modelcontextprotocol.io/specification/2025-11-25/server)
- [Changelog 2025-06-18 → 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/changelog)
- [SEP-1288 WebSocket transport (draft)](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1288)
- [SEP-1686 Tasks](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1686)
- [2026 MCP Roadmap](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/)
- [Exploring the Future of MCP Transports (Dec 19, 2025)](https://blog.modelcontextprotocol.io/posts/2025-12-19-mcp-transport-future/)
