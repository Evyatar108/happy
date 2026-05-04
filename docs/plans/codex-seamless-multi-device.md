# Codex Seamless Multi-Device Sessions

> **⚠️ Read first — context updates as of 2026-05-03 (codexu integration):**
>
> - **Project rename:** the repo formerly known as `slopus/happy` is now
>   `Evyatar108/codexu` at `C:/harness-efforts/codexu/`. Internal package
>   directories KEEP their `happy-*` names (`packages/happy-cli`,
>   `happy-app`, `happy-server`) — package-level rebrand was attempted and
>   reverted to enable clean upstream merges. See
>   `C:/harness-efforts/codexu/plans/codexu-roadmap.md` "Status" section.
>
> - **Tunnels companion supersedes sub-tasks 3+.** Read this plan
>   alongside `github-auth-via-vscode-tunnels.md` (sibling file in this
>   directory). The encrypted-relay assumption underpinning the original
>   sub-tasks 3, 4, and 5 (and the Walkthrough section) has been replaced
>   by Microsoft Dev Tunnels + GitHub OAuth. **Sub-tasks 1 and 2 (transport
>   refactor + discovery file) port unchanged** — pure local plumbing,
>   loopback-only, unaffected. **Sub-tasks 3, 4, 5** must be re-derived
>   against the tunnels plan before implementation:
>   - Sub-task 3's "paired Happy app exists via Credentials" gating signal
>     becomes "user signed into GitHub AND has at least one app instance
>     in the directory" (see tunnels plan §"happy-server" + §"Phasing").
>   - Sub-task 4's relay-mediated fan-out becomes a property of CLI's
>     local Socket.IO server with phone attached as a direct client
>     through the devtunnel — fan-out semantics shift layer.
>   - Sub-task 5's Walkthrough explicitly references the encrypted relay;
>     re-author the 7-step scenario against tunnel-direct WS.
>
> - **Hard pause point:** sub-tasks 3+ are blocked on the tunnels Phase 0
>   spike result (`docs/spikes/devtunnel-auth-result.md` — does not exist
>   yet) AND on tunnels' pre-implementation decisions (OAuth-app-vs-
>   GitHub-app, token contract, access path (a)/(b), local WS port
>   policy). Sub-tasks 1 and 2 do NOT depend on any of these and can ship
>   first.
>
> - **Line numbers cited in this doc are stale** after the upstream
>   merge (2026-05-03, `25fe2cf3`). Use `grep` rather than line numbers
>   when locating spawn sites, request handlers, etc.
>
> - **Phase 0 verification (lines 250-269):** confirmed green 2026-05-02
>   against `codex-cli 0.125.0-copilot-api.8`. Currently installed codex
>   is `0.128.0-copilot-api.1`; re-run the verification scripts before
>   sub-task 1 if more time elapses or behavior diverges.

## Overview

Enable a Codex session to be **continuously usable from any active client** (laptop terminal or phone app) without explicit mode switching, in-flight work loss, or stuck states. The user can walk away from the laptop mid-conversation, pick up the phone, answer Codex's questions, and continue — and walk back later — all against the same live session, with background tasks surviving the surface change.

This is the natural answer to "deferred local→remote switch when Claude is paused mid-turn" that we couldn't solve cleanly for Claude (see Background section). Codex's architecture already provides every primitive needed; this plan is mostly about exposing them coherently in the UX, not building new infrastructure.

## Quick-start orientation for an agent picking this up

If you've just been handed this plan and the prior conversation is gone, read in this order to bootstrap:

