# Encryption And Trust

Happy uses a server-per-machine trust model for pairing. The embedded server publishes machine public keys for CLI-internal use; mobile authenticates to a paired machine by presenting a plaintext `tunnelClaim` envelope issued during pairing.

For transport and event shapes, see `protocol.md` and `packages/happy-wire`.

## Machine Identity

On first daemon start, `happy-cli` creates two independent keypairs under `~/.happy/`:

- `server-key.pub` / `server-key.priv`: Ed25519 signing identity, generated with `@noble/ed25519`.
- `ecdh-key.pub` / `ecdh-key.priv`: X25519 ECDH identity, generated separately with `tweetnacl.box.keyPair()`.

The X25519 keypair is not derived from the Ed25519 keypair. Keeping them separate avoids relying on Ed25519-to-X25519 conversion and keeps signing identity distinct from key agreement.

The CLI prints the Ed25519 fingerprint once when the signing key is first created:

```text
Happy server Ed25519 fingerprint: SHA256:abc123...
```

## TOFU Pubkey Exchange

The Socket.IO handshake and pairing response publish the same machine public key material:

```json
{
  "ed25519PublicKey": "base64url-ed25519-public-key",
  "x25519PublicKey": "base64url-x25519-public-key",
  "ed25519Fingerprint": "SHA256:abc123..."
}
```

The server emits this as `tofu-pubkeys` after accepting a Socket.IO connection. The `/pair/status` response also returns the keys with the authorized machine entry so a trust dialog can be shown before saving credentials. The Ed25519/X25519 keypairs continue to underpin happy-cli's internal trust state; mobile authentication itself flows through the `tunnelClaim` envelope described below.

## Tunnel Claim Authentication

Sprint D removed X25519 ECDH session-key derivation entirely from happy-app. The mobile app no longer generates an X25519 keypair, no longer pins the server's Ed25519 public key, and no longer derives a per-machine session key. The `tunnelClaim` envelope returned by `/pair/status` is now the only authentication artifact the app holds for a paired machine.

`tunnelClaim` is a base64url-encoded JSON envelope of the form `{ p, s }`, where `p` is a base64url-encoded JSON payload signed by the machine's Ed25519 server key. The decoded payload is:

```ts
{
  sub: string;        // subject (machine-scoped identifier)
  iat: number;        // issued-at (seconds)
  exp: number;        // expiry (seconds)
  jti: string;        // replay-protection nonce
  accountId: number;  // GitHub-derived account binding
}
```

The embedded server rejects replayed `jti` values. Mobile presents the current `tunnelClaim` on every tunnel HTTP request and on the Socket.IO handshake; there is no separate session-key step.

The stored mobile credential shape, written by `packages/happy-app/sources/auth/tokenStorage.ts`, is:

```ts
{
  machineId: string;
  tunnelUrl: string;
  tunnelClaim: string;
  firstSeenAt: number;
  login?: string;
  avatarUrl?: string;
  deviceCode?: string;
  deviceCodeExpiresAt?: number;
  connectToken?: string;
  connectTokenExpiry?: number;
  tunnelId?: string;
}
```

Credentials are kept per machine inside a `{ primaryMachineId, machines[], devTunnelsAccess }` envelope so the app can pair with multiple operator machines concurrently. The Sprint A `pinnedPubkey`, `sessionKey`, and `githubToken` fields have been removed from `AuthCredentials`; legacy credentials carrying any of them are filtered out by the `isOldShape(...)` migration check on load so the app forces a re-pair instead of attempting to use them.

## Where Encryption Is Applied

The mobile app no longer performs content encryption. Happy-app does not import libsodium, tweetnacl, `@stablelib`, or any other crypto primitives for session content, and the `sources/encryption/` directory was removed in Sprint D (US-005). Wire bodies — session messages, session metadata, agent state, machine metadata, and daemon state — travel as plaintext over the authenticated tunnel; confidentiality is provided by the tunnel transport rather than by an app-side encryption layer.

The artifact, access-key, and key-value-store encryption surfaces no longer exist on the app side either: their callers (`apiArtifacts.ts`, `apiKv.ts`, `apiUsage.ts`, `apiServices.ts`, `apiFeed.ts`) were deleted in Sprint D (US-006).

Encryption infrastructure remains in `packages/happy-cli` (TweetNaCl-based) and on the server, where it continues to operate for CLI-internal flows that are out of scope for this document.
