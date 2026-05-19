# Ralph Pipeline State — Plan Index

Decomposition of the comprehensive design at `C:\Users\evmitran\.claude\plans\glistening-wondering-llama.md` into 12 linearly-workable plans plus this index. Each plan declares its dependencies and is sized to ship as one focused feature.

The system is designed to be **project-agnostic from day one** — Plan 01 introduces a config-driven layer (`.ralph/overview-config.json` + `scripts/lib/resolve-config.mjs`) so all paths and command names are parameterizable. Codexu defaults match the existing repo layout; other Ralph-using projects override the config. Plan 12 covers the actual extraction into a reusable `ralph-overview` plugin in the `ai-developer-toolkit` plugin tree.

Config location is under `.ralph/` (Ralph plugin state directory) — the overview is a Ralph-adjacent tool. Files at the top level of `.ralph/` don't conflict with Ralph's own state (`.ralph/jobs/`, `.ralph/job-groups/`, `.ralph/brainstorms/`, `.ralph/telemetry/`). Claude Code's own config (`.claude/settings.local.json` for MCP registration; `.claude/skills/` for repo-local skills) stays under `.claude/` because Claude Code owns those locations by convention.

## Why split

The comprehensive plan covered: schema additions, a continuous file watcher, a sidecar data file, a React UI with stage chips and aggregate histograms, repo-local skills, an MCP server, crews-plugin session tracking, agent-readable exports, decision-support outputs, context-preservation surfaces, and a Ralph plugin handoff doc. As one PR that is ~1500+ lines of code touching 30+ files. Splitting into 10 stages lets each phase be:

- Verified independently (types compile, script runs, UI renders, etc.)
- Reverted in isolation if the design choice doesn't hold up
- Worked on linearly by a single agent loop per stage

## Dependency DAG

```
                           ┌───────────────────────────┐
                           │ 01-foundation             │
                           │ (types, config resolver,  │
                           │  sync core, stage         │
                           │  predicate, sidecars)     │
                           └──┬───────────────────┬────┘
                              │                   │
                ┌─────────────┘                   └──────────────┐
                ▼                                                ▼
        ┌─────────────────┐                              ┌──────────────────┐
        │ 02-watcher      │                              │ 03-ui-chip       │
        │ (chokidar +     │                              │ (RalphStageChip, │
        │  debounce +     │                              │  filter axis,    │
        │  incremental +  │                              │  Vite serve)     │
        │  lock + Vite    │                              └────┬─────────────┘
        │  auto-start)    │                                   │
        └─────────────────┘                                   ▼
                                                       ┌──────────────────┐
                                                       │ 04-pipeline-     │
                                                       │ overview         │
                                                       │ (histogram,      │
                                                       │  recommendations,│
                                                       │  dep graph)      │
                                                       └──────────────────┘

           ┌─────────────────────┐
           │ 05-agent-exports    │ ◄── depends on 01
           │ (JSON twin,         │
           │  snapshot, activity,│
           │  schema, INDEX.md)  │
           └──┬──────────────────┘
              │
              ├──────────────────┐
              ▼                  ▼
        ┌─────────────────┐  ┌──────────────────┐
        │ 06-skills       │  │ 07-context       │
        │ (derive-next-   │  │ (notepad surf,   │
        │  command,       │  │  journal,        │
        │  /work-on,      │  │  RecentActivity, │
        │  /triage,       │  │  PR/branch       │
        │  /blocker-report│  │  backlinks)      │
        └──┬──────────────┘  └──────────────────┘
           │
           ▼
        ┌─────────────────┐
        │ 08-crews        │ ◄── depends on 06
        │ (CrewSessionRef,│
        │  .crews/        │
        │  cross-walk,    │
        │  --via-crew,    │
        │  --update-crew- │
        │  session)       │
        └──┬──────────────┘
           │
           ▼
        ┌─────────────────┐
        │ 09-mcp          │ ◄── depends on 05, 06, 08
        │ (tools/overview-│
        │  mcp/ + 10 MCP  │
        │  data tools)    │
        └──┬──────────────┘
           │
           ▼
        ┌─────────────────┐
        │ 11-mcp-         │ ◄── depends on 09 + 02
        │ operational-    │
        │ tools           │
        │ (dev_server.*,  │
        │  build,         │
        │  sync.now,      │
        │  sync.watch_    │
        │  status)        │
        └─────────────────┘

        ┌─────────────────┐
        │ 10-ralph-handoff│ ◄── standalone (parallel-safe with all)
        │ (plans/ralph-   │
        │  overview-      │
        │  task-id.md     │
        │  handoff doc)   │
        └─────────────────┘

        ┌─────────────────────────────────┐
        │ 12-package-as-plugin            │ ◄── depends on 01, 05, 09, 11
        │ (extract to D:\ai-developer-    │   (recommend after all data + UI
        │  toolkit\plugins\ralph-         │    plans are stable in codexu)
        │  overview\, codexu consumer-    │
        │  side migration, Toolbar.tsx    │
        │  filter chips become data-      │
        │  driven)                        │
        └─────────────────────────────────┘
```

