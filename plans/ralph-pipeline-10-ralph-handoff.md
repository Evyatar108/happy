# Plan 10 — Ralph plugin handoff doc (`overviewTaskId` field)

**Worktree:** `/implement-with-ralph --from-plan` creates the worktree at `D:\harness-efforts\codexu\.ralph\jobs\ralph-pipeline-10-ralph-handoff\worktree\` on branch `ralph-pipeline-10-ralph-handoff`. The deliverable is a single markdown doc (`plans/ralph-overview-task-id.md`) — write it in the worktree, commit on the branch, merge to `main` after review. The actual Ralph plugin patches that the doc describes live in a different repo (`D:\ai-developer-toolkit\plugins\ralph\`) and are picked up by a SEPARATE `/plan-with-ralph` cycle there — that's out of scope for this plan's worktree.

**Position in DAG:** standalone. Parallel-safe with all other plans. The output is a markdown doc that will be handed to a separate `/plan-with-ralph --improve` cycle targeting the Ralph plugin codebase.

## Context

The comprehensive plan's R1 refinement settled on a three-tier matching strategy for associating Ralph artifacts with `OverviewTask.id`:

1. **`overviewTaskId` field on Ralph artifacts** — highest confidence; requires Ralph plugin patches.
2. **`ralphOverrides` map in `overview-data.js`** — hand-edited override for slug mismatches.
3. **Default slug equality** (`jobSlug === taskId`) — works for most cases day-one.

Plans 01–09 build the system around tiers 2 and 3 with stderr-logged unmatched. Tier 1 — adding `overviewTaskId` natively to Ralph's PRD/group/brainstorm schemas — requires patching the ralph-orchestration plugin itself. This plan writes the requirements doc that a future Ralph plugin upgrade cycle picks up.

## Dependencies

None for the doc itself. (The doc DESCRIBES patches that, once landed in ralph-orchestration, will improve the matching confidence in Plans 01–09's sync output — but Plans 01–09 work fine without those patches.)

## Scope

**In scope:**
- Single markdown doc: `plans/ralph-overview-task-id.md`.
- Documents 4 required Ralph plugin skill patches:
  1. `convert-to-ralph-prd` — accept `--overview-task-id <id>` flag; write `overviewTaskId` field to `prd.json`. Update `schemas/prd-schema.json`.
  2. `decompose-plan` — propagate `overviewTaskId` from parent plan into each member's `prd.json` AND into `group.json` (top-level field). Update `schemas/group-schema.json`.
  3. `brainstorm-with-ralph` — at Phase 5 finalize, prompt for `overviewTaskId` and write to `brainstorm.json`. Also write to YAML front-matter of `selected-direction.md`.
  4. `plan-with-ralph` — when `--from-brainstorm` is used, copy `overviewTaskId` from the brainstorm artifact into the generated `plan.md` front-matter so it propagates downstream.
- Documents the back-compat strategy (existing PRDs lack the field; sync falls back to slug match / overrides until backfilled).
- Optional: a small backfill script `scripts/backfill-overview-task-id.mjs` that interactively prompts for each unmatched Ralph job and writes the `overviewTaskId` to its PRD. (Out of scope for this plan, but the doc references it as a possible follow-up.)

**Out of scope:**
- The actual Ralph plugin patches. Those are picked up by a separate `/plan-with-ralph --improve plans/ralph-overview-task-id.md` cycle in the ralph-orchestration plugin's source tree (`D:\ai-developer-toolkit\plugins\ralph\`).
- Backfilling existing PRDs in this repo. Handled either manually by the user or via the optional `scripts/backfill-overview-task-id.mjs` follow-up.

## Files

### To create

- **`plans/ralph-overview-task-id.md`** — the handoff doc. Suggested structure:

  ```markdown
  # Ralph plugin patches: add `overviewTaskId` field across PRD / group / brainstorm

  ## Context (the requesting feature)

  The codexu workspace's overview dashboard (`tools/overview-viewer/`) needs to associate each
  Ralph artifact (job, group, brainstorm) with an `OverviewTask.id` entry in
  `plans/overview-data.js`. Today the association uses a slug-equality heuristic plus an
  optional `ralphOverrides` map in the hand-curated data file. Adding a first-class
  `overviewTaskId` field to Ralph artifacts eliminates this brittleness for new jobs.

  See `plans/ralph-pipeline-01-foundation.md` (and the comprehensive plan at
  `C:\Users\evmitran\.claude\plans\glistening-wondering-llama.md`) for the consumer side.

  ## Patches required

  ### 1. `convert-to-ralph-prd` skill (Phase 8 / 8.5 area)

  - Accept `--overview-task-id <id>` flag.
  - In interactive mode: if the flag is absent, prompt the user with the list of valid
    `OverviewTask.id` values read from `<repo_root>/plans/overview-data.js`. Provide a
    "skip / no overview task" option.
  - Write the result to `prd.json` as a top-level `overviewTaskId` field (string or null).
  - Update `schemas/prd-schema.json` to include `overviewTaskId: { type: ['string','null'] }`
    in the top-level properties.

  ### 2. `decompose-plan` skill

  - Propagate the parent plan's `overviewTaskId` (if set in plan.md front-matter or in the
    parent `prd.json`) into:
    - Each member `prd.json`'s `overviewTaskId` field.
    - The top-level `group.json` as a new `overviewTaskId` field.
  - Update `schemas/group-schema.json` accordingly.

  ### 3. `brainstorm-with-ralph` skill (Phase 5)

  - At Phase 5 finalize, prompt for `overviewTaskId` if interactive mode.
  - Write to `brainstorm.json` as a top-level field.
  - Write to YAML front-matter of `selected-direction.md`:
    ```yaml
    ---
    overviewTaskId: <id>
    ---
    ```

  ### 4. `plan-with-ralph` skill

  - When `--from-brainstorm <path>` is used: read the brainstorm's `overviewTaskId` and
    propagate it into the generated plan's YAML front-matter and into the staged
    feature-request.
  - When invoked without `--from-brainstorm`: prompt once for the `overviewTaskId` (or
    accept an explicit `--overview-task-id <id>` flag).

  ## Back-compat

  Existing PRDs in `.ralph/jobs/*/prd.json` predate this field. The Plan 01 sync
  currently falls back to `ralphOverrides` (hand-edited in `overview-data.js`) or
  slug-equality; `overviewTaskId` is a documented future match tier, not an active
  Plan 01 consumer yet. After the Ralph plugin writes the field, a small codexu sync
  follow-up should make `prd.overviewTaskId` / `group.json.overviewTaskId` /
  `brainstorm.json.overviewTaskId` the highest-confidence match before overrides.
  No automatic backfill — bookkeepers backfill manually as needed.

  Schema additions are non-breaking (new optional field).

  ## Out of scope

  - Backfill tooling — handled separately by the codexu workspace owner.
  - Validation of `overviewTaskId` against an external authority — the ralph plugin doesn't
    know about overview-data.js; if a bookkeeper sets a value that doesn't match any task,
    that's surfaced by the consumer (codexu sync `unmatched` log), not by Ralph.

  ## Acceptance criteria

  - [ ] `convert-to-ralph-prd` accepts `--overview-task-id <id>` and writes to `prd.json`.
  - [ ] `decompose-plan` propagates the field into member PRDs + group.json.
  - [ ] `brainstorm-with-ralph` Phase 5 prompts for and writes the field to `brainstorm.json`
    + `selected-direction.md` front-matter.
  - [ ] `plan-with-ralph --from-brainstorm` propagates the field forward.
  - [ ] `schemas/prd-schema.json`, `schemas/group-schema.json`, and any brainstorm schema
    include the new field as optional.
  - [ ] Existing PRDs without the field continue to work (the field is optional everywhere).

  ## Tests

  - End-to-end run of `convert-to-ralph-prd --overview-task-id foo` produces a PRD with
    `overviewTaskId: 'foo'`.
  - End-to-end run of `/decompose-plan` on a parent plan with `overviewTaskId: foo` produces
    member PRDs all carrying the same value, and a `group.json` carrying it at top level.
  - End-to-end run of `/brainstorm-with-ralph` with the new prompt writes the field to all
    finalized artifacts.
  - End-to-end run of `/plan-with-ralph --from-brainstorm <dir>` where `<dir>` has the
    field set propagates it into the generated plan's front-matter.

  ## How to pick this up

  In the ralph-orchestration plugin source tree at `D:\ai-developer-toolkit\plugins\ralph\`,
  run:

  ```
  /plan-with-ralph --improve D:\harness-efforts\codexu\plans\ralph-overview-task-id.md
  ```

  The improvement cycle will research the four target skills in the plugin and produce a
  concrete implementation plan. Then `/implement-with-ralph --from-plan ...` ships the
  patches as a single Ralph cycle.
  ```

