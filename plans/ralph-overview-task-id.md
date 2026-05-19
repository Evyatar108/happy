# Ralph plugin patches: add `overviewTaskId` across PRD, group, and brainstorm artifacts

> Researched against cached `ralph-orchestration` v5.32.0 at `C:/Users/evmitran/.claude/plugins/cache/ai-developer-toolkit/ralph-orchestration/5.32.0/`.
> The source tree at `D:/ai-developer-toolkit/plugins/ralph/` is v5.35.0. Before patching, reconcile drift between the cached facts below and current source.

## 1. Context

The codexu overview dashboard (`tools/overview-viewer/`) associates Ralph artifacts with `OverviewTask.id` entries from `plans/overview-data.js`. Today that association relies on `ralphOverrides` and slug equality. A first-class `overviewTaskId` field gives new Ralph artifacts a direct, high-confidence match key.

This document is the handoff spec for a future Ralph plugin patch cycle. It does not patch the plugin from this repo. Run the future patch cycle from the Ralph plugin source tree at `D:/ai-developer-toolkit/plugins/ralph/`.

Consumer-side context:

- `plans/ralph-pipeline-01-foundation.md` defines the overview matching tiers and reserves `overviewTaskId` as the future highest-confidence producer field.
- `C:/Users/evmitran/.claude/plans/glistening-wondering-llama.md` is the comprehensive plan that introduced the Ralph pipeline state dashboard.
- `tools/overview-viewer/src/types.ts` already reserves `matchSource?: 'overviewTaskId' | 'override' | 'slug-default'`, so the consumer model anticipates this field even before the Ralph producer writes it.

Field contract:

- Name: `overviewTaskId` exactly, camelCase.
- Type: string or null.
- Scope: top-level field on PRD, group, and brainstorm artifacts, plus whatever plan metadata format is selected in Section 6.1.
- Optional everywhere. Do not add it to any `required` array.
- No existing top-level property in cached v5.32.0 `prd-schema.json` or `group-schema.json` collides with `overviewTaskId`.

## 2. Ralph internals checked

Checked against cached `ralph-orchestration` v5.32.0, with source-tree v5.35.0 noted for drift reconciliation:

- Target skills exist in both cache and source: `skills/convert-to-ralph-prd/SKILL.md`, `skills/decompose-plan/SKILL.md`, `skills/brainstorm-with-ralph/SKILL.md`, and `skills/plan-with-ralph/SKILL.md`.
- `schemas/prd-schema.json` has top-level `additionalProperties: true` and required fields `project`, `userStories`, `jobDir`, and `repoDir`.
- `schemas/group-schema.json` has required fields `name` and `jobs`; it does not set `additionalProperties: false`, so JSON Schema default behavior is permissive.
- Neither schema currently contains `overviewTaskId`, so there is no property collision.
- No `brainstorm-schema.json` file exists. Brainstorm artifact shape is documented inline in `skills/brainstorm-with-ralph/SKILL.md`; update that inline JSON example instead of searching for a schema file.
- Existing CLI flag style is kebab-case, so `--overview-task-id` matches plugin conventions.
- `plan-with-ralph --from-brainstorm` currently stages `selected-direction.md` as raw markdown. Metadata extraction from YAML front-matter would be new behavior.
- `implement-with-ralph` Phase 0 validates that the first non-parsed plan header starts with `# Implementation Plan:`. See Section 6.1 before choosing a plan metadata format.
- `decompose-plan` calls `convert-to-ralph-prd --batch` for member PRDs. Propagate `--overview-task-id` through that call rather than rewriting PRDs after creation.
- `lib/atomic_update_group.sh` is the safe update path for `group.json`; use it for the new group field.
- `tests/test-no-prohibited-changes.sh` guards schema changes and must be updated to allow this field.

## 3. Patches required

### 3.1 `convert-to-ralph-prd`

Patch site: `skills/convert-to-ralph-prd/SKILL.md`, with schema update in `schemas/prd-schema.json`.

CLI and prompt behavior:

