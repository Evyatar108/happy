# GitHub-auth via VS Code / dev tunnels: replace pairing + E2E with tunnel-direct WS

> **Status:** plan, not yet implemented. Captured 2026-05-02.
> **Worktree:** main worktree at `C:\\harness-efforts\\codexu` (branch `main`). All three packages live in `packages/` of this single worktree — no sibling worktrees needed.
> **Scope:** breaking architecture change. Replaces secret-key device pairing + end-to-end-encrypted relay with: GitHub OAuth identity, Microsoft Dev Tunnels as transport, happy-server demoted to a tiny directory service.
> **Backward compatibility:** none. Existing pairings, sessions, messages, artifacts on happy-server are intentionally dropped (data migration is out of scope — the user accepted this in planning).

---

## Why this doc exists

Today Happy is a self-hosted three-tier system:

- happy-cli on the user's dev box opens an outbound Socket.IO connection to **happy-server** (`/v1/updates`).
- happy-app does the same.
- happy-server **relays** every message between them and persists encrypted blobs.
- Identity is bootstrapped by **scanning a QR code** that hands a 32-byte libsodium secret to a new device. All bodies (messages, agent state, artifacts) are **end-to-end encrypted** with keys derived from that secret. Server is zero-knowledge.

The user has chosen to discard that model and replace it with:

- **GitHub OAuth** as the only identity provider on all three components.
- **happy-cli runs a local WebSocket server** on the dev machine.
- **Microsoft Dev Tunnels** (the same infrastructure VS Code's `code tunnel` uses, exposed as the `devtunnel` CLI) forward that local port to a public `https://*.tunnels.api.visualstudio.com/...` URL, gated by GitHub-authenticated tunnel ACLs.
- **happy-app connects WebSocket directly to the tunnel URL** — no relay.
- **happy-server shrinks to a directory**: "GitHub user X's machines are at tunnel URLs Y, Z." It also brokers GitHub OAuth for the app and CLI on first run.
- **End-to-end encryption is dropped.** Trust boundary becomes "GitHub-authenticated TLS to my own machine via Microsoft tunnel relay" — a strictly weaker but much simpler model.

This doc is the implementation plan. It cites specific files to delete, modify, and create.

---

## Architecture before / after

### Before
```
happy-cli ──Socket.IO──▶ happy-server ◀──Socket.IO── happy-app
   │       (E2E msgs)         │         (E2E msgs)
   └─ secret-key from QR ─────┘
   server stores opaque encrypted blobs in Postgres
```

### After
```
                 ┌─ GitHub OAuth code flow ─┐
happy-app ───────┤                          ├─▶ happy-server (directory only)
   │             └─ list("my machines") ────┘     │  Postgres: { user, machineId, tunnelUrl, lastSeen }
   │                                              │
   │ WS direct                                    │ machine announces its tunnel URL
   ▼                                              │
[devtunnels relay] ◀── tunnel host ── happy-cli ──┘
        │                                  ▲
        └─ GitHub-authenticated WS ────────┘
                                          local WS server on dev box
```

### Common confusion: VS Code tunnels vs. Dev Tunnels CLI

This trips people up — call it out in the README too.

- `code tunnel` (the VS Code CLI) is a **specialized** wrapper that registers the VS Code Server itself behind a tunnel. It is **not** a general-purpose port forwarder.
- The general-purpose forwarder is **`devtunnel`** (Microsoft Dev Tunnels CLI, `https://learn.microsoft.com/azure/developer/dev-tunnels/`). It forwards arbitrary TCP/HTTP/WS ports.
- Both ride on the **same tunneling infrastructure** (`*.tunnels.api.visualstudio.com`) and accept GitHub identity for ACLs.
- For Happy we want `devtunnel`, not `code tunnel`. The marketing answer is still "VS Code tunnels" because they share the platform — be explicit in user-facing docs to avoid confusion.

---

## File map (where the work lands)

All paths relative to `C:\\harness-efforts\\codexu`.

### happy-server: `packages/happy-server/`

**Delete entirely:**
- `sources/app/api/socket.ts` — Socket.IO server + `/v1/updates` namespace
- `sources/app/api/socket/` (whole directory: `rpcHandler.ts`, `sessionUpdateHandler.ts`, `sessionMessageRangeHandler.ts`, `machineUpdateHandler.ts`, `artifactUpdateHandler.ts`, `accessKeyHandler.ts`, `pingHandler.ts`, `usageHandler.ts`)
- `sources/app/events/eventRouter.ts` (Redis pub/sub fanout — no relay anymore)
- `sources/app/api/routes/sessionRoutes.ts`, `v3SessionRoutes.ts` (no server-side sessions)
- `sources/app/api/routes/artifactsRoutes.ts`
- `sources/app/api/routes/kvRoutes.ts`
- `sources/app/api/routes/feedRoutes.ts`
- `sources/app/api/routes/accessKeysRoutes.ts`

**Heavily modify:**
- `sources/app/auth/auth.ts` — strip `privacy-kit` persistent/ephemeral token generators; replace with GitHub-OAuth-token verification (call `https://api.github.com/user` with the bearer, cache the result, map to `Account`).
- `sources/app/api/utils/enableAuthentication.ts` — auth decorator now expects an `Authorization: Bearer <gh_token>` header.
- `sources/app/api/routes/authRoutes.ts` — today this file contains ONLY the legacy device-pairing challenge/sign flow (`/v1/auth`, `/v1/auth/request`, `/v1/auth/request/status`, `/v1/auth/response`, `/v1/auth/account/request`, `/v1/auth/account/response` — all backed by `TerminalAuthRequest`/`AccountAuthRequest`). Delete every existing handler in the file and replace them with the new GitHub OAuth code-exchange + device-flow endpoints under `/v1/auth/github/*` (see "GitHub OAuth surfaces" below) — i.e. migrate the GitHub OAuth handlers currently living in `connectRoutes.ts` (see next bullet) into this file under the new path prefix.
- `sources/app/api/routes/connectRoutes.ts` — **partially preserved** (move from "Delete entirely" → here). Today this file owns the actual GitHub OAuth flow at `GET /v1/connect/github/params`, `GET /v1/connect/github/callback`, `POST /v1/connect/github/webhook`, `DELETE /v1/connect/github`, plus vendor-token endpoints (`/v1/connect/:vendor/register`, `/v1/connect/:vendor/token`, `DELETE /v1/connect/:vendor`, `/v1/connect/tokens`). Disposition: (a) move the four GitHub OAuth handlers above into `authRoutes.ts` under `/v1/auth/github/*` (e.g. `/v1/auth/github/params`, `/v1/auth/github/callback`, `/v1/auth/github/webhook`, `DELETE /v1/auth/github`); (b) delete the vendor-token endpoints together with the `ServiceAccountToken` Prisma model drop (per the schema diff in Phase 1); (c) once both are done, the file is empty — delete `connectRoutes.ts` itself and remove its registration from the API server bootstrap. Also update `packages/happy-app/sources/sync/apiGithub.ts` (`getGitHubOAuthParams`, `disconnectGitHub`, and the `getAccountProfile` call site if it remains) to call the new `/v1/auth/github/*` paths instead of `/v1/connect/github/*`.
- `sources/app/api/routes/machinesRoutes.ts` — repurpose to a **directory**: `POST /v1/machines/announce` (cli announces tunnel URL), `GET /v1/machines` (app lists my machines + URLs), `DELETE /v1/machines/:id`, heartbeat ping.
- `sources/app/api/routes/accountRoutes.ts` — reshape around the new GitHub-only `Account` schema. The current file (1) selects `firstName`, `lastName`, `username`, `avatar` from `Account` in `GET /v1/account/profile` (lines 18–24, 30–34), (2) reads/writes `Account.settings` and `Account.settingsVersion` in `GET`/`POST /v1/account/settings` (lines 40–177), (3) queries `db.serviceAccountToken.findMany(...)` to compute `connectedServices` (line 26), and (4) implements `POST /v1/usage/query` against the deleted `Session` and `UsageReport` models (lines 179–311). After Phase 1's schema drops (`ServiceAccountToken`, `Session`, `UsageReport`, and the `settings`/`settingsVersion`/`firstName`/`lastName`/`username`/`avatar` fields on `Account`), every one of these references is a Prisma error. Disposition: (a) rewrite `GET /v1/account/profile` to return `{ id, githubUserId, githubLogin, name, avatarUrl, lastSeenAt }` from the reshaped `Account`, dropping the `firstName`/`lastName`/`username`/`avatar`/`connectedServices` keys (no `serviceAccountToken` query); (b) delete the `GET`/`POST /v1/account/settings` handlers entirely — settings move to CLI-local `~/.happy/settings.json` per the "Session and history REST surface" section above (the CLI's local Fastify re-hosts `GET`/`PUT /v1/account/settings`); (c) delete `POST /v1/usage/query` along with `usageHandler.ts` and the `UsageReport` model drop (the Phase 3 disposition table marks Usage as **Delete**); (d) update `packages/happy-app/sources/sync/sync.ts:1688,1758,1804` to call the CLI tunnel URL for `/v1/account/settings` and `/v1/account/profile` (profile now sourced from the cached `api.github.com/user` response on the CLI per the Phase 2 lift list) — `/v1/account/profile` on happy-server can stay if the app still wants a server-side identity echo, but the canonical source is the GitHub bearer.
- `sources/app/github/githubConnect.ts` / `githubDisconnect.ts` — generalize from "link an account that already exists" to "GitHub IS the account."

