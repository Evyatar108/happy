# Protocol

This document describes the Happy wire protocol as implemented in `packages/happy-server`. The protocol is intentionally small: JSON over HTTP for reads/actions and Socket.IO for real-time sync. Most payloads are end-to-end encrypted client-side; see `encryption.md` for the encryption boundaries and encoding details. For the full HTTP surface and auth flows, see `api.md`.

## Transport and versioning
- HTTP API: JSON requests/responses on `/v1` and `/v2` routes.
- WebSocket: Socket.IO server at path `/v1/updates` (transports: websocket, polling).
- CORS: `*` (server-side).

## Protocol design motivations
The protocol is designed to stay minimal, explicit, and resilient under intermittent connectivity. A few guiding principles shape naming, payloads, and versioning:

- **Small surface area over completeness.** Routes and events exist only when they provide a clear sync primitive. If a capability can be expressed as data within an existing primitive, it should be.
- **Explicit event types and short keys.** Update payloads use `t` for the event type and concise field names (`sid`, `id`, `seq`) to keep message size down without hiding meaning. These names are stable because they are used across clients.
- **Separation of persistent vs. ephemeral.** Anything that must be recoverable after reconnect is an `update` event with a sequence number. Presence is `ephemeral` to avoid state confusion and minimize storage.
- **Monotonic ordering at the user level.** `UpdatePayload.seq` is a single per-user counter. This makes client reconciliation simple: apply updates in order and you are consistent for that user.
- **Optimistic concurrency by default.** Versioned fields such as session metadata, agent state, and machine state require `expectedVersion`. This prevents silent overwrites and keeps conflict resolution client-driven.
- **Client-side encryption boundaries.** Message bodies, metadata, and state fields remain encrypted client-side. RPC params and responses are plaintext JSON over TLS plus Dev Tunnels gateway auth.
- **Backward compatibility where it serves live clients.** Sprint E intentionally removed obsolete route/event families whose callers had already moved to the Dev Tunnels architecture.
- **Avoid full REST verbs.** Reads are primarily `GET`, while writes/actions are primarily `POST`, with `DELETE` used when the intent is unambiguous. We avoid the full REST palette because many mutations are not cleanly tied to a single entity or involve more than CRUD logic. Keeping to `GET` + `POST` (plus occasional `DELETE`) makes the client simpler and the protocol clearer.

If a new protocol field or event is proposed, it should answer: does this create a durable sync primitive, or can it be encoded inside existing encrypted payloads without expanding the API surface?

