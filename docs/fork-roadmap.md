# Fork roadmap

Deferred work for the personal [Evyatar108/happy](https://github.com/Evyatar108/happy) fork, roughly in priority order. Shipped items live in `docs/fork-notes.md`; this file is the backlog.

Ranking is by **e-ink tablet quality-of-life** (the fork's primary target), then by effort. An item marked *(optional)* means "ship as a user-facing toggle, not as default behaviour."

## Near-term

### 1. Finish chat font scale for the remaining tool views *(in progress)*

**Status — partially done in `c98bb557`:** the setting now scales markdown (body, headers, lists, code blocks), agent-event notices, tool section titles (`ToolSectionView`), Bash output (the whole `CommandView` terminal block), and the composer (`MultiTextInput`). Shared hook lives at `sources/hooks/useChatFontScale.ts`.

**Still not scaling:** per-tool views that each have their own typography and don't go through `CommandView`:
- `EditView`, `WriteView` — file-diff-style blocks
- `GrepView` — ripgrep results
- `TaskView`, `TodoView` — agent task tracking
- `GeminiExecuteView`, `CodexBashView`, `CodexDiffView`, `CodexPatchView` — non-Anthropic adapters
- `MCPToolView`, `ExitPlanToolView`, `AskUserQuestionView`, `MultiEditView[Full]`

Each has a `StyleSheet.create` block with `fontSize` literals. Approach is mechanical: import `useChatFontScale`, multiply every `fontSize`/`lineHeight` literal by `scale` at style-definition time (same pattern used in `CommandView`). A smarter refactor would push this into a shared style-helper (`chatScaledMono({ base, lineHeight })`) so future tool views get it for free.

**Complexity:** small per view (~15 min each), but ~12 views × 15 min ≈ half a day all-in.

---

### 2. Better UX for choosing chat text size

**What:** Replace the tap-to-cycle Item (Normal → Large → X-Large → XX-Large) in `Settings → Appearance` with a **slider** showing live preview above it. Cycle UX is uncomfortable: 5 taps to get back to normal, no way to preview.

**Why:** User flagged it as annoying. Fits iOS Settings pattern (Display → Text Size is a slider with sample text above it).

**Approach:** RN's `Slider` component, continuous 0.85–1.6 snapping to increments of 0.05 or 0.1, with a sample message rendered at the current value above the slider. Keep the `chatFontScale` LocalSetting shape (it's already a number, not an enum).

**Complexity:** small (~2 hours).

---

### 3. Pinch-to-zoom to control chat text size *(optional, opt-in)*

**What:** User explicitly mentioned but never implemented. Pinch gesture on the `ChatList` scales `chatFontScale`.

**Approach:** `react-native-gesture-handler`'s `Gesture.Pinch()` wrapping the chat's `FlatList`. On pinch-end, commit `Math.max(0.85, Math.min(1.6, currentScale * gesture.scale))` to `chatFontScale`. Add `LocalSettings.pinchToZoomEnabled: boolean` (default `false`) and a toggle in Appearance — off-by-default because pinch on a scroll view can fight scroll gestures on e-ink.

**Gotcha:** needs live preview during pinch (not just commit on end) for it to feel right. Reanimated `sharedValue` multiplied on top of the persisted scale, composed with the text component's fontSize. Otherwise pinching feels disconnected from what you see.

**Complexity:** medium (~4–6 hours). Cheap if item 1 lands first because the scale infrastructure is already there.

---

### 4. E-ink page-turn scroll mode *(optional, opt-in)*

**What:** When enabled, `ChatList` stops smooth-scrolling and instead paginates by viewport height. One page-turn per tap (or per gesture / per hardware page-turn key). Think Kindle: discrete page flips, no partial-refresh ghosting, no in-between animation.

**Why:** E-ink's worst case is smooth scroll: partial refreshes leave ghost trails; full refreshes flash. Pagination is how every e-ink reader solves this. Pairs well with the chat-freeze fix already shipped in PR #1154.

**Approach:** Add `LocalSettings.chatPaginatedScroll: boolean` (default `false`). When on, intercept scroll events and snap to `viewportHeight` increments. Tap zones on top/bottom halves advance pages. Keep inverted-list semantics (tail = latest message = bottom); when a new message arrives during paginated mode, drop back to tail. Code-block-aware page breaks (don't split a fenced block across pages if possible).

**Complexity:** medium–large (~1–2 days). Biggest risk: inverted-list + pagination + live streaming is a three-way ugly. Keep reader-mode history-only for v1, tail-on-new-message.

---

### 5. Hardware page-turn key support

**What:** Capture Android `KeyboardEvent` for `DPAD_UP`/`DPAD_DOWN` (and optionally volume keys) in `ChatList`. Scroll by ~90% of viewport height per press. Opt-in toggle.

**Why:** Most e-ink tablets (Boox, Onyx, Bigme) have physical page buttons; wiring them to scroll-by-viewport is the single most "this tablet actually makes sense for Happy" moment.

**Complexity:** small (~half a day), assuming DPAD events pass through the RN event system. Volume keys often get intercepted at the OS level; doc that limitation.

**Pairs with #4:** if #4 is in page-turn mode, these keys should cause a page flip instead of a scroll-offset change.

---

## Further out (mentioned in brainstorm, not planned yet)

- **Stream throttle / "quiet mode"** during agent streaming — coalesce token-by-token updates into 1–2 Hz redraws on e-ink. Biggest latent e-ink win but touches the message reducer, not just presentation.
- **E-ink display profile** (single switch bundling: no animations, Skia fallbacks for `VoiceBars`/`ShimmerView`/`AvatarSkia`, monochrome theme, `animationEnabled: false` on navigation). Builds on top of the above.
- **"Collapse noise" defaults** — default-collapse tool-call views, default-hide thinking, cap long bash output.

## Shipped (see `docs/fork-notes.md` for details)

- Chat freeze on large chats perf fix (upstream PR [#1154](https://github.com/slopus/happy/pull/1154))
- Three-state tablet sidebar (expanded / 72-px rail / hidden)
- `Settings → Appearance → Chat text size` — now covers markdown (body / headers / lists / code blocks), agent events, tool section titles, Bash output, and the composer. Residual per-tool-view typography still not scaling — see item 1 above.
- In-chrome restore for hidden sidebar (menu glyph in `ChatHeaderView`)
- Claude Code metadata-tag preprocessor for `MarkdownView` (`<command-*>`, `<local-command-*>`)
- Shared `useChatFontScale` / `useChatFontScaleOverride` hook at `sources/hooks/useChatFontScale.ts`

## Process notes

- When picking up any of these, read `.agents/skills/happy-tablet-iterate/SKILL.md` first for the edit-reload loop.
- For anything that adds a user-facing string, remember the fork's i18n debt (hard-coded English) — either add to every locale file *now* or flag in the commit message so it can be fixed before any upstream cherry-pick.
- Each item above is a potentially-shippable-upstream PR candidate. Bundle two items into one PR only if they share infrastructure (e.g. items 1 + 3).
