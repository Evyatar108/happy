# Plan 06 — Repo-local skills + `derive-next-command.mjs`

**Worktree:** main checkout at `D:\harness-efforts\codexu`.

**Position in DAG:** depends on Plan 05 (snapshot + recommendations files). Plan 04 highly recommended (recommendations file).

## Context

The user runs Claude Code with various plugins (ralph-orchestration, crews, etc.). When picking up a task mid-stream, they currently have to remember which command to run: `/plan-with-ralph --from-brainstorm <dir>` vs `/plan-with-ralph --improve <plan>` vs `/implement-with-ralph --from-plan <plan>` vs `/implement-with-ralph resume <name>`, etc. This plan adds three repo-local skills that consume `plans/overview-snapshot.json` and let the user (or an agent) say "work on task X" without command memorization.

Per the user's preference, the skills live in `D:\harness-efforts\codexu\.claude\skills/` (repo-local), not user-global.

## Dependencies

- **Plan 05 (Agent exports)** — required. Skills read `plans/overview-snapshot.json` and `plans/overview-recommendations.json`.
- **Plan 04 (Pipeline overview)** — recommended. `/triage` requires `plans/overview-recommendations.json`. Without Plan 04 the file is empty and `/triage` degrades to "no recommendations available."

## Scope

**In scope:**
- New `scripts/lib/derive-next-command.mjs` — pure ESM module mirroring the structure of `derive-ralph-stage.mjs`. Single source of truth for stage → command predicate.
- New repo-local skill `.claude/skills/work-on/SKILL.md` — `/work-on <task-id>` resolves to the right Ralph skill invocation.
- New repo-local skill `.claude/skills/triage/SKILL.md` — `/triage` ranks tasks needing attention.
- New repo-local skill `.claude/skills/blocker-report/SKILL.md` — `/blocker-report` surfaces blockers and proposed unblock actions.
- Unit test for `derive-next-command.mjs` — one case per stage value.

**Out of scope (other plans):**
- `--via-crew <crewName>` mode of `/work-on` (delegates to a crew member) → Plan 08
- MCP server exposing the same logic → Plan 09

## Files

### To create

- **`scripts/lib/derive-next-command.mjs`** — pure function `deriveNextCommand(ralphPipelineState, task) -> NextCommand | null`. Returns `null` for stage `shipped` (unless `terminalReason === 'replan'`). Outputs `{ label, command, icon? }`.
- **`scripts/lib/__tests__/deriveNextCommand.test.mjs`** OR add cases to `tools/overview-viewer/src/__tests__/ralphStage.test.ts` — 10 stages. One case asserts that a task in the `replan-pending` stage (emitted by `derive-ralph-stage.mjs` when `orchestrator.terminal === true && terminalReason === 'replan'`) returns the `/plan-with-ralph --improve <jobDir>/plan.md` command.
- **`.claude/skills/work-on/SKILL.md`** — implementation details below.
- **`.claude/skills/triage/SKILL.md`** — implementation details below.
- **`.claude/skills/blocker-report/SKILL.md`** — implementation details below.

### To modify

- **`tools/overview-viewer/src/types.ts`** — add `NextCommand` type.
- Optional: **`tools/overview-viewer/src/components/TaskCommand.tsx`** — add a "Copy next command" QuickAction button that calls `deriveNextCommand(ralphState.byTaskId[task.id], task)` and copies the result via `copyTextWithToast`. NOTE: this UI integration is optional in Plan 06; can be deferred to a follow-up. The skill itself is the primary surface.

### Read for reference

- `C:\Users\evmitran\.claude\plugins\cache\ai-developer-toolkit\ralph-orchestration\5.30.0\skills\implement-with-ralph\SKILL.md` — for the resume / `--run-only` / `--from-plan` argument syntax current as of v5.30.0.
- `C:\Users\evmitran\.claude\plugins\cache\ai-developer-toolkit\ralph-orchestration\5.30.0\skills\plan-with-ralph\SKILL.md` — for the `--improve` / `--from-brainstorm` syntax.
- `C:\Users\evmitran\.claude\plugins\cache\ai-developer-toolkit\ralph-orchestration\5.30.0\skills\brainstorm-with-ralph\SKILL.md` — for resume semantics.