### To modify

None. This plan is purely additive — a new doc.

### Read for reference

- `C:\Users\evmitran\.claude\plugins\cache\ai-developer-toolkit\ralph-orchestration\5.30.0\skills\convert-to-ralph-prd\SKILL.md`
- `C:\Users\evmitran\.claude\plugins\cache\ai-developer-toolkit\ralph-orchestration\5.30.0\skills\decompose-plan\SKILL.md`
- `C:\Users\evmitran\.claude\plugins\cache\ai-developer-toolkit\ralph-orchestration\5.30.0\skills\brainstorm-with-ralph\SKILL.md`
- `C:\Users\evmitran\.claude\plugins\cache\ai-developer-toolkit\ralph-orchestration\5.30.0\skills\plan-with-ralph\SKILL.md`
- `C:\Users\evmitran\.claude\plugins\cache\ai-developer-toolkit\ralph-orchestration\5.30.0\schemas\prd-schema.json`
- `C:\Users\evmitran\.claude\plugins\cache\ai-developer-toolkit\ralph-orchestration\5.30.0\schemas\group-schema.json`

## Implementation strategy

This plan has exactly one deliverable: write `plans/ralph-overview-task-id.md`. The content above is the suggested template; the implementing agent should refine wording, add anything specific about the current ralph-orchestration v5.30.0 internals that affects the patches, and confirm the schema field names don't clash with anything Ralph already uses.

