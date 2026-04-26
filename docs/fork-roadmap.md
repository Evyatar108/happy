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

### Interactive `/plugin`, `/mcp` (+ partial `/agents`, `/skills`, `/memory`) via the remote session

**What:** Today's intercepted slash commands (`usePreSendCommand.ts` → session-scoped catalog screens) are strictly read-only — they show lists/info harvested from SDK init metadata. Claude Code's real `/plugin` and `/mcp` TUIs are interactive (install, uninstall, enable/disable, browse marketplaces, add servers, etc.); the fork can't do any of that from mobile.

**Key finding (2026-04-23):** The slash commands themselves are TUI-only and refuse to run in `--print` / SDK non-interactive mode (`/plugin isn't available in this environment`). BUT Claude Code exposes fully non-interactive equivalents as **CLI subcommands** — no TUI round-trip needed, no slash-command plumbing. This drops the estimate from multi-day to ~1 day for the two high-value commands.

**Coverage by command:**

| Command | Non-interactive CLI path | What the app can expose |
|---|---|---|
| `/plugin` | `claude plugin install/enable/disable/uninstall/list/update/validate/marketplace` | **Full CRUD** |
| `/mcp` | `claude mcp add/add-json/add-from-claude-desktop/get/…` | **Full CRUD** |
| `/agents` | `claude agents` (list only) | Read-only (already covered); create/edit = file ops on `.claude/agents/*.md` |
| `/skills` | none | File ops on `.claude/skills/<name>/SKILL.md` (or plugin-bundled skills) |
| `/memory` | none | Edit `CLAUDE.md` at user/project/local scope |
| `/model` | none | Keep as "run in terminal" hint |
| `/help` | `claude --help` | Not really a catalog — leave as hint |

**Proposed architecture (shell-out, not TUI round-trip):**
- **CLI side:** one new RPC handler `runClaudeSubcommand({ args: string[] })` that `execFile`s `claude` with the requested args, streams stdout/stderr back, returns exit code. Reuse `cross-spawn` (already a dep). Strict arg allowlist — only pass-through `plugin <verb> <args>` and `mcp <verb> <args>`; no arbitrary exec.
- **Wire side:** one new RPC shape in `packages/happy-wire/` for the request/response pair.
- **App side:** on the existing Plugins/MCP catalog screens, add action rows (enable/disable toggles, Install button with a text input, Uninstall confirm). Bind to the RPC via `useHappyAction` for error handling. On success, trigger a metadata refresh (SDK shadow session fires again on the CLI side, or server pushes new init metadata via the session).
- **Refresh after mutation:** the CLI should re-run `queryInitMetadata` after a mutating subcommand so the catalog reflects the new state without waiting for the next session start. This is the one piece that isn't free.
- **Security note:** `claude plugin install` downloads + executes plugin code on the CLI host. The RPC must be gated the same way session RPCs are today (session auth check); no privilege escalation beyond what the user already has in their local `claude`.

**Tiers to pick from:**
- **(a) Plugin enable/disable toggles only** — tiny slice, 2–3 hrs. Uses `claude plugin enable/disable`. No install UI, no marketplace browsing. Proves out the RPC pattern.
- **(b) Plugin full CRUD + MCP full CRUD** — ~1 day. Install input field, Uninstall confirm, list refresh, MCP add flow. The natural stopping point for "interactive parity on the things that benefit most from mobile".
- **(c) + agents/skills/memory file-edit UIs** — +1–2 days. A small file editor per catalog backed by existing CLI file access. Less leverage since these already work via any editor; mobile becomes the only reason to build it.

