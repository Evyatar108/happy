# Plan 12 — Package as reusable `@ralph/overview` plugin

**Worktree:** the EXTRACTION work happens in **two places** with two separate worktrees / branches:

1. **Plugin source tree:** `D:\ai-developer-toolkit\plugins\ralph-overview\` — new plugin alongside `crews`, `ralph`. The implementer creates a branch in the `ai-developer-toolkit` repo for this work (recommended name: `add-ralph-overview-plugin`). NOT a Ralph-orchestrated worktree — this is plain `git checkout -b` in the toolkit tree because the toolkit isn't using Ralph itself for its own development.
2. **Codexu consumer-side migration:** `/implement-with-ralph --from-plan` creates the worktree at `D:\harness-efforts\codexu\.ralph\jobs\ralph-pipeline-12-package-as-plugin\worktree\` on branch `ralph-pipeline-12-package-as-plugin`. Removes the extracted files, updates `package.json` scripts, registers the installed plugin's MCP server in `.claude/settings.local.json` (per-machine, gitignored).

The two changes ship as separate commits in separate repos. Land the plugin first (so the consumer migration can install + reference it); land the codexu migration second.

**Position in DAG:** depends on all data plans (01, 05) + the MCP server (09, 11). Recommend shipping after 01–11 are all stable in codexu — extract from a working system, not a half-built one.

## Context

Plans 01–11 build the Ralph pipeline state feature inside the codexu workspace. Plan 01 introduced a config-driven layer (`.ralph/overview-config.json` + `scripts/lib/resolve-config.mjs`) so all paths and commands are parameterizable. With that in place, the entire system can be extracted into a reusable plugin that any Ralph-using project can install.

The user-stated goal:
> "I think we should make it generic so we can later make it a plugin we can reuse for other projects"

This plan covers the extraction: package boundaries, install/registration flow, codexu's consumer-side migration, documentation.

## Dependencies

- **Plan 01 (Foundation)** — required. The config-resolver layer is what makes extraction possible without code edits.
- **Plan 05 (Agent exports)** — required for the snapshot/sidecar files the plugin emits.
- **Plan 09 (MCP server)** — required. The MCP package is the main deliverable.
- **Plan 11 (MCP operational tools)** — required. Without these, the plugin's MCP server doesn't fully cover the lifecycle.

Plans 02 (watcher), 03 (UI chip), 04 (PipelineOverview), 06 (skills), 07 (context), 08 (crews), 10 (Ralph handoff) — strongly recommended; the plugin is more valuable with these shipped. Plan 12 doesn't strictly require them but the extracted plugin is the SUPERSET of what's shipped — anything not yet in codexu is not in the plugin v1.

## Scope

**In scope:**
- Create the plugin source tree at `D:\ai-developer-toolkit\plugins\ralph-overview\`:
  - `plugin.json` — plugin manifest declaring name, version, exposed skills, MCP servers.
  - `scripts/` — extracted from codexu's `scripts/lib/*` + `scripts/sync-ralph-state.mjs`.
  - `tools/overview-mcp/` — extracted from codexu's MCP server (Plans 09 + 11).
  - `tools/overview-viewer/` — extracted React app.
  - `skills/work-on/`, `skills/triage/`, `skills/blocker-report/` — extracted from codexu's `.claude/skills/`.
  - `docs/` — installation guide, configuration reference, contributor notes.
  - `templates/` — `.ralph/overview-config.json` template + `plans/overview-data.js` minimal example for new adopters.
- Codexu consumer-side migration:
  - Remove the now-extracted `scripts/lib/*`, `scripts/sync-ralph-state.mjs`, `tools/overview-mcp/`, `tools/overview-viewer/`, `.claude/skills/{work-on,triage,blocker-report}/` from the codexu tree.
  - Add the plugin to codexu's plugin marketplace install: typically via `claude-code plugin add ai-developer-toolkit:ralph-overview` (or whatever the actual install command is for the ai-developer-toolkit toolkit).
  - Update root `package.json` scripts to point at the installed plugin's binaries (or remove them if the plugin exposes its own slash commands).
  - Confirm `.ralph/overview-config.json` still applies — it stays in the consumer workspace, not in the plugin.
- Tests:
  - Plugin-level: install the plugin into a fresh test workspace (could be a temporary directory) and run the full lifecycle: sync, dev server start via MCP, chip renders. Validates that the plugin works without codexu-specific dependencies.
  - Codexu-level: after migration, all existing tests still pass — `pnpm --filter @codexu/overview-viewer test` (now `--filter @ralph/overview-viewer` post-rename, or run via the plugin's own test command).
- Generalize the pre-existing `Toolbar.tsx` `FILTER_GROUPS` hardcoded workstream/scope chip list — derive from `OverviewData` content (workstream chips from `Object.values(data.workstream).filter(unique)`, scope chips from parsing `data.tasks[].scope`). This was previously a codexu-specific hardcoding pre-dating the Ralph pipeline feature; the extraction is the right time to fix it so the plugin is truly reusable.

**Out of scope:**
- Publishing to a public npm registry (the plugin lives in the internal `ai-developer-toolkit` toolkit; cross-org distribution is a separate concern).
- Multi-language support / localization.
- Backwards-compatibility shims for codexu's existing `pnpm overview` script (the migration just removes them).
- Migration tooling for other potential consumers (the user is the only consumer for now; future adopters can read the docs).

## Files

### To create (in `D:\ai-developer-toolkit\plugins\ralph-overview\`)

- **`plugin.json`** — declares plugin identity:
  ```jsonc
  {
      "name": "ralph-overview",
      "version": "1.0.0",
      "description": "Dashboard + agent tooling for Ralph pipeline state. Tracks brainstorm → plan → implement progress per task.",
      "skills": ["work-on", "triage", "blocker-report"],
      "mcpServers": {
          "ralph-overview": {
              "command": "node",
              "args": ["${pluginPath}/tools/overview-mcp/dist/index.js"]
          }
      },
      "consumerSetup": {
          "configFile": ".ralph/overview-config.json",
          "configSchema": "${pluginPath}/templates/overview-config.schema.json",
          "configTemplate": "${pluginPath}/templates/overview-config.template.json"
      }
  }
  ```
  Exact field names per the ai-developer-toolkit plugin manifest convention — read `D:\ai-developer-toolkit\plugins\crews\plugin.json` (or equivalent) for the canonical shape.
- **`README.md`** — installation guide, configuration reference, three-paragraph "what is this" intro.
- **`docs/installation.md`** — step-by-step:
  1. `claude-code plugin add ai-developer-toolkit:ralph-overview`
  2. Copy `templates/overview-config.template.json` to `<repoRoot>/.ralph/overview-config.json` and edit.
  3. Run `pnpm install` to pick up the plugin's MCP server deps (if the plugin uses pnpm) or `npm install` per the plugin's package manager.
  4. Register the MCP server in `.claude/settings.local.json` (often auto-registered by the plugin manifest; manual fallback documented).
  5. First sync: `<plugin-cli> sync` (or invoke via `pnpm sync-ralph-state` if the consumer has wired the script).
- **`docs/configuration.md`** — every config field documented with examples. References the JSON Schema.
- **`docs/extending.md`** — how to add a new MCP tool, a new skill, a new stage; how to bump the stage predicate when Ralph plugin changes its schema.
- **`templates/overview-config.template.json`** — config skeleton for new adopters. It should contain the Plan-01 keys only (`dataFile`, `ralphRoot`, `ralphSubdirs`, `outputs`, `lockFile`, `watcher.ignored`) plus any downstream keys that have actually shipped by extraction time. Use placeholder paths (`plans/overview-data.js`, etc.) matching the most common convention and explicitly document "adjust to your layout."
- **`templates/overview-config.schema.json`** — copied from the consumer-side `.ralph/overview-config.schema.json` and extended only for downstream emitted artifacts that exist by extraction time. The schema is a plugin template, while the consumer's `.ralph/overview-config.json` remains in the consumer workspace.
- **`templates/overview-data.template.js`** — minimal `OverviewData` example so a new adopter can see what the data file should look like.
- **`scripts/`** — copy from codexu's `scripts/lib/*`, sibling `.d.mts` declarations, and `scripts/sync-ralph-state.mjs`. All file paths inside use the resolved config (no hardcoded paths remain). Preserve Plan 02's shared `sync-lock.mjs` JSON lock contract, watcher heartbeat, `sync-ralph-state:watch` behavior, and Vite-plugin `overview-ralph-state:update` event wiring.
- **`tools/overview-mcp/`** — copy from codexu. Rename `@codexu/overview-mcp` → `@ralph/overview-mcp` in `package.json`.
- **`tools/overview-viewer/`** — copy from codexu. Rename `@codexu/overview-viewer` → `@ralph/overview-viewer`. **Make `Toolbar.tsx`'s `FILTER_GROUPS` data-driven** — read workstream + scope values from `OverviewData` at runtime instead of hardcoding the labels.
- **`skills/work-on/SKILL.md`**, **`skills/triage/SKILL.md`**, **`skills/blocker-report/SKILL.md`** — copy from codexu's `.claude/skills/`.

### To modify (in `D:\harness-efforts\codexu\` — consumer migration)

- **Remove** the extracted files:
  - `scripts/lib/derive-ralph-stage.mjs`, `scripts/lib/derive-next-command.mjs`, `scripts/lib/sync-core.mjs`, `scripts/lib/sync-lock.mjs`, `scripts/lib/watch-ralph-state.mjs`, `scripts/lib/score-recommendations.mjs`, `scripts/lib/derive-dependency-graph.mjs`, `scripts/lib/parse-notepad.mjs`, `scripts/lib/derive-pr-links.mjs`, `scripts/lib/append-journal.mjs`, `scripts/lib/emit-snapshot.mjs`, `scripts/lib/emit-activity.mjs`, `scripts/lib/emit-tasks-index.mjs`, `scripts/lib/emit-snapshot-schema.mjs`, `scripts/lib/crews-cross-walk.mjs`, `scripts/lib/parse-spawn-launcher.mjs`, `scripts/lib/resolve-config.mjs`, `scripts/lib/default-config.mjs`, and matching `.d.mts` files.
  - `scripts/sync-ralph-state.mjs`.
  - `tools/overview-mcp/`.
  - `tools/overview-viewer/` (extracted; bookkeepers now run the plugin's dev server).
  - `.claude/skills/work-on/`, `.claude/skills/triage/`, `.claude/skills/blocker-report/`.
- **Keep** in codexu:
  - `plans/overview-data.js` — the actual task data (codexu-specific content, not plugin code).
  - `.ralph/overview-config.json` — codexu's config (codexu-specific paths, not plugin code). Initial content is identical to `plugins/ralph-overview/templates/overview-config.template.json` (the codexu defaults).
  - Generated artifacts: `plans/overview-ralph-state.{js,json}`, `plans/overview-snapshot.json`, etc. — these are still emitted to codexu's `plans/` directory.
  - `tasks/INDEX.md` — generated artifact.
  - `tasks/<id>/journal.md` per-task journals.
- **Update root `package.json` scripts:**
  - Remove `"sync-ralph-state"`, `"sync-ralph-state:watch"`, `"overview-mcp:build"`, `"overview-mcp:install"`, `"overview"`, `"overview:build"` if the plugin provides equivalent CLI commands.
  - Or, keep convenience wrappers that delegate: `"overview": "ralph-overview dev"`, `"sync-ralph-state": "ralph-overview sync"`. Bookkeeper preference — recommend the wrappers so muscle memory survives the migration.
- **Update `pnpm-workspace.yaml`** — remove `tools/overview-mcp` and `tools/overview-viewer` from `packages` (they live in the plugin now).
- **Update `.claude/settings.local.json`** — MCP server entry now points at the plugin's installed path. Plugin auto-registration may handle this; document the manual fallback.
- **Update root `CLAUDE.md`** — replace the pointer line from "...run `scripts/sync-ralph-state.mjs`..." with "...run `pnpm overview-sync` (delegates to the ralph-overview plugin)..." or similar.

### Read for reference

- `D:\ai-developer-toolkit\plugins\crews\plugin.json` — canonical plugin manifest shape.
- `D:\ai-developer-toolkit\plugins\ralph\` — sibling plugin; example of how a plugin exposes skills + scripts.
- `D:\ai-developer-toolkit\PLUGINS.md` (if it exists) — toolkit's plugin authoring docs.
- `D:\ai-developer-toolkit\plugins\seval\` (or any plugin with an MCP server) — example of MCP server registration via plugin manifest.

## Migration strategy

The extraction is a "lift and shift" plus a "rename and re-target." Recommend:

1. **Prep:** in codexu, run a final sync via the existing `pnpm sync-ralph-state` so the snapshot is fresh. Verify everything works pre-migration.
2. **Create the plugin shell:** `D:\ai-developer-toolkit\plugins\ralph-overview\` with `plugin.json`, `README.md`, empty subdirs.
3. **Copy code** from codexu into the plugin tree. Preserve the `scripts/lib/*` and `tools/*` layouts.
4. **Rename packages:** `@codexu/overview-mcp` → `@ralph/overview-mcp`, `@codexu/overview-viewer` → `@ralph/overview-viewer`. Update internal imports.
5. **Update `Toolbar.tsx`** to data-drive the workstream + scope chips.
6. **Test the plugin in isolation:** create a throwaway test workspace, install the plugin, create a minimal `.ralph/overview-config.json` + `plans/overview-data.js`, run sync, start dev server via MCP, verify chips render.
7. **Migrate codexu:** in a single PR, remove the extracted files, install the plugin, update scripts, verify all codexu tests still pass + the dashboard still renders.
8. **Verify no codexu tests reference removed files.** Update any imports that pointed at `scripts/lib/...` to now import from the plugin's exported entry point (or remove the references if they're no longer needed in codexu).

The codexu migration is one PR; the plugin lives in its own commit history in the ai-developer-toolkit tree.

## Acceptance criteria

- [ ] `plugin.json` exists at `D:\ai-developer-toolkit\plugins\ralph-overview\plugin.json` and validates per the toolkit's plugin manifest schema.
- [ ] Plugin tree includes `scripts/`, `tools/overview-mcp/`, `tools/overview-viewer/`, `skills/{work-on,triage,blocker-report}/`, `docs/`, `templates/`, `README.md`.
- [ ] Plugin can be installed into a fresh test workspace and the full lifecycle runs end-to-end (sync, dev server start via MCP, chips render).
- [ ] `Toolbar.tsx` `FILTER_GROUPS` is data-driven for workstream + scope (no hardcoded labels).
- [ ] Codexu migration removes all extracted files; `git status` shows the deletions in a clean PR.
- [ ] Codexu still works post-migration: `pnpm overview-sync` (or equivalent wrapper) emits the sidecar; `pnpm overview-dev` (or `overview.dev_server.start` via MCP) brings up the dashboard; chips render.
- [ ] All existing codexu tests pass post-migration (whether the test suite stays in codexu or moves to the plugin — recommend moving anything overview-viewer-specific to the plugin and keeping codexu-specific test fixtures in codexu).
- [ ] Plugin docs (`README.md`, `docs/installation.md`, `docs/configuration.md`, `docs/extending.md`) are complete and a new adopter can install + run in ~10 minutes.
- [ ] `templates/overview-config.template.json` is a clean starting point — paths are placeholder-commented.
- [ ] `.ralph/overview-config.json` in codexu is preserved (not deleted by the migration — it's the consumer's config).

## Verification

A. **Plugin manifest valid:** schema-validate `plugin.json` against the toolkit's plugin schema. If no schema exists, manually verify all required fields per the canonical plugin examples.

B. **Plugin install dry-run:** in a throwaway directory:
```
mkdir /tmp/plugin-test && cd /tmp/plugin-test
git init
claude-code plugin add ai-developer-toolkit:ralph-overview     # (or whatever the actual command is)
cp <plugin>/templates/overview-config.template.json .ralph/overview-config.json
cp <plugin>/templates/overview-data.template.js plans/overview-data.js
mkdir .ralph .ralph/jobs    # empty Ralph state
# run sync
<plugin-cli> sync   # or pnpm overview-sync if wrapper script aliased
ls plans/overview-ralph-state.json    # should exist
```

C. **Plugin MCP smoke:** from the test workspace, the MCP server registers via plugin manifest. Invoke `overview.list_tasks` — returns `[]` for empty data. Invoke `overview.dev_server.start` — spawns the React app from the plugin's installed path.

D. **Filter chips data-driven:** in the plugin's `tools/overview-viewer/`, set `plans/overview-data.js` workstream values to e.g. `{ "task-a": "marketing", "task-b": "engineering" }`. Open the dashboard. Toolbar shows chips for "marketing" and "engineering" — NOT codexu's "Codex spec / Codex parity / etc.".

E. **Codexu migration verification:** in `D:\harness-efforts\codexu`, after the migration PR:
   - `ls scripts/lib/` — does NOT contain the extracted `.mjs` files.
   - `ls tools/overview-mcp/` — does not exist.
   - `pnpm overview-dev` (or whatever wrapper aliases to the plugin) — brings up the dashboard, indistinguishable from pre-migration.
   - `pnpm overview-sync` — produces sidecar files, indistinguishable from pre-migration.
   - All chips, filters, and pipeline-overview header still work.

F. **Backwards compat (optional):** the plugin's wrapper scripts in codexu's `package.json` preserve muscle memory — `pnpm overview` still works (delegating to the plugin's dev server).

G. **No dual ownership:** `git log --follow scripts/lib/derive-ralph-stage.mjs` in codexu shows the file existed pre-migration and was deleted in the migration PR. The plugin tree's commit history is independent.

## Common mistakes / confusion points

1. **`.ralph/overview-config.json` stays in the consumer workspace.** It's the user's config, not the plugin's. The plugin ships `templates/overview-config.template.json`; the consumer copies and edits.
2. **`plans/overview-data.js` stays in the consumer workspace.** Bookkeeper-curated content is project-specific.
3. **Generated artifacts** (sidecar, snapshot, activity, journal) live in the consumer's filesystem at consumer-config-specified paths. The plugin emits them but doesn't own them.
4. **MCP server runs from the plugin's installed path.** The plugin manifest's `mcpServers.command` resolves the path. Don't hardcode codexu paths anywhere.
5. **Don't duplicate code across plugin and consumer.** Once extracted, codexu does NOT keep copies of `scripts/lib/*`. Imports flow from consumer → plugin via the plugin's exported entry points. If codexu still references `scripts/lib/x.mjs` after migration, the migration is incomplete.
6. **Test fixtures placement:** tests covering plugin code move to the plugin. Tests covering codexu-specific behavior (e.g. specific task IDs, codexu kanban layout) stay in codexu. Use the existing test fixture loader pattern but reading from `plans/overview-data.js` (consumer-curated).
7. **`Toolbar.tsx` was previously codexu-specific.** The data-driven refactor is part of this plan, not a "TODO." Don't ship the plugin with codexu-hardcoded workstream chips.
8. **Plugin version bumps follow semver.** v1.0.0 is the initial extraction. Adding new tools or fields = minor. Breaking the config schema = major. Document the version pin alongside the ralph-orchestration version pin in `derive-next-command.mjs`.
9. **Cross-platform paths:** the plugin runs on Windows (the user's environment), macOS, and Linux. Use `path.posix.join` for plugin-internal paths emitted into JSON; let Node handle the consumer-side paths via `path.join`.

## Hand-off

After this plan ships, the ralph-overview plugin is a first-class member of the ai-developer-toolkit. Other Ralph-using projects (existing or future) can adopt it without rewriting any logic — only writing a config and running the sync.

Possible future plugin evolutions (NOT in this plan):

- **Plugin auto-update mechanism** — when ralph-orchestration releases v6.0.0 with new resume syntax, the plugin's `derive-next-command.mjs` predicate needs to update. A "compatibility matrix" in the plugin README documents which Ralph versions each plugin version supports.
- **Cross-org distribution** — if the plugin is useful outside the ai-developer-toolkit, publish to npm as `@anthropic-tools/ralph-overview` or similar.
- **Plugin telemetry** — opt-in usage telemetry for the plugin maintainer to see which features are exercised. Probably skip — overkill for a small audience.
- **Detached dev server** — Plan 11's lifecycle constraint (children die with MCP server) becomes more painful at plugin scale. A future v1.1 could add an opt-in `daemon: true` mode.
