# Server-Per-Machine Architecture Investigation

**Status:** open research, ready for agent assignment
**Created:** 2026-05-09
**Owner:** TBD (assignee fills in)
**Worktree:** main repo (`C:\harness-efforts\codexu`); this is a research deliverable, not a code change. The assignee should branch off `main` only if they need to write example code or run empirical experiments under `experiments/`.
**Supersedes (if accepted):** `docs/research/tunnel-transport-recommendation.md`

---

## TL;DR

Happy is being redesigned from a multi-tenant cloud relay (`app.happy.engineering` mediating many users) into a **server-per-machine** topology where every codex-running PC embeds its own happy-server inside the happy-cli process and exposes itself to mobile via a Microsoft Dev Tunnel. Cloud relay is deprecated. The Happy bearer/auth code path is removed (single-tenant per machine — no userId partitioning needed). E2E encryption survives via TOFU pubkey pinning per machine. Mobile pairs by listing tunnels owned by the user's GitHub identity (no QR). Push notifications go directly from each machine to Expo's HTTP push API. Mobile presents a unified view of all the user's machines via parallel connections.

This investigation produces a written recommendation that lets the team commit to (or amend) the architecture before implementation begins. **No code changes from this investigation** beyond optional empirical experiments.

---

## Architecture (Locked Decisions From Pre-Investigation Conversation)

These nine decisions are locked unless the assignee surfaces a blocking technical reason to revisit:

| # | Decision | Pick | Rationale |
|---|---|---|---|
| 1 | Topology | **Server-per-machine** — every codex-running PC runs its own happy-server. 2 PCs = 2 servers + 2 tunnels. | Eliminates multi-tenant complexity; aligns with "tunnel = security boundary" model. |
| 2 | Code path | **(ii) Full simplification** — bearer code removed, server rewritten single-tenant. Not "ship multi-tenant server, run one user per instance" (which would leave dead code). | Simpler, smaller surface, no dual-mode flag. |
| 3 | Pairing | **No QR.** Mobile uses GitHub device flow → lists tunnels owned by that GitHub identity → tunnel ACL gates membership → discovered tunnels are implicitly trusted as "mine." | Tunnel auth IS the pairing proof. Removes QR scan UX entirely. |
| 4 | E2E | **TOFU (Trust On First Use).** First connect to a machine: machine publishes long-term pubkey over the tunneled handshake; mobile stores `(machine_id, pubkey)` in SecureStore. Future connects verify; mismatch warns user. | Preserves mobile↔machine confidentiality against tunnel provider (Microsoft) without out-of-band channel. SSH model. |
| 5 | Cloud relay | **Deprecated.** `app.happy.engineering` is shut down or frozen. No fallback to multi-tenant. | Server-per-machine subsumes the use case; running both is wasted effort. |
| 6 | Machine name | Display priority: **user-override (mobile-local) > devtunnel `--description` > `os.hostname()`**. | Operator sets descriptive name on host; user can rename in mobile UI without server changes. |
| 7 | Push | **N1: each machine pushes directly via Expo HTTP API.** Local happy-server holds (or no longer needs) `EXPO_ACCESS_TOKEN`; calls `POST https://exp.host/--/api/v2/push/send` with the user's `ExponentPushToken`. No shared push gateway. | Expo abstracts APNs/FCM; no per-operator cert setup. Today's push flow already uses Expo. |
| 8 | Packaging | **P1: happy-server library imported by happy-cli, runs in-process** (same Node.js process as codex/CLI). | Simplest. Crash-isolation deferred (P2) or merge (P3) is a follow-up. |
| 9 | Mobile UX | **U2: client-side aggregation.** Mobile maintains parallel connections to all online machines. Sessions across all machines merged into one list, tagged per-machine. Offline machines contribute cached metadata only. | Closer to today's unified-list UX. Battery cost acceptable for typical 1–3 machines per user. |

### Implicit Decisions — Proposed Defaults (Assignee should validate)

These were proposed in conversation but not explicitly confirmed. Treat as defaults; flag if a research finding contradicts them.

