# Plan 01 — Foundation: schema, sync core, one-shot sync, sidecar emit

**Worktree:** main checkout at `D:\harness-efforts\codexu`. No separate worktree.

**Position in DAG:** root. No dependencies. Enables 02, 03, 05, 10.

## Context

The codexu overview dashboard (`tools/overview-viewer/`) and its data file (`plans/overview-data.js`) currently show static per-task metadata but have no representation of where in the Ralph pipeline (`/brainstorm-with-ralph` → `/plan-with-ralph` → `/implement-with-ralph`) each task currently sits. That state already exists on disk in `.ralph/jobs/*/job-state.json`, `.ralph/job-groups/*/group.json`, and `.ralph/brainstorms/*/brainstorm.json` but isn't surfaced anywhere consumable.

This plan introduces the *foundation* for surfacing Ralph pipeline state: the type model, a stage-derivation predicate function, a one-shot sync script that walks `.ralph/`, and a sidecar data file (`plans/overview-ralph-state.{js,json}`) that future stages will consume. After this plan ships, you can run `pnpm sync-ralph-state` and inspect the sidecar by hand, but nothing in the React UI changes yet.

## Dependencies

None. Root of the DAG.

## Scope

**In scope:**
- New TypeScript types in `tools/overview-viewer/src/types.ts`.
- New `scripts/lib/derive-ralph-stage.mjs` pure ESM module (single source of truth for the predicate).
- New `scripts/lib/sync-core.mjs` containing the walk + derivation + atomic write logic.
- New `scripts/sync-ralph-state.mjs` CLI wrapper (one-shot mode only — `--watch` ships in Plan 02).
- Generated sidecar files: `plans/overview-ralph-state.js` AND `plans/overview-ralph-state.json` (dual emit from a single in-memory state).
- Slug-heuristic matching with optional `ralphOverrides` map in `overview-data.js`.
- npm script `sync-ralph-state` in root `package.json`.
- Stderr-only reporting for unmatched Ralph artifacts.
- One-shot sync test that round-trips a synthetic `job-state.json` → expected `RalphStage`.

**Out of scope (other plans):**
- Continuous watcher / debounce / incremental processing → Plan 02
- React UI / chip rendering / filter axis / Vite plugin integration → Plan 03 + 04
- Aggregated snapshot / activity tail / JSON Schema / tasks/INDEX.md → Plan 05
- Skills (`/work-on`, `/triage`, etc.) and `deriveNextCommand` → Plan 06
- Context surfaces (notepad, journal, PR backlinks, RecentActivity) → Plan 07
- Crews session tracking (`CrewSessionRef`, `--via-crew` mode) → Plan 08
- MCP server → Plan 09
- Ralph plugin patches (`overviewTaskId` schema fields) → Plan 10

## Configuration layer (added 2026-05-18 — generalization for plugin extraction)

The sync, watcher, and downstream code paths read from a single config resolver so the system can be extracted as a reusable plugin for other projects without code edits. All paths and command names are config-driven; codexu defaults match the existing repo layout.

**Config location:** under `.ralph/` (the Ralph-plugin state directory). The overview is a Ralph-adjacent tool — its config lives alongside Ralph's own state. This is distinct from `.claude/` (Claude Code's config — used for `settings.local.json` and repo-local skills) and `.crews/` (crews-plugin state).

**Config file:** `<repoRoot>/.ralph/overview-config.json` (committed; optional — defaults apply when absent). Override per-machine via `<repoRoot>/.ralph/overview-config.local.json` (merged on top; gitignored).

**Namespace coexistence with Ralph plugin state:** the Ralph plugin owns `.ralph/jobs/`, `.ralph/job-groups/`, `.ralph/brainstorms/`, `.ralph/telemetry/`. Files at the top level of `.ralph/` (like `.ralph/overview-config.json`) are not owned by Ralph and don't conflict with its conventions. The Ralph plugin's `path-utils.sh` resolves jobs/brainstorms-bases inside `.ralph/`; it doesn't touch sibling top-level files. Document this in the config file's header comment to prevent any future confusion.

**Schema (with codexu defaults):**