## `deriveNextCommand` predicate table

`stage → NextCommand`. Inputs: the task's `RalphPipelineState` and the corresponding `OverviewTask`.

| Stage | NextCommand |
|---|---|
| `brainstorming` | `{ label: 'Resume brainstorm', command: '/brainstorm-with-ralph', icon: '💡' }` (the skill picks up the breadcrumb from `.ralph/brainstorms/.brainstorm-handoff-<name>.json`) |
| `brainstorm-ready` | `{ label: 'Plan from brainstorm', command: '/plan-with-ralph --from-brainstorm <brainstormDir>', icon: '📋' }` |
| `planning` | `{ label: 'Continue planning', command: '/plan-with-ralph --improve <planFile or planDraftFile>', icon: '📝' }` |
| `plan-ready` | `{ label: 'Start implementation', command: '/implement-with-ralph --from-plan <jobDir>/plan.md', icon: '🚀' }`. If `isParallel === true`, append `--parallel --suggested-decomposition <jobDir>/suggested-decomposition.json`. |
| `implementing` | `{ label: 'Resume implementation', command: '/implement-with-ralph resume <jobSlug>', icon: '⚙️' }`. For parallel groups: `/implement-with-ralph --run-only --job <absolute_groupDir>`. |
| `reviewing` / `review-fix` | `{ label: 'Continue review', command: '/implement-with-ralph resume <jobSlug>', icon: '🔍' }` (Phase 2R routes to saved orchestrator phase). |
| `shipped` | `null` |
| `replan-pending` | `{ label: 'Replan next cycle', command: '/plan-with-ralph --improve <jobDir>/plan.md', icon: '🔄' }` (emitted by `derive-ralph-stage.mjs` when `orchestrator.terminal === true && terminalReason === 'replan'`) |
| `blocked` | `{ label: 'Retry after fix', command: '/implement-with-ralph resume <jobSlug>', icon: '🛠' }` |

