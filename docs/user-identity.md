# User Identity

Happy is now single-tenant per operator machine. The local daemon owns the embedded server, local data directory, Dev Tunnel, push registration, and pairing state for that machine. There is no central Happy account service in the normal path.

## Primary Identity

The operator proves identity in two phases (revised 2026-05-13):

1. **One-time daemon onboarding**: on the daemon machine, the operator runs `happy auth login --force` which does a GitHub device flow against `Iv1.e7b89e013f801f03` (the public devtunnel OAuth app). The flow writes `~/.happy/profile.json` with the operator's GitHub identity (login, numeric id, name, avatar).
2. **Mobile pair**: the mobile app calls `POST /pair/complete` on the daemon's Dev Tunnel. The Dev Tunnels gateway's `X-Tunnel-Authorization: tunnel <connect-jwt>` check is the only identity gate — anyone who can reach the daemon's Dev Tunnel and present a valid connect token is treated as the operator. The daemon reads identity from `profile.json` and returns the tunnel claim.

The previous per-machine GitHub device flow (Sprint A `/pair/start` + `/pair/status` + `HAPPY_TUNNEL_GITHUB_OWNER` enforcement) was deleted during BOOX validation because tunnel ownership already proves operator identity in the single-operator personal-fork posture. A public multi-tenant deployment would need to reintroduce a per-tunnel ownership check.

## Local Machine Identity

The daemon's machine id is the local tenant boundary. Server routes decorate requests with the local machine identity, and server-owned state such as push tokens is scoped to that machine.

```
GitHub device-flow login
  -> pairing authorization
  -> local machine id
  -> tunnel JWT for this machine
  -> mobile SecureStore machine credentials
```

The mobile app can pair with multiple operator machines. It stores each machine separately and renders app-local composite session ids in the form `${machineId}:${localSessionId}` so sessions from different machines do not collide.

## External Services

| Service | Identity Used | Notes |
| --- | --- | --- |
| Microsoft Dev Tunnels | GitHub login through `devtunnel user login -g` | Creates and hosts the named tunnel for the local machine. |
| GitHub device flow | GitHub login | Authorizes mobile pairing to the machine tunnel. |
| Expo push | `{ machineId, deviceId }` | Mobile registers the Expo token once per paired machine. |
| RevenueCat | Mobile app user id | Preserved for subscription checks; it is not the machine pairing authority. |
| ElevenLabs | HMAC-derived voice id | Voice routes continue to avoid exposing raw local ids to ElevenLabs. |
| AI vendors | Local CLI config | Vendor API keys are stored and used on the operator machine. |

## Mobile Credential Shape

After pairing, mobile stores per-machine credentials in SecureStore:

```ts
{
  machineId: string;
  tunnelUrl: string;
  tunnelClaim: string;
  tunnelId: string;
  deviceCode: string;
  deviceCodeExpiresAt: number;
  login: string;
  avatarUrl: string;
  firstSeenAt: number;
}
```

`tunnelClaim` is a plaintext envelope produced by the machine and signed by Sprint A's Ed25519 server key. Its payload binds the GitHub user id into `accountId`, so identity is established end-to-end via GitHub device flow → tunnel-claim envelope rather than any client-side key derivation. The mobile app no longer derives an X25519 session key; tunnel HTTP and Socket.IO calls authenticate by presenting the current `tunnelClaim` directly.

## Operational Implications

- Losing a machine means losing that machine's local server state unless `~/.happy/` is backed up.
- Rotating `server-key.*` intentionally changes the trusted machine identity and requires mobile re-confirmation.
- Rotating `ecdh-key.*` intentionally changes the ECDH identity and requires mobile session-key refresh.
- Deleting `tunnel.json` forces tunnel recreation; existing mobile credentials should be refreshed through pairing.
