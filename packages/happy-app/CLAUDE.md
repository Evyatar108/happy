# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- `pnpm start` - Start the Expo development server
- `pnpm ios` - Run the app on iOS simulator
- `pnpm android` - Run the app on Android emulator
- `pnpm web` - Run the app in web browser
- `pnpm prebuild` - Generate native iOS and Android directories
- `pnpm typecheck` - Run TypeScript type checking after all changes

### macOS Desktop (Tauri)
- `pnpm tauri:dev` - Run macOS desktop app with hot reload
- `pnpm tauri:build:dev` - Build development variant
- `pnpm tauri:build:preview` - Build preview variant
- `pnpm tauri:build:production` - Build production variant

### Testing
- `pnpm test` - Run tests in watch mode (Vitest)
- Vitest auto-discovers both `sources/**/*.test.ts` and `sources/**/*.test.tsx`; prefer `.tsx` for component tests so JSX-bearing specs are exercised by the full suite without one-off wrappers.
- Keep the Vitest config in `vitest.config.mts`; the `.ts` filename can fail to boot under this Windows/Bash setup with an `ERR_REQUIRE_ESM` startup error.
- For node-environment sync tests, mock `sources/sync/storage.ts` instead of importing the real store when you only need `storage.getState()`. The real store pulls in `react-native`, which can fail to parse under Vitest's node runner in this harness.
- For hook tests that only need synchronous context/memo evaluation (for example `useChatFontScale` worklet math), mock `react`'s `useContext`/`useMemo` and `react-native-reanimated`'s `useAnimatedStyle` so the hook can be called directly without a renderer.
- `sources/components/markdown/processClaudeMetaTags.test.ts` should mock `@/text` and clear `warnedTagNames` in `beforeEach()` so the stderr-label assertion and unknown-tag warn-once behavior stay deterministic under Vitest.
- No existing tests in the codebase yet

### Production / release (fork)

This is the `Evyatar108/happy` fork. **The fork does NOT use EAS / OTA.** The `pnpm ota` and `pnpm ota:production` scripts in `package.json` are upstream tooling and do not work here — they require an Expo cloud session and push to channels nothing on the fork consumes. The dev/inner-loop consumer of happy-app on the fork is the maintainer's BOOX dev tablet, which pulls JS over `adb reverse` from a local Metro server. To iterate on an app change: bump `CHANGELOG.md`, regenerate `sources/changelog/changelog.json`, and reload the tablet via Metro (`.agents/skills/happy-tablet-iterate/SKILL.md`). See `.agents/skills/release/SKILL.md` "Mobile Release (fork — Metro-based, not EAS)" for the Metro procedure.

#### Android over-WiFi propagation (current default: Firebase App Distribution)

For propagating production builds to the maintainer's two BOOX tablets without USB/Metro, the fork publishes a signed APK via **Firebase App Distribution** under the personal Google account `evyatar109@gmail.com` (Firebase project `happy-app-141ff`). The Play Console developer account was originally the planned channel but is currently locked for inactivity (as of 2026-04-30); App Distribution is the working channel until Play reopens. Both channels share the same signed APK pipeline, keystore, and `google-services.json` — only the upload destination differs.

