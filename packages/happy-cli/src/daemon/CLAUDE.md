# Happy CLI Daemon: Control Flow and Lifecycle

The daemon is a persistent background process that manages Happy sessions, enables remote control from the mobile app, and handles auto-updates when the CLI version changes.

## 1. Daemon Lifecycle

### Starting the Daemon

Command: `happy daemon start`

Control Flow:
1. `src/index.ts` receives `daemon start` command
2. Spawns detached process via `spawnHappyCLI(['daemon', 'start-sync'], { detached: true })`
3. New process calls `startDaemon()` from `src/daemon/run.ts`
4. `startDaemon()` performs startup:
   - Sets up shutdown promise and handlers (SIGINT, SIGTERM, uncaughtException, unhandledRejection)
   - Version check: `isDaemonRunningSameVersion()` reads daemon.state.json, compares `startedWithCliVersion` with `configuration.currentCliVersion`
   - If version mismatch: calls `stopDaemon()` to kill old daemon before proceeding
   - If same version running: exits with "Daemon already running"
   - Lock acquisition: `acquireDaemonLock()` creates exclusive lock file to prevent multiple daemons
   - Authentication: `authAndSetupMachineIfNeeded()` ensures credentials exist
   - State persistence: writes PID, version, HTTP port to daemon.state.json
   - HTTP server: starts on random port for local CLI control (list, stop, spawn)
   - WebSocket: establishes persistent connection to backend via `ApiMachineClient`
   - RPC registration: exposes `spawn-happy-session`, `spawn-in-worktree`, `fork-into-worktree`, `stop-session`, `requestShutdown` handlers
   - Heartbeat loop: every 60s (or HAPPY_DAEMON_HEARTBEAT_INTERVAL) checks for version updates and prunes dead sessions
5. Awaits shutdown promise which resolves when:
   - OS signal received (SIGINT/SIGTERM)
   - HTTP `/stop` endpoint called
   - RPC `requestShutdown` invoked
   - Uncaught exception occurs
6. On shutdown, `cleanupAndShutdown()` performs:
   - Clears heartbeat interval
   - Updates daemon state to "shutting-down" on backend
   - Disconnects WebSocket
   - Stops HTTP server
   - Deletes daemon.state.json
   - Releases lock file
   - Exits process

### Version Mismatch Auto-Update

The daemon detects when `npm upgrade happy` occurs:
1. Heartbeat reads package.json from disk
2. Compares `JSON.parse(package.json).version` with compiled `configuration.currentCliVersion`
3. If mismatch detected:
   - Spawns new daemon via `spawnHappyCLI(['daemon', 'start'])`
   - Hangs and waits to be killed
4. New daemon starts, sees old daemon.state.json version != its compiled version
5. New daemon calls `stopDaemon()` which tries HTTP `/stop`, falls back to SIGKILL
6. New daemon takes over

### Stopping the Daemon

Command: `happy daemon stop`

Control Flow:
1. `stopDaemon()` in `controlClient.ts` reads daemon.state.json
2. Attempts graceful shutdown via HTTP POST to `/stop`
3. Daemon receives request, calls `cleanupAndShutdown()`:
   - Updates backend status to "shutting-down"
   - Closes WebSocket connection
   - Stops HTTP server
   - Deletes daemon.state.json
   - Releases lock file
4. If HTTP fails, falls back to `process.kill(pid, 'SIGKILL')`

## 2. Session Management

### Daemon-Spawned Sessions (Remote)

Initiated by mobile app via backend RPC:
1. Backend forwards RPC `spawn-happy-session` to daemon via WebSocket
2. `ApiMachineClient` invokes `spawnSession()` handler
3. `spawnSession()`:
   - Creates directory if needed
   - Spawns detached Happy process with `--happy-starting-mode remote --started-by daemon`
   - Adds to `pidToTrackedSession` map
   - Sets up 10-second awaiter for session webhook
4. New Happy process:
   - Creates session with backend, receives `happySessionId`
   - Calls `notifyDaemonSessionStarted()` to POST to daemon's `/session-started`
5. Daemon updates tracking with `happySessionId`, resolves awaiter
6. RPC returns session info to mobile app

### Terminal-Spawned Sessions

User runs `happy` directly:
1. CLI auto-starts daemon if configured
2. Happy process calls `notifyDaemonSessionStarted()` 
3. Daemon receives webhook, creates `TrackedSession` with `startedBy: 'happy directly...'`
4. Session tracked for health monitoring

