# CLI Architecture

This document describes the Happy CLI (`packages/happy-cli`) and its daemon. The CLI is both an interactive tool and a background session manager that hosts an embedded `happy-server` and exposes it to the mobile/web clients via a Microsoft Dev Tunnel.

## System overview

```mermaid
graph TB
    subgraph "Happy CLI"
        Entry[src/index.ts]
        API[API Client]
        Daemon[Daemon Process]
        Embedded[Embedded happy-server]
        Tunnel[TunnelManager]
        Tofu[Keypair Manager]
        Agents[Agent Runners]
        Persist[Persistence]
    end

    subgraph "~/.happy"
        Settings[settings.json]
        AccessKey[access.key]
        DaemonState[daemon.state.json]
        MachineFile[machine.json]
        TunnelFile[tunnel.json]
        ServerKeyPub[server-key.pub]
        ServerKeyPriv[server-key.priv]
    EcdhPub[ecdh-key.pub]
    EcdhPriv[ecdh-key.priv]
        Logs[logs/]
    end

    subgraph "Dev Tunnel"
        DevTunnel[devtunnel host]
    end

    Entry --> API
    Entry --> Daemon
    Entry --> Tunnel
    Entry --> Agents
    Entry --> Persist

    Daemon --> Embedded
    Daemon --> Tunnel
    Daemon --> Tofu

    Persist --> Settings & AccessKey & DaemonState & MachineFile & TunnelFile & Logs
    Tofu --> ServerKeyPub & ServerKeyPriv & EcdhPub & EcdhPriv

    Tunnel -->|spawns| DevTunnel
    DevTunnel -->|forwards 127.0.0.1:port| Embedded

    Agents --> Embedded
```

## High-level layout
- **Entry point:** `src/index.ts` parses subcommands and routes execution.
- **API client:** `src/api` handles HTTP + Socket.IO, encryption, and RPC.
- **Daemon:** `src/daemon` runs in the background, hosts the embedded `happy-server`, spawns sessions, and maintains machine state.
- **Tunnel manager:** `src/tunnel/tunnelManager.ts` owns Microsoft Dev Tunnel lifecycle (login, create, port mapping, host, renewal).
- **TOFU keypair manager:** `src/tofu/keypairManager.ts` loads or creates the long-term Ed25519 server identity and X25519 ECDH keys.
- **Persistence/config:** `src/persistence.ts` + `src/configuration.ts` manage local state in `~/.happy`.
- **Agents:** `src/claude`, `src/codex`, `src/gemini` provide provider-specific runners.

## CLI entry flow

```mermaid
flowchart TD
    Start([happy ...]) --> Parse[Parse subcommand]

    Parse --> Doctor{doctor?}
    Parse --> Init{init?}
    Parse --> Auth{auth?}
    Parse --> Connect{connect?}
    Parse --> Agent{codex/gemini?}
    Parse --> Default{default}

    Doctor --> RunDoctor[Run diagnostics]
    Init --> RunInit[runInitCommand:<br/>provision Dev Tunnel]
    Auth --> RunAuth[Auth flow]
    Connect --> RunConnect[Connect machine]

    Agent --> Setup[authAndSetupMachineIfNeeded]
    Default --> Setup

    Setup --> Context{Background?}
    Context --> |Yes| StartDaemon[Start daemon]
    Context --> |No| RunAgent[Run agent directly]

    StartDaemon --> SpawnSession[Spawn session]
```

`src/index.ts` is the CLI router. It:
- Parses subcommands (`doctor`, `init`, `auth`, `connect`, `codex`, `gemini`, and default run flows).
- Routes `happy init` to `runInitCommand` from `src/tunnel/tunnelManager.ts`, which provisions the Microsoft Dev Tunnel and writes `~/.happy/tunnel.json`.
- Ensures auth and machine setup when needed (`authAndSetupMachineIfNeeded`).
- Starts the daemon or runs an agent directly based on subcommand/context.

