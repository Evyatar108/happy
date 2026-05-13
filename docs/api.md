# API

This document covers the current HTTP and Socket.IO surface after the Dev Tunnels Sprint E cleanup. For event payloads, see `protocol.md`. For transport and threat-model details, see `security-model.md`.

## Method Conventions

- **GET** is used for reads.
- **POST** is used for mutations and actions.
- **PUT** is used for replacing machine-local settings.
- **DELETE** is used when removal intent is unambiguous.

The API stays deliberately small. Sprint E removed the legacy artifact, feed, voice, key-value, access-key, user, friends, usage, and machine-directory route modules from happy-server.

## Authentication

Tunnel-facing requests authenticate with two distinct headers:

- `X-Tunnel-Connect: <connect token>` authenticates the client to the Microsoft Dev Tunnels gateway for private tunnel access.
- `X-Tunnel-Authorization: tunnel <claim>` authenticates the request to happy-server after it reaches the embedded server.

The Happy claim is a base64url-encoded Ed25519-signed envelope `{ p, s }`. The decoded payload is `{ sub, iat, exp, jti, accountId? }`:

- `sub` is the embedded server's local machine/user id.
- `iat` and `exp` bound the one-hour claim lifetime.
- `jti` is single-use within the server's in-memory replay cache.
- `accountId` is the optional GitHub numeric user id returned during pairing.

`verifyTunnelClaim()` accepts only this signed Happy envelope. Dev Tunnels JWT fallback is removed.

## Pairing Flow

- `GET /pair/start`
  - Starts GitHub device flow against the embedded server's GitHub OAuth client.
  - Response: `{ device_code, user_code, verification_uri, verification_uri_complete?, expires_in, interval }`.

- `POST /pair/status`
  - Body: `{ device_code }` plus pairing metadata.
  - Polls GitHub for OAuth completion, enforces `HAPPY_TUNNEL_GITHUB_OWNER` when configured, and returns machine credentials.
  - Response while pending: `{ status: "pending" }`.
  - Response when authorized: `{ status: "authorized", githubLogin, machines: [...] }` where each machine includes `machineId`, `tunnelUrl`, TOFU public keys, `tunnelClaim`, and the app-carried Dev Tunnels connect token fields.

- `POST /pair/connect`
  - Completes the machine connect step after the client has accepted the TOFU identity.

In `NODE_ENV=production`, `HAPPY_TUNNEL_GITHUB_OWNER` is mandatory for `/pair/status`. Missing configuration returns `503 { error: "happy_tunnel_github_owner_unset" }`; mismatched GitHub users return `403`.

## Endpoint Catalog

### Pairing

- `GET /pair/start`
- `POST /pair/status`
- `POST /pair/connect`

### Self (`/v2/me/*`)

Self routes are mounted on both tunnel and loopback listeners. They expose the paired GitHub identity, local account settings, and the running machine state to embedded clients.

- `GET /v2/me/profile` - returns the paired GitHub profile from local storage.
- `GET /v2/me/settings` - returns machine-local account settings.
- `PUT /v2/me/settings` - atomically writes machine-local account settings.
- `GET /v2/me/machine` - returns the injected machine state, or `503 { error: "machine_state_unavailable" }` when standalone mode has no machine-state provider.

When `options.auth === "tunnel"`, every self route requires a numeric `accountId` claim.

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

Socket.IO handshakes carry the same Happy claim as HTTP through either `extraHeaders.X-Tunnel-Authorization` or `auth.tunnelAuthorization`. Private Dev Tunnels access is carried separately with `X-Tunnel-Connect` where the platform can set headers.

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
- Claim verification: `packages/happy-server/sources/app/api/auth/tunnelClaim.ts`