**Version-pin note:** the predicate table is keyed to ralph-orchestration v5.30.0. If Ralph's resume syntax changes in a future version, this module must be updated in lockstep. Add a comment at the top of `derive-next-command.mjs`: `// Tested against ralph-orchestration v5.30.0. If the orchestrator's resume syntax changes (e.g. --run-only canonicalization), update this table and re-test.`

## Skill: `/work-on <task-id>`

Path: `D:\harness-efforts\codexu\.claude\skills\work-on\SKILL.md`

Frontmatter:
```yaml
---
description: Resume work on a Ralph-tracked task. Reads plans/overview-snapshot.json, picks the right Ralph skill based on current stage, and invokes it. Usage: /work-on <task-id> [--dry-run]
---
```

Body (the skill's own prose, written for Claude to execute):

1. **Parse args:**
   - Positional: `<task-id>` (required). Match case-insensitively against `OverviewTask.id` and against the `jobSlug` / `groupSlug` / `brainstormDir`. If multiple match, present a numbered picker and stop.
   - `--dry-run` flag: print the derived command without invoking.
   - `--via-crew <crewName>` flag: defer to Plan 08; for this plan, error with "crews delegation not yet implemented — wait for Plan 08."

2. **Locate the snapshot:**
   - `repo_root = git rev-parse --show-toplevel`
   - Read `<repo_root>/plans/overview-snapshot.json`. If missing or stale (>2 min old) and a watcher process is detected (lock file exists), warn that data may not be current. If missing entirely, suggest running `pnpm sync-ralph-state`.

3. **Resolve the target task:**
   - Search `snapshot.tasks[]` for matching id / slug.
   - If 0 matches: error with "no task `<task-id>` found in overview-snapshot.json".
   - If >1 matches: present a numbered picker.

4. **Look up Ralph state:**
   - `ralphState = snapshot.tasks[matched].ralph`
   - If undefined and `OverviewTask.command.planPrompt` is set, fall back to the seed prompt (the bookkeeper-authored plan-with-ralph invocation). Inform the user this is the seed, not a resume.
   - If both are missing, error with guidance.

5. **Derive next command via `scripts/lib/derive-next-command.mjs`:**
   - Use the `Skill` tool with absolute path imports if needed, OR execute `node -e "import('./scripts/lib/derive-next-command.mjs').then(m => console.log(JSON.stringify(m.deriveNextCommand(...))))"` to get the result. The skill is a markdown file, so this is one of those cases where we shell out to Node from the skill's prose.

6. **Invoke or print:**
   - If `--dry-run`: print the resolved command and exit.
   - Otherwise: use the `Skill` tool to invoke the resolved Ralph skill. E.g. for `plan-ready`: `Skill("ralph-orchestration:implement-with-ralph", args="--from-plan <jobDir>/plan.md")`.

7. **Failure modes:**
   - Stage `shipped` (no replan): tell the user the task is done; show `mergeCommit` if present; exit gracefully.
   - Stage `blocked`: print the derived "Retry after fix" command + the blocker summary from `snapshot.tasks[matched].ralph.deferredQuestionsPreview` (when Plan 07 ships) or a generic "Investigate the blocker before re-invoking."

## Skill: `/triage`

Path: `D:\harness-efforts\codexu\.claude\skills\triage\SKILL.md`

1. Read `plans/overview-recommendations.json` (from Plan 04). If missing, suggest running `pnpm sync-ralph-state` (or that Plan 04 hasn't shipped).
2. Take top N (default 5; `--limit N` flag).
3. Optional `--filter stage=<stage>` narrows by stage.
4. Render a numbered list:
   ```
   1. [taskId]  ([stage], score 0.87)
      Reasons: review-fix stage, unblocked, not touched in 9 days
      → /work-on taskId
   ```
5. Wait for user input: a number 1-N invokes `/work-on <selected-id>` via the `Skill` tool. Anything else exits.

## Skill: `/blocker-report`

Path: `D:\harness-efforts\codexu\.claude\skills\blocker-report\SKILL.md`

1. Read `plans/overview-snapshot.json`.
2. Filter `snapshot.tasks` for:
   - `ralph.stage === 'blocked'`
   - `ralph.reviewOpenCount.code > 0` OR `ralph.reviewOpenCount.docs > 0` AND `ralph.stage === 'review-fix'` (open Critical/High findings — requires Plan 07 for the detailed surface but works on basic count without)
   - `ralph.deferredQuestionsCount > 0` (when Plan 07 has shipped)
   - `userStories[].blocked === true` in any matched `<jobDir>/prd.json` — requires reading the PRD; gate on whether Plan 07's notepad surfacing has shipped (Plan 07 adds the deferred-questions count; this skill's basic-blocker view works without it).
3. For each, print:
   - taskId, stage, jobDir
   - Blocker summary (extracted source — finding text, deferred question, PRD note)
   - Proposed action: most blockers route to `/implement-with-ralph resume <jobSlug>` after manual remediation; surface that command verbatim.
4. Number the entries; prompt the user with the same picker pattern as `/triage`.

## Implementation strategy

1. **Build `scripts/lib/derive-next-command.mjs`** with the predicate table. Add the version-pin comment.
2. **Unit-test** the derive function — one case per row in the predicate table.
3. **Add `NextCommand` type** to `tools/overview-viewer/src/types.ts`.
4. **Write `/work-on` skill** at `.claude/skills/work-on/SKILL.md`. Manually test by typing `/work-on <task-id> --dry-run` and verifying the printed command matches the predicate table.
5. **Write `/triage` skill** at `.claude/skills/triage/SKILL.md`. Test with empty recommendations file (`{ recommendations: [] }`) and with a populated one.
6. **Write `/blocker-report` skill** at `.claude/skills/blocker-report/SKILL.md`. Test by creating a synthetic blocked task and confirming the skill surfaces it.
7. **Optional UI integration:** add a "Copy next command" button in `TaskCommand.tsx`. Use `copyTextWithToast`. The button is rendered only when `deriveNextCommand` returns non-null.

## Acceptance criteria

- [ ] `scripts/lib/derive-next-command.mjs` exports `deriveNextCommand` and has the version-pin comment.
- [ ] Unit tests cover one case per stage value (10 stages, including `replan-pending`). All pass.
- [ ] `.claude/skills/work-on/SKILL.md` exists with the documented behavior.
- [ ] `.claude/skills/triage/SKILL.md` exists.
- [ ] `.claude/skills/blocker-report/SKILL.md` exists.
- [ ] `/work-on <task-id> --dry-run` prints the right command for each stage value (verifiable manually by setting a test task to each stage).
- [ ] `/triage` produces a numbered list from `overview-recommendations.json` and chains into `/work-on` when the user picks a number.
- [ ] `/blocker-report` surfaces tasks with `stage === 'blocked'` and proposes remediation commands.
- [ ] If `--via-crew` flag is passed to `/work-on` in Plan 06, the skill errors gracefully with "wait for Plan 08." (Plan 08 will implement.)

- [ ] **Refresh downstream plans + INDEX.** After all other criteria pass, audit (a) the plans listed in this plan's "Hand-off to next plans" section and (b) `plans/ralph-pipeline-INDEX.md`'s "Source-of-truth modules" table and DAG diagram. Update any stale references — file paths, type signatures, function/export names, behavior contracts, module dependencies — that diverged from this plan's actual implementation. Apply updates atomically in the final implementation commit; in the commit message, list each diff (which file, which lines, what changed) so reviewers can verify the cascade.

## Verification

A. **Predicate table coverage:** `pnpm test scripts/lib/__tests__/deriveNextCommand.test.mjs` — all 10 cases pass.

B. **`/work-on` dry-run smoke:** for a task in `plan-ready` stage, `/work-on <taskId> --dry-run` prints `/implement-with-ralph --from-plan <jobDir>/plan.md`.

C. **`/work-on` ambiguity:** for a task-id prefix that matches multiple tasks, the skill presents a picker.

D. **`/work-on` no-state fallback:** for a task with no `ralph` entry but a `command.planPrompt`, the skill prints the seed prompt with a note that it's the seed, not a resume.

E. **`/triage` populated:** with `overview-recommendations.json` containing 5+ entries, `/triage` lists top 5 with reasons.

F. **`/triage` empty:** with empty recommendations, `/triage` prints "no recommendations available — run `pnpm sync-ralph-state`."

G. **`/triage` picker → `/work-on`:** entering "1" after the list invokes `/work-on <first-taskId>`.

H. **`/blocker-report`:** with at least one task in `blocked` stage, the skill surfaces it with the proposed retry command.

I. **Version-pin sanity:** open `scripts/lib/derive-next-command.mjs`; confirm the top comment names the ralph-orchestration version.

## Common mistakes / confusion points

1. **Single source of truth.** `derive-next-command.mjs` is THE predicate. The skills, the optional UI button, and the MCP server (Plan 09) all import it. Never re-implement the table.
2. **Version-pin lives in code, not in the plan.** The comment at the top of `derive-next-command.mjs` is the contract. When the ralph plugin upgrades, audit the module and bump the version pin.
3. **The skill is markdown; it doesn't import TS directly.** Skills are Claude-readable instructions, not code. To call `deriveNextCommand`, the skill's prose tells Claude to shell out to Node: `node -e "import('./scripts/lib/derive-next-command.mjs').then(...)"`. This is awkward but acceptable; Plan 09 (MCP) eliminates the shell-out by importing directly in TypeScript.
4. **`/work-on` falls back to seed prompt when there's no ralph state.** Don't error in that case — the seed prompt is the bookkeeper-authored starting point for a never-started task.
5. **Skill paths must be repo-local.** Putting them under `~/.claude/skills/` would make them user-global; the user explicitly chose repo-local so the skill can evolve with the codebase.
6. **Don't auto-invoke without confirmation in `/work-on`.** Default behavior is invoke; `--dry-run` is the safety hatch. Some users may want a default `--confirm` flag; add a config option if so. For v1, invoke is default.

## Hand-off to next plans

- **Plan 07 — Context** populates `RalphPipelineState.deferredQuestionsCount` and `deferredQuestionsPreview`, which `/blocker-report` then surfaces in detail.
- **Plan 08 — Crews** adds `--via-crew <crewName>` support to `/work-on`. The plan replaces the "wait for Plan 08" error with the actual delegation logic.
- **Plan 09 — MCP** exposes `overview.next_command` and `overview.invoke_next` tools that wrap the same `deriveNextCommand` predicate. The MCP tools and the skills SHARE the predicate module — no drift.