## Authentication
The embedded `happy-server` runs per machine and is reached over a Microsoft Dev Tunnel. Private-tunnel gateway access is authenticated with `X-Tunnel-Authorization: tunnel <connect-jwt>` (Microsoft's standard `WWW-Authenticate: tunnel` scheme; consumed + stripped by the gateway). After the gateway admits the request, happy-server treats the caller as the single local operator and uses `tofuConfig.localUserId` for request and socket identity. Loopback callers use `X-Loopback-Capability` instead. Payload encryption boundaries are described in `security-model.md`. For the HTTP endpoint catalog and pairing flows, see `api.md`.

## WebSocket connection
### Handshake
Connect with Socket.IO using:

```
path: "/v1/updates"
extraHeaders: {
  "X-Tunnel-Authorization": "tunnel <dev-tunnels-connect-token>"
}
auth: {
  clientType: "user-scoped" | "session-scoped" | "machine-scoped",
  sessionId?: "<session id>",
  machineId?: "<machine id>"
}
```

Loopback clients use the same Socket.IO scope fields but present `X-Loopback-Capability` to the loopback listener.

Rules enforced server-side:
- Tunnel listener access is gated by Microsoft Dev Tunnels before the request reaches happy-server.
- Loopback listener access requires a valid `X-Loopback-Capability` token.
- `session-scoped` requires `sessionId`.
- `machine-scoped` requires `machineId`.

### Connection types
- `user-scoped`: receives account-wide updates.
- `session-scoped`: receives updates for a specific session only.
- `machine-scoped`: used by daemons; receives machine updates and emits machine state.

### Server -> client events
The server emits two event types:

#### `update`
Persistent sync events. Payload shape:
```
{
  id: string,
  seq: number,
  body: { t: string, ... },
  createdAt: number
}
```

#### `ephemeral`
Transient presence events. Payload shape:
```
{
  type: string,
  ...
}
```

### Update event types
Field names below match on-wire payloads.

- `new-session`
  - `body`: `{ t: "new-session", id, seq, metadata, metadataVersion, agentState, agentStateVersion, dataEncryptionKey, active, activeAt, createdAt, updatedAt }`

- `update-session`
  - `body`: `{ t: "update-session", id, metadata?, agentState? }`
  - `metadata`: `{ value, version }` or null
  - `agentState`: `{ value, version }` or null

- `delete-session`
  - `body`: `{ t: "delete-session", sid }`

- `new-message`
  - `body`: `{ t: "new-message", sid, message: { id, seq, content, localId, createdAt, updatedAt } }`

- `update-account`
  - `body`: `{ t: "update-account", id, settings?, github? }`

- `new-machine`
  - `body`: `{ t: "new-machine", machineId, seq, metadata, metadataVersion, daemonState, daemonStateVersion, dataEncryptionKey, active, activeAt, createdAt, updatedAt }`

- `update-machine`
  - `body`: `{ t: "update-machine", machineId, metadata?, daemonState?, activeAt? }`

### Ephemeral event types
- `activity`: `{ type: "activity", id: sessionId, active, activeAt, thinking? }`
- `machine-activity`: `{ type: "machine-activity", id: machineId, active, activeAt }`
- `machine-status`: `{ type: "machine-status", machineId, online, timestamp }`

### Client -> server WebSocket events
- `ping` -> callback `{}`

- `update-metadata`
  - `{ sid, metadata, expectedVersion }`
  - Response: `{ result: "success", version, metadata }` or `{ result: "version-mismatch", version, metadata }`

- `update-state`
  - `{ sid, agentState, expectedVersion }`
  - Response: `{ result: "success", version, agentState }` or `{ result: "version-mismatch", version, agentState }`

- `message`
  - `{ sid, message, localId? }`
  - Creates a new session message (encrypted payload) and emits `new-message` update to other connections.

  Session lifecycle boundaries are encoded inside encrypted session messages as the shared `context-boundary` event from `@slopus/happy-wire`. Current CLI producers dual-emit: first a modern `role: "session"` envelope whose `content.ev.t` is `"context-boundary"`, then a legacy compatibility event with `meta.contextBoundaryFallback: true`. New clients consume the typed boundary and suppress the flagged legacy fallback by that meta flag alone. Producers also write encrypted session metadata `latestBoundary` so clients that cold-start outside the initial message window can still place the active-context divider.

- `session-alive`
  - `{ sid, time, thinking? }`
  - Emits `ephemeral` activity to user-scoped connections.

- `session-end`
  - `{ sid, time }`
  - Marks session inactive and emits `ephemeral` activity.

- `machine-alive`
  - `{ machineId, time }`
  - Emits `ephemeral` machine-activity.

- `machine-update-metadata`
  - `{ machineId, metadata, expectedVersion }`
  - Response: `{ result: "success", version, metadata }` or `{ result: "version-mismatch", version, metadata }`

- `machine-update-state`
  - `{ machineId, daemonState, expectedVersion }`
  - Response: `{ result: "success", version, daemonState }` or `{ result: "version-mismatch", version, daemonState }`

- `rpc-register`
  - `{ method }` -> server emits `rpc-registered`

- `rpc-unregister`
  - `{ method }` -> server emits `rpc-unregistered`

- `rpc-call`
  - `{ method, params }` -> callback `{ ok, result? | error? }`
  - Server forwards to the registered socket via `rpc-request` (ack-based).

## HTTP endpoints by area
See `api.md` for the full HTTP endpoint catalog and auth flows.

## Sequencing and concurrency
- `UpdatePayload.seq` is the per-user update sequence (monotonic) used for sync ordering.
- Sessions and machines have their own `seq` fields used by clients for ordering.
- Versioned fields (metadata, agentState, daemonState) use optimistic concurrency with `expectedVersion` and return a version-mismatch response containing the current version/data.

## Implementation references
- API routes: `packages/happy-server/sources/app/api/routes`
- Socket handlers: `packages/happy-server/sources/app/api/socket`
- Event routing: `packages/happy-server/sources/app/events/eventRouter.ts`