### Session Termination

Via RPC `stop-session` or health check:
1. `stopSession()` finds session by `happySessionId`
2. Sends SIGTERM to process and waits up to 5 seconds
3. Sends SIGKILL if the process ignores SIGTERM
4. Keeps daemon-spawned sessions in `pidToTrackedSession` until the child `exit` handler runs, so resume metadata can still be preserved

## 3. HTTP Control Server

Local HTTP server (127.0.0.1 only) provides:
- `/session-started` - webhook for sessions to report themselves
- `/list` - returns tracked sessions
- `/stop-session` - terminates specific session
- `/spawn-session` - creates new session (used by integration tests)
- `/stop` - graceful daemon shutdown

## 4. Process Discovery and Cleanup

### Doctor Command

`happy doctor` uses `ps aux | grep` to find all Happy processes:
- Production: matches `happy.mjs`, `happy` (or legacy `happy-coder`), `dist/index.mjs`
- Development: matches `tsx.*src/index.ts`
- Categorizes by command args: daemon, daemon-spawned, user-session, doctor

### Clean Runaway Processes

`happy doctor clean`:
1. `findRunawayHappyProcesses()` filters for likely orphans
2. `killRunawayHappyProcesses()`:
   - Sends SIGTERM
   - Waits 1 second
   - Sends SIGKILL if still alive

## 5. State Persistence

### daemon.state.json
```json
{
  "pid": 12345,
  "httpPort": 50097,
  "startTime": "8/24/2025, 6:46:22 PM",
  "startedWithCliVersion": "0.9.0-6",
  "lastHeartbeat": "8/24/2025, 6:47:22 PM",
  "daemonLogPath": "/path/to/daemon.log"
}
```

### machine.json

Daemon startup owns the current machine listener state in `machine.json`:
`{ machineId, tunnelPort, loopbackPort, tunnelId, lastTunnelUrl }`. Older
files with `{ port, tunnelUrl }` are migrated by reading `port` as
`tunnelPort`; keep all readers and writers on the new shape when changing
daemon binding or tunnel startup.

Embedded server startup uses `dualListenerBinding()` to create one tunnel
listener and one loopback listener from shared Happy server context. Keep
`loopback-cap.txt` as a per-start regenerated local capability and pass its
path into loopback auth via `paths.loopbackCap`.

Write `loopback-cap.txt` only after both listeners bind successfully, and stop
the listeners if capability or `machine.json` persistence fails during startup.
Bootstrap the embedded Machine row before `ApiMachineClient.connect()` so
machine-update Socket.IO events can CAS against version 1 immediately.

Local callers that need the embedded listeners should go through
`daemonClient.ts`: loopback requests use `X-Loopback-Capability`, tunnel
requests and Socket.IO auth use a freshly minted `tunnel <claim>` value. Do not
cache signed tunnel claims because the embedded server rejects replayed `jti`s;
cache only stable key material or rereadable capability state.

### Lock File
- Created with O_EXCL flag for atomic acquisition
- Contains PID for debugging
- Prevents multiple daemon instances
- Cleaned up on graceful shutdown

### Worktree Spawn Transactions
- `spawn-in-worktree` is the atomic worktree-creating spawn RPC used for fan-out across all supported agents (claude, codex, gemini, openclaw); `fork-into-worktree` (Codex-only resume into an existing worktree) is a separate reference pattern. Crash recovery for `spawn-in-worktree` is the "Worktree Spawn Transactions" mechanism described below.
- Atomic fan-out spawns persist one JSON file per transaction under `<happyHomeDir>/pending-worktrees/`.
- The daemon records `worktreeCreated`, then `processSpawned` with PID via the `spawnTrackedHappyProcess` PID hook, then `sessionRegistered` after the local `/session-started` webhook.
- Crash recovery should treat `sessionRegistered` records as hands-off and only clean earlier states.
- Worktree transaction recovery uses `execFile('git', args)` and OS PID liveness checks (`tasklist` on Win32, `process.kill(pid, 0)` elsewhere); keep cleanup logic shell-free for Windows quoting safety.

## 6. WebSocket Communication

