# Plan 07 — Context preservation: notepad surfacing, journal, RecentActivity, PR/branch backlinks

**Worktree:** main checkout at `D:\harness-efforts\codexu`.

**Position in DAG:** depends on Plan 05 (snapshot). Independent of 04/06/08/09.

## Context

Plans 01–06 give the user (and agents) a way to see and pick the right action per task. This plan adds context surfaces so the dashboard answers "what's stuck on this task?" and "what just changed?" without round-tripping to other files. Specifically:

1. **Notepad surfacing** — parse `<jobDir>/notepad.md`'s Deferred Questions table. Surface `deferredQuestionsCount` and a preview.
2. **Per-task journal** — auto-append a one-liner to `tasks/<id>/journal.md` on every stage transition.
3. **RecentActivity sidebar** — render the last 5–10 entries from `plans/overview-activity.jsonl` (from Plan 05) in a right-side panel.
4. **Git/PR backlinks** — populate `RalphPipelineState.branchName`, `prUrl`, `mergeCommit`.

## Dependencies

- **Plan 05 (Agent exports)** — required. RecentActivity reads `plans/overview-activity.jsonl` and the journal entries are appended in the same code path as activity events.

## Scope

**In scope:**
- Extend `RalphPipelineState` with `deferredQuestionsCount?: number`, `deferredQuestionsPreview?: string` (first unanswered question, ≤120 chars), `storyDoctorInterventions?: number`, `branchName?: string`, `prUrl?: string`, `mergeCommit?: string`.
- Implement notepad parser in `scripts/lib/parse-notepad.mjs` reading the Deferred Questions table format from `implement-with-ralph` Appendix B.
- Implement PR URL scraping in `scripts/lib/derive-pr-links.mjs`. Sources: `group.json.prUrl` for parallel groups; for single-job tasks, scrape the latest commit message in `prd.json.branch.name` for `Closes #N` / GitHub URL patterns.
- Auto-append journal entries on stage transitions: `scripts/lib/append-journal.mjs`. Output: `tasks/<id>/journal.md` (new file per task on first transition).
- New `tools/overview-viewer/src/components/RecentActivity.tsx` — collapsible right-side panel rendering the last N activity events. Reads `plans/overview-activity.jsonl` (the viewer needs a way to load it — see Implementation).
- Tooltip extras for `RalphStageChip` — add `deferredQuestionsCount`, `prUrl` link, `branchName` copy as additional tooltip content via the `tooltipExtras` slot introduced in Plan 03.

**Out of scope (other plans):**
- Crews session list in the tooltip → Plan 08
- MCP `add_journal_entry` tool → Plan 09
- Full notepad-content rendering (deferred questions table, story-doctor log) in a separate dialog → out of scope; tooltip is sufficient for v1

## Files

### To create

