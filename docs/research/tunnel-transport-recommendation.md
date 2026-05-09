# Tunnel Transport Recommendation

**Status:** implemented
**Created:** 2026-05-08
**Last updated:** 2026-05-09 (D-003 + connect JWT flow shipped)
**Supersedes:** `docs/research/tunnel-transport-investigation.md` (status → superseded)
**Transport decision:** Microsoft Dev Tunnels + GitHub or Entra identity (fixed)

**Implementation status (2026-05-09):**
- ✅ GitHub device flow (mobile-side, `Iv1.e7b89e013f801f03`, no server proxy)
- ✅ Dev Tunnels API enumeration (`/tunnels?global=true&api-version=2023-09-27-preview`)
- ✅ Real connect JWT per machine (`/tunnels/:id?tokenScopes=connect`)
- ✅ `X-Tunnel-Authorization: tunnel <JWT>` on all REST calls and Socket.IO
- ✅ Tunnel created without `--allow-anonymous` (tunnel edge enforces access)
- ✅ TOFU keypairs, Ed25519-signed claims, X25519 ECDH session keys
- ✅ 0/1/N machine picker
- ✅ `refreshConnectTokenIfNeeded()` implemented (not yet wired into sync init)
- ⏳ Connect token refresh on 401 / sync init — pending
- ⏳ Foreground poll (30s AppState listener) — pending
- ⏳ Entra MSAL — deferred (requires `pnpm prebuild`)

Note: auth files (`authQRStart.ts`, `authQRWait.ts`, etc.) referenced in the "Centralized Tunnel Transport Layer" section were deleted in D-003. The `happyFetch()` approach was not needed — all api*.ts files already use `getMachineAuthHeaders(credentials)` which injects `X-Tunnel-Authorization` on every request.

---

## TL;DR

The user runs **happy-server on a server machine** (their own hardware or VM). Dev Tunnels exposes that server machine's happy-server (port 3005) to the internet. The mobile uses GitHub identity to **discover** the tunnel (device flow, no secret), gets a connect JWT, and connects directly to the server machine's happy-server via the tunnel. Happy auth (bearer token) is a separate step that happens after the tunnel is established.

CLI machines connect to the same happy-server as clients — same as today, now optionally via tunnel.

---

## Architecture: Machines and Roles

```
Server Machine
├── happy-server (port 3005) — runs standalone or full deployment
└── devtunnel host --port-numbers 3005
    → exposes happy-server via Dev Tunnels
    → tunnel owned by server machine operator's GitHub/Entra identity

CLI Machine(s) (same machine or other machines)
└── happy-cli daemon → connects to happy-server (direct or via tunnel)

Mobile
├── Phase 1: Tunnel discovery (GitHub identity)
│   └── GitHub device flow → ghu_ token → list tunnels → connect JWT
└── Phase 2: Happy auth (after tunnel established)
    └── existing pairing/QR flow or server-side GitHub OAuth proxy
```

Key point: **the tunnel exposes happy-server directly**. The mobile protocol (`/v1/updates` Socket.IO, `/v1/sessions`, etc.) is unchanged. The tunnel is a transparent transport layer.

---

## Two-Phase Mobile Connection

### Phase 1 — Tunnel Discovery (GitHub device flow, no secret)

