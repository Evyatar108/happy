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
- Optional `--via-crew <crewName>` flag.

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

## Null Handling

If the helper returns `null` and `task.ralph.stage === 'shipped'`, tell the user
the task is already done. If `task.mergeCommit` exists, include it.

If the helper returns `null` for any other stage, stop with:

```text
cannot derive command for stage '<stage>' — required artifact (planFile / jobDir / brainstormDir) is missing from snapshot. Run `pnpm sync-ralph-state` and retry, or check the underlying job directory.
```

If `--dry-run` was passed and the helper returned a non-null command, print the
resolved command string and stop.

## Via Crew

When `--via-crew <crewName>` is present, do not invoke the Ralph Skill tool.
Delegate through the crews CLI mirror and record the session ref atomically.

Skill tool invocations cannot trigger the crews `/spawn-member` hook. The CLI
mirror at `D:/ai-developer-toolkit/plugins/crews/tools/spawn-member.js` is
required.

Before spawning, perform a lock preflight against `config.lockFile` (default
`.ralph/overview-sync.lock`): read the JSON lock metadata, check PID liveness
with `process.kill(pid, 0)`, and if the live lock process is `standalone`,
`vite-plugin`, or `watcher`, abort with the existing diagnostic format:

```text
another sync in progress (pid <N>, process <label>, started <ts>)
```

The preflight must happen before spawning so a watcher-held lock cannot leave an
orphan crew member.

Pseudocode:

```text
repoRoot = git rev-parse --show-toplevel
config = loadConfig(repoRoot)
task = resolve selected task from plans/overview-snapshot.json
stage = task.ralph.stage

lock = read JSON config.lockFile if present
if lock process is watcher-owned and pid is live:
  abort before spawn with "another sync in progress ..."

promptJson = node scripts/lib/derive-next-command-cli.mjs <taskId>
prompt = JSON.parse(promptJson).command

memberName = unique slug from <taskId> + current timestamp
mainRepoRoot = dirname(config.crewsRoot) when config.crewsRoot ends in .crews

node D:/ai-developer-toolkit/plugins/crews/tools/spawn-member.js \
  <memberName> --crew <crewName> --cwd <main-repo-root> -- "<prompt>"

poll <config.crewsRoot>/crews/<crewName>/members/<memberName>/manifest.json
  timeout: 10s
  interval: 500ms
  capture sessionId and transcriptPath when present

ref = {
  crewName,
  memberName,
  cwd: mainRepoRoot,
  startedAt,
  sessionId?,
  transcriptPath?,
}

node scripts/sync-ralph-state.mjs \
  --update-crew-session <taskId> <stage> --json JSON.stringify(ref)

print "Spawned <crew>/<member> for <taskId>:<stage>; session=<id|pending>"
```

If the manifest polling window expires, still write the partial entry with
`crewName`, `memberName`, `cwd`, and `startedAt`. The later cross-walk merge will
upgrade the entry in place when `sessionId` and `transcriptPath` appear.

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
