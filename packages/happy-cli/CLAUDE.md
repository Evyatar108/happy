# Happy CLI Codebase Overview

## Project Overview

Happy CLI (`handy-cli`) is a command-line tool that wraps Claude Code to enable remote control and session sharing. It's part of a three-component system:

1. **handy-cli** (this project) - CLI wrapper for Claude Code
2. **handy** - React Native mobile client
3. **handy-server** - Node.js server with Prisma (hosted at https://api.happy-servers.com/)

## Code Style Preferences

### TypeScript Conventions
- **Strict typing**: No untyped code ("I despise untyped code")
- **Clean function signatures**: Explicit parameter and return types
- **As little as possible classes**
- **Comprehensive JSDoc comments**: Each file includes header comments explaining responsibilities.
- **Import style**: Uses `@/` alias for src imports, e.g., `import { logger } from '@/ui/logger'`
- **File extensions**: Uses `.ts` for TypeScript files
- **Export style**: Named exports preferred, with occasional default exports for main functions

### DO NOT

- Create stupid small functions / getters / setters
- Excessive use of `if` statements - especially if you can avoid control flow changes with a better design
- **NEVER import modules mid-code** - ALL imports must be at the top of the file

### Error Handling
- Graceful error handling with proper error messages
- Use of `try-catch` blocks with specific error logging
- Abort controllers for cancellable operations
- Careful handling of process lifecycle and cleanup

### Testing
- Unit tests using Vitest
- No mocking - tests make real API calls
- Test files colocated with source files (`.test.ts`)
- Descriptive test names and proper async handling
- On Windows/Git Bash, run the package test script as `npm_config_script_shell=bash pnpm --filter happy test` so `$npm_execpath` expands correctly.
- For file-scoped CLI validation, use `pnpm --filter happy exec vitest run <paths>`; passing paths through the package `test` script can still invoke the broader suite.

### Logging
- All debugging through file logs to avoid disturbing Claude sessions
- Console output only for user-facing messages
- Special handling for large JSON objects with truncation

### Dev Tunnels
- `src/tunnel/tunnelManager.ts` owns Microsoft Dev Tunnel CLI calls. Keep subprocess access injectable through `CommandRunner`/`ProcessSpawner` so renewal and reuse behavior can be unit-tested without creating real tunnels.
- The Dev Tunnels CLI uses `--port-number` for both `devtunnel port create` and `devtunnel host`; `--port` is not accepted by current Windows builds.

## Architecture & Key Components

### 1. API Module (`/src/api/`)
Handles server communication and encryption.

- **`api.ts`**: Main API client class for session management
- **`apiSession.ts`**: WebSocket-based real-time session client with RPC support
- **`auth.ts`**: Authentication flow using TweetNaCl for cryptographic signatures
- **`encryption.ts`**: End-to-end encryption utilities using TweetNaCl
- **`types.ts`**: Zod schemas for type-safe API communication

**Key Features:**
- End-to-end encryption for all communications
- Socket.IO for real-time messaging
- Optimistic concurrency control for state updates
- RPC handler registration for remote procedure calls

### 2. Claude Integration (`/src/claude/`)
Core Claude Code integration layer.

- **`loop.ts`**: Main control loop managing interactive/remote modes
- **`types.ts`**: Claude message type definitions with parsers

- **`claudeSdk.ts`**: Direct SDK integration using `@anthropic-ai/claude-code`
- **`interactive.ts`**: **LIKELY WILL BE DEPRECATED in favor of running through SDK** PTY-based interactive Claude sessions
- **`watcher.ts`**: File system watcher for Claude session files (for interactive mode snooping)

- **`mcp/startPermissionServer.ts`**: MCP (Model Context Protocol) permission server

**Key Features:**
- Dual mode operation: interactive (terminal) and remote (mobile control)
- Session persistence and resumption
- Real-time message streaming
- Permission intercepting via MCP [Permission checking not implemented yet]

### Permission Mode Protocol

The Happy wire protocol uses a 7-mode permission enum: `default`, `acceptEdits`, `bypassPermissions`, `plan`, `read-only`, `safe-yolo`, and `yolo`. Claude Code's SDK accepts a smaller 4-mode enum, so Claude-specific mapping stays in `src/claude/permissions.ts` via `mapToClaudeMode(...)`; do not pass app wire keys directly to the SDK.

Claude and Codex runners publish their effective mode to session metadata as `currentPermissionModeCode`. Claude seeds the initial value in the metadata object passed to `api.getOrCreateSession(...)`, then publishes later changes through `publishPermissionModeIfChanged(...)`. Codex publishes explicit user picks through the same helper, and also publishes an initial `yolo` once after `client.connect()` when Happy's sandbox forces full-access behavior.

`publishPermissionModeIfChanged(...)` intentionally mutates the runner-local metadata object before awaiting `updateMetadata(...)`. That ordering keeps the offline-reconnect seed metadata current because reconnect paths reuse the same object by reference.

Live drawer config changes arrive through `ApiSessionClient.onAgentConfiguration(...)`, which diffs decrypted `update-session` metadata fields (`currentModelCode`, `currentPermissionModeCode`, `currentThoughtLevelCode`) and notifies provider runners. The `agent-configuration-changed` envelope is schema-only in this slice; CLI control consumption is metadata-driven and must not emit a raw session-event audit envelope unless a future active-turn audit story explicitly adds it.

Absence of `currentPermissionModeCode` is meaningful: it represents "no opinion yet", which lets the app avoid overwriting a CLI-owned mode until the user explicitly picks one. More detail is in `.ralph/jobs/preserve-permission-mode-layer1/plan.md`.

**Title-event normalization:** Claude JSONL `custom-title` and `ai-title` records do not carry `uuid`/`leafUuid`/`timestamp`. Normalize them into synthetic `summary` messages before mapper/API handling, and use deterministic `leafUuid` values derived from `sessionId` (for example `custom-title:${sessionId}`) so scanner dedup and metadata writes stay idempotent.

**Launcher parity:** `claudeLocalLauncher.ts` should forward the session scanner output verbatim, including `summary` messages. Remote mode already forwards everything, and local-only summary filtering breaks chat-title updates from SDK summaries and normalized `/rename` title events.

**Claude switch model:** local Claude uses explicit `request-switch` RPCs plus per-message dispatch instead of a queue-level auto-switch callback. `request-switch({ mode: 'now' })` delegates to the existing local-to-remote switch path and preserves the queued app message; `request-switch({ mode: 'when-idle' })` records `Session.pendingSwitch` only while a local turn is active, otherwise it switches immediately with a completed status. The app marks only deferred sends with `meta.capabilities.deferredSwitch`; tag-less messages keep the legacy immediate-switch behavior through `Session.notifyLegacyMessageBeforeQueue()`.

**Claude hook settings:** `generateHookSettings.ts` appends Happy's `SessionStart`, `PreCompact`, `PostCompact`, `Stop`, `UserPromptSubmit`, and `Notification` hooks while preserving existing user hooks. Use `PostCompact trigger=auto` for automatic-compaction boundaries; manual `/compact` stays on the explicit slash-command path. Local Claude turn lifecycle is hook-driven: `UserPromptSubmit` marks `Session.turnActive = true`, `Stop` marks it false and can fire a deferred switch, `Notification` (permission prompt / idle wait / plan-mode confirm) ALSO triggers the deferred switch when `pendingSwitch` is armed — both routes share the same `pendingStopSwitchInFlight` guard so `performSwitch('completed')` fires at most once per turn; fd3 fetch-start/fetch-end only drives `thinking`.

**Deferred switch lifecycle:** `claudeLocalLauncher.ts` owns `Session.switchFired` and `Session.deferredSwitchCompleting` as local-launcher state. Reset both at launcher entry, set `switchFired` before any awaited switch work, and set `deferredSwitchCompleting` only when `performSwitch` observes a live `pendingSwitch`. `cancel-pending-switch` resets the queue only while `pendingSwitch` is still set; stale cancels in the completion window must leave `deferredSwitchCompleting` untouched so a late tagged message can still enqueue.

**pendingSwitch clear paths:** `pendingSwitch` is cleared by four paths: the `Stop` hook firing `performSwitch('completed')`, the `Notification` hook firing `performSwitch('completed')` (permission prompt, idle wait, or plan-mode confirm — added so paused-but-not-ended turns still hand off cleanly), an explicit `request-switch({ mode: 'now' })` (Take over now), or `cancel-pending-switch` (Cancel switch in the sticky banner). The Notification path closes the v1 gap where a permission stall would have kept `pendingSwitch` armed indefinitely; the in-flight remote SDK Claude resumes via `--resume` and re-issues the permission via its `canUseTool` callback so the app can answer.

**Codex exclusion:** the deferred switch protocol is Claude-only in v1. Do not register `request-switch` or `cancel-pending-switch` in `packages/happy-cli/src/codex/runCodex.ts`; Codex has no Claude-style `Session`/local-launcher/remote-launcher split. A purpose-built Codex deferred-takeover model is deferred in `.ralph/jobs/preserve-turn-on-mode-switch/plan.md` under the Codex open question.

**Codex fork effort transport:** fork/resume launches use the CLI argument path for initial reasoning effort: `buildResumeLaunch(..., { effortLevel })` appends `--effort <level>` to `happy codex --resume ...`, `commands/codexCommand.ts` parses it, and `runCodex.ts` seeds `currentThinkingLevel` before user messages are queued. Prefer this path over live-config prewrites for fork startup because it reaches the child process before session connection, daemon notification, or the first turn.

**Codex fork-into-worktree RPC:** `ApiMachineClient` registers `fork-into-worktree` for Codex-only session forks. The daemon validates that the selected worktree already exists, fetches the parent server metadata, builds a fresh `happy codex --resume ...` launch with the chosen cwd/model/permission/effort, and spawns a new tracked Happy process. This is clone semantics, not reconnect semantics: strip every env var matching `FORK_ENV_DENYLIST_PATTERN` (`/^HAPPY_(RECONNECT|DAEMON_PRIVATE)_/`) in `src/daemon/forkSession.ts` from the child process and set only `HAPPY_FORKED_FROM_SESSION_ID=<parent local Happy session id>` for fork attribution. When introducing any new env prefix scoped to the daemon process or to a reconnect path, extend that pattern so fork children continue to be spawned with a clone-clean env.

**Codex fork boundary attribution:** `runCodex.ts` reads `HAPPY_FORKED_FROM_SESSION_ID` at startup and, after `resumeExistingThread()` has returned the new Codex thread id, emits `sendContextBoundary({ kind: 'session-fork-resume', forkedFromSid })` when the env var is present. Keep using the shared `HAPPY_FORKED_FROM_SESSION_ID` constant from `src/utils/envNames.ts` on writer and reader sides.

**Codex patch approvals:** approval request payloads must be immutable snapshots. `codexAppServerClient.ts` snapshots file changes from `rawFileChangesByItemId` before invoking the approval handler, and `runCodex.ts` snapshots again before creating `CodexPatch` input for `BasePermissionHandler`; do not hand renderer-bound approval state a live map reference.

**Context-boundary emission:** lifecycle signals must go through `ApiSessionClient.sendContextBoundary()` so the typed envelope, legacy dual-emit fallback, and `metadata.latestBoundary` update stay in lockstep. The helper sends the typed `context-boundary` envelope first, then the legacy compatibility event with `meta.contextBoundaryFallback: true`; app clients suppress that flagged fallback. If a Claude log mapper detects a boundary-worthy tool call, return a boundary intent from the mapper and route it through `sendContextBoundary()` in `apiSession.ts`; do not emit a `context-boundary` envelope directly from the mapper.

**Non-renderable Claude JSONL filter:** the shared registry lives in `packages/happy-wire/src/nonRenderablePolicy.ts`. `ApiSessionClient.sendClaudeSessionMessage(...)` in `src/api/apiSession.ts` must call `findSenderDropEntry(body)` at the very top, before `normalizeSessionLogMessage(...)`, mapper calls, envelope creation, or outbox enqueue. The sender contract is deliberately strict: it drops only whole raw `type === 'user'` messages that are known non-renderable (`skill-body` and standalone `local-command-caveat` in v0), and logs only `{ class: entry.name }` for privacy. The receiver contract stays more permissive: happy-app imports the same registry and still strips matching render-time artifacts as defense in depth for old stored sessions and SDK drift.

Empirical v0 policy snapshot:

| Date | Command | Class | Result | Sender policy | Rationale |
|---|---|---|---|---|---|
| 2026-05-01 | `grep -cE '<(system-reminder|local-command-caveat|fork-boilerplate)>' ~/.claude/projects/<recent>.jsonl` | `local-command-caveat` | observed in recent JSONL (sample count 1) | Drop at sender | Whole-message caveat is Claude-only instruction text with no human value. |
| 2026-05-01 | same | `system-reminder` | 0 in sampled recent file | Receiver-only | Keep sender narrow; empirical sender sightings were not enough to justify encrypted-outbox dropping. |
| 2026-05-01 | same | `fork-boilerplate` | 0 in sampled recent file | Receiver-only | Fork-child scaffolding remains render-time cleanup unless it appears as a whole raw sender artifact. |
| 2026-05-01 | not XML, identified from Skill tool JSONL shape | `skill-body` | observed as post-Skill `SKILL.md` body injection | Drop at sender | The Skill ToolView already represents the user-visible action; the injected body is duplicate implementation text. |

Do not add `thinking` blocks to the non-renderable sender policy. Extended thinking is renderable user value gated in the app, and the carve-out is cross-linked from `docs/plans/render-extended-thinking-optional.md`.

**Wrapped-slash-command detection (F-012 / F-013):** Claude Code's TUI / SDK wraps slash commands as `<command-name>/clear</command-name>\n<command-message>clear</command-message>...` before forwarding them through both the inbound socket message channel AND the JSONL stream. Two detection sites must stay in sync, and **production traffic flows through the second one**:

1. **Inbound (`parseSpecialCommand` in `parsers/specialCommands.ts`):** matches both the literal `/clear` form AND the `<command-name>/clear</command-name>` wrapped form. Same for `/compact`. Used by `claudeRemote.ts:98` and `runClaude.ts:338` for messages received over the CLI socket.

2. **JSONL replay (`detectWrappedSlashCommandBoundary` in `claude/utils/sessionProtocolMapper.ts`):** the **actual production path** — by the time the SESSION_SCANNER picks up the JSONL line, Claude Code has already executed the slash command, so the boundary is real. The mapper's user-message branch checks for the wrapped form and pushes a `kind: 'clear' | 'compact'` intent into the `boundaries` array, which then routes through `sendContextBoundary()` via `sendClaudeSessionMessage`. **If you only patch the inbound parser and not the mapper, tablet-typed `/clear` will silently slip past — the inbound path isn't on the JSONL replay flow.** Verified in production logs after evy.7 (parser-only) and fixed in evy.9 (mapper).

### 3. UI Module (`/src/ui/`)
User interface components.

- **`logger.ts`**: Centralized logging system with file output
- **`qrcode.ts`**: QR code generation for mobile authentication
- **`start.ts`**: Main application startup and orchestration

**Key Features:**
- Clean console UI with chalk styling
- QR code display for easy mobile connection
- Graceful mode switching between interactive and remote

### 4. Core Files

- **`index.ts`**: CLI entry point with argument parsing
- **`persistence.ts`**: Local storage for settings and keys
- **`utils/time.ts`**: Exponential backoff utilities

## Data Flow

1. **Authentication**: 
   - Generate/load secret key → Create signature challenge → Get auth token

2. **Session Creation**:
   - Create encrypted session with server → Establish WebSocket connection

3. **Message Flow**:
   - Interactive mode: User input → PTY → Claude → File watcher → Server
   - Remote mode: Mobile app → Server → Claude SDK → Server → Mobile app

4. **Permission Handling**:
   - Claude requests permission → MCP server intercepts → Sends to mobile → Mobile responds → MCP approves/denies

## Key Design Decisions

1. **File-based logging**: Prevents interference with Claude's terminal UI
2. **Dual Claude integration**: Process spawning for interactive, SDK for remote
3. **End-to-end encryption**: All data encrypted before leaving the device
4. **Session persistence**: Allows resuming sessions across restarts
5. **Optimistic concurrency**: Handles distributed state updates gracefully

## Security Considerations

- Private keys stored in `~/.handy/access.key` with restricted permissions
- All communications encrypted using TweetNaCl
- Challenge-response authentication prevents replay attacks
- Session isolation through unique session IDs
- `writeFile` RPC `createParents: true` is only for `.happy/attachments/*` targets and must keep both gates: lexical attachments allowlist plus `validatePathRealpath(...)` symlink/realpath confinement before directory creation.
- Message metadata fields shared with the app must be added to every `MessageMetaSchema` copy: `packages/happy-app/sources/sync/typesMessageMeta.ts`, `packages/happy-wire/src/messageMeta.ts`, and `packages/happy-cli/src/api/types.ts`; otherwise Zod parsing strips the field on at least one side.

## Dependencies

- Core: Node.js, TypeScript
- Claude: `@anthropic-ai/claude-code` SDK
- Networking: Socket.IO client, Axios
- Crypto: TweetNaCl
- Terminal: node-pty, chalk, qrcode-terminal
- Validation: Zod
- Testing: Vitest 


# Running the Daemon

## Starting the Daemon
```bash
# From the happy-cli directory:
./bin/happy.mjs daemon start

# With custom server URL (for local development):
HAPPY_SERVER_URL=http://localhost:3005 ./bin/happy.mjs daemon start

# Stop the daemon:
./bin/happy.mjs daemon stop

# Check daemon status:
./bin/happy.mjs daemon status
```

## Daemon Logs
- Daemon logs are stored in `~/.happy-dev/logs/` (or `$HAPPY_HOME_DIR/logs/`)
- Named with format: `YYYY-MM-DD-HH-MM-SS-daemon.log`

# Known offline-catchup gap (Claude + Codex)

happy-cli today does NOT catch up agent-CLI activity that happened while it was offline. The gap shape differs per agent:

- **Claude**: `processedMessageKeys` in `claude/utils/sessionScanner.ts:35` is in-memory only; on cold-start the scanner only watches sids registered via Claude's `SessionStart` hook (i.e., sessions launched by happy-cli itself). A bare `claude` invocation outside happy-cli writes to its own JSONL with a sid happy-cli never learns about. Orphan JSONLs are invisible. Server dedup is by `localId` (random `randomUUID()` per `enqueueMessage` at `apiSession.ts:402-412`), NOT by wire/realID — so naive re-forwarding on a future restart would create server-side duplicates. No persisted scanner offset on disk.
- **Codex**: architecturally different — happy-cli spawns or reattaches to `codex app-server` from the `CodexAppServerClient.connect` transport branch in `codex/codexAppServerClient.ts` and consumes JSON-RPC over either of two adapters: a loopback WebSocket (default; `--listen ws://127.0.0.1:<port>` via `createWsTransport`) or newline-delimited stdio (opt-in via `--codex-transport stdio`, and auto-forced when sandbox is enabled on non-Windows so the seatbelt-wrapped child stays on stdio). In ws mode, a detached app-server can outlive the foreground happy-cli process and be rediscovered from `~/.happy/codex-active-<cwdHash>.json`; stdio mode remains foreground-process-owned and skips discovery. The remaining gap is "happy-cli crash mid-turn loses any unsent in-memory `pendingOutbox` events" plus "external `codex` invocations are permanently invisible — no rollout-file enumeration in `~/.codex/sessions/`."

## Codex Transport Security Model

The Codex app-server WebSocket transport is loopback-only and per-spawn authenticated. Happy must only bind `codex app-server` to `ws://127.0.0.1:<port>`; never expose it on `0.0.0.0`, LAN addresses, public addresses, or tunnels. Cross-device traffic continues to flow through Happy's encrypted relay, with the CLI as the only local app-server client.

Each ws spawn attempt generates a fresh in-memory capability token. Spawn argv contains only `--ws-auth capability-token --ws-token-sha256 <64-hex-sha256>`; the raw token must not appear in argv, environment variables, URLs, or logs. The ws client sends it only on the upgrade request as `Authorization: Bearer <token>`. Do not set an `Origin` header on the node ws client because upstream rejects origin-bearing requests.

The sandbox override is still authoritative: when Happy sandboxing is enabled on non-Windows, `CodexAppServerClient.connect()` forces stdio and must not generate ws auth args or an Authorization header.

The default transport is ws, but only when the installed `codex app-server --help` advertises `--ws-auth`. Explicit `--codex-transport=ws` fails closed if `--ws-auth` is missing and tells the user to upgrade codex or omit the flag for stdio fallback. Implicit/default ws falls back to stdio for that client instance and emits the one-time warning from `CodexAppServerClient`.

The `--ws-auth` probe result is cached for the lifetime of the `CodexAppServerClient` instance; restart happy (or the daemon) after upgrading the installed codex binary so the new capability is detected.

The ws transport persists a per-realpath(cwd) discovery record at `~/.happy/codex-active-<cwdHash>.json` (or `$HAPPY_HOME_DIR/codex-active-<cwdHash>.json`) after a successful `initialize` handshake. The record stores version, PID, port, startedAt, happy-cli version, canonical cwd, raw capability token, token SHA-256, and `transport: "ws"`. The raw token is intentionally user-profile-local state for reattach; do not log it or copy it outside the profile. The matching `~/.happy/codex-active-<cwdHash>.lock` serializes discovery read/spawn/write and force-restart terminate/delete/respawn flows. That lock is the one-server-per-cwd invariant: no normal connect or force restart may spawn or replace a ws app-server for a cwd without holding it.

The cwd key is always computed by the no-arg discovery helpers from `realpathSync(process.cwd())`. Keep in-tree calls to `cwdHash()`, `discoveryFilePath()`, and `lockFilePath()` no-arg unless there is a test-only reason; mixing explicit and default cwd sources can split the lock key and reintroduce orphan app-server races.

`CodexAppServerClient.connect()` checks the discovery record before spawning. If the PID is alive and the loopback ws endpoint accepts the recorded capability token, it attaches, runs exactly one `initialize` on that connection, and returns without spawning. Stale PID, refused connection, auth failure, or version mismatch deletes or terminates under the held lock as appropriate, then falls through to a fresh spawn. Stdio never writes or reads discovery.

`disconnect()` now preserves the ws app-server by default. Use `disconnect({ terminateAppServer: true })` for cleanup, kill-session, tests, and any restart path that intends to stop the backend. Use bare `disconnect()` for foreground CLI exit when the backend should remain discoverable. Force restart must call `reconnectAndResumeThread({ terminateAppServer: true, skipDiscovery: true })` so the already-held discovery lock covers terminate -> guarded delete -> respawn -> discovery write.

**Spawn env passthrough contract (codexAppServerClient.ts:815-819).** The spawned `codex app-server` child inherits the full parent process env unfiltered by design — only the per-spawn `wsAuthToken` is deliberately kept out (it flows exclusively through the WS upgrade `Authorization: Bearer` header, never through argv or env). This means `OPENAI_API_KEY`, all `HAPPY_*` secrets, and any other parent-process env var pass verbatim to the codex child. The codex child is trusted today (same user, same machine, same trust boundary as happy-cli itself), so this is a contract-risk surface, not an active exposure. Two maintenance rules follow: (1) any future refactor that wraps the codex child in a less-trusted sandbox (third-party process, container with weaker isolation, remote execution) MUST re-derive an explicit env allowlist at that boundary — do not rely on the current passthrough; (2) when introducing new `HAPPY_*` secrets or any other sensitive env var, consider whether it should be filtered out of the codex child env at the same site, on the same principle as `wsAuthToken`.

## Force-Restart and Termination Invariants

- **Effective-transport-before-lock**: "Per-cwd discovery lock acquisition in `reconnectAndResumeThread` is gated on the post-downgrade effective transport returned by `resolveEffectiveTransport()` (capturing both sandbox forcing AND ws-auth-not-available fallback), not the configured `this.transport`."
- **Confirm-dead-before-delete**: "Both `terminateAttachedAppServer` (attached-owner path) and `closeWsChild` (spawned-owner path) throw if the OS PID/child cannot be confirmed dead after SIGKILL grace; discovery is deleted only on confirmed-dead. All non-fire-and-forget callers (version-mismatch, reattach init-failure, public `disconnect({ terminateAppServer: true })`, `reconnectAndResumeThread`, spawn-retry cleanup, initialize-failure outer catch, writeDiscoveryRecord-failure cleanup post-Story-4) propagate the throw — no caller falls through to spawn-fresh while the old server may still be alive. Discovery is preserved on disk for the next invocation to probe-and-reclaim. Only the fire-and-forget `void this.closeWsChild()` in the WS `onClose` handler swallows + calls `clearWsChildState()` (cannot propagate from a fire-and-forget context)."
- **Persist-on-initialized-invocation**: "`connect()` writes the discovery record only after `notify('initialized')` has been invoked. The notification is fire-and-forget (`notify()` at `codexAppServerClient.ts:1508` returns `void` and the underlying `connection.send()` swallows failures), so the invariant is invocation-ordering, not delivery-confirmation. Reordering still narrows the failure window: an in-flight write failure no longer leaves the discovery file pointing at a session that never sent `initialized`."
- **Shared intentional-close gate**: "`intentionalClose` gates BOTH ws and stdio `onClose` handlers; both short-circuit when set."

**`session-fork-resume` is remote-mode only.** The boundary emit on `claude --resume` lives at `claude/claudeRemoteLauncher.ts:363-375`, gated by the live `system.init` SDK message. **Local mode (`claudeLocalLauncher.ts`) does NOT emit `session-fork-resume` AT ALL**, even when Happy IS running and the fork happens live. Move the emit into a shared helper called from both launchers' `onSessionFound` if you touch this area.

Full research, verified findings (file:line), brainstorm history, candidate solutions, and per-agent fix bundles are captured in `docs/plans/offline-catchup-and-sync-architecture.md`. **Read that before proposing any catch-up code change.** The doc identifies four Claude fixes (C-1 persisted scanner offsets, C-2 cold-start orphan-JSONL enumeration, C-3 local-mode `session-fork-resume` parity, C-4 deterministic localId for catch-up) and three Codex fixes (X-1 durable Happy outbox, X-2 thread history import on resume, X-3 local cache of `codexThreadId`), with effort estimates and open decision questions.

# Session Forking `claude` and sdk behavior

## Commands Run

### Initial Session
```bash
claude --print --output-format stream-json --verbose 'list files in this directory'
```
- Original Session ID: `aada10c6-9299-4c45-abc4-91db9c0f935d`
- Created file: `~/.claude/projects/.../aada10c6-9299-4c45-abc4-91db9c0f935d.jsonl`

### Resume with --resume flag
```bash
claude --print --output-format stream-json --verbose --resume aada10c6-9299-4c45-abc4-91db9c0f935d 'what file did we just see?'
```
- New Session ID: `1433467f-ff14-4292-b5b2-2aac77a808f0`
- Created file: `~/.claude/projects/.../1433467f-ff14-4292-b5b2-2aac77a808f0.jsonl`

## Key Findings for --resume

### 1. Session File Behavior
- Creates a NEW session file with NEW session ID
- Original session file remains unchanged
- Two separate files exist after resumption

### 2. History Preservation
- The new session file contains the COMPLETE history from the original session
- History is prefixed at the beginning of the new file
- Includes a summary line at the very top

### 3. Session ID Rewriting
- **CRITICAL FINDING**: All historical messages have their sessionId field UPDATED to the new session ID
- Original messages from session `aada10c6-9299-4c45-abc4-91db9c0f935d` now show `sessionId: "1433467f-ff14-4292-b5b2-2aac77a808f0"`
- This creates a unified session history under the new ID

### 4. Message Structure in New File
```
Line 1: Summary of previous conversation
Lines 2-6: Complete history from original session (with updated session IDs)
Lines 7-8: New messages from current interaction
```

### 5. Context Preservation
- Claude successfully maintains full context
- Can answer questions about previous interactions
- Behaves as if it's a continuous conversation

## Technical Details

### Original Session File Structure
- Contains only messages from the original session
- All messages have original session ID
- Remains untouched after resume

### New Session File Structure After Resume
```json
{"type":"summary","summary":"Listing directory files in current location","leafUuid":"..."}
{"parentUuid":null,"sessionId":"1433467f-ff14-4292-b5b2-2aac77a808f0","message":{"role":"user","content":[{"type":"text","text":"list files in this directory"}]},...}
// ... all historical messages with NEW session ID ...
{"parentUuid":"...","sessionId":"1433467f-ff14-4292-b5b2-2aac77a808f0","message":{"role":"user","content":"what file did we just see?"},...}
```

## Implications for handy-cli

When using --resume:
1. Must handle new session ID in responses
2. Original session remains as historical record
3. All context preserved but under new session identity
4. Session ID in stream-json output will be the new one, not the resumed one
5. After `system.init.session_id` confirms the new sid, emit `kind: 'session-fork-resume'` through `ApiSessionClient.sendContextBoundary()` with `forkedFromSid` set to the previous sid. This preserves the standard dual-emit contract: typed `context-boundary` first, legacy fallback second with `meta.contextBoundaryFallback: true`, plus `metadata.latestBoundary` for clients that cold-start outside the boundary row window.
