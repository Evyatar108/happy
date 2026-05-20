---
name: work-on
description: >
  Resume work on a Ralph-tracked task. Reads plans/overview-snapshot.json,
  picks the right Ralph skill based on current stage, and invokes it. Usage:
  /work-on <task-id> [--dry-run]
---

# Work On

Use this skill to resume a task from the Ralph overview snapshot without making
the user remember the current stage's Ralph command.

## Arguments

Parse `$ARGUMENTS` as:

- Required positional `<task-id>`.
- Optional `--dry-run` flag.
- Optional `--via-crew <crewName>` flag. For Plan 06, stop immediately with the exact error: `crews delegation not yet implemented — wait for Plan 08.`

The `<task-id>` match is exact and case-insensitive. Do not use prefix or fuzzy
matching.

## Snapshot

Resolve the repository root with:

```bash
git rev-parse --show-toplevel
```

Read `<repo-root>/plans/overview-snapshot.json`. If it is missing or older than
2 minutes, inspect `<repo-root>/.ralph/overview-sync.lock`. A fresh lock whose
`process` is `standalone` or `vite-plugin` means the watcher is probably about
to refresh the snapshot. If there is no fresh lock, suggest:

```bash
pnpm sync-ralph-state
```

## Task Resolution

Search `snapshot.tasks[]` for an exact case-insensitive match in this order:

- `task.id`
- `task.ralph.jobSlug`
- `task.ralph.groupSlug`
- the trailing slug of `task.ralph.artifacts.brainstormDir`

If there are no matches, stop with:

```text
no task '<task-id>' found in overview-snapshot.json
```

If multiple tasks match across those slug spaces, present a numbered picker with
the matching task ids and stages, then wait for the user to choose one.

## Missing Ralph State

For the selected task, read `task.ralph`.

If `task.ralph` is absent and `task.command.planPrompt` is present, print the
seed prompt and state that this is the seed prompt, not a resume command. Do not
call the CLI helper in this branch.

If both are missing, stop with:

```text
task '<id>' has neither a Ralph state nor a seed prompt — run /plan-with-ralph or /brainstorm-with-ralph to start.
```

## Derive Command

From the repo root, run the shared CLI helper with the selected task's canonical
`task.id`:

```bash
node scripts/lib/derive-next-command-cli.mjs --task <selected-task-id>
```

The helper reads `plans/overview-snapshot.json`, resolves `repoRoot` via
`git rev-parse --show-toplevel`, looks up the task, and prints a JSON encoded
`NextCommand | null`. Parse stdout as JSON. If the command exits non-zero,
surface stderr to the user.

If `--dry-run` was passed, print the resolved command string and stop. If the
JSON value is `null`, print `null` for dry-run output.

## Null Handling

If the helper returns `null` and `task.ralph.stage === 'shipped'`, tell the user
the task is already done. If `task.mergeCommit` exists, include it.

If the helper returns `null` for any other stage, stop with:

```text
cannot derive command for stage '<stage>' — required artifact (planFile / jobDir / brainstormDir) is missing from snapshot. Run `pnpm sync-ralph-state` and retry, or check the underlying job directory.
```

## Invoke

Map the command's leading slash command to the installed Ralph skill name:

- `/plan-with-ralph` -> `ralph-orchestration:plan-with-ralph`
- `/implement-with-ralph` -> `ralph-orchestration:implement-with-ralph`
- `/brainstorm-with-ralph` -> `ralph-orchestration:brainstorm-with-ralph`

Strip the leading slash command from `NextCommand.command` and pass the
remaining text as the `args` parameter to the Skill tool. Example:

```text
Skill("ralph-orchestration:implement-with-ralph", args="resume my-job")
```

## Blocked Stage

For `task.ralph.stage === 'blocked'`, show the derived `Retry after fix` command
and a blocker summary before invoking. Prefer
`task.ralph.deferredQuestionsPreview` when Plan 07 has shipped; if it is absent,
use: `Investigate the blocker (review notepad.md and recent journal entries) before re-invoking.`
