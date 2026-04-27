# Message Disk Persistence — Design Notes

Status: **Not implemented**. Captured 2026-04-26 while debugging slow older-page loads on the e-ink tablet.

## Current State

What persists across app launches (MMKV via `packages/happy-app/sources/sync/persistence.ts`):

- `settings` (server settings + version)
- `localSettings` (theme, font scale, etc.)
- `pendingSettings`
- `purchases`
- `sessionDrafts` (in-progress composer text)
- `sessionPermissionModes`
- `newSessionDraft`
- `registeredPushToken`
- `themePreference`

What lives **only in Zustand in-memory state** (`storage.ts`):

- `sessions` (session list metadata)
- `sessionMessages[sessionId]` (loaded window of decrypted messages, `oldestLoadedSeq`, `hasOlder`, `loadingOlder`)
- `sessionFileCache`
- `friends` / `users`
- All sync state

Implication: every cold start (force-quit, OS-killed-for-memory, low-RAM eviction) wipes session messages. The next chat open re-fetches the recent window via `GET /v3/sessions/{id}/messages?after_seq=N&limit=80` over HTTP, then decrypts each message via libsodium.

Older-page pagination (`sync.loadOlder` in `packages/happy-app/sources/sync/sync.ts:259`) is also always-remote: each scroll-to-top boundary triggers a fresh HTTP fetch + decrypt round-trip. There is no layer that says "I already saw seq=3..82 yesterday — give me from local first."

## Problem

1. **Cold-start latency.** First chat open on a fresh launch always pays HTTPS RTT + libsodium decrypt for the recent window. On weak CPUs (the e-ink tablet) the decrypt can dominate.
2. **Force-quit cost.** Force-quit / OS-kill blows the in-memory window. Re-opening the same chat re-fetches the same data already fetched minutes ago.
3. **No offline mode.** WiFi flap → fetches fail → user sees nothing for chats not currently in memory. (We saw this during the chat-rename test session: WS held but HTTP fetches failed; loaded chats kept rendering, unloaded ones showed empty.)
4. **Pagination cost.** Scrolling to the very top of a long chat fetches each older page sequentially. With ~80 messages per page over LTE on the tablet, this is visibly not-instant — exactly the user's question that prompted this doc.

## Why it Wasn't Done

The `lazy-load-long-chats` work (commit `1da743db feat: US-002 - Tier 1 - Cap initial message fetch window + pagination state`) introduced the pagination shape (`oldestLoadedSeq`, `hasOlder`, `computeOlderPageAfterSeq`) but stopped at the in-memory layer. Disk persistence was an explicit non-goal for Tier 1 — the hard problem there was "don't OOM on a 5000-message session", which the windowed in-memory state already solves.

A side note: the encrypted-metadata model (libsodium per-message) means whatever we persist must either be (a) the encrypted ciphertext (cheap to store, but every cold-start read still pays decrypt) or (b) plaintext (avoids re-decrypt on hot paths but raises a real question about device-storage threat model — see "Open Questions" below).

## Approaches to Consider

### A — MMKV-as-blob (simplest)

- On every `applyMessages` / `applyOlderMessages` call: serialize `sessionMessages[sessionId]` to MMKV under key `messages:{sessionId}`.
- On `useSessionMessages` first read for a session id: hydrate from MMKV into Zustand state, then issue the existing fetch to top up newer messages.
- Eviction: LRU by chat last-open time, capped (e.g. 50 chats × 200 msgs ≈ a few MB).
- Invalidation: on session-version-mismatch from server, drop the local copy and refetch.

Pros: minimal code, MMKV is already imported. Hot-start opens existing chats in <50 ms.
Cons: MMKV is a single mmap-backed key-value store; large blobs serialize the whole session on each apply. Acceptable for ≤200 messages, gets ugly for 5000.

### B — SQLite via expo-sqlite (correct long-term)

- Schema: `messages(session_id, seq, id, created_at, content_blob_decrypted_json)` with index on `(session_id, seq)`.
- `loadOlder` consults SQLite first for `seq IN (afterSeq+1, oldestLoadedSeq-1)`, fetches from server only the gap.
- Backfill on background sync.
- Survives session-version bumps via per-session counter on `session_id`.

Pros: scales to long chats, indexed range queries, consistent with how iMessage / Slack desktop handles this.
Cons: schema migration story, larger surface area, expo-sqlite adds a native dep we don't currently use.

### C — Service-worker-style HTTP cache for `/v3/sessions/{id}/messages`

