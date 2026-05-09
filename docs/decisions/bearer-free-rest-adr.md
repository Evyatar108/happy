# Bearer-Free REST Threat Model

Status: accepted for D-003 spike

## Context

D-003 removes the Happy cloud relay as the long-term authority for mobile-to-machine traffic. Each operator machine runs its own embedded `happy-server`, publishes a tunnel URL, and pairs mobile clients through GitHub identity plus TOFU pubkey pinning.

## Decision

Happy-relay bearer credentials are not carried forward for machine-local REST or Socket.IO traffic. The replacement trust boundaries are:

- GitHub device flow authenticates the human identity used to discover owned machines.
- The tunnel provider authorization protects the public tunnel endpoint.
- First contact pins the machine Ed25519 signing pubkey after showing a fingerprint to the mobile user.
- A separate long-term X25519 keypair derives per-machine session keys; Ed25519 keys are not converted into X25519 keys.
- REST endpoints that mutate machine-local state must be either loopback-only or covered by the TOFU/session-key protocol before bearer removal lands.

## Consequences

Existing Happy bearer tokens remain in place until the replacement pairing, TOFU, and per-machine session-key stories exist. Bearer removal must be scoped to Happy-relay credentials only; GitHub, Entra Dev Tunnels, RevenueCat, codex-local WebSocket auth, and ElevenLabs `xi-api-key` are outside this removal scope.
