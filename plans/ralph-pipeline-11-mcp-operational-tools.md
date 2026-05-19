# Plan 11 — MCP operational tools: dev server, sync, build subprocess control

**Worktree:** main checkout at `D:\harness-efforts\codexu`.

**Position in DAG:** depends on Plan 09 (extends the same MCP server with new tools). Independent of all other plans for build/run order — but useless without 09's server scaffolding.

## Context

Plan 09 ships an MCP server with 10 data-oriented tools (`list_tasks`, `get_task`, `next_command`, etc.). All those tools read snapshot/sidecar/manifest files. This plan adds a different category of tools: **subprocess management** so an agent can start/stop/inspect the dev server, the sync watcher, and the static build — all from MCP without round-tripping to a terminal.

User-stated requirement (verbatim, 2026-05-18):
> "I also want the react server itself to be runnable via the mcp, so the agent can have a tool to start it, etc"

The "etc" interprets as: the broader operational surface around the overview viewer, not just dev-server start. That includes the static build (`pnpm overview:build`), the one-shot sync, and the watcher status.

## Dependencies

- **Plan 09 (MCP server)** — required. This plan extends the same `tools/overview-mcp/` package with new tools.
- **Plan 02 (Watcher)** — required for `overview.sync.watch_status` to be meaningful. Without 02, the watcher tools are stubs.

## Scope

**In scope:**
- 7 new MCP tools (table below).
- A `ProcessManager` utility class in `tools/overview-mcp/src/process-manager.ts` for spawning, tracking, ring-buffering output, and stopping child processes.
- Single-instance constraint enforcement (one dev-server child at a time per MCP server lifetime).
- Vite ready-signal parsing (look for `Local: http://...:<port>/` line).
- Static build progress capture.
- Lifecycle binding: when the MCP server shuts down (SIGTERM/SIGINT), all spawned children are killed (no orphaned `pnpm overview` processes).
- Cross-platform spawning (Windows-friendly — the user runs Windows 11). Use `child_process.spawn(cmd, args, { shell: true })` for `pnpm` invocations on Windows.
- Tests covering spawn / ready / stop / restart / kill-on-MCP-exit.

**Out of scope (deferred follow-ups):**
- Detached / persistent dev server that survives MCP restarts. v1 ties dev-server lifetime to the MCP server.
- Multi-instance dev servers on different ports.
- Generic process-launcher tool (`overview.spawn_any` for arbitrary commands) — security-sensitive; not a v1 need.
- Test/typecheck invocation tools (e.g. `overview.test`, `overview.typecheck`) — possible follow-up; skip for v1 to keep scope focused on the "runnable react server" requirement.

## Tools

All under the `codexu-overview` MCP server namespace (same server as Plan 09).

| Tool | Inputs | Returns | Mutates? |
|---|---|---|---|
| `overview.dev_server.start` | `{}` | `{ ok: true, url, pid, startedAt, alreadyRunning?: boolean }` or `{ ok: false, error }` | yes (spawns subprocess) |
| `overview.dev_server.stop` | `{}` | `{ ok: true, stoppedAt } \| { ok: false, error }` | yes (kills subprocess) |
| `overview.dev_server.status` | `{}` | `{ running, url?, pid?, startedAt?, lastReadyAt?, lastLogTail: { stdout: string[], stderr: string[] } }` | no |
| `overview.dev_server.logs` | `{ tail?: number, stream?: 'stdout' \| 'stderr' \| 'both' }` | `{ stdout?: string[], stderr?: string[] }` (last `tail` lines per stream; default 100) | no |
| `overview.build` | `{}` | `{ ok: true, outputPath, sizeBytes, durationMs } \| { ok: false, error, lastLogLines: string[] }` | yes (one-shot build child) |
| `overview.sync.now` | `{}` | `{ ok: true, summary: { tasksMatched, unmatchedCount, durationMs } } \| { ok: false, error }` | yes (one-shot sync) |
| `overview.sync.watch_status` | `{}` | `{ running, lockHolderPid?, lockHolderProcess?: 'mcp' \| 'standalone' \| 'vite-plugin' \| 'unknown', lastWriteAt? }` | no |

## Files

### To create