`ApiMachineClient` handles bidirectional communication:
- Daemon to Server: machine-alive, machine-update-metadata, machine-update-state
- Server to Daemon: rpc-request (spawn-happy-session, spawn-in-worktree, fork-into-worktree, stop-session, requestShutdown)
- TweetNaCl encryption is scoped to message bodies, metadata, and state fields
  (e.g. the `metadata` and `daemonState` fields on machine-update-metadata /
  machine-update-state). rpc-request params and rpc-response ack bodies are
  plaintext Socket.IO payloads — `RpcHandlerManager` passes `request.params`
  straight to the handler and returns the handler's plain result (see
  `packages/happy-cli/src/api/rpc/RpcHandlerManager.ts` and
  `packages/happy-cli/CLAUDE.md`: "RPC request params and responses are
  plaintext Socket.IO payloads...").

## 7. Integration Testing Challenges

Version mismatch test simulates npm upgrade:
- Test modifies package.json, rebuilds with new version
- Daemon's compiled version != package.json on disk
- Critical timing: heartbeat interval must exceed rebuild time
- pkgroll doesn't update compiled imports, must use full pnpm build

# Improvements

I do not like how

- daemon.state.json file is getting hard removed when daemon exits or is stopped. We should keep it around and have 'state' field and 'stateReason' field that will explain why the daemon is in that state
- If the file is not found - we assume the daemon was never started or was cleaned out by the user or doctor
- If the file is found and corrupted - we should try to upgrade it to the latest version? or simply remove it if we have write access

- posts helpers for daemon do not return typed results
- I don't like that daemonPost returns either response from daemon or { error: ... }. We should have consistent envelope type

- we loose track of children processes when daemon exits / restarts - we should write them to the same state file? At least the pids should be there for doctor & cleanup

- caffeinate process is not tracked in state at all & might become runaway
- caffeinate is also started by individual sesions - we should not do that for simpler cleanup 

- the port is not protected - lets encrypt something with a public portion of the secret key & send it as a signature along the rest of the unencrypted payload to the daemon - will make testing harder :/


# Machine Sync Architecture - Separated Metadata & Daemon State

## Data Structure (Similar to Session's metadata + agentState)

```typescript
// Static machine information (rarely changes)
interface MachineMetadata {
  host: string;              // hostname
  platform: string;          // darwin, linux, win32
  happyCliVersion: string;   
  homeDir: string;           
  happyHomeDir: string;
}

// Dynamic daemon state (frequently updated)
interface DaemonState {
  status: 'running' | 'shutting-down' | 'offline';
  pid?: number;
  httpPort?: number;
  startedAt?: number;
  shutdownRequestedAt?: number;
  shutdownSource?: 'mobile-app' | 'cli' | 'os-signal' | 'unknown';
}
```

## 1. CLI Startup Phase

Checks if machine ID exists in settings:
- If not: creates ID locally only (so sessions can reference it)
- Does NOT create machine on server - that's daemon's job
- CLI doesn't manage machine details - all API & schema live in daemon subpackage

## 2. Daemon Startup - Initial Registration

### REST Request: `POST /v1/machines`
```json
{
  "id": "machine-uuid-123",
  "metadata": "base64(encrypted({
    'host': 'MacBook-Pro.local',
    'platform': 'darwin',
    'happyCliVersion': '1.0.0',
    'homeDir': '/Users/john',
    'happyHomeDir': '/Users/john/.happy'
  }))",
  "daemonState": "base64(encrypted({
    'status': 'running',
    'pid': 12345,
    'httpPort': 8080,
    'startedAt': 1703001234567
  }))"
}
```

### Server Response:
```json
{
  "machine": {
    "id": "machine-uuid-123",
    "metadata": "base64(encrypted(...))",  // echoed back
    "metadataVersion": 1,
    "daemonState": "base64(encrypted(...))",  // echoed back
    "daemonStateVersion": 1,
    "active": true,
    "lastActiveAt": 1703001234567,
    "createdAt": 1703001234567,
    "updatedAt": 1703001234567
  }
}
```

## 3. WebSocket Connection & Real-time Updates

### Connection Handshake:
```javascript
io(serverUrl, {
  auth: {
    token: "auth-token",
    clientType: "machine-scoped",
    machineId: "machine-uuid-123"
  }
})
```

### Heartbeat (every 20s):
```json
// Client -> Server
socket.emit('machine-alive', {
  "machineId": "machine-uuid-123",
  "time": 1703001234567
})
```

## 4. Daemon State Updates (via WebSocket)