Mobile finds the server machine using GitHub identity. No happy-server credentials needed yet. Uses GitHub device flow (devtunnel's GitHub App `Iv1.e7b89e013f801f03`) — no client secret, designed for public clients.

```
Mobile                    Dev Tunnels API              Server Machine
  |                             |                            |
  |-- GitHub device flow ----→  |                            |
  |   (browser opens, 1 click)  |                            |
  |←-- ghu_ token --------------|                            |
  |                             |                            |
  |-- GET /tunnels?global=true→ |                            |
  |   Authorization: github     |                            |
  |   <ghu_token>               |                            |
  |←-- [ { tunnelId, url } ] ---|                            |
  |                             |                            |
  |-- GET /tunnels/:id ------→  |                            |
  |   ?tokenScopes=connect      |                            |
  |←-- { connect: <JWT> } ------|                            |
  |                             |                            |
  |-- io(tunnelUrl, {           |                            |
  |    extraHeaders: {          |                            |
  |     X-Tunnel-Authorization: |                            |
  |     tunnel <JWT>            |                            |
  |    }                        |                            |
  |   }) ----------------------------------------→          |
  |                                          TCP to port 3005|
  |←──── connected to happy-server on server machine ───────|
```

### Phase 2 — Happy Auth (existing flow, via tunnel)

Mobile is now connected to the server machine's happy-server via tunnel. It authenticates using the existing Happy auth flow (pairing/QR or server-side GitHub OAuth proxy). The Happy bearer token is issued by the server machine's happy-server, not a cloud service.

```
Mobile                    happy-server (server machine)
  |                               |
  |-- existing pairing/QR flow →  |  (or /v1/connect/github/params proxy)
  |←-- Happy bearer token --------|
  |                               |
  |-- Socket.IO with bearer ---→  |  ← same as today, just over tunnel
  |←-- session updates ----------|
```

---

## GitHub Device Flow: Why No Secret Is Needed

Device flow (`urn:ietf:params:oauth:grant-type:device_code`) is GitHub's documented approach for public clients — no `client_secret` required. Confirmed working with devtunnel's GitHub App (`Iv1.e7b89e013f801f03`):

1. `POST /login/device/code` with `client_id` only → `{ device_code, user_code, verification_uri }`
2. Mobile opens browser to `verification_uri?user_code=XXXX` — user sees pre-filled code, clicks **Authorize** (one tap, no typing)
3. Poll `POST /login/oauth/access_token` with `device_code` → `ghu_` token
4. Use `ghu_` token for Dev Tunnels API calls only

This is exactly how `devtunnel user login --github --use-browser-auth` works under the hood.

**UX:** browser opens automatically, user clicks Authorize, browser closes, app continues. No code entry.

---

## GitHub Backend Proxy (for Happy auth, after tunnel established)

Once the mobile is connected to the server machine's happy-server via tunnel, it can use the existing GitHub OAuth proxy routes to link their GitHub account to a Happy account:

| Existing route | Role |
|---------------|------|
| `GET /v1/connect/github/params` | Returns GitHub authorize URL (requires Happy bearer — called after initial pairing) |
| `GET /v1/connect/github/callback` | Exchanges code using `GITHUB_CLIENT_SECRET`, stores `GithubUser.token` |

**Known bug to fix before relying on this:** `connectRoutes.ts` uses `GITHUB_REDIRECT_URL` while `modules/github.ts` checks `GITHUB_REDIRECT_URI` — fix the inconsistency before using in production.

**New routes needed** (for tunnel discovery via server proxy, as an alternative to direct Dev Tunnels API calls):

| Route | What it does |
|-------|-------------|
| `GET /v1/connect/github/tunnels` | Decrypts stored `GithubUser.token`, calls Dev Tunnels API, returns tunnel list |
| `POST /v1/connect/github/tunnels/:id/connect-token` | Returns connect JWT for a specific tunnel |

These proxy routes are optional — mobile can call Dev Tunnels API directly using the device-flow `ghu_` token. Proxy is useful if the mobile is already connected to a known happy-server (e.g. cloud relay) and wants to discover additional tunnels via the server.

---

## Entra via MSAL RN (Direct, No Proxy Needed)

Azure AD supports public clients with `http://localhost` redirect URIs natively. No client secret, no backend proxy.

**Empirically validated 2026-05-08:**
- Client app: `c0df98ca-23b4-4bce-bb9f-72039b28d3a5` (devtunnel's public client app ID)
- Resource: `46da2f7e-b5ef-422a-88d4-2a7f9de6a0b2`
- Scope: `46da2f7e-b5ef-422a-88d4-2a7f9de6a0b2/.default`
- Browser flow worked end-to-end, `Bearer` token accepted by Dev Tunnels API

```
Mobile → MSAL acquireToken() → Bearer token → Dev Tunnels API → tunnelUrl + connectJWT → connect
```

---

## Empirical Findings (2026-05-08)

All results from live experiments. Test app at `experiments/tunnel-discovery/`.

### Dev Tunnels API

| Endpoint | Auth header | Purpose |
|----------|-------------|---------|
| `GET https://global.rel.tunnels.api.visualstudio.com/tunnels?includePorts=true&global=true&api-version=2023-09-27-preview` | `Authorization: github <ghu_token>` or `Authorization: Bearer <aad_token>` | List all tunnels owned by identity |
| `GET https://global.rel.tunnels.api.visualstudio.com/tunnels/{tunnelId}?tokenScopes=connect&api-version=2023-09-27-preview` | same | Get tunnel details + connect JWT |

### `extraHeaders` in React Native — confirmed

`node_modules/engine.io-client/build/cjs/transports/websocket.js:24-29` passes `extraHeaders` as `{ headers: extraHeaders }` to native RN WebSocket. happy-app uses socket.io-client v4.8.1 with `transports: ['websocket']` — confirmed compatible.

### X-Tunnel-Authorization header — confirmed

`curl -H "X-Tunnel-Authorization: tunnel <JWT>" https://<tunnel>-3005.usw2.devtunnels.ms/v1/updates/socket.io/?EIO=4&transport=polling` → 200. Happy-server reached, socket.io handshake completed. Token-based tunnel auth enforced (no `--allow-anonymous` needed).

### GitHub identity — device flow ✅ (validated 2026-05-08)

Full end-to-end: `POST /login/device/code` with `client_id=Iv1.e7b89e013f801f03` (no secret) → browser opens → user clicks Authorize → `ghu_` token → 2 tunnels listed (N>1 picker triggered) → connect token → Socket.IO connected → happy-server responded.

Both `ghu_` (GitHub App device flow) and `gho_` (OAuth App, `gh` CLI) accepted by Dev Tunnels API.

### Confirmed IDs

| Item | Value |
|------|-------|
| GitHub App client ID (device flow) | `Iv1.e7b89e013f801f03` (devtunnel's app) |
| GitHub OAuth App client ID (browser flow) | `Ov23lilPi6gUgNdjxO76` (registered for test) |
| Dev Tunnels client app (Entra) | `c0df98ca-23b4-4bce-bb9f-72039b28d3a5` |
| Dev Tunnels resource app (Entra) | `46da2f7e-b5ef-422a-88d4-2a7f9de6a0b2` |
| Required Entra scope | `46da2f7e-b5ef-422a-88d4-2a7f9de6a0b2/.default` |
| Microsoft tenant | `72f988bf-86f1-41af-91ab-2d7cd011db47` |

---

## Centralized Tunnel Transport Layer (Critical)

Every HTTP request made by happy-app to `getServerUrl()` must carry `X-Tunnel-Authorization: tunnel <JWT>` when the endpoint is a tunnel URL. This includes:

- `authQRStart.ts:30`, `authQRWait.ts:23`, `authGetToken.ts:10` — pairing/QR auth flow
- All REST calls in `sync.ts` (`/v1/sessions`, `/v1/machines`, `/v1/kv`, etc.)
- Socket.IO handshake (already handled via `extraHeaders`)

**Required addition:** a transport state model and header injection layer.

**Critical implementation constraints (both reviewers):**
1. `expo-secure-store` is **async** — `getHeaders()` cannot read directly from it at call time. The connect token must be **preloaded into an in-memory cache** during app init before any request is made.
2. Auth files (`authQRStart.ts`, `authQRWait.ts`, `authGetToken.ts`, `authApprove.ts`, `authAccountApprove.ts`) use **axios**, not `fetch`. The transport layer must wrap both.
3. There are **15+ callers** of `getServerUrl()` across the codebase — not just `sync.ts`. Replace manually is brittle. Use shared helpers instead.

**Recommended approach — shared request helpers:**

```typescript
// New: packages/happy-app/sources/sync/tunnelTransport.ts

interface TunnelState {
    tunnelUrl:          string;
    connectToken:       string;   // JWT — preloaded from SecureStore into memory
    connectTokenExpiry: number;   // unix ms — checked before each request
    tunnelId:           string;
    accountId:          string;
}

// In-memory cache (populated during syncInit, refreshed on expiry)
let activeTunnel: TunnelState | null = null;

export function getEndpoint(): string        // tunnelUrl | getServerUrl()
export function getHeaders(): HeadersInit    // { 'X-Tunnel-Authorization': 'tunnel <jwt>' } | {}
export function isActive(): boolean
export async function loadFromStorage(): Promise<void>  // called once at app init

// Shared fetch wrapper — replaces direct fetch() calls
export function happyFetch(path: string, init?: RequestInit): Promise<Response>

// Shared axios config — replaces direct axios calls in auth/ files
export function happyAxiosConfig(): AxiosRequestConfig
```

**All call sites to update:**

| File | Type | Change |
|------|------|--------|
| `packages/happy-app/sources/sync/sync.ts` (15+ calls) | fetch | Use `happyFetch()` |
| `packages/happy-app/sources/sync/apiSocket.ts` (`request()` + `connect()`) | fetch + Socket.IO | `happyFetch()` + `extraHeaders` |
| `packages/happy-app/sources/sync/apiArtifacts.ts` | fetch | `happyFetch()` |
| `packages/happy-app/sources/sync/apiFeed.ts` | fetch | `happyFetch()` |
| `packages/happy-app/sources/sync/apiFriends.ts` | fetch | `happyFetch()` |
| `packages/happy-app/sources/sync/apiGithub.ts` | fetch | `happyFetch()` |
| `packages/happy-app/sources/sync/apiKv.ts` | fetch | `happyFetch()` |
| `packages/happy-app/sources/sync/apiPush.ts` | fetch | `happyFetch()` |
| `packages/happy-app/sources/sync/apiServices.ts` | fetch | `happyFetch()` |
| `packages/happy-app/sources/sync/apiUsage.ts` | fetch | `happyFetch()` |
| `packages/happy-app/sources/sync/apiVoice.ts` | fetch | `happyFetch()` |
| `packages/happy-app/sources/auth/authQRStart.ts` | **axios** | `happyAxiosConfig()` |
| `packages/happy-app/sources/auth/authQRWait.ts` | **axios** | `happyAxiosConfig()` |
| `packages/happy-app/sources/auth/authGetToken.ts` | **axios** | `happyAxiosConfig()` |
| `packages/happy-app/sources/auth/authApprove.ts` | **axios** | `happyAxiosConfig()` |
| `packages/happy-app/sources/auth/authAccountApprove.ts` | **axios** | `happyAxiosConfig()` |

**Storage model:**

| Field | Storage | Why |
|-------|---------|-----|
| `tunnelUrl` | MMKV | Not secret, sync read |
| `tunnelId` | MMKV | Not secret |
| `connectTokenExpiry` | MMKV | TTL check is sync |
| `accountId` | MMKV | Per-account selection |
| `connectToken` | SecureStore → memory | Async load once at init; never read async per-request |

---

## What Changes

### Server machine (new)

| What | Detail |
|------|--------|
| Run devtunnel on startup | `devtunnel host --port-numbers 3005 --protocol http --description "$(hostname)"` |
| Entra or GitHub login | `devtunnel user login --entra --use-integrated-windows-auth` or `--github` |
| Tunnel cleanup on shutdown | `devtunnel delete <id>` or process exit (ephemeral tunnels auto-expire) |
| Deploy `GITHUB_CLIENT_SECRET` | For the OAuth App (`Ov23lilPi6gUgNdjxO76`) — server-side only |
| Fix env var inconsistency | `GITHUB_REDIRECT_URL` → `GITHUB_REDIRECT_URI` in `connectRoutes.ts` |
| Add proxy routes | `GET /v1/connect/github/tunnels`, `POST /v1/connect/github/tunnels/:id/connect-token` |

### Mobile (new)

| What | Detail |
|------|--------|
| GitHub device flow for discovery | Use devtunnel's GitHub App `Iv1.e7b89e013f801f03`, open browser to device URL, poll for `ghu_` token |
| Dev Tunnels API call | `GET /tunnels?global=true` with `Authorization: github <ghu_>` |
| Connect token call | `GET /tunnels/:id?tokenScopes=connect` |
| Socket.IO with extraHeaders | `io(tunnelUrl, { extraHeaders: { 'X-Tunnel-Authorization': 'tunnel <JWT>' }, auth: { token: <bearer> } })` |
| Entra MSAL RN | **Deferred — Phase 2.** `pnpm prebuild` stubbed to error; native module setup required. GitHub device flow covers Phase 1. |
| Handle `happy://` deep link | For GitHub OAuth callback from server proxy (Phase 2 Happy auth) |

### Unchanged

- happy-server Socket.IO protocol (`/v1/updates`, bearer auth) — identical
- E2E encryption — identical
- Wire protocol — identical
- CLI daemon connection to happy-server — identical
- Redis, Postgres, S3 — identical (server operator's choice)

### Rough effort

3–4 days. CLI/server tunnel lifecycle + two new server proxy routes + mobile discovery flow.

---

## Tunnel Discovery: 0, 1, or N

| Count | Behaviour |
|-------|-----------|
| **0** | "No server found for your account. Start happy-server with devtunnel on your server machine." Offer manual URL entry as fallback. |
| **1** | Auto-connect. |
| **2+** | Machine picker using `tunnel.description` (set to `hostname` by server). Remember choice per account. |

Poll on foreground resume (30s interval). `devtunnel host --description "$(hostname)"` required for human-readable picker.

---

## Threat Model

| # | Threat | Mitigation | Survives E2E? |
|---|--------|-----------|---------------|
| 1 | **Connect token leak** | JWT scoped to one tunnel, short-TTL, signed — unforgeable | Yes |
| 2 | **Tunnel URL leak** | URL alone insufficient — connect JWT required | N/A |
| 3 | **MITM** | HTTPS to `devtunnels.ms` (TLS 1.3); E2E encrypts payload | Yes |
| 4 | **Replay of connect token** | Tied to specific tunnel; tunnel deletion invalidates it | Yes |
| 5 | **Unauthorized tunnel access** | Attacker cannot mint connect JWT without server machine's identity | Yes |
| 6 | **GitHub/Entra token leak on mobile** | `ghu_` token and MSAL Bearer have short TTL; stored in SecureStore; no client secret exists anywhere | Yes |
| 7 | **Mobile theft** | Connect token short-lived; GitHub device flow re-auth required on next session | Yes |
| 8 | **Server compromise** | Attacker gets stored GitHub tokens; content still E2E encrypted | E2E unchanged |
| 9 | **Dev Tunnels provider compromise** | E2E encryption — provider sees ciphertext only | Yes |
| 10 | **Auditability** | GitHub OAuth events logged by GitHub; happy-server logs bearer userId per connection | Full |

---

## Effect on Phase 0 Spike

**Disposition: repurpose.**

- **US-001:** Confirm `devtunnel host --port-numbers 3005 --description "$(hostname)"` works on server machine with Entra or GitHub login. ✅ Validated 2026-05-08.
- **US-002:** Implement GitHub device flow in happy-app (browser auto-open, poll for `ghu_` token). Verify token lists tunnels via Dev Tunnels API.
- **US-003:** Implement connect token fetch + Socket.IO connect with `extraHeaders`. Verify happy-server on server machine responds correctly.
- **US-004:** Fix `GITHUB_REDIRECT_URL` vs `GITHUB_REDIRECT_URI` in `connectRoutes.ts`. Add `/v1/connect/github/tunnels` + `/connect-token` proxy routes.
- **US-005:** Entra variant — MSAL RN, direct API calls. **Phase 2 only** (deferred, see Open Question 10).
- **US-006:** Machine picker UX (0/1/N tunnels), polling on foreground resume, remembered choice.
- **US-007:** Server machine deployment — `devtunnel host` lifecycle as part of **server startup scripts** (NOT CLI `run.ts` — the CLI is a client of happy-server, not its host). Document `devtunnel user login` setup for Linux/Mac headless servers.
- **US-008:** Token expiry handling — Dev Tunnels API 401 triggers GitHub re-auth, expired connect JWT triggers new `?tokenScopes=connect` call, expired Happy bearer triggers re-pairing.
- **US-009:** Tunnel transport layer — implement `tunnelTransport.ts` with `happyFetch()` + `happyAxiosConfig()` helpers. Update all 16 call sites (see Centralized Tunnel Transport Layer section). Preload connect token into memory at `syncInit()`. Verify `X-Tunnel-Authorization` is present on: Socket.IO handshake, REST `fetch`, and all axios auth calls through the tunnel.
- **US-010:** i18n — add translations for 0/1/N tunnel states and picker to all language files in `packages/happy-app/sources/text/translations/`.

---

## Open Questions

1. **GitHub device flow UX detail.** Browser opens to `github.com/login/device?user_code=XXXX` — user sees code pre-filled, clicks Authorize (one tap if already logged in). ✅ Validated 2026-05-08 end-to-end: `ghu_` token obtained → tunnels listed → connect token → Socket.IO connected.
2. **Connect token TTL.** Default 24h. Prefer 1h. Verify `?tokenScopes=connect` accepts a TTL parameter.
3. **Named vs ephemeral tunnels.** Ephemeral tunnels die with the process — no cleanup needed. Named tunnels (30-day expiry) allow the mobile to reconnect faster (stable tunnel ID). Recommend ephemeral for simplicity unless reconnect speed is a concern.
4. **Relay fallback.** If 0 tunnels found: offer manual URL entry (covers cloud relay URL, another server's URL, or localhost via USB). Keeps the app useful even without Dev Tunnels.
5. **Multi-server.** A user can have tunnels from multiple server machines. The picker shows all of them. Each machine's happy-server is independent (separate sessions, separate data).
6. **CLI on a different machine.** CLI connects to the server machine's happy-server as a client — via tunnel URL or directly if on the same network. No change to CLI architecture.
7. **Entra multi-tenant.** `common` authority allows any Entra tenant. May need admin consent for non-Microsoft tenants to access Dev Tunnels resource app.
8. **GitHub token expiry on server.** Stored `gho_` tokens in `GithubUser.token` can be revoked or expire. happy-server needs to handle 401 from Dev Tunnels API and re-trigger GitHub OAuth on mobile.
9. **devtunnel login on server machine — Linux/Mac headless.** Windows: `--use-integrated-windows-auth` works silently. Linux/Mac: requires interactive login once (`devtunnel user login --github --use-device-code-auth`), then credential is cached. For fully automated server setup, investigate `--federated-token` (OIDC) or service principal path for Entra.
10. **`@azure/msal-react-native` native setup.** Adding MSAL requires native module configuration (Expo dev client, not Expo Go). This may need `pnpm prebuild` which is currently stubbed to error. Defer Entra MSAL to a second pass; validate GitHub device flow first.
11. **`connectRoutes.ts` redirect still points to the legacy hosted app URL.** Must be updated to `happy://` deep link scheme before Happy GitHub OAuth proxy works from mobile. `app.config.js` has `scheme: 'happy'` but `_layout.tsx` has no handler for this OAuth return.
