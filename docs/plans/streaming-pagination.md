# Streaming Pagination (Two-Window over Socket)

## Overview

Replace the previous "fetch a fresh older-page on demand" loop with a **socket-pushed prefetch** that lands the next chunk of decrypted messages in the store **before** the user scrolls past the edge. The client tracks an inner **render window** (the FlatList visible range plus overscan); approaching its edge triggers a range request over the existing socket.io connection, decrypted off the JS render path and committed to the store in a single state update — so the next render is served from already-decrypted state and the user does not block on a request.

Cold start (HTTP `GET /v3/sessions/:id/messages`) and live `new-message` push both stay exactly as they are. Only ongoing scroll-driven older-page fetch moves to the new socket protocol, behind the `enableSocketRangeFetch` feature flag. **This is a drop-in replacement for `sync.loadOlder()` — it does not evict any decrypted state.** Bounding the in-memory plaintext footprint requires a real plaintext/render-state split in `storage.ts` plus reducer changes, and is tracked separately in [Open Questions](#open-questions).

Three extents are disjoint and never conflated:

- `sessionLastSeq` — live tail high-water, only ever extended by `new-message`.
- `oldestLoadedSeq` / `hasOlder` — older edge of decrypted state, only ever decreased by prefetch commits (`applyPrefetchedRange`) or the legacy `applyOlderMessages`.
- `renderWindow` — the visible viewport extent, only ever rewritten by viewport ticks via `sync.reportRenderWindow` (or reset to `null` by `sync.onActiveSessionChanged`).

Pending messages (`seq === DEFAULT_UNSEQUENCED_MESSAGE_SEQ` from `packages/happy-app/sources/sync/typesRaw.ts`) are filtered out of every input to `messageWindow.ts`, mirroring `ChatList.boundaryItems.ts`'s `isConfirmed` exclusion.

Relevant entry points:

- `packages/happy-app/sources/sync/messageWindow.ts` — pure window math, prefetch-trigger predicate, range-to-fetch helper.
- `packages/happy-app/sources/sync/prefetchManager.ts` — per-session generation counter, in-flight tracking, abandon-on-(switch|reverse|reconnect).
- `packages/happy-app/sources/sync/applyPrefetchedRange.ts` — pure `mergeOlderMessagesIntoSession` helper shared by the legacy and prefetch storage paths.
- `packages/happy-app/sources/sync/storage.ts` — `setRenderWindow`, `setActivePrefetch`, `applyPrefetchedRange`, `clearActivePrefetch` actions.
- `packages/happy-app/sources/sync/sync.ts` — `reportRenderWindow(sessionId, visibleSeqs)` bridge and `onActiveSessionChanged(sessionId)` reset entrypoint.
- `packages/happy-server/sources/app/api/socket/sessionMessageRangeHandler.ts` — server handler.
- `packages/happy-wire/src/messages.ts` — shared Zod schemas (`SessionMessageRangeRequestSchema`, `SessionMessageRangeResponseSchema`).

## Protocol

A new socket event pair, `session-message-range`, mirrors the encrypted-blob shape of the existing HTTP route at `packages/happy-server/sources/app/api/routes/v3SessionRoutes.ts`. Schemas live in `packages/happy-wire/src/messages.ts` so the app and the server validate the same Zod shape.

### Request

`socket.emitWithAck('session-message-range', SessionMessageRangeRequest)`:

```ts
SessionMessageRangeRequest = {
  requestId: string;   // required, client-generated correlation id (uuid v4)
  sessionId: string;   // required, target session id
  fromSeq: number;     // required, session-local seq, integer, inclusive lower bound (>= 0)
  toSeq: number;       // required, session-local seq, integer, inclusive upper bound (>= fromSeq)
  limit: number;       // required, integer, 1..200 — max messages to return
}
```

All fields are required; no optional fields. `fromSeq`/`toSeq` are **session-local** seq (not the account-global `updateData.seq`). `fromSeq`, `toSeq`, and `limit` are constrained as `z.number().int()` so fractional values are rejected at schema-parse time and never reach Prisma's integer-typed `seq`/`take`.

### Response

The ack callback resolves with a discriminated union keyed on a literal `ok` field. The discriminator follows the existing literal-tag convention (`t`, `role`) used by other unions in `messages.ts`:

```ts
SessionMessageRangeResponse =
  | {
      ok: true;                   // required literal discriminator
      requestId: string;          // required, echoes request
      sessionId: string;          // required, echoes request
      fromSeq: number;            // required, echoes request
      toSeq: number;              // required, echoes request
      messages: SessionMessage[]; // required; empty array allowed (NOT an error)
      hasMore: boolean;           // required; true iff messages exist with seq < fromSeq
    }
  | {
      ok: false;                  // required literal discriminator
      requestId: string;          // required, echoes request
      error: {
        code: 'session_not_found' | 'invalid_range' | 'rate_limited' | 'internal';
        message: string;          // required, human-readable
      };
    }
```

`messages` reuses the existing `SessionMessageSchema` (encrypted blob shape — the server never decrypts).

### `hasMore` semantics

`hasMore: true` means **more messages exist with seq strictly less than `fromSeq`** for this session. It does **not** describe messages newer than `toSeq` — that direction is owned by `sessionLastSeq` and the live `new-message` channel.

The protocol disallows `messages: [] && hasMore: true`. Per-session seq is effectively append-only — `SessionMessage` rows are only deleted as part of whole-session deletion (`packages/happy-server/sources/app/session/sessionDelete.ts`) — so an empty range query immediately below `oldestLoadedSeq` cannot leave older messages unobserved. Tightening the contract this way prevents an infinite-retry loop in the client state machine: `applyPrefetchedRange` leaves `oldestLoadedSeq` unchanged on an empty response, and `computePrefetchOlderRange` derives the next request only from `oldestLoadedSeq` and `pageSize`, so `messages: [] && hasMore: true` would otherwise have produced the same `fromSeq`/`toSeq` request indefinitely.

If a future/buggy server ever returns `messages: [] && hasMore: true`, the client logs a protocol-violation warning and treats it as `hasMore: false` to guarantee progress; it MUST NOT issue a follow-up prefetch under the same `oldestLoadedSeq`.

### Server ownership and empty-result invariants

The handler issues a single account-scoped `findFirst({ id: sessionId, accountId: userId })` lookup. Wrong-owner and never-existed cases return **byte-identical** `code: 'session_not_found'` payloads — the handler does not perform a global-by-id lookup that could reveal cross-account session existence. This mirrors the HTTP route's collapsed 404 at `v3SessionRoutes.ts:64-74`.

`hasMore` is derived from the existing `take: limit + 1` pattern. When the primary message-fetch returns zero rows the handler short-circuits to `hasMore: false` without issuing a separate count or existence query — guaranteeing the client never observes the unprogressable `messages: [] && hasMore: true` state.

## Reconnect / Cleanup Contract

Socket.IO's `connectionStateRecovery` is disabled server-side (`packages/happy-server/sources/app/api/socket.ts`). The prefetch path therefore implements **abandon-and-re-issue**, not mid-prefetch resume. There are three abandon-in-flight paths in the manager, with deliberately different cleanup intensity:

| Path | Caller | Generation bump | `clearActivePrefetch` | Settle terminal `Promise<void>` | Terminal-event kind | Sync-side `prefetchPendingPromises` evict |
|---|---|---|---|---|---|---|
| Reconnect | `apiSocket.onReconnected()` → `manager.onReconnected()` | every tracked session | yes, per in-flight | yes, per in-flight | `abandon-on-reconnect` | yes, in `sync.ts`'s reconnect bridge — `prefetchPendingPromises.clear()` |
| Session switch | `sync.onActiveSessionChanged(prev → next)` → `manager.abandonInFlight(prev)` | previous session only | yes, if in-flight | yes, if in-flight | `abandon-on-cleanup` | yes, `prefetchPendingPromises.delete(prev)` |
| Session delete | `delete-session` handler → `manager.abandonInFlight(sid)` | deleted session only | yes, if in-flight | yes, if in-flight | `abandon-on-cleanup` | yes, `prefetchPendingPromises.delete(sid)` |
| Direction reversal | inside `manager.requestSessionMessageRange` → `manager.bumpGeneration(sid)` | current session only | NO — late-body path covers it | NO — late-body path covers it | none from the bump (the late-body fires `stale-discard`) | n/a — new request immediately follows on the same `sessionId` so the map entry is overwritten |

**Why the asymmetry.** Reconnect and session-switch/delete cannot rely on the abandoned request body running to completion — the transport ack may have been dropped by Socket.IO on disconnect, or the user has navigated away and may never return — so the cleanup is performed synchronously by the manager. Direction reversal happens with the user still on the same session and a new request issued in the same tick, so the abandoned body's `stale-discard` late-cleanup path covers the orphan via the storage `requestId` guard + the closure-captured `settled` flag.

**Promise semantics under all three paths:**

1. The `emitWithAck` promise for any abandoned prefetch is intentionally orphaned. When (or if) it later resolves, the prefetch manager invokes `storage.applyPrefetchedRange(...)` unconditionally inside the per-session lock — and the storage layer itself re-checks `(current.activePrefetch?.requestId === expectedRequestId)` and `(currentGeneration(sessionId) === expectedGeneration)`. On mismatch the call short-circuits to a no-op merge: no message commit, no `oldestLoadedSeq`/`hasOlder` mutation, no `activePrefetch` clear from the success path. The storage layer is the **single source of truth** for the staleness gate.
2. Already-committed plaintext is fine — nothing is rolled back. The next viewport tick that satisfies `shouldPrefetchOlder` re-issues the request under the new generation.
3. **No mid-prefetch resume.** The client does not attempt to resume a partial prefetch across a reconnect; it simply abandons the in-flight request and lets the next scroll re-issue.
4. **Failure / non-commit clear.** Every terminal non-commit exit — (i) `ok: false` ack (any `error.code`), (ii) thrown transport error, (iii) decrypt failure, (iv) closure-mismatch staleness discard inside the lock, (v) reconnect-side `abandon-on-reconnect`, (vi) session-switch / session-delete `abandon-on-cleanup` — routes through a single guarded `storage.clearActivePrefetch(sessionId, expectedRequestId)`. The `clearActivePrefetch` action is guarded by `requestId`, so a late failure-path clear from an abandoned generation cannot blow away a newer in-flight prefetch issued under a bumped generation.
5. The `settle()` resolver captured at request-issue time is **idempotent** through a closure-captured `settled` boolean. So a late-body terminal arriving after the synchronous cleanup already settled the outer promise is a no-op for promise resolution; only an extra terminal event (`stale-discard`) is emitted, which is harmless for the `Promise<void>` contract.

The `requestId` is logged for traceability but is not what makes the discard safe; ack correlation is owned by `emitWithAck`, and staleness is owned by the closure-captured `(sessionId, generation)` re-check inside the per-session lock.

## Feature Flag

`enableSocketRangeFetch` is a **local-only** flag. It lives in `LocalSettingsSchema` / `localSettingsDefaults` in `packages/happy-app/sources/sync/localSettings.ts` with default `true` (flipped from `false` on 2026-04-29 after manual BOOX e-ink verification). It is **not** added to `SettingsSchema` in `packages/happy-app/sources/sync/settings.ts` and is **not** synced across devices, so each device opts in/out independently.

This is intentional: the flag turns on a transport that is sensitive to network/runtime characteristics (Cloudflare/tunnel coalescing, decrypt batch size, available heap). Promotion to the synced `Settings` schema would couple "I tested this on my BOOX tablet" to "every session now uses socket prefetch on every device", which is the wrong default. Cross-device promotion is a follow-up after the BOOX rollout has produced enough field signal.

A user-facing toggle is rendered in `packages/happy-app/sources/app/(app)/settings/appearance.tsx` as an `Item` with a `<Switch>` bound to `useLocalSettingMutable('enableSocketRangeFetch')`, in the same `ItemList` group as `pinchToZoomEnabled` and `chatPaginatedScroll`. The toggle's title and subtitle use the i18n keys `settingsAppearance.socketRangeFetchTitle` / `settingsAppearance.socketRangeFetchDescription`, present in `packages/happy-app/sources/text/_default.ts` and every file under `packages/happy-app/sources/text/translations/`.

When the flag is **off**, `sync.reportRenderWindow` short-circuits before any storage mutation and before any prefetch-manager call, and `sync.loadOlder()` keeps its legacy HTTP cursor behavior — byte-identical to current main. When the flag is **on**, the viewport bridge in `sync.reportRenderWindow` is the only writer of concrete `renderWindow` values from the viewport path and the only caller of `prefetchManager.requestSessionMessageRange(...)`.

The flag-on `sync.loadOlder()` delegate **awaits** the prefetch manager's per-request terminal `Promise<void>` before resolving its own returned promise. This preserves the awaited-commit contract that `handleShowPreBoundaryHistory` (`ChatList.tsx`) depends on — the loop probes `oldestLoadedSeq` after each `await sync.loadOlder()` and breaks when it stops advancing.

## Rollout

**Manual per-device opt-in, starting with the BOOX e-ink target.**

The intended path:

1. Initial implementation shipped with `enableSocketRangeFetch: false` everywhere; BOOX verified the new path against a side-by-side test server with a snapshot of production pglite, then the default was flipped to `true` on 2026-04-29.
2. Devices that explicitly toggled the setting off keep their override; devices that never touched the setting migrate to the new behavior on first launch after upgrade.
3. Users who hit issues can flip the toggle off in **Settings > Appearance > Stream Older Messages** to fall back to legacy HTTP `loadOlder()`.
4. Promotion to a synced `Settings` flag is a separate follow-up, gated on field signal across more device classes.

**No automatic device-class targeting.** `packages/happy-app/sources/utils/responsive.ts` only distinguishes `'phone' | 'tablet'`; it has no concept of "e-ink" vs. "color LCD" or "low-power" vs. "high-power" device. Auto-enabling on `'tablet'` would catch ordinary iPads and color Android tablets along with the BOOX, which is not what the rollout wants. Manual per-device opt-in via the in-app toggle is the only supported path until the device-class taxonomy gains the necessary axis (out of scope for this plan).

## Open Questions

The following follow-ups are deferred and tracked here for the next maintainer:

- **Bounded plaintext memory / eviction (deferred follow-up).** This plan does **not** bound the in-memory plaintext footprint. Plaintext currently lives in three places — `SessionMessages.messages` (array), `SessionMessages.messagesMap` (record at `storage.ts`), and `ReducerState.messages` / `ReducerState.sidechains` (Maps in `reducer/reducer.ts`) — all three plaintext-bearing. Capping any one of them in isolation silently breaks `useMessage()`, `storage.isMutableToolCall`, or the reducer's duplicate-id guards (`reducer/reducer.ts:376/754/943`, which would drop re-fed messages on a naive evict-then-re-feed approach). A real implementation requires a plaintext/render-state split in `storage.ts` plus a reducer rehydrate path that bypasses the duplicate-id guards (or keeps `messagesMap` populated for any id reachable by route navigation, e.g. the message-detail route at `packages/happy-app/sources/app/(app)/session/[id]/message/[messageId].tsx`). Scope and sequencing TBD after this plan ships. Until then, deep scrollback grows linearly — same as the existing `loadOlder()` path.
- **`EncryptionCache` capping.** `packages/happy-app/sources/sync/encryption/encryptionCache.ts` currently keeps up to 1000 decrypted entries by id. Capping it without the bounded-memory follow-up above would not free memory in steady state and could only force redundant redecrypts. Revisit alongside the plaintext/render-state split.
- **Server-side `connectionStateRecovery`.** Whether to re-enable it as a follow-up is open. The current plan does not depend on it; the abandon-and-re-issue contract above is sufficient.
- **Chunked-streaming variant of the socket protocol.** Defer until single-frame measurement shows insufficiency. Cloudflare/tunnel coalescing under realistic chunk sizes is the empirical question; instrument first.
- **Per-session feature-flag override.** App-wide `enableSocketRangeFetch` only; per-session granularity is a future addition if needed.
- **Promotion of `enableSocketRangeFetch` to synced `SettingsSchema`.** Stays local-only by design until BOOX rollout produces field signal.