- **`tools/overview-mcp/src/process-manager.ts`** — `ProcessManager` class. API:
  - `spawn({ name, cmd, args, cwd, env? }): ManagedProcess` — spawns and registers. Returns handle.
  - `stop(name): Promise<void>` — graceful (SIGTERM, wait 5s) → forceful (SIGKILL).
  - `status(name): ProcessStatus | null` — running/stopped + pid + uptime.
  - `logs(name, opts): { stdout, stderr }` — ring-buffered last N lines per stream (default ring size 1000 per stream).
  - `stopAll(): Promise<void>` — called on MCP server shutdown.
  - `ManagedProcess` exposes `onReady: (predicate, timeoutMs) => Promise<void>` — resolves when a line matching predicate appears in stdout (e.g. Vite's `Local:` line).
- **`tools/overview-mcp/src/tools/dev-server-start.ts`** — registers `overview.dev_server.start`. Calls `ProcessManager.spawn({ name: 'dev-server', cmd: 'pnpm', args: ['overview'], cwd: repoRoot })`, awaits Vite's ready signal (regex `^\s*Local:\s+(\S+)`), returns the URL. If `dev-server` is already in `running` state, returns `{ ok: true, alreadyRunning: true, url, pid, startedAt }`.
- **`tools/overview-mcp/src/tools/dev-server-stop.ts`** — registers `overview.dev_server.stop`. Calls `ProcessManager.stop('dev-server')`.
- **`tools/overview-mcp/src/tools/dev-server-status.ts`** — registers `overview.dev_server.status`. Reads from `ProcessManager`.
- **`tools/overview-mcp/src/tools/dev-server-logs.ts`** — registers `overview.dev_server.logs`. Reads from the ring buffer.
- **`tools/overview-mcp/src/tools/build.ts`** — registers `overview.build`. Spawns `pnpm overview:build` (one-shot — not a long-lived child). Waits for exit. On exit code 0, stats `plans/overview.html` for `outputPath` and `sizeBytes`, returns success. On non-zero, returns failure with last 30 log lines from stderr.
- **`tools/overview-mcp/src/tools/sync-now.ts`** — registers `overview.sync.now`. Spawns `node scripts/sync-ralph-state.mjs` (one-shot, no `--watch`). On success, parses stdout for the unmatched summary line (the sync script should emit one).
- **`tools/overview-mcp/src/tools/sync-watch-status.ts`** — registers `overview.sync.watch_status`. Resolves `config.lockFile` (Plan 01 default: `.ralph/overview-sync.lock`) via the shared config loader and reads that path: if present and fresh, returns the lock holder info. If a `dev-server` process is registered with the `ProcessManager`, the lock holder is likely the Vite-plugin-embedded watcher (Plan 02). Heuristic identification documented under "Lock holder detection" below.
- **`tools/overview-mcp/tests/process-manager.test.ts`** — covers spawn/stop/status/logs/stopAll cycle.
- **`tools/overview-mcp/tests/dev-server.test.ts`** — covers start (spawn-and-wait-for-Vite-line), status, stop. Mock the spawned process via a stub that emits the expected output pattern.
- **`tools/overview-mcp/tests/build.test.ts`** — covers success + failure paths.

### To modify

- **`tools/overview-mcp/src/index.ts`** — register all 7 new tools alongside Plan 09's 10 tools. Wire `process.on('SIGTERM' | 'SIGINT' | 'exit', ...)` handlers to call `ProcessManager.stopAll()` so the dev server doesn't leak when the MCP server shuts down.
- **`tools/overview-mcp/README.md`** — document the new tools section. Include a warning about the lifecycle constraint (children die when MCP server dies).
- **`scripts/sync-ralph-state.mjs`** — when one-shot mode completes, emit a single summary line to stdout: `sync: matched=<N>, unmatched=<N>, duration=<Nms>`. Parseable by `sync-now.ts`. (Minor refactor; the sync script may already emit this implicitly.)

### Read for reference

- `tools/overview-mcp/src/index.ts` from Plan 09 — tool registration pattern.
- `tools/overview-mcp/src/snapshot-reader.ts` from Plan 09 — example of a long-lived watcher inside the MCP server (chokidar).
- `D:\harness-efforts\codexu\package.json` — `overview`, `overview:build`, `sync-ralph-state` script definitions.

## ProcessManager design

Single in-memory state holding `Map<name, ManagedProcess>`. Each `ManagedProcess`:

```ts
interface ManagedProcess {
    name: string
    cmd: string
    args: string[]
    cwd: string
    pid?: number
    startedAt?: string         // ISO
    exitedAt?: string          // ISO if exited
    exitCode?: number
    status: 'starting' | 'ready' | 'running' | 'stopping' | 'exited'
    ringBuffer: {
        stdout: string[]       // ring of last 1000 lines
        stderr: string[]
    }
    onReady(predicate: (line: string) => boolean, timeoutMs: number): Promise<{ matchedLine: string }>
}
```

`spawn` flow:

1. If a process with that `name` already exists and `status !== 'exited'`, throw `AlreadyRunning` (the tool layer translates this into `{ ok: true, alreadyRunning: true, ... }`).
2. `child_process.spawn(cmd, args, { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'] })`. `shell: true` is required on Windows for `pnpm`/`npm` to resolve correctly.
3. Attach data listeners to `stdout` / `stderr`, line-buffered, push into ring buffer (drop oldest when full).
4. Attach `exit` listener: set `exitedAt`, `exitCode`, `status = 'exited'`. Resolve any pending `onReady` promises with rejection if not yet matched.
5. Return the `ManagedProcess` handle.

`stop` flow:

1. Look up by name. If absent or already `exited`, no-op (return success).
2. Set `status = 'stopping'`.
3. Send `SIGTERM`. Wait up to 5 seconds for exit.
4. If still running, send `SIGKILL`. Wait up to 2 more seconds.
5. If still running, error (rare).

`stopAll` (on MCP shutdown): iterate `Map` and call `stop` on each. Use `Promise.allSettled` so a single hang doesn't block others.

## Lock holder detection (for `sync.watch_status`)

The lock file at `config.lockFile` (default `.ralph/overview-sync.lock`) from Plan 02 indicates a running watcher. `sync-watch-status.ts` resolves the path through the shared config loader rather than hard-coding it, so any adopter override flows through. The lock holder can be:

- **Vite-plugin-embedded watcher** (auto-started by `pnpm overview` per Plan 02 step 8). When `dev_server.status` shows the dev-server child is `running`, the lock holder is almost certainly this.
- **Standalone watcher** (`pnpm sync-ralph-state:watch` in a separate terminal).
- **MCP-embedded watcher** — not introduced in this plan. Could be a future addition; for now the lock holder is never the MCP server.
- **Stale lock** (>60s mtime, no live process). Surface as `lockHolderProcess: 'unknown'`.

Heuristic in `sync-watch-status.ts`:

1. Stat the lock file. If absent: `{ running: false }`.
2. Read the lock file content — if Plan 02 writes the holder PID into the lock content (recommended enhancement; see Common Mistakes), use it directly.
3. If lock content doesn't carry PID metadata, fall back to:
   - Is `dev-server` process registered with `ProcessManager` and `status === 'ready'/'running'`? → `lockHolderProcess: 'vite-plugin'`.
   - Otherwise → `lockHolderProcess: 'standalone'` (or `'unknown'` if mtime is stale).

(Plan 02's lock file should be enhanced to write `{ pid, process: 'standalone' | 'vite-plugin', startedAt }` as JSON content rather than being a 0-byte sentinel. This enhancement is in scope HERE — modify `scripts/lib/watch-ralph-state.mjs` accordingly. Plan 02's lock-collision predicate (mtime check) still works because JSON content is small and writing it doesn't change the mtime semantics.)

## Cross-platform notes (Windows specifics)

The user runs Windows 11.

1. **`spawn` with `shell: true`** is required for `pnpm` because Windows resolves `pnpm` via a `.cmd` shim, not a binary. Without `shell: true`, `spawn` fails with `ENOENT`.
2. **Signals on Windows:** `SIGTERM` is not natively supported; Node translates it to a process-kill. For Vite dev servers, this works (the process exits cleanly). For graceful shutdown of nested processes (e.g. `pnpm overview` spawns child Node), the `tree-kill` package may be needed — declare it as a dep if test reveals orphaned children. v1 starts without it; promote to `tree-kill` if testing exposes orphans.
3. **Line buffering on Windows:** stdout/stderr may emit chunks with mixed line endings (`\r\n`). Normalize to `\n` before splitting in the ring-buffer code.
4. **Path quoting in `args`:** when `args` contains spaces (rare for our use case), Windows shell parsing requires double-quoting. The `cmd` field always uses `pnpm` (no spaces), so this isn't an issue in practice — but document the constraint.

## Implementation strategy

1. **Build `process-manager.ts`** with the API above. Unit-test in isolation (spawn `node -e "console.log('hi'); setInterval(() => {}, 1000)"` and verify spawn/ready/stop).
2. **Wire `stopAll` to MCP shutdown signals.** Test by sending SIGTERM to the MCP server process and confirming no orphaned children remain.
3. **Build `dev-server-start.ts`** with the Vite ready-signal predicate. Test against a real `pnpm overview` invocation.
4. **Build `dev-server-stop.ts`**, `dev-server-status.ts`, `dev-server-logs.ts` — thin wrappers.
5. **Build `build.ts`** — one-shot child. Capture exit. Parse output.
6. **Modify Plan 02's `watch-ralph-state.mjs`** to write JSON metadata into the lock file.
7. **Build `sync-now.ts`** — one-shot `node scripts/sync-ralph-state.mjs`. Parse summary line.
8. **Build `sync-watch-status.ts`** — read lock file, apply heuristic.
9. **Register all 7 tools in `index.ts`.**
10. **Tests** for each. Especially: `start` while already running (returns `alreadyRunning: true`); `stop` when not running (no-op success); `start` → SIGINT MCP server → confirm no orphaned dev-server.
11. **Documentation** in README.

## Acceptance criteria

- [ ] All 7 tools registered and callable.
- [ ] `dev_server.start` spawns `pnpm overview` and resolves with the Vite-emitted URL within 60s (or errors with timeout).
- [ ] `dev_server.start` called when already running returns `{ ok: true, alreadyRunning: true, ... }` with the existing URL.
- [ ] `dev_server.stop` terminates the child within 5s (SIGTERM) or 7s (escalated SIGKILL).
- [ ] `dev_server.status` correctly reflects running / exited state.
- [ ] `dev_server.logs` returns the last N lines per stream from the ring buffer.
- [ ] `overview.build` returns `{ ok: true, outputPath: 'plans/overview.html', sizeBytes: N, durationMs: M }` on success.
- [ ] `overview.build` returns `{ ok: false, error, lastLogLines }` on non-zero exit.
- [ ] `overview.sync.now` runs the one-shot sync and returns the parsed summary.
- [ ] `overview.sync.watch_status` distinguishes Vite-plugin / standalone / unknown lock holders.
- [ ] When the MCP server receives SIGTERM/SIGINT, all spawned children are killed (no orphaned processes).
- [ ] Tests cover spawn / ready / stop / restart / kill-on-shutdown.
- [ ] README documents the lifecycle constraint and each tool's contract.

- [ ] **Refresh downstream plans + INDEX.** After all other criteria pass, audit (a) the plans listed in this plan's "Hand-off" section and (b) `plans/ralph-pipeline-INDEX.md`'s "Source-of-truth modules" table and DAG diagram. Update any stale references — file paths, type signatures, function/export names, behavior contracts, module dependencies — that diverged from this plan's actual implementation. Apply updates atomically in the final implementation commit; in the commit message, list each diff (which file, which lines, what changed) so reviewers can verify the cascade.

## Verification

A. **Start dev server via MCP:**
```
overview.dev_server.start({})
→ { ok: true, url: 'http://127.0.0.1:5173/', pid: 1234, startedAt: '...' }
```
Browser at the URL renders the dashboard.

B. **Already-running short-circuit:** call `dev_server.start` again. Returns `{ alreadyRunning: true, url: ... }` instantly (no second spawn).

C. **Status:** `dev_server.status` returns `{ running: true, url, pid, startedAt, lastLogTail: { ... } }`.

D. **Logs:** `dev_server.logs({ tail: 20 })` returns the last 20 stdout lines including Vite's startup banner.

E. **Stop:** `dev_server.stop` terminates the child within 5s. Re-running `status` shows `running: false`.

F. **Build:** `overview.build` runs `pnpm overview:build`. Returns `{ ok: true, outputPath: 'D:/harness-efforts/codexu/plans/overview.html', sizeBytes: <500000, durationMs: ... }`.

G. **Build failure path:** introduce a temporary syntax error in `tools/overview-viewer/src/App.tsx`. `overview.build` returns `{ ok: false, error: 'build failed with exit code N', lastLogLines: [...] }`. Revert the error.

H. **Sync now:** `overview.sync.now` runs the one-shot sync. Returns `{ ok: true, summary: { tasksMatched: N, unmatchedCount: N, durationMs: N } }`.

I. **Watch status (no watcher):** without `pnpm overview` running and no standalone watcher, `overview.sync.watch_status` returns `{ running: false }`.

J. **Watch status (Vite-plugin):** start dev server via `dev_server.start`. `overview.sync.watch_status` returns `{ running: true, lockHolderProcess: 'vite-plugin', ... }`.

K. **Watch status (standalone):** stop the dev server. Start `pnpm sync-ralph-state:watch` in a separate terminal. `overview.sync.watch_status` returns `{ running: true, lockHolderProcess: 'standalone', lockHolderPid: <pid> }` (assuming Plan 02's lock-content enhancement landed in this plan).

L. **No-orphan on MCP shutdown:** start dev server via MCP. Get its PID from `status`. Send SIGTERM to the MCP server. After ~10s, verify the dev-server PID is no longer running (Windows: `tasklist | findstr <pid>`; Bash: `ps -p <pid>`).

M. **MCP server restart:** start dev server. SIGTERM MCP server (child dies per L). Restart MCP server. Call `dev_server.status` → `{ running: false }` (no inherited state). Call `dev_server.start` → spawns fresh.

## Common mistakes / confusion points

1. **`shell: true` is required on Windows for `pnpm`.** Without it, `spawn` throws `ENOENT` for `.cmd` shims. Pair with `tree-kill` (or document the constraint) if nested children become orphans.
2. **Don't detach the dev server.** v1 ties child lifecycle to MCP. If the user wants a long-running dev server independent of MCP, they start it manually outside MCP. Reason: detached children that survive MCP restart create state-tracking nightmares (the MCP server doesn't have a reliable way to re-attach to stdout of a detached PID).
3. **`stopAll` runs on every exit signal.** Don't add per-tool teardown — `stopAll` is the single point.
4. **Lock file content is JSON now (per Plan 11 enhancement).** Old Plan 02 versions wrote 0-byte sentinels. The watcher should now write `{ pid, process, startedAt }` so `sync.watch_status` can identify the holder cleanly. Document this in Plan 02's update.
5. **Ring buffer cap is 1000 lines per stream.** Dev servers produce verbose output; without the cap, memory grows unbounded. 1000 lines covers ~5–10 minutes of typical Vite output. If a tool consumer wants more, document `overview.dev_server.logs` as best-effort.
6. **`overview.build` is one-shot, not persistent.** Don't add it to `ProcessManager` — there's nothing to track after exit. Capture the last N stderr lines in case of failure.
7. **`pnpm overview` already auto-starts the watcher** (per Plan 02). So `dev_server.start` triggers BOTH the Vite dev server AND the watcher. `sync.watch_status` will reflect this (lockHolderProcess: 'vite-plugin'). Don't try to separately start the watcher — that would create a lock collision.
8. **Process names are namespaced.** Use `'dev-server'`, `'build'` (transient), `'sync'` (transient). Don't allow arbitrary user-provided names — security and simplicity.
9. **Build is one-shot, not in the running map.** If `overview.build` is called while a previous build is still running, queue or reject — recommend reject (`{ ok: false, error: 'another build in progress' }`). Builds shouldn't overlap.
10. **The dev server respects the 500KB static-build budget** only after `pnpm overview:build`, not after `pnpm overview`. The dev server doesn't inline. Document this in the README so agents don't confuse the dev URL with the static artifact size.

## Hand-off

After this plan ships, an agent can fully drive the overview lifecycle (start, stop, build, sync, status) via MCP without ever touching a terminal. Combined with Plan 09's data-read tools, this gives agents a complete operational surface.

Possible future extensions (NOT in this plan):

- Test/typecheck control: `overview.test`, `overview.typecheck` running `pnpm test` / `pnpm typecheck`. Add only if agents start regularly running tests.
- Detached / persistent dev server. Add only if the lifecycle constraint becomes painful.
- Multi-instance dev servers. Add only if there's a real need (probably never).
- Generic process launcher. Avoid — security risk, scope creep.
