# Realtime Sync Perf Plan

**Status:** drafted 2026-05-13 for a fresh agent. Not yet started.
**Branch:** `main` (origin/main HEAD after BOOX-validation push).
**Related history:** see `docs/validation/devtunnels-boox-result.md` "Realtime sync perf (deferred)" subsection (added in this same drafting session) for the empirical evidence that motivated this work, and `packages/happy-app/scripts/sprint-a-gap.md` "R-D18 path (b) implementation log" for the gateway/claim header design these calls run on top of.

## Operator-observed symptoms

These are what the operator experienced during US-005 BOOX Phase 1 validation, after the pair flow was working end-to-end:

1. **Slow first-load on app foreground.** Opening the BOOX Happy app (cold or after backgrounding past the screensaver) takes several seconds to surface the chat list. Most of that latency is *not* visible work — the app is silently waiting on tunneled HTTP fetches.
2. **New-message latency.** A user types in a CLI `happy` session; the new message takes ~1 min to appear in the BOOX. The 1-min figure matches the cadence of an HTTP reconciliation fallback, not steady-state socket push.
3. **Slow reconnect after a transient.** When the daemon restarts (or the tunnel briefly drops — seen during the rounds of design fixes 2026-05-13), the app's user-scoped socket disconnects, the server has no event-replay buffer, and the app falls back to HTTP fetches to reconcile. During reconnect, perceived latency spikes.

## Architectural diagnosis (verified against current source)

### What's actually happening

- happy-app holds a single **user-scoped Socket.IO connection** (no per-session subscription). All session/message updates are pushed to that one connection via Socket.IO rooms (`eventRouter.emitUpdate` in `packages/happy-server/sources/app/events/eventRouter.ts:327-348`).
- Steady-state push **does work** — server emits `new-session`, `new-message`, `update-session`, `update-machine` to user-scoped + session-scoped rooms (`packages/happy-server/sources/app/api/socket/sessionUpdateHandler.ts:286-293`, `packages/happy-server/sources/app/api/routes/sessionRoutes.ts:281`).
- **There is no server-side event replay buffer**. Socket.IO without an adapter does not persist events across a client's disconnected window. Events fired during the disconnect are lost on the floor.
- happy-app's recovery from a lost event is **HTTP re-fetch**: `fetchSessions` calls `tunnelFetch('/v1/sessions', ...)` (`packages/happy-app/sources/sync/sync.ts:1135-1195`). `fetchMessages` and `loadOlder` call `apiSocket.forSession(sessionId).request('/v3/sessions/:localId/messages?...')` — which is `tunnelFetch` under the hood (`packages/happy-app/sources/sync/apiSocket.ts` `_requestForMachine`). The 2026-05-13 consolidation replaced `apiSocket.requestForSession(sid, path)` / `apiSocket.sessionRPC(sid, method, params)` / etc. with `apiSocket.forSession(sid).request|rpc|machineRpc|emitWithAck(...)` scope builders; the new pattern is the ONLY way to call session-scoped routing.
- Every `tunnelFetch` call runs `getMachineAuthHeaders` (`packages/happy-app/sources/auth/machineAuth.ts:65-72`) which sequences: `ensureFreshConnectToken` (potential roundtrip to Microsoft Dev Tunnels API) → `refreshTunnelClaim` (roundtrip to daemon `/pair/complete`) → the actual fetch. So a cold call can be 3 sequential HTTPS roundtrips through the tunnel.
- `InvalidateSync` (`packages/happy-app/sources/utils/sync.ts:3-83`) is **debounced, not timer-polled.** No fixed cadence. It only runs `_command` when someone calls `.invalidate()`. So "polling cadence" is not the bottleneck — what triggers `.invalidate()` matters.

### What triggers `sessionsSync.invalidate()` (and is therefore a source of HTTP work)

Searched `packages/happy-app/sources/sync/sync.ts`:

| Line | Trigger | When fires |
|---|---|---|
| 296 | AppState `'active'` (foreground) | every time the BOOX wakes from screensaver / backgrounded |
| 396 | (post-auth init path) | once per auth |
| 1204 | (caller-driven `invalidateAndAwait`) | rare |
| 1655 | (incoming socket `update-session`) | rare |
| 1699 | **`new-message` event for an unknown session** | every new-session-message race |
| 1765 | **incoming socket `new-session` event** | every session creation from any machine |

Lines 1697-1707 are the dominant source of perceived latency for symptom (2):

