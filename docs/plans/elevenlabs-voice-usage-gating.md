# ElevenLabs Voice Usage Gating

> **Status: blocked — re-scope required before reactivating.**
> Sprint D removed the happy-app voice surface this plan targeted (commit `db96a40f`, US-005 / US-D4). The app-side files this plan referenced — `sync/apiVoice.ts`, `realtime/RealtimeSession.ts`, `realtime/RealtimeVoiceSession.tsx`, `realtime/RealtimeVoiceSession.web.tsx`, `realtime/types.ts`, plus the rest of `realtime/` and the voice settings screens — no longer exist. The server-side `[deleted voice route]` route and `ELEVENLABS_API_KEY` plumbing are still present, so the usage-gating contract described below remains potentially valuable as prior art for a future re-implementation. Do not treat the client-side sections as actionable until a new voice surface is designed.

## Problem

We want to require a subscription after a user has consumed 1 hour of ElevenLabs conversation time.

For the first version, the constraints are:

- no local usage DB
- no post-call webhook ingestion
- no mid-call cutoff
- first page of ElevenLabs conversation history is acceptable

That means the gate runs only when a new voice session starts. If a user crosses the threshold during an active call, that call continues and the block applies on the next session start.

## Current Repo State

Sprint D US-005 (commit `db96a40f`) deleted the happy-app voice surface this plan was written against. As of this revision:

- `packages/happy-app/sources/sync/apiVoice.ts` — **deleted**.
- `packages/happy-app/sources/realtime/RealtimeSession.ts` — **deleted**.
- `packages/happy-app/sources/realtime/RealtimeVoiceSession.tsx` — **deleted**.
- `packages/happy-app/sources/realtime/RealtimeVoiceSession.web.tsx` — **deleted**.
- `packages/happy-app/sources/realtime/types.ts` and the rest of `packages/happy-app/sources/realtime/` — **deleted**.
- `packages/happy-app/sources/app/(app)/settings/voice.tsx` and the voice settings sub-routes — **deleted**.
- The `experiments=true|false` voice branches and the `revenueCatPublicKey` client payload no longer exist on the app side.

Server-side scaffolding is unchanged and still relevant for any future re-implementation:

- Server token route: `packages/happy-server/sources/app/api/routes/voiceRoutes.ts` — still present, still reads `ELEVENLABS_API_KEY`, still documented in `docs/deployment.md`.
- `packages/happy-server/deploy/handy.yaml` still extracts `/handy-elevenlabs` and `/handy-revenuecat`.

Before any of the changes below can land, a new app-side voice surface needs to be designed and built. The historical client-side notes (paywall flow, `experiments` flag, `400 => allowed:true` fallback) are retained only as a record of what previously existed.

## Existing Secret Assumptions

The repo already assumes ElevenLabs API access exists on the server:

- `packages/happy-server/sources/app/api/routes/voiceRoutes.ts` reads `process.env.ELEVENLABS_API_KEY`.
- `packages/happy-server/deploy/handy.yaml` extracts `/handy-elevenlabs`.
- `docs/deployment.md` documents `ELEVENLABS_API_KEY` as required for `[deleted voice route]` in production.

The app does not currently have an ElevenLabs API secret. Client config only carries public values such as RevenueCat public keys and ElevenLabs agent IDs.

## Decision

Implement a stateless-at-runtime preflight check that uses ElevenLabs as the system of record:

1. Derive a stable pseudonymous ElevenLabs `user_id` from the Happy user ID.
2. Before issuing a conversation token, query ElevenLabs conversation history for that `user_id`.
3. Read only the first page.
4. Sum `call_duration_secs` across the returned conversations.
5. If cumulative duration is below 3600 seconds, allow voice.
6. If cumulative duration is 3600 seconds or above, require an active subscription.
7. If allowed, mint and return an ElevenLabs conversation token.
8. Start the ElevenLabs session using the same stable `user_id`.

Use a stable pseudonymous ID, not a random nonce. Recommended shape:

`elevenUserId = "u_" + base64url(HMAC_SHA256(APP_SECRET, happyUserId))`

This keeps the join key stable across sessions without exposing the raw Happy account ID to ElevenLabs.

## External APIs

As of 2026-03-24, the relevant ElevenLabs APIs are:

- SDK session start supports passing `userId`
  - https://elevenlabs.io/docs/conversational-ai/libraries/react
- Low-level personalization payload supports `user_id`
  - https://elevenlabs.io/docs/eleven-agents/customization/personalization
- Conversation history can be listed with `user_id`, and responses include `call_duration_secs`
  - https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/list
- ElevenLabs API authentication uses `xi-api-key`
  - https://elevenlabs.io/docs/api-reference/authentication

No new ElevenLabs credential is needed beyond the existing server-side `ELEVENLABS_API_KEY`.

## Proposed Control Flow