```jsonc
{
    "$schema": "./overview-config.schema.json",
    "dataFile": "plans/overview-data.js",                       // hand-curated source
    "outputs": {
        "sidecarJs":        "plans/overview-ralph-state.js",
        "sidecarJson":      "plans/overview-ralph-state.json",
        "dataJson":         "plans/overview-data.json",         // Plan 05
        "snapshot":         "plans/overview-snapshot.json",     // Plan 05
        "activity":         "plans/overview-activity.jsonl",    // Plan 05
        "schema":           "plans/overview-snapshot.schema.json", // Plan 05
        "recommendations":  "plans/overview-recommendations.json", // Plan 04
        "dependencyGraph":  "plans/overview-dependency-graph.json", // Plan 04
        "tasksIndex":       "tasks/INDEX.md",                   // Plan 05
        "journalDir":       "tasks"                             // Plan 07 (per-task journal lives under <journalDir>/<id>/journal.md)
    },
    "lockFile": "plans/.overview-ralph-state.lock",
    "ralphRoot": ".ralph",                                     // walked for Ralph state
    "crewsRoot": ".crews",                                     // walked for crew sessions (Plan 08)
    "watcher": {
        "debounceMs": 2000,
        "ignored": [".worktrees/**", "**/.git/**", ".ralph/jobs/*/worktree/**", ".ralph/jobs/.staging/**", ".ralph/telemetry/**", ".crews/logs/**", ".crews/spawn-launchers/**"]
    },
    "devServer": {                                             // Plan 11
        "command": "pnpm",
        "args": ["overview"],
        "readyRegex": "^\\s*Local:\\s+(\\S+)",
        "readyTimeoutMs": 60000
    },
    "build": {                                                 // Plan 11
        "command": "pnpm",
        "args": ["overview:build"],
        "outputPath": "plans/overview.html",
        "maxBytes": 512000
    },
    "filters": {                                               // Plan 03 — controls toolbar chip groups
        "workstream": "auto-derive",                           // "auto-derive" reads unique values from data.workstream;
        "scope": "auto-derive"                                 //   or pass an explicit array of { value, label }
    }
}
```

**Resolver module: `scripts/lib/resolve-config.mjs`**

```js
// signature:
// loadConfig({ repoRoot }) -> ResolvedConfig
//   - Reads .ralph/overview-config.json (if present), merges with built-in defaults.
//   - Reads .ralph/overview-config.local.json (if present), merges on top.
//   - Resolves all paths to absolute paths against repoRoot.
//   - Returns the fully-resolved object frozen via Object.freeze.
```

ALL paths downstream (in `sync-core.mjs`, `watch-ralph-state.mjs`, `derive-ralph-stage.mjs`, MCP server, etc.) are read from the resolved config. The only callsite that hardcodes a path is `loadConfig` itself, which looks for `<repoRoot>/.ralph/overview-config.json` — and even that is overridable via the `OVERVIEW_CONFIG_PATH` environment variable for testing.

**JSON Schema:** emit `<repoRoot>/.ralph/overview-config.schema.json` as a generated artifact (hand-written in this plan; could be type-generated later). Documents every field with descriptions.

This makes the system **codexu-default but project-agnostic.** A future plugin extraction (Plan 12) ships the same code unchanged; consumers override the config to point at their layout.

## Files

### To create