```ts
if (!this.sessionInitInFlight.has(sid)) {
    this.sessionInitInFlight.add(sid);
    this.sessionsSync.invalidateAndAwait().finally(() => {
        this.sessionInitInFlight.delete(sid);
        const pending = this.pendingNewMessages.get(sid) ?? [];
        this.pendingNewMessages.delete(sid);
        for (const evt of pending) {
            void this.handleUpdate(evt, true, sourceMachineId);
        }
    });
}
```

If a `new-message` event arrives for a session the app's storage doesn't know about (because the `new-session` event was missed during disconnect, or the session was just created), the app **blocks** the message processing on a full `/v1/sessions` re-fetch, then replays the queued messages. That fetch is one full `tunnelFetch` (3 roundtrips cold), then for each new session in the response another set of `fetchMessages` calls.

### What the server already does (don't redo this work)

- `eventRouter.emitUpdate` already publishes `new-session`, `new-message`, `update-session`, `update-machine` to the right rooms. Steady-state push is wired up correctly.
- `allocateUserSeq` already mints monotonic per-user sequence numbers on every update (`packages/happy-server/sources/app/api/socket/sessionUpdateHandler.ts:263`). So a replay buffer keyed by `(userId, seq)` is structurally easy to add.
- `/pair/complete` is the only mandatory HTTP call (pair + claim refresh) since the encryption removal in `1e02b09e`. Everything else *could* migrate to socket-only without losing functionality.

## Three workstreams

Each workstream stands on its own. Recommend executing in the order presented (cheapest, smallest blast radius first). A fresh agent should commit each workstream as its own commit so they can be reviewed/reverted independently.

---

### Workstream 1 — Skip `refreshTunnelClaim` roundtrip when claim is still valid

**Pain it relieves:** every steady-state fetch currently pays ~1s for a `refreshTunnelClaim` HTTPS roundtrip even when the existing `tunnelClaim` is still valid for tens of minutes. This makes every foreground-triggered fan-out unnecessarily expensive.

**Files to read:**
- `packages/happy-app/sources/sync/refreshClaim.ts` — current refresh logic, has `MIN_REFRESH_INTERVAL_MS = 12_000` rate-limit but no exp-based skip
- `packages/happy-app/sources/auth/machineAuth.ts:65-72` — calls `refreshTunnelClaim` on every `tunnelFetch` via `getMachineAuthHeaders`
- `packages/happy-app/sources/auth/pairing.ts:parseTunnelClaimPayload` — already decodes the claim envelope; the `exp` (Unix seconds) field is in there

**What to do:**
- In `refreshTunnelClaim`, before doing the HTTP roundtrip, parse the current `credentials.tunnelClaim` (via `parseTunnelClaimPayload`) and check `exp - now > SAFETY_WINDOW_S` (suggest 60-120 seconds). If still valid, return the cached claim string. No network call.
- Keep the existing rate-limit (`MIN_REFRESH_INTERVAL_MS`) as a secondary guard.
- Verify: `validateFreshClaim` (already in the file) covers the integrity check on actual fresh claims; the skip path needs no extra validation.

**Test plan:**
- `packages/happy-app/sources/sync/refreshClaim.test.ts` — add a case that asserts no `fetch` call when the cached claim still has `exp > now + SAFETY_WINDOW_S`.
- Existing tests for `503`/`5xx` retry paths must stay green.

**Expected outcome:** foreground fan-out where 5/6 fetches share a fresh-enough claim drops from 6×~2.5s to 1×~2.5s + 5×~0.5s. Cold-foreground first fetch is unchanged.

**Risk:** if the claim's `exp` is short-lived (<1 min) the skip never kicks in. Verify the daemon's `buildTunnelClaimPayload` in `packages/happy-server/sources/app/api/routes/pairRoutes.ts` issues a meaningful lifetime — at the time of this writing it's 3600s, which makes the optimization worthwhile.

**Estimate:** 30–45 min including tests.

---

### Workstream 2 — Stop blocking new-message processing on a full sessions re-fetch

**Pain it relieves:** when a `new-message` event arrives for a session the app's storage doesn't know yet (race after `new-session` event was missed during a socket disconnect, or session is brand-new), the app pauses message rendering for an entire `fetchSessions` round-trip (often ~1 minute observed).

