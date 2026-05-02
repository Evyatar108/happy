# Render extended thinking as an optional setting

## Worktree
Primary worktree at `D:/harness-efforts/happy` (the `main` branch of the `Evyatar108/happy` fork). All work is in `packages/happy-app`. No happy-cli, happy-server, or happy-wire changes — the wire already carries `content.type === 'thinking'` blocks; only the receiver needs to learn to render them.

## Background
Claude's extended thinking surfaces as `content.type === 'thinking'` content blocks on assistant messages. Happy's reducer ALREADY ingests them: `packages/happy-app/sources/sync/reducer/reducer.ts:768` and `:977` match `c.type === 'thinking'`, and `:777` / `:990` wrap the body as italic markdown (`*${c.thinking}*`) and set `isThinking: true` on the resulting `ReducerMessage`. The renderer then explicitly drops the message at `packages/happy-app/sources/components/MessageView.tsx:120-122`:

```tsx
// Hide thinking messages
if (props.message.isThinking) {
    return null;
}
```

This is a feature gate, not a "we don't want this" declaration — the wire is correctly preserving the data, but the renderer hard-suppresses it. The maintainer wants an opt-in setting that flips the gate on and renders thinking blocks when extended thinking is available.

## Goal
A user-facing local setting (off by default) that, when on, makes the renderer surface assistant thinking blocks in the chat with a clear visual distinction from regular agent prose. Off-by-default keeps existing users unaffected. The wire format does not change.

## Cross-links
- This plan and the `storage-bloat-reduction` brainstorm at `.ralph/brainstorms/storage-bloat-reduction/selected-direction.md` BOTH touch `MessageView.tsx` near the `isThinking` early-return. The brainstorm explicitly carved thinking blocks OUT of the sender-side filter scope so this plan stays viable. Whichever lands first must not foreclose the other:
  - If storage-bloat ships first, the new sender-side registry must NOT include a thinking-block predicate. The brainstorm's `selected-direction.md` calls this out in "Common mistakes / confusion points for future agents."
  - If this plan ships first, the storage-bloat work must keep the conditional drop intact and not rewrite `MessageView.tsx:120-122` back to a hard return.

## Scope

### In scope
1. **Add `showExtendedThinking: boolean` to `LocalSettingsSchema`** in `packages/happy-app/sources/sync/localSettings.ts`, default `false`. Follow the existing convention of boolean toggles like `enableSocketRangeFetch` (line 16) and `pinchToZoomEnabled` (line 14).
2. **Add a toggle in Settings → Appearance** at `packages/happy-app/sources/app/(app)/settings/appearance.tsx`. Use the same `Item` + switch pattern as the "Stream Older Messages" toggle (the precedent at the top of the existing file). Label: "Show Extended Thinking" with a one-line description like "Show Claude's thinking blocks when available."
3. **Replace the unconditional drop in `MessageView.tsx:120-122`** with a conditional gated on the setting. When the setting is on, render the thinking block with a distinct visual treatment (see "Rendering treatment" below). When off, keep the current early-return behavior.
4. **i18n**: add the toggle label and description to every locale file under `packages/happy-app/sources/text/translations/` AND to the canonical shape in `packages/happy-app/sources/text/_default.ts`. Use `settings.appearance.showExtendedThinking.title` and `settings.appearance.showExtendedThinking.description`. Update the parity test at `packages/happy-app/sources/text/translations.test.ts` if it has a feature-specific required-key list.
5. **Test** the setting toggle and the conditional render. Mirror the pattern used by `packages/happy-app/sources/app/(app)/settings/appearance.socketRangeFetch.test.tsx` for the toggle test, and add a `MessageView`-level test that asserts thinking messages render when the setting is on and stay hidden when it is off.