1. **This whole file** end-to-end (~10 min). Don't skip the verification scripts or the failure modes — they capture context that would otherwise be lost.
2. **`packages/happy-cli/CLAUDE.md`** — fork-wide architecture overview. Especially the **"Codex exclusion"** paragraph and the existing daemon/release/iteration skill memos. The "v1 limitation — pendingSwitch" note in the Claude section is the failure case this plan supersedes.
3. **`packages/happy-cli/src/codex/runCodex.ts`** — main entrypoint for `happy codex`. Read top-to-bottom; ~700 lines. Pay attention to `abortInProgress` (lines 258-296), `permissionHandler` registration, the lifecycle teardown around lines 538-703 (this is where Phase 1's persistent-app-server change concentrates), and the `client.disconnect()` calls at 330 and 676.
4. **`packages/happy-cli/src/codex/codexAppServerClient.ts`** — JSON-RPC client. Read lines 1-100 for the protocol overview comment, then jump to `handleServerRequest` (lines 1079-1123) for approval routing. The `--listen stdio://` arg is at line 394.
5. **`packages/happy-cli/src/codex/utils/permissionHandler.ts`** — `CodexPermissionHandler`. ~300 lines. This is where multi-client coordination would live if Phase 0 reveals fan-out gaps.
6. **`docs/plans/codex-app-server-migration.md`** — sibling plan that documents the migration to `app-server` (already complete). Provides historical context for why the architecture is shaped the way it is.
7. **Run the reproducible verification** (next section) on your machine. ~5 minutes. Confirms the architectural primitive still works on whatever Codex CLI version is installed (it's evolving).

After step 7 you should be able to read the rest of this plan with full context.

## Reproducible verification (run before starting Phase 1)

This whole plan is built on the assumption that `codex app-server --listen ws://...` + multi-client connections work. We verified this empirically on **codex-cli 0.125.0-copilot-api.8** on **2026-05-02** on Windows. Re-run before committing to Phase 1, in case the upstream protocol shifted.

### Pre-reqs

```bash
codex --version    # Should print something like "codex-cli 0.125.0-..." or later
which codex        # Must exist on PATH
```

If codex isn't installed: `npm install -g @openai/codex`.

### Step 1: Start app-server with WebSocket listener

```bash
cd /tmp
codex app-server --listen 'ws://127.0.0.1:51234' --analytics-default-enabled > codex-app-server.log 2>&1 &
APPSRV_PID=$!
sleep 3
ps -p $APPSRV_PID && echo "alive" || echo "dead"
netstat.exe -ano | grep ':51234.*LISTEN'    # On Windows; Linux: ss -ltn | grep ':51234'
cat codex-app-server.log
```

Expected: `alive`, port 51234 listening, log shows `listening on: ws://127.0.0.1:51234`.

### Step 2: Smoke-test JSON-RPC handshake

Save as `verify-rpc.cjs`:

```javascript
// require.resolve trick so the script works from any cwd
const WebSocket = require(require('node:path').join(
    require('node:child_process').execSync('pnpm root', { cwd: 'C:/harness-efforts/codexu/packages/happy-cli', encoding: 'utf8' }).trim(),
    'ws',
));  // adjust path
const ws = new WebSocket('ws://127.0.0.1:51234');
let nextId = 1;
ws.on('open', () => {
    ws.send(JSON.stringify({
        jsonrpc: '2.0', id: nextId++, method: 'initialize',
        params: { clientInfo: { name: 'verify', version: '0.0.1' } },
    }));
});
ws.on('message', (data) => { console.log('←', data.toString()); ws.close(); process.exit(0); });
ws.on('error', (e) => { console.error('ERROR', e.message); process.exit(3); });
setTimeout(() => process.exit(2), 8000);
```

Run: `node verify-rpc.cjs`. Expected output: a JSON response with `userAgent`, `codexHome`, `platformFamily`, `platformOs`. If you get this, the WebSocket transport is alive and JSON-RPC works.

### Step 3: Multi-client smoke test

Save as `verify-multiclient.cjs`:

```javascript
// require.resolve trick so the script works from any cwd
const WebSocket = require(require('node:path').join(
    require('node:child_process').execSync('pnpm root', { cwd: 'C:/harness-efforts/codexu/packages/happy-cli', encoding: 'utf8' }).trim(),
    'ws',
));
const url = 'ws://127.0.0.1:51234';

function client(label) {
    return new Promise((resolve) => {
        const ws = new WebSocket(url);
        let id = 1;
        ws.on('open', () => {
            ws.send(JSON.stringify({ jsonrpc: '2.0', id: id++, method: 'initialize',
                params: { clientInfo: { name: label, version: '0.0.1' } } }));
        });
        ws.on('message', (d) => {
            const obj = JSON.parse(d.toString());
            if (obj.id === 1) {
                console.log(`[${label}] initialize OK codexHome=${obj.result?.codexHome}`);
                ws.close();
                resolve();
            }
        });
        ws.on('error', (e) => { console.error(`[${label}] ERR`, e.message); resolve(); });
    });
}

(async () => {
    await Promise.all([client('clientA'), client('clientB')]);
    console.log('=== both clients exited ===');
    process.exit(0);
})();
```

Run: `node verify-multiclient.cjs`. Expected: both `clientA initialize OK` AND `clientB initialize OK`. If both succeed, multi-client primitive is confirmed working on your machine.

### Step 4: Discover the full RPC method list

Save as `discover-methods.cjs`:

```javascript
// require.resolve trick so the script works from any cwd
const WebSocket = require(require('node:path').join(
    require('node:child_process').execSync('pnpm root', { cwd: 'C:/harness-efforts/codexu/packages/happy-cli', encoding: 'utf8' }).trim(),
    'ws',
));
const ws = new WebSocket('ws://127.0.0.1:51234');
let id = 1;
ws.on('open', () => {
    ws.send(JSON.stringify({ jsonrpc: '2.0', id: id++, method: 'initialize',
        params: { clientInfo: { name: 'discover', version: '0.0.1' } } }));
});
ws.on('message', (d) => {
    const obj = JSON.parse(d.toString());
    if (obj.id === 1) {
        // Send a deliberately-bad method to harvest the supported list
        ws.send(JSON.stringify({ jsonrpc: '2.0', id: id++, method: '__discover__', params: {} }));
    }
    if (obj.id === 2) {
        const m = obj.error?.message?.match(/expected one of (.+)$/s);
        console.log(m ? m[1].split(',').map(s => s.trim().replace(/[`'"]/g, '')).join('\n') : 'parse failed');
        ws.close();
        process.exit(0);
    }
});
setTimeout(() => process.exit(2), 8000);
```

Run: `node discover-methods.cjs`. As of 2026-05-02, this returned ~50 methods. If yours is different, the protocol has evolved — update this plan's "verified RPC surface" section accordingly.

### Step 5: Deterministic approval fan-out test (scripted) — most important

The headline Phase 1 UX assumption — that an approval request from `app-server` reaches **all** attached clients — needs a deterministic test, not just the manual TUI eyeball check (now Step 7). Without this, Phase 1 may build a broken multi-client coordination layer because we assumed wrong fan-out semantics.

Save as `verify-approval-fanout.cjs`:

```javascript
const WebSocket = require(require('node:path').join(
    require('node:child_process').execSync('pnpm root', { cwd: 'C:/harness-efforts/codexu/packages/happy-cli', encoding: 'utf8' }).trim(),
    'ws',
));