- **`scripts/lib/parse-notepad.mjs`** — exports `parseNotepad(notepadText) -> { deferredQuestionsCount, deferredQuestionsPreview, storyDoctorInterventions }`. Implements the markdown-table parser for the `## Deferred Questions` section per the implement-with-ralph Appendix B format. Counts rows with empty `Answer` column = unanswered. The preview is the first unanswered question, trimmed to 120 chars.
- **`scripts/lib/derive-pr-links.mjs`** — exports `derivePRLinks({ groupState?, repoRoot, branchName }) -> { prUrl?, mergeCommit? }`. Reads `groupState.prUrl` directly if present. Otherwise: `git log --pretty=%H%n%s%n%b -n 5 <branchName>` → scan for `Closes #N` / `https://github.com/.../pull/N` pattern. Return the first match. `mergeCommit` is the short SHA of `HEAD` of the merged branch when stage is `shipped`.
- **`scripts/lib/append-journal.mjs`** — exports `appendJournalEntry({ repoRoot, taskId, line })`. Atomic append to `tasks/<taskId>/journal.md`. Creates the directory + file on first call. Line format: `- <ISO timestamp>  <text>` (matches the comprehensive plan's format).
- **`tools/overview-viewer/src/components/RecentActivity.tsx`** — props: `{ activityEvents: ActivityEvent[]; setFocusedTaskId: (id: string) => void }`. Renders the last 5–10 events with timestamps; each entry is clickable to scroll the command list to that task (reuses `navigateToCommand` helper).
- **`tools/overview-viewer/src/hooks/useActivityEvents.ts`** — React hook that fetches `plans/overview-activity.jsonl` once on mount and re-fetches on the `overview-ralph-state:update` HMR event (the same event the sidecar uses). Parses JSONL into `ActivityEvent[]`.

### To modify

- **`tools/overview-viewer/src/types.ts`** — extend `RalphPipelineState` with the new optional fields:
  ```ts
  deferredQuestionsCount?: number
  deferredQuestionsPreview?: string
  storyDoctorInterventions?: number
  branchName?: string
  prUrl?: string
  mergeCommit?: string
  ```
- **`scripts/lib/sync-core.mjs`** — for each Ralph job, after deriving the base `RalphPipelineState`:
  - Read `<jobDir>/notepad.md`. Call `parseNotepad(text)` to populate the new fields. Skip silently if the file is missing.
  - Call `derivePRLinks({ groupState, repoRoot, branchName: prd.branch.name })` to populate `branchName`, `prUrl`, `mergeCommit`.
  - When the watcher detects a stage transition, call `appendJournalEntry(...)` AFTER appending the activity event but BEFORE the sidecar write.
- **`tools/overview-viewer/src/components/RalphStageChip.tsx`** — use the `tooltipExtras` slot introduced in Plan 03 to render:
  - `deferredQuestionsCount` if > 0 (e.g. "📝 3 open questions")
  - `branchName` with a copy-to-clipboard quick-action (`git checkout <branchName>`)
  - `prUrl` as a clickable link if present
- **`tools/overview-viewer/src/App.tsx`** — render `<RecentActivity>` in a right sidebar (collapsible). Use `useActivityEvents()` hook for data.
- **`tools/overview-viewer/src/styles.css`** — `.recent-activity-sidebar` layout (collapsible, fixed right). `.tooltip-extras-row` styling.

### Read for reference

- `C:\Users\evmitran\.claude\plugins\cache\ai-developer-toolkit\ralph-orchestration\5.30.0\skills\implement-with-ralph\SKILL.md` Appendix B — Deferred Questions table format.
- `tools/overview-viewer/src/components/RalphStageChip.tsx` from Plan 03 — `tooltipExtras` slot integration.
- `scripts/lib/emit-activity.mjs` from Plan 05 — activity events are the input to RecentActivity.
- `scripts/lib/sync-core.mjs` from Plan 01 — extension point.

## Implementation strategy

1. **Build `scripts/lib/parse-notepad.mjs`** with the markdown-table parser. Unit-test against fixtures: empty notepad, 0 questions, 3 questions with 2 answered, malformed table (graceful degradation).
2. **Build `scripts/lib/derive-pr-links.mjs`** — git log scraping. Unit-test by mocking the git output.
3. **Build `scripts/lib/append-journal.mjs`** — atomic append, create-on-first. Test idempotency (calling with the same line twice produces two lines).
4. **Wire into `scripts/lib/sync-core.mjs`** — call these in the per-slug derivation path.
5. **Extend `RalphPipelineState`** types. Run typecheck.
6. **Build `RecentActivity.tsx`** — render last N events. Wire `setFocusedTaskId` to `navigateToCommand`.
7. **Build `useActivityEvents.ts`** — fetch + parse JSONL. Refetch on HMR event.
8. **Integrate `<RecentActivity>` in `App.tsx`** — collapsible right sidebar. Density-aware (collapsed by default in compact mode).
9. **Add tooltip extras** in `RalphStageChip.tsx` for the new fields.
10. **End-to-end test:** populate a synthetic notepad with 3 deferred questions; run sync; verify the chip tooltip shows "3 open questions" and the question preview.

## Acceptance criteria

- [ ] `scripts/lib/parse-notepad.mjs` parses the Deferred Questions table per the implement-with-ralph Appendix B format. Counts unanswered rows. Returns first-unanswered preview ≤120 chars.
- [ ] `scripts/lib/derive-pr-links.mjs` populates `prUrl` from `group.json.prUrl` or commit-message scrape.
- [ ] `scripts/lib/append-journal.mjs` atomically appends a line per stage transition.
- [ ] `RalphPipelineState` carries the 6 new optional fields.
- [ ] Sync output snapshot includes the new fields populated for any task whose Ralph job has a notepad / PR / branch.
- [ ] Journal entries appear in `tasks/<id>/journal.md` on stage transitions.
- [ ] `RecentActivity.tsx` renders the last 5–10 events from `plans/overview-activity.jsonl`. Clicking an entry scrolls to the task.
- [ ] `RalphStageChip` tooltip shows deferred-questions count, branch name (with copy), PR URL (if present) via the `tooltipExtras` slot.
- [ ] `pnpm --filter @codexu/overview-viewer test` passes including new tests for parse-notepad fixtures.
- [ ] Existing tests unchanged.

- [ ] **Refresh downstream plans + INDEX.** After all other criteria pass, audit (a) the plans listed in this plan's "Hand-off to next plans" section and (b) `plans/ralph-pipeline-INDEX.md`'s "Source-of-truth modules" table and DAG diagram. Update any stale references — file paths, type signatures, function/export names, behavior contracts, module dependencies — that diverged from this plan's actual implementation. Apply updates atomically in the final implementation commit; in the commit message, list each diff (which file, which lines, what changed) so reviewers can verify the cascade.

## Verification

A. **Notepad parser fixtures:** unit tests cover (i) empty notepad, (ii) notepad with no deferred questions, (iii) 3 questions with 2 answered → count is 1, (iv) malformed table → graceful degradation (return zero count).

B. **PR scraping:** for a task whose `prd.branch.name` has a merge commit with `Closes #42`, `cat plans/overview-snapshot.json | jq '.tasks[<i>].ralph.prUrl'` returns the GitHub URL.

C. **Branch surfacing:** for a task with `prd.branch.name = 'ralph/overview-data-split/integration'`, the chip tooltip shows the branch name with a copy-to-clipboard button for `git checkout <branchName>`.

D. **Journal append:** flip a task's stage via `.ralph/jobs/<test>/job-state.json` edit. After sync, `tail tasks/<id>/journal.md` shows a new line `- <ts>  stage: <prev> → <new>  (job: <slug>)`.

E. **RecentActivity render:** open the dev server, expand the right sidebar. Confirm the last 5–10 activity events render, each with a clickable task ID.

F. **Tooltip detail:** hover a chip for a task with 3 open deferred questions. Tooltip shows "📝 3 open questions" and the first question's text (truncated).

G. **Tooltip with no extras:** hover a chip for a task with no notepad / PR / branch. Tooltip falls back to the Plan 03 minimal content (stage, jobSlug, lastUpdatedAt) — no broken rows.

H. **HMR refresh:** with Plan 02's watcher running, flip a stage. RecentActivity sidebar updates within ~2-3 seconds.

## Common mistakes / confusion points

1. **Don't write to `OverviewData.runs[]` from the sync script.** PR URLs from this plan go into `RalphPipelineState.prUrl`, not into `OverviewData.runs[].commits`. The hand-curated `runs[]` stays bookkeeper-owned.
2. **Notepad parsing is best-effort.** If the table is malformed (missing header, wrong column count), return zero counts and a stderr warning. Never crash the sync over a notepad parse error.
3. **`prUrl` from `group.json` wins over commit-message scrape.** Order matters: `group.json.prUrl` is authoritative (orchestrator-written); commit-message scrape is a fallback.
4. **Journal is append-only and per-task, not per-job.** A task with multiple cycles has multiple journal entries spanning cycles; per-job notepads continue to live in `<jobDir>/notepad.md`.
5. **RecentActivity reads JSONL, not JSON.** Each line is one event. Parse with `text.split('\n').filter(Boolean).map(JSON.parse)`. Handle the trailing newline edge case.
6. **Tooltip extras slot is additive.** When Plan 08 adds crew sessions, it appends to the same slot — don't replace the slot's content.
7. **Notepad `## Deferred Questions` section is the structured one.** Don't try to surface `## Story Doctor Log` or `## Working Notes` in this plan; they're free-form and would need separate parsing logic.

## Hand-off to next plans

- **Plan 06 — Skills** `/blocker-report` was originally specified to use `deferredQuestionsCount > 0` as one of its filter criteria. After Plan 07 ships, that surface becomes available.
- **Plan 08 — Crews** appends crew-session content to the same tooltip extras slot.
- **Plan 09 — MCP** `overview.add_journal_entry` tool uses `scripts/lib/append-journal.mjs`.