```text
User taps mic
  |
  v
startRealtimeSession(sessionId, initialContext)
  |
  +--> request microphone permission
  |
  +--> load JWT credentials
  |
  +--> determine agentId from app config
  |
  v
POST [deleted voice route]
  Authorization: Bearer <jwt>
  body: { sessionId, agentId }
  |
  v
Server authenticates JWT
  |
  +--> request.userId = Happy account id
  |
  +--> derive stable elevenUserId from request.userId
  |
  +--> load ELEVENLABS_API_KEY from env
  |
  +--> GET /v1/convai/conversations?user_id=<elevenUserId>&page_size=100&summary_mode=exclude
  |      header: xi-api-key: ELEVENLABS_API_KEY
  |
  +--> sum conversations[*].call_duration_secs on first page only
  |
  +--> totalSeconds < 3600 ?
  |      |
  |      +--> yes: allow
  |      |
  |      +--> no:
  |             check subscription entitlement
  |               |
  |               +--> active subscription: allow
  |               |
  |               +--> no subscription:
  |                      return {
  |                        allowed: false,
  |                        reason: "voice_limit_reached",
  |                        usedSeconds: totalSeconds,
  |                        limitSeconds: 3600
  |                      }
  |
  +--> if allowed:
         GET /v1/convai/conversation/token?agent_id=<agentId>
           header: xi-api-key: ELEVENLABS_API_KEY
         return {
           allowed: true,
           token,
           agentId,
           elevenUserId,
           usedSeconds: totalSeconds
         }
  |
  v
Client receives response
  |
  +--> allowed = false
  |      |
  |      +--> present paywall
  |      +--> if purchased/restored: sync purchases and retry
  |      +--> if cancelled: do not start voice
  |
  +--> allowed = true
         |
         +--> start ElevenLabs session with:
                - conversationToken
                - userId = elevenUserId
                - dynamicVariables.sessionId
                - dynamicVariables.initialConversationContext
  |
  v
ElevenLabs records the conversation under user_id = elevenUserId
  |
  v
Next mic tap repeats the same preflight check
```

## Important Limitations

- First page only is not exact lifetime accounting. It is only the sum of the returned page.
- If ElevenLabs has more matching conversations than the first page, this can undercount.
- If ElevenLabs changes or does not document the exact sort order of the list endpoint, relying on the first page is inherently approximate.
- Because the gate runs only at session start, users can exceed 1 hour during an active conversation.
- No local state means no reconciliation, no idempotency, and no protection against concurrent starts beyond what ElevenLabs history already reflects.

## Required Code Changes

### Server

Update `packages/happy-server/sources/app/api/routes/voiceRoutes.ts` to:

- derive and return `elevenUserId`
- query ElevenLabs conversation history before minting a token
- sum `call_duration_secs`
- return structured denial when the user is over the free threshold and unsubscribed
- stop relying on client-supplied `revenueCatPublicKey`
- perform subscription verification server-side if paywall remains part of the product

Preferred response shape:

```ts
type VoiceTokenResponse =
  | {
      allowed: true;
      token: string;
      agentId: string;
      elevenUserId: string;
      usedSeconds: number;
      limitSeconds: number;
    }
  | {
      allowed: false;
      reason: 'voice_limit_reached' | 'subscription_required';
      usedSeconds: number;
      limitSeconds: number;
      agentId: string;
    };
```

### Client

**Blocked.** The files this section previously enumerated were deleted in Sprint D US-005 (`db96a40f`):

- `packages/happy-app/sources/realtime/types.ts` — deleted
- `packages/happy-app/sources/realtime/RealtimeVoiceSession.tsx` — deleted
- `packages/happy-app/sources/realtime/RealtimeVoiceSession.web.tsx` — deleted
- `packages/happy-app/sources/realtime/RealtimeSession.ts` — deleted
- `packages/happy-app/sources/sync/apiVoice.ts` — deleted

There is no current happy-app voice client to modify. A future re-implementation would need to recreate an equivalent surface (token fetch, session start, paywall handling) before applying the behavioural changes that were originally planned:

- add a `userId?: string` field to whatever replaces `VoiceSessionConfig`
- pass `userId` into `conversationInstance.startSession(...)` on the new ElevenLabs client wrapper
- do not reintroduce a `400 => allowed:true` fallback when fetching the token
- decide up front whether voice gating applies to all users or only an experimental cohort, instead of reintroducing an `experiments=false` bypass
- retry the token request after a successful purchase

## Subscription Check

If the product still wants a paywall after the free threshold, the subscription check should be server-side.

Current `main` is mismatched:

- the server expects `revenueCatPublicKey` from the client
- the client no longer sends it
- the deployment already extracts `/handy-revenuecat`

Preferred fix:

- use a server-side RevenueCat credential or another trusted subscription source
- keep RevenueCat public keys only for rendering the client paywall
- treat the client purchase result as a hint, then verify entitlement on the server before issuing a token

## Testing

### Server tests

Add route tests for:

- no prior ElevenLabs conversations
- first page total below threshold
- first page total exactly at threshold
- first page total above threshold with no subscription
- first page total above threshold with active subscription
- missing `ELEVENLABS_API_KEY`
- ElevenLabs history API failure
- ElevenLabs token API failure

### Client tests

Add tests for:

- allowed response with token
- denied response presents paywall
- successful purchase retries the request
- cancelled purchase does not start voice
- `userId` is threaded into `startSession(...)`
- voice gating still happens when experimental settings are disabled, if that is the desired product behavior

### Manual verification

1. Run against a production-like server with `ELEVENLABS_API_KEY` configured.
2. Use a stable test account so the derived `elevenUserId` is consistent across runs.
3. Seed the account with enough ElevenLabs conversation duration to land below and above 3600 seconds.
4. Verify:
   - below threshold: voice starts
   - above threshold + no subscription: paywall appears and voice does not start
   - above threshold + active subscription: voice starts
5. Confirm ElevenLabs sessions are created with the expected `user_id`.

## Prior Art

There is older server-only free-trial work in the legacy `slopus/happy-server` repository on branch:

- `charge-for-voice-after-3-trail-conversations`

That branch tracked free trials using database counters, not ElevenLabs duration history. It is useful as prior art for gating shape and server-side entitlement checks, but it does not implement the 1-hour cumulative duration design described here.