Reject. The `apiSocket.request` path uses authenticated `Authorization: Bearer ...` headers and the response body is encrypted; a generic HTTP cache on top doesn't avoid the libsodium decrypt anyway, which is the actual bottleneck on e-ink CPU.

## Recommended Direction

**Approach A (MMKV blob) as a first step**, scoped to:
- Persist only chats opened in the last N days (e.g. N=14). Older chats stay remote-only.
- Skip persistence for sessions where `metadata.private === true` if such a flag exists (worth checking).
- Hydrate on session-detail screen mount, not on app launch (lazy — don't blow startup budget).
- Add a `clear-message-cache` setting under Dev or Settings → Storage, and a `Clear all chats` button.
- Add invalidation: when the sync-version bumps for a session, drop its blob.

If Approach A's per-apply serialize cost shows up in profiling on the tablet, escalate to Approach B for long chats only.

## Open Questions

- **Threat model for plaintext-on-device.** We persist decrypted message text to local storage (MMKV is not encrypted at rest by default unless we use the encryption-key constructor). What's the user's expectation here? An attacker with physical access can already pull MMKV files out of the app sandbox on a rooted Android. We probably want MMKV's `encryptionKey` constructor for the messages blob, with the key stored in EncryptedSharedPreferences / Keychain.
- **Sync race.** If the server has new messages we haven't seen, hydrating from MMKV and *then* fetching newer messages opens a brief window where the UI shows stale state. Existing socket-recv path patches this, but worth modeling explicitly.
- **Storage budget.** Need a real measurement on a tablet with 50+ chats. MMKV's mmap'd file behavior under low free space is unclear.
- **Multi-device fan-out.** When another device renames a chat (the chat-rename feature we just shipped), the sync is via `update-metadata`. If we persist `sessionMessages` and the session metadata changes on disk via a different code path, we need to make sure they don't drift.
- **Initial cold-start vs hot-start measurement.** Before implementing, get numbers: how long does a typical chat open take on the e-ink tablet today (cold vs hot)? The fix only matters if cold is meaningfully worse.

## Non-Goals

- Full offline mode (compose+queue while disconnected). Out of scope for this doc; that's a much larger feature touching the WS reconnect / outbox.
- Message search across local cache. Separate feature.
- Cross-device message sync via local store. The server is the source of truth; local is read-cache only.

## Resolved Adjacent Issue: New-Session Recv Race

Observed on the e-ink tablet 2026-04-26 and **fixed in the same session**: when a brand-new session was created from another device (e.g. PC), opening it on the tablet **before the new-session handler had finished** showed an empty chat that only self-corrected after a full app restart.

Root cause was two compounding bugs in `packages/happy-app/sources/sync/sync.ts`:

1. **`session.seq` corruption** — `new-message` (line 1915) and `update-session` (line 2043) handlers wrote `updateData.seq` (account-global update counter, e.g. 20596) into `session.seq` (session-local message counter, e.g. 1). Then `fetchMessages` cold-start fed the corrupted value into `computeInitialAfterSeq(20596, 80)` and asked the server for messages in seq range 20517-20596, which was empty for a brand-new session. Fix: drop the `seq:` field from both `applySessions(...)` calls; `session.seq` is now only ever written by `fetchSessions` (server-authoritative).
2. **Encryption-load race** — `new-session` only invalidated `sessionsSync` (deferred). `new-message` events that arrived before encryption keys finished loading silently bailed via fire-and-forget `fetchSessions()`. Fix: queue raw events in `pendingNewMessages` keyed by sid, await `sessionsSync.invalidateAndAwait()`, then replay them with `isReplay=true` (the replay guard prevents infinite loops if encryption is genuinely unavailable).

Implications for the disk persistence design above:
- The `session.seq` field is now reliably session-local. Persisting sessions to MMKV no longer risks freezing a corrupted seq into the cache.
- The encryption-load race is fixed at the recv layer, not the persistence layer. If we add disk persistence later, we still need to make sure encryption is initialized before replaying persisted message batches — same invariant as the live recv path.

## Pointers

- Pagination math + the off-by-one fix that triggered this conversation: `packages/happy-app/sources/sync/paginationMath.ts`
- Older-page fetch logic: `packages/happy-app/sources/sync/sync.ts:259-334` (`loadOlder`)
- Apply path that would need a "persist after apply" hook: `packages/happy-app/sources/sync/storage.ts:787` (`applyOlderMessages`)
- Existing MMKV usage pattern: `packages/happy-app/sources/sync/persistence.ts`
- Server endpoint: `GET /v3/sessions/{id}/messages?after_seq=N&limit=M` (returns encrypted blobs + `hasMore`)