- **`tools/overview-viewer/src/types.ts`** (modify, see "To modify") — add the type exports listed under "Type model" below.
- **`scripts/lib/resolve-config.mjs`** — the config resolver above.
- **`scripts/lib/default-config.mjs`** — the codexu-default config object exported as a constant. Imported by `resolve-config.mjs`; useful for tests and for the schema documentation.
- **`.ralph/overview-config.schema.json`** — JSON Schema describing the config shape. Hand-written; matches `default-config.mjs` field-for-field.
- **`.ralph/overview-config.json`** — committed config file with codexu defaults (initially identical to `default-config.mjs` — present so the schema validates the actual deployment). Bookkeepers edit this to change paths.
- **`scripts/lib/derive-ralph-stage.mjs`** — pure ESM module exporting `deriveRalphStage(jobState, prd, groupState, brainstormJson) -> RalphStage`. Implements the predicate table from "Stage derivation" below. Single source of truth; never duplicated elsewhere.
- **`scripts/lib/sync-core.mjs`** — exports `walkRalphState({ repoRoot }) -> Promise<OverviewRalphState>` (one full walk) and `writeSidecar({ repoRoot, state }) -> Promise<void>` (atomic tmp + rename of both `.js` and `.json`). Internally calls `deriveRalphStage` for each slug.
- **`scripts/sync-ralph-state.mjs`** — CLI wrapper. Parses `--repo <path>` (default: cwd from `git rev-parse --show-toplevel`). One-shot mode only in this plan: invoke `walkRalphState` → `writeSidecar`, log unmatched to stderr, exit 0 on success / 1 on hard errors.
- **`plans/overview-ralph-state.js`** — first commit can contain `window.OVERVIEW_RALPH_STATE = { generatedAt: "...", generatedFromCommit: "...", byTaskId: {}, unmatched: [], unmatchedSummary: {} };` as bootstrap. Subsequent runs overwrite.
- **`plans/overview-ralph-state.json`** — JSON twin, identical inner shape minus the `window.OVERVIEW_RALPH_STATE = ` wrapper.
- **`tools/overview-viewer/src/__tests__/ralphStage.test.ts`** — unit test importing `scripts/lib/derive-ralph-stage.mjs` and round-tripping one synthetic input per `RalphStage` value (9 cases). Resolve the import via relative path (`../../../../scripts/lib/derive-ralph-stage.mjs`) or via a workspace alias if one exists; do NOT publish the script as an npm package.

### To modify

- **`tools/overview-viewer/src/types.ts`** — add the following exports (full text in "Type model" below):
  - `type RalphStage`
  - `type RalphEntryPath`
  - `interface RalphArtifacts`
  - `interface RalphPipelineState`
  - `interface OverviewRalphState`
  - `function getOverviewRalphState(): OverviewRalphState`
  - Extend `OverviewData` with `ralphOverrides?: Record<string, string>` (the hand-curated slug→taskId override map). Do NOT add `ralph` directly to `OverviewTask` — it lives in `OverviewRalphState.byTaskId`.
- **`package.json` (root)** — add `"sync-ralph-state": "node scripts/sync-ralph-state.mjs"` to the `scripts` block, ordered alphabetically or after `overview:build:preview`.

### Read for reference (do not modify)

- `C:\Users\evmitran\.claude\plugins\cache\ai-developer-toolkit\ralph-orchestration\5.30.0\schemas\job-state-schema.json` — authoritative schema for `orchestrator.{phase, terminal, terminalReason, review.{code,docs}, hasPrdWorthy}`, `status`, `storyCompletion`.
- `C:\Users\evmitran\.claude\plugins\cache\ai-developer-toolkit\ralph-orchestration\5.30.0\schemas\prd-schema.json` — for `branch.name`, `worktree.path`, `userStories[].{passes, blocked, dependencies}`, `group`.
- `C:\Users\evmitran\.claude\plugins\cache\ai-developer-toolkit\ralph-orchestration\5.30.0\schemas\group-schema.json` — for `status`, `lastPhase`, `integrationBranch`, `members[]`, `prUrl`.
- `C:\Users\evmitran\.claude\plugins\cache\ai-developer-toolkit\ralph-orchestration\5.30.0\schemas\review-findings-schema.json` — for `findings[].{status, severity, classification}`.
- `D:\harness-efforts\codexu\plans\overview-data.js` — the existing hand-curated data file. NEVER modified by the sync script. The slug-heuristic matching reads `OverviewTask.id` from this file; the optional `ralphOverrides` map (when present) lives at the top level alongside `tasks[]`.
- `D:\harness-efforts\codexu\tools\overview-viewer\CLAUDE.md` — load-bearing invariants for the renderer package. "Data file is hand-curated" is the rule preserved by this plan.
- `C:\Users\evmitran\.claude\plugins\cache\ai-developer-toolkit\ralph-orchestration\5.30.0\lib\sync_job_statuses.sh` — existing per-group reconciliation script; useful pattern reference for stale-RUNNING detection (~60min mtime), atomic state updates, and roll-up rules. The new sync uses ESM not bash but mirrors the conceptual flow.
- `C:\Users\evmitran\.claude\plans\glistening-wondering-llama.md` — full design rationale. Treat as tie-breaker for ambiguities not covered here.