| # | Decision | Default |
|---|---|---|
| I-1 | happy-app web/desktop role | **Clients only.** Don't run codex, don't host tunnels. Same code path as mobile (just different platform). Tauri desktop, web — all "tunnel clients." |
| I-2 | Migration from cloud-relay users | **Hard reset.** Existing users on `app.happy.engineering` lose cloud-stored history when they switch to self-hosted. No export/import tooling. Acceptable for the fork; cloud users get a heads-up. |
| I-3 | Tunnel lifecycle | **Named tunnels** (stable URL across machine reboots). Operator runs `devtunnel host` once, gets a stable tunnel ID; happy-cli manages start/stop with that ID. Avoids mobile re-discovery on every boot. |
| I-4 | Package structure | **`packages/happy-server` becomes a library-only package consumed by `packages/happy-cli`.** Both packages stay. Merging into one (P3) is a follow-up cleanup. |
| I-5 | Multi-instance on same machine | **One shared happy-server per machine.** If user runs codex twice on PC1, one server multiplexes both codex sessions on a single port + single tunnel. Not one server per codex process. |

---

## Why This Matters

The prior recommendation at `docs/research/tunnel-transport-recommendation.md` assumed:

- happy-server stays multi-tenant (user partitioning, bearer auth, account creation, OAuth proxy routes).
- Tunnel is a transport layer **on top of** the existing server, exposing it via Dev Tunnels.
- happy-cli connects to a separate happy-server (cloud or self-hosted).

The user's three follow-up decisions (`server-per-user → server-per-machine → kill bearer entirely → no QR → TOFU`) collapse most of that. The new architecture deletes:

- All bearer auth code (`auth/auth*.ts` axios files, server `auth.verifyToken`, `enableAuthentication.ts` REST gate, account/user table partitioning, `tokenStorage.ts` for happy bearer — pairing keypair becomes the only credential).
- The OAuth proxy routes the prior rec proposed adding.
- The cloud relay deployment surface (`app.happy.engineering`).
- Multi-tenant assumptions in the database schema.
- The recommendation's "central transport layer" rewrite of 16 mobile call sites — many of those callers are auth files that disappear entirely.
- The deep-link `happy://` OAuth callback handler (no third-party OAuth callback flow needed; mobile uses GitHub device flow which doesn't redirect to the app).

And adds:

- happy-server-as-library + happy-cli embedding it (P1).
- TOFU public-key pinning for mobile↔machine E2E.
- Mobile multi-machine UX (parallel connections, aggregated session list).
- Per-machine direct Expo push from happy-server.
- New packaging/deployment story for happy-cli (it now runs a server too).

This is large enough that a fresh investigation pass is warranted. The prior recommendation's research is partially obsolete; this MD is the new source of truth.

---

## Background — Read First

The assignee should read these files before drafting recommendations. Paths are relative to repo root.

### Conversation context (the chain that produced this investigation)

- `docs/research/tunnel-transport-investigation.md` — original (now-superseded) investigation.
- `docs/research/tunnel-transport-recommendation.md` — first-round recommendation. Architecture is wrong now, but **codebase facts** (file paths, call-site counts, i18n shape, test infra) are still accurate.
- `.ralph/archive/plan-with-ralph-aborted-20260509-022443/` — research artifacts from the aborted plan-with-ralph run. Contains:
  - `research-brief.md` — consolidated codebase research (still useful for facts).
  - `codex-research.txt` — Codex's codebase research (correct file paths surfaced here).
  - `copilot-research.txt` — Copilot's codebase research.
  - `feature-request.txt` — the obsolete feature description.
- `.ralph/archive/phase-0-devtunnel-auth-spike-superseded-20260508/` — earlier devtunnel spike, blocked at the preflight identity check.
- `.ralph/archive/tunnel-transport-investigation-completed-20260508/` — research run that produced the first recommendation.

### Current codebase (the things that change)

**Mobile (happy-app):**
- `packages/happy-app/sources/sync/sync.ts` — main sync coordinator. `syncInit()` at lines ~2770–2797 is the bootstrap entry point. Currently 6 direct `fetch()` callers; many will be deleted (auth-related) or rewired (transport-related).
- `packages/happy-app/sources/sync/apiSocket.ts` — Socket.IO client + `request()` helper at line ~207. Lines 76–88 set up `io()` with `auth: { token, clientType, happyClient }`; bearer disappears, `extraHeaders` for tunnel JWT appears.
- `packages/happy-app/sources/sync/serverConfig.ts` — current single `getServerUrl()`; rewrites to per-machine selection.
- `packages/happy-app/sources/sync/persistence.ts` — MMKV helpers.
- `packages/happy-app/sources/sync/api*.ts` (apiArtifacts, apiFeed, apiFriends, apiGithub, apiKv, apiPush, apiServices, apiUsage, apiVoice) — REST callers. Most survive (data-plane), some change shape.
- `packages/happy-app/sources/sync/apiPush.ts` — push token registration; **registration target shifts from cloud server to per-machine servers** (mobile registers token with each machine it pairs with).
- `packages/happy-app/sources/auth/authQRStart.ts`, `authQRWait.ts`, `authGetToken.ts`, `authApprove.ts`, `authAccountApprove.ts` — **all 5 deleted** in the new model. No bearer to mint.
- `packages/happy-app/sources/auth/tokenStorage.ts` — currently stores happy bearer + secret. New role: stores per-machine TOFU pubkey map (`{ machineId → pubkey }`) + per-machine E2E session keys + GitHub `ghu_` token. Significant rewrite.
- `packages/happy-app/sources/app/_layout.tsx` lines 225–259 — bootstrap. Inserts machine-discovery + connection logic. Deletes pairing flow.
- `packages/happy-app/sources/text/_default.ts`, `_all.ts`, `translations.test.ts`, `translations/{en,ru,pl,es,ca,it,pt,ja,zh-Hans,zh-Hant}.ts` — i18n target dirs. New strings for: machine discovery flow, machine picker, TOFU pubkey-mismatch warning, "machine offline" states, multi-machine session list.
- Tauri desktop entry (per `pnpm tauri:dev` script in CLAUDE.md) — affected if web/desktop is in scope as a client.

**Server (happy-server):**
- `packages/happy-server/sources/app/api/api.ts` — Fastify + Socket.IO entry. Becomes a library export.
- `packages/happy-server/sources/app/api/socket.ts` lines 83–122 — Socket.IO handshake auth. **`auth.verifyToken()` removed; `socket.data.userId` no longer needed (single-tenant)**. New: TOFU pubkey publication on first connect.
- `packages/happy-server/sources/app/api/utils/enableAuthentication.ts` — REST `Authorization: Bearer` gate. **Removed.**
- `packages/happy-server/sources/app/api/routes/connectRoutes.ts` — GitHub OAuth proxy routes. **Most/all deleted** in new model. The `GITHUB_REDIRECT_URL` vs `GITHUB_REDIRECT_URI` bug becomes moot.
- `packages/happy-server/sources/app/api/routes/pushRoutes.ts` — push token registration. Becomes per-machine; `accountId` partitioning removed.
- `packages/happy-server/prisma/schema.prisma` — remove `Account`/`User`/`GithubUser`/`AccountPushToken.accountId` partitioning. Drop multi-tenant constraints. Or: rewrite to a flat single-tenant schema entirely (probably cleaner).
- `packages/happy-server/sources/storage/db.ts` — DB client. PGlite already supported (`pnpm standalone:dev`); becomes the only mode.
- `packages/happy-server/sources/main.ts` — entry point. Becomes a library export.
- All other server files reviewed for "does this assume multi-tenant?" — likely many small simplifications.

**CLI (happy-cli):**
- `packages/happy-cli/src/` — currently a client of remote happy-server. Becomes a host: starts happy-server in-process at boot. New responsibilities: tunnel lifecycle (`devtunnel host` start/stop), server-side TOFU keypair generation + persistence, push token forwarding (mobile registers with the machine, machine forwards to Expo).
- `packages/happy-cli/src/ui/auth.ts` — current Ed25519 keypair generation for QR pairing. Reused or repurposed for TOFU keypair generation.

**Wire format:**
- `packages/happy-wire/` — protocol schemas. Some may need versioning bumps for the new handshake (TOFU pubkey publication + verify).

**Build / deployment:**
- `pnpm-workspace.yaml`, `package.json` per package — dependency restructure (happy-cli depends on happy-server).
- `Dockerfile.server` — likely deprecated (no central server to deploy).
- `Dockerfile`, `Dockerfile.webapp` — unaffected if mobile/web are clients only.

### Adjacent docs that may inform tradeoffs

- `docs/encryption.md` — current E2E layer (XSalsa20-Poly1305 + AES-256-GCM). The TOFU pubkey is a new addition to this; document the integration.
- `docs/protocol.md`, `docs/happy-wire.md` — wire format.
- `docs/realtime-sync-and-rpc.md` — realtime channel.
- `docs/session-protocol.md`, `docs/session-protocol-claude.md` — session protocol.
- `docs/user-identity.md` — current identity model (substantially changes).
- `docs/backend-architecture.md` — server-side architecture.
- `docs/deployment.md` — deployment doc, must be rewritten for self-hosted-per-machine.
- `docs/multi-process.md` — CLI multi-process model; relevant for I-5 (one shared server per machine).
- `docs/3dparty.md` — third-party deps (Expo for push, Dev Tunnels for transport).

### Empirical prior art (to reuse)

- `experiments/tunnel-discovery/` — first-round empirical validation of GitHub device flow + Dev Tunnels API + connect JWT + Socket.IO with `extraHeaders`. Reuse the API call patterns; do not reuse the multi-tenant assumptions.

---

## Research Questions

Each must be answered with concrete yes/no + evidence (file path, line number, command output, doc link). The deliverable should answer all of these.

### Q1 — Library-mode happy-server (P1 packaging)

Can happy-server's Fastify + Socket.IO setup be packaged as a library that happy-cli starts in-process?

1. Does `packages/happy-server/sources/main.ts` cleanly separate "create app" from "listen()"? If not, what refactoring is needed?
2. Are there top-level side effects (env-var reads, global singletons) that block multiple-instance or reload-in-place semantics?
3. PGlite as the only database backend — already validated by `pnpm standalone:dev`. Confirm no implicit assumptions of external Postgres elsewhere in the code.
4. Port selection: stable random per-machine? `~/.happy/machine.json` was proposed earlier (locked default #4 from the original Phase 0 plan). Reuse or revisit?
5. Logging: server-side logs go to `~/.happy/logs/` per machine. What about the existing `DANGEROUSLY_LOG_TO_SERVER_FOR_AI_AUTO_DEBUGGING` flag — does it still make sense in the per-machine model?

### Q2 — Single-tenant database schema

What does the simplified schema look like?

1. Tables to drop entirely: `Account`, `User`, `GithubUser`, `AccountPushToken` (replaced by a flat `PushToken`?).
2. Tables to denormalize: `Session.userId`, `Machine.userId`, `KV.userId` columns gone (everything is the operator's). Or replaced with a constant `OPERATOR` value? Or column simply dropped?
3. Existing happy-server has a `Machine` table. In the new model **every server IS a machine** — does the `Machine` table still make sense? Probably renamed to `Project` or similar, or dropped entirely.
4. Migration strategy: Prisma migration from current schema, or fresh `init` migration on a clean DB? Given hard-reset migration policy (I-2), fresh init is fine.
5. What does `pnpm standalone:dev` look like in the new model — does it still spin up an example user, or does it just run the server-per-machine bare?

### Q3 — TOFU public-key handshake

How does the mobile↔machine TOFU exchange concretely work?

1. **Server-side keypair:** what algorithm (Ed25519 like current Happy pairing? X25519? Both?). Stored where on disk? `~/.happy/server-key.{pub,priv}`? Persisted across reboots? What if the operator deletes it (key rotation = forced re-trust on all paired mobiles)?
2. **Handshake flow:** mobile connects to tunnel → first message exchanged is server pubkey + machine_id. Mobile checks `tunnel-ACL-identity == my GitHub identity` → if yes, store `(machine_id, pubkey)`. Future connects: mobile presents request signed with mobile's keypair; server verifies. Diagram the exact sequence.
3. **Pubkey storage on mobile:** SecureStore (per existing happy-app pattern). Schema: `{ machineId: { pubkey, firstSeenAt, displayName } }`. Confirm SecureStore can hold the volume for N machines.
4. **Mismatch on reconnect:** server pubkey changed mid-life. UX: warn user, options "Trust new key" / "Don't trust this machine anymore." How does the warning surface relative to other modal flows?
5. **First-connect MITM window:** Microsoft (tunnel provider) could in principle MITM the very first connection to a new machine. Documented as accepted risk, or do we add a stronger first-connect verification (e.g. operator displays pubkey fingerprint on terminal, mobile shows fingerprint, user manually compares)? If yes, this re-introduces a mini-QR / out-of-band step — partial regression on the no-QR decision.
6. **Symmetric session keys:** TOFU establishes pubkey trust. Per-session E2E content key derivation — uses what? ECDH from server pubkey + mobile pubkey? Or a session-key exchange after pubkey trust is established?

### Q4 — Multi-machine mobile UX (U2)

What does U2 implementation actually look like?

1. **Parallel connections:** mobile holds N Socket.IO connections simultaneously. Battery / memory profile for N=1, N=3, N=10. At what point does U2 degrade to U1 (machine picker)? Design the threshold or auto-switch.
2. **Connection lifecycle:** when mobile backgrounds, do connections drop? Reconnect on foreground? Heartbeats?
3. **Session list aggregation:** sessions from each machine arrive over each connection. UI merges into one list, sorted by `updatedAt`. How to indicate which machine each session is on (badge, prefix, color)?
4. **Live state:** if a session on PC1 is actively running codex, mobile shows live updates from PC1's connection. If user taps over to PC2's session, the PC1 connection stays open in background.
5. **Notifications:** codex-done on PC2 while mobile is foregrounded on PC1's session. Push from PC2 → Expo → mobile. Mobile shows banner "PC2: task complete" and lets user tap to switch context.
6. **Offline machines:** mobile cached PC2's session list 2h ago; PC2 is now offline. Show cached list grayed out. Tap session → "PC2 is offline, last seen 2h ago." No history fetch possible.
7. **Lost-machine recovery:** what if mobile knows a `(machine_id, pubkey, displayName)` but the corresponding tunnel is gone (disappeared from the GitHub-listed tunnels)? Auto-prune after N days, or keep as historical reference?

### Q5 — Per-machine push notifications (N1)

Concretely, how does each machine push to mobile?

1. **Token registration:** mobile gets `ExponentPushToken[xxx]` from `expo-notifications`. How does mobile distribute it to N machines? Register on first connect to each tunnel? Re-register after token rotation?
2. **Server-side push code:** happy-server today calls `expo-server-sdk` (verify) or directly POSTs to `https://exp.host/--/api/v2/push/send`. Confirm and document the existing path.
3. **Expo project ID:** the mobile app is built with a specific Expo project ID. All machines pushing to that mobile must use the same project ID's push API. Where does the project ID need to be configured on each machine?
4. **`EXPO_ACCESS_TOKEN`:** required for high-volume / production? Free tier limits? Is one token shared across all operators acceptable, or does each operator need their own?
5. **Rate limits:** Expo's push API has per-token / per-project limits. With N machines all pushing to the same mobile, what's the aggregate ceiling?
6. **Failure handling:** push fails (e.g. token revoked). Each machine handles independently; no central retry queue. Document the per-machine retry/expiry logic.

### Q6 — Tunnel lifecycle (I-3)

Named tunnels for stable URLs. Operationally:

1. **First-time setup:** operator runs `devtunnel user login --github` (or Entra), `devtunnel host --port-numbers <port> --description <hostname>` once to create a named tunnel. Tunnel ID persisted somewhere (`~/.happy/tunnel.json`?).
2. **Subsequent boots:** happy-cli starts → reads tunnel ID → starts `devtunnel host` reusing the same ID. Mobile reconnects without re-discovery.
3. **Tunnel expiry:** named tunnels expire after 30 days (per Dev Tunnels docs). Renewal: happy-cli auto-pings `devtunnel update` periodically? Or user must manually refresh?
4. **Tunnel deletion:** `devtunnel delete <id>`. When? Operator action only? On `happy-cli logout` (does that even exist in the new model)?
5. **ACL:** `devtunnel access create <id> --user <gh-login>` to limit to operator's GitHub identity. Does Dev Tunnels honor this? (Validated empirically in the prior recommendation? Re-verify.)
6. **Linux/Mac headless** (open question 9 in the prior recommendation): `--use-integrated-windows-auth` doesn't exist on Linux/Mac. Is `--use-device-code-auth` the only path for headless operators? Implications for unattended server boot.

### Q7 — Migration story for cloud-relay users (I-2)

Hard reset is the default. Concretely:

1. How many users are on `app.happy.engineering` today? Do they have stored history that matters?
2. Communication plan: deprecation notice in mobile UI? Email blast?
3. Self-hosted setup guide: `docs/deployment.md` rewritten to walk operator through `devtunnel user login` → `happy-cli init` (creates `~/.happy/`) → first run.
4. Data export tool (optional): export the user's encrypted sessions from cloud DB to local files; user re-imports on the new self-hosted server. **Out of scope for v1**; document as a follow-up.
5. Dual-running: can a user run cloud + self-hosted simultaneously during transition? If yes, mobile would need to talk to both. If no (clean cut), users must pick a date.

### Q8 — happy-app web/desktop (I-1)

Web/desktop are clients, not servers.

1. Confirm `pnpm tauri:dev` (macOS desktop) and `pnpm web` workflows work as tunnel clients. Tauri can use the same RN code; web has different WebSocket/`extraHeaders` semantics.
2. **Web: does `extraHeaders` work on browser WebSocket?** Browser `new WebSocket(url, protocols)` doesn't support custom headers. Options:
   - Tunnel auth via URL query string (`?access_token=<JWT>`).
   - Tunnel auth via `Sec-WebSocket-Protocol` subprotocol.
   - Web is excluded from tunnel use (only RN + native desktop).
3. **Desktop (Tauri):** Tauri webview also constrained on raw browser WebSocket. Same as web.
4. Decide: support web/desktop in v1 or punt to a follow-up. Recommendation should document the call.

### Q9 — Multi-instance same machine (I-5)

One shared happy-server per machine, multiplexes multiple codex sessions.

1. Currently happy-cli supports running multiple codex sessions concurrently? `docs/multi-process.md` is the doc.
2. Port collision on second `happy-cli` invocation: detected via lockfile, second invocation either reuses the running server or errors. Design.
3. Tunnel reuse: second `happy-cli` invocation should NOT start a second tunnel (collision on devtunnel side).
4. Lifecycle: which `happy-cli` invocation owns the server lifecycle? First-to-start owns it; later starts are clients of the local server. On first-to-start exit, server keeps running (until last codex session exits)?

### Q10 — Build / dev environment delta

What does the dev workflow look like for a contributor?

1. `pnpm dev` for happy-cli now also starts happy-server in-process. Logs interleave; how to debug each layer?
2. Tests: happy-server's test suite runs with PGlite. happy-cli's test suite mocks the embedded server or starts a real one?
3. The fork's `pnpm prebuild` is stubbed (per happy-app/CLAUDE.md). Does the new architecture affect any prebuild concerns? (Likely not — server-side rewrite is Node-only.)
4. CI: existing CI builds happy-app + happy-server separately. New CI builds happy-cli with embedded server.

---

## Threat Model

Any answer must be checked against these threats. The deliverable should have a row per threat.

1. **Tunnel URL leak.** GitHub-listed tunnels leak via clipboard, screen recording, GitHub-API surface compromise. Attacker has tunnel URL + connect JWT. Mitigation: tunnel ACL enforces GitHub-identity gating; non-owner attempts rejected at edge.
2. **Mobile-side compromise.** Stored `(machineId, pubkey)` mappings, GitHub `ghu_` token, Expo push token. Worst case: stolen unlocked phone. Mitigation: SecureStore with biometric gate? `ghu_` token has finite TTL.
3. **Machine-side compromise.** Local `~/.happy/server-key.priv`, codex output, session DB. Already plaintext on the machine; codex can read your filesystem anyway. Threat largely subsumed by "your machine is compromised."
4. **First-connect MITM.** Microsoft (tunnel provider) could MITM the first mobile connect to a new machine. Documented accepted risk OR add fingerprint compare step (regression on no-QR).
5. **Pubkey rotation legitimate vs malicious.** Operator reinstalls happy-cli → new pubkey → mobile sees mismatch. Same warning as MITM. UX must let user accept the rotation without paranoia mode.
6. **GitHub identity compromise.** Attacker takes over operator's GitHub account → can list operator's tunnels → can mint connect JWTs → reaches the tunnel → but **doesn't have the server pubkey**, so TOFU detects new pubkey on first attempt. Saved by TOFU. Document.
7. **Replay of connect JWT.** JWT tied to specific tunnel; tunnel deletion invalidates. Same as prior recommendation.
8. **Dev Tunnels provider compromise.** Microsoft sees ciphertext only (E2E preserved by TOFU + pubkey-pinned session keys). Confirm.
9. **Push token leak.** `ExponentPushToken` falls into attacker's hands → attacker can spam pushes. Mitigation: tokens auto-rotate; impact bounded.
10. **Auditability.** Each machine logs locally. No central audit trail. User must aggregate across machines manually.
11. **Mobile loses all machines (full reinstall).** All `(machineId, pubkey)` mappings gone. User re-pairs with all machines via GitHub device flow. New TOFU first-connects for all machines. Historical sessions on machines still intact.
12. **Machine loses all data (disk wipe).** Server pubkey lost; all paired mobiles must re-trust on next connect. Sessions gone. **No recovery story** unless operator backs up `~/.happy/`.

---

## Deliverable

The assignee produces ONE artifact at `docs/research/server-per-machine-architecture-recommendation.md`, structured as either:

### Option A — Single architecture (preferred when research validates the locked decisions)

1. **TL;DR** (3–5 lines).
2. **Architecture diagrams** for: pair (first connect), reconnect, multi-machine list, codex-done push.
3. **Locked-decisions table** copied from this MD with any amendments highlighted.
4. **Implicit-decisions table** with each I-1..I-5 marked as `confirmed`, `amended (new value: ...)`, or `still open`.
5. **Threat-model table** (12 rows).
6. **Phase plan** — what to build first, second, third. Use the prior rec's 10-story decomposition as a starting point but expect significant divergence (most happy-app auth stories disappear; server-rewrite stories appear).
7. **Migration plan** for the codebase: which files get deleted, which get rewritten, which stay. Order of merge.
8. **Open questions** the recommendation could not close (carry forward as deferred).
9. **Empirical validation summary** — what experiments the assignee ran (or recommends running) to validate before plan-with-ralph.

### Option B — Decision matrix (when research surfaces a fork)

Same shape as Option A but with multiple architecture variants ranked. Use only if research finds a blocker on the locked decisions that forces revisiting. Examples that would force Option B:

- TOFU first-connect MITM is unacceptable per security review → mini-QR returns.
- Expo push API rate limits make N1 impractical → N2 (shared push gateway) reconsidered.
- Dev Tunnels named tunnel expiry is too aggressive → ephemeral tunnels with new URL per session needed.
- happy-server cannot cleanly run in-process with happy-cli → P1 fails, P2 (child process) becomes default.

---

## Out of Scope

- Concrete implementation of any chosen architecture. That's the next plan-with-ralph.
- Pricing for Expo push beyond free tier (note limits, defer negotiation).
- happy-cli ↔ codex integration changes (codex is a sub-process; happy-cli's relationship to it is unaffected by this work).
- E2E encryption library changes (libsodium-based primitives stay; only the keypair source rotates).
- happy-app web/desktop optimization beyond "do they work as tunnel clients" — UI/UX polish is post-architecture.
- Multi-user-on-one-machine (e.g., shared family PC). Single-tenant per machine == single operator per machine. If two users want to share a machine, they each run their own happy-cli + tunnel.

---

## Constraints The Recommendation Must Respect

1. **React Native WebSocket compatibility.** RN's WebSocket has no `headers` option. `extraHeaders` works via Socket.IO's `engine.io-client` which routes to RN's native WebSocket via `{ headers: extraHeaders }`. Validated in prior rec. Web/desktop (browser WebSocket) constrained differently.
2. **No `--allow-anonymous` on Dev Tunnels.** Tunnel ACL must always gate access. (Dev Tunnels enforces at edge; happy-server is single-tenant so no need to re-validate inside.)
3. **E2E preserved.** TOFU pubkey + pubkey-pinned session keys must keep the tunnel provider out of the plaintext path.
4. **No new third-party identity dependency.** GitHub device flow uses GitHub's own client app. No additional IdP added.
5. **Fork constraints.** This is the `Evyatar108/happy` fork. Not EAS / OTA. Production goes via Firebase App Distribution. `pnpm prebuild` is stubbed. Server-side work is Node-only and unaffected; mobile work must respect this.
6. **The original locked Phase 0 defaults still apply where relevant.** OAuth App for Happy auth (DEAD in new model — no GitHub OAuth proxy); raw GH token everywhere (DEAD — no Happy bearer); stable random per-machine port persisted in `~/.happy/machine.json` (LIVES).
7. **Bearer-free is final.** The chain `bearer redundant → server-per-user → server-per-machine → ii simplification` was deliberate. Don't reintroduce bearer as defense-in-depth without surfacing a concrete threat that TOFU + tunnel ACL doesn't already defeat.

---

## Common Mistakes / Confusion Points

These will trip up an agent. Add to this list as the assignee discovers more.

1. **"Bearer" is ambiguous.** In the prior recommendation, "Happy bearer" meant happy-server's own session JWT (minted during QR pairing). It was NOT a third-party token. The new model removes that bearer; the TOFU pubkey-pinned session is the auth. Don't conflate Happy bearer with GitHub/Microsoft tokens — they're different things, and the GitHub `ghu_` token survives (used only for tunnel discovery, not Happy auth).

2. **happy-server is a library now, not a service.** Don't write code or recommendations that assume `happy-server` is a separate process or repository. It's imported by happy-cli. `Dockerfile.server` is dead.

3. **Single-tenant ≠ no users.** The server still has one user (the operator). DB schema still tracks sessions, machines, KV. What goes away is the userId partitioning — all data implicitly belongs to the operator. Don't accidentally rip out useful structure.

4. **TOFU first-connect MITM is a real threat.** Don't dismiss it as "Microsoft would never." Document explicitly whether the recommendation accepts the risk or adds fingerprint compare. Consistency with the no-QR decision matters.

5. **"Cross-machine session continuity" has two layers** (Layer 1 = execution; Layer 2 = listing). Layer 1 was never supported and isn't a regression. Layer 2 is what mobile UX is solving with U2. Don't conflate.

6. **`extraHeaders` semantics differ between RN and browser.** Web/desktop happy-app cannot use `extraHeaders` directly. If the recommendation supports them as clients (I-1), it must specify the alternate auth mechanism (URL query, subprotocol).

7. **Expo push project ID is baked into the mobile app at build time.** All machines push via the same Expo project. Mismatched project IDs = pushes silently dropped. Document where this is configured.

8. **Named tunnel expiry.** Dev Tunnels named tunnels typically expire after 30 days. Auto-renew logic is required for "set up once and forget" UX. Investigate the renew API.

9. **Port collisions.** Multiple happy-cli invocations on one machine. Lockfile + port reuse. Don't accidentally let happy-cli #2 start a second server on a different port and a second tunnel.

10. **`devtunnel` CLI version sensitivity.** The original Phase 0 plan called for upgrading past `1.0.1516`. Plan must verify the version baseline.

11. **Microsoft/Entra is fine as the operator's identity for tunnel ACL.** Earlier conversation established that GitHub identity for the OPERATOR is a separate question from tunnel auth. Server-per-machine doesn't care which IdP the operator uses to auth to Dev Tunnels — the tunnel just needs to be ACL-gated to that operator. Mobile-side discovery uses GitHub device flow because that's what happy-app currently has UI for; long-term, mobile could auth to Dev Tunnels via Entra MSAL too (Phase 2 in the original plan).

12. **No QR ≠ no out-of-band step ever.** First-time machine setup still requires the operator to log in to `devtunnel` interactively (browser flow or device-code). That's an out-of-band step on the **operator** side, not the mobile side. Mobile side is genuinely QR-free.

---

## How To Run This As An Agent Job

The assignee can either work this as a free-form research task with empirical validation, or convert to a `/plan-with-ralph` cycle once the recommendation lands.

```text
# Direct research:
"Read docs/research/server-per-machine-architecture-investigation.md and produce
the deliverable described in the 'Deliverable' section. Run empirical experiments
under experiments/ as needed to validate Q1, Q3, Q5, Q6, Q9. Reuse experiments/tunnel-discovery/
as a starting point. Final artifact at docs/research/server-per-machine-architecture-recommendation.md."

# Or via brainstorm:
/brainstorm-with-ralph "Pressure-test the server-per-machine + TOFU + no-QR architecture
documented in docs/research/server-per-machine-architecture-investigation.md. Codex
should focus on Q1/Q3 feasibility (in-process happy-server, TOFU keypair). Copilot
should focus on Q4/Q7 product reality (mobile UX, migration). Devil's Advocate should
challenge the no-QR + TOFU first-connect MITM tradeoff."

# Or directly to plan (only if recommendation is already written):
/plan-with-ralph --from-brainstorm <path> "Implement the recommendation at
docs/research/server-per-machine-architecture-recommendation.md."
```

---

## Files To Reference / Update If The Recommendation Changes Plans

If the recommendation amends any of the locked decisions:

- Update `docs/research/server-per-machine-architecture-investigation.md` (this file) status from `open` to `superseded by docs/research/server-per-machine-architecture-recommendation.md`.
- Mark `docs/research/tunnel-transport-recommendation.md` status from `final` to `superseded by docs/research/server-per-machine-architecture-recommendation.md`.
- Mark `docs/research/tunnel-transport-investigation.md` status from `superseded` (already was) to `superseded by docs/research/server-per-machine-architecture-recommendation.md`.
- Flag the archived predecessor jobs (`.ralph/archive/phase-0-devtunnel-auth-spike-superseded-20260508/`, `.ralph/archive/tunnel-transport-investigation-completed-20260508/`, `.ralph/archive/plan-with-ralph-aborted-20260509-022443/`) as superseded by the new recommendation in their notepads (if they have any).
- Note the change in the new recommendation doc itself; do not edit the prior plan/recommendation files as part of this investigation.