const url = 'ws://127.0.0.1:51234';

// This test requires SOMETHING to trigger an approval request from the
// app-server side (a Bash command call in a started thread, for example).
// It's structured as a skeleton — the assertion of interest is whether
// `item/commandExecution/requestApproval` arrives on BOTH clients vs only one.

async function client(label) {
    const ws = new WebSocket(url);
    let id = 1;
    const seenApprovals = [];
    return new Promise((resolve) => {
        ws.on('open', () => {
            ws.send(JSON.stringify({ jsonrpc: '2.0', id: id++, method: 'initialize',
                params: { clientInfo: { name: label, version: '0.0.1' } } }));
        });
        ws.on('message', (d) => {
            const obj = JSON.parse(d.toString());
            if (obj.method === 'item/commandExecution/requestApproval'
                || obj.method === 'item/fileChange/requestApproval'
                || obj.method === 'mcpServer/elicitation/request') {
                seenApprovals.push({ method: obj.method, id: obj.id, time: Date.now() });
                console.log(`[${label}] approval request received: ${obj.method} id=${obj.id}`);
                // Don't respond — let the OTHER test machinery resolve it
            }
        });
        // Hold connection open for 30s while we externally trigger approvals
        setTimeout(() => { ws.close(); resolve(seenApprovals); }, 30000);
    });
}

(async () => {
    const [seenA, seenB] = await Promise.all([client('clientA'), client('clientB')]);
    console.log('=== fan-out report ===');
    console.log('clientA saw:', seenA.length, 'approval(s)');
    console.log('clientB saw:', seenB.length, 'approval(s)');
    if (seenA.length === seenB.length && seenA.length > 0) {
        console.log('✓ FAN-OUT CONFIRMED — both clients receive the same approval requests');
    } else if (seenA.length > 0 || seenB.length > 0) {
        console.log('⚠ FAN-OUT MISMATCH — Happy needs a coordination layer (Phase 1 sub-task 4 expands)');
    } else {
        console.log('? NO APPROVALS TRIGGERED — re-run with an actual thread + approval-requiring command');
    }
    process.exit(0);
})();
```

To trigger an approval externally while this test is running, start a thread via the app-server (e.g., from `happy codex` invocation against the same `--listen` URL, or via a small `thread/start` script) and have it run a `Bash` command on a default-permissions config. The test's job is to record what arrives on each client; the harness for triggering doesn't have to be inline.

If both clients see the same approval requests with matching IDs and timestamps within ~10ms, native fan-out is confirmed and Phase 1 sub-task 4 only needs first-answer-wins coordination. If only one client sees them, Happy needs to add a fan-out layer.

### Step 6 (manual): Laptop suspend / lid-close behavior

While the app-server is running and at least one ws client is attached:

1. Suspend the laptop (lid close, or `pmset sleepnow` / Windows Sleep)
2. Wait 30+ seconds
3. Resume the laptop
4. Observe whether the client connection auto-recovers (WebSocket re-handshakes) or hangs half-open
5. Send a message via the recovered client; verify it reaches the app-server

If the connection doesn't recover gracefully, Phase 1 needs explicit reconnect logic in `wsTransport.ts`. If it does recover, the standard WebSocket keep-alive is sufficient.

### Step 7: Real native-TUI multi-client test (manual, requires two terminals)

This requires a TTY-attached terminal — can't be scripted.

```bash
# Terminal 1 (already running app-server from Step 1)

# Terminal 2:
codex --remote ws://127.0.0.1:51234

# Terminal 3 (separate):
codex --remote ws://127.0.0.1:51234
```

In Terminal 2: send a message. Verify Terminal 3's TUI shows the same message in real-time. Then send a message from Terminal 3; verify Terminal 2 sees it. If both work, the multi-client UX is real, not just the connection layer.

If the TUI clients can answer permission prompts and one client's answer dismisses the other's, simultaneous-client coordination works at the Codex layer and Happy doesn't need to add coordination.

### Cleanup

```bash
taskkill.exe //F //PID $APPSRV_PID    # Windows; Linux: kill $APPSRV_PID
rm verify-rpc.cjs verify-multiclient.cjs discover-methods.cjs codex-app-server.log
```

## Phase 0 verification result (2026-05-02)

Empirical verification of the multi-client primitive — all GREEN:

- `codex app-server --listen ws://127.0.0.1:51234 --analytics-default-enabled` starts cleanly, exposes `/healthz` (200) and `/readyz` (200) HTTP probes alongside the WebSocket endpoint
- WebSocket JSON-RPC 2.0 handshake works: `initialize` returns userAgent, `codexHome`, platform metadata
- **Two simultaneous clients** can both `initialize` successfully against the same backend with no contention — multi-client confirmed
- The RPC surface is far richer than expected. Triggering an unknown-method error returned the **full method list** (~50 methods), notable:
  - **`thread/backgroundTerminals/clean`** — first-class background-task **cleanup** primitive. ⚠️ The discovery dump only showed `clean`, not `list` / `kill` / `output` / etc. Earlier drafts of this plan overgeneralized this single method into "first-class background-task lifecycle management." Re-verify what's actually exposed before betting Phase 2 work on it. The `clean` method existing at all is evidence Codex tracks background terminals server-side; the survival-across-client-disconnect property is plausible but unverified.
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

