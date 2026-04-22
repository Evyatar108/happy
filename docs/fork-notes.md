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
| `D:\h` | Short-path clone used **only** for Android Gradle builds. Without it, `:app:buildCMakeDebug` fails with "filename longer than 260 characters" during codegen. Fresh clone of the fork; `pnpm install` run there. Never push from this clone unless you're doing an on-device-verified commit. |

When you edit code in `D:\harness-efforts\happy`, you must either:
1. Commit + push to fork, then `git pull` in `D:\h`, then rebuild; or
2. Edit in `D:\h` directly and sync back.

The current practice has been **edit in `D:\h` for anything that needs on-device testing**, commit + push, and pull into `D:\harness-efforts\happy` when stable.

## Branches

| Branch | Status | What's in it |
| --- | --- | --- |
| `main` | tracks upstream | clean |
| `fix/chat-list-perf-inverted-flatlist` | **published PR, open for review** | The chat-freeze perf fix. See [slopus/happy#1154](https://github.com/slopus/happy/pull/1154). Two commits: (a) drops `maintainVisibleContentPosition` and adds conservative virtualization props + memoizes `MessageView`; (b) restores `maintainVisibleContentPosition` after a second review round flagged that without it new messages prepending at `data[0]` shift the viewport for users scrolled up reading history. The tight virtualization props keep the mount-time measurement pass cheap enough that the freeze fix still holds. Verified freeze-fix on the e-ink tablet; scroll-anchor re-verification pending. |
| `feature/tablet-sidebar-toggle` | **personal — not for upstream** | Rebased on top of the updated PR branch. Adds: 3-state tablet sidebar (expanded / collapsed 72-px rail / fully hidden) and a "Chat text size" local setting. Has known i18n + style-convention debt that would block upstreaming as-is. |

## What's in `feature/tablet-sidebar-toggle` (in commit order, current tip `f7baa660`)

1. **`perf(chat): fix UI freeze entering large chats on tablets`** — the PR's first commit. Base.
2. **`fix(chat): restore maintainVisibleContentPosition for scroll anchoring`** — the PR's second commit. Also base, because the feature branch was rebased when the PR grew this commit.
3. **`feat(app): tablet sidebar hide/show + chat text-size setting`**
   - Initial `LocalSettings.sidebarCollapsed: boolean` (replaced in commit 4) and `LocalSettings.chatFontScale: number (0.85–1.6)`.
   - First-cut hide/show: chevron button in the sidebar header that hides the whole drawer; floating menu button top-left brings it back, with a route-aware regex meant to avoid React-Navigation headers.
   - `useChatFontScaleOverride(base, lineHeight)` hook applied in `MarkdownView` to body text, headers, and lists. Code blocks / tables / mermaid deliberately unscaled.
   - Settings → Appearance → Chat text size, tap-to-cycle Normal / Large / X-Large / XX-Large (1.0 / 1.1 / 1.25 / 1.4).
4. **`feat(app): three-state tablet sidebar (expanded / collapsed / hidden)`** — reworks the sidebar on top of upstream PR #316's design.
   - `LocalSettings.sidebarCollapsed` replaced with `sidebarMode: 'expanded' | 'collapsed' | 'hidden'`.
   - New `SidebarContext` + `SidebarProvider` at the root.
   - New `CollapsedSidebarView` (72-px icon rail with session avatars, adapted from PR #316 to the `SessionRowData` shape that landed after their branch).
   - New `CollapsibleSidebarEdge` (12-px chevron strip, toggles expanded ↔ collapsed) and `FABCompact`.
   - Header "hide" icon in the full sidebar jumps straight to hidden.
   - `MainView` intended to fall through to the phone layout when the sidebar is hidden — but the gate was `!sidebarHidden`, which broke collapsed mode (see commit 6 for the proper fix).
5. **`fixup: review round fixes`** — post-review polish: `FABWide` back to sibling of the inner sidebar container; added `hitSlop` to the 12-px `CollapsibleSidebarEdge`; split "Hide sidebar (max focus)" into `accessibilityLabel="Hide sidebar"` + `accessibilityHint`; dropped a redundant `flavor ?? undefined` in the avatar prop.
6. **`fix(chrome): integrate sidebar restore into ChatHeaderView; MainView falls through in collapsed too`** — addresses two regressions Codex flagged in a later review round.
   - On tablet session routes the floating restore button overlapped `ChatHeaderView`'s own back button (the route regex wrongly treated the custom in-content header as "no header"). Moved the restore affordance into `ChatHeaderView` — a menu glyph next to the back chevron, shown only when `isTablet && sidebarMode === 'hidden'`. The floating restore in `SidebarNavigator` is now limited to the index route (`/`) where no other chrome exists.
   - `MainView` was gating its blank-tablet placeholder on `!sidebarHidden`, so collapsed mode also hit a blank index and inactive / archived sessions were unreachable. Gate flipped to `isExpanded` — collapsed and hidden both fall through to the phone tab layout. Intentional tradeoff: in collapsed mode the user sees the rail on the left AND the full `SessionsList` in the main pane (rail = quick switcher, main pane = rich list).

## Build / iterate workflow

**One-time prereqs** (already satisfied on this box):

- Node 20+, pnpm 10+, Java 17 (`C:\Program Files\Java\jdk-17`), Android SDK at `D:\Android\Sdk` (platforms-35, build-tools-35.0.0, cmdline-tools), adb in `PATH`, USB debugging authorised on the tablet.
- Patched `node_modules/@more-tech/react-native-libsodium/android/CMakeLists.txt` to prepend `file(TO_CMAKE_PATH ...)` — required on Windows because the unescaped `\h` in a repo path breaks CMake's quoted-argument parser. **Re-apply after every `pnpm install`** in `D:\h` until upstreamed.

**Rebuild the APK from `D:\h`:**

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

**JS-only changes (no native code edited):** skip the rebuild. Metro is already running from the last `expo run:android`. Just **shake the tablet → Reload** and it fetches the new bundle over `adb reverse tcp:8081`.

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

- **i18n:** all new user-facing strings (`"Chat text size"`, `"Normal/Large/X-Large/XX-Large"`, `"Show sidebar"`, `"% of default"`, etc.) are hard-coded English. `CLAUDE.md` requires `t(...)` with entries in all 9 translation files before upstreaming.
- **Inline styles** on the floating restore button in `SidebarNavigator.tsx` should live in a `StyleSheet.create` block per the Unistyles guide.
- **`useChatFontScaleOverride`** lives inline in `MarkdownView.tsx`; CLAUDE.md prefers non-trivial hooks in `sources/hooks/`. A standalone `packages/happy-app/sources/hooks/useChatFontScale.ts` exists as untracked-but-unused in `D:\harness-efforts\happy` and should replace the inline version when scope expansion lands.
- **Font-size constants** in `useChatFontScaleOverride` duplicate values from the MarkdownView stylesheet; a future cleanup would read them via `StyleSheet.flatten`.
- **Font scale scope** currently only covers markdown (body / headers / lists). Agent-event messages, tool-call views, code blocks, and the composer don't scale. Brainstormed next: use a React Context + `<ScaledText>` at ~5 boundary components rather than adding more per-leaf hook calls.
- **Pinch-to-zoom to control chat text size** — requested but not implemented.
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
- **Font-scale scope expansion:** explicitly deferred in favour of e-ink streaming throttle / display profile ideas that would move the needle more. See "Known debt" for the deferred items; see project-level brainstorm transcripts for the e-ink ideas worth considering next.
