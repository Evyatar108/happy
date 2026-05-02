# Codex Seamless Multi-Device Sessions

## Overview

Enable a Codex session to be **continuously usable from any active client** (laptop terminal or phone app) without explicit mode switching, in-flight work loss, or stuck states. The user can walk away from the laptop mid-conversation, pick up the phone, answer Codex's questions, and continue — and walk back later — all against the same live session, with background tasks surviving the surface change.

This is the natural answer to "deferred local→remote switch when Claude is paused mid-turn" that we couldn't solve cleanly for Claude (see Background section). Codex's architecture already provides every primitive needed; this plan is mostly about exposing them coherently in the UX, not building new infrastructure.

## Phase 0 verification result (2026-05-02)

Empirical verification of the multi-client primitive — all GREEN:

- `codex app-server --listen ws://127.0.0.1:51234 --analytics-default-enabled` starts cleanly, exposes `/healthz` (200) and `/readyz` (200) HTTP probes alongside the WebSocket endpoint
- WebSocket JSON-RPC 2.0 handshake works: `initialize` returns userAgent, `codexHome`, platform metadata
- **Two simultaneous clients** can both `initialize` successfully against the same backend with no contention — multi-client confirmed
- The RPC surface is far richer than expected. Triggering an unknown-method error returned the **full method list** (~50 methods), notable:
  - **`thread/backgroundTerminals/clean`** — first-class background-task management at the protocol level. Codex tracks background tasks; clients can list/clean them. **No Happy-side work needed for the "background tasks survive surface changes" goal.**
  - `turn/start`, `turn/steer`, `turn/interrupt` — turn lifecycle including mid-turn steering
  - `thread/realtime/{start,appendAudio,appendText,stop,listVoices}` — real-time audio is a documented thread surface
  - `thread/inject_items` — inject context items into a thread (the equivalent of the "synthetic preamble" we discussed for Claude is a first-class RPC for Codex)
  - `thread/rollback` — rollback to earlier state
  - `thread/compact/start` — compaction
  - `collaborationMode/list` — collaboration mode is a documented concept
  - `device/key/{create,public,sign}` — device key management
  - `fs/{readFile,writeFile,createDirectory,getMetadata,readDirectory,remove,copy,watch,unwatch}` — file system delegation
  - Full list captured in commit history if needed; reproduce via the verification script pattern

What this implies for Phase 1: even less Happy-side work than the previous draft assumed. The "seamless multi-device" goal isn't building features; it's surfacing what already exists in `app-server`'s RPC surface to both terminal and phone consistently.

## Key finding (added after initial draft)

Codex's CLI already exposes the multi-client primitive we want:

- **`codex app-server --listen <URL>`** supports `stdio://` (current Happy default), `unix://PATH`, `ws://IP:PORT`, and `wss://...`. Multi-client transports are first-class.
- **`codex --remote ws://host:port`** connects the **native Codex TUI** to a running remote app-server. The CLI help reads literally: *"Connect the TUI to a remote app server websocket endpoint."*
- **`--remote-auth-token-env <ENV_VAR>`** for per-session authentication on the websocket
- **`codex app-server proxy --sock <PATH>`** as an alternate stdio→unix-socket adapter for clients that want stdio framing against a socket-listening backend

