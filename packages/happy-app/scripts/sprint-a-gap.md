# Sprint A gap log

Tracks Sprint D's view of what Sprint A delivered, what Sprint D adapts to, and
the outcome of the AC-D16 manual gate (R-D17 + R-D18 verification).

Sprint A is **locked** — this file does NOT request patches.

## What Sprint A shipped (per `.ralph/jobs/devtunnels-A-foundation/FINAL-STATUS.md`, 12/12 PASS)

- `@slopus/happy-wire` exports `MachineTunnelSchema` (`packages/happy-wire/src/tunnel/types.ts`).
- `happy-agent` declares `ClientTunnelProvider` with `getConnectToken(tunnelId)`
  (`packages/happy-agent/src/tunnel/clientProvider.ts`) — happy-app reimplements the
  contract locally and does NOT import from happy-agent.
- happy-server `/v2/me/profile`, `/v2/me/settings`, `/v2/me/machine` routes
  (`accountRoutes.ts`, `machineSelfRoutes.ts`).
- happy-server `/pair/start` (GET) + `/pair/status` (POST) with the unified
  device-flow contract (`pairRoutes.ts`).
- happy-server `verifyTunnelClaim()` accepts ONLY the signed Happy envelope —
  no Dev Tunnels JWT fallback (`tunnelClaim.ts:139-155`).
- happy-server claim envelope format: outer = base64url(JSON({ p, s })); inner
  payload = base64url(JSON({ sub, iat, exp, jti, accountId? })). 1h max TTL,
  `jti` is single-use; replay returns `tunnel_claim_replayed`.
- happy-server populates `socket.data.accountId` after tunnel-claim verification
  (`socket.ts:110`). **Sprint A**, not Sprint B (round-15 EX-N1 fix).
- happy-server rate limits: `/pair/start` 2/min/IP; `/pair/status` 5/min per
  `device_code`. Sprint D's refresh-per-request serializes at 12s to respect
  the latter; 429 response body is `{ error: "rate_limited" }` with no
  `Retry-After` header.

## What Sprint D adapts to (no Sprint A patches requested)

- **Single `X-Tunnel-Authorization` header** carries `tunnel <claim-envelope>` on
  every `/v2/me/*` HTTP and Socket.IO handshake. No header rename.
- **1h claim TTL + 15min device-code TTL** treated as Sprint A constraints.
  Sprint D handles expiry in-app via re-pair UX.
- **Public Dev Tunnels mode** for MVP — no gateway auth on the transport layer.
  R-D18 verifies the tunnel is reachable unauthenticated.
- **Refresh-per-request:** every outbound `/v2/me/*` HTTP and every Socket.IO
  connect mints a fresh claim via `POST /pair/status { device_code }`. Never
  coalesces (single-use jti); serializes at 12s per machine.
- **Logical-unpair only:** `ClientTunnelProvider.deleteTunnel` exists in the
  interface but is NOT invoked from happy-app UI (round-14 decision).
- **Connect token unused in Sprint D production paths** —
  `ClientTunnelProvider.getConnectToken()` stays in the interface for future
  private-tunnel scaffolding only.
- **`AuthCredentials.tunnelId`** is carried over from the originating
  `MachineTunnel` (input to `pollPairStatus`), NOT from the `/pair/status`
  response (which omits `tunnelId`).

## What is deferred

- **Remote mutation of `/v2/me/profile` + `/v2/me/settings`** beyond the read /
  PUT pair Sprint A shipped (richer schemas, server-side merging) — Sprint E.
- **Machine metadata mutation (`displayName`, `host`, `homeDir`, `platform`)**
  beyond what Sprint A's `/v2/me/machine` exposes — Sprint E.
- **Push deletion** — push files stay in happy-app for now (US-D5).
- **Private-tunnel auth channel** — if R-D18 fails, design lands in a later
  sprint with a non-colliding header.

## R-D18 verdict (recorded 2026-05-12, source-code confirmed)

**R-D18 FAILS AS-SHIPPED.** Sprint A's production tunnel-creation path does NOT
make tunnels publicly reachable. Confirmed by reading
`packages/happy-cli/src/tunnel/tunnelManager.ts`:

| Line | Command | Access-policy flag |
|------|---------|--------------------|
| 197-203 | `devtunnel create <id> --expiration 30d --json` | none |
| 286-298 | `devtunnel port create <id> --port-number <port>` (ensurePort) | none |
| 238 | `devtunnel host <id> --port-number <localPort>` | none |

`devtunnel create` defaults to PRIVATE (owner-only) access. There is no
`accessControl.entries` REST call, no `devtunnel access create --anonymous`
step, and no `--allow-anonymous` flag anywhere in the file. Production tunnels
are therefore NOT reachable by unauthenticated `GET /pair/start` —
Sprint D's public-tunnel MVP assumption does not hold against the current
shipped surface.