## Verified RPC surface (codex-cli 0.125.0-copilot-api.8, 2026-05-02)

Full method list returned by the protocol error-message discovery. Group by area:

**Lifecycle:**
- `initialize`

**Threads (the conversation primitive):**
- `thread/start` — start a new thread
- `thread/resume` — resume an existing thread
- `thread/fork` — fork an existing thread
- `thread/archive` / `thread/unarchive`
- `thread/list` — list threads
- `thread/loaded/list` — list currently-loaded threads
- `thread/read` — read a thread's content
- `thread/turns/list` — list turns within a thread
- `thread/inject_items` — **inject context items into a thread (the "synthetic preamble" equivalent we wanted for Claude is a first-class RPC for Codex)**
- `thread/rollback` — rollback to a prior state
- `thread/name/set` / `thread/metadata/update`
- `thread/memoryMode/set` / `memory/reset`
- `thread/compact/start` — trigger compaction
- `thread/shellCommand` — execute a shell command in the thread context
- `thread/approveGuardianDeniedAction` — approve actions previously denied by sandboxing
- **`thread/backgroundTerminals/clean` — first-class background-task lifecycle management**
- `thread/increment_elicitation` / `thread/decrement_elicitation` — elicitation counters
- `thread/unsubscribe` — unsubscribe a client from a thread

**Turns (within a thread):**
- `turn/start` — start a new turn
- `turn/steer` — mid-turn steering (insert guidance while Claude is generating)
- `turn/interrupt` — interrupt the current turn

**Real-time audio:**
- `thread/realtime/start` / `thread/realtime/stop`
- `thread/realtime/appendAudio` / `thread/realtime/appendText`
- `thread/realtime/listVoices`

**Skills, marketplace, plugins:**
- `skills/list` / `skills/config/write`
- `marketplace/add` / `marketplace/remove` / `marketplace/upgrade`
- `plugin/list` / `plugin/read` / `plugin/install` / `plugin/uninstall`

**App / Models / Features:**
- `app/list`
- `model/list`
- `experimentalFeature/list` / `experimentalFeature/enablement/set`
- `collaborationMode/list` — **collaboration mode is a documented concept**

**Device & FS delegation:**
- `device/key/create` / `device/key/public` / `device/key/sign`
- `fs/readFile` / `fs/writeFile` / `fs/createDirectory` / `fs/getMetadata`
- `fs/readDirectory` / `fs/remove` / `fs/copy`
- `fs/watch` / `fs/unwatch`

**Reviews:**
- `review/start`

**Server-side requests** (the app-server calls these on the client; not client→server):
- `mcpServer/elicitation/request` — MCP tool needs user input (the AskUserQuestion equivalent)
- `item/commandExecution/requestApproval` — command execution approval (Bash equivalent)
- `item/fileChange/requestApproval` — file change approval

If the upstream protocol changes, re-run Step 4 of the verification and update this list.

## Security model

**Loopback-only is the trust boundary. No per-session auth tokens; user-account isolation suffices.**

The codex `app-server` will bind only to `127.0.0.1`. Per upstream's `--ws-auth` semantics, loopback listeners accept any local connection without token authentication — and this plan deliberately relies on that, because:

| What a malicious local process running as the user could do via the ws listener | What they can already do without it |
|----|----|
| Read in-flight conversation | Read `~/.codex/sessions/*.jsonl` directly |
| Send messages to the agent | Spawn their own `codex` CLI as the same user |
| Approve permission prompts | Send keystrokes to the user's terminal via OS automation |
| Kill the agent process | `kill <pid>` against the codex app-server PID |

On a single-user developer machine, the security boundary is the **user account**, not the process. The marginal risk from an unauthenticated loopback listener is approximately zero — any process with the same user identity could already cause equivalent harm via different paths (file reads, signal sends, keystroke injection, spawning peer codex instances).

### Hard invariants

1. **Never bind a non-loopback address.** No `0.0.0.0`, no LAN IPs, no public IPs. Reject (refuse to start) if a config option ever tries to. The instant we cross the user-account/network boundary, auth becomes mandatory and the design changes.
2. **Phone never connects directly to the app-server.** Phone → Happy server (E2E encrypted via libsodium) → Happy CLI on laptop → local app-server. The Happy auth chain already covers the cross-machine portion; the local hop is IPC.
3. **`--use-codex-tui` (when implemented) passes the port via argv to its spawned `codex --remote` child** — no env var, no token. The child only needs to know the loopback port.

### When auth WOULD be required (out of scope for this plan)

