# P1 Bug Investigations

Working notes from investigating P1 bugs in `docs/experimental/roadmap.md`. Each section is a static code-only investigation; none of them have been validated against a live app run yet.

## Plan approval — buttons missing

**Symptom:** Claude proposes a plan via `ExitPlanMode` tool but the user sees no approve/deny buttons in the mobile app.

**Repro from roadmap:**
- worktree: `~/projects/happy/happy/.dev/worktree/wise-river`
- Happy session id: `cmmbujpkq03iey7lcxyd9fqaw`

**Code paths verified (look correct):**

1. **CLI** (`packages/happy-cli/src/claude/utils/permissionHandler.ts`):
   - `handleToolCall()` line 168-173 — ExitPlanMode falls through to `handlePermissionRequest()` always (never auto-approved, even in `bypassPermissions`).
   - `handlePermissionRequest()` line 249-259 — calls `updateAgentState` to add the request to `agentState.requests[id]` keyed by SDK toolUseID.
   - `handlePermissionResponse()` line 100-120 — handles the approve/deny when the response comes back.

2. **Mobile reducer** (`packages/happy-app/sources/sync/reducer/reducer.ts`):
   - Phase 0 line 478-545 — iterates `agentState.requests`, looks up existing tool message via `state.toolIdToMessageId.get(permId)`, attaches `tool.permission = { id, status: 'pending' }`. If no tool message yet, creates one with the permission.
   - Phase 4 line 803-826 — when the actual tool-call arrives later from the JSONL stream, finds the existing message via `toolIdToMessageId` and merges details (input, description, startedAt). Permission is preserved.

3. **Mobile UI** (`packages/happy-app/sources/components/tools/`):
   - `ToolView.tsx:281` — renders `<PermissionFooter>` when `tool.permission && sessionId && tool.name !== 'AskUserQuestion'`.
   - `PermissionFooter.tsx:411` — for `ExitPlanMode`, renders the standard Yes/No plus "Allow All Edits" and "Allow Everything" (bypassPermissions) buttons.

**Hypotheses (need live data to disambiguate):**

- **H1 — toolUseID mismatch.** SDK's `toolUseID` from `canUseTool` doesn't match the tool's `id` field in the message stream. Result: Phase 0 creates a phantom tool message at one ID; Phase 4 creates a *different* tool message at the actual ID. The actual UI renders Phase 4's message which has no permission.
- **H2 — Permission moved to `completedRequests` too eagerly.** CLI removes from `requests` and adds to `completedRequests` before user has a chance to respond. Reducer Phase 0 line 480-482 skips entries that are also in `completedRequests`, so the pending state is never visible.
- **H3 — Tool state is `'completed'` before approval.** If Phase 4 sets `state: 'running'` and `startedAt = msg.createdAt` BEFORE the permission arrives in agentState (race), the UI may still render but permission lookup fails for some reason.
- **H4 — Plan-mode-enter boundary at line 357 of reducer.ts hides the surrounding tool call.** `boundaryItems.ts` filtering may exclude the ExitPlanMode tool message from the active window. Worth checking how `latestBoundary` interacts with the tool's seq.
- **H5 — Mode-mapping issue.** `permissionMode` was changed via `mapToClaudeMode()` in a way that causes the SDK to skip the `canUseTool` callback for ExitPlanMode entirely (not invoking the permission flow at all). E.g. if mode is somehow `'bypassPermissions'`, the SDK might skip ExitPlanMode despite the comment at permissionHandler.ts:170 saying "always require approval" — verify the SDK actually invokes canUseTool for ExitPlanMode in bypass mode.

**Diagnostic steps for next session:**

1. Open session `cmmbujpkq03iey7lcxyd9fqaw` in mobile app. Note exactly what renders for the ExitPlanMode tool call: tool name, state ("running"/"completed"/"error"), any buttons (greyed or absent), surrounding boundary divider.
2. Read `~/.claude/projects/<path>/cmmbujpkq03iey7lcxyd9fqaw.jsonl` for the `tool_use` block of `ExitPlanMode`. Capture the `id` field.
3. Check the CLI's daemon log around the time the plan was proposed. Look for `Permission request sent for tool call <id>: ExitPlanMode`. Compare the `<id>` against step 2's id.
4. If they match (no toolUseID mismatch), check the agent state at the time the user opened the session: was the request still in `requests` or already in `completedRequests`?
5. If H4 suspected: check whether `latestBoundary.seq` for `plan-mode-enter` is greater than the ExitPlanMode tool's seq, which would hide it.

**Code locations to revisit when fixing:**

- `packages/happy-cli/src/claude/utils/permissionHandler.ts:139-198` — `handleToolCall` and the gate logic
- `packages/happy-cli/src/claude/utils/permissionHandler.ts:200-263` — `handlePermissionRequest` and agentState update
- `packages/happy-app/sources/sync/reducer/reducer.ts:478-545` — Phase 0 permission attachment
- `packages/happy-app/sources/sync/reducer/reducer.ts:799-885` — Phase 4 tool-call processing and merge
- `packages/happy-app/sources/components/tools/ToolView.tsx:281` — PermissionFooter render gate
- `packages/happy-app/sources/components/tools/PermissionFooter.tsx:411-472` — ExitPlanMode-specific buttons

## Black stripe artifact in file-edit rendering — FIXED

**Symptom:** A black stripe appears at the left edge of the "Show N more lines / Collapse" toggle button on file-edit tool calls (Edit, MultiEdit) longer than 10 lines.