**New file:**
- `sources/app/auth/githubBearer.ts` — middleware that validates GitHub bearer tokens against `api.github.com/user`, with an in-memory + Redis cache (TTL 5 min) so we don't hit GitHub on every request.

**Schema migration** — `prisma/schema.prisma`:
- ⚠️ **HUMAN STEP — agents must NOT edit `prisma/schema.prisma` or run `pnpm migrate` / `prisma migrate` themselves.** Per `packages/happy-server/CLAUDE.md` ("NEVER DO MIGRATION YOURSELF" and "Never create migrations yourself, it is can be done only by human"), the schema edit and migration generation are operator-only steps. Agents may run `pnpm generate` after the human applies the change, to refresh the Prisma client types. The exact schema diff is inlined under Phase 1 below so the operator can apply it without interpretation.
- Net effect (for reference; do not implement here — applied by the human in Phase 1):
  - Drop tables: `TerminalAuthRequest`, `AccountAuthRequest`, `Session`, `SessionMessage`, `AccessKey`, `Artifact`, `UserKVStore`, `VoiceConversation` (kill it for now; bring back later if Voice ships), `ServiceAccountToken`. (`Machine.daemonState` and encryption columns are dropped via the `Machine` reshape below.)
  - Reshape `Account`: `{ id, githubUserId (unique), githubLogin, name, avatarUrl, createdAt, lastSeenAt }`. Drop `secretKey`, `dataEncryptionKey`, etc.
  - Reshape `Machine` → new `MachineDirectoryEntry`: `{ id, accountId (FK), machineId (client-chosen UUID), hostname, tunnelUrl, tunnelCreatedAt, lastHeartbeatAt }`.
  - Keep: `GithubUser`, `GithubOrganization`, `UserRelationship` (if friend graph still wanted — confirm with user; otherwise drop too).

### happy-cli: `packages/happy-cli/`

**Delete:**
- `src/api/auth.ts authGetToken()` and the libsodium signature challenge
- `src/api/encryption.ts` — most of it (`libsodiumEncryptForPublicKey`, secretbox, AES-GCM wrappers). Keep base64url helpers.
- The outbound Socket.IO client to happy-server's `/v1/updates` (remove from `src/api/apiSession.ts`)

