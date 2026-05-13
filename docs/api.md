# API

This document covers the current HTTP and Socket.IO surface after the Dev Tunnels Sprint E cleanup. For event payloads, see `protocol.md`. For transport and threat-model details, see `security-model.md`.

## Method Conventions

- **GET** is used for reads.
- **POST** is used for mutations and actions.
- **PUT** is used for replacing machine-local settings.
- **DELETE** is used when removal intent is unambiguous.

The API stays deliberately small. Sprint E removed the legacy artifact, feed, voice, key-value, access-key, user, friends, usage, and machine-directory route modules from happy-server.

## Authentication

Tunnel-facing requests use the Dev Tunnels gateway as the remote identity gate:

- `X-Tunnel-Authorization: tunnel <connect-jwt>` authenticates the client to the Microsoft Dev Tunnels gateway for private tunnel access. The gateway consumes and strips this header before forwarding to the backend.
- After forwarding, happy-server treats tunnel requests as the single local operator and sets request identity from `tofuConfig.localUserId`.
- Loopback callers do not use the Dev Tunnels header; they must present `X-Loopback-Capability` on the loopback listener.

## Pairing Flow (revised 2026-05-13)

- `POST /pair/complete`
  - Single-step pair. Gateway `X-Tunnel-Authorization: tunnel <connect-jwt>` is the identity gate; the daemon reads its locally-onboarded identity from `~/.happy/profile.json` (written by `happy auth login --force`).
  - Body: `{ mobileEcdhPublicKey? }`.
  - Response: `{ githubLogin, machine: { machineId, tunnelUrl, ed25519PublicKey, x25519PublicKey, ed25519Fingerprint?, mobileSharedSecret? } }`.

- `POST /pair/connect`
  - Completes the machine connect step after the client has accepted the TOFU identity.

The old `/pair/start` (GET) + `/pair/status` (POST) two-step device flow, the per-machine `GITHUB_CLIENT_ID` env var, and the `HAPPY_TUNNEL_GITHUB_OWNER` enforcement check were all deleted during BOOX validation 2026-05-13 — they were redundant on a personal fork because tunnel ownership already proves operator identity. See `packages/happy-app/scripts/sprint-a-gap.md` "R-D18 path (b) implementation log".

## Endpoint Catalog

### Pairing

- `POST /pair/complete`
- `POST /pair/connect`

### Self (`/v2/me/*`)

Self routes are mounted on both tunnel and loopback listeners. They expose the paired GitHub identity, local account settings, and the running machine state to embedded clients.

- `GET /v2/me/profile` - returns the paired GitHub profile from local storage.
- `GET /v2/me/settings` - returns machine-local account settings.
- `PUT /v2/me/settings` - atomically writes machine-local account settings.
- `GET /v2/me/machine` - returns the injected machine state, or `503 { error: "machine_state_unavailable" }` when standalone mode has no machine-state provider.

When `options.auth === "tunnel"`, every self route resolves identity to the embedded server's configured local user id.

### Sessions And Messages

- `GET /v1/sessions`
- `GET /v2/sessions/active?limit=...`
- `GET /v2/sessions?cursor=cursor_v1_<id>&limit=...&changedSince=...`
- `POST /v1/sessions`
- `GET /v1/sessions/:sessionId/messages`
- `POST /v1/sessions/:sessionId/archive`
- `DELETE /v1/sessions/:sessionId`
- `GET /v3/sessions/:sessionId/messages?after_seq=...&limit=...`
- `POST /v3/sessions/:sessionId/messages`

### Socket.IO

- `/v1/updates` - Socket.IO mount for user, session, and machine scoped realtime updates.

Socket.IO handshakes over the tunnel rely on `X-Tunnel-Authorization: tunnel <connect-jwt>` for Dev Tunnels gateway access where the platform can set headers. The backend assigns the socket user id from `tofuConfig.localUserId`. Loopback Socket.IO handshakes continue to require `X-Loopback-Capability`.

### Push Tokens

Push tokens stay server-owned and per-machine.

- `POST /push/register` - body `{ expoPushToken, deviceId }`.
- `POST /v1/push-tokens` - body `{ token, deviceId? }`.
- `DELETE /v1/push-tokens/:token`.
- `GET /v1/push-tokens`.

### Dev-only

- `POST /logs-combined-from-cli-and-mobile-for-simple-ai-debugging` - registered only when debug logging is enabled.

## Removed Surfaces

Sprint E removed obsolete happy-server modules for artifacts, feed, voice, key-value storage, access keys, usage reports, users, friends, and the server-side machine directory. Their former routes must return 404. Machine state now comes from local daemon state plus `/v2/me/machine`, and remote machine actions use Socket.IO RPC.

## Implementation References

- API wiring: `packages/happy-server/sources/app/api/api.ts`
- Pairing route: `packages/happy-server/sources/app/api/routes/pairRoutes.ts`
- Self routes: `packages/happy-server/sources/app/api/routes/accountRoutes.ts` and `packages/happy-server/sources/app/api/routes/machineSelfRoutes.ts`
- Session routes: `packages/happy-server/sources/app/api/routes/sessionRoutes.ts` and `packages/happy-server/sources/app/api/routes/v3SessionRoutes.ts`
- Push routes: `packages/happy-server/sources/app/api/routes/pushRoutes.ts`
- Socket.IO wiring: `packages/happy-server/sources/app/api/socket.ts`