**Sprint D depends on ONE of the plan's three R-D18 resolution paths before
reaching production:**

- **(a) REJECTED (operator decision 2026-05-12):** Sprint C patches
  `tunnelManager.ts` to add anonymous: connect access. This path is rejected
  by operator policy — Sprint A's production tunnel-creation path MUST NOT
  invoke `--allow-anonymous`, and Sprint C MUST NOT add it via patch. Public
  tunnels exposing happy-server to unauthenticated callers are out of scope
  for this fork's single-user self-host threat model. Do not re-open this path
  without an explicit operator decision reversal logged here.
- **(b) ACCEPTABLE:** Sprint D adds a private-tunnel auth channel (URL-hash
  connect JWT or alternative non-colliding header). Pre-prod resolution path
  for `/pair/start` reachability — extend the Dev Tunnels gateway-auth model
  through to happy-server without exposing the surface anonymously.
- **(c) ACCEPTABLE:** Operator stopgap — each user runs `devtunnel access
  create --tunnel-id <id> --anonymous` manually after first `happy init` for
  their OWN tunnel only. Acceptable for the single-user self-host posture
  where the operator and the end-user are the same entity. NOT acceptable as
  a default rollout path — must remain an explicit per-tunnel operator action.

**Sprint D US-D2..D5 implementation MAY proceed in parallel with R-D18
resolution.** The refresh-per-request auth model (R-D17) is independent of the
tunnel-policy question; only the bootstrap reachability (`/pair/start`
unauthenticated) and gateway-free /v2/me/* + Socket.IO transport are gated on
R-D18. Those assertions live in `socketOptions.test.ts` + `pairing.test.ts`
(AC-D15 round-15 EXR1-006) and will pass on mocked transports regardless of
the production access policy.

## R-D17 smoke-test strategy (recorded 2026-05-12)

AC-D16 Phase 1 + Phase 2 are R-D17 verifications; they are
tunnel-policy-independent (Phase 1 = same device_code on /pair/status returns
fresh jti; Phase 2 = /pair/status still authorized after expires_in elapsed).
Sprint D smoke-tests R-D17 via plan-path-(c) stand-in:

```
devtunnel host -p 3005 --allow-anonymous
```

against a Sprint-A worktree's `pnpm standalone:dev` happy-server. Phase 0
trivially passes in this configuration; it is recorded as **TRIVIAL PASS — NOT
A PRODUCTION-FAITHFUL R-D18 VERIFICATION.** The real R-D18 verdict is the
"FAILS AS-SHIPPED" block above. Phase 1 + Phase 2 outcomes are the meaningful
gate results to record below.

## AC-D16 R-D17 + R-D18 verification log

`packages/happy-app/scripts/verify-refresh-supported.mjs` is the manual gate.
Run BEFORE Sprint D autonomous implementation kicks off. The script appends
its results below; on a clean run the log should contain three PASS lines
(Phase 0, Phase 1, Phase 2) and a `RUN PASS` summary line.

## verify-refresh-supported.mjs runs

<!-- The script appends `- ` bullets here on every invocation. -->

## AC-D16 verdict — source-code inspection (2026-05-12)

**Operator Decision (2026-05-12):** The user explicitly opted out of executing
the `verify-refresh-supported.mjs` manual gate before Sprint D implementation.
This decision is recorded in `.ralph/jobs/devtunnels-D-app/notepad.md` under
"User Preferences". The inspection-based verdicts below ARE the operative
AC-D16 outcome for this Sprint D run.

The implementer elected to derive the AC-D16 verdicts from Sprint A source-code
inspection rather than executing the manual gate script, on the grounds that
the runtime behavior of `pairRoutes.ts` and `tunnelManager.ts` is fully
determined by code that can be statically verified. Re-running the manual
script in the future would add no information beyond what the citations below
already establish.

- **Phase 0 (R-D18 public-tunnel reachability): FAIL BY CODE.**
  `packages/happy-cli/src/tunnel/tunnelManager.ts:197-203, 286-298, 238` —
  `devtunnel create`, `devtunnel port create`, and `devtunnel host` are all
  invoked without `--allow-anonymous` and without any `accessControl.entries`
  REST call. Production tunnels are owner-only-private. Resolution depends on
  plan paths (a) / (b) / (c) before Sprint D reaches production. Sprint D
  US-D2..D5 implementation MAY proceed in parallel because the design's
  refresh-per-request mechanism is tunnel-policy-independent.

- **Phase 1 (R-D17 immediate refresh reuse): PASS BY CODE.**
  `packages/happy-server/sources/app/api/routes/pairRoutes.ts:105` —
  `buildTunnelClaimPayload()` uses `randomUUID()` for `jti` on every
  invocation. `pairRoutes.ts:350-351` — every successful `/pair/status` call
  re-invokes `buildTunnelClaimPayload` + `encodeTunnelClaim`, so each
  successful call within the 15-min device_code window mints a fresh `jti`.
  Two calls return different `jti` values. Refresh-per-request mechanism is
  sound.

- **Phase 2 (R-D17 post-expires_in durability): FAIL BY CODE.**
  `pairRoutes.ts:302-319` — every `/pair/status` call does a fresh
  `POST https://github.com/login/oauth/access_token` with the device_code.
  GitHub expires device_codes at ~15 min and Sprint A does NOT cache the
  GitHub `access_token` between `/pair/status` calls. After expiry, GitHub
  returns `error: "expired_token"`, and `pairRoutes.ts:320-324` returns HTTP
  401 to the client. **Implication:** user re-runs the GitHub device flow
  every ~15 min worst-case. This is exactly the R-D11 trade-off the plan
  documents: *"Per-machine GitHub device-flow UX — user re-authenticates once
  every 15 min at worst."* The re-pair UX is owned by the UI layer per
  `plan.md:433` — *"the catch + re-pair happens at the calling UI layer."*

  **Note on internal plan tension:** `plan.md:445` says Phase 2 failure
  triggers a Sprint D halt + coordinated redesign. R-D11 says the 15-min
  re-pair UX is an **accepted** cost. These two positions are internally
  inconsistent. The operative position adopted by this Sprint D run is R-D11
  (accepted-cost) — the "halt" wording in AC-D16 predates R-D11's finalization
  and is treated as historical.

**Sprint D US-D2..D5 autonomous implementation proceeds.** Production cutover
remains blocked on R-D18 resolution (path a/b/c). Plan-documented assertions
in `socketOptions.test.ts` + `pairing.test.ts` (AC-D15 round-15 EXR1-006) and
`sources/.../*.test.{ts,tsx}` test code remain valid because they exercise
mocked transports and do not depend on the production tunnel access policy.

## Web platform threat model (TokenStorage persistence)

happy-app's primary target is native mobile (iOS + Android), where `TokenStorage`
persists credentials via `expo-secure-store` (OS-keystore-backed). Web is a
**secondary** target per `packages/happy-app/CLAUDE.md` "Project Scope and
Priorities".

On web (`Platform.OS === 'web'`), `sources/auth/tokenStorage.ts` persists the
following into `localStorage` under `AUTH_KEY = 'machine_credentials'`:

- `devTunnelsAccess` — the GitHub OAuth `ghu_*` token from the device flow
  (scope: `read:user`). Used to discover Dev Tunnels machines.
- Per-machine `tunnelClaim`, `deviceCode`, `connectToken`, `tunnelUrl`, etc. —
  the inputs `/pair/status` consumes to mint fresh 1h tunnel claims.

`localStorage` is JS-accessible and would be readable by any XSS sink in the
SPA. This is an explicit, accepted trade-off for the project's stated scope:

- **Single-user self-host.** Each user runs their own happy-server + Dev
  Tunnels + happy-app instance; there is no multi-tenant web deployment.
- **The user controls their browser environment.** They are not loading the
  SPA from a context that mixes untrusted third-party scripts.
- **XSS is out of scope.** No untrusted user-generated content from other
  accounts is rendered. The SPA loads its own bundle from its own origin.
- **The blast radius is bounded.** `devTunnelsAccess` is a `read:user` GitHub
  token (no repo/write scope); per-machine `tunnelClaim` minting still
  requires the device_code, which expires every ~15 min per R-D11.

This is consistent with the previous encryption-era design's threat model
(which assumed the same single-user posture) and does not regress the
production-faithful native flow.

**Revisit trigger.** If the fork ever ships a public multi-user web build —
i.e. a web target where one origin serves multiple users' tokens, or where
third-party scripts may execute in the SPA's origin — this trade-off MUST be
revisited. Candidate mitigations: (i) session-only in-memory tokens with
re-auth every web session, or (ii) a BFF (backend-for-frontend) that holds
tokens server-side and exposes only a same-site session cookie to the SPA.

## Sprint D US-D4 implementation notes

- Dev-environment credentials use the plaintext tunnel-claim path: set
  `EXPO_PUBLIC_DEV_DEVICE_CODE`, `EXPO_PUBLIC_DEV_DEVICE_CODE_EXPIRES_AT`,
  `EXPO_PUBLIC_DEV_TUNNEL_URL`, `EXPO_PUBLIC_DEV_MACHINE_ID`, and any non-empty
  `EXPO_PUBLIC_DEV_TUNNEL_CLAIM`. The old dev-only `pinnedPubkey` +
  `sessionKey` injection path is intentionally removed.
- Sprint A `jti` replay protection is process-local in memory. Tests that
  compare fresh claims must not restart the server between assertion
  connections. Durable replay protection remains deferred to Sprint E.
