# API

This document covers the HTTP API surface and authentication flows. For WebSocket updates and event payloads, see `protocol.md`. For encryption boundaries and encoding details, see `encryption.md`.

## Method conventions
- **GET** is used for reads.
- **POST** is used for mutations or actions, even when the operation doesn't map cleanly to a single entity.
- **DELETE** is used when intent is unambiguous (e.g., removing a token or deleting a session/artifact).

We intentionally avoid the full REST verb palette because many operations span multiple entities or have non-CRUD semantics.

## Authentication
Most endpoints require `X-Tunnel-Authorization: tunnel <claim>`, where `<claim>` is a base64url-encoded JSON object minted by the embedded happy-server during pairing.

The claim is an unsigned identity envelope (intentionally not a signed JWT) with the shape `{ sub, gh, iat }`:
- `sub` — local machine/user id; must match the embedded server's `localUserId`.
- `gh` — GitHub login captured at pairing time.
- `iat` — issued-at, in seconds since epoch. Claims older than 24 hours are rejected.

The authenticate hook (`packages/happy-server/sources/app/api/api.ts`) parses the header, validates `sub` against the local server identity, and rejects expired or malformed envelopes with `401`.

Pairing flow (mobile <-> embedded server, replaces the deprecated cloud Bearer flow):

- `GET /pair/start`
  - Initiates GitHub device flow against the embedded server's GitHub OAuth client.
  - Response: `{ device_code, user_code, verification_uri, verification_uri_complete?, expires_in, interval }`.

- `POST /pair/status`
  - Body: `{ device_code, mobileEcdhPublicKey? }`.
  - Polls GitHub for OAuth completion. Optionally accepts the mobile's X25519 public key to derive the ECDH shared session key (TOFU pinning).
  - Response while pending: `{ status: "pending" }`.
  - Response when authorized: `{ status: "authorized", githubLogin, machines: [{ machineId, tunnelUrl, ed25519PublicKey, x25519PublicKey, ed25519Fingerprint, tunnelClaim }] }`. The `tunnelClaim` is what mobile sends back in the `X-Tunnel-Authorization` header on subsequent requests.
  - When `HAPPY_TUNNEL_GITHUB_OWNER` is set, GitHub identities not matching the operator login are rejected with `403`.

## Endpoint catalog
### Sessions
- `GET /v1/sessions`
- `GET /v2/sessions/active?limit=...`
- `GET /v2/sessions?cursor=cursor_v1_<id>&limit=...&changedSince=...`
- `POST /v1/sessions` (create or load by `tag`)
- `GET /v1/sessions/:sessionId/messages`
- `POST /v1/sessions/:sessionId/archive`
- `DELETE /v1/sessions/:sessionId`
- `GET /v3/sessions/:sessionId/messages?after_seq=...&limit=...`
- `POST /v3/sessions/:sessionId/messages`

### Machines
- `POST /v1/machines` (create or load by id)
- `GET /v1/machines`
- `GET /v1/machines/:id`

### Artifacts
- `GET /v1/artifacts`
- `GET /v1/artifacts/:id`
- `POST /v1/artifacts`
- `POST /v1/artifacts/:id` (versioned update)
- `DELETE /v1/artifacts/:id`

### Access keys
- `GET /v1/access-keys/:sessionId/:machineId`
- `POST /v1/access-keys/:sessionId/:machineId`
- `PUT /v1/access-keys/:sessionId/:machineId`

### Key-value store
- `GET /v1/kv/:key`
- `GET /v1/kv?prefix=...&limit=...`
- `POST /v1/kv/bulk`
- `POST /v1/kv` (batch mutate)

### Push tokens
Push tokens are stored per-machine (keyed by the embedded server's `localUserId`/`machineId`) and per-device. There is no account scoping in the per-machine architecture; each embedded server owns its own token set and dispatches Expo notifications directly.

- `POST /push/register` — body `{ expoPushToken, deviceId }`
- `POST /v1/push-tokens` — body `{ token, deviceId? }` (compatibility alias)
- `DELETE /v1/push-tokens/:token`
- `GET /v1/push-tokens`

### Users, friends, feed
- `GET /v1/user/:id`
- `GET /v1/user/search?query=...`
- `POST /v1/friends/add`
- `POST /v1/friends/remove`
- `GET /v1/friends`
- `GET /v1/feed`

### Version and voice
- `POST /v1/version`
- `POST /v1/voice/token`

### Dev-only
- `POST /logs-combined-from-cli-and-mobile-for-simple-ai-debugging` (only if enabled)

## Implementation references
- API routes: `packages/happy-server/sources/app/api/routes`
- Authenticate hook and tunnel claim verification: `packages/happy-server/sources/app/api/api.ts`
- Pairing route: `packages/happy-server/sources/app/api/routes/pairRoutes.ts`
