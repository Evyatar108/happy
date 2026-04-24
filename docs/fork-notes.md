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
| `main` | **ahead of upstream by 39 commits** as of 2026-04-22; mirrors `fork/main` | The PR-A..PR-D chat text UX batch (merged from `chat-text-ux-eink`) on top of upstream `f6083b48`, + the 2026-04-22 native & installed Claude Code skills support merge (20 commits from `feat/native-and-installed-skills-support`, which was stacked on `fix/preserve-user-settings-for-plugin-skills` — both now on main). |
| `fix/chat-list-perf-inverted-flatlist` | **shipped upstream as PR [#1154](https://github.com/slopus/happy/pull/1154)** | The chat-freeze perf fix. Two commits: (a) drops `maintainVisibleContentPosition` and adds conservative virtualization props + memoizes `MessageView`; (b) restores `maintainVisibleContentPosition` after a second review round flagged that without it new messages prepending at `data[0]` shift the viewport for users scrolled up reading history. |
| `fix/preserve-user-settings-for-plugin-skills` | **merged to `fork/main` on 2026-04-22** (stacked under native skills merge); upstream PR still TBD for slopus/happy#779 | One commit (`317fce8a`) in happy-cli that preserves `enabledPlugins` + MCP fields when passing `--settings` to Claude Code. Without it, plugin-provided skills never reach the SDK's `slash_commands` emission and are invisible to happy. Prerequisite for the native-skills merge. |
| `feature/tablet-sidebar-toggle` | **personal — not for upstream** | 3-state tablet sidebar (expanded / 72-px rail / fully hidden) and the initial "Chat text size" local setting (partial coverage — the remaining tool-view typography was finished in the 2026-04-22 PR-A..PR-D batch on `main`). Has known i18n + style-convention debt that would block upstreaming as-is. Not superseded by the `main` merge — its other content (sidebar state machine) is not yet upstreamed. |
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
- **`cloudflared service install` on Windows is buggy for locally-created named tunnels.** It registers the service binPath with only the exe path, no `tunnel run` subcommand. cloudflared then starts, sees no subcommand, prints help, exits. Event Viewer source `cloudflared`, message `Cloudflared service arguments: [C:\...\cloudflared.exe]` is the tell. Fix: use nssm to wrap cloudflared with explicit args. Captured in `scripts/fork-setup/setup-services.ps1`.
- **`cloudflared` service runs as LocalSystem and reads from `C:\Windows\System32\config\systemprofile\.cloudflared\`**, not `C:\Users\<you>\.cloudflared\`. `service install` is supposed to copy the files over; on our machine it silently didn't. Symptom: tunnel returns Cloudflare error 1033 (no origin connected) even though the service is "Running". Always use the setup script, which copies + rewrites paths into the system profile explicitly.
- **PowerShell 5.1 mangles `sc.exe config binPath=` quoted strings.** The default admin Terminal on Windows 11 is still PowerShell 5.1, and when you pass a string with embedded double quotes to a native command, the quotes get stripped before sc.exe sees them. Result: your binPath rewrite silently doesn't take effect. Use nssm (owns arg list cleanly), or `Set-Service -BinaryPathName` from PowerShell 7+, or wrap in `cmd.exe /c`. Never trust `sc.exe config binPath= "quoted string"` from PS 5.1.
- **`Stop-Service cloudflared` can hang in a "Waiting for service to stop" loop.** cloudflared drains active tunnel connections before stopping, and the drain can wedge. Fire-and-forget pattern: `& sc.exe stop cloudflared; Start-Sleep 2; Get-Process cloudflared -EA 0 | Stop-Process -Force`.
- **PowerShell 5.1 reads .ps1 files as CP-1252 when no BOM is present.** UTF-8 scripts with em-dashes or other multi-byte characters cause `TerminatorExpectedAtEndOfString` parse errors. Keep service scripts ASCII-only (or save with a UTF-8 BOM). The tokenizer chokes on byte sequences like `0xE2 0x80 0x94` (em-dash) and thinks a string literal never closed.

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
