# Backend Architecture

This document describes the Happy backend structure as implemented in `packages/happy-server`. It focuses on how the server is wired, how data flows through the system, and which subsystems handle which responsibilities.

In the server-per-machine architecture, `happy-server` is no longer a multi-tenant cloud relay. Each machine runs its own embedded `happy-server` instance inside `happy-cli`, which is exposed to the operator's mobile device via a Microsoft Dev Tunnel. The standalone `main.ts` entry point is still available for running the server as a process (used in development), but the production deployment shape is "one server per machine, embedded in the CLI."

## System overview

```mermaid
graph TB
    subgraph "Operator's Machine"
        CLI[happy-cli]
        subgraph "Embedded happy-server"
            API[Fastify API]
            Socket[Socket.IO]
            Events[Event Router]
        end
        subgraph "Local Storage"
            PG[(PGlite)]
            Local[(Local files dir)]
        end
        Daemon[Machine Daemon]
    end

    subgraph "Microsoft Dev Tunnel"
        Tunnel[Tunnel forward to 127.0.0.1:port]
    end

    Mobile[Mobile App]
    Expo[Expo Push Service]

    CLI -.creates.-> API
    Daemon --> API
    Daemon --> Socket
    Mobile -->|HTTPS via tunnel| Tunnel --> API
    Mobile -->|WSS via tunnel| Tunnel --> Socket

    API --> PG
    API --> Local
    Socket --> Events
    Events --> PG
    API --> |session push events| Expo
    Expo --> |notifications| Mobile
```

