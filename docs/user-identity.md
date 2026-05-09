# User Identity

Happy is now single-tenant per operator machine. The local daemon owns the embedded server, local data directory, Dev Tunnel, push registration, and pairing state for that machine. There is no central Happy account service in the normal path.

## Primary Identity

The operator proves identity through GitHub device flow during mobile pairing:

1. Mobile calls the machine tunnel's `/pair/start` endpoint.
2. The embedded server starts GitHub device flow and returns the user code.
3. Mobile polls `/pair/status` against the same machine tunnel.
4. After GitHub authorizes the flow, the server fetches the GitHub login.
5. If `HAPPY_TUNNEL_GITHUB_OWNER` is set, the login must match it.
6. The server returns the local machine entry, tunnel URL, tunnel JWT, and TOFU public keys.

GitHub identity is used to prove that the person pairing the phone controls the expected GitHub login. It is not converted into a Happy-hosted user record.

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

After pairing, mobile stores machine credentials in SecureStore:

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

`pinnedPubkey` is the trusted Ed25519 machine public key. `sessionKey` is derived from X25519 ECDH and is scoped to that machine.

## Operational Implications

- Losing a machine means losing that machine's local server state unless `~/.happy/` is backed up.
- Rotating `server-key.*` intentionally changes the trusted machine identity and requires mobile re-confirmation.
- Rotating `ecdh-key.*` intentionally changes the ECDH identity and requires mobile session-key refresh.
- Deleting `tunnel.json` forces tunnel recreation; existing mobile credentials should be refreshed through pairing.
