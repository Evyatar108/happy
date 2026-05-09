# Encryption And Trust

Happy uses client-side encryption for session data and a server-per-machine trust model for pairing. The embedded server publishes machine public keys; the mobile app pins the Ed25519 key on first use and derives a per-machine session key with X25519 ECDH.

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

The server emits this as `tofu-pubkeys` after accepting a Socket.IO connection. The `/pair/status` response also returns the keys with the authorized machine entry so mobile can show a trust dialog before saving credentials.

On first connection to a machine, mobile shows the Ed25519 fingerprint. If the operator accepts it, the app stores the pinned Ed25519 public key for that `machineId`. Future connections compare the advertised Ed25519 public key to the pinned value and warn on rotation.

## Per-Machine Session Key

Mobile generates its own X25519 keypair with `tweetnacl.box.keyPair()`, reads the server X25519 public key from the pairing response, and derives a shared session key with `tweetnacl.box.before(remotePublicKey, localPrivateKey)`.

The stored mobile credential shape is:

```ts
{
  machineId: string;
  tunnelUrl: string;
  tunnelJwt: string;
  pinnedPubkey: string;
  sessionKey: string;
  firstSeenAt: number;
}
```

This replaces the old `secret` field from `tokenStorage`. Happy-relay bearer tokens are not part of the mobile credential model; tunnel requests use `X-Tunnel-Authorization: tunnel <JWT>` and encrypted session content uses the per-machine session key.

## Content Encryption Variants

Happy still supports encrypted content containers used by existing session and machine data.

### Legacy NaCl Secretbox

Used when a client has a 32-byte shared key.

- Algorithm: `tweetnacl.secretbox` (XSalsa20-Poly1305).
- Nonce length: 24 bytes.
- Binary layout: `[ nonce (24) | ciphertext+auth ]`.

### DataKey AES-GCM

Used for per-session or per-machine data keys.

- Algorithm: AES-256-GCM.
- Nonce length: 12 bytes.
- Auth tag: 16 bytes.
- Binary layout: `[ version (1) | nonce (12) | ciphertext | authTag (16) ]`.

When a data encryption key is wrapped, the wrapper uses `tweetnacl.box` with an ephemeral X25519 keypair:

```text
[ version (1 = 0) | ephPublicKey (32) | nonce (24) | ciphertext ]
```

The resulting bytes are base64-encoded for wire fields such as `dataEncryptionKey`.

## Where Encryption Is Applied

The embedded server treats encrypted fields as opaque strings or bytes. Clients encrypt before sending and decrypt after receiving.

- Session metadata and agent state.
- Session messages.
- Machine metadata and daemon state.
- Artifact headers and bodies.
- Access key payloads.
- Key-value store values.

Server-side routes persist and fan out the encrypted blobs without inspecting plaintext.