## At a glance
- Runtime: Node.js + Fastify for HTTP, Socket.IO for realtime.
- Lifecycle: `createHappyServer()` factory in `packages/happy-server/sources/index.ts` starts Fastify in-process from `happy-cli`. A standalone `main.ts` is also retained for non-embedded use.
- Database: PGlite (embedded Postgres) by default via Prisma; external Postgres is opt-in for the standalone deployment shape.
- Cache/bus: Redis is optional. When `REDIS_URL` is set, the Socket.IO Redis-streams adapter is enabled for multi-process fan-out. In the embedded per-machine deployment Redis is not used.
- Blob storage: local filesystem (`<dataDir>/files`) by default; S3-compatible storage is opt-in when `S3_HOST` and friends are set.
- Auth: TOFU handshake middleware verifies `X-Codexu-Authorization: tunnel <base64url-claim>` against the embedded server identity, one-hour `exp`, and replay-protected `jti`. Private Dev Tunnels gateway access is carried separately by `X-Tunnel-Authorization: tunnel <connect-jwt>` (Microsoft's standard scheme; consumed + stripped by the gateway).
- Crypto: privacy-kit `KeyTree` derived from the per-machine `HANDY_MASTER_SECRET` (set by `createHappyServer()` from the configured `machineKey`). Used only for server-side service-token storage.
- Push: Expo push notifications are delivered directly from happy-server via `sendSessionPushEvent` to tokens stored per (machineId, deviceId).
- Metrics: Prometheus-style `/metrics` server + per-request HTTP metrics.

## Process lifecycle

The primary entry point is `createHappyServer()` in `packages/happy-server/sources/index.ts`, which is called from `happy-cli` to start the server in-process. The standalone `main.ts` simply wraps this factory for the non-embedded mode.

```mermaid
flowchart TD
    Start([createHappyServer config]) --> CreateFastify[fastify with logger]
    CreateFastify --> Handle[Return HappyServerHandle]
    Handle --> StartCalled([handle.start])
    StartCalled --> Configure[configure once]

    subgraph "Configure step"
        Configure --> MkData[mkdir dataDir/happy-server]
        MkData --> SetEnv[Set HANDY_MASTER_SECRET from machineKey]
        SetEnv --> ConfigureDb[configureDb provider=pglite]
        ConfigureDb --> ConfigureFiles[configureFiles dataDir publicUrl]
        ConfigureFiles --> Connect[db connect]
        Connect --> Encrypt[initEncrypt KeyTree]
        Encrypt --> GitHub[initGithub optional]
        GitHub --> Files[loadFiles]
        Files --> Auth[auth init]
        Auth --> Cache[startActivityCache]
        Cache --> ConfigureApi[configureApi with tofuConfig]
    end

    ConfigureApi --> Listen[app listen port host]
    Listen --> Running([Running])
    Running --> |handle.stop| Shutdown[Shutdown]
    Shutdown --> Close[app close]
    Close --> AuthDown[auth shutdown]
    AuthDown --> CacheDown[activityCache shutdown]
    CacheDown --> DbDown[disconnectDb]
    DbDown --> LogDown[shutdownLogger]
```

Startup sequence (inside `handle.start()` → `configure()`):
1. Create `<dataDir>/happy-server` and seed `HANDY_MASTER_SECRET` from the configured `machineKey` if it is not already set in the environment.
2. Configure storage:
   - `configureDb({ provider: "pglite", pgliteDir: <dataDir>/happy-server/pglite })` selects PGlite as the default Prisma adapter.
   - `configureFiles({ dataDir, publicUrl })` selects local-filesystem storage by default; S3 is enabled only when an explicit `s3` config is provided.
3. Connect Prisma (`db.$connect()`).
4. Initialize crypto modules:
   - `initEncrypt()` derives a KeyTree from `HANDY_MASTER_SECRET` for service-token encryption.
   - `initGithub()` configures the GitHub App / device-flow integration if env vars exist.
   - `loadFiles()` ensures the local files directory exists (or verifies S3 bucket access when S3 is configured).
   - `auth.init()` prepares legacy internal auth helpers; it no longer authenticates HTTP requests.
5. `startActivityCache()` starts the in-memory presence cache and its batch/cleanup timers.
6. `configureApi(app, tofuConfig)` registers all routes, sockets, and the TOFU `authenticate` decorator on the Fastify instance.
7. `app.listen({ port, host })` binds to the configured loopback address (default `127.0.0.1`).

The standalone `main.ts` additionally starts the metrics server, the database metrics updater, and the presence timeout loop, and registers shutdown hooks. The embedded path lets `happy-cli` decide whether to start those auxiliary loops.

Shutdown calls `handle.stop()`, which closes the Fastify app, shuts down the auth module and activity cache, disconnects the database (and closes the PGlite instance), and flushes the logger.

## API layer

`configureApi()` in `sources/app/api/api.ts` wires the HTTP server:
- Fastify instance with Zod validators/serializers (created via `createApi()`).
- Global hooks for monitoring and error handling.
- `authenticate` decorator that verifies the TOFU `X-Tunnel-Authorization: tunnel <claim>` header against the embedded server's `localUserId` and a 24-hour `iat` window.
- A `/files/*` static handler when local-filesystem storage is in use.
- Route modules under `sources/app/api/routes`.
- Socket.IO server attached at `/v1/updates` with the same TOFU handshake check in its middleware.

```mermaid
graph LR
    subgraph "Fastify Server"
        Hooks[Global Hooks]
        Auth[authenticate decorator - TOFU claim]

        subgraph Routes
            direction TB
            R1[pairRoutes]
            R2[sessionRoutes]
            R3[accountRoutes]
            R4[machineSelfRoutes]
            R5[pushRoutes]
            R6[v3SessionRoutes]
            R7[versionRoutes / devRoutes]
        end
    end

    SocketIO[Socket.IO /v1/updates]

    Mobile -->|tunnel claim| Hooks --> Auth --> Routes
    Mobile -->|tunnel claim| SocketIO
```

HTTP routes are organized by domain:
- Pairing (`pairRoutes`) - GitHub device-flow + TOFU handshake replacement for the old auth/connect flow.
- Self/account state (`accountRoutes`, `machineSelfRoutes`) - paired profile, local settings, and current machine state under `/v2/me/*`.
- Sessions + messages (`sessionRoutes`, `v3SessionRoutes`).
- Push tokens (`pushRoutes`).
- Version checks (`versionRoutes`).
- Dev-only logging (`devRoutes`).

Sprint E removed the obsolete route modules for artifacts, access keys, key-value store, users/friends/feed, voice, and the server-side machine directory. Multi-tenant account creation, GitHub OAuth-via-server callback, and challenge-based Bearer issuance no longer exist on the server.

## Authentication and pairing (revised 2026-05-13)

```mermaid
sequenceDiagram
    participant Mobile
    participant Gateway as Dev Tunnels Gateway
    participant Server as happy-server (embedded)

    Note over Mobile: User has ghu_* token from earlier devtunnel GitHub device flow
    Mobile->>Gateway: POST /pair/complete + X-Tunnel-Authorization: tunnel <connect-jwt>
    Gateway->>Gateway: Verify connect token, strip header
    Gateway->>Server: POST /pair/complete (forwarded, no X-Tunnel-Authorization)
    Server->>Server: Read identity from ~/.happy/profile.json
    Server->>Server: Sign Happy envelope ed25519.sign(payload{sub,iat,exp,jti,accountId})
    Server-->>Gateway: { githubLogin, machine: { machineId, tunnelUrl, ed25519PublicKey, ed25519Fingerprint, tunnelClaim } }
    Gateway-->>Mobile: 200 + body

    Note over Mobile,Server: Subsequent requests

    Mobile->>Gateway: Request + X-Tunnel-Authorization: tunnel <connect-jwt> + X-Codexu-Authorization: tunnel <claim>
    Gateway->>Gateway: Verify connect token, strip X-Tunnel-Authorization
    Gateway->>Server: Request + X-Codexu-Authorization (passed through)
    Server->>Server: authenticate decorator reads x-codexu-authorization; verify ed25519 sig, sub == localUserId, exp + jti replay protection, 1h max TTL
    Server-->>Mobile: Response
```

The backend does not store accounts or passwords. Pairing identity comes from `~/.happy/profile.json`, which is written when the operator runs `happy auth login --force` on the daemon machine (one-time GitHub device flow against `Iv1.e7b89e013f801f03`, the public devtunnel OAuth app).

- `POST /pair/complete` is the single pair + refresh endpoint. The Dev Tunnels gateway's `X-Tunnel-Authorization: tunnel <connect-jwt>` check is the identity gate; the daemon's signed Ed25519 envelope binds the claim to its local Ed25519 key + the operator's GitHub identity (`accountId` from profile.json). The mobile client trust-on-first-use pins the daemon's Ed25519 public key on first pair.
- All subsequent HTTP and WebSocket calls present BOTH `X-Tunnel-Authorization: tunnel <connect-jwt>` (gateway, consumed + stripped) AND `X-Codexu-Authorization: tunnel <happy-claim>` (passes through to the daemon).

The claim is Ed25519-signed by the embedded server. Tunnel-facing routes and Socket.IO middleware base64url-decode the envelope, verify the signature against the configured Ed25519 public key, then check `sub === localUserId`, enforce `exp`, and reject replayed `jti` values from the in-memory cache. Optional `accountId` carries the GitHub numeric user id.

The refresh-per-request model is intentional: app and agent callers refresh the Happy claim before protected HTTP calls and Socket.IO handshakes by re-hitting `/pair/complete`. The gateway connect-token is refreshed separately by the client via `connectTokenRefresh.ts` against the Dev Tunnels API.

The legacy `auth` module (`sources/app/auth/auth.ts`) still exists and is initialized at startup, but it is no longer used to authenticate HTTP requests. It is retained for internal helpers (e.g., the GitHub ephemeral token used by integrations) and for the standalone deployment shape.

## Realtime sync architecture

```mermaid
graph TB
    subgraph Connections
        U1[Mobile Client - user-scoped]
        S1[Mobile Client - session-scoped]
        M1[Machine Daemon - machine-scoped]
    end

    subgraph "Socket.IO Server"
        Auth[TOFU handshake middleware]
        Router[Event Router]

        subgraph Scopes
            US[user-scoped]
            SS[session-scoped]
            MS[machine-scoped]
        end
    end

    U1 --> Auth --> US
    S1 --> Auth --> SS
    M1 --> Auth --> MS

    US & SS & MS --> Router

    Router --> |persistent update| DB[(PGlite)]
    Router --> |ephemeral event| Clients((Filtered Recipients))
```

### Connection types
Socket.IO connections are tagged by scope at handshake time:
- `user-scoped`: receives all updates for the local user.
- `session-scoped`: receives updates only for one session.
- `machine-scoped`: daemon connections for machine state.

The Socket.IO middleware in `sources/app/api/socket.ts` enforces the same TOFU claim check as the HTTP layer before any connection is accepted, then attaches `userId`, `clientType`, `sessionId`, `machineId`, and the TOFU public keys to `socket.data`. On connection, it emits a `tofu-pubkeys` event so clients that connected via Socket.IO directly can perform the TOFU pin.

### Event router
`EventRouter` (`sources/app/events/eventRouter.ts`) maintains per-user connection sets and routes:
- **Persistent `update` events**: database-backed changes with a user-level monotonic `seq`.
- **Ephemeral events**: presence signals that are not persisted.

The router implements recipient filters so updates go only to interested connections (e.g., all session listeners or a specific machine).

### Update sequence numbers
- A per-user `seq` counter is allocated by `allocateUserSeq` and used as `UpdatePayload.seq`. There is no longer an `Account` row backing it; in the single-tenant schema the counter is maintained by the seq helper.
- Sessions and machines maintain their own `seq` for per-object ordering.

### Multi-process Redis adapter (optional)
When `REDIS_URL` is set, `startSocket()` attaches `@socket.io/redis-streams-adapter` so multiple server processes can share Socket.IO state and a `redisStreamLagMsGauge` metric tracks reader lag. The embedded per-machine deployment never sets `REDIS_URL`, so this code path is dormant.

## Presence and activity

```mermaid
flowchart LR
    subgraph "High Frequency"
        Events[session-alive / machine-alive]
        Cache[Activity Cache]
    end

    subgraph "Batched Writes"
        Batch[Batch Processor]
        DB[(PGlite)]
    end

    subgraph "Timeout Loop"
        Timer[10 min timer]
        Offline[Mark Inactive]
        Emit[Emit offline update]
    end

    Events --> |debounce| Cache
    Cache --> |batch| Batch --> DB
    Timer --> Cache
    Cache --> |stale entries| Offline --> DB
    Offline --> Emit
```

Presence is handled in `sources/app/presence`:
- `session-alive` and `machine-alive` events are debounced in memory (`ActivityCache`) with a 30-second TTL and a 5-second batch interval.
- Database writes are batched to reduce write load.
- A timeout loop marks sessions/machines inactive after 10 minutes of silence and emits an offline ephemeral update.

This splits high-frequency presence from durable storage updates.

## Storage and persistence

### Database (Prisma)

The schema in `prisma/schema.prisma` is single-tenant — there is no `Account`, `GithubUser`, or `AccountPushToken` model. All entities belong to the single embedded server's local user.

```mermaid
erDiagram
    Session ||--o{ SessionMessage : contains
    Machine ||--o{ PushToken : has

    Session {
        string id
        string tag
        string metadata
        int metadataVersion
        string agentState
        bytes dataEncryptionKey
        int seq
        bool active
    }

    SessionMessage {
        string id
        string sessionId
        int seq
        json content
    }

    Machine {
        string id
        string metadata
        string daemonState
        bytes dataEncryptionKey
        int seq
        bool active
    }

    PushToken {
        string id
        string machineId
        string deviceId
        string expoPushToken
    }

```

Key tables:
- `Session` + `SessionMessage`: encrypted session metadata and message blobs.
- `Machine`: encrypted machine metadata + daemon state for the local machine and any peer machines.
- `PushToken`: per-`(machineId, deviceId)` Expo push tokens. The previous `AccountPushToken` model has been replaced by this single-tenant table.

### Transactions and retries

```mermaid
flowchart TD
    Start([inTx call]) --> Begin[Begin Transaction]
    Begin --> |Serializable| Exec[Execute Operations]
    Exec --> Commit{Commit}

    Commit --> |Success| After[afterTx callbacks]
    After --> Emit[Emit Socket Updates]
    Emit --> Done([Complete])

    Commit --> |P2034 Error| Retry{Retry?}
    Retry --> |Yes| Begin
    Retry --> |Max retries| Fail([Throw Error])
```

`inTx()` wraps Prisma transactions with:
- Serializable isolation.
- Automatic retry on `P2034` (serialization failures).
- `afterTx()` to emit socket updates after commit.

This pattern is used for multi-write operations like session deletion.

### Blob storage (local-first)
The default storage backend is the local filesystem under `<dataDir>/files`:
- `storage/files.ts` exposes `configureFiles({ dataDir, publicUrl, s3? })`. With no `s3` config, `useLocalStorage` is `true` and `loadFiles()` simply ensures the local directory exists.
- A `/files/*` route is registered on the Fastify instance when local storage is in use, serving files within the configured directory.

S3-compatible storage is opt-in. Provide an `s3` block (or set `S3_HOST`/`S3_BUCKET`/`S3_PUBLIC_URL`/etc.) and the same module switches to MinIO-style uploads with public URLs derived from `S3_PUBLIC_URL`.

### Redis (optional)
A Redis client is no longer constructed at startup. Redis is consulted only by the Socket.IO multi-process adapter, which is enabled lazily when `REDIS_URL` is set. The embedded per-machine deployment runs without Redis.

## Push notifications

Push delivery is owned by happy-server in the per-machine architecture. The CLI no longer talks to Expo directly.

- `pushRoutes` exposes `POST /push/register`, `POST /v1/push-tokens`, `DELETE /v1/push-tokens/:token`, and `GET /v1/push-tokens`. All four endpoints are gated by the `authenticate` decorator and bind tokens to the `tofuConfig.localUserId` plus a per-device `deviceId`.
- `registerPushToken` upserts a row in the `PushToken` table keyed by `(machineId, deviceId)`.
- `sendSessionPushEvent` (in `sources/app/push/pushNotifications.ts`) is called from session-update handlers to push a notification for `new-session`, `status-change`, `agent-message`, or `codex-finish` events. It calls `https://exp.host/--/api/v2/push/send` directly with a body that includes `to`, `title`, `body`, `sound: "default"`, `priority: "high"`, and a `data` payload with `machineId`, `sessionId`, `kind`, and a deep-link `url`.
- Failed responses are logged but do not block the calling write transaction.

## Data confidentiality model

```mermaid
graph TB
    subgraph "Client-side Encryption"
        C1[Session metadata]
        C2[Agent state]
        C3[Daemon state]
        C4[Message content]
    end

    subgraph "Server-side Encryption"
        S1[GitHub OAuth tokens]
    end

    C1 & C2 & C3 & C4 --> |opaque blobs| DB[(PGlite)]
    S1 --> |KeyTree from HANDY_MASTER_SECRET| DB

    style C1 fill:#e1f5fe
    style C2 fill:#e1f5fe
    style C3 fill:#e1f5fe
    style C4 fill:#e1f5fe
    style S1 fill:#fff3e0
```

- Session metadata, agent state, daemon state, and message content are stored as opaque encrypted strings or blobs.
- The server only encrypts/decrypts GitHub OAuth material it owns using the KeyTree derived from `HANDY_MASTER_SECRET`. In the embedded deployment that secret is the per-machine `machineKey` configured by `happy-cli`, not a shared cloud master.

## Integrations
- **GitHub**: device-flow OAuth is no longer wired into HTTP routes. Operator identity is read at pair time from `~/.happy/profile.json` (written when the operator runs `happy auth login --force` on the daemon machine via the one-time devtunnel GitHub device flow). The previous `HAPPY_TUNNEL_GITHUB_OWNER` env var and per-machine `GITHUB_CLIENT_ID` are removed.
- **Push tokens**: stored per `(machineId, deviceId)` for direct Expo delivery.

## Observability
- `/health` route checks DB connectivity.
- Metrics server exposes `/metrics` for Prometheus.
- HTTP request counters and duration histograms are captured via Fastify hooks.
- WebSocket event counters and connection gauges are in `metrics2.ts`.

## Key implementation references
- Embedded factory: `packages/happy-server/sources/index.ts` (`createHappyServer`)
- Standalone entrypoint: `packages/happy-server/sources/main.ts`
- API server: `packages/happy-server/sources/app/api/api.ts`
- TOFU handshake middleware: see `authenticate` decorator and Socket.IO `io.use` block in `app/api/api.ts` and `app/api/socket.ts`
- Pairing routes: `packages/happy-server/sources/app/api/routes/pairRoutes.ts`
- Push notifications: `packages/happy-server/sources/app/push/pushNotifications.ts`, `packages/happy-server/sources/app/api/routes/pushRoutes.ts`
- Socket server: `packages/happy-server/sources/app/api/socket.ts`
- Event routing: `packages/happy-server/sources/app/events/eventRouter.ts`
- Presence: `packages/happy-server/sources/app/presence`
- Storage: `packages/happy-server/sources/storage`
- Prisma schema: `packages/happy-server/prisma/schema.prisma`