### Out of scope
- **Wire-format changes.** The reducer's wrap-as-italic-text pattern (`reducer.ts:777`/`:990`) stays. Re-engineering the data model so thinking lives in a separate field on the message (rather than as `text: '*${c.thinking}*'` + `isThinking: true`) is a larger refactor and not necessary for v0.
- **Per-session thinking toggle.** The setting is account-wide / device-local, not per-session. If a future user wants per-session, that's a follow-up.
- **Streaming render of in-progress thinking.** This plan covers thinking blocks that have already landed on the wire as completed assistant messages. Live-streaming render of the thinking-as-it-arrives is a separate problem (interacts with `agentState` / partial-content handling) and out of scope here.
- **Surfacing thinking inside sidechain (sub-agent) tool cards.** The same `c.type === 'thinking'` branch exists at `reducer.ts:977-991` for sidechain content, but sidechains render inside tool-call cards, not in the main stream. Decide separately whether sidechain thinking should also be surfaced; default for v0 is no.
- **Server-side or sender-side filtering of thinking blocks.** Explicitly excluded — see Cross-links above.
- **Older sessions with no recorded thinking.** Sessions captured before extended thinking was emitted will simply have no thinking blocks to render. No migration needed.

## Rendering treatment
The reducer currently writes `text: \`*${c.thinking}*\`` (italic markdown) plus `isThinking: true` on the message. Two implementation options:

**Option A (lowest effort, v0):** drop the early-return and let the existing italic markdown render in the same agent-message container as regular agent prose. Pros: minimal code change, naturally readable. Cons: thinking and final answer look nearly identical except for italics — easy to confuse.

**Option B (recommended for ship):** wrap the thinking message in a distinct container with a clear visual marker. Looking at the existing patterns in `packages/happy-app/sources/components/MessageView.tsx`, the cleanest path is to introduce a small `ThinkingBlock` component sibling to `AgentTextBlock` that renders inside the same `agentMessageContainer` but adds:
- a "Thinking" header label (small, secondary text)
- a left-edge accent bar (4px wide, `theme.colors.textSecondary`) — this matches the existing e-ink-safe option pattern documented in `packages/happy-app/CLAUDE.md` "Tappable Options on Color E-Ink"
- italic body text (the existing wrap is already italic — the markdown renderer handles it)
- collapsible-by-default would be nice but is not required for v0

Recommend Option B. Option A is acceptable as a v0 if Option B turns out to be more work than expected.

### E-ink considerations (for the BOOX tablets)
The maintainer's primary devices are color e-ink panels that quantize light values toward white. Per `packages/happy-app/CLAUDE.md` "User Message Styling (Chat View)" and "Tappable Options on Color E-Ink":
- DO NOT use `theme.colors.surfaceHigh` / `surfaceHighest` / `divider` for the thinking-block fill or border — they vanish on e-ink.
- DO use a 2px `theme.colors.textSecondary` border or the 4px `theme.colors.text` left accent bar pattern. Hard 1D edges survive quantization; subtle background tints do not.
- A "Thinking" text label above the body is the most reliable visual cue across both LCD and e-ink — do not rely on color or italic styling alone.

## Files to change

Schema and defaults:
- `packages/happy-app/sources/sync/localSettings.ts` — add `showExtendedThinking: z.boolean()` to the schema (line 7-26 area), add `showExtendedThinking: false` to `localSettingsDefaults` (line 41-57 area).

Settings UI:
- `packages/happy-app/sources/app/(app)/settings/appearance.tsx` — add the toggle row using the existing `Item` + switch pattern. Read precedent from the `enableSocketRangeFetch` toggle in the same file.

Renderer:
- `packages/happy-app/sources/components/MessageView.tsx:120-122` — replace the unconditional `isThinking` drop with a conditional gated on `showExtendedThinking`. If implementing Option B, also add a `ThinkingBlock` component nearby and route `AgentTextBlock` through it when `props.message.isThinking` is set.