## Type model

Append to `tools/overview-viewer/src/types.ts`:

```ts
export type RalphStage =
    | 'brainstorming'        // .ralph/brainstorms/<n>/ exists; brainstorm.json.recommendedDirection absent
    | 'brainstorm-ready'     // brainstorm.json.recommendedDirection set; no matching jobDir yet
    | 'planning'             // .ralph/jobs/<n>/ exists; prd.json absent
    | 'plan-ready'           // prd.json present; job-state.json absent
    | 'implementing'         // orchestrator.phase absent/numeric ≤ 4; terminal=false
    | 'reviewing'            // orchestrator.phase ∈ {5a, 5b, 5.5, 6}; terminal=false; (no findings file OR all reviewOpenCount.* === 0)
    | 'review-fix'           // orchestrator.phase ∈ {5a, 5b, 5.5, 6}; terminal=false; ≥1 open Medium+ finding
    | 'shipped'              // orchestrator.terminal=true && terminalReason='complete'
    | 'blocked'              // orchestrator.terminal=true && terminalReason='blocked'; OR status='BLOCKED'

export type RalphEntryPath = 'brainstorm-first' | 'plan-direct' | 'manual-plan'

export interface RalphArtifacts {
    brainstormDir?: string
    planDraftFile?: string
    jobDir?: string
    groupDir?: string
    planFile?: string
    prdFile?: string
}

export interface RalphPipelineState {
    stage: RalphStage
    entryPath?: RalphEntryPath
    artifacts?: RalphArtifacts
    jobSlug?: string
    groupSlug?: string
    isParallel?: boolean
    matchSource?: 'overviewTaskId' | 'override' | 'slug-default'
    storyCompletion?: { total: number; passed: number; blocked: number; remaining: number }
    reviewOpenCount?: Record<string, number | undefined>
    hasPrdWorthy?: boolean
    terminalReason?: 'complete' | 'replan' | 'blocked'
    lastUpdatedAt?: string
    generatedAt?: string
}

export interface OverviewRalphState {
    generatedAt: string
    generatedFromCommit: string
    byTaskId: Record<string, RalphPipelineState>
    unmatched?: Array<{ kind: 'brainstorm' | 'job' | 'group'; slug: string; reason: string }>
    unmatchedSummary?: Record<string, number>
}

export function getOverviewRalphState(): OverviewRalphState {
    const w = typeof window === 'undefined' ? undefined : (window as { OVERVIEW_RALPH_STATE?: OverviewRalphState })
    return w?.OVERVIEW_RALPH_STATE ?? { generatedAt: '', generatedFromCommit: '', byTaskId: {} }
}
```

Extend `OverviewData`:

```ts
export interface OverviewData {
    // ...existing fields...
    ralphOverrides?: Record<string, string>     // slug → taskId, hand-edited by bookkeeper
}
```

**Critical type-design rule (Common Mistake from comprehensive plan):** `OverviewTask` does NOT carry `ralph`. The lookup is `ralphState.byTaskId[task.id]`. This preserves the separation between hand-curated `overview-data.js` and the generated sidecar.

Fields like `CrewSessionRef`, `deferredQuestionsCount`, `branchName`, `prUrl`, `mergeCommit`, `archivedAt` are deliberately NOT in this plan's `RalphPipelineState` — they're added by Plans 07 (context), 08 (crews) when those plans introduce the corresponding code.

## Stage derivation predicates

`scripts/lib/derive-ralph-stage.mjs` exports a single pure function:

```js
// signature:
// deriveRalphStage({ jobState?, prd?, groupState?, brainstormJson? }) -> RalphStage
```

Evaluate predicates in this order; first match wins:

| Order | Predicate | Stage |
|---|---|---|
| 1 | `jobState?.orchestrator?.terminal === true && jobState.orchestrator.terminalReason === 'complete'` | `shipped` |
| 2 | `jobState?.status === 'BLOCKED'` OR `(jobState?.orchestrator?.terminal === true && jobState.orchestrator.terminalReason === 'blocked')` | `blocked` |
| 3 | `jobState?.orchestrator?.phase` in `['5a','5b','5.5','6']` AND `jobState.orchestrator.terminal !== true` AND at least one of `reviewOpenCount.code > 0` or `reviewOpenCount.docs > 0` | `review-fix` |
| 4 | `jobState?.orchestrator?.phase` in `['5a','5b','5.5','6']` AND `jobState.orchestrator.terminal !== true` AND (no findings file written yet OR all `reviewOpenCount.* === 0`) | `reviewing` |
| 5 | `jobState` exists AND (orchestrator absent OR orchestrator.phase ∉ review phases) AND `terminal !== true` | `implementing` |
| 6 | `prd` exists AND `jobState` absent | `plan-ready` |
| 7 | `jobDir` exists AND `prd` absent | `planning` |
| 8 | `brainstormJson?.recommendedDirection` is set AND no matching jobDir exists for the same overviewTaskId | `brainstorm-ready` |
| 9 | `brainstormJson` exists AND `brainstormJson.recommendedDirection` is absent | `brainstorming` |

`reviewOpenCount` is computed from `<jobDir>/code-review-findings.json` and `<jobDir>/docs-review-findings.json`: count findings where `status === 'open' && severity ∈ {Critical, High, Medium}`. A missing findings file means `reviewOpenCount.<phase> === undefined` (NOT 0) — critical for distinguishing "reviewer hasn't run yet" from "reviewer ran and found nothing."

## Slug-heuristic matching with `ralphOverrides`

For each Ralph artifact discovered during the walk (job, group, brainstorm), resolve to an `OverviewTask.id` using:

1. **`ralphOverrides[slug]` if defined** — match source `'override'`, highest confidence
2. **`OverviewTask.id === slug` (default slug equality)** — match source `'slug-default'`
3. **No match** — push to `unmatched[]` with `reason: 'no-matching-task-id'`

(`overviewTaskId` field in Ralph artifacts is NOT consumed here — that's Plan 10's work. When it ships, predicate 1 becomes `artifact.overviewTaskId` and the override map shrinks to exceptions only.)

If one taskId resolves to multiple Ralph artifacts (e.g. two jobs share a slug), pick the most recently updated (`jobState.updatedAt`). Append the others to `unmatched[]` with `reason: 'duplicate-resolution'`.

## Implementation strategy

Ordered steps:

1. **Add types** to `tools/overview-viewer/src/types.ts`. Run `pnpm --filter @codexu/overview-viewer typecheck` — should still pass (additions only).
2. **Create config layer** — `scripts/lib/default-config.mjs`, `scripts/lib/resolve-config.mjs`, `.ralph/overview-config.schema.json`, `.ralph/overview-config.json` (with codexu defaults). Unit-test `resolve-config.mjs`: defaults applied when no file present, file content overrides defaults, `.local.json` overrides file, env var overrides path.
3. **Create `scripts/lib/derive-ralph-stage.mjs`** with the predicate table. Inline JSDoc; no external deps. Does NOT consume config (it's a pure predicate over already-loaded data structures).
4. **Create `scripts/lib/sync-core.mjs`** with `walkRalphState({ config, repoRoot })` and `writeSidecar({ config, repoRoot, state })`. Atomic write: write to `<file>.tmp` then `fs.renameSync(tmp, final)`. Walk:
   - `fs.readdirSync(<config.ralphRoot>/jobs)` with `withFileTypes: true`; skip symlinks; for each entry, attempt to read `job-state.json`, `prd.json`, `code-review-findings.json`, `docs-review-findings.json`.
   - Same for `<config.ralphRoot>/job-groups/` and `<config.ralphRoot>/brainstorms/`.
   - Skip paths matching any pattern in `config.watcher.ignored`. Walk root is exactly `<repoRoot>/<config.ralphRoot>/`.
5. **Create `scripts/sync-ralph-state.mjs`** CLI wrapper. Resolve repo root via `child_process.execFileSync('git', ['rev-parse', '--show-toplevel'])`. Call `loadConfig({ repoRoot })` first, then `walkRalphState({ config, repoRoot })`, then `writeSidecar({ config, repoRoot, state })`. Print unmatched to stderr.
5. **Add npm script** in root `package.json`.
6. **Bootstrap commit** of `plans/overview-ralph-state.{js,json}` with empty `byTaskId: {}` so the dev server doesn't 404 the file before the first sync runs (defensive; not strictly required since Plan 03 hasn't shipped the UI yet, but matches expected file presence).
7. **Create the unit test** at `tools/overview-viewer/src/__tests__/ralphStage.test.ts` — 9 cases, one per stage value.
8. **Run end-to-end**: `pnpm sync-ralph-state` against the current `.ralph/`. Inspect the generated sidecar by hand. Confirm `byTaskId` has entries for any jobs whose slug matches an `OverviewTask.id` (default slug-match). All other jobs land in `unmatched[]`.