**Files to read:**
- `packages/happy-app/sources/sync/sync.ts:1680-1710` — the current "unknown session, queue, fetch sessions, then replay" path
- `packages/happy-app/sources/sync/sync.ts:1763-1765` — `new-session` event handler (also calls `sessionsSync.invalidate`, but doesn't block since this path doesn't need the message replay)
- `packages/happy-app/sources/sync/typesRaw.ts` — `NormalizedMessage`, session/message normalizers
- `packages/happy-app/sources/sync/storage.ts` — `applySessions`, `enqueueMessages`, session lifecycle

**What to do:**
- **Optimistic placeholder session.** When a `new-message` arrives for a `sid` not in storage, synthesize a minimal `StoredSession` from what's already in the event envelope (machineId from socket scope, sid, `lastSeq` from the message, placeholder `metadata: { path: '', host: '', flavor: 'unknown' }`, `active: true`, `updatedAt: createdAt`). Insert it via `applySessions`.
- **Apply the message immediately** through the existing `enqueueMessages` fast path. UI shows the message.
- **Kick off `sessionsSync.invalidate()` (NOT `invalidateAndAwait`)** to fetch real metadata in the background. When the fetch resolves, `applySessions` overwrites the placeholder with the real session data. Message rendering is not interrupted.
- **Remove the `sessionInitInFlight` set + `pendingNewMessages` queue** — both become unnecessary because the message is applied synchronously, not queued.

**Test plan:**
- Add a test fixture in `packages/happy-app/sources/sync/sync.test.ts` (or a sibling) that:
  1. Mocks storage with no session for `sid='sx'`.
  2. Fires a `new-message` update event for `sid='sx'`.
  3. Asserts the placeholder session was inserted and the message was enqueued *before* any `fetchSessions` mock was awaited.
- Existing tests for `new-message` lifecycle (`turn-start`/`turn-end` thinking-state) must stay green.

**Expected outcome:** message latency on the unknown-session path drops from ~1 fetch-roundtrip (~5–60s observed) to ~0 — UI updates immediately. Real metadata back-fills within ~1 fetch roundtrip but doesn't block the message.

**Risk:** the placeholder must be visually distinguishable until real metadata arrives, OR the placeholder must be functional enough that the user doesn't notice (e.g., "Loading…" host/path until the fetch resolves). Decide one of: (a) explicit visual placeholder, (b) silently functional placeholder swapped on fetch completion. The PR should pick (b) for simplicity unless there's a strong UX argument for (a).

**Estimate:** 1–1.5 hours including tests.

---

### Workstream 3 — Server-side per-user event replay buffer + client `reconcile-since-seq` socket RPC

**Pain it relieves:** every socket disconnect (daemon restart, network blip, Android background suspension) currently leaves the app dependent on HTTP re-fetch to know what it missed. This means workstream 2's optimistic-placeholder logic still fires often (any missed `new-session` event makes the next `new-message` event take the unknown-session path). It also means HTTP remains on the steady-state critical path for any non-fresh app session, which contradicts the operator's stated goal of "sockets-only, no HTTP fallback".

**Files to read:**
- `packages/happy-server/sources/app/events/eventRouter.ts` — `EventRouter` class that does the actual `io.to(rooms).emit(...)`. This is where the replay buffer needs to live.
- `packages/happy-server/sources/app/api/socket/sessionUpdateHandler.ts:263` — `allocateUserSeq(userId)` already produces monotonic per-user seqs; replay just needs to remember `{ userId, seq, eventName, payload }` for a bounded window.
- `packages/happy-server/sources/app/api/socket.ts` — Socket.IO handshake; the `auth.lastSeenSeq` (new field) lives here on reconnect.
- `packages/happy-app/sources/sync/apiSocket.ts` — client-side connect/reconnect lifecycle. Add `auth.lastSeenSeq = storage.getState().lastSeenUpdateSeq` on reconnect.
- `packages/happy-app/sources/sync/storage.ts` — track `lastSeenUpdateSeq` in MMKV-persisted state.

