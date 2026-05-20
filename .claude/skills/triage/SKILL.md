---
name: triage
description: >
  Rank Ralph-tracked tasks needing attention. Reads recommendations from
  plans/overview-snapshot.json, falls back to plans/overview-recommendations.json
  only when the snapshot is missing, and chains into /work-on when the user
  picks a number. Usage: /triage [--limit N] [--filter stage=<stage>]
---

# Triage

Use this skill to rank Ralph-tracked tasks that need attention and hand the
selected task to `/work-on`.

## Arguments

Parse `$ARGUMENTS` as:

- Optional `--limit N` flag. Default to `5`; reject non-positive or non-numeric
  values with a short error.
- Optional `--filter stage=<stage>` flag. Match exactly against
  `Recommendation.stage`.

Ignore unknown flags only after telling the user which flag was ignored.

## Recommendation Source

Resolve the repository root with:

```bash
git rev-parse --show-toplevel
```

Primary source: read `<repo-root>/plans/overview-snapshot.json` and use
`snapshot.recommendations`.

The snapshot-vs-wrapper fallback rule is strict:

- If `plans/overview-snapshot.json` exists and `snapshot.recommendations` is an
  array, that array is authoritative.
- If the snapshot exists and `snapshot.recommendations` is empty, print
  `no recommendations available - run \`pnpm sync-ralph-state\` and verify Plan 04 has been merged`
  and stop. Do not fall back to `plans/overview-recommendations.json` when a
  present snapshot has an empty recommendation list.
- If `plans/overview-snapshot.json` is missing, fall back to
  `<repo-root>/plans/overview-recommendations.json`. That wrapper has shape
  `{ recommendations: Recommendation[], generatedAt, generatedFromCommit }`;
  use its `recommendations` array.
- If both files are missing, print
  `no recommendations available - run \`pnpm sync-ralph-state\`` and stop.

## Filtering And Ranking

Start from the selected recommendation array.

If `--filter stage=<stage>` was provided, keep only recommendations whose
`stage` equals the provided stage string.

Sort by descending `score`. Keep the first `N` entries after filtering, where
`N` is `--limit N` or the default `5`.

If the filtered list is empty, print `no recommendations available` and stop.

## Render

Render a numbered list. Each entry must include taskId, stage, score, and
reasons, followed by the `/work-on` command that will be used if selected:

```text
1. [taskId] ([stage], score 0.87)
   Reasons: review-fix stage, unblocked, not touched in 9 days
   -> /work-on taskId
```

Use the canonical `Recommendation.taskId` in the `/work-on` line.

## Picker

Prompt the user to choose a number from `1..N`.

If the user selects a valid number, invoke the repo-local work-on skill with the
selected canonical task id:

```text
Skill("work-on", args="<selected-task-id>")
```

This picker-to-/work-on chain instruction intentionally delegates stage-specific
command derivation to `/work-on`, which shells out through
`scripts/lib/derive-next-command-cli.mjs`.

If the input is blank or is not a valid number in range, exit silently.