If we ever wanted phones (or other devices) to connect directly to the app-server without going through Happy's encrypted relay — e.g., for lower-latency direct LAN connections, or for browser-based clients hitting the app-server URL — that crosses the local boundary and requires `--ws-auth signed-bearer-token` + `--ws-token-file` (or `--ws-token-sha256`). At that point we'd need to design a token-issuance + secure-distribution model. Explicitly deferred; not blocked by Phase 1.

## Prior art

The architectural pattern this plan converges on isn't novel — it has direct industry analogues that are useful both for design legibility and for borrowing solved-problem solutions:

- **tmux / GNU screen** — long-lived backend server, multiple attached clients via socket, detach-and-reattach pattern. The core insight ("session is the server, terminal is just a window into it") is exactly what we're building. tmux's `tmux attach` and `tmux ls` are direct analogs of `happy codex --attach` and `happy codex --list`.
- **mosh** — backend persists across client disconnect, replays missed state on reconnect. Directly relevant to the "laptop closes lid, phone keeps interacting, laptop reopens and catches up" case. mosh's state-synchronization protocol is well-studied; we shouldn't reinvent.
- **GitHub Codespaces / Gitpod hibernation** — session outlives the IDE-window lifetime, can be reattached from a new client. User mental model: "my workspace is in the cloud (or here in the cloud-equivalent app-server), my IDE is just a connection."
- **Jupyter kernel + multiple frontends** — one kernel process, multiple notebook/console/lab clients all attached and viewing the same evaluation state. Closest direct analog to "ink renderer + native TUI + phone all attached to one app-server."
- **ssh-agent + askpass + git credential helper** — pluggable prompt-handler pattern (referenced in our Claude exploration). Less directly applicable here because Codex's elicitation/approval routing is already structured, but worth noting for the "delegate UI prompt to a configurable answerer" pattern.
- **VSCode dev tunnels / Codespaces shell forwarding** — keystroke forwarding model. Different from this plan (we want the same conversation across clients, not a single TUI mirrored to multiple eyes), but worth contrasting in docs to avoid confusion.

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

## Walkthrough — laptop-to-phone handoff after Phase 1

The flagship use case traced through the deliverables:

1. **User starts a session at the laptop**: `happy codex` boots. Behind the scenes, Happy CLI spawns `codex app-server --listen ws://127.0.0.1:RANDOM_PORT`, writes the port + pid to a discovery file at `~/.happy-dev/codex-active.json` (or per-cwd equivalent), and connects as a WebSocket client. The terminal renders Happy's existing ink UI consuming RPC events.
2. **User sends a message ("run a 5-minute test suite")**: Happy CLI forwards it via `turn/start`. `app-server` runs the suite as a tracked background bash. The phone app, already paired with Happy CLI via the encrypted relay, sees the conversation update in real-time.
3. **User closes laptop lid**: WebSocket goes half-open. Happy CLI may still be running but unreachable. **`app-server` keeps running** because it's a sibling process, not a child — its lifetime is governed by Happy CLI's daemon, not by the foreground `happy codex` invocation.
4. **User opens phone app on the bus**: phone app is still connected to Happy CLI (via the encrypted relay, which has TCP keepalive + reconnect). Conversation history is fully synchronized; user sees what the test suite has done so far.
5. **Test suite finishes; Codex pauses on a permission prompt** ("Apply this fix?"). The `item/fileChange/requestApproval` RPC fans out from `app-server` to all attached clients — the laptop's Happy CLI (which forwards to the phone via the relay) and any other directly-attached clients. Phone shows the approval card.
6. **User taps "Approve" on the phone**: `sessionAllow` RPC flows through Happy's relay → Happy CLI → `app-server`. The first approval wins; `app-server` resolves the request and Codex proceeds. (Phase 0 verifies the multi-client coordination behavior; if "first wins" doesn't work natively, Happy adds a thin coordination layer.)
7. **User opens laptop later**: Happy CLI's WebSocket reconnects to the still-running `app-server` (the discovery file at step 1 makes this trivial). Terminal catches up via `thread/turns/list` to render the missed turns. User keeps working.

Each step in this walkthrough names a Phase 1 deliverable. If any step doesn't work end-to-end, Phase 1 isn't done.

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
8. ~~Verify per-session auth~~ — REMOVED. Plan now uses unauthenticated loopback (see Security model section). If you ever bind a non-loopback address, that's when auth becomes mandatory; this plan explicitly forbids that.

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

### Phase 1 — Persistent multi-client app-server with reattach (3-5 days)

**Headline goal**: deliver the "Walkthrough — laptop-to-phone handoff" section above end-to-end. The user-visible promise is "your session lives across surface changes and reattaches when you come back" — that requires **persistent app-server + discovery + reattach**, NOT just a transport swap. Earlier drafts of this plan misordered this; correcting now.

#### Sub-task 1: Transport refactor — stdio → loopback WebSocket (1-2 days)

Switch the IPC between Happy CLI and codex `app-server` from stdio to loopback WebSocket. No auth flags (see Security model section above — loopback + user-account isolation suffices).

**File: `packages/happy-cli/src/codex/codexAppServerClient.ts`**

The `app-server` spawn site is at line 432 (where `cross-spawn` is invoked). Change the args from:

```typescript
let args = ['app-server', '--listen', 'stdio://'];
```

to:

