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
