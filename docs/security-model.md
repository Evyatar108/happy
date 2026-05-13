# Security Model

Audience: developers working on Happy's daemon, server, agent, and app transport layers.

This document records the current Dev Tunnels security contract. The Happy-specific tunnel claim layer has been removed. Remote callers are admitted by the Microsoft Dev Tunnels gateway using `X-Tunnel-Authorization: tunnel <connect-jwt>`; local callers are admitted by the loopback capability token. The removed X25519 RPC payload encryption layer remains out of the current transport contract.

## Trust Model

The Dev Tunnels design uses two independent gates:

- Transport: Microsoft Dev Tunnels TLS protects bytes in flight between clients and the user's daemon listener. Private tunnel access is authenticated to the gateway with `X-Tunnel-Authorization: tunnel <connect-jwt>` (Microsoft consumes and strips this header before forwarding to the backend).
- Local loopback: callers on the local listener authenticate with `X-Loopback-Capability`, read from the per-start capability file.

After either gate admits a request, happy-server is single-user and assigns identity from `tofuConfig.localUserId`. There is no separate Happy claim, replay cache, or per-request account id in the tunnel path.

Trusted parties:

- GitHub as the account identity provider used during pairing.
- Microsoft Dev Tunnels as the TLS tunnel transport provider.
- The user's local daemon machine and its embedded Happy server.

Untrusted parties:

- The public network between clients and the Dev Tunnels edge.
- Other clients without Dev Tunnels gateway access or a valid loopback capability.

## Retired Happy Claim Contract

The prior Ed25519-signed Happy tunnel envelope was deleted by the remove-tunnel-claim-layer plan. Pairing no longer returns a claim, clients no longer persist one, and happy-server no longer verifies one. The Dev Tunnels gateway is the sole remote identity gate.

## Gateway Auth: R-D18 Path (b)

Sprint E implements R-D18 path (b): all private-tunnel HTTP and Socket.IO callers carry a Dev Tunnels connect token.

- `X-Tunnel-Authorization: tunnel <connect-jwt>` is consumed by the Dev Tunnels gateway and stripped before forwarding to the backend.
- happy-app obtains connect tokens from `DevTunnelsClientProvider.getConnectToken(tunnelId)` through its local provider implementation.
- happy-agent obtains connect tokens from the same provider contract and persists refreshed token fields in its machine credentials.

happy-server never sees `X-Tunnel-Authorization` (gateway strips it). CORS allow-lists in `app/api/api.ts` and `app/api/socket.ts` include the gateway header for browser preflight.

## Operator Identity Gate

Identity is read at pair time from `~/.happy/profile.json` (written by `happy auth login --force` on the daemon machine via a one-time GitHub device flow against `Iv1.e7b89e013f801f03`, the public devtunnel OAuth app). The previous `HAPPY_TUNNEL_GITHUB_OWNER` enforcement gate was removed during BOOX validation 2026-05-13, and the later Happy claim layer was removed by the remove-tunnel-claim-layer plan. Tunnel ownership at the Dev Tunnels gateway is now the only remote identity gate. Anyone who has the daemon's local filesystem AND can reach its Dev Tunnel **is** the operator. This is appropriate for the single-operator personal-fork posture; a public multi-tenant deployment would need to reintroduce a per-tunnel ownership check.

The Prometheus metrics endpoint is unchanged by this work. In standalone mode it still binds according to its configured host, including `0.0.0.0` when requested, and it does not use Dev Tunnels or loopback capability authentication.

## Web TokenStorage Threat Model

Native happy-app stores credentials in `expo-secure-store`. On web, `sources/auth/tokenStorage.ts` stores `devTunnelsAccess` and per-machine tunnel credentials in `localStorage`. That is an accepted trade-off for the single-user self-host posture: the operator controls the browser environment, the app does not mix untrusted third-party scripts into its origin, and XSS is out of scope. If the fork ever ships a public multi-user web build, this must be revisited with session-only tokens or a backend-for-frontend that holds tokens server-side.

## Encryption Posture

Happy now relies on TLS plus Dev Tunnels gateway auth for remote callers and loopback capability auth for local callers. The removed X25519 RPC-layer encryption is not part of the current transport contract. Message bodies, metadata, and state fields can still be encrypted at the application layer where existing session sync requires it, but RPC params and responses are plaintext JSON over the authenticated tunnel.

## RPC Payload Contract: Option A

Option A is plaintext-over-TLS plus Dev Tunnels gateway authorization for RPC payloads. After the B+C+D cutover, `rpc-call` params and `rpc-request` responses are ordinary JSON payloads carried over the Dev Tunnels TLS transport. The server continues to route RPC messages by Socket.IO room and does not become the account identity source.

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
- Sprint D deleted app-side RPC param encryption and result decryption in `packages/happy-app/sources/sync/apiSocket.ts`. The Socket.IO RPC paths emit plaintext params and consume plaintext results directly. (Naming note: those paths were `apiSocket.sessionRPC(sid, ...)` / `apiSocket.machineRPC(mid, ...)` at the time of Sprint D; the 2026-05-13 consolidation moved them under `apiSocket.forSession(sid).rpc(...)` / `apiSocket.forMachine(mid).rpc(...)` scope builders — same wire shape, different call surface.)
- Sprint D deleted pair-time X25519 session key derivation from stored app credentials and from `packages/happy-app/sources/auth/pairing.ts`.
- Sprint D deleted the app-side X25519 helper usage for tunnel transport credentials. `packages/happy-app/sources/sync/tunnelTransport.ts` was removed entirely; its successor `packages/happy-app/sources/sync/socketOptions.ts` builds Socket.IO options from Dev Tunnels connect-token auth and emits no encryption-derived material.
- Sprint D deleted the entire `packages/happy-app/sources/encryption/` directory (aes, base64, deriveKey, hex, hmac_sha512, libsodium, text) and the `packages/happy-app/sources/sync/encryption/` subtree (artifactEncryption, encryption, encryptionCache, encryptor, machineEncryption, sessionEncryption) as part of US-D4. The cutover also updated tests that previously asserted encrypted base64 RPC params or results, replacing those assertions with plaintext JSON payload expectations.

## Sprint A Non-Changes (historical)

Sprint A intentionally left these areas unchanged at the time of its own landing. Sprints B, C, and D have since changed most of them; this section is retained for historical context.

- At the end of Sprint A: `packages/happy-agent/src/machineRpc.ts` continued encrypting params and decrypting results — superseded by Sprint C, which deleted both code paths.
- At the end of Sprint A: `packages/happy-app/sources/sync/apiSocket.ts`, `packages/happy-app/sources/auth/pairing.ts`, and `packages/happy-app/sources/sync/tunnelTransport.ts` continued using the existing X25519-derived session-key path — superseded by Sprint D, which deleted that path. `tunnelTransport.ts` was removed and replaced by `socketOptions.ts`; `pairing.ts` no longer derives or stores a session key; `apiSocket.ts` no longer touches encryption helpers.
- The happy-wire RPC payload shape is no longer opaque after the B+C+D cutover; shared wire schemas now describe plaintext params and results. (Sprint A originally documented this as opaque, with `params: string` for encrypted payloads.)
- `packages/happy-server/sources/app/api/socket/rpcHandler.ts` continues forwarding RPC payloads without inspecting them. Happy-specific tunnel-claim cryptography has been removed from the server side. The server does not derive X25519 session keys, and the app no longer derives them either.
