# P1 Bug Investigations

Working notes from investigating P1 bugs in `docs/experimental/roadmap.md`. Each section is a static code-only investigation; none of them have been validated against a live app run yet.

## Plan approval — buttons missing

**Symptom:** Claude proposes a plan via `ExitPlanMode` tool but the user sees no approve/deny buttons in the mobile app.

**Repro from roadmap:**
- worktree: `~/projects/happy/happy/.dev/worktree/wise-river`
- Happy session id: `cmmbujpkq03iey7lcxyd9fqaw`

### Resolved

H1 (toolUseID mismatch) was the actual root cause and is fixed in this PR. The Claude SDK's `toolUseID` passed to `canUseTool` does not always match the `id` field on the `ExitPlanMode` / `exit_plan_mode` tool envelope in the JSONL stream, so Phase 0 of the reducer attached the pending permission to one synthetic tool message while Phase 4 created a second tool message at the real id with no permission attached. The PermissionFooter render gate in `ToolView.tsx` then had nothing to render against.

The fix is reducer-only and lives in `packages/happy-app/sources/sync/reducer/reducer.ts`: a new `isExitPlanModeTool` helper plus `findMatchingExitPlanToolMessageId` correlator now match plan-exit permissions to the existing tool message by tool name (`ExitPlanMode` / `exit_plan_mode`) and input shape, and map both ids (the permission request id and the tool envelope id) to the same reducer message id via `toolIdToMessageId`. A new note in `packages/happy-app/CLAUDE.md` ("ExitPlanMode permission UI is reducer-owned…") records the boundary so future fixes don't drift back into `ExitPlanToolView.tsx`, `knownTools.tsx`, or `PermissionFooter.tsx`.

The pre-fix code paths and hypotheses below are preserved as a historical investigation snapshot. Line numbers point at pre-fix code on `main` and no longer match the current files.

### Historical investigation snapshot (pre-fix)

**Code paths verified (look correct):**

1. **CLI** (`packages/happy-cli/src/claude/utils/permissionHandler.ts`, pre-fix):
   - `handleToolCall()` — ExitPlanMode falls through to `handlePermissionRequest()` always (never auto-approved, even in `bypassPermissions`).
   - `handlePermissionRequest()` — calls `updateAgentState` to add the request to `agentState.requests[id]` keyed by SDK toolUseID.
   - `handlePermissionResponse()` — handles the approve/deny when the response comes back.

2. **Mobile reducer** (`packages/happy-app/sources/sync/reducer/reducer.ts`, pre-fix):
   - Phase 0 — iterates `agentState.requests`, looks up existing tool message via `state.toolIdToMessageId.get(permId)`, attaches `tool.permission = { id, status: 'pending' }`. If no tool message yet, creates one with the permission.
   - Phase 4 — when the actual tool-call arrives later from the JSONL stream, finds the existing message via `toolIdToMessageId` and merges details (input, description, startedAt). Permission is preserved.

3. **Mobile UI** (`packages/happy-app/sources/components/tools/`):
   - `ToolView.tsx` — renders `<PermissionFooter>` when `tool.permission && sessionId && tool.name !== 'AskUserQuestion'`.
   - `PermissionFooter.tsx` — for `ExitPlanMode`, renders the standard Yes/No plus "Allow All Edits" and "Allow Everything" (bypassPermissions) buttons.

**Hypotheses considered:**

- **H1 — toolUseID mismatch.** SDK's `toolUseID` from `canUseTool` doesn't match the tool's `id` field in the message stream. Result: Phase 0 creates a phantom tool message at one ID; Phase 4 creates a *different* tool message at the actual ID. The actual UI renders Phase 4's message which has no permission. **Confirmed root cause; addressed by the reducer correlation described above.**
- **H2 — Permission moved to `completedRequests` too eagerly.** CLI removes from `requests` and adds to `completedRequests` before user has a chance to respond. Reducer Phase 0 skips entries that are also in `completedRequests`, so the pending state is never visible.
- **H3 — Tool state is `'completed'` before approval.** If Phase 4 sets `state: 'running'` and `startedAt = msg.createdAt` BEFORE the permission arrives in agentState (race), the UI may still render but permission lookup fails for some reason.
- **H4 — Plan-mode-enter boundary in reducer.ts hides the surrounding tool call.** `boundaryItems.ts` filtering may exclude the ExitPlanMode tool message from the active window. Worth checking how `latestBoundary` interacts with the tool's seq.
- **H5 — Mode-mapping issue.** `permissionMode` was changed via `mapToClaudeMode()` in a way that causes the SDK to skip the `canUseTool` callback for ExitPlanMode entirely (not invoking the permission flow at all). E.g. if mode is somehow `'bypassPermissions'`, the SDK might skip ExitPlanMode despite the "always require approval" comment in `permissionHandler.ts` — verify the SDK actually invokes canUseTool for ExitPlanMode in bypass mode.

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