```typescript
const port = await pickFreeLoopbackPort();  // helper to add in src/utils/
let args = [
    'app-server',
    '--listen', `ws://127.0.0.1:${port}`,
];
// NO auth flags. See SECURITY MODEL section above. Loopback + user-account isolation.
```

The harder part is reworking the IPC layer. The current implementation is tightly coupled to stdio:
- `request()` at line 936 uses `this.process.stdin.write(...)`
- `respond()` at line 950, `notify()` at line 943 use the same stdin
- Line-based JSON parser at line 470 (`readline.on('line', ...)`) consumes `proc.stdout`
- `processEpoch` lifecycle at lines 429-459, disconnect grace at 504-517, and `abortTurnWithFallback`'s force-restart path all assume stdio handle ownership

Approach: create `packages/happy-cli/src/codex/transport/wsTransport.ts`. Mirror the JsonRpcConnection shape `codexAppServerClient.ts` already uses internally. **Keep** the `processEpoch` + force-restart semantics — they govern app-server lifecycle, which is independent of the wire transport. **Replace** the read/write plumbing with WebSocket frames.

For the `ws` client library: the existing in-fork precedent is `packages/happy-cli/src/openclaw/OpenClawSocket.ts`. (Earlier drafts mistakenly cited `apiSocket.ts` — that uses Socket.IO, different protocol.)

**Tests**: `packages/happy-cli/src/codex/codexAppServerClient.test.ts` (1100+ lines) mocks JSON-RPC envelopes via fake stdio handles. Adapt the mock to feed/drain via a fake WebSocket. Most assertions stay; only the test's plumbing layer changes.

**Add a transport-fallback flag** for the first release: `--codex-transport=stdio|ws` (default `ws`). If WebSocket transport breaks on a particular machine (firewall, AV interference on Windows, port exhaustion), the user has an escape hatch. Remove the flag after Phase 2 when ws is proven.

#### Sub-task 2: Discovery + reattach (1 day)

When `happy codex` is invoked, check whether an `app-server` is already running for this user and reattach instead of spawning a fresh one.

**Discovery file** at `${configuration.happyHomeDir}/codex-active-${cwdHash}.json`:

```jsonc
{
    "pid": 12345,           // app-server PID
    "port": 51234,          // ws port
    "startedAt": "...",     // ISO timestamp
    "happyCliVersion": "1.1.8-evy.10",
    "cwd": "C:\\Users\\..."
}
```

The `cwdHash` keyer scopes per-project so two projects on the same machine don't collide.

On `happy codex` startup:
1. Read the discovery file if it exists
2. Check if PID is alive (`kill(pid, 0)` on POSIX; `tasklist /FI "PID eq <pid>"` on Windows)
3. If alive AND `ws://127.0.0.1:port` accepts a connection AND `initialize` succeeds → reattach (skip spawning a new `app-server`)
4. Otherwise (stale file, dead PID, refused connection) → delete the file, spawn fresh, write new file
5. On clean shutdown of `app-server` (orchestrated, not crash), delete the file

**Lifecycle ownership**: today `runCodex.ts` calls `client.disconnect()` at lines 330 and 676. After Phase 1, that should NOT terminate `app-server` — only Happy CLI's own connection. The `app-server` child process is owned by the daemon, not by the foreground `happy codex` invocation.

**Daemon integration**: the existing daemon (`packages/happy-cli/src/daemon/run.ts`) already manages long-lived processes; Codex's app-server should plug into that pattern. If integration is non-trivial, ship Phase 1 with a simpler "happy codex spawns app-server detached, daemon optional" model and revisit daemon integration in Phase 1.5.

#### Sub-task 3: Discoverability — surface multi-device on terminal startup (0.5 day)

When `happy codex` starts AND a paired Happy app exists for this user (check via the existing pairing/auth state in `Credentials`), print a one-line hint in the terminal:

```
✓ Connected — your phone can join this session in the Happy app
```

Cheap, prevents the most common "I didn't know this existed" support case Copilot's review flagged. Skip if no paired app.

#### Sub-task 4: Conflict-resolution UX (0.5-1 day)

Phase 0 Step 6 (added below) tests whether Codex's `app-server` natively fans out approvals OR routes to one client. Two outcomes:

- **Native fan-out works**: Happy adds simultaneous-answer race handling. First answer resolves the RPC; the losing client's UI must show "Resolved by another device" and dismiss the prompt cleanly (not just disappear). Document the pattern in `CodexDisplay.tsx` and the app's permission-card component.
- **Native fan-out doesn't work**: Happy adds a thin fan-out layer in `CodexPermissionHandler` — when an approval arrives, broadcast to all attached Happy clients (terminal renderer + phone via relay), accept first answer, ignore subsequent. ~100 LOC change.

Either way, **the losing client must see a clean "this was answered elsewhere" state** rather than a stuck or vanishing prompt.

Stale-client renderer behavior on reconnect: when a client reconnects after a disconnect, the renderer reads `thread/turns/list` to catch up on missed turns. Specify in `CodexDisplay.tsx` that a "(Reconnected — N turns caught up)" hint shows briefly so the user knows what happened.

#### Sub-task 5: Walkthrough verification (1 day)

End-to-end manual run-through of the 7 steps in the Walkthrough section. If any step doesn't work, fix in this phase or document and move to Phase 2.

