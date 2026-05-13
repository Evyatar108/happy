# Security Model

Audience: developers working on Happy's daemon, server, agent, and app transport layers.

This document records the current Dev Tunnels security contract. Sprints A through E have landed the signed Happy claim envelope, removed the transitional JWT fallback, deleted the X25519 RPC payload encryption layer, and resolved R-D18 with path (b): private Dev Tunnels plus an explicit `X-Tunnel-Connect` gateway-auth header.

## Trust Model

The Dev Tunnels design uses two layers:

- Transport: Microsoft Dev Tunnels TLS protects bytes in flight between clients and the user's daemon listener. Private tunnel access is authenticated to the gateway with `X-Tunnel-Connect`.
- Identity: Happy's signed tunnel claim identifies the Happy account and machine authorization context for the request.

The tunnel claim is the Happy authorization artifact. It is issued by `/pair/status`, signed by the daemon's embedded server, and verified by tunnel-facing routes and Socket.IO handshakes. The accepted payload shape is `{ sub, iat, exp, jti, accountId? }` with a one-hour maximum lifetime and an in-memory replay cache keyed by `jti`.

Trusted parties:

- GitHub as the account identity provider used during pairing.
- Microsoft Dev Tunnels as the TLS tunnel transport provider.
- The user's local daemon machine and its embedded Happy server.

Untrusted parties:

- The public network between clients and the Dev Tunnels edge.
- Other clients without a valid Happy tunnel claim or loopback capability.

## Claim Envelope Contract

Happy claims are base64url-encoded envelopes:

```json
{
  "p": "base64url({ sub, iat, exp, jti, accountId? })",
  "s": "hex(ed25519-signature)"
}
```

`verifyTunnelClaim()` verifies the Ed25519 signature, requires `sub` to match the embedded server's local user id, enforces `exp`, and rejects replayed `jti` values from the process-local cache. Dev Tunnels JWTs are not accepted as Happy authorization and no fallback parser remains.

## Gateway Auth: R-D18 Path (b)

Sprint E implements R-D18 path (b): all private-tunnel HTTP and Socket.IO callers carry a Dev Tunnels connect token separately from the Happy claim.

- `X-Tunnel-Connect` is consumed by the Dev Tunnels gateway.
- `X-Tunnel-Authorization` is consumed by happy-server.
- happy-app obtains connect tokens from `DevTunnelsClientProvider.getConnectToken(tunnelId)` through its local provider implementation.
- happy-agent obtains connect tokens from the same provider contract and persists refreshed token fields in its machine credentials.

The server does not authorize `X-Tunnel-Connect`; it only includes the header in HTTP and Socket.IO CORS allow-lists so web clients can reach private tunnels.

## Production Owner Gate

`HAPPY_TUNNEL_GITHUB_OWNER` is mandatory when `NODE_ENV=production`. If it is unset, `/pair/status` returns `503 { error: "happy_tunnel_github_owner_unset" }`. If it is set and the paired GitHub login differs, `/pair/status` returns `403`. This gate binds a self-hosted production server to the operator-owned GitHub identity that owns the private tunnel.

## Web TokenStorage Threat Model

Native happy-app stores credentials in `expo-secure-store`. On web, `sources/auth/tokenStorage.ts` stores `devTunnelsAccess` and per-machine tunnel credentials in `localStorage`. That is an accepted trade-off for the single-user self-host posture: the operator controls the browser environment, the app does not mix untrusted third-party scripts into its origin, and XSS is out of scope. If the fork ever ships a public multi-user web build, this must be revisited with session-only tokens or a backend-for-frontend that holds tokens server-side.

## Encryption Posture

Happy now relies on TLS plus Dev Tunnels gateway auth plus the signed Happy claim. The removed X25519 RPC-layer encryption is not part of the current transport contract. Message bodies, metadata, and state fields can still be encrypted at the application layer where existing session sync requires it, but RPC params and responses are plaintext JSON over the authenticated tunnel.

## RPC Payload Contract: Option A

Option A is plaintext-over-TLS plus Happy claim authorization for RPC payloads. After the B+C+D cutover, `rpc-call` params and `rpc-request` responses are ordinary JSON payloads carried over the Dev Tunnels TLS transport. The server continues to route RPC messages by Socket.IO room and does not become the account identity source.

As of Sprint D, the X25519 per-message RPC layer is REMOVED end-to-end. The happy-cli handler side (Sprint B) reads `request.params` directly and returns plaintext JSON via `packages/happy-cli/src/api/rpc/RpcHandlerManager.ts`. The happy-agent caller side (Sprint C) emits plaintext `rpc-call` params and consumes plaintext results via `packages/happy-agent/src/machineRpc.ts`. The happy-app caller side (Sprint D) emits plaintext params and consumes plaintext results via `packages/happy-app/sources/sync/apiSocket.ts`, and the X25519 session-key derivation path that previously lived in `pairing.ts` and `tunnelTransport.ts` has been deleted along with the entire `packages/happy-app/sources/encryption/` directory and the `packages/happy-app/sources/sync/encryption/` subtree.

Pre-cutover (Sprint A only, now historical), callers sent encrypted base64 strings:

```json
{
  "event": "rpc-call",
  "payload": {
    "method": "machine-123:spawn-happy-session",
    "params": "base64url(secretbox-or-aes-gcm-bytes)"
  }
}
```

Pre-cutover (Sprint A only, now historical), handlers returned encrypted base64 strings:

```json
{
  "ok": true,
  "result": "base64url(secretbox-or-aes-gcm-bytes)"
}
```

After cutover, callers send plaintext JSON params over TLS:

```json
{
  "event": "rpc-call",
  "payload": {
    "method": "machine-123:spawn-happy-session",
    "params": {
      "type": "spawn-in-directory",
      "directory": "C:/work/project",
      "approvedNewDirectoryCreation": false
    }
  }
}
```

After cutover, handlers return plaintext JSON results over TLS:

```json
{
  "ok": true,
  "result": {
    "type": "success",
    "sessionId": "session-123"
  }
}
```

The server-side RPC router remains an opaque forwarder. `packages/happy-server/sources/app/api/socket/rpcHandler.ts` reads `method` and forwards `params` as provided; it does not decrypt, inspect, or validate RPC method payload schemas.

## Dual-Listener RPC Plane Non-Crossing

Sprint A's dual-listener design creates one Socket.IO server per listener. The tunnel listener and loopback listener must not share RPC rooms or handler registries.

Constraints:

- Each listener owns its own `io` Server instance.
- Each listener owns its own Socket.IO rooms, including `rpc:<userId>:<method>` rooms.
- Each listener owns its own RPC handler registration lifecycle.
- The shared event bus may fan out non-RPC realtime events between listener sinks.
- The shared event bus must not bridge `rpc-call`, `rpc-request`, `rpc-register`, or `rpc-unregister` between listeners.

This keeps tunnel-authenticated RPC traffic and loopback-capability RPC traffic from crossing authentication planes.

## Coordinated B+C+D Cutover Tasks

The following code changes landed together in the coordinated B+C+D cutover.

Landed:

- Sprint B deleted handler-side RPC param decryption and response encryption in `packages/happy-cli/src/api/rpc/RpcHandlerManager.ts`. The handler now consumes plaintext `request.params` and returns plaintext result objects.
- Sprint C deleted caller-side RPC param encryption and result decryption in `packages/happy-agent/src/machineRpc.ts`. happy-agent now emits plaintext `rpc-call` params and consumes plaintext result objects.
- Sprint D deleted app-side RPC param encryption and result decryption in `packages/happy-app/sources/sync/apiSocket.ts`. The Socket.IO RPC paths (`sessionRPC`, `machineRPC`) now emit plaintext params and consume plaintext results directly.
- Sprint D deleted pair-time X25519 session key derivation from stored app credentials and from `packages/happy-app/sources/auth/pairing.ts`. `AuthCredentials` no longer carries a session key, and pairing only persists the tunnel claim envelope and device-code metadata.
- Sprint D deleted the app-side X25519 helper usage for tunnel transport credentials. `packages/happy-app/sources/sync/tunnelTransport.ts` was removed entirely; its successor `packages/happy-app/sources/sync/socketOptions.ts` builds Socket.IO options from a fresh tunnel claim (refreshed via `packages/happy-app/sources/sync/refreshClaim.ts` and surfaced through `packages/happy-app/sources/auth/machineAuth.ts:getMachineAuthHeaders`) and emits no encryption-derived material.
- Sprint D deleted the entire `packages/happy-app/sources/encryption/` directory (aes, base64, deriveKey, hex, hmac_sha512, libsodium, text) and the `packages/happy-app/sources/sync/encryption/` subtree (artifactEncryption, encryption, encryptionCache, encryptor, machineEncryption, sessionEncryption) as part of US-D4. The cutover also updated tests that previously asserted encrypted base64 RPC params or results, replacing those assertions with plaintext JSON payload expectations.

## Sprint A Non-Changes (historical)

Sprint A intentionally left these areas unchanged at the time of its own landing. Sprints B, C, and D have since changed most of them; this section is retained for historical context.

- At the end of Sprint A: `packages/happy-agent/src/machineRpc.ts` continued encrypting params and decrypting results — superseded by Sprint C, which deleted both code paths.
- At the end of Sprint A: `packages/happy-app/sources/sync/apiSocket.ts`, `packages/happy-app/sources/auth/pairing.ts`, and `packages/happy-app/sources/sync/tunnelTransport.ts` continued using the existing X25519-derived session-key path — superseded by Sprint D, which deleted that path. `tunnelTransport.ts` was removed and replaced by `socketOptions.ts`; `pairing.ts` no longer derives or stores a session key; `apiSocket.ts` no longer touches encryption helpers.
- The happy-wire RPC payload shape is no longer opaque after the B+C+D cutover; shared wire schemas now describe plaintext params and results. (Sprint A originally documented this as opaque, with `params: string` for encrypted payloads.)
- `packages/happy-server/sources/app/api/socket/rpcHandler.ts` continues forwarding RPC payloads without inspecting them. The only Happy-specific cryptography retained on the server side is ed25519 signature verification of the tunnel-claim envelope in `packages/happy-server/sources/app/api/auth/tunnelClaim.ts` (`verifyHappyEnvelope` / `verifyTunnelClaim`). The server does not derive X25519 session keys, and the app no longer derives them either.