Translations (every locale + canonical shape + parity test):
- `packages/happy-app/sources/text/_default.ts` — add the canonical key shape.
- `packages/happy-app/sources/text/translations/*.ts` — add translations to all locale files: `en`, `ru`, `pl`, `es`, `ca`, `it`, `pt`, `ja`, `zh-Hans`, `zh-Hant`. Use the i18n-translator agent (per the project's i18n rules in `packages/happy-app/CLAUDE.md`).
- `packages/happy-app/sources/text/translations.test.ts` — extend the required-key list if the test gates on feature-specific keys.

Tests:
- New: `packages/happy-app/sources/app/(app)/settings/appearance.showExtendedThinking.test.tsx` — mirror `appearance.socketRangeFetch.test.tsx` for the toggle behavior.
- New or extended: a `MessageView` unit test that constructs a `ReducerMessage` with `isThinking: true` and asserts (i) it renders nothing when the setting is off, (ii) it renders the thinking block when the setting is on.

## Files to read for reference

Reducer's existing thinking-content handling (do NOT change unless necessary):
- `packages/happy-app/sources/sync/reducer/reducer.ts:766-779` — main message branch
- `packages/happy-app/sources/sync/reducer/reducer.ts:975-993` — sidechain branch
- `packages/happy-app/sources/sync/reducer/reducer.ts:1308-1315` — `ReducerMessage` → render shape (carries `isThinking` through to the renderer)
- `packages/happy-app/sources/sync/typesMessage.ts:52` — `Message.isThinking` field declaration

Settings precedents:
- `packages/happy-app/sources/sync/localSettings.ts:16` — `enableSocketRangeFetch` (most recent boolean toggle)
- `packages/happy-app/sources/app/(app)/settings/appearance.tsx` — settings screen with the toggle wiring
- `packages/happy-app/sources/app/(app)/settings/appearance.socketRangeFetch.test.tsx` — toggle test pattern

Render-time precedents:
- `packages/happy-app/sources/components/MessageView.tsx:115-136` — `AgentTextBlock` and the existing early-return for `isThinking` and `isSkillBodyMessage`
- `packages/happy-app/sources/components/markdown/MarkdownView.tsx` — markdown rendering pipeline if Option B needs custom containers

Cross-link with storage-bloat-reduction work:
- `D:/harness-efforts/happy/.ralph/brainstorms/storage-bloat-reduction/selected-direction.md` — the brainstorm that explicitly carved thinking out of scope to keep this plan viable

## Documentation updates
- `packages/happy-app/CLAUDE.md` — under "Important Files" or a new short section, note the `showExtendedThinking` setting and the deliberate choice to ship it as opt-in. Reference the conditional in `MessageView.tsx`. Reinforce that the wire MUST keep delivering thinking blocks unconditionally — no sender-side filter.
- `CHANGELOG.md` — add a user-facing entry describing the new "Show Extended Thinking" setting under the next version. Then re-run `npx tsx sources/scripts/parseChangelog.ts` per the changelog rules in `packages/happy-app/CLAUDE.md`.

## Common mistakes / confusion points for future agents
- **Do NOT remove the receiver-side wire-format support for thinking.** The reducer must keep matching `c.type === 'thinking'` and producing `ReducerMessage { isThinking: true, text: '*${c.thinking}*' }`. The setting flips the RENDER, not the ingestion.
- **Do NOT add thinking to any sender-side drop registry.** If `selected-direction.md` from the storage-bloat-reduction brainstorm has been implemented, its registry must not contain a `thinking` entry — that would silently break this plan and require a wire-format change to recover. The brainstorm file calls this out, but it's worth re-checking before merging either piece of work.
- **The reducer wraps thinking as italic text (`*${c.thinking}*`).** If Option B is implemented and you want to render thinking in a distinct container without the asterisks, do NOT strip them at render time with a regex — change the wrap in `reducer.ts:777` and `:990` to write the raw `c.thinking` and let `ThinkingBlock` style it. Stripping at render is ambiguous when a real assistant message starts with an asterisk.
- **`isThinking` is set on the `ReducerMessage` AND propagated to the rendered `Message` shape via `reducer.ts:1312`.** Both must remain truthful — do not flip the flag at render time.
- **Sidechain thinking exists** at `reducer.ts:977-991` but is rendered inside tool-call cards. The setting only governs main-stream rendering for v0; sidechain thinking stays whatever it currently is.
- **Default `false`.** Existing users must see no change after this lands. Devil's Advocate from the brainstorm flagged "future-proofing the wire by keeping thinking around" as load-bearing — the off-by-default ensures the wire-preservation doesn't translate into a UX regression for users who haven't asked for thinking.
- **Pre-existing sessions** with thinking blocks already in storage will start rendering them as soon as the user toggles the setting on. This is the desired behavior, not a bug — but worth noting if the setting tour or release notes need to mention it.
- **Translations parity.** The CLAUDE.md i18n rules require every new key be added to ALL locale files AND the `_default.ts` canonical shape. Skipping any locale will fail `translations.test.ts`. Use the i18n-translator agent.
- **E-ink visibility.** See "E-ink considerations" above. The maintainer's primary devices quantize light fills toward white; rendering thinking in a subtle grey will be invisible on the BOOX. Use a clear text label and a hard-edge accent bar.