## P1 tool rendering sweep — FIXED

**Symptom:** Several transcript tool bubbles were empty or misleading. `TaskOutput` and `TaskStop` were registered as minimal tools, which made them header-only even when a result was available. `Edit` and `MultiEdit` rendered diff bodies but did not pass the tool's `file_path` into `ToolDiffView`, so each diff fell back to `file.txt`. `CodexPatch` only understood an older wrapper shape and missed the real Codex `FileChange` tagged union shape.

**Root cause:** The broken renderers were shape/dispatch mismatches rather than a single task-tool registration problem:
- `TaskOutput` and `TaskStop` needed specialized renderers plus `minimal: false`; generic tool metadata alone suppresses the body.
- `Edit` and `MultiEdit` already parsed `file_path` for titles, but the compact and full diff views never threaded the resolved path into `ToolDiffView`.
- Malformed `Edit` / `MultiEdit` inputs failed Zod parsing silently instead of rendering a visible error block.
- `CodexPatchView` preserved legacy wrapper branches but did not branch first on the flat `type: 'update' | 'add' | 'delete'` file-change union emitted by Codex.

**Fix:** Added first-class `TaskOutputView` and `TaskStopView` renderers with five-branch result fallback ladders: running, canonical object, string, unknown-object JSON, and null/undefined parse-error. Both tools now show task-id titles/chips, use permissive result schemas, suppress duplicate default error footers, and warn rather than blanking on unknown shapes. `EditView`, `MultiEditView`, and their full-view siblings now resolve `file_path` only inside the successful Zod parse branch and pass the workspace-relative label into each diff. Failed `Edit` / `MultiEdit` parses render a visible `ToolError` block and emit a `[Tool] Zod parse failed: ...` warning. `CodexPatchView` now prefers the flat Codex file-change tagged union when `change.type` is present, while preserving the legacy wrapper branches.

**Dev fixture:** `/dev/tools2` has a `P1 Bug Fixes` filter section with deterministic fixtures for every fixed branch: TaskOutput x5, TaskStop x5, `editFix`, `multiEditFix`, and CodexPatch update/move/add/delete/legacy-wrapper. Metadata-bearing fixtures use `{ path: '/Users/steve/project', host: 'devbox' }` so browser verification can confirm workspace-relative labels; the older null-metadata edit fixture remains available to verify raw absolute-path fallback.

**Before / after notes:** Before the sweep, `TaskOutput` and `TaskStop` could appear as header-only/minimal bubbles, `Edit` and `MultiEdit` diffs could show `file.txt`, malformed edit inputs could render as empty bubbles, and current Codex patch payloads could show headers without usable diff bodies. After the sweep, the `/dev/tools2` P1 fixture renders non-empty bodies for every branch, workspace-relative labels such as `src/components/Header.tsx`, the deliberate raw fallback `/Users/steve/project/package.json`, visible parse-error blocks, and CodexPatch edit/move/new/delete bodies.

**Captured tool-result payloads:** Claude Code 2.1.138 produced `TaskOutput` results shaped like `{ retrieval_status: 'success', task: { task_id, task_type, status, description, output, prompt, result } }`. `TaskStop` can produce a plain string error result such as `Error: Task <id> is not running (status: completed)`, so the renderer treats string results as first-class outcomes.

**Files changed:**
- `packages/happy-app/sources/components/tools/views/{TaskOutputView,TaskStopView,EditView,EditViewFull,MultiEditView,MultiEditViewFull,CodexPatchView}.tsx`
- `packages/happy-app/sources/components/tools/views/_all.tsx`
- `packages/happy-app/sources/components/tools/knownTools.tsx`
- `packages/happy-app/sources/app/(app)/dev/tools2.tsx`
- `packages/happy-app/sources/text/_default.ts` and `packages/happy-app/sources/text/translations/*.ts`
- `packages/happy-app/sources/components/tools/views/*.test.tsx` plus shared `toolViewTestUtils.tsx`

Verified: `pnpm --filter happy-app typecheck`, `pnpm -r typecheck`, `pnpm --filter happy-app test --run`, and web reproduction at `/dev/tools2`.

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