`happy init` is a one-time provisioning step run by the human operator before the daemon can start. It picks/reuses a free loopback port, writes it to `~/.happy/machine.json`, ensures the operator is logged into Dev Tunnels (GitHub device flow), creates or reuses the named tunnel `happy-<host>-<machineId>`, configures the port, and persists `tunnel.json` with the resulting public `tunnelUrl`.

## Local state and configuration

```mermaid
graph LR
    subgraph "~/.happy"
        direction TB
        settings["settings.json<br/><i>profile, onboarding, machineId</i>"]
        access["access.key<br/><i>auth token + content keys</i>"]
        daemon["daemon.state.json<br/><i>PID, port, version</i>"]
        machine["machine.json<br/><i>embedded server port, tunnelUrl</i>"]
        tunnel["tunnel.json<br/><i>tunnelId, tunnelUrl, dates</i>"]
        edpub["server-key.pub<br/><i>Ed25519 public key</i>"]
        edpriv["server-key.priv<br/><i>Ed25519 secret key</i>"]
        ecdhpub["ecdh-key.pub<br/><i>X25519 public key</i>"]
        ecdhpriv["ecdh-key.priv<br/><i>X25519 secret key</i>"]
        logs["logs/<br/><i>CLI/daemon logs</i>"]
    end

    subgraph "Environment Overrides"
        direction TB
        E1[HAPPY_HOME_DIR]
        E2[HAPPY_SERVER_URL]
        E3[HAPPY_WEBAPP_URL]
        E4[HAPPY_VARIANT]
        E5[HAPPY_EXPERIMENTAL]
        E6[HAPPY_DISABLE_CAFFEINATE]
    end

    E1 -.-> settings & access & daemon & machine & tunnel & edpub & edpriv & ecdhpub & ecdhpriv & logs
```

Local state lives under `~/.happy` (or `HAPPY_HOME_DIR`):
- `settings.json`: onboarding, profile settings, and `machineId` (validated/migrated).
- `access.key`: local auth token and content encryption keys.
- `daemon.state.json`: daemon PID + control port + version.
- `machine.json`: embedded `happy-server` loopback port and last-known `tunnelUrl`.
- `tunnel.json`: Dev Tunnel record (`tunnelId`, `tunnelName`, `tunnelUrl`, `createdAt`, optional `refreshedAt`).
- `server-key.pub` / `server-key.priv`: long-term Ed25519 keypair that defines this machine's TOFU identity. The SHA-256 fingerprint of the public key is what mobile clients pin on first pair.
- `ecdh-key.pub` / `ecdh-key.priv`: legacy TOFU public-key material still surfaced for compatibility; RPC payload encryption is no longer derived from it.
- `logs/`: CLI/daemon logs.

The `~/.happy` directory itself is created with mode `0700`. All four key files are written `0600` on POSIX and locked down via `icacls` on Windows.

Configuration lives in `src/configuration.ts`:
- `HAPPY_SERVER_URL` and `HAPPY_WEBAPP_URL` override defaults.
- `HAPPY_VARIANT`, `HAPPY_EXPERIMENTAL`, `HAPPY_DISABLE_CAFFEINATE` control behavior.

## API client architecture

```mermaid
graph TB
    subgraph "API Clients"
        Base[ApiClient]
        Session[ApiSessionClient]
        Machine[ApiMachineClient]
        Encrypt[encryption.ts]
    end

    subgraph "Embedded happy-server (loopback or via tunnel)"
        HTTP[HTTP API]
        Socket[Socket.IO]
    end

    Base --> |session HTTP| HTTP
    Base --> |self/machine HTTP| HTTP

    Session --> |session-scoped| Socket
    Machine --> |machine-scoped| Socket

    Encrypt --> Base & Session & Machine
```

### HTTP
`ApiClient` (`src/api/api.ts`) handles session HTTP calls with encrypted metadata/state and wires tunnel-authenticated clients for the embedded server. The server-side machine directory was removed in Sprint E; machine discovery now comes from locally persisted Dev Tunnel credentials and `/v2/me/machine`, while daemon state flows through the Socket.IO machine scope.