- Add `--overview-task-id <id>` for both batch and interactive modes.
- Treat `--overview-task-id` as canonical. If it is present, use it without lookup or prompt.
- If the flag is absent in interactive mode, prompt for a free-form string and offer skip/null. Free-form prompt is the default behavior in any repo.
- Any consumer-config-driven lookup, such as reading task IDs from a path that eventually resolves to `plans/overview-data.js`, must be opt-in. For example, a future plugin patch may read `.ralph/overview-config.json` or another consumer-defined config that points at a task-ID source. If that config is absent, unreadable, invalid, or the referenced file is missing, fall back to the free-form prompt. Lookup must not block PRD creation.
- Do not hardcode `<repo_root>/plans/overview-data.js`; that file is codexu-specific and Ralph must stay project-agnostic.

Write location:

- Write `overviewTaskId` as a top-level field in `prd.json` with a string value or null.
- In batch mode, thread the provided value directly into the generated PRD.
- In interactive mode, write null when the user skips.

Schema directive:

- Update `schemas/prd-schema.json` top-level `properties` with:

```json
"overviewTaskId": { "type": ["string", "null"] }
```

- Do not add `overviewTaskId` to `required`.

### 3.2 `decompose-plan`

Patch site: `skills/decompose-plan/SKILL.md`, with schema update in `schemas/group-schema.json`.

CLI behavior and precedence:

1. Explicit `--overview-task-id <id>` CLI flag.
2. Parent plan metadata.
3. Parent `prd.json` top-level `overviewTaskId`.

The CLI flag must be first so users can intentionally override stale embedded metadata.

Write locations:

- Pass `--overview-task-id <id>` into each member `convert-to-ralph-prd --batch ...` invocation so member PRDs carry the field natively.
- Write `overviewTaskId` as a top-level field on `group.json` with a string value or null.
- Use `lib/atomic_update_group.sh` for the `group.json` mutation.

Schema directive:

- Update `schemas/group-schema.json` top-level `properties` with:

```json
"overviewTaskId": { "type": ["string", "null"] }
```

- Do not add `overviewTaskId` to `required`.

### 3.3 `brainstorm-with-ralph`

Patch site: `skills/brainstorm-with-ralph/SKILL.md`.

CLI and prompt behavior:

- Add `--overview-task-id <id>` or, at minimum, prompt for `overviewTaskId` during finalize. Prefer supporting both so non-interactive and interactive flows are symmetrical.
- The prompt may be a free-form string with skip/null. Any consumer task-ID suggestion list must follow the same opt-in config rule as Section 3.1.

Write locations:

- Write `overviewTaskId` as a top-level field in `brainstorm.json` with a string value or null.
- Add metadata to `selected-direction.md` so `plan-with-ralph --from-brainstorm` can propagate the value. If YAML front-matter is selected in Section 6.1, write:

```yaml
---
overviewTaskId: <id>
---
```

- Place the metadata before the existing selected-direction content. If the Section 6.1 decision chooses a non-front-matter format, use that same format here instead.

Artifact example directive:

- There is no `brainstorm-schema.json`. Update the inline JSON example in `skills/brainstorm-with-ralph/SKILL.md` Phase 3 to include top-level `overviewTaskId`.
- Do not mark it required in prose or examples.

### 3.4 `plan-with-ralph`

Patch site: `skills/plan-with-ralph/SKILL.md`.

CLI and prompt behavior:

- Add `--overview-task-id <id>`.
- When invoked without `--from-brainstorm`, prompt once for a free-form `overviewTaskId` in interactive mode, with skip/null. The CLI flag wins if present.
- When invoked with `--from-brainstorm`, extract `overviewTaskId` from the selected brainstorm artifact unless the CLI flag overrides it.

Read and write locations:

- For `--from-brainstorm <path>`, read `selected-direction.md` metadata first, then fall back to sibling `brainstorm.json` if metadata is absent or unparsable.
- Propagate the resolved value into the generated `plan.md` metadata contract selected in Section 6.1.
- Preserve or include the value in staged `feature-request.txt` so later planning phases can see the same context.

