# Paid Voice — Rate Limiting & Auth

> **Status note (Sprint D US-005 / US-006):** happy-app's voice surface
> (`realtime/`, `apiVoice.ts`, voice settings screens, `VoiceBars`,
> `VoiceAssistantStatusBar`) was deleted from the mobile client. The
> server-side endpoints below still exist in happy-server and continue to
> enforce the rate-limit / auth contract — any future re-implementation of a
> client-side voice surface must integrate with them.

## Server-Side Rate-Limit Contract

The server owns all usage accounting and token minting. ElevenLabs is the
source of truth — there is no local DB row per conversation.

```
POST [deleted voice route] { agentId }
│   (preHandler: app.authenticate)
│
├─ deriveElevenUserId(userId) = "u_" + base64url(HMAC-SHA256(HANDY_MASTER_SECRET, userId))
│
├─ getVoiceUsage(elevenUserId)
│   └─ GET https://api.elevenlabs.io/v1/convai/conversations
│            ?user_id=<elevenUserId>&created_after=<30d>&page_size=100
│        → { usedSeconds = Σ call_duration_secs, conversationCount }
│
├─ conversationCount >= 100?           → { allowed: false, reason: "voice_conversation_limit_reached" }
├─ usedSeconds >= 18000 (5h)?          → { allowed: false, reason: "voice_hard_limit_reached" }
├─ usedSeconds >= 1200 (20m) && !sub?  → { allowed: false, reason: "subscription_required" }
│       (subscription via RevenueCat /v2/projects/.../active_entitlements)
│
├─ GET /v1/convai/conversation/token?agent_id=X&participant_name=<elevenUserId>
│   └─ Decode JWT → extract conv_id from video.room (matches /conv_[A-Za-z0-9]+/)
│
└─ Return { allowed: true, conversationToken, conversationId, agentId,
            elevenUserId, usedSeconds, limitSeconds }

GET [deleted voice route]
│   (preHandler: app.authenticate)
└─ Parallel: getVoiceUsage(...) + hasActiveSubscription(userId)
   → { usedSeconds, limitSeconds, conversationCount, conversationLimit, elevenUserId }
```

Implementation: `packages/happy-server/sources/app/api/routes/voiceRoutes.ts`.
Response schemas: `packages/happy-wire/src/voice.ts`
(`VoiceConversationResponseSchema`, `VoiceUsageResponseSchema`).

## Limits

| Tier | Limit | Window | Cost to us | What happens |
|------|-------|--------|------------|--------------|
| Free | 20 min | 30 days | ~$0.19 | Paywall |
| Subscribed | 5 hours | 30 days | — | Hard block → BYO agent |
| BYO Agent | Unlimited | — | $0 | User's own ElevenLabs |
| Any | 100 conversations | 30 days | — | Hard block → file issue |

Cost: ~$0.01/min ($1600 / 171K min measured).

Constants in `voiceRoutes.ts`:
- `VOICE_FREE_LIMIT_SECONDS = 1200`
- `VOICE_HARD_LIMIT_SECONDS = 18000`
- `VOICE_MAX_CONVERSATIONS = 100`

## Tracking

ElevenLabs is the source of truth. No local DB.

- `participant_name` on token mint → sets `user_id` on conversation record
- Usage: `GET /conversations?user_id=Y&created_after=<30d>&page_size=100` → sum durations
- `user_id` = HMAC-SHA256 of Happy user ID (deterministic, one-way)
- Max page_size is 100 → at 100 conversations we block (can't track more without pagination)

**TODO:** Remove `VoiceConversation` model from Prisma schema (no longer used, DB table can be dropped).

## Paywall Flows (RevenueCat)

These flow identifiers were used by the now-deleted client surface and
remain documented here as the contract any future voice client would carry
back into the paywall. A single paywall template is keyed off custom
variable `flow`:

| Flow | When | Behavior |
|------|------|----------|
| `voice_trial_eligible` | Feature flag variant `show-paywall-before-first-voice-chat`, first free voice use | Soft — dismissable, voice starts anyway |
| `voice_must_pay` | Server returns `allowed: false` | Hard — must purchase |
| `voluntary_support` | Settings | User-initiated |

### Future: Voice Agent Self-Sell

Have the agent mention pricing naturally. Inject `usedSeconds`/`limitSeconds` into context, add `showUpgradePaywall` client tool.

## Security

- JWT signed by ElevenLabs, single-use, can't be forged
- Agent set to "authorized only" — needs server-minted token
- Agent ID in public repo is harmless