### WebSocket

```mermaid
graph LR
    subgraph "ApiSessionClient"
        S_In[Receive: update]
        S_Out[Emit: message, update-metadata,<br/>update-state, session-alive]
    end

    subgraph "ApiMachineClient"
        M_In[Receive: machine updates]
        M_Out[Emit: machine-alive,<br/>update metadata/state]
    end

    Server((Embedded happy-server<br/>Socket.IO)) --> S_In & M_In
    S_Out & M_Out --> Server
```

`ApiSessionClient` (`src/api/apiSession.ts`) connects to Socket.IO as a **session-scoped** client:
- Receives `update` events and decrypts message content.
- Emits `message`, `update-metadata`, `update-state`, and `session-alive`.

`ApiMachineClient` (`src/api/apiMachine.ts`) connects as a **machine-scoped** client:
- Sends `machine-alive` heartbeats.
- Updates machine metadata/daemon state with optimistic concurrency.
- Receives machine updates and merges them locally.

### Authentication And Gateway Access

CLI and daemon traffic uses two independent credentials when crossing a private Dev Tunnel:

- `X-Tunnel-Authorization: tunnel <connect-jwt>` carries the Dev Tunnels connect token (Microsoft's gateway auth scheme; obtained through `ClientTunnelProvider.getConnectToken(tunnelId)`). The Dev Tunnels gateway consumes and strips this header before forwarding to the backend.

`src/tunnel/tunnelManager.ts` creates private tunnels and must not add anonymous access flags. The app and happy-agent refresh Dev Tunnels connect tokens before tunnel HTTP/Socket.IO calls.

### Encryption

```mermaid
flowchart LR
    subgraph "Client-side"
        Plain[Plaintext Data]
        Encrypt[encryption.ts]
        B64[Base64 Encoded]
    end

    Plain --> |encrypt| Encrypt --> B64 --> |send| Server[(Embedded happy-server)]
    Server --> |receive| B64 --> |decrypt| Encrypt --> Plain

    style Plain fill:#e8f5e9
    style B64 fill:#fff3e0
```

The CLI encrypts client content before it leaves the machine using `src/api/encryption.ts`.
- Session metadata, agent state, messages, and machine state are encrypted client-side.
- On-wire encoding is base64; see `encryption.md`.
- RPC params and responses are plaintext JSON over TLS plus Dev Tunnels gateway auth. Session content encryption remains for message bodies, metadata, and state fields.

## Daemon architecture

Session fan-out uses `src/daemon/spawnInWorktree.ts` for transactional worktree creation and process launch. The transaction record tracks worktree creation, process spawn, and session registration so crash recovery can roll back partial spawns without leaving orphan worktrees.

```mermaid
graph TB
    subgraph "Daemon Process"
        Control[Control Server<br/>127.0.0.1:port]
        Sessions[Session Map]
        MachineClient[ApiMachineClient]
        Embedded[Embedded happy-server<br/>127.0.0.1:embeddedPort]
        TunnelHost[Dev Tunnel host child]
    end

    subgraph "Child Processes"
        S1[Session 1]
        S2[Session 2]
        S3[Session N]
    end

    CLI[CLI] --> |IPC| Control
    Control --> Sessions
    Sessions --> S1 & S2 & S3

    MachineClient -->|loopback| Embedded
    Embedded -->|published via| TunnelHost
    TunnelHost -->|public https://*.devtunnels.ms| Mobile[(Mobile / Web)]
```

The daemon is a long-lived process responsible for hosting the embedded `happy-server`, exposing it via a Dev Tunnel, running sessions in the background, and maintaining machine presence.

### Lifecycle

```mermaid
flowchart TD
    Start([startDaemon]) --> Validate[Validate version]
    Validate --> Lock[Acquire lock file]
    Lock --> Auth[Authenticate + machine setup]
    Auth --> Tofu[Load or create<br/>Ed25519 + X25519 keypairs]
    Tofu --> ResolvePort[Resolve embedded server port<br/>from machine.json]
    ResolvePort --> LoadTunnel[TunnelManager.loadForDaemon<br/>auto-renew if needed]
    LoadTunnel --> StartServer[createHappyServer + start<br/>127.0.0.1:embeddedPort]
    StartServer --> StartHost[devtunnel host child]
    StartHost --> Control[Start control server]
    Control --> Register[Register machine with tunnelUrl]
    Register --> Track[Track child sessions]
    Track --> Heartbeat[Heartbeat + bundle-replace check]
    Heartbeat --> Running([Running])

    Running --> |SIGTERM| Shutdown[apiMachine.shutdown<br/>tunnelManager.stop<br/>embeddedServer.stop<br/>cleanup & exit]
```

1. `startDaemon()` validates the running version and acquires a lock file.
2. It authenticates and resolves the local `machineId`.
3. It loads or creates the TOFU keypairs via `loadOrCreateTofuKeypairs(...)`. On first creation, the Ed25519 fingerprint (`SHA256:...`) is printed so the operator can confirm it during mobile pairing.
4. It resolves the embedded server port from `machine.json` (creating one with `pickFreeLoopbackPort` if absent).
5. It calls `TunnelManager.loadForDaemon(port)`, which fails fast if `happy init` has not been run, otherwise renews the tunnel if it is past `RENEW_AFTER_DAYS` (25) or within `RENEW_WITHIN_EXPIRY_DAYS` (7) of expiry, and ensures the loopback port is configured on the tunnel.
6. It calls `createHappyServer(...)` (from the workspace `happy-server` package) with the resolved port, machine key, local user id, public `tunnelUrl`, and TOFU public keys, then `start()`s it.
7. It calls `tunnelManager.startHost(...)`, which spawns a detached `devtunnel host <tunnelId> --port-number <port>` child that forwards public traffic to the loopback port.
8. It starts the local **control server** for IPC.
9. It registers the machine with the upstream coordination service (the metadata payload now includes `tunnelUrl`) and keeps a map of tracked child sessions.

### Control server (local IPC)

```mermaid
sequenceDiagram
    participant CLI
    participant State as daemon.state.json
    participant Control as Control Server
    participant Daemon

    CLI->>State: Read port
    State-->>CLI: port: 12345

    CLI->>Control: GET /list
    Control-->>CLI: [sessions...]

    CLI->>Control: POST /spawn-session
    Control->>Daemon: Spawn child process
    Daemon-->>Control: Session started
    Control-->>CLI: OK

    CLI->>Control: POST /stop
    Control->>Daemon: Shutdown
```

`startDaemonControlServer()` (`src/daemon/controlServer.ts`) runs an HTTP server on `127.0.0.1` and exposes:
- `/list` (list active sessions)
- `/stop-session`
- `/spawn-session`
- `/stop` (shutdown daemon)
- `/session-started` (session self-report)

The CLI talks to this server via `controlClient.ts`, using a port stored in `daemon.state.json`. This is distinct from the embedded `happy-server`'s port (stored in `machine.json`).

### Session spawning

```mermaid
flowchart LR
    subgraph "Session Sources"
        CLI[CLI<br/><i>foreground</i>]
        Daemon[Daemon<br/><i>background</i>]
        Remote[Mobile/Web<br/><i>via RPC over tunnel</i>]
    end

    subgraph "Session Process"
        Session[Agent Session]
        Handlers[RPC Handlers]
    end

    CLI --> Session
    Daemon --> Session
    Remote --> |spawn-session| Daemon --> Session

    Session --> Handlers

    subgraph "RPC Surface"
        Handlers --> Bash[bash]
        Handlers --> Files[file read/write]
        Handlers --> Search[ripgrep]
        Handlers --> Diff[difftastic]
    end
```

Sessions can be started by:
- The CLI directly (foreground).
- The daemon (background).
- Remote requests over RPC (from mobile/web, reaching the embedded `happy-server` via the Dev Tunnel).

Daemon session spawning uses `registerCommonHandlers` to expose a controlled RPC surface (shell commands, file operations, search/diff helpers, and the atomic `spawn-in-worktree` RPC that creates a UUID-named worktree, spawns a tracked Happy process, and records the txn through `worktreeCreated -> processSpawned -> sessionRegistered` with crash-recovery rollback). See `packages/happy-cli/src/daemon/CLAUDE.md` "Worktree Spawn Transactions" for the transaction record and rollback details.

### Machine state

```mermaid
graph TB
    subgraph "Machine Metadata (static)"
        M1[host]
        M2[platform]
        M3[CLI version]
        M4[paths]
        M5[tunnelUrl]
    end

    subgraph "Daemon State (dynamic)"
        D1[pid]
        D2[httpPort]
        D3[startedAt]
        D4[shutdown info]
    end

    subgraph "Sync Targets"
        Server[(Coordination service)]
        DaemonLocal[daemon.state.json]
        MachineLocal[machine.json]
    end

    ApiMachine[ApiMachineClient]

    M1 & M2 & M3 & M4 & M5 --> ApiMachine
    D1 & D2 & D3 & D4 --> ApiMachine
    D1 & D2 & D3 & D4 --> DaemonLocal
    M5 --> MachineLocal

    ApiMachine --> Server
```

- **Machine metadata** is mostly static (host, platform, CLI version, paths) but now also carries the public `tunnelUrl` so other clients can reach the embedded server.
- **Daemon state** is dynamic (pid, httpPort, startedAt, shutdown info).

The daemon updates these via `ApiMachineClient`, mirrors local control state into `daemon.state.json`, and persists the embedded server port + last-known tunnel URL into `machine.json` for control/diagnostics.

## RPC and tool bridge

```mermaid
sequenceDiagram
    participant Mobile
    participant Tunnel as Dev Tunnel
    participant Embedded as Embedded happy-server
    participant Daemon
    participant Session

    Mobile->>Tunnel: RPC: spawn-session
    Tunnel->>Embedded: Forward to 127.0.0.1:embeddedPort
    Embedded->>Daemon: Forward via Socket.IO
    Daemon->>Session: Spawn process
    Session-->>Daemon: Running

    Mobile->>Tunnel: RPC: bash "ls -la"
    Tunnel->>Embedded: Forward
    Embedded->>Session: Forward via Socket.IO
    Session->>Session: Execute command
    Session-->>Embedded: Result
    Embedded-->>Tunnel: Result
    Tunnel-->>Mobile: Result

    Note over Mobile,Session: All RPC flows through Socket.IO<br/>over the per-machine Dev Tunnel<br/>No multi-tenant relay
```

RPC is used to send commands over the Socket.IO connection:
- Sessions register RPC handlers (e.g., `bash`, file read/write, `ripgrep`, `difftastic`).
- The daemon registers a spawn-session handler so the mobile/web client can ask it to start a local session.

This mechanism allows mobile clients to drive local actions through the per-machine embedded server without exposing a broad REST surface to the public internet — only the loopback port, published through the Dev Tunnel, is reachable.

## Implementation references
- CLI entry: `packages/happy-cli/src/index.ts`
- Daemon: `packages/happy-cli/src/daemon`
- Daemon lifecycle (embedded server + tunnel host): `packages/happy-cli/src/daemon/run.ts`
- Control server/client: `packages/happy-cli/src/daemon/controlServer.ts`, `packages/happy-cli/src/daemon/controlClient.ts`
- Tunnel manager + `happy init`: `packages/happy-cli/src/tunnel/tunnelManager.ts`, `packages/happy-cli/src/tunnel/types.ts`
- TOFU keypair manager: `packages/happy-cli/src/tofu/keypairManager.ts`
- Embedded server contract: `packages/happy-cli/src/types/happy-server.d.ts` (workspace dependency on `happy-server`)
- API clients: `packages/happy-cli/src/api`
- Persistence: `packages/happy-cli/src/persistence.ts`
- Config: `packages/happy-cli/src/configuration.ts`
