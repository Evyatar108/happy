---
name: blocker-report
description: >
  Surface Ralph-tracked tasks that are blocked, have open Medium+ review
  findings, or have deferred questions. Reads plans/overview-snapshot.json,
  prints proposed remediation commands, and chains into /work-on when the user
  picks a number.
---

# Blocker Report

Use this skill to find Ralph-tracked tasks that need manual attention before
normal implementation or review can continue.

## Snapshot

Resolve the repository root with:

```bash
git rev-parse --show-toplevel
```

Read `<repo-root>/plans/overview-snapshot.json`. If it is missing, print:

```text
no snapshot available - run `pnpm sync-ralph-state`
```

Then stop.

## Filters

Scan `snapshot.tasks[]`. Include a task when any filter below matches:

- `ralph.stage === "blocked"`
- `ralph.stage === "review-fix"` and (`ralph.reviewOpenCount.code > 0` or
  `ralph.reviewOpenCount.docs > 0`). These counts are open Medium+ review
  findings, not Critical/High-only findings.
- `ralph.deferredQuestionsCount > 0`. This field is gated on Plan 07; when it
  is `undefined`, treat it as `0` and do not include the task for this clause.
- A PRD user story is blocked: read `<repo-root>/<ralph.artifacts.jobDir>/prd.json`
  on demand, parse `userStories[]`, and include the task if any
  `userStories[].blocked === true`.

Skip tasks without `ralph` unless the PRD path can be resolved from another
documented snapshot field. Do not fail the whole report when one PRD file is
missing or malformed; add a short warning to that task only if it otherwise
matched a snapshot filter.

## Blocker Summary

For each included task, prepare a concise blocker summary from the matching
source:

- Blocked stage: use `ralph.terminalReason` when available, otherwise use
  `stage is blocked`.
- Review fix with findings: show the total count and the phrase
  `open Medium+ review findings`.
- Deferred questions: show `ralph.deferredQuestionsCount`; if
  `ralph.deferredQuestionsPreview` exists, include its first line.
- PRD blocked story: show the blocked story id and its `notes` text when set.

If multiple filters match, include the highest-signal summaries in one line.

## Render

Render a numbered list. Each entry must include taskId, stage, jobDir, blocker
summary, and proposed action:

```text
1. [taskId] ([stage])
   jobDir: .ralph/jobs/example-job
   Blocker: 2 open Medium+ review findings
   Proposed action: /implement-with-ralph resume example-job
   -> /work-on taskId
```

Use `ralph.artifacts.jobDir` for `jobDir`. Use `ralph.jobSlug` for the proposed
action:

```text
/implement-with-ralph resume <jobSlug>
```

If `ralph.jobSlug` is missing, omit the proposed action and state that the job
slug is missing from the snapshot.

If no tasks match, print `no blockers found` and stop.

## Picker

Prompt the user to choose a number from `1..N`.

If the user selects a valid number, invoke the repo-local work-on skill with the
selected canonical task id:

```text
Skill("work-on", args="<selected-task-id>")
```

This picker-to-/work-on chain instruction delegates final command derivation to
`/work-on`, which shells out through `scripts/lib/derive-next-command-cli.mjs`.

If the input is blank or is not a valid number in range, exit silently.