**Relevant files:**
- `packages/happy-app/sources/sync/slashCommandIntercept.ts` — keep `/plugin` and `/mcp` intercepts, but the target catalog screens now do more than read
- `packages/happy-app/sources/app/(app)/session/[id]/{plugins,agents}.tsx` + new `mcp.tsx` — extend with action rows; MCP screen is new (there's no `/mcp` catalog today)
- `packages/happy-cli/src/claude/claudeRemote.ts` — RPC registration site
- `packages/happy-cli/src/api/apiSession.ts` — RPC handler manager pattern
- `packages/happy-cli/src/claude/utils/queryInitMetadata.ts` — re-run after mutations to refresh catalog state
- `packages/happy-wire/` — new RPC shape
- Security reference: `packages/happy-cli/src/claude/mcp/startPermissionServer.ts` — existing session-auth gate pattern

**Complexity:** medium. (a) ~3hrs. (b) ~1 day. (c) +1–2 days. Do (a) first as a de-risker, then decide (b) based on how the RPC + refresh UX feels.

---

### 5. Hardware page-turn key support

**What:** Capture Android `KeyboardEvent` for `DPAD_UP`/`DPAD_DOWN` (and optionally volume keys) in `ChatList`. Scroll by ~90% of viewport height per press. Opt-in toggle.

**Why:** Most e-ink tablets (Boox, Onyx, Bigme) have physical page buttons; wiring them to scroll-by-viewport is the single most "this tablet actually makes sense for Happy" moment.

**Complexity:** small (~half a day), assuming DPAD events pass through the RN event system. Volume keys often get intercepted at the OS level; doc that limitation.

**Pairs with the shipped page-turn mode (item 4):** when paginated mode is on, these keys should cause a page flip instead of a scroll-offset change.

---

## Further out (mentioned in brainstorm, not planned yet)

- **Stream throttle / "quiet mode"** during agent streaming — coalesce token-by-token updates into 1–2 Hz redraws on e-ink. Biggest latent e-ink win but touches the message reducer, not just presentation. *Flagged for promotion to Near-term by the 2026-04-24 multi-model brainstorm (Claude × 2 + Codex + Copilot); two reviewers independently argued it outweighs cold-open latency on felt impact during active sessions.*
- **E-ink display profile** (single switch bundling: no animations, Skia fallbacks for `VoiceBars`/`ShimmerView`/`AvatarSkia`, monochrome theme, `animationEnabled: false` on navigation). Builds on top of the above.
- **"Collapse noise" defaults** — default-collapse tool-call views, default-hide thinking, cap long bash output.

---

## Shipped (see `docs/fork-notes.md` for details)

### 2026-04-25 - Worklet pinch-to-zoom text animation shipped on `main`

The chat pinch path now animates text leaves directly instead of scaling whole message bubbles. The shipped surface includes markdown, fenced code, diffs, tool output, permission/todo/codex views, and agent event text, while bubble chrome stays fixed. BOOX validation still runs as the separate manual hard gate documented in `docs/fork-notes.md`.

A discrete in-input Text Size picker (9 numbered chips spanning 0.85× to 1.5×, with chip 4 = default 1.0×) shipped alongside the worklet upgrade as a tap-friendlier alternative to pinch — especially useful on e-ink where pinch gestures are awkward. The picker writes the same `chatFontScale` MMKV key as the Settings → Appearance slider, so all three controls stay in sync. Pinch-to-zoom is still gated on `pinchToZoomEnabled` (default `false`) and remains opt-in.

### 2026-04-24 — Hygiene PR: chat font scale coverage + catalog loading banner

Single-commit hygiene bundle (`f3e92b2e`) that closes the two 2026-04-22 code-review follow-ups and the intercept-before-metadata option A, plus a test-suite repair.

1. **F-020 — `ToolError.tsx` + `PermissionFooter.tsx` typography.** Both now run their text through `useChatScaledStyles` / `useChatFontScaleOverride(14)`. The inline error line and all 8 permission-button labels (Claude + Codex variants) track `chatFontScale` along with the rest of the chat.
2. **F-021 — `ToolFullView.tsx` non-code chrome.** `sectionTitle`, `description`, `errorText`, `emptyOutputText`, `emptyOutputSubtext` now scale via `useChatScaledStyles`. Embedded `CodeView` blocks were already scaled via their `scaled` prop.
3. **Intercept banner (option A from the intercept-before-metadata backlog item).** On `/plugin`, `/skills`, and `/agents` the Loading Item now carries a self-explanatory subtitle (`session.catalogNotReadyBanner`: "Session hasn't loaded yet — send any message first to populate this list.") while `session.metadata.tools === undefined`. New i18n key added to `_default.ts` + all 10 locale files.
4. **Catalog test repair.** The three catalog screen tests pre-dated the `isLoading = metadata?.tools === undefined` condition and were asserting `EMPTY_STATE_TITLE` against `metadata: {}` (which actually triggers loading now). Fixed: pass `tools: []` to force the empty-state branch, added `@/text` mock, and added a new test case per screen asserting the loading-banner state.

**Deferred / killed:**
- Option B (auto-trigger session warm-up on intercept) dropped. The banner + `Loading…` state is now enough self-explanation for the 1–2s shadow-session gap; B's risk of sending unintended messages outweighs the remaining wait.
- The wider multi-model roadmap brainstorm (Claude × 2 + Codex + Copilot, 2026-04-24) flagged **stream throttle / "quiet mode"** as mis-categorized under "Further out" — two reviewers independently argued token-by-token redraws during active agent streaming are a larger latent e-ink cost than cold-open fetch. Treat as a near-term candidate next round.

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

### 2026-04-24 — Three-state tablet sidebar landed on `main` (cherry-picked from `feature/tablet-sidebar-toggle`)

Cherry-picked the four sidebar commits onto a `merge/tablet-sidebar-toggle` integration branch off main, leaving the perf-freeze and Markdown metadata-tag commits behind (Tier 0/1 lazy-load already absorbed both perf fixes).

1. **Sidebar toggle + initial chat font-scale wiring (`9b4fa6ed`)** — `LocalSettings.sidebarCollapsed` (later replaced by `sidebarMode`), MarkdownView pulled the shared `useChatFontScaleOverride` from `@/hooks/useChatFontScale` instead of its inline one.
2. **Three-state core (`4e02270d`)** — `sidebarMode: 'expanded' | 'collapsed' | 'hidden'`, `SidebarContext`/`SidebarProvider`, `CollapsedSidebarView` (72-px rail), `CollapsibleSidebarEdge` (12-px chevron strip), `FABCompact`.
3. **Review-round fixups (`bded3b2e`)** — FABWide sibling, chevron hitSlop, a11y hint, avatar flavor.
4. **In-chrome restore (`f7baa660`)** — restore affordance moved into `ChatHeaderView`; `MainView` gate flipped from `!sidebarHidden` to `isExpanded`.
5. **i18n + Unistyles cleanup (`8ab002e7`)** — closes the two debt items that previously kept the branch out of `fork/main`. `sidebar.{show,hide,hideHint,expand,collapse}` keys added across `_default.ts` + 10 locales; restore-handle inline styles moved into `StyleSheet.create`.

### 2026-04-24 — Lazy-load long chats + cap initial message fetch on `main`

Three-tier client-side perf batch for the Onyx tablet cold-open freeze on long sessions.

1. **Tier 0 (`ddb0057d`)** — restored the regressed `FlatList` virtualization props in `ChatList`, kept `maintainVisibleContentPosition`, bumped `scrollEventThrottle` to 32, and re-wrapped `MessageView` in `React.memo`.
2. **Tier 1 (`1da743db`)** — bounded cold-start history fetches to the newest 80 messages, persisted pagination metadata in `SessionMessages`, and kept reconnect / gap-repair on the existing unbounded resume path.
3. **Tier 2 (`734dd960`)** — added `sync.loadOlder()` on the shared per-session lock plus `ChatList` triggers for both finger-scroll (`onEndReached`) and page-turn mode.

### Earlier (pre-2026-04-22)

- Chat freeze on large chats perf fix (upstream PR [#1154](https://github.com/slopus/happy/pull/1154))
- Three-state tablet sidebar (expanded / 72-px rail / hidden)
- `Settings → Appearance → Chat text size` — scale wiring landed across the chat in stages: initial integration (markdown body / composer), tool views (PR-A 2026-04-22 batch), `ToolError` / `PermissionFooter` / `ToolFullView` chrome (2026-04-24 hygiene PR), and the 2026-04-25 worklet pinch upgrade that animates the remaining text leaves in place across markdown, code, diffs, tool surfaces, and agent events.
- In-chrome restore for hidden sidebar (menu glyph in `ChatHeaderView`)
- Claude Code metadata-tag preprocessor for `MarkdownView` (`<command-*>`, `<local-command-*>`)
- Shared `useChatFontScale` / `useChatFontScaleOverride` hook at `sources/hooks/useChatFontScale.ts` (extended with `useChatScaledStyles` in PR-A)

---

## Process notes

- When picking up any of these, read `.agents/skills/happy-tablet-iterate/SKILL.md` first for the edit-reload loop.
- For anything that adds a user-facing string, remember the fork's i18n debt (hard-coded English historical) — add to `_default.ts` + every locale file now or flag in the commit message so it can be fixed before any upstream cherry-pick.
- Each item above is a potentially-shippable-upstream PR candidate. Bundle two items into one PR only if they share infrastructure.
- The 2026-04-22 batch used `/plan-with-ralph` + `/implement-with-ralph --autonomous` end-to-end. Plan + research + reviews + stories are archived under `.ralph/jobs/chat-text-ux-eink/` and survive past the merge into main.
