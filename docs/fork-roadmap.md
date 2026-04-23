# Fork roadmap

Deferred work for the personal [Evyatar108/happy](https://github.com/Evyatar108/happy) fork, roughly in priority order. Shipped items live in `docs/fork-notes.md`; this file is the backlog.

Ranking is by **e-ink tablet quality-of-life** (the fork's primary target), then by effort. An item marked *(optional)* means "ship as a user-facing toggle, not as default behaviour."

## Near-term

### Upcoming — Upstream merge batch (2026-04-22)

**What:** Cherry-pick ~10 curated open PRs from `slopus/happy` into the fork's `main` as a single integration batch. Mix of zero-risk correctness fixes and CLI bug fixes, saved from the 2026-04-22 triage pass.

**Plan:** [`docs/plans/upstream-merge-batch-2026-04-22.md`](plans/upstream-merge-batch-2026-04-22.md) — full per-PR breakdown, execution order, verification gates, rollback plan.

**Headline PRs:** #1061 (filter isMeta — pairs with our #779 fix so plugin skill bodies no longer flood chats), #1145 (reducer text-loss), #633 (tool_result schema crash), #1101 (base64 stack overflow), #1049 (change_title persist), #1157 (permission mode mapping).

**Risk spot:** #690 touches the `--settings` flag path that our #779 fix owns — plan saves it for last with an explicit 30-min abort criterion.

**Complexity:** 1.5–3 hours interactive, partially delegable to a general-purpose agent per PR.

---

### Handle intercepted slash commands before session metadata arrives

**What:** Client-side slash-command intercepts (`/plugin`, `/skills`, `/agents`, etc. in `sources/hooks/usePreSendCommand.ts`) short-circuit into catalog screens without ever reaching the CLI. In a freshly-spawned local-mode session that hasn't produced metadata yet (shadow SDK session hasn't settled, or the user hasn't sent a real message to trigger the local→remote switch), tapping `/plugin` lands on a permanently-looking empty catalog. Today's band-aid: the catalog screens show `Loading…` while `session.metadata.tools === undefined`, but that's open-ended if metadata never arrives.

Need to pick one:
- **Explanatory nudge** — when an intercepted catalog command fires on a session with no metadata yet, surface a toast/banner ("Session hasn't loaded yet — send any message first") instead of (or alongside) the Loading… state. Low-risk, pure app-side.
- **Auto-trigger session warm-up** — on intercept, send a no-op/ping to the CLI (or prompt the user to) so the local-mode session exercises its shadow SDK query path and produces metadata. More work; risks sending unintended messages.

**Relevant files:**
- `packages/happy-app/sources/hooks/usePreSendCommand.ts` — intercept site
- `packages/happy-app/sources/sync/slashCommandIntercept.ts` — intercept table
- `packages/happy-app/sources/app/(app)/session/[id]/{plugins,skills,agents}.tsx` — Loading… UI today
- `packages/happy-cli/src/claude/claudeLocalLauncher.ts` — where a warm-up would land

**Complexity:** small for option A (~30 min), medium for option B (touches CLI + wire + app).

---

### Interactive `/plugin`, `/skills`, `/agents` via the remote session

**What:** Today the intercepted slash commands (`usePreSendCommand.ts` → session-scoped catalog screens) are strictly read-only — they show lists/info harvested from SDK init metadata. Claude Code's real `/plugin` TUI is interactive (install, uninstall, enable/disable, browse marketplaces, etc.); the fork currently can't do any of that from mobile.

Bring interaction parity by routing these commands through the session instead of intercepting them:
- Let the slash command reach the CLI (bypass the app-side intercept for these specific commands, or keep the intercept but add "open in terminal"-style action handoff).
- In remote mode the SDK can invoke the plugin subsystem directly; surface its prompts/choices back to the app via an existing RPC pattern (mirrors how permission prompts already work — see `packages/happy-cli/src/claude/mcp/startPermissionServer.ts`).
- In local mode the PTY-attached Claude already handles interactivity; the challenge is mirroring its TUI prompts to the app. Simplest: force-switch to remote mode when an interactive catalog command fires (ties into the "warm-up" option in the item above).

Behavioral question to decide upfront: do these become **replacements** for the read-only screens (unified interactive view) or a separate "Manage" action from within today's catalogs? Read-only-first is probably still the right default on e-ink (cheap render, no round-trips); interactive mode would be an explicit affordance.

**Relevant files:**
- `packages/happy-app/sources/sync/slashCommandIntercept.ts` — intercept table; decide which stay read-only vs. pass-through
- `packages/happy-app/sources/app/(app)/session/[id]/{plugins,skills,agents}.tsx` — extend with action rows or link to an interactive view
- `packages/happy-cli/src/claude/claudeRemote.ts` — remote SDK stream; where interactive prompts would surface
- `packages/happy-cli/src/claude/mcp/startPermissionServer.ts` — existing pattern for CLI-originated prompts → mobile → CLI round-trip
- `packages/happy-wire/` — any new RPC shapes for plugin actions

**Complexity:** medium–large. Read-only-plus-select-actions (enable/disable toggles) could ship as a first slice in ~1 day; full install/uninstall/marketplace UI is a multi-day project and should probably be a standalone feature PR.

---

### Lazy-load long chats + cap initial message fetch

**What:** Opening a long chat today is slow because the sync layer fetches **every** historical message up-front before the `ChatList` even mounts. `packages/happy-app/sources/sync/sync.ts:1649` loops `while (hasMore)` over `/v3/sessions/:id/messages?after_seq=...&limit=100`, pulling, decrypting, and normalizing the entire history before the first render. `ChatList` uses vanilla `FlatList` (`packages/happy-app/sources/components/ChatList.tsx:170`) with no virtualization tuning — it does virtualize rendering by default, but every message is in memory + normalized. On e-ink CPUs (see `devices.md`) this is the dominant cost.

Two-part fix:
1. **Cap the initial fetch** to the N most recent messages (inverted FlatList means "most recent" = what the user sees first). Expose a `loadOlder()` entry point triggered by `onEndReached` (which, in an inverted list, fires when scrolling toward older messages). Server already supports seq-based pagination; app side needs a "stop at N, remember oldest seq, resume from there" state machine. Touch points: `sources/sync/sync.ts` (`fetchMessages` loop — add a `maxInitial` guard + lazy-fetch method), `sources/sync/storage.ts` (per-session "hasOlder" flag), `sources/components/ChatList.tsx` (`onEndReached` + throttle). Keep tail-follow behavior intact via the existing `maintainVisibleContentPosition`.
2. **Tune FlatList virtualization knobs for e-ink** — set `initialNumToRender`, `maxToRenderPerBatch`, `windowSize`, and (conditionally) `removeClippedSubviews` to smaller values than FlatList's defaults. These numbers trade render quality during fling for lower steady-state memory; e-ink doesn't fling, so we can be aggressive. Optionally swap `FlatList` → `@shopify/flash-list` if the gain is meaningful (risk: maintenance churn + extra dep; measure first).

**Clarification on "don't render all messages in the remote":** The app already virtualizes view rendering via FlatList — only messages near the viewport mount. The real bottleneck is **state/sync**: every message is decrypted, normalized, and held in the store regardless of whether it will ever render. The fix above addresses that at the fetch boundary.

**Why this matters for e-ink:** slow decrypt + slow normalize + large JS heap → multi-second time-to-first-render on cold chat open → user sees a blank white screen long enough to assume the app hung.

**Relevant files:**
- `packages/happy-app/sources/sync/sync.ts:1630–1690` — `fetchMessages` loop to refactor
- `packages/happy-app/sources/sync/storage.ts` — per-session pagination state
- `packages/happy-app/sources/sync/apiFeed.ts`, `packages/happy-app/sources/sync/apiTypes.ts` — wire shapes (server already supports seq cursors)
- `packages/happy-app/sources/components/ChatList.tsx` — FlatList props + `onEndReached`
- `packages/happy-app/sources/sync/reducer/messageToEvent.ts` — confirm reducer tolerates out-of-order arrivals when older batches land after newer state

**Complexity:** medium. (1) is a ~1-day job with careful testing on the tail-sync / in-flight-streaming edge cases. (2) is ~1 hour of tuning + measurement. Do (2) first — it may buy enough perf to make (1) lower priority.

**Verification:** time-to-interactive on a session with >1000 messages, on the Onyx tablet (per `devices.md`).

---

### 5. Hardware page-turn key support

**What:** Capture Android `KeyboardEvent` for `DPAD_UP`/`DPAD_DOWN` (and optionally volume keys) in `ChatList`. Scroll by ~90% of viewport height per press. Opt-in toggle.

**Why:** Most e-ink tablets (Boox, Onyx, Bigme) have physical page buttons; wiring them to scroll-by-viewport is the single most "this tablet actually makes sense for Happy" moment.

**Complexity:** small (~half a day), assuming DPAD events pass through the RN event system. Volume keys often get intercepted at the OS level; doc that limitation.

**Pairs with the shipped page-turn mode (item 4):** when paginated mode is on, these keys should cause a page flip instead of a scroll-offset change.

---

## Known follow-ups from the 2026-04-22 PR-A..PR-D ship

Code-review findings that were intentionally deferred (documented in
`.ralph/jobs/chat-text-ux-eink/code-review-findings.json`):

### 6. Scale `ToolError.tsx` + `PermissionFooter.tsx` typography *(F-020)*

**What:** `sources/components/tools/ToolError.tsx` (error line) and
`sources/components/tools/PermissionFooter.tsx` (permission buttons, hint copy)
still use fixed-size text that doesn't go through `useChatScaledStyles` /
`useChatFontScaleOverride`. These render inline in every tool call, so they
visibly lag behind the rest of the chat when `chatFontScale > 1.0`.

**Why not in PR-A:** these components were outside PR-A's declared scope
(the plan's story list named specific per-tool views only). The "every
piece of chat typography" goal implicitly includes them though.

**Complexity:** small (~30 min). Follows the same pattern as
`TaskView` / `TodoView` — import `useChatFontScaleOverride` or
`useChatScaledStyles`, apply to the text styles, done.

### 7. Scale `ToolFullView.tsx` non-code chrome *(F-021)*

**What:** `sources/components/tools/ToolFullView.tsx` — the full-screen
tool-detail route — wires `scaled` through to its embedded `CodeView`
blocks but leaves its own non-code chrome (section titles, descriptions,
error text, empty-state strings) at fixed sizes. Opening a generic tool's
full view snaps typography back to base.

**Why not in PR-A:** explicitly deferred in the plan's Open Questions to
keep PR-A focused ("Deliberately out of scope for PR-A to keep the PR
focused. Filed as a small follow-up.").

**Complexity:** small (~45 min). Same pattern; touches ~5 style entries
in one file.

---

## Further out (mentioned in brainstorm, not planned yet)

- **Stream throttle / "quiet mode"** during agent streaming — coalesce token-by-token updates into 1–2 Hz redraws on e-ink. Biggest latent e-ink win but touches the message reducer, not just presentation.
- **E-ink display profile** (single switch bundling: no animations, Skia fallbacks for `VoiceBars`/`ShimmerView`/`AvatarSkia`, monochrome theme, `animationEnabled: false` on navigation). Builds on top of the above.
- **"Collapse noise" defaults** — default-collapse tool-call views, default-hide thinking, cap long bash output.

---

## Shipped (see `docs/fork-notes.md` for details)

### 2026-04-22 — Native & installed Claude Code skills support on `main` (merged from `feat/native-and-installed-skills-support`)

Merge commit `019a6109`; 20 commits stacked on the `fix/preserve-user-settings-for-plugin-skills` prerequisite. Plan + DSAT in `.ralph/jobs/native-and-installed-skills-support/`.

1. **Prerequisite #779 fix (`317fce8a`)** — `fix(cli): preserve enabledPlugins + MCP fields when passing --settings`. Without it, plugin-provided skills never reach the SDK's `slash_commands` emission. Upstream PR still TBD.
2. **Metadata forwarding CLI + app (US-001, US-002 — `b5d7f1fd`, `6ab3c9d0`)** — widened `onSDKMetadata` in `packages/happy-cli/src/claude/claudeRemote.ts` to forward `skills`, `agents`, `plugins`, `outputStyle`, `mcpServers`; extended the CLI `Metadata` type and the app-side `MetadataSchema` (`packages/happy-app/sources/sync/storageTypes.ts`) with matching optional fields. Wire/server unchanged (opaque encrypted passthrough).
3. **Classification picker (US-003, US-004 — `ed8223c9`, `8967509d`)** — replaced `IGNORED_COMMANDS` blocklist with an allowlist tagged by `CommandItem.source: 'native-prompt' | 'native-local' | 'skill' | 'plugin' | 'app-synthetic'`. Picker cap raised 5→15 (later aligned across test + production via shared constant in F-001/F-007). English description map for 16 commands (9 SDK built-ins + 7 app-synthetic).
4. **Pre-send intercept (US-005, US-006 — `e2f35101`, `cc387d69`)** — new `sources/sync/slashCommandIntercept.ts` + `sources/hooks/usePreSendCommand.ts`; both composer paths (`-session/SessionView.tsx` and `app/(app)/new/index.tsx`) intercept synthetic slash commands before `sync.sendMessage()` / `machineSpawnNewSession()`. Seven synthetic TUI entries (`/plugin`, `/skills`, `/agents`, `/memory`, `/model`, `/mcp`, `/help`); three route to session-scoped screens, four fall back to `Modal.alert` with a "run in terminal" hint.
5. **Three catalog screens (US-007..US-009 — `c8ab4bd7`, `71173b96`, `2d72e65f`)** — new read-only `app/(app)/session/[id]/{plugins,skills,agents}.tsx`, registered in `app/(app)/_layout.tsx`, linked from the session-info screen. Session-scoped (`[id]` route param) since metadata is per-session.
6. **Code-review fixes (F-001..F-007 — `d11476cc`, `e04bf888`, `7d2495ed`, `6277f50c`, `c4bd4509`, `a59bfcd3`, `80b19fbe`)** — picker limit, alert-title copy, plugin path rendering, i18n for the three nav-chrome screens (accepted exception to the fork's English-only debt), integration tests for the intercept short-circuit, `commit`/`commit-push-pr` added to `NATIVE_PROMPT_COMMANDS`, shared limit constant.
7. **Docs + security fixes (`756dd773`, `c1f8cd6f`, `0a5b79df`)** — `docs/encryption.md` lists the new `Metadata` fields; runtime shape validation for `mcpServers` in decrypted metadata and for `sessionId` in `maybeIntercept`.
8. **Cleanup (`f68dadbf`)** — deleted the stale `useAutocompleteSession.ts` hook (Codex-flagged during plan review).

**Deferred, not shipped:** `/help` full intercept coordination with upstream PR #543; ACP provider command-shape normalization; a global (non-session-scoped) catalog entry point; on-device tablet verification for US-004/006/007/008/009.

### 2026-04-22 — PR-A..PR-D batch on `main` (merged from `chat-text-ux-eink`)

1. **PR-A: finish chat font scale for the remaining tool views** — shared `useChatScaledStyles` helper; `DiffView`, `CodeView` (gated via new `scaled?: boolean` prop), `ToolView` header; per-view scaling for `TaskView`, `TodoView`, `GeminiExecuteView`, `CodexBashView`, `CodexDiffView`, `CodexPatchView`, `AskUserQuestionView`, `MultiEditViewFull`; `ToolFullView` passes `scaled` to its embedded `CodeView`s. Commit: `feat(chat): finish chat font scale coverage (roadmap item #1)`.
2. **PR-B: slider + live preview for chat text size** — replaces the tap-to-cycle Appearance item with a `@react-native-community/slider` (0.85–1.6, step 0.05) and a sample text rendered at the current preview scale. Fixes the `appearance.tsx` i18n debt along the way (three new `settingsAppearance.chatTextSize*` keys in `_default.ts` + all 10 locale files). Commit: `feat: [US-004] - [Slider UX + i18n debt fix (PR-B)]`.
3. **PR-C: pinch-to-zoom on chat (opt-in)** — `LocalSettings.pinchToZoomEnabled` (default `false`). Two-finger pinch on `ChatList` with live transform preview (`Animated.View` wrapping `MessageView` with `transform: [{ scale }]` and `transformOrigin: 'center'`); single persisted `chatFontScale` write on `.onEnd`; `renderToHardwareTextureAndroid` gated to the active-gesture window only. Zero cost at rest when toggle is off. Commit: `feat: [US-006] - [Pinch gesture + Appearance toggle (PR-C part 2)]`.
4. **PR-D: page-turn scroll mode (opt-in)** — `LocalSettings.chatPaginatedScroll` (default `false`). 15%-edge-strip tap zones (top/bottom); middle 70% stays pass-through so message long-press / link taps / `AskUserQuestionView` buttons keep working. Full-viewport paging via `scrollToOffset({ animated: false })`; tail-snap on new message keyed off `messages[0]?.id`. Hides the floating scroll-to-bottom button when paginated mode is on. Commit: `feat: [US-008] - [Page-turn Appearance toggle + docs (PR-D part 2)]`.

### Earlier (pre-2026-04-22)

- Chat freeze on large chats perf fix (upstream PR [#1154](https://github.com/slopus/happy/pull/1154))
- Three-state tablet sidebar (expanded / 72-px rail / hidden)
- `Settings → Appearance → Chat text size` — initial integration (markdown / agent events / tool section titles / Bash output / composer). Full per-tool-view coverage completed in the 2026-04-22 batch above.
- In-chrome restore for hidden sidebar (menu glyph in `ChatHeaderView`)
- Claude Code metadata-tag preprocessor for `MarkdownView` (`<command-*>`, `<local-command-*>`)
- Shared `useChatFontScale` / `useChatFontScaleOverride` hook at `sources/hooks/useChatFontScale.ts` (extended with `useChatScaledStyles` in PR-A)

---

## Process notes

- When picking up any of these, read `.agents/skills/happy-tablet-iterate/SKILL.md` first for the edit-reload loop.
- For anything that adds a user-facing string, remember the fork's i18n debt (hard-coded English historical) — add to `_default.ts` + every locale file now or flag in the commit message so it can be fixed before any upstream cherry-pick.
- Each item above is a potentially-shippable-upstream PR candidate. Bundle two items into one PR only if they share infrastructure.
- The 2026-04-22 batch used `/plan-with-ralph` + `/implement-with-ralph --autonomous` end-to-end. Plan + research + reviews + stories are archived under `.ralph/jobs/chat-text-ux-eink/` and survive past the merge into main.