## Acceptance criteria

- [ ] `scripts/lib/default-config.mjs`, `scripts/lib/resolve-config.mjs`, `.ralph/overview-config.schema.json`, `.ralph/overview-config.json` all exist. `loadConfig({ repoRoot })` returns the expected codexu defaults when no file is present, overrides when present, layers `.local.json` on top, honors `OVERVIEW_CONFIG_PATH` env var.
- [ ] `tools/overview-viewer/src/types.ts` exports `RalphStage`, `RalphEntryPath`, `RalphArtifacts`, `RalphPipelineState`, `OverviewRalphState`, `getOverviewRalphState`. `pnpm --filter @codexu/overview-viewer typecheck` passes.
- [ ] `tools/overview-viewer/src/types.ts` `OverviewData` interface includes `ralphOverrides?: Record<string, string>`.
- [ ] `scripts/lib/derive-ralph-stage.mjs` exports `deriveRalphStage` with the predicate order documented above.
- [ ] `scripts/lib/sync-core.mjs` exports `walkRalphState` and `writeSidecar`. The walk skips `.worktrees/*` and `**/.git/**`.
- [ ] `scripts/sync-ralph-state.mjs` runs end-to-end: `node scripts/sync-ralph-state.mjs` exits 0 from a clean checkout.
- [ ] `plans/overview-ralph-state.js` and `plans/overview-ralph-state.json` exist after the sync runs. The JS file is `window.OVERVIEW_RALPH_STATE = <JSON>;` where `<JSON>` parses to the exact content of the JSON file.
- [ ] `package.json` has `"sync-ralph-state": "node scripts/sync-ralph-state.mjs"`.
- [ ] `pnpm --filter @codexu/overview-viewer test` includes `ralphStage.test.ts` and it passes all 9 stage-derivation cases.
- [ ] Existing tests under `tools/overview-viewer/src/__tests__/` are NOT modified — this plan's additions are signature-preserving and snapshot-stable for all existing test surfaces.

- [ ] **Refresh downstream plans + INDEX.** After all other criteria pass, audit (a) the plans listed in this plan's "Hand-off to next plans" section and (b) `plans/ralph-pipeline-INDEX.md`'s "Source-of-truth modules" table and DAG diagram. Update any stale references — file paths, type signatures, function/export names, behavior contracts, module dependencies — that diverged from this plan's actual implementation. Apply updates atomically in the final implementation commit; in the commit message, list each diff (which file, which lines, what changed) so reviewers can verify the cascade.

## Verification

Run from `D:\harness-efforts\codexu`:

A. **Type check:** `pnpm --filter @codexu/overview-viewer typecheck` exits 0.

B. **Stage derivation tests:** `pnpm --filter @codexu/overview-viewer test src/__tests__/ralphStage.test.ts` — all 9 cases pass.

C. **One-shot sync:** `pnpm sync-ralph-state`. Confirm exit 0. `cat plans/overview-ralph-state.json | jq '.byTaskId | keys'` returns the expected matching task IDs. `cat plans/overview-ralph-state.json | jq '.unmatched | length'` shows how many Ralph artifacts have no matching `OverviewTask.id`.