The production package id is **`com.evyatar109.happy`** (renamed from upstream's `com.ex3ndr.happy` because the fork does not own that namespace and the package id is permanent once published to Play Store). The Expo `updates.url` block was deliberately removed from `app.config.js` — `expo-updates` is a no-op at runtime; auto-update happens via the active distribution channel only. Metro+USB remains the dev/verification loop (unchanged); App Distribution is purely the propagation channel.

Per-release flow: bump `CHANGELOG.md` → `pnpm release:android` → script auto-uploads the signed APK to App Distribution → both tablets get a notification within minutes → tap → install. To skip the upload (e.g. iterate on signing locally + adb-install): `pnpm release:android --no-distribute`. The script auto-runs `parseChangelog.ts` (no manual regenerate needed) and auto-syncs the package-root `google-services.json` into `android/app/`. **`versionCode` must monotonically increase across all releases including uninstalls** — always bump CHANGELOG before each release.

The pipeline has several Windows-specific load-bearing customizations in `android/app/build.gradle` that survive only as direct edits (no Expo config plugin yet — the fork doesn't run prebuild). All are documented in `.agents/skills/happy-app-playstore-release/SKILL.md` "Common pitfalls" with the empirical context that justified each. The non-obvious ones:

- **`packages/happy-app/scripts/expo-embed-wrapper.cjs` is load-bearing.** Wraps `@expo/cli` to absolutize `--entry-file` before Metro sees it, working around an upstream bug in `@react-native/gradle-plugin/shared/.../Os.kt` `cliPath()` that returns relative paths on Windows (Metro then mis-resolves on this pnpm workspace). `react.cliFile` in `build.gradle` points at this wrapper instead of `@expo/cli` directly.
- **`namespace 'com.slopus.happy.dev'` is fixed**; only `applicationId` is env-driven via `appPackageByEnv[appEnv]`. Changing `namespace` to `com.evyatar109.happy` regenerates `BuildConfig` under the new package and breaks the committed Kotlin sources at `android/app/src/main/java/com/slopus/happy/dev/Main*.kt` which reference `BuildConfig` from `com.slopus.happy.dev`. `applicationId` is the install identity; `namespace` is the BuildConfig/R class package — they're decoupled.
- **`google-services.json` is duplicated** at `packages/happy-app/google-services.json` AND `packages/happy-app/android/app/google-services.json`. Both must contain `com.evyatar109.happy` as a registered client — Gradle reads the second copy at build time, the first is the Expo source-of-truth that prebuild would copy from. Without prebuild, the second copy is stale-by-default and must be maintained manually.
- **CMake intermediate dir is redirected to `C:\cxb\<root>-<module>\`** via `android.externalNativeBuild.cmake.buildStagingDirectory`. Without this, native module build paths blow past Windows MAX_PATH (~260) and ninja stat() fails. Don't `subst` the workspace root as an alternative — it breaks Metro's pnpm workspace resolution.
- **R8 minification is currently OFF.** APK is ~103 MB. Re-enabling requires generating proguard keep rules from `app/build/outputs/mapping/release/missing_rules.txt` and pasting into `proguard-rules.pro`. Tracked in skill pitfall #10.
- **`pnpm prebuild` is stubbed to error out** — direct `npx expo prebuild` still works but wipes every customization in this list. Skill pitfall #1 has the full re-apply checklist.
- **Production builds without `keystore.properties` (or with `APP_ENV != production`) hard-fail** at Gradle config time. Both guards live in `android/app/build.gradle` and protect against shipping a debug-signed APK that tablets would reject as `INSTALL_FAILED_UPDATE_INCOMPATIBLE`.
- **`apply plugin: 'com.google.gms.google-services'` is scoped to `appEnv == 'production'`**. The personal Firebase project only registers `com.evyatar109.happy`, so dev/preview builds (`com.slopus.happy.dev` / `.preview`) would otherwise fail `processDebugGoogleServices` with "No matching client found". To re-enable for all variants, register the dev/preview ids in the personal Firebase project, re-download `google-services.json`, and remove the conditional.
- **`expo run:android` is broken** because Expo CLI's project-id parser can't read the dynamic `applicationId appPackage`. For first-time dev-client install on the tablet, bypass it with `cd packages/happy-app/android && ANDROID_HOME=D:/Android/Sdk APP_ENV=development ./gradlew installDebug -PreactNativeArchitectures=arm64-v8a`. Then `pnpm exec expo start --dev-client`. See `.agents/skills/happy-tablet-iterate/SKILL.md` for the rest of the loop. `pnpm release:android` calls Gradle directly and is unaffected.

See `.agents/skills/happy-app-playstore-release/SKILL.md` for the full prerequisite list (keystore at `D:\secrets\happy-app-release.keystore`, `keystore.properties`, Firebase setup, Android SDK at `D:\Android\Sdk` + `local.properties`, "tablets" tester group, App Tester installed on each BOOX), verification commands (`apksigner verify --print-certs`, `aapt dump badging`), and the full pitfalls list.

## Changelog Management

The app includes an in-app changelog feature that displays version history to users. When making changes:

### Adding Changelog Entries

1. **Always update the latest version** in `/CHANGELOG.md` when adding new features or fixes
2. **Format**: Each version follows this structure:
   ```markdown
   ## Version [NUMBER] - YYYY-MM-DD
   - Brief description of change/feature/fix
   - Another change description
   - Keep descriptions user-friendly and concise
   ```

3. **Version numbering**: Increment the version number for each release (1, 2, 3, etc.)
4. **Date format**: Use ISO date format (YYYY-MM-DD)

### Regenerating Changelog Data

After updating CHANGELOG.md, run:
```bash
npx tsx sources/scripts/parseChangelog.ts
```

This generates `sources/changelog/changelog.json` which is used by the app.

### Best Practices

- Write changelog entries from the user's perspective
- Start each entry with a verb (Added, Fixed, Improved, Updated, Removed)
- Group related changes together
- Keep descriptions concise but informative
- Focus on what changed, not technical implementation details
- After bumping CHANGELOG.md, regenerate `sources/changelog/changelog.json` manually with `npx tsx sources/scripts/parseChangelog.ts` and commit it. Upstream's `pnpm ota` script auto-parses it, but the fork doesn't run that script (see "Production / release (fork)" above).
- Always improve and expand basic changelog descriptions to be more user-friendly and informative
- Include a brief summary paragraph before bullet points for each version explaining the theme of the update

### Example Entry

```markdown
## Version 4 - 2025-01-26
- Added dark mode support across all screens
- Fixed navigation issues on tablet devices  
- Improved app startup performance by 30%
- Updated authentication flow for better security
- Removed deprecated API endpoints
```

## Architecture Overview

### Core Technology Stack
- **React Native** with **Expo** SDK 54
- **TypeScript** with strict mode enabled
- **Unistyles** for cross-platform styling with themes and breakpoints
- **Expo Router v6** for file-based routing
- **Socket.io** for real-time WebSocket communication
- **libsodium** (via `@more-tech/react-native-libsodium`) for end-to-end encryption
- **LiveKit** for real-time voice communication

### Project Structure
```
sources/
├── app/              # Expo Router screens
├── auth/             # Authentication logic (QR code based)
├── components/       # Reusable UI components
├── sync/             # Real-time sync engine with encryption
└── utils/            # Utility functions
```

### Key Architectural Patterns

1. **Authentication Flow**: QR code-based authentication using expo-camera with challenge-response mechanism
2. **Data Synchronization**: WebSocket-based real-time sync with automatic reconnection and state management
3. **Encryption**: End-to-end encryption using libsodium for all sensitive data
4. **State Management**: React Context for auth state, custom reducer for sync state
5. **Real-time Voice**: LiveKit integration for voice communication sessions
6. **Platform-Specific Code**: Separate implementations for web vs native when needed

### Development Guidelines

- Use **4 spaces** for indentation
- Use **pnpm** instead of npm for package management
- Path alias `@/*` maps to `./sources/*`
- TypeScript strict mode is enabled - ensure all code is properly typed
- Follow existing component patterns when creating new UI components
- Real-time sync operations are handled through SyncSocket and SyncSession classes
- Session metadata writes should go through `sources/sync/ops.ts` `sessionUpdateMetadata(...)`, which encrypts metadata client-side, emits the existing session socket event `update-metadata`, and retries version mismatches locally.
- Active-session model / permission / effort controls live in `sources/components/SessionContextDrawer.tsx`, mounted above the composer by `sources/-session/SessionView.tsx`. The drawer is confirmatory: picker taps call `sources/sync/ops.ts` `sessionEmitAgentConfiguration(...)`, and visible chips read the echoed `metadata.currentModelCode`, `currentPermissionModeCode`, and `currentThoughtLevelCode` values after `update-session` applies.
- Shared picker UI for model/path-style pickers lives in `sources/components/pickers/` (`PickerContent`, `PathPickerContent`, and `pickerStyles`). Reuse that module instead of copying picker definitions from the new-session screen.
- Chat sends should go through `sources/sync/sync.ts` `sendMessage(...)` with an explicit `switchMode` when the caller has policy intent. Default `switchMode: 'now'` and `'none'` must stay tag-less and must not fire `request-switch`; only Claude/local `switchMode: 'when-idle'` sends call `request-switch({ mode: 'when-idle' })` before enqueue and add `meta.capabilities.deferredSwitch` when the RPC returns `{ deferred: true }`.
- Keep the "Send when idle" gate in `sources/-session/SessionView.tsx`: compute Claude flavor, `getSessionMode(session) === 'local'`, `agentState.turnActive === true`, and no `agentState.pendingSwitch` there, then pass only a boolean to presentational composer components.
- Active session project/worktree ordering is stored per account in `sessionGroupOrder` as a flat list of `${machineId}::${path}` keys. `sources/components/ActiveSessionsGroupCompact.tsx` owns the web-only drag-handle UI and persists through that setting; keep native behavior free of drag affordances.
- App-local slash commands need four coordinated touchpoints: parse them in `sources/sync/slashCommandIntercept.ts`, handle the result in `sources/hooks/usePreSendCommand.ts`, surface them in `sources/sync/suggestionCommands.ts`, and cover both composers with `sources/-session/SessionView.intercept.test.ts` plus `sources/app/(app)/new/index.intercept.test.ts` (for example `/rename` intercepts only in live sessions, but must fall through before session creation).
- Sync reducer batches must replay oldest-to-newest by `createdAt`; `storage.applyMessages()` and `applyOlderMessages()` sort normalized batches before calling the reducer, and the reducer preserves pending tool results so older lazy-loaded tool calls can still attach newer results that arrived earlier.
- Two different "seq" fields exist on the wire and must NOT be conflated. **`session.seq`** is **session-local** (per-session message counter, server-side `allocateSessionSeq`) and is what `computeInitialAfterSeq` and `computeOlderPageAfterSeq` use for pagination math. **`updateData.seq`** on a socket update event is the **account-global** update counter — only valid for ordering events on the wire. Never write `updateData.seq` into `session.seq`; doing so corrupts pagination and produces empty chats on brand-new sessions until app restart re-fetches from `/v1/sessions`. The `update-session` and `new-message` handlers in `sources/sync/sync.ts` deliberately omit a `seq` field when calling `applySessions(...)` for this reason.
- `sources/sync/typesRaw.ts` imports session protocol schemas from `@slopus/happy-wire`; do not reintroduce local mirrors for `sessionEventSchema` or `sessionEnvelopeSchema`. App-only legacy agent events still live in the local `agentEventSchema`.
- Typed `context-boundary` events are authoritative in `sources/sync/reducer/reducer.ts`: they update `reducerState.latestBoundary` by session-local `seq` and drive clear/compact resets. The CLI dual-emits a legacy compatibility event after the typed envelope; legacy fallback events with `meta.contextBoundaryFallback === true` are dropped by flag alone, without correlating to a typed event or timestamp window.
- In-window typed `context-boundary` messages render only through `sources/components/MessageView.tsx` and `sources/components/BoundaryDivider.tsx`. `ChatList.tsx` should only add the out-of-window sticky divider when the boundary row is not loaded.
- `ChatList.tsx` must split active vs pre-boundary history by `reducerState.latestBoundary.seq`, not by a stored array index. Older-page loads prepend/append rows around the same session-local seq boundary.
- Composer UI that reacts to cross-device context changes should read `useLatestBoundary(sessionId)` and compare `latestBoundary.at` to local compose start time; it must warn without setting `AgentInput.blockSend`.
- `sources/sync/reducer/messageToEvent.ts` still preserves old-CLI plan-mode synthesis from `EnterPlanMode` tool calls, but suppress it when a typed `plan-mode-enter` boundary is already in the reducer batch or `reducerState.latestBoundary`.
- New-session lifecycle has a recv-side race: `new-session` socket events only invalidate `sessionsSync` (deferred), so `new-message` events for that session can arrive before encryption keys are loaded. The handler at `sources/sync/sync.ts:1864` queues such events in `pendingNewMessages` keyed by sid, awaits `sessionsSync.invalidateAndAwait()`, and replays them with `isReplay=true` to avoid loops. Do not change this to a fire-and-forget `fetchSessions()` again — it silently drops messages.
- Multi-machine mobile sync stores app-local session ids as `${machineId}:${localSessionId}`. Use `sources/sync/machineSessionId.ts` helpers to build/parse composite ids, and localize ids before calling a single machine's REST or Socket.IO API.
- Push registration must run once per paired machine. Use the full `TokenStorage.getCredentialsList()`/sync credentials list so every machine receives the current Expo token via its own tunnel.
- Store all temporary scripts and any test outside of unit tests in sources/trash folder
- When setting screen parameters ALWAYS set them in _layout.tsx if possible this avoids layout shifts
- **Never use Alert module from React Native, always use @sources/modal/index.ts instead**
- **Always apply layout width constraints** from `@/components/layout` to full-screen ScrollViews and content containers for responsive design across device sizes
- Always run `pnpm typecheck` after all changes to ensure type safety

### Permission Picker Init Order

Permission picker display state is resolved by `resolvePermissionModeForPicker(...)` in `sources/components/modelModeOptions.ts`; `sources/-session/SessionView.tsx` should call that helper instead of reading raw metadata fields directly. The order is: an explicit user pick when `session.permissionModeUserChosen === true`, then `metadata.currentPermissionModeCode`, then `metadata.dangerouslySkipPermissions` as a Claude-only legacy fallback, then `getDefaultPermissionModeKey(flavor)`.

`session.permissionModeUserChosen` distinguishes a user selection from a derived/default value. Keep it false for machine-derived changes such as EnterPlanMode, and true only for explicit picker/button choices. Layer 1 protocol details are documented in `.ralph/jobs/preserve-permission-mode-layer1/plan.md`.

### Slash Commands

- For app-local slash commands, use `sources/sync/slashCommandIntercept.ts` for parsing, `sources/hooks/usePreSendCommand.ts` for execution and error surfacing, and `sources/sync/suggestionCommands.ts` for picker discoverability.
- Use `/rename` as the worked example: it only intercepts in live sessions, runs its async metadata update through `useHappyAction(...)` inside `usePreSendCommand.ts`, and is listed in `suggestionCommands.ts` as an app-synthetic picker command.

### Internationalization (i18n) Guidelines

**CRITICAL: Always use the `t(...)` function for ALL user-visible strings**

#### Basic Usage
```typescript
import { t } from '@/text';

// ✅ Simple constants
t('common.cancel')              // "Cancel"
t('settings.title')             // "Settings"

// ✅ Functions with parameters
t('common.welcome', { name: 'Steve' })           // "Welcome, Steve!"
t('time.minutesAgo', { count: 5 })               // "5 minutes ago"
t('errors.fieldError', { field: 'Email', reason: 'Invalid format' })
```

#### Adding New Translations

1. **Check existing keys first** - Always check if the string already exists in the `common` object or other sections before adding new keys
2. **Think about context** - Consider the screen/component context when choosing the appropriate section (e.g., `settings.*`, `session.*`, `errors.*`)
3. **Add to ALL languages** - When adding new strings, you MUST add them to all language files in `sources/text/translations/` (currently: `en`, `ru`, `pl`, `es`, `ca`, `it`, `pt`, `ja`, `zh-Hans`, `zh-Hant`)
4. **Use descriptive key names** - Use clear, hierarchical keys like `newSession.machineOffline` rather than generic names
5. **Language metadata** - All supported languages and their metadata are centralized in `sources/text/_all.ts`

#### Translation Structure
```typescript
// String constants for static text
cancel: 'Cancel',

// Functions for dynamic text with typed parameters  
welcome: ({ name }: { name: string }) => `Welcome, ${name}!`,
itemCount: ({ count }: { count: number }) => 
    count === 1 ? '1 item' : `${count} items`,
```

#### Key Sections
- `common.*` - Universal strings used across the app (buttons, actions, status)
- `settings.*` - Settings screen specific strings
- `session.*` - Session management and display
- `errors.*` - Error messages and validation
- `modals.*` - Modal dialogs and popups
- `components.*` - Component-specific strings organized by component name

#### Language Configuration

The app uses a centralized language configuration system:

- **`sources/text/_all.ts`** - Centralized language metadata including:
  - `SupportedLanguage` type definition
  - `SUPPORTED_LANGUAGES` with native names and metadata
  - Helper functions: `getLanguageNativeName()`, `getLanguageEnglishName()`
  - Language constants: `SUPPORTED_LANGUAGE_CODES`, `DEFAULT_LANGUAGE`

- **Adding new languages:**
  1. Add the language code to the `SupportedLanguage` type in `_all.ts`
  2. Add language metadata to `SUPPORTED_LANGUAGES` object
  3. Create new translation file in `sources/text/translations/[code].ts`
  4. Add import and export in `sources/text/index.ts`

#### Important Rules
- **Never hardcode strings** in JSX - always use `t('key')`
- **Dev pages exception** - Development/debug pages can skip i18n
- **Check common first** - Before adding new keys, check if a suitable translation exists in `common`
- **Context matters** - Consider where the string appears to choose the right section
- **Update all languages** - New strings must be added to every language file
- **Use centralized language names** - Import language names from `_all.ts` instead of translation keys
- **Always re-read translations** - When new strings are added, always re-read the translation files to understand the existing structure and patterns before adding new keys
- **Update `_default.ts` too** - `sources/text/_default.ts` is the canonical translation shape used to derive `TranslationStructure`, so every new i18n key must be added there as well as in every file under `sources/text/translations/`
- **Keep the parity test current** - `sources/text/translations.test.ts` walks the English source shape against every locale file and checks feature-specific required keys; extend its required-key list when a story depends on specific i18n keys.
- **Keep `TranslationStructure` recursive** - If you add a nested translation object deeper than two levels (for example `chat.taskNotification.status.*`), keep the mapper in `sources/text/_default.ts` recursive so locale files can use non-English string literals without type errors.
- **Use translations for common strings** - Always use the translation function `t()` for any user-visible string that is translatable, especially common UI elements like buttons, labels, and messages
- **Use the i18n-translator agent** - When adding new translatable strings or verifying existing translations, use the i18n-translator agent to ensure consistency across all language files
- **Beware of technical terms** - When translating technical terms, consider:
  - Keep universally understood terms like "CLI", "API", "URL", "JSON" in their original form
  - Translate terms that have well-established equivalents in the target language
  - Use descriptive translations for complex technical concepts when direct translations don't exist
  - Maintain consistency across all technical terminology within the same language

#### i18n-Translator Agent

When working with translations, use the **i18n-translator** agent for:
- Adding new translatable strings to the application
- Verifying existing translations across all language files
- Ensuring translations are consistent and contextually appropriate
- Checking that all required languages have new strings
- Validating that translations fit the UI context (headers, buttons, multiline text)

The agent should be called whenever new user-facing text is introduced to the codebase or when translation verification is needed.

### User Message Styling (Chat View)

User messages render as **left-aligned, full-row light grey bands** (not right-aligned bubbles). See `sources/components/MessageView.tsx` (`userMessageContainer` + `userMessageBubble`) and the `userMessageBackground` token in `sources/theme.ts`.

E-ink visibility constraints to keep in mind:

- The light-theme `userMessageBackground` is `#d4d4d4`. We deliberately avoid `#f0f0f0` / `surfaceHigh` / `surfaceHighest` because BOOX-style e-ink panels quantize values that light all the way to pure white, making the band invisible on device.
- Do **not** put `paddingVertical` on `userMessageBubble`. `MarkdownView` already adds vertical paragraph margins; adding bubble padding produces a visible grey strip *above* the first line of text (the "phantom row" before the user message). Horizontal padding (`paddingHorizontal: 16`) is fine and matches the agent-message inset.
- `adb exec-out screencap -p` captures the **full-color framebuffer**, not what the e-ink controller renders after quantization. A screencap can show light grey shading (e.g., `#f0f0f0` code-block backgrounds) that is invisible on the actual e-ink display. Use this when iterating on contrast: if it's barely visible in the screencap, it's definitely invisible on e-ink.

### `<local-command-stdout>` Renders as a Code Block (Why "Goodbye!" looks inset)

Claude Code emits slash-command output wrapped in `<local-command-stdout>...</local-command-stdout>`. `processClaudeMetaTags` (`sources/components/markdown/processClaudeMetaTags.ts`) converts that to a fenced code block, which `MarkdownView` renders with `codeBlock` styling backed by `theme.colors.surfaceHighest` (`#f0f0f0`).

So output like `Goodbye!` from `/exit` shows as an inset rounded grey rectangle inside whatever message contains it — that's the code-block container, not a user-message bubble. On e-ink it quantizes to white and is effectively invisible; in screencaps it's visible. If the inset rectangle ever needs to disappear or blend with the user-message row, change the code-block background or special-case single-line stdout — don't try to "fix" it via `userMessageBackground`.

### Tappable Options on Color E-Ink

There are **two separate tappable-options surfaces** in the chat. Both started life styled with `surfaceHighest` / `surfaceHigh` fills and `divider` borders — those values quantize to pure white on color e-ink panels (BOOX-style), so the cards became invisible against the page background.

- `<options>` markdown blocks → `RenderOptionsBlock` in `sources/components/markdown/MarkdownView.tsx` (uses `style.optionItem` + `style.optionItemAccent`)
- `AskUserQuestion` tool prompts → `sources/components/tools/views/AskUserQuestionView.tsx` (uses `optionButton` + `optionButtonSelected` + `selectedAccent`)

**E-ink-safe option pattern** (currently applied to both):

- Card fill: `theme.colors.userMessageBackground` (`#d4d4d4` light / `#2C2C2E` dark) — proven visible on the BOOX panel.
- Border: `theme.colors.textSecondary`, `borderWidth: 2`. A 1px `divider` border is invisible after quantization; thicker, darker edges survive.
- Left accent: a 4px-wide bar in `theme.colors.text`, absolutely positioned with `position: 'absolute'; left: 0; top: 0; bottom: 0`. Requires `position: 'relative'; overflow: 'hidden'` on the parent so it clips to the rounded corners. Hard 1D edges render crisply on e-ink even when fills wash out, so the bar is the strongest "this is tappable" cue available.
- Pressed/opacity feedback is effectively invisible on e-ink — don't rely on it as the primary state cue.

If you add a third tappable-options surface, reuse the same three tokens (`userMessageBackground` + `textSecondary` 2px + `text` 4px accent) instead of `surfaceHigh*` / `divider`. When debugging contrast: `adb exec-out screencap -p` shows the full-color framebuffer, *not* what the e-ink controller renders after quantization — barely-visible in a screencap means definitely-invisible on device.

### Important Files

- `sources/sync/types.ts` - Core type definitions for the sync protocol
- `sources/sync/reducer.ts` - State management logic for sync operations
- `sources/auth/AuthContext.tsx` - Authentication state management
- `sources/app/_layout.tsx` - Root navigation structure
- `sources/components/markdown/processClaudeMetaTags.ts` - Claude Code metadata-tag preprocessor. Keep `<options>...</options>` byte-identical for downstream option rendering, and escape inner triple-backticks instead of switching to longer fence markers because `parseMarkdownBlock.ts` only recognizes triple-backtick fences. The `<task-notification>` parser only requires `<task-id>` + `<summary>` — every other inner tag (`<tool-use-id>`, `<task-type>`, `<output-file>`, `<status>`) is optional, and unknown inner tags (e.g. Monitor-tool `<event>`) are tolerated silently. New Claude Code emitter shapes are non-breaking by default; see `docs/plans/synthetic-xml-tags-future-coverage.md` for the variant survey.
- `sources/components/markdown/skillBody.ts` - detector for Claude Code's post-Skill-tool injection. After a `Skill` tool_use/tool_result, Claude Code posts a verbatim copy of the loaded `SKILL.md` prefixed with `Base directory for this skill: <abs-path>\n\n# <Heading>`. The wire role is `user`, but `typesRaw.ts`'s normalizer routes most non-string-content user messages through the **agent-text** path — verified empirically 2026-04-29 — so the suppression must live in BOTH `UserTextBlock` AND `AgentTextBlock` in `MessageView.tsx`. The agent-text guard is the one that actually fires; the user-text guard is a defensive backstop. Don't remove either. Keep the regex strict (anchor + double-newline + `# `) so user messages mentioning the prefix in passing don't get suppressed.
- `sources/components/markdown/skillBody.ts` and `sources/components/markdown/processClaudeMetaTags.ts` import their non-renderable policy from `@slopus/happy-wire` (`packages/happy-wire/src/nonRenderablePolicy.ts`). Keep the receiver-side strip even though happy-cli now drops v0 sender artifacts; it is defense in depth for old stored sessions and possible Claude SDK drift. The `MessageView.tsx:120` `isThinking` early return is the feature gate for optional extended-thinking rendering, not bloat; thinking blocks must stay on the wire and must not be added to the non-renderable registry.
- `sources/components/markdown/MarkdownView.tsx` - Preprocess markdown once with `processClaudeMetaTags(...)`, keep the single `useMemo`, and then split the structured result by surface: feed `renderMarkdown` plus `taskNotifications` into `parseMarkdown(...)`, and feed `copyMarkdown` into `storeTempText(...)`. Render/copy still stay in sync because they come from the same preprocessor pass, but they are allowed to diverge when sentinel-backed tags such as `<task-notification>` need clean copy text.

### Custom Header Component

The app includes a custom header component (`sources/components/Header.tsx`) that provides consistent header rendering across platforms and integrates with React Navigation.

#### Usage with React Navigation:
```tsx
import { NavigationHeader } from '@/components/Header';

// As default for all screens in Stack navigator:
<Stack
    screenOptions={{
        header: NavigationHeader,
        // Other default options...
    }}
>

// Or for individual screens:
<Stack.Screen
    name="settings"
    options={{
        header: NavigationHeader,
        headerTitle: 'Settings',
        headerSubtitle: 'Manage your preferences', // Custom extension
        headerTintColor: '#000',
        // All standard React Navigation header options are supported
    }}
/>
```

The custom header supports all standard React Navigation header options plus:
- `headerSubtitle`: Display a subtitle below the main title
- `headerSubtitleStyle`: Style object for the subtitle text

This ensures consistent header appearance and behavior across iOS, Android, and web platforms.

## Unistyles Styling Guide

### Creating Styles

Always use `StyleSheet.create` from 'react-native-unistyles':

```typescript
import { StyleSheet } from 'react-native-unistyles'

const styles = StyleSheet.create((theme, runtime) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
        paddingTop: runtime.insets.top,
        paddingHorizontal: theme.margins.md,
    },
    text: {
        color: theme.colors.typography,
        fontSize: 16,
    }
}))
```

### Using Styles in Components

For React Native components, provide styles directly:

```typescript
import React from 'react'
import { View, Text } from 'react-native'
import { StyleSheet } from 'react-native-unistyles'

const styles = StyleSheet.create((theme, runtime) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
        paddingTop: runtime.insets.top,
    },
    text: {
        color: theme.colors.typography,
        fontSize: 16,
    }
}))

const MyComponent = () => {
    return (
        <View style={styles.container}>
            <Text style={styles.text}>Hello World</Text>
        </View>
    )
}
```

For other components, use `useStyles` hook:

```typescript
import React from 'react'
import { CustomComponent } from '@/components/CustomComponent'
import { useStyles } from 'react-native-unistyles'

const MyComponent = () => {
    const { styles, theme } = useStyles(styles)
    
    return (
        <CustomComponent style={styles.container} />
    )
}
```

### Variants

Create dynamic styles with variants:

```typescript
const styles = StyleSheet.create(theme => ({
    button: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
        variants: {
            color: {
                primary: {
                    backgroundColor: theme.colors.primary,
                },
                secondary: {
                    backgroundColor: theme.colors.secondary,
                },
                default: {
                    backgroundColor: theme.colors.background,
                }
            },
            size: {
                small: {
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                },
                large: {
                    paddingHorizontal: 24,
                    paddingVertical: 12,
                }
            }
        }
    }
}))

// Usage
const { styles } = useStyles(styles, {
    button: {
        color: 'primary',
        size: 'large'
    }
})
```

### Media Queries

Use media queries for responsive design:

```typescript
import { StyleSheet, mq } from 'react-native-unistyles'

const styles = StyleSheet.create(theme => ({
    container: {
        padding: theme.margins.sm,
        backgroundColor: {
            [mq.only.width(0, 768)]: theme.colors.background,
            [mq.only.width(768)]: theme.colors.secondary,
        }
    }
}))
```

### Breakpoints

Access current breakpoint in components:

```typescript
const MyComponent = () => {
    const { breakpoint } = useStyles()
    
    const isTablet = breakpoint === 'md' || breakpoint === 'lg'
    
    return (
        <View>
            {isTablet ? <TabletLayout /> : <MobileLayout />}
        </View>
    )
}
```

### Special Component Considerations

#### Expo Image
- **Size properties** (`width`, `height`) must be set outside of Unistyles stylesheet as inline styles
- **`tintColor` property** must be set directly on the component, not in style prop
- All other styling goes through Unistyles

```typescript
import { Image } from 'expo-image'
import { StyleSheet, useStyles } from 'react-native-unistyles'

const styles = StyleSheet.create((theme) => ({
    image: {
        borderRadius: 8,
        backgroundColor: theme.colors.background, // Other styles use theme
    }
}))

const MyComponent = () => {
    const { theme } = useStyles()
    
    return (
        <Image 
            style={[{ width: 100, height: 100 }, styles.image]}  // Size as inline styles
            tintColor={theme.colors.primary}                     // tintColor goes on component
            source={{ uri: 'https://example.com/image.jpg' }}
        />
    )
}
```

### Best Practices

1. **Always use `StyleSheet.create`** from 'react-native-unistyles'
2. **Provide styles directly** to components from 'react-native' and 'react-native-reanimated' packages
3. **Use `useStyles` hook only** for other components (but try to avoid it when possible)
4. **Always use function mode** when you need theme or runtime access
5. **Use variants** for component state-based styling instead of conditional styles
6. **Leverage breakpoints** for responsive design rather than manual dimension calculations
7. **Keep styles close to components** but extract common patterns to shared stylesheets
8. **Use TypeScript** for better developer experience and type safety

## Project Scope and Priorities

- This project targets Android, iOS, and web platforms
- Web is considered a secondary platform
- Avoid web-specific implementations unless explicitly requested
- Keep dev pages without i18n, always use t(...) function to translate all strings, when adding new string add it to all languages, think about context before translating.
- Core principles: never show loading error, always just retry. Always sync main data in "sync" class. Always use invalidate sync for it. Always use Item component first and only then you should use anything else or custom ones for content. Do not ever do backward compatibility if not explicitly stated.
- Never use custom headers in navigation, almost never use Stack.Page options in individual pages. Only when you need to show something dynamic. Always show header on all screens.
- store app pages in @sources/app/(app)/
- use ItemList for most containers for UI, if it is not custom like chat one.
- Always use expo-router api, not react-navigation one.
- Always try to use "useHappyAction" from @sources/hooks/useHappyAction.ts if you need to run some async operation, do not handle errors, etc - it is handled automatically.
- Never use unistyles for expo-image, use classical one
- Always use "Avatar" for avatars
- No backward compatibliity ever
- When non-trivial hook is needed - create a dedicated one in hooks folder, add a comment explaining it's logic
- Local-only slash commands should be modeled in `sources/sync/slashCommandIntercept.ts` and executed through `sources/hooks/usePreSendCommand.ts` so both the live-session composer and the new-session composer intercept them before `sync.sendMessage()` or `machineSpawnNewSession()`.
- If a local-only slash command needs async side effects (for example `/rename` updating session metadata), keep `PreSendCommandResult.execute()` synchronous for the composer call sites and trigger the async body through `useHappyAction(...)` inside `usePreSendCommand.ts` so `HappyError` handling and modal surfacing stay consistent.
- App-only picker commands belong in `sources/sync/suggestionCommands.ts` with `source: 'app-synthetic'`; do not inject them through session metadata, which should stay reserved for SDK-emitted commands and classification inputs.
- Animated text consumers should import `AnimatedText` from `sources/components/StyledText.tsx`; do not create local `Animated.createAnimatedComponent(Text|RNText)` wrappers outside the documented dev spike artifact.
- `useChatScaleAnimatedTextStyle` expects raw, unscaled `fontSize`/`lineHeight` inputs from the local style definition; do not feed it `useChatScaledStyles(...)` output or persisted chat scale will be applied twice.
- `SimpleSyntaxHighlighter` treats `textStyle` as the chat-animation opt-in; its animated path should keep the base mono metrics local (`14/20`) and layer the animated font-size override last instead of deriving worklet inputs from a caller-provided scaled style.
- Always put styles in the very end of the component or page file
- Always wrap pages in memo
- For hotkeys use "useGlobalKeyboard", do not change it, it works only on Web
- Use "AsyncLock" class for exclusive async locks

## Socket-prefetch pagination invariants

Design context: see `docs/plans/streaming-pagination.md`. The `enableSocketRangeFetch` flag (local-only, in `LocalSettingsSchema`, default `true` on `main` since 2026-04-29) gates a socket-pushed older-page prefetch path that is a **drop-in replacement** for `sync.loadOlder()` — it does not evict any decrypted state. Users can flip the toggle off in Settings → Appearance ("Stream Older Messages") if they want the legacy HTTP `loadOlder()` behavior back.

(i) **Three-extent rule — never conflate them.** Three session-scoped extents are owned by disjoint code paths and must never be conflated:

- `sessionLastSeq` — live tail high-water. Only ever extended by live `new-message` arrivals through `applyMessages`. Never written by prefetch and never written by viewport ticks.
- `oldestLoadedSeq` (paired with `hasOlder`) — older edge of decrypted state. Only ever decreased by older-page commits — the legacy `applyOlderMessages` path or the new `applyPrefetchedRange` path (both sharing the pure `mergeOlderMessagesIntoSession` helper in `sources/sync/applyPrefetchedRange.ts`). Never written by live `new-message` and never written by viewport ticks. The post-commit value is the **smallest actually returned** confirmed seq from the response, not the requested `fromSeq` — defending against off-by-one bugs and sparse server responses.
- `renderWindow` — visible-viewport extent (`{firstSeq, lastSeq} | null`). Only ever rewritten by viewport ticks via `sync.reportRenderWindow(sessionId, visibleSeqs)`, and only ever reset to `null` by `sync.onActiveSessionChanged(sessionId)` on real session changes. **Not** by `sync.onSessionVisible`, which fires on `new-message` pings, control-return, and `realtimeStatus` changes — routing the reset there would clear viewport state during ordinary traffic (the F-046 regression). `renderWindow === null` is the initial / freshly-switched / never-yet-ticked state, and `shouldPrefetchOlder` short-circuits to `false` whenever `renderWindow === null` so a placeholder cannot trigger prefetch before any real `ViewToken` data exists.

(ii) **Pending-message exclusion (`seq === DEFAULT_UNSEQUENCED_MESSAGE_SEQ`).** Optimistic local messages — created at `sync.ts:520` (offline-edge sentinel) and `sync.ts:605` (locally-enqueued user messages) — carry `seq === Number.MAX_SAFE_INTEGER` (the `DEFAULT_UNSEQUENCED_MESSAGE_SEQ` constant from `sources/sync/typesRaw.ts`) until the server assigns a real session-local seq. Every input to `sources/sync/messageWindow.ts` filters these out before computing `minVisibleSeq` / `maxVisibleSeq` / `oldestLoadedSeq` and before evaluating `shouldPrefetchOlder` — mirroring `sources/components/ChatList.boundaryItems.ts:59`'s `isConfirmed` check. The contract is "pass the raw confirmed-and-pending list; the helper filters and folds" — helpers MUST NOT accept a pre-collapsed `{minVisibleSeq, maxVisibleSeq}` scalar pair, because once visible items have been collapsed to that pair a `maxVisibleSeq === Number.MAX_SAFE_INTEGER` has already lost the confirmed visible max and filtering at that stage is a no-op. `messageWindow.ts` references `DEFAULT_UNSEQUENCED_MESSAGE_SEQ` by name from `typesRaw.ts` rather than the literal `Number.MAX_SAFE_INTEGER`, keeping both call sites in lockstep. The same exclusion applies symmetrically inside `applyPrefetchedRange` when computing the post-commit `oldestLoadedSeq` from `normalizedMessages` — defending against a defective server response that smuggled an unsequenced message into a prefetch reply.

(iii) **This plan does NOT bound plaintext memory.** Heap remains unbounded — same as the existing `loadOlder()` path. Bounded plaintext memory / eviction is a **separate follow-up** tracked in the Open Questions section of `docs/plans/streaming-pagination.md`. Plaintext currently lives in `SessionMessages.messages`, `SessionMessages.messagesMap`, and `ReducerState.messages`/`sidechains`; bounding any one of them in isolation silently breaks `useMessage()`, `storage.isMutableToolCall`, or the reducer's duplicate-id guards at `reducer/reducer.ts:376/754/943`. Do NOT introduce ad-hoc plaintext eviction inside `applyPrefetchedRange`, `mergeOlderMessagesIntoSession`, `setRenderWindow`, or anywhere else on the prefetch path — eviction belongs in the deferred plaintext/render-state split, not here.

(iv) **Sort by `seq` DESC, not by `createdAt` DESC.** `mergeOlderMessagesIntoSession` (`sources/sync/applyPrefetchedRange.ts`) sorts the merged messages array by **`seq` descending with `createdAt` as tiebreaker**, not the other way around. `seq` is the canonical session-local order (per (i) above); `createdAt` can drift relative to it whenever a message is synthesized at a different time than its commit (plan-mode-exit synthesizes "Implement the following plan: …" with the plan's original createdAt but a fresh seq; `[Request interrupted by user for tool use]`; `--resume` rewriting prior history; clock skew on multi-host setups; `session-fork-resume`). Sorting by `createdAt` for any of those sessions splices paginated older-by-seq messages into the MIDDLE of the array instead of appending at the tail, shifting indices below the user's viewport, which `maintainVisibleContentPosition` compensates for as a visible scroll-offset shift (the snap-back diagnosed 2026-04-29 in `.ralph/jobs/.staging/20260430T030309Z-verify-446370/`). Pending optimistic messages still land at index 0 because their `seq === Number.MAX_SAFE_INTEGER` is the highest possible.

(v) **Reducer Phase 5 event-role dedup is load-bearing.** `sources/sync/reducer/reducer.ts` Phase 5 processes `role === 'event'` messages (typed context-boundary, etc.). Phase 0.5's context-boundary handler intentionally falls through to `messagesToProcess` WITHOUT setting `state.messageIds`, so the message reaches Phase 5. Phase 5 MUST `if (state.messageIds.has(msg.id)) continue;` AND `state.messageIds.set(msg.id, mid)` after `state.messages.set` — without both, the same wire event gets a fresh `mid` allocated on every reducer batch, accumulating duplicates in `state.messages` and the downstream `mergedMessagesMap` (357→1098 unbounded growth, diagnosed 2026-04-29). The reducer header at line 10–14 promises idempotent dedup by realID; Phase 5 had been violating it.

(vi) **Boundary item keys are stable across `latestBoundary` updates.** `ChatList.boundaryItems.ts` synthesizes `kind: 'sticky-boundary'` and `kind: 'show-pre-boundary-history'` rows with literal IDs `'boundary-sticky'` and `'boundary-show-history'` — NOT suffixed with `latestBoundary.id`. There is at most one row of each kind per list, so suffixing causes FlatList to see a key change on every boundary id flip, forcing unmount+remount + height re-measure + MVCP anchor miss. Diagnosed 2026-04-29.

(vii) **Boundary auto-expand on first arrival prevents eviction.** When `latestBoundary` transitions from `null` to a concrete value via older-page pagination AND the user has pre-boundary messages already loaded, `ChatList.tsx` auto-sets `preBoundaryExpanded = true`. The previous behavior — resetting `preBoundaryExpanded = false` on every `latestBoundaryKey` change — silently evicted messages with `seq < latestBoundary.seq` mid-scroll because the `activeItems` filter at `ChatList.boundaryItems.ts:74-76` hides them. The collapse reset is now keyed on `props.sessionId` (real session change), not on `latestBoundaryKey`. The `null → concrete` transition is the only safe trigger for auto-expand; a fresh-session cold open with metadata-seeded boundary should still default to collapsed.
