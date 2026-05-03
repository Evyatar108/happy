# Fork notes

Personal fork of [slopus/happy](https://github.com/slopus/happy), started to fix a UI-hang bug on an Android e-ink tablet and tack on some tablet-UX conveniences the upstream app doesn't have. This file is the source of truth for where the code lives, which branch does what, and how to rebuild when something changes.

## Fork

- **GitHub:** [Evyatar108/happy](https://github.com/Evyatar108/happy)
- **Upstream:** [slopus/happy](https://github.com/slopus/happy) (remote name: `origin` — yes, confusingly; the fork is remote `fork`)
- **Local remotes:**
  ```
  origin  https://github.com/slopus/happy     (fetch + push)
  fork    https://github.com/Evyatar108/happy (fetch + push)
  ```

## Working trees

Two clones on disk because Windows' 260-char MAX_PATH blows up Android native builds when the repo lives at a deep path:

| Path | Purpose |
| --- | --- |
| `D:\harness-efforts\happy` | Primary working tree. The local happy-server (`pnpm --filter happy-server standalone:dev`) and Cloudflare Tunnel both run from here. Git history + code changes are made here first. |
| `D:\h` | Short-path clone used **only** for Android Gradle builds. Without it, `:app:buildCMakeDebug` fails with "filename longer than 260 characters" during codegen. Fresh clone of the fork; `pnpm install` run there. Metro usually runs here because Gradle-built bundles expect this path. |

When you edit code in `D:\harness-efforts\happy`, either commit + push to fork and `git pull` in `D:\h` before rebuilding, or edit in `D:\h` directly and sync back. The 2026-04-22 PR-A..PR-D batch was built in a git worktree under `D:\harness-efforts\happy\.ralph\jobs\chat-text-ux-eink\worktree`, rebased onto fresh `origin/main`, pushed to `fork/main`, then pulled into `D:\h` for the dev-client Metro reload.

## Branches

| Branch | Status | What's in it |
| --- | --- | --- |
| `main` | **ahead of upstream by 270 commits** as of 2026-04-29; ahead of `fork/main` by 29 commits (push pending) | The PR-A..PR-D chat text UX batch (merged from `chat-text-ux-eink`) on top of upstream `f6083b48`, + the 2026-04-22 native & installed Claude Code skills support merge (20 commits from `feat/native-and-installed-skills-support`, which was stacked on `fix/preserve-user-settings-for-plugin-skills`), + the 2026-04-23 local-mode init metadata forwarding merge, + the 2026-04-24 hygiene commit (F-020/F-021 + catalog loading banner), + the 2026-04-27 expandable-diff-preview merge (10 commits from `ralph/expandable-diff-preview`: 8 `feat: US-00N` + 2 `fix: [F-00N]`; US-009 BOOX-verified manually in session), + the 2026-04-28 typed-context-boundary protocol merges (D-001 envelope + F-012/F-013 wrapped-slash-command boundary fixes), + the 2026-04-28 preserve-permission-mode-layer1 merge (15 commits from `ralph/preserve-permission-mode-layer1`: 8 `feat: US-00N` + 2 `fix: [F-00N]` + 5 docs review fixes), + the 2026-04-29 streaming-pagination merge (10 commits from `ralph/streaming-pagination`: 8 `feat: US-00N` + 1 review-consensus `fix:`; BOOX-verified in-session against a side-by-side `:3006` test server with cloned pglite). |
| `ralph/streaming-pagination` | **merged to local `main` on 2026-04-29** (not yet pushed to `fork/main`); flag default flipped on 2026-04-29 after BOOX verification | The 2026-04-29 socket-pushed older-page prefetch merge. 10 commits: 7 `feat: US-001..US-007` stories (pure window math + prefetch-trigger module, happy-wire `session-message-range` schemas, storage shape + reducer-survival gate, server `sessionMessageRangeHandler`, client `prefetchManager` + transport, feature flag + `Settings → Appearance` toggle + `sync.reportRenderWindow` bridge + ChatList wiring, page-turn debounce) + 1 `docs: US-008` (the in-merge plan/CLAUDE.md docs) + 1 review-consensus `fix:` commit (server `hasMore` semantics — strictly-less-than-`fromSeq` probe replacing wrong row-count overflow; reconnect leaving `activePrefetch` and `prefetchPendingPromises` stuck; defensive `messages:[] && hasMore:true` short-circuit). The flag `enableSocketRangeFetch` is local-only and exposed in Settings → Appearance as "Stream Older Messages"; default was flipped from `false` to `true` post-merge after BOOX e-ink manual verification. Branch kept for history; the code lives on `main` now. Bounded plaintext memory (the original D-006 promise) is explicitly out of scope and tracked under `docs/plans/streaming-pagination.md ## Open Questions`. |
| `ralph/preserve-permission-mode-layer1` | **merged to local `main` on 2026-04-28** (not yet pushed to `fork/main`) | The 2026-04-28 permission-mode preservation merge (Layer 1). 15 commits: 8 `feat: US-00N` stories (CLI publish helper, Claude initial+on-change publish, Codex on-change + sandbox-forced 'yolo' seed, static wiring guard, app schema + persistence with hydration, message-meta gating + UI-key allowlist, picker resolver + SessionView wiring + info-sheet parity + EnterPlanMode persistence, docs) + 2 code-review `fix: [F-00N]` commits (sandbox+UI-only-key drop, helper signature widened to string\|undefined) + 5 docs-review fixes on `docs/permission-resolution.md`. Branch kept for history; the code lives on `main` now. Layer 2 (Claude `setPermissionMode` RPC for picker without a message) deferred to a follow-up. |
| `ralph/expandable-diff-preview` | **merged to local `main` on 2026-04-27** (not yet pushed to `fork/main`) | The 2026-04-27 expandable file-content preview merge. 10 commits: 8 `feat: US-00N` stories (useDiffHunks hook, DiffView/ToolDiffView pass-through props, CollapsibleDiffPreview wrapper + Vitest, i18n keys across 11 locale files, WriteView/EditView/MultiEditView wiring) + 2 code-review `fix: [F-00N]` commits (DiffTranslation cast cleanup, stopPropagation cleanup). Branch kept for history; the code lives on `main` now. |
| `fix/chat-list-perf-inverted-flatlist` | **shipped upstream as PR [#1154](https://github.com/slopus/happy/pull/1154)** | The chat-freeze perf fix. Two commits: (a) drops `maintainVisibleContentPosition` and adds conservative virtualization props + memoizes `MessageView`; (b) restores `maintainVisibleContentPosition` after a second review round flagged that without it new messages prepending at `data[0]` shift the viewport for users scrolled up reading history. |
| `fix/preserve-user-settings-for-plugin-skills` | **merged to `fork/main` on 2026-04-22** (stacked under native skills merge); upstream PR still TBD for slopus/happy#779 | One commit (`317fce8a`) in happy-cli that preserves `enabledPlugins` + MCP fields when passing `--settings` to Claude Code. Without it, plugin-provided skills never reach the SDK's `slash_commands` emission and are invisible to happy. Prerequisite for the native-skills merge. |
| `feature/tablet-sidebar-toggle` | **partly merged to `fork/main` on 2026-04-24** via cherry-pick of the 4 sidebar commits onto `merge/tablet-sidebar-toggle`. The chat-perf and Markdown metadata-tag commits were left out: Tier 0/1 lazy-load on `main` already absorbed both perf commits, and the Claude Code metadata-tag rendering is a separate decision. The i18n + Unistyles debt was cleaned up at merge time as commit `8ab002e7` — `sidebar.{show,hide,hideHint,expand,collapse}` keys added across `_default.ts` + 10 locales, restore-handle inline styles moved into `StyleSheet.create`. |
| `chat-text-ux-eink` | **merged to `fork/main`** | The 2026-04-22 PR-A..PR-D batch. 13 commits: 4 `feat` + 4 `docs: mark item #N shipped` + 3 `refactor(chat)` review-fix commits + 1 hardware-texture gating fix. Branch kept for history; the code lives on `main` now. |
| `feat/native-and-installed-skills-support` | **merged to `fork/main` on 2026-04-22** | The native & installed Claude Code skills batch. 20 commits (9 `feat: US-00N` stories + 7 code-review `fix: [F-00N]` commits + 1 docs fix + 2 security fixes + 1 cleanup), stacked on `fix/preserve-user-settings-for-plugin-skills`. Branch kept for history; the code lives on `main` now. |

## What's on `main` after the 2026-04-22 PR-A..PR-D merge

In commit order (new → old):

1. **`refactor(chat): gate hardware texture to active pinch only (F-022)`** — Codex round-5 flag: `renderToHardwareTextureAndroid` was pinned whenever `pinchToZoomEnabled` was on, not just during active pinch. Fixed by extending `ChatScaleLiveContext` with `isActive: SharedValue<boolean>` flipped in pinch `.onBegin`/`.onFinalize` and binding the prop via `useAnimatedProps`. Hardware texture is now allocated only during the gesture window.
2. **`refactor(chat): round-4 review fixes — opt-in perf, slider sync, constants`** — `MessageView` now skips the `Animated.View` wrapper entirely when `pinchToZoomEnabled === false` (was unconditional, violating the plan's opt-in contract); slider sync effect restored with an `isSliding` guard (was dropped too aggressively in round 2); dev route deleted (wasn't `__DEV__`-gated and didn't verify the path it claimed to); `CHAT_FONT_SCALE_MIN/MAX` consolidated to `useChatFontScale.ts` and imported elsewhere (was triplicated).
3. **`refactor(chat): apply multi-model code review fixes`** — first-round review convergence. 12 findings fixed: page-turn advance uses full viewport (was 70%); tail-snap keyed on `messages[0]?.id` (was `length`); `CodeView` split into `ScaledCodeBlock`/`UnscaledCodeBlock` so non-chat callers don't subscribe to `chatFontScale`; `transformOrigin: 'center'` added; redundant `.onEnd` reset dropped; tap gestures use `.requireExternalGestureToFail(pinchGesture)`; typed cast narrowed around `.minPointers`/`.maxPointers`; inline styles hoisted to module scope in 3 callers; `.onEnd` clamp uses the module constants; preview-sync effect initially dropped (later revisited in round 4); tail-snap dep array tightened to `[chatPaginatedScroll, messages[0]?.id]`.
4. **PR-D: `feat: [US-007]` + `feat: [US-008]` + `docs: mark roadmap item #4 shipped`** — opt-in page-turn. New `LocalSettings.chatPaginatedScroll` (default `false`); `FlatList` gets `scrollEnabled={false}` when on; 15% edge strips at top + bottom wrap `Gesture.Tap()`; middle 70% stays overlay-free; `scrollToOffset({ animated: false })` with `Math.max(0, ...)` clamp; tail-snap snaps only when user was near tail; scroll-to-bottom button hidden while paginated.
5. **PR-C: `feat: [US-005]` + `feat: [US-006]` + `docs: mark roadmap item #3 shipped`** — opt-in pinch. New `LocalSettings.pinchToZoomEnabled` (default `false`). `ChatScaleLiveContext` exposes a Reanimated `SharedValue<number>` (later `{ liveMultiplier, isActive }`). `ChatList` creates the shared value, mounts the provider only when the toggle is on, wraps the `FlatList` in a `GestureDetector` with `Gesture.Pinch().minPointers(2).maxPointers(2)`. `MessageView`'s outer `Animated.View` reads the context via `useAnimatedStyle` — `transform: [{ scale: liveMultiplier.value }]` plus `transformOrigin: 'center'`. `.onUpdate` writes only to the shared value; `.onEnd` commits one `applyLocalSettings({ chatFontScale })` via `runOnJS`; `.onFinalize` resets. Two new `settingsAppearance.pinchToZoom*` i18n keys.
6. **PR-B: `feat: [US-004]` + `docs: mark roadmap item #2 shipped`** — `@react-native-community/slider` replaces the tap-to-cycle Appearance item. Sample `<Text>` renders at the current preview scale above the slider. Drag updates local state only; `onSlidingComplete` writes once to `chatFontScale`. `isSliding` + guarded sync effect keep the preview current with external `chatFontScale` changes (e.g. from a pinch gesture in chat) without clobbering mid-drag. Three new `settingsAppearance.chatTextSize*` i18n keys in `_default.ts` + all 10 locale files.
7. **PR-A: `feat(chat): finish chat font scale coverage (roadmap item #1)` + `docs: mark roadmap item #1 shipped`** — new `useChatScaledStyles<T extends Record<string, TextStyle>>(styles: T): T` helper on top of the existing `useChatFontScale` + `useChatFontScaleOverride`. Scales: `DiffView` (catches `Edit`/`Write`/`MultiEdit`/`EditViewFull`/`MultiEditViewFull` via delegation), `CodeView` (gated by new `scaled?: boolean` prop, default `false`), `ToolView` header row. Per-view scaling: `TaskView` (hoisted `StyleSheet.create` to module scope to keep the memo key stable), `TodoView`, `GeminiExecuteView`, `CodexBashView` metadata labels, `CodexDiffView`, `CodexPatchView`, `AskUserQuestionView`, `MultiEditViewFull`. Chat-call-sites pass `scaled` to `CodeView` (`ToolView`, `ToolFullView`, `GeminiExecuteView`); `app/(app)/session/[id]/info.tsx` left untouched so non-chat CodeView renders don't scale. Known gaps are tracked as follow-ups #6 and #7 in `docs/fork-roadmap.md`.

The job directory at `.ralph/jobs/chat-text-ux-eink/` contains the plan, stories outline, research briefs, every review-round findings manifest, and commit log. It persists after merge as the audit trail for the 4 PRs.

## What's on `main` after the 2026-04-22 native & installed skills merge

Merged as commit `019a6109` (20 commits from `feat/native-and-installed-skills-support`), with one-commit follow-up cleanup `f68dadbf`. High-signal summary — the job directory at `.ralph/jobs/native-and-installed-skills-support/` carries the full plan, DSAT report, and per-story artifacts; this section is a pointer, not a duplicate.

- **Prerequisite fix (`317fce8a`):** `fix(cli): preserve enabledPlugins + MCP fields when passing --settings`. Root cause of plugin skills being invisible pre-merge — see slopus/happy#779. Upstream PR still TBD.
- **9 stories (US-001..US-009):** widen the CLI→app metadata pipeline (forward `skills`, `agents`, `plugins`, `outputStyle`, `mcpServers` from the SDK init); flip `IGNORED_COMMANDS` blocklist → classification-based allowlist in `suggestionCommands.ts`; raise picker cap 5→15; add seven synthetic TUI commands (`/plugin`, `/skills`, `/agents`, `/memory`, `/model`, `/mcp`, `/help`) with a shared pre-send intercept hook covering both composer paths; ship three session-scoped catalog screens at `app/(app)/session/[id]/{plugins,skills,agents}.tsx`.
- **7 code-review fixes (F-001..F-007):** picker limit alignment + test; alert title copy; plugin path rendering; i18n for the three nav-chrome screens (accepted exception to the fork's English-only debt); integration tests for intercept short-circuit at both composer paths; `commit`/`commit-push-pr` added to `NATIVE_PROMPT_COMMANDS`; shared limit constant.
- **1 docs fix (`756dd773`):** `docs/encryption.md` updated to reflect the new optional `Metadata` fields.
- **2 security fixes (SEC-F-001/F-002):** runtime validation of `mcpServers` shape in decrypted metadata; stricter `sessionId` shape check in `maybeIntercept`.
- **1 post-merge cleanup (`f68dadbf`):** deleted stale `useAutocompleteSession.ts` (Codex had flagged it as dead code during plan review).
- **Deferred, not shipped** (tracked in `docs/fork-roadmap.md`): `/help` full intercept coordination with upstream PR #543; ACP provider command-shape normalization; a global (non-session-scoped) catalog entry point; on-device tablet verification for US-004/006/007/008/009.

See `.ralph/jobs/native-and-installed-skills-support/plan.md` for the full plan and `.ralph/jobs/native-and-installed-skills-support/dsat-report.md` for the post-merge orchestration analysis.

## What's on `main` after the 2026-04-23 local-mode init metadata forwarding merge

Merged as commit `88a18bf6` (squash of 9 stories + 5 code-review fixes from `feat/local-mode-init-metadata`), plus a probe-script fix, two CLI version bumps, and a mobile-app Loading-state polish on top. Job directory at `.ralph/jobs/local-mode-init-metadata/` has the full plan, DSAT, and per-story artifacts.

**Problem this solves:** Before this merge, the session-scoped Plugins/Skills/Agents catalog screens (shipped in the 2026-04-22 merge) only populated for **remote-mode** sessions — those launched from the mobile app. Sessions started from the terminal (`happy` CLI) went through a PTY-attached Claude with no SDK init stream, so the catalog screens stayed empty for the user's most common case.

**Approach — shadow SDK session:** Local-mode spawns a short-lived parallel SDK `query()` against the same cwd/settings, waits for the one `system/init` message (the SDK emits init before any LLM inference fires), calls the control-plane `initializationResult()` + `reloadPlugins()` RPCs to harvest the full metadata set, then aborts the query before any user-facing prompt runs. Structural zero-cost gate validated by the US-000 probe script; the manual dev-account dashboard check is still a user action (see roadmap).

- **Prerequisite refactor (US-001..US-003):** extracted the remote-mode metadata mapping into a pure helper `packages/happy-cli/src/claude/utils/sdkMetadata.ts` (`mapSystemInitToMetadata`, `mergeSDKInitMetadata`). Remote mode refactored to use it — so there's one code path for turning an SDK init message into `Metadata`, regardless of caller.
- **Three-tier fallback (US-004):** `mergeControlApiResultsIntoInitMetadata` prefers `initializationResult()` data, falls back to `reloadPlugins()` data, falls back to the init-stream message — so the helper degrades gracefully against SDK versions that don't populate every field.
- **Shadow-session helper (US-005):** `packages/happy-cli/src/claude/utils/queryInitMetadata.ts` owns the SDK query lifecycle (spawn → await `system/init` → harvest via control RPCs → abort → close) with a default 3s timeout. Test coverage is real SDK integration, not mocks (per the package's testing rule).
- **Cost observability (US-006):** `packages/happy-cli/scripts/probe-shadow-session-cost.mjs` is the gate probe — logs every message type the shadow session sees, so a zero-cost run shows only `system/init` before the abort. Converted from `.cjs` to `.mjs` in follow-up `018c6194` because the SDK is ESM-only.
- **Local launcher wiring (US-007):** `claudeLocalLauncher.ts` fires the shadow session on SessionStart, with a `Map<sessionId, Promise>` dedupe guard to prevent rapid-re-entry races from double-firing. Failures in the shadow session don't affect the PTY Claude — this is observability-only.
- **App plugin schema (US-008):** `packages/happy-app/sources/sync/storageTypes.ts` — widened the `plugins` entry schema to include `source?: string` alongside `{name, path}` so the catalog screen can render "where a plugin came from" when present.
- **Five code-review fixes (F-001..F-005):** probe script creation (F-001); abort-before-return ordering in the helper (F-002); three-tier fallback for `commands`/`agents` specifically (F-003); env-var gate instead of a billable preflight in integration tests (F-004); per-utility integration-test location documented in agents.md (F-005).
- **CLI releases (`88a243ca`, `34c3cbd5`):** `happy@1.1.8-evy.2` shipped the feature; `happy@1.1.8-evy.3` added diagnostic `logger.warn` calls in `queryInitMetadata.ts` + `claudeLocalLauncher.ts` to make it clear from user logs whether the shadow session fired. Those warns are expected to downgrade to `debug` before the next stable cut — see `docs/fork-roadmap.md`.
- **App-side polish (`41514e3c`):** added a `Loading…` Item with spinner to `session/[id]/{plugins,skills,agents}.tsx` while `session.metadata.tools === undefined`. Covers the 1–2s shadow-session window so users no longer see a flicker from "No plugins loaded" → real list.
- **Deferred, not shipped** (tracked in `docs/fork-roadmap.md`): US-000 manual dashboard cost check; handling intercepted slash commands before session metadata arrives; interactive `/plugin` etc. via the remote session; lazy-load long chats.

**On-device verification:** tablet session on 2026-04-23. Catalog screens populate after `~`1–2s once the first real message is sent (which triggers local→remote mode switch and exercises the shadow session path). Loading… state visible during the gap.

## What's on `main` after the 2026-04-24 hygiene PR

Single commit `f3e92b2e` (`feat(app): hygiene PR — chat font scale coverage + catalog loading banner`). Closes the two 2026-04-22 code-review follow-ups and ships option A of the intercept-before-metadata backlog item in one 20-file, 145+/25− bundle. No job directory — too small to warrant `/plan-with-ralph`; proposed directly from a multi-model brainstorm output (see fork-roadmap.md Shipped entry for the brainstorm context).

- **F-020 typography gaps closed:** `sources/components/tools/ToolError.tsx` runs `errorText` through `useChatScaledStyles`; `sources/components/tools/PermissionFooter.tsx` now applies `useChatFontScaleOverride(14)` to all 8 button-text renders (5 Claude variants + 3 Codex variants). Both were outside the PR-A declared scope on 2026-04-22 and are now caught up with the rest of the chat typography.
- **F-021 ToolFullView chrome:** `ToolFullView.tsx` was already passing `scaled` to its embedded `CodeView` blocks; this PR adds `useChatScaledStyles` coverage for `sectionTitle`, `description`, `errorText`, `emptyOutputText`, `emptyOutputSubtext`. Opening a generic tool's full view no longer snaps typography back to base. `toolId` was left untouched because it isn't currently rendered in the visible surface.
- **Intercept banner (option A):** The three catalog screens at `packages/happy-app/sources/app/(app)/session/[id]/{plugins,skills,agents}.tsx` now render the Loading Item with `subtitle={t('session.catalogNotReadyBanner')}` — "Session hasn't loaded yet — send any message first to populate this list." — while `session.metadata?.tools === undefined`. New i18n key in `_default.ts` + all 10 locale files (ca/en/es/it/ja/pl/pt/ru/zh-Hans/zh-Hant). Option B (auto warm-up via a wire RPC ping) was dropped; the banner + existing shadow-session wiring closes the UX hole without the risk of unintended messages.
- **Catalog screen tests repaired:** `plugins.test.ts`, `skills.test.ts`, `agents.test.ts` had a pre-existing mismatch — they asserted `EMPTY_STATE_TITLE` against `metadata: {}`, but the shipped local-mode work made that case trigger `isLoading=true` instead. This PR aligns the tests: mocks `@/text`, passes `tools: []` to force the empty-state branch, and adds a new test case per screen asserting the new loading-banner subtitle. 12/12 catalog tests now pass; 17/17 intercept-adjacent tests still pass. `pnpm typecheck` clean.
- **Multi-model brainstorm artifact:** the hygiene bundle came out of a four-voice priority brainstorm (Claude agent × 2 + Codex + Copilot) kicked off from the 2026-04-24 roadmap session. Two of the four agents independently flagged **stream throttle / quiet mode** as mis-categorized under "Further out" — see roadmap for the promotion note. No job directory was created; the brainstorm output lives in the conversation log.

Not merged to a separate branch — shipped straight onto `fork/main`. Commit parents: `a17cb918` (2026-04-22 roadmap doc rewrite) → `f3e92b2e`.

## What's on `main` after the 2026-04-25 worklet pinch-text upgrade

This follow-up replaces the earlier whole-message preview path with per-leaf animated text sizing. The chat now drives live pinch feedback through `useChatScaleAnimatedTextStyle(...)` plus the shared `AnimatedText` export, so markdown, code, diffs, tool output, permission/todo/codex views, and agent-event text all grow together while the surrounding bubble chrome stays fixed.

- `AnimatedMessageView` stays rejected. The final shipped path animates text leaves only, which avoids double-scaling once the live worklet hook is active.
- `ToolView` keeps one intentional static exception: the small inline status suffix (`styles.status`, `fontSize: 15`) stays on the persisted-scale path while the elapsed-time text still animates.
- `ToolFullView` stays on static `useChatScaledStyles` because it renders outside `ChatScaleLiveContext.Provider` on the message-detail screen.
- The dev route at `packages/happy-app/sources/app/(app)/dev/animated-text-spike.{tsx,shared.ts,test.ts}` is now a permanent dev artifact. Use it for BOOX verification before shipping future text-animation changes.
- BOOX manual check protocol: open the spike route or a long real chat, pinch to the target size, and hold at peak long enough to confirm the text growth is visible, bubble chrome stays fixed, and release/cancel both snap cleanly back to the persisted scale.
- A discrete in-input Text Size picker (`AgentInput.tsx`, "Aa" `Pressable` next to the settings gear in `actionButtonsLeft`) ships alongside the worklet. It opens a `FloatingOverlay` with 9 numbered chips spanning 0.85× to 1.5× — chip 4 is the default 1.0×. The picker writes `chatFontScale` via `useLocalSettingMutable`, the same MMKV key the Settings → Appearance slider and pinch gesture use, so all three controls stay in sync. Pinch-to-zoom remains gated on `pinchToZoomEnabled` (default `false` in `localSettings.ts`), so on a fresh install the picker is the primary control — the chip row was added because pinch gestures are awkward on the BOOX e-ink panel.
- A discrete in-input Chat Width picker (`AgentInput.tsx`, `resize-outline` `Pressable` immediately to the right of the Aa button in `actionButtonsLeft`) now ships beside it on tablet layouts. It opens the same `FloatingOverlay` chip-row pattern with `Default`, `Wide`, and `Full`, writes the MMKV-backed `chatWidthMode` key via `useLocalSettingMutable`, and fans that preference out through `useChatWidth()` to `MessageView`, the composer, `ChatHeaderView`, and `SessionView` so the chat body/header caps stay aligned. `Default` preserves the existing per-platform widths, `Wide` expands both caps to 95% of the viewport, and `Full` removes the cap entirely.

## What's on `main` after the 2026-04-29 streaming-pagination merge

Merged as commit `a639af83` (10 commits from `ralph/streaming-pagination` — 8 stories + 1 review-consensus fix + the merge commit), no merge-time conflicts. Job directory at `.ralph/jobs/streaming-pagination/` carries the plan, DSAT report, per-story artifacts, and the 3-way (Claude + Codex + Copilot) code-review findings; this section is a pointer.

- **Goal:** replace HTTP-only older-page fetch with socket-pushed prefetch. When the user scrolls back through a session, viewport ticks emit `session-message-range` request/response pairs over the existing socket.io connection (path `/v1/updates`) so the next chunk of decrypted messages lands in the store **before** the user reaches the older edge. Drop-in replacement for `sync.loadOlder()`, no eviction. Behind the local-only `enableSocketRangeFetch` flag (default flipped from `false` to `true` on 2026-04-29 after BOOX verification — see "Default flipped to on" entry below), with an in-app toggle on the Appearance settings screen labelled "Stream Older Messages". Cold-start `GET /v3/sessions/:id/messages` and live `new-message` push are **untouched**.
- **Architecture (client side):** new pure helper module `packages/happy-app/sources/sync/messageWindow.ts` owns `computeRenderWindow(visibleSeqs)`, `shouldPrefetchOlder(...)`, and `computePrefetchOlderRange(...)`. Pending sentinel-seq messages (`DEFAULT_UNSEQUENCED_MESSAGE_SEQ`) are filtered out of every input — mirrors `ChatList.boundaryItems.ts:59`'s `isConfirmed` check. `SessionMessages` storage shape extended with `renderWindow: { firstSeq, lastSeq } | null` (required, null is the only valid initializer) and `activePrefetch?: { requestId, generation, direction, targetSeq, issuedAt }`. Four new storage actions: `setRenderWindow`, `setActivePrefetch`, `applyPrefetchedRange` (guarded on requestId AND generation), `clearActivePrefetch` (guarded — no-ops when current.activePrefetch.requestId mismatches, so a late clear under a bumped generation can't blow away a newer in-flight prefetch). New `applyPrefetchedRange.ts` module owns `mergeOlderMessagesIntoSession`, `computeNextOldestLoadedSeq`, and `applyPrefetchedRangeToSession`; the existing `storage.applyOlderMessages` was refactored to call the same helper for reducer-state parity.
- **Architecture (manager + transport):** new `prefetchManager.ts` keys in-flight by `(sessionId, generation)`. Transport (`apiSocket.requestSessionMessageRange` via `emitWithAck`) and decrypt run **outside** any per-session lock; only the final `storage.applyPrefetchedRange` commit runs inside the existing per-session AsyncLock. Manager exposes a per-request terminal `Promise<void>` that resolves after exactly ONE of: in-lock commit, closure-mismatch staleness discard inside the lock, or synchronous bail before transport (this is the awaited-commit contract — Plan AC #16, addresses auto-skipped F-038). For each non-commit terminal exit (`ok:false` ack per error code, transport rejection, decrypt rejection, closure-mismatch discard) the manager calls `storage.clearActivePrefetch(sessionId, expectedRequestId)` exactly once. Generation bump on session switch / direction reversal / reconnect; `apiSocket.onReconnected()` triggers the manager's reconnect sweep that calls `clearActivePrefetch` for every in-flight session AND settles their terminal Promises so any awaiter (the flag-on `sync.loadOlder()` delegate) unblocks.
- **Architecture (sync + ChatList wiring):** new `sync.reportRenderWindow(sessionId, visibleSeqs)` is the **only** writer of concrete `renderWindow` values from the viewport path AND the **only** caller of `prefetchManager.requestSessionMessageRange(...)` from the viewport path. Flag-off short-circuit. Null-window short-circuit (synthetic-only or pending-only viewport tick leaves `renderWindow` unchanged). New `sync.onActiveSessionChanged(sessionId)` is the **only** entrypoint that writes `renderWindow: null` and bumps the previous session's generation — distinct from the existing `sync.onSessionVisible(...)` (the F-046 regression guard: routing the renderWindow reset through `onSessionVisible` would re-fire on every `new-message` ping and control-return). Wired from a NEW `[sessionId]`-keyed `useEffect` in `SessionView.tsx` and the message-detail route. `ChatList.tsx` adapts `onViewableItemsChanged`'s `ViewToken[]` to a filtered `number[]` of message-kind seqs and forwards via `sync.reportRenderWindow`; ChatList itself does NOT call `storage.setRenderWindow` directly, does NOT import `messageWindow.ts`, does NOT import `prefetchManager.ts`.
- **Architecture (server side):** new `packages/happy-server/sources/app/api/socket/sessionMessageRangeHandler.ts` mirrors `v3SessionRoutes.ts` ownership semantics. Account-scoped `findFirst({ id: sessionId, accountId: userId })` — single lookup, never a global-by-id fallback (wrong-owner and never-existed both collapse to a byte-identical `session_not_found` payload — info-disclosure guard, asserted by spy in the test). Validates with `SessionMessageRangeRequestSchema` from `codexu-wire`; returns encrypted blobs as-is, never decrypts. The merged `fix:` commit replaced the original (broken) `hasMore = rows.length > limit` with a strictly-less-than-`fromSeq` `findFirst` probe so the client doesn't terminate pagination after the first page (the original test had baked the wrong contract; corrected fixtures cover dense/empty/below-edge cases).
- **Stories US-001..US-008** (all VALID-evidence): pure window math + prefetch-trigger module → happy-wire schemas + 24 tests + tracked dist artifacts → storage shape + reducer-survival gate → server handler + 9 tests → client transport + per-session prefetch manager + 16 spec cases → feature flag + appearance toggle + i18n across 11 locales + sync bridge + ChatList wiring (largest story, 21 files, 22 new tests + 127/127 regression) → page-turn-mode debounce (test-only — debounce was already in US-005's in-memory in-flight tracker via the synchronous bail) → documentation (`docs/plans/streaming-pagination.md` + `docs/plans/reliable-http-messages-api.md` See-also + `packages/happy-app/CLAUDE.md` invariants).
- **Phase 5a 3-way code review** (Claude + Codex + Copilot): two consensus High findings + one Medium, all addressed in commit `40f56f43`. (1) Server `hasMore` was `rows.length > limit` against a `[fromSeq, toSeq]` window, but the client always requests at most `limit` messages wide — `hasMore` was always `false` for full pages, terminating pagination after one page. The handler test had baked in the wrong contract. Fixed with a `findFirst({ seq: { lt: fromSeq } })` probe; corrected fixtures. (2) `prefetchManager.onReconnected()` only bumped generations and cleared the in-memory `inFlight` map — never called `storage.clearActivePrefetch(...)` or settled the terminal Promises. After reconnect, `activePrefetch` stayed set permanently (gating `shouldPrefetchOlder`) and `sync.loadOlder()` could hang awaiting orphaned `emitWithAck` Promises. Fixed by snapshotting `inFlight` entries on reconnect, sweeping `clearActivePrefetch` per session, firing `abandon-on-reconnect` terminal events, AND `prefetchPendingPromises.clear()` in `sync.ts`'s reconnect bridge. (3) Defensive `messages: [] && hasMore: true` short-circuit added in `applyPrefetchedRangeToSession` so a buggy server response can't put the client into an infinite-retry loop.
- **Post-default-flip 3-way re-review** (`d59ea517`, addressing Codex #1 High + Copilot #1 Medium): the `40f56f43` reconnect cleanup pattern was missing on two analogous paths — session-switch via `sync.onActiveSessionChanged`'s previous-session branch (which only called the lightweight `bumpGeneration`) and the `delete-session` handler (which cleaned 9 per-session sync maps but missed `prefetchPendingPromises` and never told the manager to abandon). Same failure mode: stale `activePrefetch` permanently gating `shouldPrefetchOlder` on the previous session and orphaned `prefetchPendingPromises` entries that flag-on `loadOlder()` would await indefinitely. With `enableSocketRangeFetch` default-on this surfaces on every session switch. Fixed by adding `PrefetchManager.abandonInFlight(sessionId)` (full per-session cleanup: bump generation + `clearActivePrefetch` + settle terminal Promise + fire new `abandon-on-cleanup` terminal kind) and routing both `onActiveSessionChanged` and the `delete-session` handler through it, AND evicting `this.prefetchPendingPromises.delete(sessionId)` at both sites. Internal `flushAbandonedInFlight` helper now shared between `onReconnected` and `abandonInFlight`. `bumpGeneration` kept lightweight for direction-reversal inside `requestSessionMessageRange` — that callsite is followed immediately by a new request and the abandoned body's `stale-discard` late-cleanup covers the orphan. Coverage: `prefetchManager.spec.ts (d-leak-session-cleanup)` + `(d-leak-no-inflight)`; `sync.reportRenderWindow.spec.ts` updated reproduction asserts the bridge calls `abandonInFlight` (not `bumpGeneration`) AND evicts `prefetchPendingPromises[prev]`.
- **Security review:** CLEAR — 0 findings introduced. Server handler is account-scoped, returns encrypted blobs as-is (preserves E2EE), validates with Zod at both ends, no SQL injection / no secret leakage / no new dependencies. Rate limiting is absent (the `rate_limited` error code in the schema is for future use) but matches the existing v3 HTTP route's behavior — not a regression.
- **Manual on-device verification (BOOX e-ink tablet):** in-session against a side-by-side test server on `:3006` with a snapshot of the live `:3005` HappyServer service's pglite + matching `HANDY_MASTER_SECRET` — see `.agents/skills/happy-tablet-iterate/SKILL.md ## Side-by-side test server` for the full pattern (token reuse via pglite snapshot avoids fresh QR pairing). Verified the toggle flips, scroll-up triggers the new socket path (no more HTTP `/v3/sessions/.../messages?limit=80` calls after the flag is on; cold-start `limit=100` still HTTP as designed).
- **Pending follow-ups (deferred):** bounded plaintext memory / plaintext-eviction (the original D-006 promise — out of scope per Plan §Open Questions; needs a real plaintext/render-state split in `storage.ts` plus reducer changes); per-event server-side telemetry on the `session-message-range` handler (currently silent on entry — added one-line `log()` would help debugging but not strictly required).

See `.ralph/jobs/streaming-pagination/plan.md` for the full plan and `.ralph/jobs/streaming-pagination/dsat-report.md` for the post-merge orchestration analysis.

## What's on `main` after the 2026-04-29 streaming-pagination follow-up cluster

Five chat-rendering bugs surfaced on the same day the streaming-pagination flag was flipped to default-on (`ae0136b4`). All fixes shipped same-day on `main`. The cluster is documented here because the pattern — one feature-flag flip exposing five latent-but-distinct code paths simultaneously — is a useful prior for future post-merge triage.

| Bug | Root cause | Fix file:line | Commit |
|---|---|---|---|
| **#1 Skill body rendered as user-text bubble** | Claude Code injects a verbatim copy of every loaded `SKILL.md` as a `role:"user"` text message after each `Skill` tool call. Happy's `typesRaw.ts` routes user-role array-content messages through the **agent-text** path despite the wire role; suppression in `UserTextBlock` alone wasn't enough. | `packages/happy-app/sources/components/markdown/skillBody.ts` (new detector) + `MessageView.tsx:78-95, :120-133` (suppression in BOTH `UserTextBlock` AND `AgentTextBlock`) | `21fbbc23` + `f2ad7f36` |
| **#2 `<task-notification>` raw XML** | Strict anchored regex required `<output-file>` and `<status>`; Claude Code's Monitor-tool variant emits only `<task-id>` + `<summary>` + `<event>` so the parse fell through. | `processClaudeMetaTags.ts:120-160` — replaced strict regex with per-tag extraction; only `<task-id>` + `<summary>` are required, unknown inner tags tolerated. | `21fbbc23` |
| **#3 Boundary-eviction snap on scroll-up** | Synthetic boundary-row IDs (`boundary-sticky:<latestBoundary.id>`) flipped on every `latestBoundary` accept; FlatList unmount+remount + the `seq >= latestBoundary.seq` filter at `ChatList.boundaryItems.ts:74-76` silently evicted previously-visible messages mid-scroll. | `ChatList.boundaryItems.ts:25-39` (stable IDs `'boundary-sticky'` / `'boundary-show-history'`) + `ChatList.tsx:75-110` (auto-expand on first boundary arrival; collapse reset keyed on `sessionId` not `latestBoundaryKey`). | (later session, this cluster) |
| **#4 Reducer Phase 5 unbounded message growth (357→1098)** | Phase 0.5's context-boundary handler at `reducer.ts:406-417` falls through to `messagesToProcess` WITHOUT setting `state.messageIds`. Phase 5 at `reducer.ts:1147-1163` allocated a fresh `mid` for the same wire event on every batch. | `reducer.ts:1147-1180` — added `if (state.messageIds.has(msg.id)) continue;` guard AND `state.messageIds.set(msg.id, mid)` after the `state.messages.set` write. | (later session, this cluster) |
| **#5 createdAt-vs-seq mid-array splice** | `mergeOlderMessagesIntoSession` sorted by `createdAt DESC`, but pagination is keyed by `seq`. In sessions with `--resume` rewriting / clock skew / plan-mode synthesis / `session-fork-resume`, paginated older-by-seq messages had `createdAt` between existing first and last → spliced into the array MIDDLE → MVCP compensated for index shifts → snap. | `applyPrefetchedRange.ts:76-99` — sort by `seq DESC` with `createdAt DESC` as tiebreaker. | (later session, this cluster) |

**Pattern lesson:** "five bugs on one day" is consistent with one feature-flag flip exposing latent code paths; it does NOT necessarily indicate structural defect-rate. The `applyPrefetchedRange.ts:79-99` in-code comment dated 2026-04-29 explicitly diagnoses bug #5 as a streaming-pagination flip regression. The other four had localized one-file fixes too. Tracking the recurrence rate over 90 days is the right way to detect whether the architecture is the bug amplifier (then refactor) or whether this was a one-off cluster (no refactor needed) — see `docs/plans/offline-catchup-and-sync-architecture.md` for the architecture-audit decision criteria.

**Offline-catchup investigation (same day, separate concern):** verifying the architecture-audit conclusions surfaced a pre-existing latent gap: happy-cli today does NOT catch up agent-CLI activity that happened while it was offline. Distinct gap shapes per agent (Claude tail-the-JSONL vs Codex child-process JSON-RPC). Full research, verified findings (file:line, dual-lens), and per-agent fix bundles in `docs/plans/offline-catchup-and-sync-architecture.md`. NOT yet a plan; awaiting next planning pass.

**Brainstorm artifacts (preserved):** `.ralph/jobs/.staging/20260430T*` — three rounds of brainstorm-with-ralph (round 1 scroll-jump root cause, round 2 architecture audit, round 3 cost-blind ideal architecture) plus two verification rounds (Claude offline gap, Codex offline gap). The new plan doc references these by absolute staging path.

## What's on `main` after the 2026-04-28 preserve-permission-mode-layer1 merge

Merged as commit `ed78179d` (15 commits from `ralph/preserve-permission-mode-layer1` — 8 stories + 2 code-review fixes + 5 docs-review fixes), with two minor merge-time conflict resolutions in `packages/happy-app/sources/sync/{storage.ts, storageTypes.spec.ts}` and one test fixture update for the new `NormalizedMessage.seq` field. Job directory at `.ralph/jobs/preserve-permission-mode-layer1/` carries the plan, DSAT report, per-story artifacts, and code/docs review findings; this section is a pointer.

- **Goal:** make `claude --dangerously-skip-permissions` (and `--permission-mode bypassPermissions`) survive both message-send and resume from the Happy mobile app. The bug was structural — the app always emitted `permissionMode` in `meta` defaulting to `'default'` even when the user had not toggled the picker, and the CLI overwrote its in-memory `currentPermissionMode` whenever the field was present (same problem on the resume code path). This is **Layer 1 (preservation)** of a two-layer plan; Layer 2 (Claude `setPermissionMode` RPC for the picker without sending a message) is deferred to a follow-up.
- **Architecture (CLI side):** new `publishPermissionModeIfChanged(metadata, lastRef, mode, client)` helper at `packages/happy-cli/src/utils/publishPermissionMode.ts` mutates the live `metadata` object **in place** (sets `currentPermissionModeCode`) AND publishes via `client.updateMetadata`, so offline-reconnect paths reseed correctly. Optimistic `lastRef.current` write before the awaited `updateMetadata` is load-bearing for concurrency correctness. Mode parameter is `string | undefined` so callers can publish a "cleared" / no-opinion state (review F-002 widening). Helper catches and logs `updateMetadata` rejections without propagating, keeping the optimistic write. Claude runner seeds the initial mode in the metadata object passed to `getOrCreateSession` and wires up `publishPermissionModeIfChanged` for on-change publishes; Codex runner publishes a sandbox-forced `'yolo'` initial seed once after `client.connect()` when `client.sandboxEnabled === true` and republishes on later changes. `publishPermissionModeWiring.test.ts` reads runner sources as text and asserts via regex so the wiring survives runner-test thinning.
- **Architecture (app side):** new persisted boolean `permissionModeUserChosen: boolean` lives in its own MMKV namespace (`session-permission-mode-user-chosen`), decoupled from `session-permission-modes` so an explicit `'default'` pick is recordable. All five `updateSessionPermissionMode` callsites pass the right `userChosen` value; `EnterPlanMode` and `ExitPlanMode` auto-mutations explicitly reset `userChosen=false` in both memory and disk (machine-derived). Outbound `meta.permissionMode` (in `packages/happy-app/sources/sync/messageMeta.ts` + `sync.ts` conditional spread) is sent only when `permissionModeUserChosen === true` (and the stored mode is in the `WIRE_PERMISSION_MODES` allowlist) **or** sandbox is enabled (forced `'bypassPermissions'`); UI-only keys (`dontAsk`, `auto_edit`) are filtered. Picker chip and info sheet share `resolvePermissionModeForPicker(...)` in `packages/happy-app/sources/components/modelModeOptions.ts`: `permissionModeUserChosen ? session.permissionMode : (metadata.currentPermissionModeCode ?? Claude-only metadata.dangerouslySkipPermissions legacy fallback ?? getDefaultPermissionModeKey(flavor))`.
- **Stories US-001..US-008** (all VALID-evidence, single-iteration passes): CLI metadata field + publish helper → Claude runner publishes initial + on-change → Codex runner publishes on-change + sandbox-forced 'yolo' seed → static wiring guard test for both runners → app schema + Session state + persistence with hydration → app gates `permissionMode` in messageMeta + sync, with UI-key allowlist filter → picker resolver helper + SessionView wiring + info-sheet parity + EnterPlanMode persistence → documentation. Velocity 1.0 stories/iter; total ~63 minutes wall-clock across 8 iterations; 0 rollbacks, 0 deferred questions, 0 Story Doctor activity.
- **Two code-review fixes (F-001 High, F-002 Low; F-003 Low wont_fix):** F-001 fixed a real correctness bug in `messageMeta.ts` — when `permissionModeUserChosen=true` and the user-chosen value was a UI-only key (`dontAsk`, `auto_edit`), `toWirePermissionMode` returned `undefined` and the function omitted `permissionMode` entirely, even when sandbox was enabled. The fix computes `wireFromUser` first, then falls through with `?? (sandboxEnabled ? 'bypassPermissions' : undefined)` so the sandbox safety invariant is preserved against UI-only keys. F-002 widened `publishPermissionModeIfChanged`'s `mode` parameter to `string | undefined` per the documented "absence is meaningful" protocol invariant. F-003 (i18n on info-sheet status strings — pre-existing English-only behavior) was wont_fix as out of plan scope; deferred to a dedicated i18n pass.
- **Five docs-review fixes** on `docs/permission-resolution.md`: rewrote the "Outbound message mode" section for the new conditional emit logic, added a new "CLI → App metadata publishing" top-level section documenting `currentPermissionModeCode` and the picker resolution chain, added a `permissionModeUserChosen` note in the session merge section, and clarified the per-message and resume sections to cover the absent-`meta.permissionMode` preservation branch. F-005 added a "Superseded by" pointer to `docs/plans/metadata-driven-model-mode-selection.md` (historical plan doc with drifted "as-built" claims).
- **Security review:** CLEAR — 0 findings. The change is confined to mode-state plumbing on top of the existing encrypted session-metadata channel; adds no new auth, secrets, file I/O, network, dependency, crypto, CORS/CSP, or migration surface. The new MMKV namespace stores a per-session boolean only.
- **Phase 6 Step 0b synthesis-drop (Layer 1.5 follow-up):** the orchestrator's reviewer-text scan caught two unaccounted High Copilot bullets that did not flow into the structured findings manifest. Both centre on `messageMeta.ts:952-954` keying its sandbox-forced `bypassPermissions` branch off the **configured** `metadata.sandbox.enabled`, not whether Codex actually enabled sandboxing. On Windows or after sandbox-init failure (`codexAppServerClient.ts:397-408`), the app still sends `bypassPermissions`; the CLI accepts it as an explicit override; `resolveCodexExecutionPolicy()` maps `bypassPermissions` → `danger-full-access` — net **silent privilege-escalation pathway** on first app message in unsandboxed Codex sessions. Also: sandboxed Codex picker/info-sheet falls off `'yolo'` after first send because `resolvePermissionModeForPicker` cannot map `'bypassPermissions'` → display key for Codex. User accepted override; the fix (gate the app-side bypass force on actual runtime sandbox state rather than configured intent) is captured as a Layer 1.5 follow-up in `notepad.md`.
- **Pending manual verification:** on-device picker/info-sheet behavior on the BOOX e-ink tablet — the browser-skill criterion in US-007 was substituted with the deterministic `sessionInfoPermissionMode.test.ts` vitest coverage during iteration, so no manual gate was discharged in-session.

See `.ralph/jobs/preserve-permission-mode-layer1/plan.md` for the full plan and `.ralph/jobs/preserve-permission-mode-layer1/dsat-report.md` for the post-merge orchestration analysis.

## What's on `main` after the 2026-04-27 expandable diff preview merge

Merged as commit `c8c0eca2` (10 commits from `ralph/expandable-diff-preview` — 8 stories + 2 code-review fixes), no follow-up commits. Job directory at `.ralph/jobs/expandable-diff-preview/` carries the plan, DSAT report, per-story artifacts, and code/docs review findings; this section is a pointer.

- **Goal:** collapse the inline diff preview on Write/Edit/MultiEdit tool bubbles to the first 10 visible lines with an e-ink-safe Show/Hide toggle. Long file-edit history was painful to scroll past on the BOOX panel.
- **Architecture:** new `useDiffHunks(oldText, newText, contextLines?)` hook in `packages/happy-app/sources/components/diff/` owns the unified-diff hunk computation (memoized on `[oldText, newText, contextLines]`). `DiffView` and `ToolDiffView` accept optional `hunks?` and `maxVisibleLines?` props so the wrapper can hand precomputed hunks to the inner renderer — single-pass diff confirmed by Vitest spies (`packages/happy-app/sources/components/diff/CollapsibleDiffPreview.test.tsx`). New `CollapsibleDiffPreview` component renders the hunk-truncated `ToolDiffView` inside a Pressable header that shows `Show N more lines` / `Hide`. `DiffView` suppresses its hunk header when the entire hunk is hidden (`renderDiffContent` returns early when `remainingVisibleLines <= 0`).
- **Stories US-001..US-008** (all VALID-evidence, single-iteration passes): hook → DiffView pass-through → ToolDiffView pass-through → CollapsibleDiffPreview wrapper + tests → `tools.diff.{showMore, collapse}` i18n keys across `_default.ts` + 10 translation files (Slavic plurals use the 3-form `plural({ count, one, few, many })` pattern) → WriteView/EditView/MultiEditView wiring with `collapsedLines={10}`. Existing `showLineNumbersInToolViews` and `showPlusMinusSymbols` behavior preserved on all three wired views. MultiEditView keeps its outer single horizontal `ScrollView` unchanged.
- **Two code-review fixes (F-001 consensus Medium, F-002 Claude-only Low):** F-001 removed an unnecessary `(t as unknown as DiffTranslation)` cast at the new i18n call sites — flagged independently by Codex (Low), Copilot (Medium), and Claude; the cast bypassed the typed `t<K extends TranslationKey>(...)` contract that already infers keys/params from `_default.ts`. F-002 removed a superstitious `event.stopPropagation?.()` in the toggle handler that contradicted the plan's documented RN `Pressable` precedent (events do not bubble to ancestor `TouchableOpacity`).
- **Docs review:** clean — no tracked `.md` files reference the new component, hook, prop signatures, or i18n keys (the diff is mechanically additive). **Security review:** skipped (`security_relevant=false`; only UI components and i18n strings).
- **DSAT signal:** 8 of 9 stories shipped clean in single iterations (0.80 stories/iter, 0 rollbacks, 2-round code-review convergence). Roughly 76% of total wall-clock burned on US-009 — the manual on-device verification — which Story Doctor correctly declined to patch (SPLIT/REORDER/SIMPLIFY can't remove a human-physical-observation constraint). Recommendation captured in `dsat-report.md`: introduce a `humanOnly: true` story flag in `prd.json` (matched by a `criteria-validator` rejection rule) so future stories like this short-circuit to BLOCKED instead of consuming retry budget.
- **On-device verification (US-009):** manual BOOX session on 2026-04-27. Metro served the worktree with `pnpm exec expo start --dev-client --clear`, dev-client connected via `adb reverse tcp:8081 tcp:8081`, expand/collapse cycle on the collapsed diff bubble verified across Write/Edit/MultiEdit fixtures. Discharged the pending-manual-verification gate before merge.

See `.ralph/jobs/expandable-diff-preview/plan.md` for the full plan and `.ralph/jobs/expandable-diff-preview/dsat-report.md` for the post-merge orchestration analysis.

## Pending ship notes

### Lazy-load long chats

| Device | Session | Tier | Median of 3 cold-open timings | Commit |
| --- | --- | --- | --- | --- |
| Onyx Boox model pending | session name + message count pending | Tier 0 | pending human measurement | `ddb0057d` |
| Onyx Boox model pending | session name + message count pending | Tier 1 | pending human measurement | `1da743db` |
| Onyx Boox model pending | session name + message count pending | Tier 2 | pending human measurement | `734dd960` |

Manual tablet verification still needs to record both Tier 2 interaction paths against `734dd960`: finger-scroll `onEndReached` loading and paginated page-turn loading.

## What's in `feature/tablet-sidebar-toggle` (historical, in commit order)

The initial batch, before the PR-A..PR-D work. Tip `c98bb557`. Content:

1. **`perf(chat): fix UI freeze entering large chats on tablets`** — PR #1154 base.
2. **`fix(chat): restore maintainVisibleContentPosition for scroll anchoring`** — PR #1154 second commit.
3. **`feat(app): tablet sidebar hide/show + chat text-size setting`** — first-cut sidebar toggle + `LocalSettings.chatFontScale: number (0.85–1.6)`; initial `useChatFontScaleOverride(base, lineHeight)` hook applied in `MarkdownView`; Settings → Appearance → Chat text size as tap-to-cycle (replaced by the slider in PR-B on `main`).
4. **`feat(app): three-state tablet sidebar (expanded / collapsed / hidden)`** — `sidebarMode: 'expanded' | 'collapsed' | 'hidden'`, new `SidebarContext` + `SidebarProvider`, `CollapsedSidebarView` (72-px rail), `CollapsibleSidebarEdge` (12-px chevron strip), `FABCompact`.
5. **`fixup: review round fixes`** — post-review polish.
6. **`fix(chrome): integrate sidebar restore into ChatHeaderView; MainView falls through in collapsed too`** — moved the restore affordance into `ChatHeaderView` as a menu glyph; `MainView` gate flipped from `!sidebarHidden` to `isExpanded`.
7. **`feat(markdown): strip Claude Code command-metadata tags (self-discovering)`** + **`feat(markdown): render Claude Code metadata tags instead of showing raw`** — the `processClaudeMetaTags` preprocessor module in `packages/happy-app/sources/components/markdown/processClaudeMetaTags.ts`, wired through `MarkdownView`.
8. **`feat(chat): expand chatFontScale beyond markdown to cover the whole chat`** — extended the initial Appearance setting to cover code blocks, agent events, tool section titles, Bash output, composer. Per-tool-view typography finished later in the PR-A batch on `main`.

## Build / iterate workflow

**One-time prereqs** (already satisfied on this box):

- Node 20+, pnpm 10+, Java 17 (`C:\Program Files\Java\jdk-17`), Android SDK at `D:\Android\Sdk` (platforms-35, build-tools-35.0.0, cmdline-tools), adb in `PATH`, USB debugging authorised on the tablet.
- `jq` (installed via `winget install jqlang.jq` on 2026-04-21 for `ralph.sh`/`review-loop.sh` in the `ralph-orchestration` plugin).
- Patched `node_modules/@more-tech/react-native-libsodium/android/CMakeLists.txt` to prepend `file(TO_CMAKE_PATH ...)` — required on Windows because the unescaped `\h` in a repo path breaks CMake's quoted-argument parser. **Re-apply after every `pnpm install`** in `D:\h` until upstreamed.

**Rebuild the APK from `D:\h`** (only when native code changed; JS-only edits don't need this):

```bash
export ANDROID_HOME="D:/Android/Sdk"
export ANDROID_SDK_ROOT="D:/Android/Sdk"
export JAVA_HOME="/c/Program Files/Java/jdk-17"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
export EXPO_PUBLIC_HAPPY_SERVER_URL="<tunnel URL or prod>"
export APP_ENV="development"
cd /d/h/packages/happy-app
pnpm exec expo run:android
```

First build is 10–15 min; incremental is 1–2 min. The dev client APK is `D:\h\packages\happy-app\android\app\build\outputs\apk\debug\app-debug.apk` (package `com.slopus.happy.dev`, coexists with Play Store Happy).

**JS-only changes (no native code edited):** skip the rebuild. Metro is already running from the last `expo run:android`. Force-reload via adb:

```bash
adb reverse tcp:8081 tcp:8081   # once per USB (re)connect
adb shell am force-stop com.slopus.happy.dev
adb shell monkey -p com.slopus.happy.dev -c android.intent.category.LAUNCHER 1
```

This is the workflow the 2026-04-22 batch used after the merge: Metro on `/d/h` (on `main @ 3fe2e0da`), reverse the port, force-relaunch the installed dev client. The app reconnects, Metro bundles the fresh JS, takes ~45 s on a cold cache, ~2–5 s on warm. See `.agents/skills/happy-tablet-iterate/SKILL.md` for the tight edit-reload loop.

**Autonomous batch work via `ralph-orchestration`:** plan + review + implement + review-fix convergence run end-to-end from a single `/implement-with-ralph --from-plan ... --autonomous` invocation. Job artifacts (plan, research briefs, review findings, stories) persist under `.ralph/jobs/<job-name>/`. Requires `jq` (see prereqs).

**Server URL:**

- `EXPO_PUBLIC_HAPPY_SERVER_URL` at build time sets the default.
- Runtime override lives in MMKV (`server-config` instance, key `custom-server-url`) and wins if set.
- Toggle via the app's custom-server UI in Settings.

## Cloudflare tunnel (local server from your phone/tablet)

Happy-server runs from `D:\harness-efforts\happy` via `pnpm --filter happy-server standalone:dev` (embedded PGlite, no Docker) on `http://localhost:3005`. A named Cloudflare Tunnel fronts it at the stable URL **`https://happy.evyatar.dev`**. The `cloudflared` binary is installed at `C:\Program Files (x86)\cloudflared\cloudflared.exe` (via `winget install Cloudflare.cloudflared`); config lives at `~/.cloudflared/`.

### Current setup (as of 2026-04-22)

- **Tunnel name:** `happy`
- **Tunnel ID:** `ebd51c79-c883-4850-a9bd-403c1513ed36`
- **Stable public URL:** `https://happy.evyatar.dev`
- **Config file:** `~/.cloudflared/config.yml`
  ```yaml
  tunnel: ebd51c79-c883-4850-a9bd-403c1513ed36
  credentials-file: C:\Users\evmitran\.cloudflared\ebd51c79-c883-4850-a9bd-403c1513ed36.json

  ingress:
    - hostname: happy.evyatar.dev
      service: http://localhost:3005
    - service: http_status:404
  ```
- **Origin cert:** `~/.cloudflared/cert.pem` (from `cloudflared tunnel login` against the `evyatar.dev` zone)
- **Credentials JSON:** `~/.cloudflared/ebd51c79-c883-4850-a9bd-403c1513ed36.json` — **treat as secret**; anyone with it can run the tunnel. Not in the repo.
- **DNS:** CNAME `happy.evyatar.dev` → `ebd51c79-c883-4850-a9bd-403c1513ed36.cfargotunnel.com`, created automatically by `cloudflared tunnel route dns happy happy.evyatar.dev`.

### Operating the tunnel

**One-shot foreground:**

```bash
"/c/Program Files (x86)/cloudflared/cloudflared.exe" tunnel run happy
```

**Persistent (Windows service, reboot-survivable):** both cloudflared and happy-server are managed as Windows Services via **nssm**. Setup recipe is in `scripts/fork-setup/setup-services.ps1` — run once in elevated PowerShell on a fresh machine. See the detailed walkthrough in the **Windows services** section below.

Inspect:

```bash
"/c/Program Files (x86)/cloudflared/cloudflared.exe" tunnel list
"/c/Program Files (x86)/cloudflared/cloudflared.exe" tunnel info happy
```

Delete and recreate (if something gets wedged):

```bash
"/c/Program Files (x86)/cloudflared/cloudflared.exe" tunnel delete happy
# then: tunnel create happy + edit config.yml with new UUID + route dns happy happy.evyatar.dev
```

### Backup / recovery

If the laptop dies and you lose `~/.cloudflared/`:

1. `cert.pem` is regenerable with `cloudflared tunnel login`.
2. The tunnel credentials JSON for a given tunnel is NOT recoverable from Cloudflare — delete the tunnel and create a new one, then re-route DNS.
3. Back up `~/.cloudflared/ebd51c79-c883-4850-a9bd-403c1513ed36.json` (and optionally `cert.pem` + `config.yml`) to a secure location if you want zero-downtime recovery.

### Client-side (app on the tablet)

- `EXPO_PUBLIC_HAPPY_SERVER_URL` at build time sets the compiled default.
- Runtime override lives in MMKV (`server-config` instance, key `custom-server-url`) and wins over the compiled default.
- Toggle via the app's custom-server UI in Settings. Set to `https://happy.evyatar.dev` once per fresh install, then every subsequent reboot/reload picks it up automatically.

### Legacy / fallback: quick tunnel

The old `cloudflared tunnel --url http://localhost:3005` workflow still works and hands back an ephemeral `*.trycloudflare.com` URL per invocation. Only useful now if the named tunnel is broken and you need a one-shot debug path; otherwise always prefer the named tunnel above.

## Windows services (happy-server + cloudflared)

Both happy-server and cloudflared are wrapped as Windows Services by **nssm** so they auto-start on boot. See `.agents/skills/happy-service-manage/SKILL.md` for day-to-day ops (restart, logs, debugging); this section is the one-shot setup reference.

### Why nssm for both

- **`cloudflared service install` is buggy on Windows for locally-created named tunnels.** It registers binPath with no `tunnel run` subcommand, so cloudflared starts, sees no subcommand, prints help, exits. Symptom: Event Viewer (Application log → source `cloudflared`) shows `Cloudflared service arguments: [C:\...\cloudflared.exe]` with no args.
- **PowerShell 5.1 mangles `sc.exe config binPath=` quoted strings**, so post-hoc fixes to the native service's binPath don't stick. (PowerShell 7+ has `Set-Service -BinaryPathName` which works, but the default admin Terminal on Windows 11 is still 5.1.)
- **Cloudflared's service runs as LocalSystem**, not your user. LocalSystem reads config from `C:\Windows\System32\config\systemprofile\.cloudflared\`, NOT `~/.cloudflared/`. `cloudflared service install` is *supposed* to copy the files over; on our machine it didn't.

nssm sidesteps all three: owns the arg list cleanly, runs as LocalSystem with explicit config path, and exposes standard `Get-Service` / `Start-Service` / `Stop-Service` / `Restart-Service` operations.

happy-server is also wrapped by nssm for consistent management (same ops, same log-rotation conventions).

### Prereqs

- `winget install Cloudflare.cloudflared`
- `winget install NSSM.NSSM`
- `winget install jqlang.jq` (for `ralph-orchestration` workflows)
- Named tunnel created: `cloudflared tunnel login` → `tunnel create happy` → `tunnel route dns happy happy.evyatar.dev` → `config.yml` written at `~/.cloudflared/config.yml`.
- Primary clone at `D:\harness-efforts\happy` with `packages/happy-server/.env.dev` in place.

### Setup

Run in **elevated PowerShell** (right-click Terminal → Run as administrator):

```powershell
powershell -ExecutionPolicy Bypass -File D:\harness-efforts\happy\scripts\fork-setup\setup-services.ps1
```

The script is idempotent — re-running overwrites the service configs cleanly. It:

1. Verifies prereqs.
2. Force-stops any running cloudflared / happy-server (handles the `Stop-Service` drain hang with `sc.exe stop` + `Stop-Process -Force`).
3. Uninstalls any pre-existing native `cloudflared` service or prior nssm install.
4. Copies `~/.cloudflared/*` into `C:\Windows\System32\config\systemprofile\.cloudflared\` and rewrites `config.yml` paths from the user profile to the system profile.
5. Registers `HappyServer` via nssm (wraps `pnpm --filter happy-server standalone:dev` with `AppDirectory=D:\harness-efforts\happy`).
6. Registers `cloudflared` via nssm (wraps `cloudflared.exe --config <sys> tunnel run`).
7. Starts both. Probes `https://happy.evyatar.dev`. Prints status.

Log files (10 MB rotation) land in `D:\harness-efforts\happy\packages\happy-server\logs\`:

- `service-stdout.log` / `service-stderr.log` — HappyServer
- `cloudflared-stdout.log` / `cloudflared-stderr.log` — cloudflared
- `.logs\<MM-DD-HH-MM-SS>.log` — HappyServer pino rich log (per-request detail)

### Reboot test

```powershell
shutdown /r /t 0
```

After login, `curl https://happy.evyatar.dev` should return `200` without running anything manually. If not, follow the failure-mode playbook in `.agents/skills/happy-service-manage/SKILL.md`.

### Backup

Back up `C:\Users\evmitran\.cloudflared\<tunnel-UUID>.json` somewhere durable (password manager, personal cloud). Losing it means deleting + recreating the tunnel and re-routing DNS. `cert.pem` is regenerable via `cloudflared tunnel login`.

Deferred work lives in `docs/fork-roadmap.md` — prioritised backlog for the fork.

## Known debt (not yet addressed)

- ~~**i18n:** pre-2026-04-22 strings in the `feature/tablet-sidebar-toggle` branch~~ — **resolved on 2026-04-24** (commit `8ab002e7`). All sidebar a11y labels now go through `t('sidebar.*')` with keys in `_default.ts` + 10 locales. `% of default` lives only in the old branch; the slider on `main` uses `settingsAppearance.*` keys.
- ~~**Inline styles** on the floating restore button in `SidebarNavigator.tsx`~~ — **resolved on 2026-04-24** (same commit). Moved into a `StyleSheet.create` block at the end of the file; only the runtime `safeArea.top + 8` stays inline.
- **Font-size constants** passed to `useChatFontScaleOverride` duplicate values from each stylesheet; a future cleanup would read them via `StyleSheet.flatten` so a style-edit doesn't silently drift from the scale constant.
- **ToolError / PermissionFooter / ToolFullView chrome typography** — see follow-ups #6 and #7 in `docs/fork-roadmap.md`. Tracked as F-020 and F-021 in `.ralph/jobs/chat-text-ux-eink/code-review-findings.json`.
- **Collapsed mode double-list UX** in `MainView`: when the sidebar is in `collapsed` mode, the 72-px rail AND the phone-style full list both render. Pragmatic fix for archive/inactive reachability; cleaner answer is extending the rail to carry inbox/archive/settings icons so the main pane can stay blank.
- **`useChromeState()` unification** — route × sidebar mode × isTablet chrome-decision logic is smeared across `SidebarNavigator`, `MainView`, `SessionView`, and now `ChatHeaderView`. Don't extract yet (rule of three not met), but add cross-file comments pointing at each other.

## Things that bit us that aren't obvious

- **Windows MAX_PATH (260 chars):** `:app:buildCMakeDebug[armeabi-v7a]` embeds the full source path into `.cxx/...../<pkg>/..../ComponentDescriptors.cpp.o`, easily blowing past 260. Registry `LongPathsEnabled=1` is set on this machine but ninja/Android Gradle Plugin don't opt into it via their manifest, so the setting is ignored. Workaround is the short-path clone at `D:\h`; `subst` and junctions don't work because pnpm resolves its symlinks back to the physical path and cross-drive `path.relative()` fails.
- **`react-native-libsodium` CMakeLists on Windows:** its `include_directories(..."${NODE_MODULES_DIR}/...")` fails because CMake's quoted-argument parser rejects any unrecognized `\<letter>` escape. `file(TO_CMAKE_PATH)` on `NODE_MODULES_DIR` at the top of the CMakeLists converts to forward slashes and sidesteps it. This is patched in `node_modules/` only, so it gets wiped by `pnpm install` — re-apply each time. **Follow-up:** `patch-package` would persist this fix; upstream PR to `@more-tech/react-native-libsodium` is trivially correct (one-liner `file(TO_CMAKE_PATH)`).
- **`LongPathsEnabled` requires per-app manifest opt-in** even when the registry key is on. Not enough to flip the flag; the tool has to cooperate.
- **Azure sub `Cortana Israel Dev` cannot host this server.** Has both "Storage accounts should prevent shared key access" (blocks ACI Azure-Files mounts) and `CSEStdPolicyNetwork_LAB` (hard-deny on any `Microsoft.Network/publicIPAddresses/*` action). No public IP can be created in this sub. Local-host + Cloudflare Tunnel is the only viable path within the sub's policies.
- **GitHub Enterprise Managed User (EMU) restriction on PR comments.** `gh pr comment` returns `GraphQL: Unauthorized: As an Enterprise Managed User, you cannot access this content (addComment)` when signed in with the `evmitran_microsoft` account. Workaround: `gh auth switch` to the personal `Evyatar108` account before posting. Both accounts are already authenticated in the keyring. Force-pushing to the fork works from either account, only the PR-thread interactions are blocked on the EMU.
- **Reloading JS on the dev client via adb** when the dev menu is elusive on e-ink: `adb shell am force-stop com.slopus.happy.dev` then `adb shell monkey -p com.slopus.happy.dev -c android.intent.category.LAUNCHER 1` gives a clean relaunch that picks up the fresh Metro bundle. `adb shell input keyevent 82` opens the dev menu but navigating it on e-ink is painful.
- **ChatList scroll anchoring is load-bearing.** The inverted FlatList pattern looks like it "naturally" handles new messages at `data[0]` — it doesn't. Without `maintainVisibleContentPosition`, React reconciles via `keyExtractor`, existing items shift to indices `1..N`, and the ScrollView's pixel offset points at different content. Felt as a viewport jump upward when scrolled up. `maintainVisibleContentPosition` costs a synchronous measurement pass on mount which is expensive without virtualization caps — but once `initialNumToRender` etc. limit the visible window, the cost is bounded and fine to keep.
- **Harmless dev-mode warning in chats on Android:** opening any chat logs 3–6× `ERROR Text strings must be rendered within a <Text> component.` pointing at `SessionActionsNativeMenu.android.tsx:51`. This is upstream code (we never touched it) that uses `@expo/ui/jetpack-compose`'s `DropdownMenuItem.Text` for the avatar long-press menu. The Compose-backed component is stricter than RN's `Text` and logs a warning even though the string value is fine. Dev-mode only; production builds swallow it; functionality is unaffected. Dismiss and ignore.
- **`console.log` from app code does NOT reach Metro in dev builds.** Happy ships `sources/utils/consoleLogging.ts` that monkey-patches `console.log/info/debug` to short-circuit unless `consoleOutputEnabled` is true (runtime-toggled). `console.warn` and `console.error` always pass through. **When instrumenting for Metro-side diagnostics, use `console.warn`, not `console.log`.**
- **React Native text styling does NOT cascade from a parent `View` into nested `<Text>` children.** Bit us in PR-C round 1: the initial plan was to apply animated `fontSize`/`lineHeight` on `MessageView`'s outer `View` during a pinch preview. RN simply ignores it — text sizing has to live on the `<Text>` itself. The fix was to use a visual `transform: [{ scale }]` on an `Animated.View` wrapper, which *does* affect visual rendering of everything inside it (including nested `<Text>`). Caught by Codex on the round-2 plan review before any code was written.
- **`transformOrigin: 'center'` in `useAnimatedStyle`.** Works in RN 0.76+ / Reanimated 4+. Our fork is on RN 0.83. Copilot round-4 review incorrectly claimed this prop is "not supported" (true for RN < 0.76). No workaround needed on our version; verified by typecheck + on-device.
- **MMKV writes are synchronous per call.** `applyLocalSettings({ chatFontScale: x })` hits MMKV on every invocation. Live-preview mechanisms (slider drag, pinch update) must keep intermediate values in ephemeral React state or Reanimated shared values; persisted writes happen exactly once per interaction (on release). This was a recurring mistake through PR-B and PR-C rounds — both needed explicit "don't write during drag" acceptance criteria.
- **`CodeView` is reused outside chat.** `app/(app)/session/[id]/info.tsx` renders it in a non-chat context. When PR-A added `useChatScaledStyles` to `CodeView`, the first-cut was unconditional — making `info.tsx` subscribe to `chatFontScale` and re-render on every toggle. Fixed via a `scaled?: boolean` prop (default `false`) + a split into `ScaledCodeBlock` / `UnscaledCodeBlock` so non-chat callers don't pay any subscription cost.
- **`renderToHardwareTextureAndroid` is expensive at rest.** It allocates a GPU texture per view. Only useful during an active transform animation; at rest it just pins VRAM. Bit us in PR-C round 5 — we had it pinned whenever `pinchToZoomEnabled` was on. Fix: gate it on an `isActive: SharedValue<boolean>` flipped in the pinch gesture's `.onBegin`/`.onFinalize`, bound via `useAnimatedProps`. Hardware texture now only exists during the gesture window.
- **Rebase-from-stale-main is fine if you fetch first.** The `chat-text-ux-eink` branch was built off local `main @ 9452985e` (Release 1.1.7). Upstream advanced by 10 commits while we worked — all in a new "codium" Electron area that has zero file overlap with `packages/happy-app`. `git rebase origin/main` on the final branch applied all 13 commits cleanly, no conflicts. The lesson: file-overlap check (`git diff --name-only base..upstream | sort` vs `...branch | sort`) before rebasing tells you immediately whether a rebase is risky.
- **`cloudflared service install` on Windows is buggy for locally-created named tunnels.** It registers the service binPath with only the exe path, no `tunnel run` subcommand. cloudflared then starts, sees no subcommand, prints help, exits. Event Viewer source `cloudflared`, message `Cloudflared service arguments: [C:\...\cloudflared.exe]` is the tell. Fix: use nssm to wrap cloudflared with explicit args. Captured in `scripts/fork-setup/setup-services.ps1`.
- **`cloudflared` service runs as LocalSystem and reads from `C:\Windows\System32\config\systemprofile\.cloudflared\`**, not `C:\Users\<you>\.cloudflared\`. `service install` is supposed to copy the files over; on our machine it silently didn't. Symptom: tunnel returns Cloudflare error 1033 (no origin connected) even though the service is "Running". Always use the setup script, which copies + rewrites paths into the system profile explicitly.
- **PowerShell 5.1 mangles `sc.exe config binPath=` quoted strings.** The default admin Terminal on Windows 11 is still PowerShell 5.1, and when you pass a string with embedded double quotes to a native command, the quotes get stripped before sc.exe sees them. Result: your binPath rewrite silently doesn't take effect. Use nssm (owns arg list cleanly), or `Set-Service -BinaryPathName` from PowerShell 7+, or wrap in `cmd.exe /c`. Never trust `sc.exe config binPath= "quoted string"` from PS 5.1.
- **`Stop-Service cloudflared` can hang in a "Waiting for service to stop" loop.** cloudflared drains active tunnel connections before stopping, and the drain can wedge. Fire-and-forget pattern: `& sc.exe stop cloudflared; Start-Sleep 2; Get-Process cloudflared -EA 0 | Stop-Process -Force`.
- **PowerShell 5.1 reads .ps1 files as CP-1252 when no BOM is present.** UTF-8 scripts with em-dashes or other multi-byte characters cause `TerminatorExpectedAtEndOfString` parse errors. Keep service scripts ASCII-only (or save with a UTF-8 BOM). The tokenizer chokes on byte sequences like `0xE2 0x80 0x94` (em-dash) and thinks a string literal never closed.

## Claude Code metadata tags rendered by `processClaudeMetaTags`

Claude Code wraps internal state in XML-ish tags inside message text. Its native CLI hides them; Happy (which receives raw text) used to render them as literal markup. The regex source-of-truth for the non-renderable classes lives in the shared registry at `packages/happy-wire/src/nonRenderablePolicy.ts`; `packages/happy-app/sources/components/markdown/processClaudeMetaTags.ts` imports the per-tag entries (`localCommandCaveatEntry`, `systemReminderEntry`, `forkBoilerplateEntry`) from it and `MarkdownView.tsx` feeds message text through the receiver-side strip before parsing or copying. happy-cli (`packages/happy-cli`, see [`packages/happy-cli/CLAUDE.md`](../packages/happy-cli/CLAUDE.md)) imports the same registry and applies a stricter sender-side drop via `findSenderDropEntry(...)` at the very top of `sendClaudeSessionMessage(...)` in `packages/happy-cli/src/api/apiSession.ts`, before normalization, mapper calls, envelope creation, or outbox enqueue. v0 sender policy drops only the two empirically-observed whole-message classes — standalone `<local-command-caveat>` user messages and `skill-body` injections — keeping the encrypted outbox conservative. The receiver-side strip below remains as defense in depth for old stored sessions and Claude SDK drift, and is the sole suppression site for `<system-reminder>` and `<fork-boilerplate>` in v0. Current rules:

| Tag | Origin | Treatment | Rationale |
|---|---|---|---|
| `<command-name>` + `<command-message>` + `<command-args>` | `/slash-command` from the user | Folded together → inline-code token `` `/name [args]` `` | Reads as the command the user ran. |
| `<local-command-stdout>` | stdout of a `!bang-command` | Fenced code block | Monospace output styling. |
| `<local-command-stderr>` | stderr of a `!bang-command` | Fenced code block, `# stderr` header line | Visually distinguishes from stdout. |
| `<local-command-caveat>` | Directive inserted by Claude Code for Claude only ("Caveat: The messages below were generated by the user while running local commands. DO NOT respond to these messages or acknowledge them…") | Removed entirely (tag + content) | Has no value for the human reader; safe to hide. happy-cli also drops this sender-side via `findSenderDropEntry(...)` at the top of `sendClaudeSessionMessage(...)` when it appears as a standalone whole-message `user` payload (see [`packages/happy-wire/src/nonRenderablePolicy.ts`](../packages/happy-wire/src/nonRenderablePolicy.ts) `localCommandCaveatEntry`); the receiver-side strip is defense in depth for old stored sessions and SDK drift. |
| `<task-notification>` | Claude Code background-task updates | Clickable pill + detail modal | Task state is user-facing, but raw XML is not. Deferred-tag inventory: [synthetic-xml-tags-future-coverage.md](plans/synthetic-xml-tags-future-coverage.md). |
| `<system-reminder>` | Claude-only operational scaffolding | Removed entirely (tag + content) | These reminders are for the model, not the human reader. Receiver-only in v0 — the empirical sender sample on 2026-05-01 didn't justify dropping inside the encrypted outbox; the regex still ships from [`packages/happy-wire/src/nonRenderablePolicy.ts`](../packages/happy-wire/src/nonRenderablePolicy.ts) (`systemReminderEntry`) so a future sender drop is a one-line `enableSender: true` flip. Deferred-tag inventory: [synthetic-xml-tags-future-coverage.md](plans/synthetic-xml-tags-future-coverage.md). |
| `<fork-boilerplate>` | Fork-child agent scaffolding | Removed entirely (tag + content) | The boilerplate is setup text for child agents, not chat content. Receiver-only in v0 for the same reason as `<system-reminder>` — the regex lives in [`packages/happy-wire/src/nonRenderablePolicy.ts`](../packages/happy-wire/src/nonRenderablePolicy.ts) (`forkBoilerplateEntry`) and can be promoted to a sender drop when a whole-message sample appears in production JSONL. Deferred-tag inventory: [synthetic-xml-tags-future-coverage.md](plans/synthetic-xml-tags-future-coverage.md). |
| `<options>` / `<option>` | Interactive reply suggestions | **Untouched.** Handled downstream as clickable UI. | Tapping an option sends it as a message. |

**When a new tag family appears**, the preprocessor logs `[MarkdownView] unknown tag <name>` once to Metro (dev-only). See `.agents/skills/happy-discover-metadata-tags/SKILL.md` for the full discovery workflow — it's the one we used to build the taxonomy above.

### Claude Code injections that are NOT XML tags

Some Claude Code injections arrive as plain user-role text (no wrapper), so `processClaudeMetaTags` doesn't see them. They're suppressed at the message-render layer instead:

| Injection | Origin | Detection | Treatment |
|---|---|---|---|
| Skill body | After every `Skill` tool_use/tool_result, Claude Code posts a verbatim copy of the loaded `SKILL.md` as a `user`-role text message. The wrench-icon `Skill` ToolView already shows the call. | The canonical prefix regex `Base directory for this skill: <abs-path>\n\n# <Heading>` lives in [`packages/happy-wire/src/nonRenderablePolicy.ts`](../packages/happy-wire/src/nonRenderablePolicy.ts) as `skillBodyEntry.receiverPrefix`; `packages/happy-app/sources/components/markdown/skillBody.ts` re-exports it through `isSkillBodyMessage(text)`. The regex stays strict enough that user text mentioning the prefix mid-sentence won't match. | happy-cli drops the entire skill-body message sender-side via `findSenderDropEntry(...)` at the top of `sendClaudeSessionMessage(...)` (matching the `array1` user-content shape with the same prefix), so well-behaved fresh sessions never carry it on the wire. The receiver-side guard remains as defense in depth: **both** `UserTextBlock` and `AgentTextBlock` in `packages/happy-app/sources/components/MessageView.tsx` return `null`. On the wire the role is `user`, but `typesRaw.ts`'s normalizer routes most non-string-content user messages through the agent-text path, so the user-text-only guard alone is insufficient — the agent-text guard is the one that actually fires for any skill bodies stored before the sender drop landed or smuggled in by SDK drift. The user-text guard is a defensive symmetric backstop. The Skill ToolView remains visible. |

## Decision log

- **PR #1154 — scope:** first thought the PR should revert the anchoring change in a separate perf PR (cleaner review narrative). Reviewers (Codex × 2 rounds, Plan, Explore) debated, Explore recanted their initial "no regression" claim, and the consensus was the two-commit story (perf fix + anchor restore) reads well enough on its own. Shipped as two commits.
- **Hidden sidebar mode:** Codex recommended dropping it entirely to simplify `MainView` + `SidebarNavigator`. Rejected — real user requirement (max-focus reading on e-ink). Instead: moved the restore affordance *into* `ChatHeaderView` so hidden mode pays an explicit per-route cost rather than carrying a global floating button that fights route headers.
- **PR-A helper shape (2026-04-22, round 1 plan review):** the plan proposed a broad `scaleChatMonoFonts(styles, scale)` module-scope walker; round-1 reviewers (Codex + Claude) pushed back that the existing `useChatFontScaleOverride` pattern was already good for bespoke views. Compromise: the new helper is scoped to "shared leaves with 4+ entries" and bespoke views keep the existing override pattern. Round 2 further simplified by dropping the internal `useMemo` (was being defeated by inline-literal call sites anyway) so every caller is safe without micro-managing style references.
- **PR-C preview mechanism (2026-04-22, round 2 plan review):** first draft applied animated `fontSize`/`lineHeight` at the `MessageView` wrapper. Codex round-2 flagged that RN text sizing doesn't cascade from a parent `View` into nested `<Text>` — the preview would not visibly scale anything. Rewrote to use a visual `transform: [{ scale }]` on `Animated.View` with `transformOrigin: 'center'`. Side benefit: the transform affects markdown AND tool-call messages uniformly without needing per-consumer wiring.
- **PR-C opt-in cost-at-rest (round 4 + round 5):** first-cut wrapped every message in `Animated.View` + `useAnimatedStyle` + `renderToHardwareTextureAndroid={true}` unconditionally. Round 4 review caught the per-message Reanimated subscription cost; fixed by gating the Provider mount on `pinchToZoomEnabled`. Round 5 review caught that the hardware texture was still pinned whenever the toggle was on (not just during active gesture); fixed by `useAnimatedProps` binding to an `isActive` shared value flipped in `.onBegin`/`.onFinalize`.
- **PR-D tap zones:** plan originally said "full top/bottom halves". Plan review pointed out this eats `AskUserQuestionView` buttons and markdown link taps. Narrowed to 15% edge strips on top + bottom; middle 70% stays pass-through. Verified structurally in code review (no new `GestureDetector` / `Pressable` in the middle region).
- **Font-scale scope expansion vs streaming throttle (2026-04):** originally deferred font-scale expansion in favour of e-ink streaming throttle / display profile ideas. Reversed in the 2026-04-22 batch — font-scale turned out to be much smaller scope than expected (2 days of autonomous Ralph work) while streaming throttle touches the message reducer (riskier). Streaming throttle moves back to `Further out` in `docs/fork-roadmap.md`.