D. **Idempotency:** run `pnpm sync-ralph-state` twice in a row. `diff <(jq -S 'del(.generatedAt)' plans/overview-ralph-state.json) <(...second run...)` is empty (atomic write + deterministic output ignoring timestamps).

E. **Slug-heuristic verification:** add `ralphOverrides: { "test-slug": "actual-task-id" }` to `overview-data.js` for one job whose slug differs from any task id. Re-run sync. Confirm `byTaskId["actual-task-id"]` now exists with `matchSource: 'override'`. Remove the override; re-run; the entry moves to `unmatched[]` with `reason: 'no-matching-task-id'`.

F. **JS+JSON consistency:** `node -e "require('./plans/overview-ralph-state.js'); console.log(JSON.stringify(globalThis.window?.OVERVIEW_RALPH_STATE ?? eval(require('fs').readFileSync('./plans/overview-ralph-state.js','utf8')).OVERVIEW_RALPH_STATE))"` (or simpler: parse both files and assert deep-equal). Both files agree on every byte of `byTaskId`, `unmatched`, `unmatchedSummary`, `generatedAt`, `generatedFromCommit`.

G. **No-`.ralph` graceful handling:** in a throwaway checkout with `.ralph/` removed, `pnpm sync-ralph-state` exits 0, writes a valid sidecar with `byTaskId: {}` and `unmatched: []`.

H. **Worktree exclusion:** if `.worktrees/<name>/.ralph/jobs/<test>/` exists, confirm the walk does NOT include it. Verify by `find` against the resolved walk paths.

## Common mistakes / confusion points

1. **Never write `overview-data.js` from this script.** The sync script reads `ralphOverrides` from it but writes ONLY the sidecar files. Hand-editing safety depends on this.
2. **Don't duplicate the predicate table.** `scripts/lib/derive-ralph-stage.mjs` is the single source of truth. Plan 02's watcher, Plan 05's snapshot generation, Plan 09's MCP server all import this module. If the predicate drifts in one consumer, the dashboard goes silently wrong.
3. **`reviewOpenCount.<phase>` is `undefined` not `0` when the findings file is missing.** The distinction is load-bearing for the `reviewing` vs `review-fix` predicate (line 3 vs 4 in the table). If you collapse undefined → 0, every task in Phase 5a/5b/6 with no findings file written yet will show `reviewing` even when it's about to flip to `review-fix`.
4. **Atomic write or nothing.** Always `<file>.tmp` then `fs.renameSync`. A torn write to `plans/overview-ralph-state.js` would crash the React app's eval. (This becomes critical in Plan 02 when the watcher writes concurrently with `pnpm overview`.)
5. **Walk root is exactly `<repoRoot>/.ralph/`.** Never recurse from `<repoRoot>` itself — that would hit `.worktrees/*/.ralph/` (worktree-local stale state), `.git/.ralph/` (impossible but defensive), or non-Ralph subdirs. Restrict the entry point.
6. **`OverviewTask` does NOT carry `ralph`.** New developers may try to add `ralph?: RalphPipelineState` to `OverviewTask`. Reject — the entire separation rests on the sidecar living in `OverviewRalphState.byTaskId`. The chip component in Plan 03 looks it up via `ralphState.byTaskId[task.id]`.

## Hand-off to next plans

After this plan ships:

- **Plan 02 — Watcher** can begin. It imports `scripts/lib/derive-ralph-stage.mjs` and `scripts/lib/sync-core.mjs` directly.
- **Plan 03 — UI chip** can begin. It imports `getOverviewRalphState()` from `types.ts` and the type model. No code-coupling to the sync script.
- **Plan 05 — Agent exports** can begin. It extends `scripts/lib/sync-core.mjs` to emit additional generated artifacts (snapshot, activity, etc.).
- **Plan 10 — Ralph plugin handoff doc** is fully independent of this plan; it documents future Ralph patches.

Plans 04, 06, 07, 08, 09 are blocked transitively on 03, 05, or 06; not directly on this plan.

The first commit after this plan ships should run `pnpm sync-ralph-state` and include the generated `plans/overview-ralph-state.{js,json}` files (initial state). Subsequent commits regenerate them.