**What to do:**
- **Server-side:** `EventRouter` adds a per-user ring buffer of the last N events (`MAX_REPLAY_BUFFER = 1024` or `MAX_REPLAY_AGE_MS = 60_000`, whichever is larger — verify with operator). Each `emitUpdate` appends to the buffer keyed by `userId`. On socket `connection`, if `socket.handshake.auth.lastSeenSeq` is present, server replays events with `seq > lastSeenSeq` for that user, in order, then sets the socket's "current" seq to the latest. If `lastSeenSeq` is older than the oldest buffered seq (replay-window-overflow), server responds with `{ replayOverflow: true, currentSeq }` so the client knows it needs to do a full snapshot fetch (still HTTP this round; workstream 4 below would eliminate that).
- **Client-side:** every received `update` event persists `update.seq` as `lastSeenUpdateSeq` in storage. On socket connect, include it in handshake auth. On server `replayOverflow`, fall back to HTTP (or future: socket `request-sessions-snapshot`).
- **Cross-cluster note:** if happy-server ever runs multi-replica, the ring buffer needs to live in shared state (Redis). The personal-fork posture is single-process so in-memory is fine; document this as a deployment constraint.

**Test plan:**
- Server: unit test `EventRouter` with a simulated reconnect — emit 10 events, disconnect, reconnect with `lastSeenSeq=5`, verify events 6–10 are delivered in order. Then test overflow case: emit 2000 events with buffer cap 1024, reconnect with `lastSeenSeq=0`, verify server responds with `replayOverflow: true`.
- Client: integration test that asserts `lastSeenUpdateSeq` is persisted across `applyUpdate` calls; reconnect sends the right value.

**Expected outcome:** post-reconnect, the app receives all missed events via the socket. HTTP `fetchSessions` is no longer required for steady-state operation. Workstream 2's "unknown session" path becomes rare (only fires for genuinely-brand-new sessions while the socket was disconnected).

**Risk:** the replay buffer is mutable global state on the server; an event between `allocateUserSeq` and `emitUpdate` could be misordered if not carefully sequenced (current code is fine; just don't introduce reordering). Ring-buffer size needs to be a real config knob, not a constant — pick a default but expose for tuning.

**Estimate:** 2–3 hours including tests.

---

### Workstream 4 (optional, post-3) — Full sockets-only for chat list + open chat messages

If after workstreams 1–3 there's still meaningful HTTP traffic on the steady-state path, the next step is what the operator originally asked for: replace `fetchSessions` and `fetchMessages` with socket `emitWithAck` RPCs. With workstream 3's replay buffer in place, the initial bulk load is the only remaining HTTP user; that's what this workstream eliminates.

**Not detailed here** because workstream 3 may obviate it. Defer the scope decision until after 3 lands and the operator re-measures.

---

## Touch-points & risk summary

| Workstream | Touches | Risk | Rollback |
|---|---|---|---|
| 1 (refresh-skip) | `refreshClaim.ts`, `refreshClaim.test.ts` | Low | revert single commit |
| 2 (optimistic placeholder) | `sync.ts:1680-1710`, `storage.ts` (minor), new test | Medium — placeholder semantics need care | revert single commit |
| 3 (replay buffer) | `eventRouter.ts`, `socket.ts`, `apiSocket.ts`, `storage.ts`, server + client tests | Medium — touches both sides of the wire; ring-buffer size is a runtime knob | revert single commit (but keep client-side `lastSeenUpdateSeq` persistence, it's idempotent) |

All three should be commit-per-workstream so each can be reviewed and reverted independently. Bundle them into a single push to `main` only after all three pass cross-package typecheck + tests.

## Pre-flight checklist for the fresh agent

Before starting:
- Read this plan top to bottom.
- Read `packages/happy-app/scripts/sprint-a-gap.md` "R-D18 path (b) implementation log" — establishes the header/pair contract the perf work assumes.
- `git log --oneline origin/main..HEAD` should be empty (start from a clean main).
- `pnpm install` + cross-package typecheck baseline: `happy-server`, `happy-cli`, `happy-agent`, `happy-wire`, `happy-app` should all be green before any edit.
- Confirm with operator that workstream 2's "silently functional placeholder" choice (option b in workstream 2 above) is acceptable before implementing — they may want option a (explicit visual loading state).

After each workstream:
- Cross-package typecheck green.
- Tests green for the workstream's package.
- Commit message follows the existing `fix(devtunnels): …` / `refactor(devtunnels): …` convention. Include the empirical evidence (e.g., "foreground fan-out drops from 6×~2.5s to 1×~2.5s+5×~0.5s").
- Update `docs/validation/devtunnels-boox-result.md` "Realtime sync perf (deferred)" section to remove the relevant bullet as workstreams land.

After all three:
- Operator re-measures on BOOX. Expected: foreground refresh feels snappy (<2s perceived), new-message arrives within ~1 socket roundtrip, daemon restart causes no visible message-loss window.
- If still slow, profile-then-fix; don't speculate further.