Parser directive:

- YAML parsing must be specified in a tool-agnostic way: use any shell-portable YAML front-matter parser, such as `yq` if added to plugin prerequisites; otherwise use a `sed`/`awk` extractor over the front-matter block. The future Ralph patch cycle decides the implementation.
- No schema change is required for `plan-with-ralph` because it writes markdown artifacts, not a JSON schema-owned artifact.

### 3.5 Conditional `implement-with-ralph` Phase 0 patch

Patch site: `skills/implement-with-ralph/SKILL.md` Phase 0.

This is a conditional fifth patch site. It is required only if the future cycle selects Section 6.1 resolution A: YAML front-matter on `plan.md`. In that case, patch Phase 0 so the first-line check skips a leading YAML front-matter block before requiring `# Implementation Plan:`.

If the future cycle selects Section 6.1 resolution B, do not patch `implement-with-ralph`; instead, use a non-front-matter metadata block that preserves the existing first line.

## 4. Back-compat

Existing Ralph artifacts must continue to work unchanged:

- `overviewTaskId` is optional everywhere and must not be added to any `required` array.
- Existing PRDs without the field remain valid because Ralph's runtime validation is hand-coded around known required fields, and the cached PRD schema is permissive.
- Existing group files without the field remain valid because the group schema does not prohibit additional properties and the field is optional.
- Existing brainstorm artifacts without the field remain valid because there is no brainstorm schema file and consumers must treat missing metadata as null.
- Existing codexu matching continues to use overrides and slug equality until a separate consumer-side patch promotes `overviewTaskId` to the highest-confidence match tier.

No automatic backfill belongs in the Ralph plugin patch. Backfilling old codexu artifacts is a workspace bookkeeping decision and should happen separately, manually or with a small codexu-owned script.

## 5. Out of scope

- Editing Ralph plugin source from this codexu worktree.
- Backfilling old `.ralph/jobs/*/prd.json`, `.ralph/job-groups/*/group.json`, or `.ralph/brainstorms/*/brainstorm.json` artifacts.
- Validating `overviewTaskId` against codexu `plans/overview-data.js` inside the Ralph plugin.
- Adding codexu consumer matching for `overviewTaskId`; that is a follow-up after Ralph writes the field.
- Changing the overview dashboard UI.
- Adding a mandatory dependency on `yq` unless the future patch cycle explicitly chooses it and updates plugin prerequisites.

## 6. Critical compatibility gotchas

### 6.1 `implement-with-ralph` Phase 0 first-line check

`skills/implement-with-ralph/SKILL.md` Phase 0 requires `--from-plan` input to start with `# Implementation Plan:`. Naively prepending YAML front-matter to `plan.md` breaks that first-line check.

The future Ralph patch cycle must choose one valid resolution before landing any of the four skill patches:

- A. Patch `implement-with-ralph` Phase 0 to skip leading YAML front-matter before applying the first-line check. Use any shell-portable YAML front-matter parser, such as `yq` if added to plugin prerequisites; otherwise use a `sed`/`awk` extractor over the front-matter block. The future Ralph patch cycle decides.
- B. Use a non-front-matter metadata block for `plan.md`, such as an HTML comment (`<!-- ralph-meta {"overviewTaskId":"..."} -->`) or a dedicated metadata section after the required first line.

Do not silently pick a metadata format that breaks `/implement-with-ralph --from-plan`.

### 6.2 `tests/test-no-prohibited-changes.sh`

`tests/test-no-prohibited-changes.sh` currently guards schema changes. Because this patch intentionally edits `schemas/prd-schema.json` and `schemas/group-schema.json`, update the test to whitelist the new `overviewTaskId` schema property and keep the guard effective for unrelated schema drift.

### 6.3 Cache-vs-source dance

The installed cache at `~/.claude/plugins/cache/ai-developer-toolkit/ralph-orchestration/...` is a downstream copy. Patch the source tree at `D:/ai-developer-toolkit/plugins/ralph/`, then invalidate the relevant `~/.claude/plugins/cache/...` copy before integration testing so Claude Code runs the patched plugin rather than stale cached files.

