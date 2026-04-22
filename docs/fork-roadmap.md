# Fork roadmap

Deferred work for the personal [Evyatar108/happy](https://github.com/Evyatar108/happy) fork, roughly in priority order. Shipped items live in `docs/fork-notes.md`; this file is the backlog.

Ranking is by **e-ink tablet quality-of-life** (the fork's primary target), then by effort. An item marked *(optional)* means "ship as a user-facing toggle, not as default behaviour."

## Near-term

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
