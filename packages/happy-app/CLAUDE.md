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

### Production
- `pnpm ota` - Deploy over-the-air updates via EAS Update to production branch

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
- The changelog is automatically parsed during `pnpm ota` and `pnpm ota:production`
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
- App-local slash commands need four coordinated touchpoints: parse them in `sources/sync/slashCommandIntercept.ts`, handle the result in `sources/hooks/usePreSendCommand.ts`, surface them in `sources/sync/suggestionCommands.ts`, and cover both composers with `sources/-session/SessionView.intercept.test.ts` plus `sources/app/(app)/new/index.intercept.test.ts` (for example `/rename` intercepts only in live sessions, but must fall through before session creation).
- Sync reducer batches must replay oldest-to-newest by `createdAt`; `storage.applyMessages()` and `applyOlderMessages()` sort normalized batches before calling the reducer, and the reducer preserves pending tool results so older lazy-loaded tool calls can still attach newer results that arrived earlier.
- Two different "seq" fields exist on the wire and must NOT be conflated. **`session.seq`** is **session-local** (per-session message counter, server-side `allocateSessionSeq`) and is what `computeInitialAfterSeq` and `computeOlderPageAfterSeq` use for pagination math. **`updateData.seq`** on a socket update event is the **account-global** update counter — only valid for ordering events on the wire. Never write `updateData.seq` into `session.seq`; doing so corrupts pagination and produces empty chats on brand-new sessions until app restart re-fetches from `/v1/sessions`. The `update-session` and `new-message` handlers in `sources/sync/sync.ts` deliberately omit a `seq` field when calling `applySessions(...)` for this reason.
- `sources/sync/typesRaw.ts` imports session protocol schemas from `@slopus/happy-wire`; do not reintroduce local mirrors for `sessionEventSchema` or `sessionEnvelopeSchema`. App-only legacy agent events still live in the local `agentEventSchema`.
- Typed `context-boundary` events are authoritative in `sources/sync/reducer/reducer.ts`: they update `reducerState.latestBoundary` by session-local `seq` and drive clear/compact resets. Legacy fallback events with `meta.contextBoundaryFallback === true` are dropped by flag alone, without correlating to a typed event or timestamp window.
- In-window typed `context-boundary` messages render only through `sources/components/MessageView.tsx` and `sources/components/BoundaryDivider.tsx`. `ChatList.tsx` should only add the out-of-window sticky divider when the boundary row is not loaded.
- New-session lifecycle has a recv-side race: `new-session` socket events only invalidate `sessionsSync` (deferred), so `new-message` events for that session can arrive before encryption keys are loaded. The handler at `sources/sync/sync.ts:1864` queues such events in `pendingNewMessages` keyed by sid, awaits `sessionsSync.invalidateAndAwait()`, and replays them with `isReplay=true` to avoid loops. Do not change this to a fire-and-forget `fetchSessions()` again — it silently drops messages.
- Store all temporary scripts and any test outside of unit tests in sources/trash folder
- When setting screen parameters ALWAYS set them in _layout.tsx if possible this avoids layout shifts
- **Never use Alert module from React Native, always use @sources/modal/index.ts instead**
- **Always apply layout width constraints** from `@/components/layout` to full-screen ScrollViews and content containers for responsive design across device sizes
- Always run `pnpm typecheck` after all changes to ensure type safety

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
- `sources/components/markdown/processClaudeMetaTags.ts` - Claude Code metadata-tag preprocessor. Keep `<options>...</options>` byte-identical for downstream option rendering, and escape inner triple-backticks instead of switching to longer fence markers because `parseMarkdownBlock.ts` only recognizes triple-backtick fences.
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