Including: laptop suspend/lid-close test (disconnect the WebSocket without killing the OS process; verify `app-server` survives and reconnect works on resume).

#### Phase 1 estimate: 3-5 days

Sub-task 1: 1-2 days. Most of the variance is whether the `processEpoch` + reconnect logic ports cleanly or needs partial redesign.
Sub-task 2: 1 day.
Sub-task 3: 0.5 day.
Sub-task 4: 0.5-1 day, depending on Phase 0 Step 6.
Sub-task 5: 1 day, including bug-fixing.

#### NOT in Phase 1 — deferred to Phase 2

- `--use-codex-tui` opt-in for native Codex TUI. Interesting but optional; spending budget before the persistence story is solid is misallocation.
- Push notifications when both clients are silent.
- Idle-timeout for app-server (when does an unused app-server eventually exit?).

### Phase 2 — UX polish + native TUI option

- **`--use-codex-tui` opt-in flag** — after `app-server` starts (and the discovery file is written), spawn `codex --remote ws://127.0.0.1:${port}` as a child process inheriting stdio (no token needed — loopback). The child's exit signals end-of-session for that client; Happy CLI's own ink renderer is skipped. Happy CLI itself stays alive in the background to relay between phone app and the same backend. Demoted from earlier drafts of Phase 1.
- **Banner-style "session is live; answer here too"** when app users are away from foreground
- **Push notification** when a Codex session needs attention and no client is foregrounded
- **Persistence cleanup** — closing all clients triggers a configurable timeout (e.g., 30 minutes) before `app-server` exits. Survives "I'm just switching laptops" without leaking forever. Open question: what's the right default?
- **Background-task surface in app** — list/inspect background terminals from phone via existing `thread/backgroundTerminals/*` RPCs (need to verify what's actually exposed beyond `clean`; the discovery dump only showed `clean`)

### Phase 3 — Documentation and dogfood

- Update `packages/happy-cli/CLAUDE.md` with the multi-device session model
- Update `packages/happy-app/CLAUDE.md` with what app users should expect
- Write user-facing docs covering "your session lives across devices"
- Compare/contrast section: Claude's deferred-switch limits vs. Codex's seamless model — guide users on which to choose

## Testing approach

### Existing test patterns to mirror

- `packages/happy-cli/src/codex/codexAppServerClient.test.ts` — JSON-RPC client mock framing pattern
- `packages/happy-cli/src/codex/codex.integration.test.ts` — real-Codex integration test (skipped if CLI not installed)
- `packages/happy-cli/src/codex/runCodexPublishMode.test.ts` — runCodex.ts wiring tests
- `packages/happy-cli/src/codex/utils/permissionHandler.test.ts` if exists; otherwise grep for `CodexPermissionHandler` test usages

### Test invocation

Per `packages/happy-cli/CLAUDE.md`:
- File-scoped: `pnpm --filter happy exec vitest run src/codex/...`
- Full package: `npm_config_script_shell=bash pnpm --filter happy test` (note the env var; required on Windows for `$npm_execpath` to expand)

### Real-Codex integration testing (manual)

After Phase 1 lands, run on real machine:

1. `pnpm --filter happy build` — rebuild dist
2. `happy-dev codex` (or whatever variant flag opts into the new path) — start a session
3. Connect via phone app to the same session
4. Send messages from terminal; verify phone sees them
5. Send messages from phone; verify terminal sees them
6. Trigger a Bash approval; verify both see the prompt and either can answer
7. Spawn a long task; close the terminal; verify the task keeps running and phone can interact
8. Reopen `happy-dev codex` on laptop; verify it attaches to the existing session

If the `--use-codex-tui` flag is added, also test:
- Native Codex TUI launches and is usable
- Phone-side answering works while native TUI is the foreground
- Closing the TUI doesn't kill the session if phone is still connected

## Failure modes and debugging

### App-server doesn't start

Logs: stdout/stderr of the spawned `codex app-server`. In Happy's flow today, this is captured via stdio pipes. After Phase 1, since stdio is no longer used for IPC, route the app-server's stdout/stderr to a log file at `~/.happy-dev/logs/codex-app-server-<sid>.log`.

Common causes:
- Codex CLI not installed (`codex --version` fails)
- Port collision (another process on the chosen port)
- Auth token env var not exported correctly
- Codex CLI version mismatch (older versions may not support `--listen ws://`)

### Multi-client behavior diverges from expectations

Reproduce with Step 5 of the verification scripts (two `codex --remote` clients). If the upstream `codex-cli` has changed behavior:
- Update the verified RPC surface in this plan
- File an issue against `openai/codex` if the multi-client semantics regressed

### WebSocket transport unexpectedly fails on a user's machine

Phase 1 ships with `--codex-transport=stdio|ws` (default `ws`). If a user reports failures (Windows AV blocking ws, port range exhaustion, firewall rules), they can fall back to stdio temporarily.

Common failure modes for ws transport:
- Windows Defender / corporate AV blocking new ws listeners on loopback (rare but observed)
- IPv6 vs IPv4 mismatch (`127.0.0.1` vs `::1`) — bind explicitly to IPv4
- Port already in use (other process bound to the random port we picked) — retry with a fresh random port

After a few weeks of dogfood with no fallback usage observed, remove the `--codex-transport=stdio` flag in Phase 2 and bake ws as the only path.

### Discovery file points to a dead app-server

Symptoms: `happy codex` startup hangs trying to connect to a stale port.

Root cause: the discovery file at `${configuration.happyHomeDir}/codex-active-${cwdHash}.json` wasn't cleaned up on a previous abnormal exit (kill -9, OOM, system crash).

Fix: the reattach logic should treat connection refusal as "stale; spawn fresh." If it doesn't (Phase 1 bug), the user can manually delete the discovery file. Document in `packages/happy-cli/CLAUDE.md` post-Phase-1.

### Background tasks not surviving client disconnect

Verify with: spawn a `sleep 60` background bash via Codex; observe `thread/backgroundTerminals` state across a client disconnect. If the task dies, it's a Codex bug to file upstream — Happy can't fix it. The plan assumes this works because that's the entire architectural point.

## Out of scope

- **Claude path Q (full SDK migration)** — would converge Claude on Codex's pattern, but it's a separate weeks-long project. Mentioned only in passing here. Not blocked by this plan.
- **Claude Notification-driven deferred switch fixes** — we explored these and concluded they're architecturally limited. Cleanup of the existing in-flight Claude work is its own task (revert to Stop-hook-only deferred switch, document limits).
- **New deferred-switch UX for Codex** — the existing "Send when idle" / abort-button-prompts UI is Claude-specific. For Codex, the seamless-multi-device design largely replaces the need; users don't manually trigger "switch when idle" because there's nothing to switch.
- **Multi-user multi-session collaboration** — different problem space. This plan is "one user, one session, multiple personal devices."

## Open questions

1. Should there be a "deferred switch" UX surface for Codex at all? Or do we entirely lean on "session is always multi-device, no switch needed"? Leaning toward the latter — no surface needed because there's nothing to switch.
2. If a user starts Codex on laptop terminal and phone is in a different timezone / dormant, what's the right notification behavior? Phase 2 question, not blocking Phase 1.
3. **Phase 1: how exactly should daemon ownership work?** Options: (a) `happy codex` always spawns app-server detached and writes the discovery file; (b) the existing daemon (`src/daemon/run.ts`) owns app-server lifecycle and `happy codex` just attaches. Decide during Phase 1 sub-task 2 implementation; option (a) is the simpler ship-first.
4. Is there a coherent CLI subcommand model post-Phase-1 — e.g., `happy codex` to start/attach interactively, `happy codex --daemon` to start headless, `happy codex --attach` to reattach explicitly, `happy codex --kill` to terminate? Phase 2 polish.
5. Default UX choice for Phase 2's `--use-codex-tui`: opt-in is the right call (don't flip default — losing Happy-specific features like the abort-prompt-for-switch UX is a regression for users who don't ask for it).
6. Per-machine collision: when two Happy users on the same machine (rare on dev workstations but possible, e.g., shared lab machines) both run `happy codex`, do their app-servers collide? The discovery file is per-user (in `~/.happy-dev/`) so by default no — each user gets their own app-server. Verify this holds.
7. Phase 0 Step 6 is a verification step but the trigger ("something starts a thread and runs a Bash") needs scaffolding. Decide whether to lean on `happy codex` as the trigger or write a minimal `node` harness that calls `thread/start` + sends a Bash-using prompt.

### Hard invariants (not questions — already decided)

- **Never bind non-loopback addresses.** `0.0.0.0`, LAN IPs, public IPs are all hard rejects. The instant we bind non-loopback the security model changes (auth becomes mandatory). Out of scope for this plan.
- **No auth flags on the `--listen ws://127.0.0.1:N` listener.** Loopback + user-account isolation is sufficient (see Security model section).
- **Phone never connects directly to app-server.** Always via Happy's encrypted relay.

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

## Codex CLI version pin

Verified against **codex-cli 0.125.0-copilot-api.8** on Windows 10.0.26200, 2026-05-02. The protocol may have shifted in later versions; always re-run the verification scripts in this plan before assuming the surface is what's documented here. If the protocol changes, update this plan's "Verified RPC surface" section and `app-server` invocation flags accordingly.

## Glossary

- **app-server** — Codex's headless backend. Started via `codex app-server [--listen URL]`. Owns conversations, threads, tool execution, background tasks. JSON-RPC 2.0 protocol over the chosen transport.
- **thread** — Codex's term for a conversation. Threads are persistent, can be forked, resumed, archived, listed.
- **turn** — A single round of (user message → agent response with tool uses → tool results). Threads contain multiple turns.
- **client** — Anything that connects to the app-server: Happy CLI, native Codex TUI (`codex --remote`), Codex Web, the phone app via Happy's relay, etc.
- **elicitation** — Codex's term for a tool that pauses to ask the user something. Routed via `mcpServer/elicitation/request`. AskUserQuestion-equivalent.
- **approval** — Codex's term for "Claude wants to use this tool — is it OK?" Routed via `item/commandExecution/requestApproval` (Bash) or `item/fileChange/requestApproval` (Edit).
- **Happy's relay** — Phone app talks to Happy server (cloudflared tunnel) which forwards encrypted RPCs to the laptop's Happy CLI, which is a client of the local app-server. Not the same channel as `codex --remote` (which is direct WebSocket from a local terminal).