**New files:**
- `src/transport/localWsServer.ts` — **Socket.IO server** (not plain `ws`) bound to `127.0.0.1` on a stable per-machine port (persisted in `~/.happy/machine.json`). Re-host the existing `/v1/updates` protocol verbatim: same named events (`update`, `rpc-call`, `rpc-register`, `ping`, `usage-report`, etc.), same `emitWithAck` RPC contract, same `auth` payload on connect, same handler signatures as `packages/happy-server/sources/app/api/socket/`. Add `socket.io` (server library) to `packages/happy-cli/package.json` — only `socket.io-client` is currently a dep. The server attaches to a Fastify (already a CLI dep) HTTP server on the local port; lift the existing handlers (`rpcHandler.ts`, `sessionUpdateHandler.ts`, `sessionMessageRangeHandler.ts`, `machineUpdateHandler.ts`, `pingHandler.ts`) from `packages/happy-server/sources/app/api/socket/` largely unchanged — they become the CLI's local handlers. State that previously lived in Postgres on happy-server (session sequence numbers, message ranges, machine metadata) now lives in CLI process memory + `~/.happy/` files; the wire shape does not change. Drop server-side-only handlers (`artifactUpdateHandler.ts`, `accessKeyHandler.ts`, `usageHandler.ts`) per the Phase 3 disposition table. Rationale: a plain-`ws` rewrite would require re-implementing named-event multiplexing, ack-based RPC, reconnect-with-replay, and seq-number bookkeeping — a multi-week protocol rewrite the 3-4 day Phase 2 estimate cannot absorb. Reusing `socket.io` server keeps the app's existing `socket.io-client` (in `packages/happy-app/sources/sync/apiSocket.ts`) working through the tunnel unchanged.
- `src/transport/tunnel.ts` — orchestrates the `devtunnel` CLI:
  - `devtunnel host -p <port> --allow-anonymous false --tags happy-machine` (or programmatic SDK if available — there's a Microsoft.DevTunnels.Connections .NET SDK and a partial Node lib; for the first cut spawn the CLI and parse its output for the URL).
  - Apply tunnel ACL: only the owner's GitHub user can connect.
  - Re-create on idle expiry (Dev Tunnels close after ~24h idle); persist tunnel ID; advertise URL via the announce endpoint on every (re)create + every 60s heartbeat.
- `src/auth/githubDeviceFlow.ts` — implements the GitHub Device Flow (https://docs.github.com/apps/oauth-flow#device-flow) since the CLI is headless. On first run, prints `https://github.com/login/device` + a code; user pastes the code in a browser; CLI polls `/login/oauth/access_token` until granted. Store the resulting GH access token in `~/.happy/credentials.json` (mode 0600 on POSIX; on Windows rely on user-profile ACL).

**Heavily modify:**
- `src/api/apiSession.ts` — replace outbound socket + relay protocol with: own the local WS server, wait for app connections, dispatch Codex/Claude calls.
- `src/persistence.ts` — drop secret-key storage; only persist the GitHub token + machine ID + tunnel ID.
- `src/daemon/*` — daemon now owns the lifecycle of (a) the local WS server (b) the devtunnel host process (c) the announce/heartbeat loop to happy-server.
- `src/commands/connect.ts` + `src/api/api.ts` (`registerVendorToken`, `getVendorToken`) — **`happy connect` is preserved but goes fully local.** The command is the user-facing flow for storing Codex / Claude / Gemini API keys, and the user has not asked to remove it. Disposition: AI vendor API keys are now stored **locally on the CLI machine only** in `~/.happy/vendor-tokens.json` (mode 0600 on POSIX; user-profile ACL on Windows). `registerVendorToken(...)` becomes a local file write; `getVendorToken(...)` becomes a local file read; `happy connect status` reads from the same file. The Codex / Claude / Gemini runners (`src/codex/*`, `src/claude/*`) already run on the CLI box and load these keys from process state, so there is no app-side or server-side consumer that needs the cloud round-trip. Consequence: the `/v1/connect/:vendor/register`, `/v1/connect/:vendor/token`, `DELETE /v1/connect/:vendor`, and `/v1/connect/tokens` endpoints in `connectRoutes.ts` are deleted alongside the `ServiceAccountToken` Prisma model (already in the Phase 1 drop list), the help text "API keys are encrypted and stored securely in Happy cloud" / "manage your stored keys at app.happy.engineering" in `connect.ts:62-74` is rewritten to reflect local storage, and the `Notes` section's "You must be authenticated with Happy first" precondition becomes "You must have signed in with GitHub" (since auth state still gates which user owns the local tokens directory). Out of scope for this plan: any app-side UI for managing vendor tokens — the existing `packages/happy-app/sources/app/(app)/settings/connect/claude.tsx` and `connect/language.tsx` screens already lose their "connect GitHub" row per the feature-disposition table; if they also surface vendor-token connect, prune those rows in Phase 3 since vendor-token storage is no longer reachable from the app.

**Important CLI UX:** the `devtunnel` binary must be on PATH. Add a preflight in `src/transport/tunnel.ts` that checks `devtunnel --version` and points the user at the install instructions if missing. Don't try to bundle it.

**Session and history REST surface (where the deleted server-side endpoints land).** Phase 1 deletes `sessionRoutes.ts` and `v3SessionRoutes.ts` on happy-server, but the app and CLI rely on the REST shape they serve today for session listing, message-history pagination, session metadata edit/archive/delete, and machine ops. Two transports are used today and both must move to the CLI:

- `fetch(${API_ENDPOINT}/...)` direct REST: `GET /v1/sessions` (`packages/happy-app/sources/sync/sync.ts:1086` — `fetchSessions`), `GET /v1/machines` (`sync.ts:1464`), `GET /v1/account/settings` (`sync.ts:1688,1758`), `GET /v1/account/profile` (`sync.ts:1804`), `POST /v1/sessions` and `POST /v1/machines` (`packages/happy-cli/src/api/api.ts:61,182`), and the v3 message GET/POST in `packages/happy-cli/src/api/apiSession.ts:303,365`.
- Socket.IO ack-based RPC via `apiSocket.request(...)` (handled server-side by `socket/rpcHandler.ts`): `GET /v3/sessions/:id/messages` for both initial and older-page fetch (`sync.ts:1957,2038`), `GET /v1/machines/:id` (`packages/happy-app/sources/sync/ops.ts:216`), `PATCH /v1/sessions/:id` (`ops.ts:643`), `DELETE /v1/sessions/:id` (`ops.ts:643` `DELETE` branch), and `POST /v1/sessions/:id/archive` (`ops.ts:624`).

**New model — sessions and message history are CLI-local; the CLI re-hosts the existing REST shape.** All session, message, and machine-detail endpoints listed above move to the CLI process. There is no server-side replacement.

- The CLI's local Fastify HTTP server (the same Fastify instance that backs `localWsServer.ts`) exposes the v1/v3 REST surface verbatim under the same paths and bodies the app uses today: `GET /v1/sessions`, `POST /v1/sessions`, `PATCH /v1/sessions/:id`, `DELETE /v1/sessions/:id`, `POST /v1/sessions/:id/archive`, `GET /v3/sessions/:id/messages`, `POST /v3/sessions/:id/messages`, `GET /v1/machines/:id` (self-describe — the local CLI is the only machine it knows about), and `GET /v1/account/settings` / `PUT /v1/account/settings` / `GET /v1/account/profile` (account settings + profile become CLI-local — profile is sourced from the cached `api.github.com/user` response, settings from `~/.happy/settings.json`).
- The Socket.IO ack-RPC variants (`apiSocket.request('/v3/sessions/:id/messages', ...)`, `apiSocket.request('/v1/machines/:id', ...)`, etc.) are served by the CLI's local Socket.IO server's `rpcHandler.ts` lifted from happy-server (per the Phase 2 lift list above) — i.e. the same path strings keep working unchanged once the app's `apiSocket` is pointed at the tunnel URL.
- The `GET /v1/machines` listing (`sync.ts:1464`) and `POST /v1/machines` registration (`cli/api.ts:182`) are the **only** machine endpoints that stay on happy-server — they are the directory routes (`POST /v1/machines/announce`, `GET /v1/machines`, `DELETE /v1/machines/:id`) defined in Phase 1. The app's `sync.ts:1464` call already targets this path; the CLI's `POST /v1/machines` becomes a call to `POST /v1/machines/announce`. The per-machine `GET /v1/machines/:id` (`ops.ts:216`) is CLI-local (self-describe), not a directory route.
- Server-side persistence for sessions/messages goes away entirely (the `Session`, `SessionMessage`, `AccessKey` Prisma models are dropped in Phase 1). Sessions and message history live in CLI process memory, persisted to `~/.happy/sessions/` (one file per session, or SQLite if the lifted handlers' sequence-allocation logic warrants it — call out in Phase 2 review).
- App-side migration cost in `sync.ts` and `ops.ts`: change the `API_ENDPOINT` of the four `fetch(...)` calls listed above from `getServerUrl()` to the active machine's tunnel URL (already plumbed via the new machine picker in Phase 3). The `apiSocket.request(...)` call sites need no change — they ride the same Socket.IO connection that already moves to the tunnel URL per the existing "Heavily modify: `sources/sync/apiSocket.ts`" item below.

Add an explicit Phase 3 task per direct-`fetch` call site listed above to redirect the base URL from `getServerUrl()` to the selected machine's `tunnelUrl` (`GET /v1/machines` is the lone exception — it stays on happy-server). Add an explicit Phase 2 task to register Fastify routes for the v1/v3 REST endpoints listed above on the CLI's local HTTP server, mirroring the request/response shapes of the deleted `sessionRoutes.ts` / `v3SessionRoutes.ts` so the app needs no schema changes.

### happy-app: `packages/happy-app/`

**Delete entirely:**
- `sources/app/(app)/restore/` (whole directory: `index.tsx`, `manual.tsx`, etc. — QR + manual key restore flows)
- `sources/auth/authQRStart.ts`
- `sources/auth/authQRWait.ts`
- `sources/components/qr/QRCode.tsx` and any QR rendering helpers
- `sources/sync/encryption/` (whole directory: `encryption.ts`, `sessionEncryption.ts`, `artifactEncryption.ts`, `machineEncryption.ts`, `encryptor.ts`)
- Dependencies in `packages/happy-app/package.json` (verified against the actual installed names): run `pnpm --filter happy-app remove qrcode @types/qrcode @more-tech/react-native-libsodium libsodium-wrappers @types/libsodium-wrappers`. **Keep** `react-native-svg` — it is used outside QR rendering.

**New files:**
- `sources/auth/githubLogin.ts` — GitHub OAuth web flow built on `expo-web-browser` (`openAuthSessionAsync`) + `expo-linking` (redirect URL + callback parsing) + `expo-crypto` (PKCE/state nonces). Returns a `{ accessToken, login, avatarUrl }`. All three deps are already in `packages/happy-app/package.json` (`expo-web-browser`, `expo-linking`, `expo-crypto` at `~55.0.0`), so **no new `pnpm add` step is required**. Do **not** add `expo-auth-session` — it is intentionally not pulled in to avoid an extra dep. Use universal/deep links for the redirect; configure the GitHub OAuth app's callback to `happy://oauth/github/callback` (parsed via `expo-linking.parse`) and rely on `WebBrowser.openAuthSessionAsync(authUrl, redirectUrl)` to handle the round-trip on native, with a web fallback for the dev/web build.
- `sources/app/(app)/login/index.tsx` — single-button "Sign in with GitHub" screen replacing the old restore screens.
- `sources/app/(app)/machines/index.tsx` — machine picker. Calls `GET /v1/machines` (happy-server directory) with the GH bearer; lists user's machines with online/offline state and last-seen; tapping a machine opens the chat backed by that machine's tunnel URL.

**Heavily modify:**
- `sources/sync/apiSocket.ts` — `connect(machineEntry)` keeps the existing `socket.io-client` (the CLI now hosts a Socket.IO server — see `localWsServer.ts` above) but points it at `${machineEntry.tunnelUrl}` (path `/v1/updates` retained) instead of the happy-server URL. Auth: pass `{ token: ghToken, kind: 'machine-scoped' }` in the Socket.IO `auth` handshake payload — Socket.IO clients support this natively, so the browser/RN WebSocket header limitation does not apply here. The full set of named events (`update`, `rpc-call`, `rpc-register`, `ping`, etc.) is unchanged.
- `sources/app/(app)/machine/[id].tsx` — existing machine detail screen (rename / delete / stop-daemon / spawn / resume). After Phase 1 the rename and delete operations call `DELETE /v1/machines/:id` (and a future `PATCH /v1/machines/:id` for rename — add to `machinesRoutes.ts` Phase 1 scope); stop-daemon / spawn / resume become RPC calls over the local Socket.IO connection (since they are now CLI-side commands, not happy-server commands). Drop any field bindings to removed `Machine` columns (`active`, `lastActiveAt`, `daemonState`, `metadata`); the screen's data shape collapses to `{ id, hostname, tunnelUrl, lastHeartbeatAt }`. Audit `sources/sync/ops.ts` for any `apiMachine*` helpers that target deleted server endpoints and re-point them at the local Socket.IO RPC or remove them.
- `sources/auth/tokenStorage.ts` — store only `{ githubAccessToken, login }`. Drop `secret` field.

**Feature surfaces to delete, port, or defer.** Each app feature whose server-side backing is deleted in Phase 1 must have an explicit disposition. Wholesale list (with the corresponding api*.ts client + UI screens):

| Feature | App client | App screens / call sites | Server backing | Disposition |
| --- | --- | --- | --- | --- |
| Artifacts | `sources/sync/apiArtifacts.ts` | `sources/app/(app)/artifacts/` (`[id].tsx`, `edit/`, `index.tsx`, `new.tsx`); `sources/sync/encryption/artifactEncryption.ts` | `artifactsRoutes.ts`, `artifactUpdateHandler.ts` (deleted) | **Delete.** Remove client, screens, route registrations in `_layout.tsx`, store slices in `sources/sync/reducer/`, and the artifacts entry in `sources/components/sidebar/` (and any deep-link handlers). |
| Feed / inbox | `sources/sync/apiFeed.ts`, `sources/sync/feedTypes.ts` | `sources/app/(app)/inbox/index.tsx` | `feedRoutes.ts` (deleted) | **Delete.** Remove inbox tab from navigator, drop feed reducer slice and any push-feed wiring. |
| Friends / user graph | `sources/sync/apiFriends.ts`, `sources/sync/friendTypes.ts`, friend-graph parts of `sources/sync/profile.ts` | `sources/app/(app)/friends/index.tsx`, `friends/search.tsx`, `sources/app/(app)/user/[id].tsx` | `UserRelationship` (Prisma) — already an open question in the plan | **Defer.** Leave files in tree but stub the API calls to no-op + hide the entry points until the open question ("keep `UserRelationship`?" — see Decision log) is resolved. If user picks "drop," fold this into Phase 1 and delete with the server table. |
| KV store | `sources/sync/apiKv.ts` | callers across settings + reducer (search for `apiKv`) | `kvRoutes.ts`, `UserKVStore` (deleted) | **Delete.** Inline any still-needed values into local `localSettings.ts` / device-only storage; remove all `apiKv.*` call sites. |
| Push notifications | `sources/sync/apiPush.ts`, `sources/sync/pushRegistration.ts` | push-token registration on app start | `pushRoutes.ts` (NOT in current Phase 1 delete list — re-evaluate) | **Defer + decision needed.** Without the relay there is no server-side event source to push from. Recommended: delete `pushRoutes.ts` and the app's push registration in Phase 1; add to the Decision log. If user wants to retain push (e.g., for "machine offline" alerts the directory could emit), keep `apiPush.ts` and reshape `pushRoutes.ts` to fire from directory heartbeats only. |
| Usage / billing telemetry | `sources/sync/apiUsage.ts` | `sources/app/(app)/settings/usage.tsx`, `sources/sync/purchases.ts`, `sources/sync/revenueCat/` | `usageHandler.ts` (deleted via socket dir) | **Delete.** Remove the usage settings screen and unhook `purchases.ts`/`revenueCat/` from the navigation; mark RevenueCat as a follow-up if monetization returns. |
| Voice | `sources/sync/apiVoice.ts` | `sources/app/(app)/settings/voice/` (`index.tsx`, `language.tsx`), `sources/app/(app)/settings/voice.tsx` | `voiceRoutes.ts`, `VoiceConversation` (deleted per "Out of scope") | **Delete.** Already explicitly out of scope; ensure the navigator + settings index drop the voice rows. |
| Account / profile | `sources/auth/tokenStorage.ts`, `sources/sync/profile.ts` | `sources/app/(app)/settings/account.tsx` | `accountRoutes.ts` (kept, but reshaped around GitHub identity) | **Port.** Rebuild `account.tsx` to show `{ githubLogin, avatarUrl, name }` from the GitHub bearer + a "Sign out" button (clears local creds; revokes via `https://api.github.com/applications/:client_id/grant`). Drop the secret-key/recovery rows. |
| Vendor token connect | `sources/app/(app)/settings/connect/claude.tsx`, `sources/app/(app)/settings/connect/language.tsx`, `sources/sync/apiGithub.ts` | settings → Connect | `githubConnect.ts` / `githubDisconnect.ts` (reshaped, not deleted) | **Port.** GitHub-connect screens collapse into the new sign-in (GitHub IS the account, so a separate "connect GitHub" row goes away). Anthropic / Claude vendor-token connect stays — it's orthogonal to identity — but verify it no longer relies on the old `secret`-keyed encryption envelope (`sources/sync/encryption/`); if it does, re-encode the token using OS keychain (`expo-secure-store`) instead. |

Phase 3 must contain an explicit task per "Delete" row to prune the client file, screens, navigator entries, reducer slices, and `package.json` deps that become unreachable. Phase 1 must cover any server route whose deletion this table newly implies (currently: `pushRoutes.ts`, `voiceRoutes.ts` — confirm during implementation; `accountRoutes.ts` is reshape-not-delete).

**WebSocket auth-header workaround.** Because the wire protocol is Socket.IO (see `localWsServer.ts` decision above), the app passes the GH bearer in the Socket.IO `auth` handshake payload (`io(url, { auth: { token: ghToken } })`) rather than a custom HTTP header. The local Socket.IO server reads it from `socket.handshake.auth` in its connection middleware. This is the same pattern the existing happy-server uses today (`packages/happy-server/sources/app/api/socket.ts` reads `socket.handshake.auth.token`), so no new auth-transport code is needed on either side. The browser/RN WebSocket header limitation only applies to plain WebSocket — Socket.IO sidesteps it. Document this in `docs/cli-architecture.md` so reviewers don't ask.

---

## GitHub OAuth surfaces

We need two GitHub OAuth apps (or one with multiple callback URLs — GitHub allows that since 2024):

1. **happy-app GitHub App** — web flow with `redirect_uri = https://happy-server-host/v1/auth/github/callback` (the server brokers the code-for-token exchange so the `client_secret` never ships to mobile). Server returns the **raw GitHub `access_token`** to the app — it does **not** mint or issue its own session cookie or bearer. Scopes: `read:user user:email` (no repo access; we just need identity).

2. **happy-cli GitHub Device Flow** — a separate or shared OAuth app **with device-flow enabled** (must be toggled in the GitHub App settings). Scopes: same as above.

Both flows ultimately give us a GitHub user ID, which is the canonical identity. `Account.githubUserId` is the unique key.

**Token contract.** To resolve any ambiguity across the file map above:

- The app exchanges the GitHub `code` via `POST /v1/auth/github/callback` (server holds `client_secret`).
- The server returns the **raw GitHub access token** in the response body. There is no server-issued session cookie/bearer.
- All subsequent API calls from app or CLI to **happy-server** use this GitHub access token as `Authorization: Bearer <gh_token>`. The `githubBearer.ts` middleware on the server validates it against `api.github.com/user` (with cache).
- App→CLI **tunnel WebSocket** uses the **Socket.IO `auth` handshake payload** (`io(url, { auth: { token: ghToken } })`) — *not* a `Sec-WebSocket-Protocol` subprotocol and *not* an `Authorization` header. The local Socket.IO server reads `socket.handshake.auth.token` in its connection middleware (same shape happy-server uses today in `packages/happy-server/sources/app/api/socket.ts`).
- `githubLogin.ts` therefore returns `{ accessToken, login, avatarUrl }` where `accessToken` is the raw GitHub token from the server's callback response.

**Open question to flag for the user during implementation:** do we want **GitHub App** (fine-grained, installable per-org) or **OAuth App** (legacy, simpler)? Default to OAuth App for speed; revisit if org admins block it.

---

## Dev Tunnels access control

The thing the plan must validate during a spike — **don't write the rest of the code until this is proven out**.

The flow we want:
1. happy-cli runs `devtunnel host -p <port> --allow-anonymous false`. It is logged in as the user (`devtunnel user login github`), so the tunnel is owned by that GitHub identity.
2. happy-cli sets ACL: only the owner's GitHub user can connect. (`devtunnel access create <tunnel-id> --user <gh-login>` or via the SDK.)
3. happy-app, having the user's GitHub bearer token, exchanges it for a **dev-tunnel access token** to call the tunnel. There are two known paths:
   - **(a)** App calls `https://global.rel.tunnels.api.visualstudio.com/api/v1/tunnels/<id>/accessToken` with the GitHub bearer. *Confirm this works for end-user tokens, not just first-party Microsoft tokens.*
   - **(b)** happy-server (which has the bearer too) mints a **tunnel-scoped access token** server-side using a Microsoft service principal that has `tunnels-relay-user` rights, and returns it to the app. More moving parts but no client-side Microsoft auth required.

**Recommended approach:** start with (a) (purer end-to-end GitHub auth, no Microsoft service principal needed). Spike it in a 1-day prototype before committing to the full plan. If (a) doesn't work, fall back to (b).

This is the single biggest unknown in the plan. Mark it Phase 0.

### Phase 0 decision gate

The Phase 0 spike has two possible outcomes, and Phase 1 differs materially between them. **No Phase 1 code may merge until the spike result is documented in `docs/spikes/devtunnel-auth-result.md` and the matching branch below is selected.**

- **If path (a) works** (end-user GitHub bearer is accepted by `https://global.rel.tunnels.api.visualstudio.com/api/v1/tunnels/<id>/accessToken`): proceed with Phase 1 as written. happy-server has no Microsoft credential. happy-app does the token exchange itself. The directory routes (`POST /v1/machines/announce`, `GET /v1/machines`, `DELETE /v1/machines/:id`) are the only new server endpoints.

- **If path (a) fails** (the tunnels API rejects end-user GitHub tokens, or only honors first-party Microsoft tokens): switch to path (b). This changes Phase 1 scope and config:
  - Add `POST /v1/machines/:id/tunnel-token` to `packages/happy-server/sources/app/api/routes/machinesRoutes.ts`. App calls it with its GitHub bearer; server verifies the bearer, confirms the caller owns the machine in the directory, and mints a tunnel-scoped access token server-side.
  - Add a Microsoft service principal credential to happy-server config (env vars + Windows-service config update). Document the credential's required role (`tunnels-relay-user` or equivalent) and rotation procedure in `docs/security-model.md`.
  - Update `packages/happy-app/sources/sync/apiSocket.ts` to call `POST /v1/machines/:id/tunnel-token` before opening the WS, instead of exchanging the token directly against the tunnels API.
  - Update the Phase 1 estimate (+1 day for the new route, +0.5 day for service-principal config and rotation docs) and `docs/security-model.md` to reflect that happy-server now holds a Microsoft credential (no longer pure directory-only).

Both branches keep Phases 2–4 unchanged; only Phase 1's server scope and the app's tunnel-token acquisition step differ.

---

## Phasing

### Pre-implementation decisions (resolve before Phase 1)

These four items must be resolved before any Phase 1 code lands; they cross every layer and conflicting assumptions break the build. Default answers below; the operator confirms or overrides during the Phase 0 kickoff and updates the **Decision log** at the bottom of this doc with the final choice.

| # | Decision | Default | Affects |
| --- | --- | --- | --- |
| 1 | OAuth App vs. GitHub App | **OAuth App** (faster setup, no per-org install dance; revisit only if org admins block it) | GitHub registration steps; redirect URL configuration; device-flow opt-in toggle |
| 2 | Token contract: raw GH token vs. server-issued bearer | **Raw GH token everywhere** (per "Token contract" under "GitHub OAuth surfaces"; server returns the GitHub `access_token` from the callback as-is, and `Authorization: Bearer` carries it across all hops) | `auth.ts`, `enableAuthentication.ts`, `githubLogin.ts`, all `apiX.ts` clients, local Socket.IO `auth` handshake |
| 3 | Dev Tunnels access path (a) vs (b) | **Decided by Phase 0 spike** (path (a) preferred; fall back to (b) per the "Phase 0 decision gate" above) | happy-server scope (no Microsoft credential vs. service-principal config); `apiSocket.ts` token-acquisition step; `docs/security-model.md` content |
| 4 | Local WS port policy | **Stable random per machine** (chosen on first daemon boot, persisted in `~/.happy/machine.json`, re-used across daemon restarts; `devtunnel host -p $PORT` reads from there) | `localWsServer.ts` listen logic; `tunnel.ts` invocation; `machine.json` schema |

### Branching and rollout strategy

Because Happy is a daily-use system on the operator's BOOX tablets, the broken intermediate state between Phases 1 and 3 must not land on `main`. All work happens on a single feature branch with the new path layered **additively** before legacy code is removed:

- **Branch**: `github-auth-tunnel`. All phase commits land here; `main` stays releasable throughout.
- **Phase 1 lands additively**: new `/v1/machines/announce`, `/v1/machines`, `/v1/auth/github/*` routes ship alongside the existing relay/session routes. The legacy routes are *not* deleted in Phase 1's first commit; they remain registered so the operator's currently-running CLI and tablet keep working.
- **Phases 2–3 opt-in via env flag**: the CLI and app each read `HAPPY_USE_TUNNEL=1` (CLI process env / app `expo-constants` config). When set, the new tunnel/Socket.IO path runs; when unset, the legacy relay path runs. Operator runs both side-by-side on the BOOX tablets to validate the new path before flipping the default.
- **Final cutover commit**: after Phase 3's mechanical acceptance criteria pass *and* the Manual validation block succeeds on Air5C and TabXC, a single cleanup commit on the same branch (a) flips `HAPPY_USE_TUNNEL` default to `1`, (b) deletes the legacy relay/session/artifact/KV/feed/voice routes and Socket.IO server per the file-map "Delete entirely" lists, (c) removes the env-flag plumbing, (d) merges `github-auth-tunnel` to `main`. The acceptance criteria for Phase 1 (route 404s for deleted endpoints, no `Cannot find module` on bootstrap) become CI gates on this final commit, **not** on the Phase 1 first commit. Update each Phase 1 acceptance criterion accordingly: the `curl ... 404` checks (criterion #8) and the missing-module bootstrap check (criterion #2) only apply post-cutover.

**Phase 0 — devtunnel auth spike (1 day, no production code):**
- Stand up a throwaway Node WS server locally.
- `devtunnel host` it with the user's GitHub identity.
- From a second machine / RN sandbox, attempt to connect a WebSocket to the tunnel URL using only the user's GitHub bearer token. Validate path (a) above.
- Write the result (path (a) worked / failed, evidence, chosen branch) to `docs/spikes/devtunnel-auth-result.md` per the **Phase 0 decision gate** above. Phase 1 cannot start until this file exists and selects (a) or (b).
- **Exit criterion:** documented working WS round-trip from RN → tunnel → local Node gated by GitHub auth (path (a)), OR a documented failure of (a) plus a service-principal credential provisioned for path (b). No secret-key fallback either way.

**Phase 1 — happy-server demolition (server-only, 2-3 days):**

- ⚠️ **HUMAN STEP (operator-only — agents must NOT do this):** apply the `schema.prisma` diff below in `packages/happy-server/prisma/schema.prisma`, then run `pnpm migrate` (which invokes `prisma migrate dev`) inside `packages/happy-server` to generate the new migration directory under `prisma/migrations/`. Do **not** instruct an autonomous agent to edit `schema.prisma`, run `prisma migrate dev`, run `pnpm migrate`, or hand-author SQL under `prisma/migrations/`. Rationale: `packages/happy-server/CLAUDE.md` states "NEVER DO MIGRATION YOURSELF" and "Never create migrations yourself, it is can be done only by human." After the human commits the new migration directory, agents may resume Phase 1 work and may run `pnpm generate` (Prisma client regeneration) to pick up the new types.

  The exact schema diff for the operator (apply verbatim; this is the full content of `packages/happy-server/prisma/schema.prisma` after the change — drops are by removing the model blocks, reshapes are field-level edits):

  - **Delete entire model blocks** (these `model X { ... }` blocks are removed wholesale):
    - `model TerminalAuthRequest`
    - `model AccountAuthRequest`
    - `model Session`
    - `model SessionMessage`
    - `model AccessKey`
    - `model Artifact`
    - `model UserKVStore`
    - `model VoiceConversation`
    - `model ServiceAccountToken`
    - `model UsageReport` (its only readers — `usageHandler.ts` and `apiUsage.ts` — are deleted in Phase 1 and Phase 3 respectively; confirm with operator before dropping if Phase 3's "Delete Usage" disposition shifts to "Defer.")
    - `model UserFeedItem` (rationale: `feedRoutes.ts` is deleted, so no remaining writer or reader; the table becomes inert. Drop it together with `feedRoutes.ts`.)
    - `model AccountPushToken` (rationale: in the direct-WS model there is no server-side event source to push from, and the disposition for `apiPush.ts` / `pushRoutes.ts` in the file-map table is **delete**. Drop the table together with the route. If the operator instead chooses the "Defer + decision needed" branch in the disposition table — i.e. retain push for directory-heartbeat alerts — keep `AccountPushToken` and add it to the unchanged list at decision time.)

  - **`model Account`** — reshape to:
    ```prisma
    model Account {
        id            String      @id @default(cuid())
        githubUserId  String      @unique
        githubUser    GithubUser  @relation(fields: [githubUserId], references: [id])
        githubLogin   String
        name          String?
        avatarUrl     String?
        createdAt     DateTime    @default(now())
        lastSeenAt    DateTime    @default(now())
        updatedAt     DateTime    @updatedAt

        Machine           Machine[]
        UploadedFile      UploadedFile[]
        RelationshipsFrom UserRelationship[] @relation("RelationshipsFrom")
        RelationshipsTo   UserRelationship[] @relation("RelationshipsTo")
    }
    ```
    Removed fields vs. current schema: `publicKey`, `seq`, `feedSeq`, `settings`, `settingsVersion`, `firstName`, `lastName`, `username`, `avatar` (the JSON `ImageRef`), and the relations to deleted models (`Session`, `TerminalAuthRequest`, `AccountAuthRequest`, `UsageReport`, `ServiceAccountToken`, `Artifact`, `AccessKey`, `UserKVStore`, `VoiceConversation`, `UserFeedItem`, `AccountPushToken`). `githubUserId` becomes non-nullable (was `String?`).

  - **`model Machine`** — reshape to a directory entry:
    ```prisma
    model Machine {
        id                String   @id // client-chosen UUID
        accountId         String
        account           Account  @relation(fields: [accountId], references: [id])
        hostname          String?
        tunnelUrl         String?
        tunnelCreatedAt   DateTime?
        lastHeartbeatAt   DateTime @default(now())
        createdAt         DateTime @default(now())
        updatedAt         DateTime @updatedAt

        @@unique([accountId, id])
        @@index([accountId])
    }
    ```
    Removed fields vs. current schema: `metadata`, `metadataVersion`, `daemonState`, `daemonStateVersion`, `dataEncryptionKey`, `seq`, `active`, `lastActiveAt`, and the `accessKeys` relation (since `AccessKey` is dropped). The model name stays `Machine` for now — renaming to `MachineDirectoryEntry` is a follow-up rename that the operator can fold in if they prefer; the file map's `MachineDirectoryEntry` reference is logical, not a required Prisma model name.

  - **Unchanged models** (do not edit): `GithubUser`, `GithubOrganization`, `GlobalLock`, `RepeatKey`, `SimpleCache`, `UploadedFile` (kept for now; revisit if the file-upload feature has no remaining surface in Phase 3 and drop in Phase 4 cleanup), `UserRelationship` (pending the open-question outcome — see Decision log). The `GithubUser.token` column stays for now since `GithubUser` is still referenced by `Account.githubUser`; revisit during Phase 4 cleanup if it becomes orphaned.

  After applying the schema edit, the operator runs:
  ```bash
  cd packages/happy-server
  pnpm migrate            # generates prisma/migrations/<timestamp>_github_directory_reshape/
  pnpm generate           # regenerates Prisma client (agents may also run this)
  ```
  The operator commits both the `schema.prisma` change and the generated `prisma/migrations/` directory in one commit before unblocking Phase 1 agent work.

- New routes: `POST /v1/machines/announce`, `GET /v1/machines`, `DELETE /v1/machines/:id`.
- New auth middleware (`githubBearer.ts`).
- Keep `/v1/auth/github/*` for the app's web OAuth flow.
- Delete relay handlers + Socket.IO entirely.
- **Update API server bootstrap** at `packages/happy-server/sources/app/api/api.ts`: remove the imports and `Routes` registrations for every route file deleted above — `pushRoutes`, `sessionRoutes`, `connectRoutes` (after its handlers move to `authRoutes`/are deleted per the "Heavily modify" disposition), `voiceRoutes`, `artifactsRoutes`, `accessKeysRoutes`, `feedRoutes`, `kvRoutes`, `v3SessionRoutes`, and the `startSocket(typed)` call (Socket.IO is gone). Without this step the server fails to start because it tries to import deleted modules. The post-Phase-1 bootstrap registers only: `authRoutes`, `accountRoutes` (reshaped), `machinesRoutes` (directory), `devRoutes`, `versionRoutes`, `userRoutes`. (Re-evaluate `userRoutes` and `pushRoutes` per the Phase 3 disposition table — `pushRoutes` is "Defer + decision needed.")
- Acceptance criteria (mechanical — pass/fail in CI or a single shell session, no human in the loop):
  1. `pnpm --filter happy-server build` succeeds with zero TypeScript errors.
  2. `pnpm --filter happy-server standalone:dev` boots and stays up for ≥10 s with no `Cannot find module` errors against any of the deleted route files (`pushRoutes`, `sessionRoutes`, `connectRoutes`, `voiceRoutes`, `artifactsRoutes`, `accessKeysRoutes`, `feedRoutes`, `kvRoutes`, `v3SessionRoutes`) and no `startSocket` call in the bootstrap log.
  3. `POST /v1/machines/announce` with a valid GitHub bearer and a JSON body `{ machineId, hostname, tunnelUrl }` returns 200 and creates exactly one row in the `Machine` table for that account.
  4. `GET /v1/machines` with the same bearer returns 200 and a JSON array containing the machine just announced.
  5. `DELETE /v1/machines/:id` with the same bearer returns 204 and removes the row; a follow-up `GET /v1/machines` no longer lists it.
  6. `GET /v1/machines` with **no** Authorization header returns 401.
  7. `GET /v1/machines` with `Authorization: Bearer ghp_invalid` (or any GH token revoked via `https://api.github.com/applications/:client_id/grant`) returns 401 — no 500, no stale-cache 200.
  8. `curl` against any deleted endpoint (`POST /v1/auth/request`, `GET /v1/sessions`, `POST /v1/usage/query`, `/v1/connect/:vendor/register`, `/v1/connect/:vendor/token`, `/v1/feed`, `/v1/kv`, `/v1/artifacts`) returns 404 — confirming the route is genuinely unregistered, not just dead-coded.
  9. `prisma migrate status` reports clean (the operator-applied migration is the head); `pnpm --filter happy-server generate` exits 0.

**Phase 2 — happy-cli rebuild (4-5 days):**
- GitHub device flow (`src/auth/githubDeviceFlow.ts`).
- Add `socket.io` (server library) to `packages/happy-cli/package.json` (only `socket.io-client` is present today).
- Local Socket.IO server (`src/transport/localWsServer.ts`) — re-host the existing `/v1/updates` protocol verbatim by lifting the relevant handlers (`rpcHandler.ts`, `sessionUpdateHandler.ts`, `sessionMessageRangeHandler.ts`, `machineUpdateHandler.ts`, `pingHandler.ts`) from `packages/happy-server/sources/app/api/socket/` and re-pointing their state at in-process / on-disk storage instead of Prisma. Same named events, same `emitWithAck` RPC contract, same auth-handshake shape. **No protocol redesign.** If the lift surfaces a server-only dependency (Redis pub/sub via `eventRouter.ts`, or DB-backed sequence numbers) that doesn't translate, that handler's behavior must be replicated in CLI process memory + `~/.happy/` files — call it out in code review rather than diverging the wire shape.
- Devtunnel orchestration (`src/transport/tunnel.ts`).
- Daemon owns lifecycle + announces to happy-server.
- Acceptance criteria (mechanical — runnable on any dev machine with `devtunnel` on PATH and a GitHub account, no specific physical hardware required):
  1. `pnpm --filter happy-cli build` succeeds with zero TypeScript errors.
  2. `pnpm --filter happy-cli typecheck` passes; `pnpm --filter happy-cli test` passes.
  3. `socket.io` (server) appears in `packages/happy-cli/package.json` `dependencies`; `pnpm --filter happy-cli list socket.io` shows a single resolved version.
  4. `devtunnel --version` preflight in `src/transport/tunnel.ts` exits 0 when the binary is on PATH, and exits non-zero with a message pointing at the install instructions when it is not — covered by a unit test that stubs `child_process.spawn`.
  5. `happy auth` (the existing CLI auth command at `packages/happy-cli/src/commands/auth.ts`) reaches the GitHub Device Flow path and writes `~/.happy/credentials.json` with mode `0600` on POSIX (verify via `fs.statSync().mode & 0o777 === 0o600`); on Windows it writes the same file under the user profile and exits 0. The legacy libsodium signature-challenge path no longer runs (assert via test that `authGetToken` is not exported).
  6. `happy connect <vendor>` writes `~/.happy/vendor-tokens.json` (mode `0600` on POSIX); the command no longer issues an HTTP request to `/v1/connect/:vendor/register` — assert via a test that intercepts `fetch`.
  7. Daemon boot end-to-end on the developer's local machine (no second device): start the daemon, observe (a) `localWsServer` listens on the per-machine port from `~/.happy/machine.json`, (b) `devtunnel host` child process is spawned and a `*.tunnels.api.visualstudio.com` URL is captured from its stdout, (c) `POST /v1/machines/announce` to the local happy-server returns 200, (d) a follow-up `GET /v1/machines` lists the new entry within 5 s.
  8. Tunnel-URL-rotation regression: kill the `devtunnel host` process; confirm the daemon detects the closed tunnel within ≤60 s, spawns a new `devtunnel host`, captures the new URL, and re-announces it via `POST /v1/machines/announce`. Assert that `GET /v1/machines` for the same `machineId` returns the new `tunnelUrl`, not the stale one.
  9. Stale directory entry recovery: stop the daemon entirely (no graceful `DELETE`); after the configured stale threshold (`lastHeartbeatAt` older than the threshold), confirm `GET /v1/machines` either omits the entry or marks it as offline per the directory contract.
  10. Lifted handler protocol parity: a `socket.io-client` test harness connecting to the tunnel URL with a valid GitHub bearer in `auth.token` can (a) round-trip an `rpc-call` for `/v3/sessions/:id/messages` and receive an ack with the same response shape the existing happy-server returned, and (b) receive an `update` event after another client emits a `sessionUpdate`. Wire shape diffed byte-for-byte against the captured-from-prod fixtures in `packages/happy-cli/src/transport/__fixtures__/`.
  11. Auth rejection on the local Socket.IO server: connecting with a missing or malformed `auth.token` is closed with the existing `auth_failed` event before the connection upgrades.

**Phase 3 — happy-app rebuild (3-4 days):**
- GitHub OAuth via `expo-web-browser.openAuthSessionAsync` + `expo-linking` + `expo-crypto` (all already installed — no new dep).
- Login + machine picker screens.
- WS client points at tunnel URL with the GH token passed in the Socket.IO `auth` handshake payload (per the "Token contract" — *not* a subprotocol).
- Delete QR / restore / encryption directories.
- Acceptance criteria (mechanical — runnable from a clean checkout without a physical device; the on-device run lives under "Manual validation" below):
  1. `pnpm --filter happy-app typecheck` passes; `pnpm --filter happy-app build` succeeds with zero TypeScript errors; `pnpm --filter happy-app test` passes.
  2. QR / restore / encryption surface fully removed — verified by all of:
     - `packages/happy-app/sources/app/(app)/restore/` does not exist (assert via Glob / `fs.existsSync`).
     - `packages/happy-app/sources/auth/authQRStart.ts`, `authQRWait.ts` do not exist.
     - `packages/happy-app/sources/components/qr/` does not exist.
     - `packages/happy-app/sources/sync/encryption/` does not exist.
     - A grep across `packages/happy-app/sources/` for `secretKey`, `secretKeyBackup`, `formatSecretKeyForBackup`, `QRCode`, `authQR`, `restore/` returns zero hits in non-test source files.
     - `expo-router` route inventory (e.g. parse `app/(app)/` directory tree at build time) contains no entries matching `restore/*`.
     - `packages/happy-app/sources/app/(app)/settings/account.tsx` no longer renders any row whose title comes from `t('settingsAccount.secretKey')` or `t('settingsAccount.secretKeyLabel')` — assert by snapshot test of the rendered settings screen, or by grep for those translation keys returning zero hits in `account.tsx`.
     - `qrcode`, `@types/qrcode`, `@more-tech/react-native-libsodium`, `libsodium-wrappers`, `@types/libsodium-wrappers` are absent from `packages/happy-app/package.json` (`pnpm --filter happy-app why <pkg>` returns "is not in the dependency tree" for each).
  3. `tokenStorage.ts` persists only `{ githubAccessToken, login }` and exposes no `secret` getter — assert via type-level test (`Expect<Equal<keyof StoredTokens, 'githubAccessToken' | 'login'>>`).
  4. Login screen renders a single "Sign in with GitHub" CTA (assert via component test) and the auth flow uses `WebBrowser.openAuthSessionAsync` with the redirect URL `happy://oauth/github/callback` (assert by spy / mock — no `expo-auth-session` import, no QR scanner mount).
  5. Machine picker screen, when given a mocked `GET /v1/machines` response, lists each machine with its online/offline state and last-seen, and tapping a machine routes to a chat URL containing the selected machine's `tunnelUrl` — assert via React Native Testing Library.
  6. `apiSocket.ts` `connect(machineEntry)` opens `socket.io-client` against `${machineEntry.tunnelUrl}` (path `/v1/updates`) with `auth: { token: ghToken, kind: 'machine-scoped' }` — assert via spy on `io()` constructor; assert no `Sec-WebSocket-Protocol` is set anywhere in the codebase via grep.
  7. Tunnel-URL-rotation resilience on the app side: with a mocked directory that returns a new `tunnelUrl` for the same `machineId`, the app reconnects to the new URL within ≤10 s of the existing socket erroring out and does not pin to the stale URL.
  8. 401 on revoked token (app side): when the local Socket.IO test server replies with `auth_failed` on connect or any REST call returns 401, the app surfaces the sign-out / re-auth path within ≤2 s and clears `tokenStorage` — assert via integration test against a mock server.
  9. Direct-`fetch` REST call sites in `sync.ts` and `ops.ts` listed under "Session and history REST surface" target the active machine's `tunnelUrl` (not `getServerUrl()`); the only `fetch` against `getServerUrl()` that survives is `GET /v1/machines` — assert via grep / AST of `sync.ts` and `ops.ts`.
  10. Disposition table sweep — for every "Delete" row in the feature table (Artifacts, Feed, KV, Push, Usage, Voice), the corresponding `apiX.ts`, screens, navigator entries, reducer slices, and `package.json` deps are absent — assert via Glob + grep for each.

**Phase 4 — docs + skills (1 day):**
- Update markdown listed below.
- Update affected `.agents/skills/`.

Total: ~1.5–2 weeks of focused work after the Phase 0 spike succeeds (Phase 2 widened from 3-4 to 4-5 days to accommodate the Socket.IO-server lift and the in-process re-implementation of any DB-backed state in the lifted handlers).

### Manual validation (human-only — autonomous agents must NOT attempt these)

These checks require physical hardware and a human eye on the result. They are **not** acceptance criteria for the per-phase mechanical checklists above; they are a release-gate the operator runs before tagging the cutover. Agents should mark them as deferred / skipped.

- **Phase 2 on-device:** install `happy-dev` on the operator's BOOX dev box (per `cli_dev_iteration.md` — use `happy-dev` + `pnpm dev:daemon:*`, not a fresh release). Confirm the daemon comes up, the directory entry shows up in the operator's account, and `curl https://<tunnel>.tunnels.api.visualstudio.com/health` (or the `socket.io-client` smoke harness from the Phase 2 mechanical checklist, run from the operator's laptop) succeeds against the live tunnel.
- **Phase 3 on-device:** install via `pnpm release:android` to **BOOX Air5C** (primary) and **BOOX TabXC** (secondary) per the `devices.md` memory, using `adb -s $DEV_TABLET` resolved by `model:Air5C` / `model:TabXC` (do not hard-code serials). Read `.agents/skills/happy-tablet-iterate/SKILL.md` first per `metro_dev_default.md`. Walk through: (a) GitHub OAuth login round-trips successfully on the BOOX launcher (BOOX has a non-standard launcher that has previously interfered with deep-link callbacks — confirm `happy://oauth/github/callback` resolves), (b) the machine picker lists the dev machine, (c) opening the machine starts a chat against the tunnel URL, (d) a Codex prompt round-trips: send a message, observe a Codex assistant response stream back end-to-end. Capture screenshots of any BOOX-specific rendering issues.
- **Phase 3 token-revocation drill:** revoke the test GitHub token via `https://github.com/settings/applications` and confirm the app shows the re-auth path within ~one heartbeat interval. This validates the 401-revocation behavior end-to-end through the real GitHub identity layer (the mechanical Phase 3 check #8 only validates the app-side handling against a mock server).

---

## Documentation to update (per global CLAUDE.md guidance)

All paths under `C:\\harness-efforts\\codexu\`:

- `README.md` — update high-level pitch: drop "end-to-end encrypted", add "sign in with GitHub, runs on your machine via a Microsoft Dev Tunnel."
- `docs/encryption.md` — **delete** or convert to a one-paragraph stub pointing at `docs/security-model.md` (new) which describes the GitHub-auth + tunnel transport trust boundary.
- `docs/security-model.md` — **new** doc replacing `encryption.md`. Document threat model: trusted = GitHub identity provider, Microsoft tunnel TLS termination, the user's local machine. Untrusted = network. Explicitly call out that happy-server now sees only directory metadata.
- `docs/api.md` — remove all relay/session/artifact/kv endpoints; document the directory + auth endpoints.
- `docs/backend-architecture.md` — rewrite around "directory service" model.
- `docs/cli-architecture.md` — add: local WS server, devtunnel orchestration, GitHub device-flow auth.
- `docs/plans/codex-seamless-multi-device.md` and `docs/plans/codex-fork-extension-strategy.md` — flag any sections that assumed the relay/E2E model; update or add forward-references to this plan.
- `.agents/skills/release/SKILL.md` — remove QR-code pairing references.
- `.agents/skills/happy-tablet-iterate/SKILL.md` — remove "scan QR to pair" steps; replace with "sign in with GitHub on tablet, dev machine should already be in the directory."
- `.agents/skills/happy-cli-iterate-no-release/SKILL.md` — note the new dependency on `devtunnel` CLI being on PATH.
- `.agents/skills/happy-release-to-fork/SKILL.md` (per `release_via_github.md` memory) — note the breaking change in release notes; recommend a major version bump.

---

## Common mistakes / confusion points (per global CLAUDE.md guidance)

Things future agents will trip over working on this plan:

1. **`code tunnel` ≠ `devtunnel`.** As above. We use `devtunnel`. Don't paste `code tunnel` snippets into the implementation.

2. **Browser/RN WebSocket APIs can't set headers.** Don't write `headers: { Authorization: ... }` on the app's `WebSocket` constructor — it'll silently fail on RN and throw on web. **In this plan we sidestep that limitation by using Socket.IO**, which carries the GH token in its `auth` handshake payload (see "Token contract" under "GitHub OAuth surfaces" and the `apiSocket.ts` change). The classic `Sec-WebSocket-Protocol` subprotocol workaround only applies if you ever drop down to plain `ws` — don't reach for it on the Socket.IO path; the two patterns are mutually exclusive and mixing them will look like a working handshake on one side and a missing token on the other.

3. **`devtunnel host` is interactive by default** — login state is per-user-profile. The CLI must verify auth state non-interactively (`devtunnel user show --json`) before invoking `host`, and surface a clear error pointing the user at `devtunnel user login github`. Don't hide this behind a "did the spawn fail?" code path.

4. **GitHub Device Flow apps must opt-in.** The OAuth app needs "Enable Device Flow" toggled in GitHub settings, otherwise `/login/device/code` returns 404. The first agent to set this up will spend an hour on this if not warned.

5. **Dev Tunnels close on idle.** ~24h max-idle; expect re-creates. The CLI's daemon must handle URL changes — the directory entry's `tunnelUrl` is mutable. happy-app must be resilient to "the URL I have is stale" → re-fetch directory and reconnect.

6. **Origin-header rewriting.** The tunnel relay rewrites Origin. If the local WS server checks `req.headers.origin`, it will reject tunnel-forwarded connections. Either disable the check or whitelist `*.tunnels.api.visualstudio.com`.

7. **Tunnel-relay token visibility.** The GH token rides the Socket.IO `auth` handshake payload (per the "Token contract"), which goes through the Microsoft tunnel relay's TLS termination. The relay therefore sees the bearer in cleartext on its side of the TLS terminator. This is acceptable per the "drop E2E" decision but document it in `docs/security-model.md` so it's not a surprise later. (The older `Sec-WebSocket-Protocol` subprotocol pattern has the same exposure — both are equivalent here; we picked Socket.IO `auth` for compatibility, not for confidentiality.)

8. **happy-server data drop is destructive.** The Phase 1 migration drops every existing user's session history. Ship it on a fresh server / blow away the dev DB, and put a one-line warning in the migration README. Don't try to write a "convert encrypted blobs to plaintext" migration — it would require client-side keys the server doesn't have.

9. **BOOX tablets and `WebBrowser.openAuthSessionAsync`.** BOOX is Android, but uses an unusual launcher that can interfere with deep-link callbacks. Test the GitHub OAuth callback specifically on Air5C and TabXC (`devices.md` memory) before declaring Phase 3 done. The flow uses `expo-web-browser`'s `openAuthSessionAsync` directly (not `expo-auth-session`, which is deliberately not added — see Phase 3 file map), with `expo-linking` parsing the `happy://oauth/github/callback` redirect.

10. **Don't run upstream `pnpm ota` / `release-it`.** Per `release_via_github.md` memory: this is a fork. Use the `happy-release-to-fork` skill for happy-cli, `pnpm release:android` for happy-app (Firebase App Distribution), Windows-service restart for happy-server.

11. **Daemon vs. fresh-release inner loop.** Per `cli_dev_iteration.md`: while iterating on Phase 2 use `happy-dev` + `pnpm dev:daemon:*`, not full GitHub releases.

12. **Metro mode for tablet testing.** Per `metro_dev_default.md`: when validating Phase 3 on tablet, read `happy-tablet-iterate/SKILL.md` first; `pnpm start` without `--dev-client` lands on DevLauncherErrorActivity.

---

## Out of scope (explicitly)

- **Multi-tenant / multi-user-per-machine.** A machine is owned by exactly one GitHub identity in this plan. Sharing a dev box is a follow-up.
- **Org/team gating.** No "only members of org X can connect." Plain personal-account GitHub auth.
- **Voice (`VoiceConversation` table).** Drop for now; reintroduce as a separate plan if/when LiveKit work resumes.
- **Friend graph (`UserRelationship`).** Open question — confirm with user during Phase 1 whether to keep or drop.
- **Offline-first behavior.** The app cannot reach the dev machine when the tunnel is down. We are explicitly trading the relay's offline-buffering for simplicity. Any offline UX is a follow-up.
- **Backwards compatibility with existing installs.** Forced re-onboarding for everyone. Document in release notes.

---

## Decision log (record as the plan moves into implementation)

The four blocker items have been pulled into the **Pre-implementation decisions** table at the top of the Phasing section with default answers — they must be confirmed/overridden before Phase 1 code lands. Items remaining here are post-implementation tradeoffs that can stay open through Phase 4:

- [ ] Keep `UserRelationship` (friend graph) or drop? (If dropped, fold into the Phase 1 schema diff.)
- [ ] Bundle `devtunnel` install instructions in the CLI's first-run output, or only print on missing-binary error?
- [ ] Reintroduce push (`apiPush.ts` / `pushRoutes.ts`) for directory-heartbeat alerts in a follow-up — yes/no/when?
- [ ] Drop `UploadedFile` in Phase 4 cleanup if no remaining uploader/reader exists in the app.
- [ ] Phase 0 outcome (path a/b) recorded in `docs/spikes/devtunnel-auth-result.md`.

Update this section as decisions are made; don't leave it as "TBD" by the end of Phase 4.