## Acceptance criteria

- [ ] `plans/ralph-overview-task-id.md` exists.
- [ ] The doc has the 6 sections: Context, Patches required (subsections 1-4), Back-compat, Out of scope, Acceptance criteria, Tests, How to pick this up.
- [ ] The doc references the codexu-side consumer plan (`ralph-pipeline-01-foundation.md`) so a future agent reading it understands the linkage.
- [ ] The doc names the exact ralph-orchestration version it was written against (e.g. v5.30.0) so version drift is detectable.

- [ ] **Refresh downstream plans + INDEX.** After all other criteria pass, audit (a) the plans listed in this plan's "Hand-off" section and (b) `plans/ralph-pipeline-INDEX.md` for any references to this plan's output (the handoff doc filename, the schema field name `overviewTaskId`, version pins). Update if any diverged. Apply updates atomically in the final implementation commit.

## Verification

A. **Doc readable:** open `plans/ralph-overview-task-id.md` and confirm the 6 sections are present.

B. **Cross-reference:** the doc mentions both `plans/ralph-pipeline-01-foundation.md` (the consumer plan) and `glistening-wondering-llama.md` (the comprehensive plan).

C. **Schema names checked:** the doc proposes `overviewTaskId` (camelCase, matching `OverviewTask.id` casing conventions in TS). Confirm no existing PRD field uses that name.

D. **Handoff command:** the doc includes the verbatim command for the future Ralph upgrade cycle: `/plan-with-ralph --improve D:\harness-efforts\codexu\plans\ralph-overview-task-id.md` (run from the Ralph plugin source tree).

## Common mistakes / confusion points

1. **This plan ships a DOC, not patches.** The doc is the handoff. Don't try to patch ralph-orchestration in this plan — that's a separate cycle in a different repo.
2. **The field name `overviewTaskId` is a contract.** Plans 01 and the doc use the same name. If the implementing agent for the Ralph patches changes the name, Plan 01's sync script needs a matching update. Pin the name in this doc.
3. **Optional field, never required.** The Ralph plugin patches MUST treat `overviewTaskId` as optional everywhere (schema, prompts, default). Existing PRDs without the field continue working. The plan must explicitly say this; otherwise the Ralph implementing agent may make it required and break legacy jobs.
4. **No automatic backfill.** Don't propose writing `overviewTaskId` into existing PRDs via a Ralph-side migration. Backfilling is a codexu-side decision (manual or via a follow-up script).
5. **Schema files live under ralph-orchestration's tree.** Update `schemas/prd-schema.json` etc. in `D:\ai-developer-toolkit\plugins\ralph\schemas/`, not in the cached plugin install at `C:\Users\evmitran\.claude\plugins\cache\...`. The plugin gets re-installed from source.

## Hand-off

After this plan ships (the doc exists in `plans/`), the user (or an agent) runs the documented command in the ralph-orchestration source tree. That cycle produces and ships the patches. Once the patches land in a new ralph-orchestration release, codexu should add the matching-tier follow-up described in the doc so `overviewTaskId` supersedes overrides and slug equality; until then the Plan 01 sync remains on the two implemented tiers.
