# Dev Tunnels Sprint E — BOOX Hardware Validation Result

**Operator:** evmitran (Microsoft enterprise GitHub identity `evmitran_microsoft`)
**Date:** 2026-05-13
**Device(s):** BOOX NoteAir5C (serial `76a140c3`)
**Build:** Metro dev client on `main` (5 commits ahead of origin/main with the validation-driven fixes)

---

## Overall Verdict

**PARTIAL — Phase 1 PASS after substantial design corrections; Phases 2-6 not yet attempted in this session.**

The Sprint A migration as originally shipped on `main` (`2a8b4bf9`) did not pair end-to-end. Validation surfaced bugs that required real code/design changes:

| Finding | Severity | Resolution |
|---|---|---|
| `X-Tunnel-Connect` header rejected by Microsoft Dev Tunnels gateway | Blocker | Renamed to `X-Tunnel-Authorization: tunnel <connect-jwt>` (Microsoft's standard). Later remove-tunnel-claim-layer work retired the separate Happy daemon header entirely. |
| Per-machine `/pair/start` + `/pair/status` device flow needed `GITHUB_CLIENT_ID` + `HAPPY_TUNNEL_GITHUB_OWNER` env vars and was redundant on a personal fork | Blocker | Replaced with a single `POST /pair/complete` that reads identity from `~/.happy/profile.json`. |
| Tunnel id `happy-<host>-<uuid>` overflowed Microsoft's 49-char limit | Blocker | Renamed to `codexu-<host>`. Dropped UUID component (hostname is unique under a single Microsoft account). |
| `devtunnel host <id> --port-number <port>` errored when port already registered | Blocker | Removed redundant `--port-number` from `startHost`; `ensurePort` already adds the port. |
| Client + daemon read wrong field from Dev Tunnels API for port URL (`portForwardingUri` singular vs actual `portForwardingUris` plural array) | Blocker | Fixed in both `packages/happy-app/sources/sync/tunnelProvider.ts` and `packages/happy-cli/src/tunnel/tunnelManager.ts`. |
| Daemon returned base-tunnel URL (no port suffix) as `tunnelUrl` to clients | Blocker | Daemon re-derives port URL via `devtunnel show --json` on every `loadForDaemon`. |
| Pair UX: device-flow code only available via browser open; enterprise GitHub accounts blocked by conditional access on unmanaged BOOX browser | Blocker for this operator | Added chooser modal (browser vs device code) + inline auto-dismissing banner showing the code so operator can complete on a desktop browser. |
| Stale persisted `profile` in MMKV breaks app startup after schema rename | Blocker after pair | `profileParse` now also accepts the local on-disk shape. |
| Polling per-`flow.interval` (5-12s) made post-authorize wait feel like minutes | UX nit | Flat 2s poll. |

Five commits land all of the above on local `main`: `a12a5e46`, `fe1626a2`, `2b77d8bb`, `7312e162`, `fed4a1cd`. Awaiting push approval.

---

## Phase 1 — Pairing + machine discovery

**Result:** PASS

Steps:
1. Pair BOOX over GitHub device flow.
2. Verify private tunnel admits the app (no `devtunnel access create --anonymous` needed).
3. Machine picker displays current machine.

Evidence:
- happy-server runtime log excerpt — no `--allow-anonymous` invocation; daemon uses `devtunnel host codexu-desktop-212evnk` (no port arg, no anonymous flag):
  ```
  [TUNNEL] Started Dev Tunnel host for codexu-desktop-212evnk -> 127.0.0.1:51371
  [DAEMON RUN] Embedded happy-server tunnel listener started on 127.0.0.1:51371
  [DAEMON RUN] Dev Tunnel host started for https://58l8c10h-51371.usw2.devtunnels.ms
  ```
- Pair-success evidence: BOOX app advanced from the unauthenticated landing screen ("Pair machine" button) past `POST /pair/complete` to the authenticated session-ready state. Curl repro of the same flow (with the same connect token + headers the app uses) returned HTTP 200 with a fully-formed `{ githubLogin, machine: { machineId, tunnelUrl, ed25519PublicKey, x25519PublicKey, ed25519Fingerprint } }` payload.
- Confirmation that `devtunnel access create --anonymous` was NOT invoked: verified — `packages/happy-cli/src/tunnel/tunnelManager.ts` does not call `devtunnel access` at all; only `devtunnel create`, `port create`, `host`, `show`. Searching the daemon log for `allow-anonymous` returns no hits.

Notes: Phases 2-6 not yet attempted in this session — operator paused validation here to commit the design corrections. Resume from Phase 2 in a follow-up session against the same paired BOOX + daemon.

> **PENDING OPERATOR VERIFICATION (remove-tunnel-claim-layer):** The Phase 1 PASS above was recorded against a build that still sent `X-Codexu-Authorization`. The remove-tunnel-claim-layer work has since deleted that header entirely. Before merging, the operator must re-run the BOOX → daemon HTTP + socket flow against the new build and confirm that pairing and chat round-trips succeed without `X-Codexu-Authorization`. Replace this block with a one-line confirmation (e.g. "re-verified PASS on <date> against build <sha>") once done.
<!-- optional per-phase notes -->

---

## Phase 2 — Session start + chat round-trip

**Result:** <!-- PASS | FAIL | SKIPPED -->

Steps:
1. Pick Codex model.
2. Type "list files"; receive response.
3. Type a follow-up; verify chat history is readable on e-ink.
   - Expected: user-message bands display with `userMessageBackground: #d4d4d4` (light grey).

Evidence:
<!-- screenshot path or operator note -->

Notes:
<!-- optional -->

---

## Phase 3 — Refresh-per-request durability

**Result:** <!-- PASS | FAIL | SKIPPED -->

Steps:
1. Let session idle for 2 minutes.
2. Send a message.
3. Confirm app re-mints a claim (`fresh claim` entries in `.happy/logs/*` or app console).

Evidence:
<!-- log snippet or operator note confirming re-mint -->

Notes:
<!-- optional -->

---

## Phase 4 — Token revocation drill

**Result:** <!-- PASS | FAIL | SKIPPED -->

Steps:
1. Revoke the `ghu_*` token via GitHub Settings → Developer Settings → Tokens.
2. Send a message from the app.
3. Confirm app surfaces "session expired" + re-pair button.
4. Re-pair; verify session resumes.

Evidence:
<!-- screenshot path or operator note -->

Notes:
<!-- optional -->

---

## Phase 5 — Multi-device fan-out

**Result:** <!-- PASS | FAIL | SKIPPED (SKIP if only one BOOX available — does not block cutover) -->

Steps (requires 2 BOOX devices):
1. Pair both devices.
2. Verify distinct `jti` per device in server logs.
3. Send from device 1; receive Socket.IO event on device 2.

Evidence:
<!-- log excerpt or operator note -->

Notes:
<!-- optional; if SKIPPED record "only one BOOX available" -->

---

## Phase 6 — APK / Metro release procedure

**Result:** <!-- PASS | FAIL | SKIPPED -->

Steps:
1. Run `pnpm release:android` (or `--no-distribute` for local-only).
2. Verify the signed APK builds against `com.evyatar109.happy`.
3. Install on a tablet; sanity-check behaviour matches phase 1.
4. (If Firebase App Distribution is configured) Verify upload triggers tablet notification.

### `apksigner verify --print-certs` output

```
<!-- Paste full output here.
     Example command:
       apksigner verify --print-certs path/to/happy-release.apk
     This proves the APK is signed with the production keystore. -->
```

Evidence:
<!-- additional operator notes -->

Notes:
<!-- optional -->

---

## Follow-up items (failures deferred by operator)

| Phase | Issue | Deferred to notepad.md entry | Operator decision |
|-------|-------|-------------------------------|-------------------|
| <!-- e.g. 5 --> | <!-- description --> | <!-- notepad entry title --> | <!-- e.g. "defer to post-E hotfix" --> |

---

## Realtime sync perf (deferred)

During Phase 1 the pair flow worked end-to-end but the operator observed three
perf problems that don't block the Phase 1 PASS verdict and don't need to block
Phases 2–6 either, but should be fixed before the migration is declared
production-ready:

- **Slow first-load on foreground: RESOLVED by remove-tunnel-claim-layer.** Opening the BOOX Happy app (cold or after
  the e-ink screensaver) used to take several seconds before the chat list rendered.
  Most of the latency was in sequenced `tunnelFetch` calls, where each one paid for
  Dev Tunnels connect-token refresh, then a Happy claim refresh, then the actual fetch.
  The Happy claim refresh leg has been deleted; steady-state calls now need only the
  Dev Tunnels connect token and the actual request.
- **New-message latency ≈ 1 min.** A message typed into a CLI `happy` session
  takes up to a minute to surface on the BOOX. Diagnosed as the "unknown
  session" code path in `packages/happy-app/sources/sync/sync.ts:1680-1710`:
  when a `new-message` socket event arrives for a session the app's storage
  doesn't know yet, the app **blocks** message rendering on a full
  `/v1/sessions` re-fetch and then replays queued messages. The 1-min figure
  matches the cost of that fetch over Dev Tunnels with the former claim-refresh
  serialization above.
- **Slow reconnect after a transient.** Socket.IO without a server-side replay
  buffer means events emitted during a disconnect window are lost on the
  floor; the client falls back to HTTP re-fetch to reconcile. This makes the
  "unknown session" path above fire whenever the BOOX backgrounds long enough
  to drop the socket.

Steady-state push **does work** — server emits `new-session`, `new-message`,
`update-session`, `update-machine` to user-scoped + session-scoped rooms via
`packages/happy-server/sources/app/events/eventRouter.ts:327-348`. The
operator-visible latency comes entirely from the recovery / cold-path code,
not from the live push path.

**Plan:** see `plans/realtime-sync-perf.md` for the three workstreams
(refresh-skip when claim still valid; optimistic placeholder session for the
unknown-session new-message path; server-side per-user event replay buffer +
client `lastSeenSeq` handshake) plus the optional workstream 4
(sockets-only refactor of `fetchSessions` / `fetchMessages`).

The plan doc is targeted at a fresh agent — it includes file paths, line
references, expected outcomes, test plans, risks, and the pre-flight
checklist.
