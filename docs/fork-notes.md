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
| `main` | **ahead of upstream by 13 commits** as of 2026-04-22; mirrors `fork/main` | The PR-A..PR-D chat text UX batch (merged from `chat-text-ux-eink`) on top of upstream `f6083b48`. |
| `fix/chat-list-perf-inverted-flatlist` | **shipped upstream as PR [#1154](https://github.com/slopus/happy/pull/1154)** | The chat-freeze perf fix. Two commits: (a) drops `maintainVisibleContentPosition` and adds conservative virtualization props + memoizes `MessageView`; (b) restores `maintainVisibleContentPosition` after a second review round flagged that without it new messages prepending at `data[0]` shift the viewport for users scrolled up reading history. |
| `feature/tablet-sidebar-toggle` | **personal — not for upstream** | 3-state tablet sidebar (expanded / 72-px rail / fully hidden) and the initial "Chat text size" local setting (partial coverage — the remaining tool-view typography was finished in the 2026-04-22 PR-A..PR-D batch on `main`). Has known i18n + style-convention debt that would block upstreaming as-is. Not superseded by the `main` merge — its other content (sidebar state machine) is not yet upstreamed. |
| `chat-text-ux-eink` | **merged to `fork/main`** | The 2026-04-22 PR-A..PR-D batch. 13 commits: 4 `feat` + 4 `docs: mark item #N shipped` + 3 `refactor(chat)` review-fix commits + 1 hardware-texture gating fix. Branch kept for history; the code lives on `main` now. |

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

## What's in `feature/tablet-sidebar-toggle` (historical, in commit order)

The initial batch, before the PR-A..PR-D work. Tip `c98bb557`. Content:

1. **`perf(chat): fix UI freeze entering large chats on tablets`** — PR #1154 base.
2. **`fix(chat): restore maintainVisibleContentPosition for scroll anchoring`** — PR #1154 second commit.
3. **`feat(app): tablet sidebar hide/show + chat text-size setting`** — first-cut sidebar toggle + `LocalSettings.chatFontScale: number (0.85–1.6)`; initial `useChatFontScaleOverride(base, lineHeight)` hook applied in `MarkdownView`; Settings → Appearance → Chat text size as tap-to-cycle (replaced by the slider in PR-B on `main`).
4. **`feat(app): three-state tablet sidebar (expanded / collapsed / hidden)`** — `sidebarMode: 'expanded' | 'collapsed' | 'hidden'`, new `SidebarContext` + `SidebarProvider`, `CollapsedSidebarView` (72-px rail), `CollapsibleSidebarEdge` (12-px chevron strip), `FABCompact`.
5. **`fixup: review round fixes`** — post-review polish.
6. **`fix(chrome): integrate sidebar restore into ChatHeaderView; MainView falls through in collapsed too`** — moved the restore affordance into `ChatHeaderView` as a menu glyph; `MainView` gate flipped from `!sidebarHidden` to `isExpanded`.
7. **`feat(markdown): strip Claude Code command-metadata tags (self-discovering)`** + **`feat(markdown): render Claude Code metadata tags instead of showing raw`** — the `processClaudeMetaTags` preprocessor in `MarkdownView`.
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

Tunnel URLs are ephemeral (`*.trycloudflare.com`). If `cloudflared` restarts, the URL changes and every connected client needs the new one.

```bash
cloudflared tunnel --url http://localhost:3005
# copy the printed URL
```

Happy-server runs from `D:\harness-efforts\happy` via `pnpm --filter happy-server standalone:dev` (embedded PGlite, no Docker).

Deferred work lives in `docs/fork-roadmap.md` — prioritised backlog for the fork.

## Known debt (not yet addressed)

- **i18n:** pre-2026-04-22 strings in the `feature/tablet-sidebar-toggle` branch (`"Show sidebar"`, `"% of default"`, etc.) are still hard-coded English. The 2026-04-22 Appearance slider + toggles added proper `settingsAppearance.*` keys across all 11 locale files, so new work on `main` doesn't add to this debt — the existing residue is in the older branch.
- **Inline styles** on the floating restore button in `SidebarNavigator.tsx` should live in a `StyleSheet.create` block per the Unistyles guide.
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

## Claude Code metadata tags rendered by `MarkdownView`

Claude Code wraps internal state in XML-ish tags inside message text. Its native CLI hides them; Happy (which receives raw text) used to render them as literal markup. Preprocessor lives in `packages/happy-app/sources/components/markdown/MarkdownView.tsx` (`processClaudeMetaTags`). Current rules:

| Tag | Origin | Treatment | Rationale |
|---|---|---|---|
| `<command-name>` + `<command-message>` + `<command-args>` | `/slash-command` from the user | Folded together → inline-code token `` `/name [args]` `` | Reads as the command the user ran. |
| `<local-command-stdout>` | stdout of a `!bang-command` | Fenced code block | Monospace output styling. |
| `<local-command-stderr>` | stderr of a `!bang-command` | Fenced code block, `# stderr` header line | Visually distinguishes from stdout. |
| `<local-command-caveat>` | Directive inserted by Claude Code for Claude only ("Caveat: The messages below were generated by the user while running local commands. DO NOT respond to these messages or acknowledge them…") | Removed entirely (tag + content) | Has no value for the human reader; safe to hide. |
| `<options>` / `<option>` | Interactive reply suggestions | **Untouched.** Handled downstream as clickable UI. | Tapping an option sends it as a message. |

**When a new tag family appears**, the preprocessor logs `[MarkdownView] unknown tag <name>` once to Metro (dev-only). See `.agents/skills/happy-discover-metadata-tags/SKILL.md` for the full discovery workflow — it's the one we used to build the taxonomy above.

## Decision log

- **PR #1154 — scope:** first thought the PR should revert the anchoring change in a separate perf PR (cleaner review narrative). Reviewers (Codex × 2 rounds, Plan, Explore) debated, Explore recanted their initial "no regression" claim, and the consensus was the two-commit story (perf fix + anchor restore) reads well enough on its own. Shipped as two commits.
- **Hidden sidebar mode:** Codex recommended dropping it entirely to simplify `MainView` + `SidebarNavigator`. Rejected — real user requirement (max-focus reading on e-ink). Instead: moved the restore affordance *into* `ChatHeaderView` so hidden mode pays an explicit per-route cost rather than carrying a global floating button that fights route headers.
- **PR-A helper shape (2026-04-22, round 1 plan review):** the plan proposed a broad `scaleChatMonoFonts(styles, scale)` module-scope walker; round-1 reviewers (Codex + Claude) pushed back that the existing `useChatFontScaleOverride` pattern was already good for bespoke views. Compromise: the new helper is scoped to "shared leaves with 4+ entries" and bespoke views keep the existing override pattern. Round 2 further simplified by dropping the internal `useMemo` (was being defeated by inline-literal call sites anyway) so every caller is safe without micro-managing style references.
- **PR-C preview mechanism (2026-04-22, round 2 plan review):** first draft applied animated `fontSize`/`lineHeight` at the `MessageView` wrapper. Codex round-2 flagged that RN text sizing doesn't cascade from a parent `View` into nested `<Text>` — the preview would not visibly scale anything. Rewrote to use a visual `transform: [{ scale }]` on `Animated.View` with `transformOrigin: 'center'`. Side benefit: the transform affects markdown AND tool-call messages uniformly without needing per-consumer wiring.
- **PR-C opt-in cost-at-rest (round 4 + round 5):** first-cut wrapped every message in `Animated.View` + `useAnimatedStyle` + `renderToHardwareTextureAndroid={true}` unconditionally. Round 4 review caught the per-message Reanimated subscription cost; fixed by gating the Provider mount on `pinchToZoomEnabled`. Round 5 review caught that the hardware texture was still pinned whenever the toggle was on (not just during active gesture); fixed by `useAnimatedProps` binding to an `isActive` shared value flipped in `.onBegin`/`.onFinalize`.
- **PR-D tap zones:** plan originally said "full top/bottom halves". Plan review pointed out this eats `AskUserQuestionView` buttons and markdown link taps. Narrowed to 15% edge strips on top + bottom; middle 70% stays pass-through. Verified structurally in code review (no new `GestureDetector` / `Pressable` in the middle region).
- **Font-scale scope expansion vs streaming throttle (2026-04):** originally deferred font-scale expansion in favour of e-ink streaming throttle / display profile ideas. Reversed in the 2026-04-22 batch — font-scale turned out to be much smaller scope than expected (2 days of autonomous Ralph work) while streaming throttle touches the message reducer (riskier). Streaming throttle moves back to `Further out` in `docs/fork-roadmap.md`.