## 7. Suggested landing order

Prerequisite: settle the Section 6.1 metadata-format decision before any of the four skill patches land, because it determines the contract that `decompose-plan` and `plan-with-ralph` both write/read.

Recommended sequence:

1. `convert-to-ralph-prd`: add canonical `--overview-task-id`, write PRD field, update `prd-schema.json`, and whitelist the schema guard.
2. `brainstorm-with-ralph`: write brainstorm field and selected-direction metadata using the chosen metadata format.
3. `plan-with-ralph`: read brainstorm metadata and write plan metadata using the same chosen format.
4. `decompose-plan`: read plan/PRD metadata by precedence, write group field, and thread `--overview-task-id` into member PRD generation.
5. Conditional `implement-with-ralph`: land this before steps 2-4 only if Section 6.1 resolution A is selected.

## 8. Acceptance criteria

For the future Ralph plugin patch cycle:

- `convert-to-ralph-prd --overview-task-id <id>` writes top-level `prd.json.overviewTaskId` and leaves the field absent or null when skipped.
- Interactive `convert-to-ralph-prd` allows a free-form value and never requires consumer config to create a PRD.
- `schemas/prd-schema.json` documents optional `overviewTaskId` and does not add it to `required`.
- `brainstorm-with-ralph --overview-task-id <id>` or its finalize prompt writes top-level `brainstorm.json.overviewTaskId` and selected-direction metadata.
- `plan-with-ralph --from-brainstorm <path>` propagates the brainstorm `overviewTaskId` into plan metadata, unless an explicit `--overview-task-id` flag overrides it.
- `decompose-plan --overview-task-id <id>` writes top-level `group.json.overviewTaskId` and passes the same value to generated member PRDs.
- `decompose-plan` precedence is exactly: CLI flag, parent plan metadata, parent `prd.json`.
- `schemas/group-schema.json` documents optional `overviewTaskId` and does not add it to `required`.
- `tests/test-no-prohibited-changes.sh` permits this one intentional schema-field addition and still catches unrelated prohibited schema changes.
- Existing artifacts without `overviewTaskId` still pass the plugin's PRD/group validation and implementation flows.

## 9. Tests

Recommended tests for the future Ralph plugin patch cycle:

- Unit or shell test: `convert-to-ralph-prd --batch --overview-task-id foo ...` produces a `prd.json` whose top-level `overviewTaskId` is `foo`.
- Unit or shell test: `convert-to-ralph-prd` without the flag and without consumer config can still create a PRD with `overviewTaskId` absent or null.
- Schema test: `prd-schema.json` and `group-schema.json` include `overviewTaskId` in `properties` but not in `required`.
- Guard test: `tests/test-no-prohibited-changes.sh` passes with the new whitelisted field and fails for an unrelated schema-property addition.
- Brainstorm test: finalize with `overviewTaskId=foo` writes `brainstorm.json` and selected-direction metadata.
- Plan test: `/plan-with-ralph --from-brainstorm <dir>` reads `foo` from selected-direction metadata or sibling `brainstorm.json` and writes it into the generated plan metadata.
- Decompose test: a parent plan with `overviewTaskId=parent` creates `group.json.overviewTaskId=parent` and member PRDs with the same value.
- Precedence test: `decompose-plan --overview-task-id cli` overrides conflicting parent plan metadata and parent `prd.json` values.
- Compatibility test: `/implement-with-ralph --from-plan <plan.md>` still accepts generated plans after the Section 6.1 metadata-format decision.

## 10. How to pick this up

From the Ralph plugin source tree:

```text
cd D:\ai-developer-toolkit\plugins\ralph
/plan-with-ralph --improve D:\harness-efforts\codexu\plans\ralph-overview-task-id.md
```

Before running integration tests, invalidate the plugin cache under `~/.claude/plugins/cache/ai-developer-toolkit/ralph-orchestration/` so the test session uses the patched source output rather than the cached v5.32.0 copy.