### When daemon status changes:
```json
// Client -> Server
socket.emit('machine-update-state', {
  "machineId": "machine-uuid-123",
  "daemonState": "base64(encrypted({
    'status': 'shutting-down',
    'pid': 12345,
    'httpPort': 8080,
    'startedAt': 1703001234567,
    'shutdownRequestedAt': 1703001244567,
    'shutdownSource': 'mobile-app'
  }))",
  "expectedVersion": 1
}, callback)

// Server -> Client (callback)
// Success:
{
  "result": "success",
  "version": 2,
  "daemonState": "base64(encrypted(...))"
}

// Version mismatch:
{
  "result": "version-mismatch",
  "version": 3,
  "daemonState": "base64(encrypted(current_state))"
}
```

### Machine metadata update (rare):
```json
// Client -> Server
socket.emit('machine-update-metadata', {
  "machineId": "machine-uuid-123",
  "metadata": "base64(encrypted({
    'host': 'MacBook-Pro.local',
    'platform': 'darwin',
    'happyCliVersion': '1.0.1',  // version updated
    'homeDir': '/Users/john',
    'happyHomeDir': '/Users/john/.happy'
  }))",
  "expectedVersion": 1
}, callback)
```

## 5. Mobile App RPC Calls

### Stop Daemon Request:
```json
// Mobile -> Server
socket.emit('rpc-call', {
  "method": "machine-uuid-123:stop-daemon",
  "params": {
    "reason": "user-requested",
    "force": false
  }
}, callback)

// Server forwards to Daemon
// Daemon -> Server (response)
callback({
  "message": "Daemon shutdown initiated",
  "shutdownAt": 1703001244567
})
```

Note: rpc-call/rpc-request params and the ack body are plaintext JSON over
the machine-scoped Socket.IO channel. Encryption only applies to message
bodies, metadata, and state fields (see Section 6).

### Flow when daemon receives stop request:
1. Daemon receives RPC `stop-daemon`
2. Updates daemon state immediately:
```json
socket.emit('machine-update-state', {
  "machineId": "machine-uuid-123",
  "daemonState": "base64(encrypted({
    'status': 'shutting-down',
    'shutdownRequestedAt': 1703001244567,
    'shutdownSource': 'mobile-app'
  }))",
  "expectedVersion": 2
})
```
3. Sends acknowledgment back via RPC callback
4. Performs cleanup
5. Final state update before exit:
```json
socket.emit('machine-update-state', {
  "machineId": "machine-uuid-123", 
  "daemonState": "base64(encrypted({
    'status': 'offline'
  }))",
  "expectedVersion": 3
})
```

## 6. Server Broadcasts to Clients

### When daemon state changes:
```json
// Server -> Mobile/Web clients
socket.emit('update', {
  "id": "update-id-xyz",
  "seq": 456,
  "body": {
    "t": "update-machine",
    "id": "machine-uuid-123",
    "daemonState": {
      "value": "base64(encrypted(...))",
      "version": 2
    }
  },
  "createdAt": 1703001244567
})
```

### When metadata changes:
```json
socket.emit('update', {
  "id": "update-id-abc",
  "seq": 457,
  "body": {
    "t": "update-machine",
    "id": "machine-uuid-123",
    "metadata": {
      "value": "base64(encrypted(...))",
      "version": 2
    }
  },
  "createdAt": 1703001244567
})
```

## 7. GET Machine Status (REST)

### Request: `GET /v1/machines/machine-uuid-123`
```http
Authorization: Bearer <token>
```

### Response:
```json
{
  "machine": {
    "id": "machine-uuid-123",
    "metadata": "base64(encrypted(...))",
    "metadataVersion": 2,
    "daemonState": "base64(encrypted(...))",
    "daemonStateVersion": 3,
    "active": true,
    "lastActiveAt": 1703001244567,
    "createdAt": 1703001234567,
    "updatedAt": 1703001244567
  }
}
```

## Key Design Decisions

1. **Separation of Concerns**: 
   - `metadata`: Static machine info (host, platform, versions)
   - `daemonState`: Dynamic runtime state (status, pid, ports)

2. **Independent Versioning**:
   - `metadataVersion`: For machine metadata updates
   - `daemonStateVersion`: For daemon state updates
   - Allows concurrent updates without conflicts

3. **Encryption**: Both metadata and daemonState are encrypted separately

4. **Update Events**: Server broadcasts use same pattern as sessions:
   - `t: 'update-machine'` with optional metadata and/or daemonState fields
   - Clients only receive updates for fields that changed

5. **RPC Pattern**: Machine-scoped RPC methods prefixed with machineId (like sessions)