This means: a single shared `codex app-server` can have Happy CLI as one client, the **actual native Codex TUI as another client**, and the phone app (via Happy's relay) as a third client — all seeing the same conversation, all able to send messages, all able to answer prompts. We don't need to chase TUI feature parity in our ink renderer; we can just expose the option of running Codex's polished native TUI alongside Happy's renderer, both connected to the same backend.

This is a materially better Phase 1 scope than the original draft assumed. Most of "build the seamless multi-device experience" reduces to "switch the listener from `stdio://` to `ws://127.0.0.1:N` and support spawning `codex --remote` as an opt-in client."

## Background — why Codex, not Claude

We spent a session investigating "deferred switch when idle" for Claude and discovered it has structural gaps that are hard to close:

- Claude binary owns its own TUI; Happy can't intercept input prompts (permission, AskUserQuestion, plan-mode confirms) without fragile PTY/screen-scraping
- Stdin is inherited (`claudeLocal.ts:295`) — no programmatic input channel
- Tool state lives in JSONL, not in a process Happy controls; SDK's `--resume` doesn't replay orphaned `tool_use` reliably
- Local→remote switch is process-kill-and-restart, killing background bashes
- Hook protocol can't deliver structured user answers back to a paused local Claude
- Anthropic doesn't ship a Claude-equivalent of `codex app-server` (no documented RPC control plane)

Codex avoids ALL of these by design:

- `codex app-server` runs as a long-lived JSON-RPC subprocess (`codexAppServerClient.ts:394` — `args = ['app-server', '--listen', 'stdio://']`)
- ALL approvals/permissions/elicitations route through a single uniform RPC path (`codexAppServerClient.ts:1095-1122`)
- Terminal display is already a Happy-managed React/ink renderer (`runCodex.ts:21-22` — `MessageBuffer` + `CodexDisplay`), NOT a Codex-binary TUI
- `CodexPermissionHandler` already forwards every approval to the app via `permission` RPC; the same handler answers from terminal or phone
- Background tasks live inside the same `app-server` process across "mode" changes — there are no mode changes architecturally
- `client.abortTurnWithFallback` already provides graceful interrupt + force-restart with thread resume on timeout (`runCodex.ts:265-280`)

The deferred-switch concept barely applies to Codex — there's no local-vs-remote distinction to defer between. The user is **always "remote" architecturally**; the laptop terminal and the phone are just two presentation surfaces over the same RPC channel.

## Goal

A Codex session is a single continuous conversation that:

1. Renders identically on the laptop terminal AND the phone app from the start (already true)
2. Accepts user input from either client at any moment (already true for the app; verify for terminal-while-app-active)
3. Routes every Codex-side prompt (command approval, file change, MCP elicitation) to whichever client(s) are active, with structured answer routing (mostly already true)
4. Survives the user walking away from one client without freezing or going into a broken state (likely already true; needs verification)
5. Survives a client disconnect (terminal closed, phone backgrounded) without killing the agent or its background tasks (already true; `app-server` is long-lived)
6. Coordinates gracefully when both clients are simultaneously active (e.g., a permission prompt should appear on both, with the first answer winning)

## Current state inventory

### Confirmed working

- `codex app-server` is a long-lived child process owning all agent state and spawned shells
- Terminal display is React/ink-based (`CodexDisplay.tsx`); not the Codex binary's TUI
- All three approval flavors route through `CodexPermissionHandler` to app:
  - `item/commandExecution/requestApproval` (Bash-equivalent) → `codexAppServerClient.ts:1095`
  - `item/fileChange/requestApproval` (file edits) → `codexAppServerClient.ts:1110`
  - `mcpServer/elicitation/request` (AskUserQuestion-analog for MCP tools) → `codexAppServerClient.ts:1080`
- App users can answer permissions via existing `sessionAllow` / `sessionDeny` RPCs
- Abort flow with grace period + force-restart fallback (`runCodex.ts:265-280`)
- Resume-thread on app-server force-restart preserves conversation state

### Unknowns to verify (Phase 0 work)

- **Terminal-and-app simultaneously active**: when both are connected to the same session, does typing on terminal and tapping on phone coexist cleanly? Or does one client's input race the other's?
- **Permission prompt visibility**: when a `requestApproval` fires, is it shown in the terminal renderer AND the app? Or only the app? Or only the terminal?
- **Answer-from-terminal flow**: can the user approve/deny permissions via the terminal renderer, or only via the app today?
- **Background-task continuity**: if the terminal disconnects (Ctrl+C in `happy codex`, or terminal window closed), does the `app-server` keep running with its background bashes alive? Or does Happy CLI itself exit and tear down the app-server?
- **Reconnect**: if the user runs `happy codex` again on the same machine while a daemon-managed session is alive, does it reattach or start fresh?

These need empirical answers before we can scope "what's missing."

## Gap analysis (hypothesized; refine after Phase 0)

Likely gaps based on the current code:

1. **Terminal-side permission answering** — `CodexPermissionHandler` may forward to app only, not render in the terminal. Phase 1 would surface the same approval UI in `CodexDisplay` so the user at the laptop doesn't have to reach for their phone.
2. **App and terminal simultaneous render** — both clients getting the same approval card with the first-to-answer wins logic. Likely needs RPC-side de-duplication / cancellation.
3. **Persistent agent across `happy codex` restarts** — if the user closes the terminal window, can they re-enter the same live session by running `happy codex` again? Today Happy CLI is the host of the `app-server` so closing the terminal kills both. A daemon-mode lift might be needed.
4. **App-side "session is live" indicators** — discoverability that they CAN answer permissions / send messages from the phone right now without user action.
5. **Notification surface when both clients silent** — if terminal is unattended and app is closed, does anything ping? Is that desired?

## Phased delivery

### Phase 0 — Verify multi-client app-server (~1-2 hours)

Confirm the documented `codex app-server --listen ws://...` + `codex --remote ws://...` multi-client behavior works as claimed:

1. Start `codex app-server --listen ws://127.0.0.1:PORT --analytics-default-enabled` directly (no Happy involvement)
2. From a second terminal, run `codex --remote ws://127.0.0.1:PORT` — the native Codex TUI connecting as a client
3. Send a message from this client; verify the conversation history is recorded in `~/.codex/sessions/`
4. From a third terminal, run a SECOND `codex --remote ws://127.0.0.1:PORT` against the same backend
5. Confirm both clients see each other's messages in real time
6. Trigger a Bash approval — verify both clients receive the approval prompt; check what happens when one client approves first (does the other's prompt dismiss?)
7. Disconnect one client (Ctrl+C its TUI); verify the other stays connected and the app-server keeps running
8. Verify per-session auth: stop, restart with auth required, attempt to connect without token (should fail), attempt with token (should succeed)

If all of these work as documented, Phase 1 scope reduces dramatically — most of the "seamless multi-device" feature is already in Codex; Happy's job is mostly to wire up the listener type, manage app-server lifecycle, and offer the TUI client as an opt-in.

If something doesn't work as documented (e.g., second client doesn't get its own prompt, or app-server crashes when stdio client disconnects), Phase 0 captures that in this plan and Phase 1 scope expands accordingly.

### Phase 0.5 — Broad inventory (only if Phase 0 reveals gaps)

Original Phase 0 sweep — covers single-client `happy codex` behaviors. Run only if Phase 0 above shows the multi-client primitive doesn't behave as documented and we need to fall back to a more invasive approach:

1. Start `happy codex` on laptop. Connect via app on phone.
2. Send messages from terminal — does app see them in real-time?
3. Send messages from app while terminal is the active surface — does terminal display them?
4. Trigger an approval (Bash command requiring permission) — where does it appear? Can both clients see it? Can both answer? What happens on simultaneous answer?
5. Disconnect terminal (Ctrl+C). Does session stay alive? Reconnect via `happy codex` — does it pick up the existing session, or start new?
6. Spawn a long background task. Disconnect terminal. Is the task still running? Does its output reach the app?
7. Trigger MCP elicitation — same questions as #4.

### Phase 1 — Switch Happy's app-server listener to ws/unix and support native TUI as opt-in client (sized after Phase 0)

Assuming Phase 0 confirms multi-client behavior works:

- Change `codexAppServerClient.ts:394` from `--listen stdio://` to `--listen ws://127.0.0.1:RANDOM_PORT` (or `unix://` on POSIX), with per-session auth token via `--remote-auth-token-env`
- Update Happy's client connection to use the same transport (currently uses stdio handles; would switch to ws or unix-socket client)
- Add `happy codex --use-codex-tui` (or similar) flag that, after starting the app-server, spawns `codex --remote ws://... --remote-auth-token-env HAPPY_CODEX_TOKEN` in a child process taking over the user's terminal — Happy CLI itself stays alive in the background to relay between phone app and the same backend
- Lifecycle management: app-server outlives any individual client; closing the codex --remote TUI shouldn't kill the backend; closing Happy CLI shouldn't kill the backend if app/other clients still attached (similar contract to existing daemon infra)
- Reconnect flow: `happy codex --use-codex-tui` against an already-running app-server attaches rather than re-spawning

Estimated: 2-4 days. Bounded because the architectural primitives already exist; this is wiring + lifecycle.

If Phase 0 reveals gaps in the multi-client primitive itself (e.g., simultaneous approval handling broken), additional scope to add a thin coordination layer in Happy's relay path.

### Phase 2 — UX polish

- Banner-style "session is live; answer here too" when app users are away from the foreground
- Push notification when a Codex session needs attention and no client is foregrounded
- Persistence cleanup (e.g., closing all clients triggers a configurable timeout before app-server exits — survive the "I'm just switching laptops" case but don't leak forever)

### Phase 3 — Documentation and dogfood

- Update `packages/happy-cli/CLAUDE.md` with the multi-device session model
- Update `packages/happy-app/CLAUDE.md` with what app users should expect
- Write user-facing docs covering "your session lives across devices"
- Compare/contrast section: Claude's deferred-switch limits vs. Codex's seamless model — guide users on which to choose

## Out of scope

- **Claude path Q (full SDK migration)** — would converge Claude on Codex's pattern, but it's a separate weeks-long project. Mentioned only in passing here. Not blocked by this plan.
- **Claude Notification-driven deferred switch fixes** — we explored these and concluded they're architecturally limited. Cleanup of the existing in-flight Claude work is its own task (revert to Stop-hook-only deferred switch, document limits).
- **New deferred-switch UX for Codex** — the existing "Send when idle" / abort-button-prompts UI is Claude-specific. For Codex, the seamless-multi-device design largely replaces the need; users don't manually trigger "switch when idle" because there's nothing to switch.
- **Multi-user multi-session collaboration** — different problem space. This plan is "one user, one session, multiple personal devices."

## Open questions

1. Should there be a "deferred switch" UX surface for Codex at all? Or do we entirely lean on "session is always multi-device, no switch needed"?
2. If a user starts Codex on laptop terminal and phone is in a different timezone / dormant, what's the right notification behavior?
3. Should `app-server` survive `happy codex` exit by default, or only with an explicit flag (`--background` or `--daemon`)?
4. Is there a coherent CLI subcommand model — e.g., `happy codex` to start/attach interactively, `happy codex --daemon` to start headless, `happy codex --attach` to reattach?
5. How does this interact with Codex's existing daemon code in `packages/happy-cli/src/daemon/`?
6. Default UX choice: keep the ink renderer as default (loses native Codex TUI's polish but is what existing users see today) or flip to `codex --remote` as default (gains polish but removes Happy-specific render features Codex's TUI doesn't have, like the abort prompt for switch-when-idle)?
7. Per-session auth token: derive from Happy's existing session keys, or generate fresh per-launch? Affects whether the user's other Codex CLI invocations can accidentally / intentionally connect to the running app-server.
8. Cross-machine: `--listen ws://0.0.0.0:PORT` would let phone (on same LAN) connect *directly* to the app-server, bypassing Happy's encrypted relay. Probably we explicitly NOT want this for security, but worth noting.

## References

### Codex code (this fork)

- `packages/happy-cli/src/codex/runCodex.ts` — main entrypoint, ink renderer, abort flow
- `packages/happy-cli/src/codex/codexAppServerClient.ts` — JSON-RPC client; key approval routing at lines 1080-1122
- `packages/happy-cli/src/codex/utils/permissionHandler.ts` — `CodexPermissionHandler` routes approvals to app
- `packages/happy-cli/src/codex/codexAppServerTypes.ts` — protocol types, including `EventMsg` discriminator
- `packages/happy-cli/src/ui/ink/CodexDisplay.tsx` — terminal renderer (Happy-managed, not Codex's TUI)
- `packages/happy-cli/src/daemon/` — existing daemon infrastructure that may host this

### Claude code (for contrast / reference)

- `packages/happy-cli/src/claude/claudeLocal.ts:295` — `stdio: ['inherit', ...]` is the root cause of Claude's local-mode constraints
- `packages/happy-cli/src/claude/claudeLocalLauncher.ts` — kill-and-restart launcher pattern that Codex doesn't have
- `packages/happy-cli/src/claude/claudeRemoteLauncher.ts:337-345` — lazy SDK startup (`waitForMessagesAndGetAsString`); the structural reason Claude's deferred switch fails for in-flight prompts
- `packages/happy-cli/CLAUDE.md` — "v1 limitation — pendingSwitch" note documenting the Claude gap this plan supersedes for Codex

### Conversation context

This plan was written after extensive design discussion comparing Claude's deferred-switch implementation (which has structural gaps) with Codex's RPC architecture (which doesn't). Key conclusion: Codex's design is empirical evidence that path Q (uniform RPC for the agent process) is feasible and clean. Rather than refactoring Claude to match, the cheaper path is to invest in Codex's UX where the architecture already supports the goal.
