# Happy Agent Development Notes

## Project Overview

Happy Agent (`@slopus/happy-agent`) is the typed client SDK consumed by `happy-cli` and `happy-app` for tunnel discovery, machine resolution, and remote-session orchestration against happy-server.

## Code Style

- Use strict TypeScript and explicit exported types for public surfaces.
- Keep imports at the top of the file.
- Prefer small data-shaping helpers over classes unless the package already exposes a class for that responsibility.
- Follow the existing Vitest patterns in colocated `*.test.ts` files.

## Public Surface Inventory

Sprint E uses the Path B machine migration: the server-side machine directory is gone, `ensureMachineCanResume` is not part of `src/index.ts`, and machine resolution is based on locally known Dev Tunnel credentials plus the machine self route.

The package-level inventory that docs and tests should keep valid is:

- `src/index.ts` - entry point for `resolveMachine`, `resolveRemotePath`, and the `machines` command.
- `src/output.ts` - `formatMachineTable` with the narrowed machine columns.
- `src/api.ts` - happy-server HTTP helpers, including Dev Tunnels connect-token refresh.
- `src/api.test.ts` - API helper coverage.
- `src/tunnel/clientProvider.ts` - `ClientTunnelProvider.getConnectToken(tunnelId)` and Dev Tunnels REST access.
- `src/tunnel/clientProvider.test.ts` - provider coverage, including connect-token failures.

## Narrowed CLI Surface

- `spawn` requires an explicit `--path`.
- `machines --active` was removed with the legacy machine-directory route.
- Resume no longer pre-checks `resumeSupport`; the remote RPC path is the authority.

## Dev Tunnels Connect Tokens

`ClientTunnelProvider.getConnectToken()` is active production plumbing, not scaffolding. happy-agent attaches **`X-Tunnel-Authorization: tunnel <connect-jwt>`** for Dev Tunnels gateway authentication (Microsoft's standard header: `WWW-Authenticate: tunnel`). The separate Happy signed tunnel envelope has been retired; do not add a second Happy-specific tunnel authorization header to agent HTTP or Socket.IO calls.

The earlier name pairing (`X-Tunnel-Connect` for gateway, `X-Tunnel-Authorization` for the Happy envelope) was never reachable end-to-end because the Dev Tunnels gateway rejects `X-Tunnel-Connect` and strips `X-Tunnel-Authorization` before forwarding. Corrected during BOOX validation 2026-05-13 — see `packages/happy-app/scripts/sprint-a-gap.md` "R-D18 path (b) implementation log".

Connect-token refresh is serialized per machine and persisted through the credentials helpers so legacy credential JSON still loads with the new optional fields absent.