## Linear execution order

If you want a strict linear order (single agent, no parallelism), this minimizes rework:

1. **01-foundation** — types + sync core + one-shot sync + sidecar JS+JSON emit + slug-heuristic matching. Verifiable without any UI.
2. **02-watcher** — continuous chokidar watcher + Vite auto-start. Quality-of-life multiplier; ship before UI to keep the dev loop fast.
3. **03-ui-chip** — stage chip per task row + filter axis + Vite sidecar serve/inline. First user-visible value.
4. **04-pipeline-overview** — aggregate histogram + recommendations + dep graph. Second user-visible value.
5. **05-agent-exports** — JSON twin + snapshot + activity tail + schema + tasks/INDEX.md. Foundation for agent-driven workflows.
6. **06-skills** — `/work-on`, `/triage`, `/blocker-report` + derive-next-command. Skill-driven daily workflow.
7. **07-context** — notepad surfacing + journal + RecentActivity sidebar + PR/branch backlinks. Contextual depth.
8. **08-crews** — crews-plugin session tracking + `--via-crew` mode. Multi-agent delegation.
9. **09-mcp** — MCP server with 10 data tools (list_tasks, get_task, next_command, etc.). Agent-native programmatic read/state surface.
10. **11-mcp-operational-tools** — MCP subprocess control: `dev_server.start/stop/status/logs`, `build`, `sync.now`, `sync.watch_status`. Lets an agent drive the dev server lifecycle from MCP. *(Plan number is 11; comes after 09 in dependency order. Plan 10 ships independently — see below.)*
11. **10-ralph-handoff** — write the doc that a separate `/plan-with-ralph` cycle picks up to patch Ralph itself with `overviewTaskId`. Can be done any time, including before any other plan.
12. **12-package-as-plugin** — extract everything (sync core, watcher, MCP server, React viewer, skills) into a reusable plugin at `D:\ai-developer-toolkit\plugins\ralph-overview\`. Migrate codexu to consume the plugin. Make the pre-existing `Toolbar.tsx` filter chips data-driven (the last codexu-specific holdout). Ship after 01–11 are stable.

## Parallel-safe groupings

If multiple agents run in parallel:

- **Group A (Phase 1):** 01-foundation alone
- **Group B (Phase 2):** 02-watcher + 03-ui-chip + 05-agent-exports + 10-ralph-handoff (all depend only on 01 or are standalone; mutually non-conflicting file footprints)
- **Group C (Phase 3):** 04-pipeline-overview (depends on 03) + 06-skills (depends on 05) + 07-context (depends on 05)
- **Group D (Phase 4):** 08-crews (depends on 06)
- **Group E (Phase 5):** 09-mcp (depends on 05, 06, 08)
- **Group F (Phase 6):** 11-mcp-operational-tools (depends on 09 + 02)
- **Group G (Phase 7):** 12-package-as-plugin (depends on 01 + 05 + 09 + 11; ship after the system is stable in codexu)

That's 7 sequential groups with up to 4 plans running in parallel inside each group.

## What's NOT in any of these plans

All deferred to a future cycle or to user-time tasks:

- Web/CI deployment of the dashboard (already deployed via `pnpm overview:build` → `plans/overview.html`).
- Authentication or per-user views — the dashboard is single-user / single-workstation.
- History carry-forward for archived jobs — explicitly out of scope per the comprehensive plan's R3 (history routes through `OverviewData.runs[]` instead).
- Filter axis multi-select beyond the single-stage filter — start with single-select, add multi-select only if requested.
- Bookkeeper-editable `OverviewTask.ralph` field on hand-curated tasks — explicitly disallowed (the sidecar is the only writer for ralph state).

## Downstream-plan refresh convention (cascade)

When a plan ships its implementation, downstream plans that reference its outputs may go stale (line numbers shift, function names change, behavior contracts evolve). **Every plan (01–11) carries a final acceptance criterion** that requires the implementing agent to audit and update downstream plans + this INDEX before the implementation commit lands.

The audit covers:

- (a) The plans listed in this plan's **"Hand-off to next plans"** section — the explicit downstream consumers.
- (b) This INDEX's **"Source-of-truth modules"** table and **DAG diagram** — module locations and dependencies.

The cascade convention means **no separate "refresh plans" command is needed in the `/plan-with-ralph` invocation** — the requirement is permanently embedded in each plan's acceptance criteria. The `/implement-with-ralph` cycle's Phase 5a review naturally checks acceptance criteria and surfaces the requirement to the implementer.

Plan 12 (extraction-to-plugin) is terminal — it cascades into codexu's consumer-side migration, which is already captured in Plan 12's own acceptance criteria, so no additional downstream cascade applies.

## Common conventions across all plans

Every individual plan follows the same structure to keep them swappable:

1. **Context** — why this stage exists, how it fits in the DAG
2. **Dependencies** — explicit list of prior stages required
3. **Scope** — what's in, what's out
4. **Files to create / modify / read-for-reference**
5. **Implementation strategy** — ordered steps
6. **Acceptance criteria** — verifiable conditions for "done"
7. **Verification** — concrete test plan with commands
8. **Common mistakes / confusion points**
9. **Hand-off to next plans** — which downstream plans this enables

## Source-of-truth modules shared across plans

These ESM modules are introduced in early plans and re-imported by later ones. Drift between consumers is the #1 risk:

| Module / artifact | Introduced in | Contract | Consumed by |
|---|---|---|---|
| `scripts/lib/resolve-config.mjs` | 01 | `loadConfig({ repoRoot, configPath? })`; committed-path precedence is default `.ralph/overview-config.json` < `OVERVIEW_CONFIG_PATH` < explicit `configPath`; merge precedence is defaults < committed JSON < adjacent `.local.json`; returned paths are absolute and deep-frozen. | 02, 05, 07, 08, 09, 11 (all consumers go through this for paths/commands) |
| `scripts/lib/default-config.mjs` | 01 | Frozen codexu-default Plan-01 config only: `dataFile`, `ralphRoot`, `ralphSubdirs`, `outputs`, `lockFile`, `watcher.ignored`. Downstream config fields are additive extensions, not Plan-01 schema keys. | `resolve-config.mjs` only |
| `.ralph/overview-config.schema.json` | 01 | Trimmed Plan-01 JSON Schema matching the default config. Deferred output fields such as snapshot/activity/tasks index are downstream additive extensions. | 02, 05, 12 |
| `scripts/lib/derive-ralph-stage.mjs` | 01 | Stateless `deriveRalphStage({ jobState?, prd?, brainstormJson?, reviewOpenCount?, jobDirMarker? })`; no filesystem access, no list inputs; unknown future phases map to `implementing`. | 02, 05, 06, 09 |
| `scripts/lib/sync-core.mjs` | 01/02 | `walkRalphState({ repoRoot, config, generatedFromCommit })`, `writeSidecar({ repoRoot, config, state })`, plus Plan-02 helper exports `readBundleForSlug`, `assembleStateFromBundles`, `deriveAffectedTaskUpdate`, and `mergeAndWrite`. Owns direct-child Ralph walking, within-kind duplicate collapse, cross-kind precedence `job > group > brainstorm`, nested group-member suppression, malformed-JSON retain semantics, unmatched/unmatchedSummary refresh, and same-payload JS/JSON sidecar writes with `</script` escaping. | 02, 05, 07, 08 |
| `scripts/lib/sync-lock.mjs` | 02 | Shared async lock helper. Writes JSON `{ pid, process, startedAt }` with `wx`, reports contention as `another sync in progress (pid <N>, process <label>, started <ts>)`, treats EPERM PID probes as alive, removes ESRCH/unparseable stale locks, and supports `touch()` heartbeats. | 02, 08, 11 |
| `tools/overview-viewer/src/__tests__/scripts.d.ts` | 01 | Test-only explicit relative ambient declarations for root `.mjs` modules; no wildcard module patterns under bundler resolution. | overview-viewer tests |
| `scripts/lib/derive-next-command.mjs` | 06 | Derives the next operator command from snapshot/task state. | 06 (skills), 09 (MCP) |
| `scripts/lib/score-recommendations.mjs` | 04 | Scores dashboard recommendations from pipeline state and dependency graph. | 06 (`/triage`), 09 (`overview.list_recommendations`) |
| `scripts/lib/watch-ralph-state.mjs` | 02 | Continuous watcher around the sync core. Resolves watch roots from `config.ralphSubdirs`, uses a long-lived shared lock with a 30s heartbeat, cold-starts once after chokidar is ready, debounces per `(kind, slug)` changes into `deriveAffectedTaskUpdate`/`mergeAndWrite`, ignores worktree paths and `brainstorms/<slug>/selected-direction.md`, and reports debounced writes through `onWrite({ writtenAt, changedTaskIds })`. | Vite plugin, standalone CLI, 05, 08, 11 |

If a downstream plan's consumer drifts from the introducing plan's contract, the predicate table goes out of sync silently. Every plan that imports these explicitly lists them under "Read for reference."

## Reference: comprehensive plan

The original 1000+ line plan with full rationale, multi-lens brainstorm history, and all design refinements (R1-R9) is preserved at:

- `C:\Users\evmitran\.claude\plans\glistening-wondering-llama.md`

Treat it as the design rationale doc, not the implementation spec. The implementing agent for each stage works ONLY from the corresponding stage plan in this directory. If a stage plan is silent on a design choice, consult the comprehensive plan as a tiebreaker.
