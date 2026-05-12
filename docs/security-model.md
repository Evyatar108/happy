# Security Model

Audience: developers working on Happy's daemon, server, agent, and app transport layers.

This document records the Sprint A target contract for the Dev Tunnels migration. Sprint A documented the contract and supporting guardrails only. Sprint B has now landed and deleted the handler-side RPC encryption in happy-cli; the coordinated C+D portion of the cutover still removes the remaining caller-side per-message RPC encryption code in happy-agent and happy-app.

## Trust Model

The Dev Tunnels design uses two layers:

- Transport: Microsoft Dev Tunnels TLS protects bytes in flight between clients and the user's daemon listener.
- Identity: Happy's tunnel-claim JWT identifies the Happy account and machine authorization context for the request.

The tunnel claim is the Happy authorization artifact. It is issued by `/pair/status`, signed by the daemon's embedded server, and verified by tunnel-facing routes and Socket.IO handshakes. Sprint A extends that claim with optional `accountId` while preserving compatibility with older claims.

Trusted parties:

- GitHub as the account identity provider used during pairing.
- Microsoft Dev Tunnels as the TLS tunnel transport provider.
- The user's local daemon machine and its embedded Happy server.

Untrusted parties:

- The public network between clients and the Dev Tunnels edge.
- Other clients without a valid Happy tunnel claim or loopback capability.

## RPC Payload Contract: Option A

Option A is plaintext-over-TLS plus Happy claim authorization for RPC payloads. After the B+C+D cutover, `rpc-call` params and `rpc-request` responses are ordinary JSON payloads carried over the Dev Tunnels TLS transport. The server continues to route RPC messages by Socket.IO room and does not become the account identity source.

As of Sprint B, the happy-cli handler side no longer decrypts incoming RPC params or encrypts outgoing results — `packages/happy-cli/src/api/rpc/RpcHandlerManager.ts` now reads `request.params` directly and returns plaintext JSON. The remaining callers in happy-agent and happy-app still use X25519-derived per-message encryption for RPC params and results; that caller-side encryption is retained until Sprint C and Sprint D land. In the target contract, the X25519 per-message RPC layer is REMOVED end-to-end.

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

The following code changes must land together in the coordinated B+C+D cutover.

Landed:

- Sprint B deleted handler-side RPC param decryption and response encryption in `packages/happy-cli/src/api/rpc/RpcHandlerManager.ts`. The handler now consumes plaintext `request.params` and returns plaintext result objects.

Pending:

- Sprint C deletes caller-side RPC param encryption and result decryption in `packages/happy-agent/src/machineRpc.ts:85-112,159-181`.
- Sprint D deletes app-side RPC param encryption and result decryption in `packages/happy-app/sources/sync/apiSocket.ts:149-181`.
- Sprint D deletes pair-time X25519 session key derivation from stored app credentials in `packages/happy-app/sources/auth/pairing.ts:184-193`.
- Sprint D deletes app-side X25519 helper usage for tunnel transport credentials in `packages/happy-app/sources/sync/tunnelTransport.ts:49-55`.

The cutover should also update tests that currently assert encrypted base64 RPC params or results, replacing those assertions with plaintext JSON payload expectations.

## Sprint A Non-Changes

Sprint A intentionally leaves these areas unchanged:

- `packages/happy-agent/src/machineRpc.ts` continues encrypting params and decrypting results.
- `packages/happy-app/sources/sync/apiSocket.ts`, `packages/happy-app/sources/auth/pairing.ts`, and `packages/happy-app/sources/sync/tunnelTransport.ts` continue using the existing X25519-derived session-key path.
- The happy-wire RPC payload shape remains opaque to shared wire schemas. Existing typed Socket.IO surfaces use `params: string` for encrypted RPC payloads; the Sprint A documentation story does not change package exports or schemas.
- `packages/happy-server/sources/app/api/socket/rpcHandler.ts` continues forwarding opaque RPC payloads.