**Root cause:** `CollapsibleDiffPreview.tsx` had a 4px-wide accent bar (`toggleAccent`) using `theme.colors.text` (black in light mode, white in dark) borrowed from the e-ink-friendly tappable-options pattern documented in `packages/happy-app/CLAUDE.md`. That pattern is meant for `<options>`/AskUserQuestion choice cards where tappability is ambiguous — it's overkill for a single show/hide toggle that already has an obvious 2px border + filled background.

**Fix:** Removed `toggleAccent` view and its style. Toggle now relies on the existing border + background fill, which is sufficient on standard displays. Added an inline comment explaining why the e-ink pattern was deliberately not reused here, in case a future reader is tempted to re-add it.

**Files changed:** `packages/happy-app/sources/components/diff/CollapsibleDiffPreview.tsx`

Verified: `pnpm --filter happy-app typecheck` clean, 7 existing CollapsibleDiffPreview tests pass.

**Note:** This is a P3 fix from `docs/experimental/roadmap.md`, not P1. Tackled because it was code-only investigatable. The remaining P3 file-edit rendering items ("multi-file rendering", "duplicated plan presentation") still need live investigation.

## Path resolution on Windows — FIXED

**Symptom:** Tool views (Edit, MultiEdit, Write, etc.) show full absolute Windows paths like `C:\Users\alice\project\src\file.ts` instead of the relative `src\file.ts` shortened display.

**Root cause:** `resolvePath()` in `packages/happy-app/sources/utils/pathUtils.ts` only checked `remainder.startsWith('/')` for the path separator after the metadata-path prefix. Windows paths use `\` as the separator, so `remainder = "\src\file.ts"` failed the check and the function returned the full absolute path unchanged.

**Fix:** Recognize both `/` and `\\` as valid post-prefix separators. Function now correctly shortens Windows paths to their project-relative form.

**Files changed:**
- `packages/happy-app/sources/utils/pathUtils.ts` — `resolvePath` recognizes both separators
- `packages/happy-app/sources/utils/pathUtils.spec.ts` — added 3 Windows path tests

Verified: 37 tests pass (3 new + 34 existing).

## Task management tools rendering — FIXED

**Symptom:** `TaskOutput`, `TaskStop`, `TaskList`, `TaskGet`, `TaskUpdate` tool calls render with raw JSON input/output instead of a clean tool UI.

**Root cause:** None of these tools were registered in `packages/happy-app/sources/components/tools/knownTools.tsx`. Without an entry there, `ToolView.tsx` falls through to the generic JSON dump fallback at line 258-275.

**Fix:** Registered all five tools in `knownTools` with title (from i18n), `ICON_TASK` icon, `minimal: true`, and a permissive input schema (`task_id`, etc.). Added `tools.names.taskOutput / taskStop / taskList / taskGet / taskUpdate` to `_default.ts` + all 10 locale files. The standard `ToolView` shell now renders title + collapsible input/output for these tools.

**Files changed:**
- `packages/happy-app/sources/components/tools/knownTools.tsx` — added 5 tool entries
- `packages/happy-app/sources/text/_default.ts` — added 5 i18n keys
- `packages/happy-app/sources/text/translations/{en,ca,es,it,ja,pl,pt,ru,zh-Hans,zh-Hant}.ts` — translated keys

Verified: `pnpm --filter happy-app typecheck` clean; i18n parity test passes.

## Investigated this round

The following P1 bugs from `docs/experimental/roadmap.md` were investigated and addressed in this PR:

- **"Yes, don't ask again" / session-scoped approval not persisting — FIXED.** The Claude `approve_for_session` allowlist was hoisted out of `permissionHandler.ts` instance state into a session-scope module (`packages/happy-cli/src/claude/utils/sessionAllowlist.ts`) so it survives `claudeRemoteLauncher.ts` resets, with rehydration from `agentState` on session resume. (US-001)
- **Codex sandbox blocking work outside `yolo` mode — VERIFIED CLEAN.** Investigation-first matrix run found no policy bug in the local code path; all four Codex modes map correctly with and without Happy-managed sandbox. No targeted fix justified. See the 2026-05-10 entry in `docs/fork-notes.md` (`## Codex sandbox verification notes`). (US-002)
- **Codex session stopping unreliable — VERIFIED CLEAN + HARDENED.** Local Codex-side investigation found existing abort coverage adequate; no Codex production policy was changed. Daemon-side hardening added: `stopTrackedSession.ts` now does SIGTERM-then-SIGKILL escalation and returns `stopped: false` when the child survives SIGKILL. See the 2026-05-10 entry in `docs/fork-notes.md`. (US-003)
- **Codex sessions stuck in "thinking" indefinitely — FIXED.** Root cause was the post-normalization envelope read in `sync.ts` accessing `rawContent.content.data.ev.t` against the wrong shape; aligned to the normalized envelope from `typesRaw.ts`. (US-005)
- **Permission state duplication / wrong buttons for ExitPlanMode — FIXED.** The Phase 0 ↔ Phase 4 reducer correlation between the pending `agentState` permission entry and the `ExitPlanMode` tool envelope is fixed via the new `isExitPlanModeTool` correlation in `packages/happy-app/sources/sync/reducer/reducer.ts` (correlate by tool name + input when `toolUseID` doesn't match). (US-004 / Bug 2)

## Other P1 bugs — not yet investigated

The following P1 bugs from `docs/experimental/roadmap.md` have not been investigated yet:

- Multi-file edit / regular edit rendering
- Permission decision persistence (approved / denied / approved_for_session / abort)

Each should be tackled in its own focused session with a captured repro before fixing. Prefer code-only investigations (rendering bugs) when no live app access is available.
