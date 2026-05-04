# Codex: app-server integration

## How we run Codex

Codex is a **system-wide CLI** (`npm install -g @openai/codex`). We don't bundle it.

At startup, `CodexAppServerClient` spawns `codex app-server` as a child process and talks JSON-RPC 2.0 to it over a `JsonRpcConnection` transport. Two transports are supported: a loopback **WebSocket** (default — `--listen ws://127.0.0.1:<port>`, port chosen by `pickFreeLoopbackPort`) and a **stdio** fallback (`--listen stdio://`, newline-delimited JSON over the child's stdin/stdout). The transport is selected by `--codex-transport=<ws|stdio>`; when the flag is absent both `runCodex.ts` and the `CodexAppServerClient` constructor coalesce to `'ws'`. When Happy's sandbox is enabled on a non-Windows host, ws is forced down to stdio because the sandbox wrapper requires the child's stdio to be wired through. The Codex process manages its own model inference, sandbox, and tool execution; we just send prompts and react to events.

Version check: `codex --version` must report >= 0.100 for app-server support.

## Why app-server (not MCP)

The old `codex mcp-server` integration had three unfixable problems:

1. **Model change = context loss.** `codex-reply` only accepts `{ prompt, threadId }`. No model param. Changing model meant restarting the session.
2. **Permission cancel hangs forever.** MCP SDK's `callTool` waits for a response that never comes after `turn_aborted`. Our AbortController workaround was brittle.
3. **Session ID confusion.** Three different ID fields (`sessionId`, `conversationId`, `threadId`) — only `threadId` worked, and it was undocumented.

`codex app-server` solves all three: per-turn model/policy overrides, clean `turn/interrupt` RPC, single `threadId`.

## Architecture

```
Mobile App → Happy Server → CLI (runCodex.ts) → CodexAppServerClient → codex app-server (child process)
                                                    ↕ JsonRpcConnection (WsTransport | StdioTransport)
                                                    ↕ JSON-RPC 2.0
                                                      • ws (default): ws://127.0.0.1:<port> via pickFreeLoopbackPort
                                                      • stdio (fallback / sandbox-on-non-Windows override):
                                                        newline-delimited JSON over child stdio
                                                  Events ← codex/event/* notifications
                                                  Approvals ← item/commandExecution/requestApproval (server→client RPC)
```

The client has three responsibilities:
- **Lifecycle**: `initialize` handshake → `thread/start` → `turn/start` per message → `turn/interrupt` on abort
- **Events**: Route `codex/event/*` notifications to the event handler (same EventMsg types as old MCP)
- **Approvals**: Respond to server→client RPC requests for command/patch approval

## Transport

The transport is chosen at construction time and used for the lifetime of the connection:

- **`ws` (default)** — `WsTransport` opens a loopback WebSocket to `ws://127.0.0.1:<port>`. The port is chosen by `pickFreeLoopbackPort`, which binds an ephemeral port (port `0`) on `127.0.0.1`, reads the assigned port, closes the socket, and returns the number; it retries up to 3 times on `EADDRINUSE`. The child is spawned with stdout/stderr redirected to a per-session log file under `configuration.logsDir` (path: `codex-app-server-<sessionTag>.log`), so app-server stdout never collides with the JSON-RPC channel. On `EADDRINUSE` / `bind failed` during the WS handshake, the client retries with a fresh port (up to `WS_SPAWN_MAX_RETRIES` attempts). When the websocket closes unexpectedly the spawned child is killed (SIGTERM → SIGKILL with a 2 s grace) so we do not leak app-server processes.
- **`stdio` (fallback)** — `StdioTransport` spawns `codex app-server --listen stdio://` and reads/writes newline-delimited JSON over the child's stdin/stdout. This is the explicit fallback selected via `--codex-transport=stdio`, and is also used implicitly when Happy's sandbox is enabled on a non-Windows host — the sandbox wrapper in `wrapForMcpTransport` needs to drive the child's stdio, so `connect()` automatically downgrades ws→stdio in that case (a warning is logged).

Cross-cutting invariants are preserved across both transports:

- **`processEpoch`** is incremented exactly once per spawn (after the child is created). Stale message/close callbacks check `this.processEpoch !== epoch` and short-circuit, so events from an old generation cannot resolve a request or turn from the new one.
- **Force-restart on stuck interrupt** — `abortTurnWithFallback` first issues `turn/interrupt`, waits a grace period (default 3 s), and if the turn still hasn't settled it tears down the transport and reconnects, regardless of which transport is in use.
- **Thread resume across reconnect** — `reconnectAndResumeThread` carries `_threadId` + `threadDefaults` across the disconnect/connect boundary and replays `thread/resume` on the fresh transport so the user's session continues uninterrupted after a force-restart.

## Key protocol findings (learned the hard way)

These aren't in any docs. Discovered by trial and error:

| What | Expected | Actual |
|------|----------|--------|
| Thread ID location | `result.conversationId` | `result.thread.id` |
| Turn params | `conversationId`, `items` | `threadId`, `input` |
| Input item format | `{ type: "text", data: { text } }` | `{ type: "text", text }` (flat) |
| Sandbox policy | `"read-only"`, `"workspace-write"` | `{ type: "readOnly" }`, `{ type: "workspaceWrite" }` (camelCase objects) |
| Approval method | `execCommandApproval` | `item/commandExecution/requestApproval` |
| Approval decisions | `approved`, `denied`, `abort` | `accept`, `decline`, `cancel` (wire format differs from internal) |
| Event routing | `codex/event` with type in params | `codex/event/<type>` (type in method name) |
| Empty model string | Ignored | Error: "model '' not supported" (must omit, not send empty) |

## Design decisions

### Per-turn overrides (no restart needed)
Each `turn/start` RPC accepts optional `model`, `approvalPolicy`, `sandboxPolicy`. The thread keeps context across policy changes. This eliminated the mode-change restart block and `experimental_resume` dead code.

### Turn completion tracking
`sendTurnAndWait()` creates a Promise resolved when `task_complete` or `turn_aborted` arrives. Safety nets: 10-minute timeout, process exit handler, disconnect handler. This replaced the AbortController hack.

### Duplicate tool call fix
The old mapper generated `tool-call-start` for both `exec_approval_request` AND `exec_command_begin`. Since the permission handler already renders approval UI via agent state, this created duplicate cards. Fix: only `exec_command_begin` generates `tool-call-start`.

### Approval translation layer
Our internal types use `approved`/`denied`/`abort`. The wire protocol uses `accept`/`decline`/`cancel`. `mapDecisionToWire()` translates between them so the rest of the codebase doesn't need to know about wire format.

## Files

- `codexAppServerClient.ts` — JSON-RPC client, turn tracking, approval handling
- `codexAppServerTypes.ts` — Cherry-picked types from the protocol
- `runCodex.ts` — Main loop, event/approval handler wiring
- `executionPolicy.ts` — Maps permission modes to approval/sandbox policies
- `sessionProtocolMapper.ts` — Events → session protocol envelopes (shared with old code)

## What we don't handle yet

The app-server sends ~60 event types we ignore. Notable ones for future:
- `collab_*` — multi-agent collaboration events
- `web_search_*` — web search tool results
- `planning_*` — planning mode events
- `streaming_content_delta` — finer-grained streaming
- `mcp_*` — MCP server lifecycle (we do use `mcp_startup_complete`)

## References

- [Codex app-server README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)
- [experimental_resume broken — issue #4393](https://github.com/openai/codex/issues/4393)
