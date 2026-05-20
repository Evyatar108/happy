# Plan 09 — MCP server at `tools/overview-mcp/`

**Worktree:** `/implement-with-ralph --from-plan` creates the worktree at `D:\harness-efforts\codexu\.ralph\jobs\ralph-pipeline-09-mcp\worktree\` on branch `ralph-pipeline-09-mcp`. All file edits referenced in this plan happen in that worktree; commits land on the branch and are merged to `main` after Phase 6 review converges. Do NOT edit `main` directly. Note: MCP server registration in `.claude/settings.local.json` is per-machine and gitignored — the implementer documents the registration step in the README but does NOT commit the settings change.

**Position in DAG:** depends on Plan 05 (snapshot input), Plan 06 (next-command derivation), Plan 08 (crews integration for `invoke_next` with `viaCrewMember`).

## Context

Plans 01–08 produce file-based interfaces (sidecar, snapshot, activity log, journal, recommendations). Agents can consume those by reading files. This plan adds a first-class MCP server for programmatic agent loops — when another agent (the bookkeeping lead, or any tool-using agent in Claude Code) wants to query state or trigger actions, they call typed MCP tools instead of parsing files.

This is the "north star" interface. Skills (Plan 06) remain the user-facing surface; MCP is for agent-to-agent flows.

## Dependencies

- **Plan 05 (Agent exports)** — required. The MCP server reads `plans/overview-snapshot.json` as primary input.
- **Plan 06 (Skills)** — required. The server shares `scripts/lib/derive-next-command.mjs` with the skills.
- **Plan 08 (Crews)** — required for `overview.invoke_next` with `viaCrewMember` and `overview.list_crew_sessions`. It provides `CrewSessionRef`, `RalphPipelineState.crewSessions`, `.crews/` cross-walk discovery, the crews CLI mirror path, and lock-protected explicit sidecar subcommands. Without 08, those tools are stubs.

Plans 02, 04, 07 are recommended but not strictly required (they enrich the snapshot the server consumes).

## Scope

**In scope:**
- New package at `tools/overview-mcp/` registered in `pnpm-workspace.yaml` and root `package.json` `workspaces.packages`.
- TypeScript MCP server using `@modelcontextprotocol/sdk`.
- 10 MCP tools (table below).
- Build target `tools/overview-mcp/dist/index.js` invoked via `node`.
- `.claude/settings.json` registration entry under `mcpServers` (committed in `.claude/settings.local.json` since paths may be machine-specific — recommend `.local.json` to avoid leaking absolute paths).
- npm scripts: `overview-mcp:build`, `overview-mcp:install`.
- Tests for each tool's happy path.

**Out of scope (other plans):**
- Authentication / per-user authorization on the MCP server — single-user single-workstation deployment.
- Streaming results — all tool calls return synchronously.
- Tool versioning / negotiation — v1 is the first version.

## Tools

| Tool | Inputs | Returns | Mutates? |
|---|---|---|---|
| `overview.list_tasks` | `filter?: { stage?, scope?, workstream?, hasDeferredQuestions?, hasOpenFindings? }` | `Array<{ taskId, title, stage, jobSlug, lastUpdatedAt }>` | no |
| `overview.get_task` | `{ taskId }` | full merged `SnapshotTask` (OverviewTask + RalphPipelineState) + last 3 journal entries | no |
| `overview.next_command` | `{ taskId }` | `NextCommand \| null` from `deriveNextCommand` | no |
| `overview.invoke_next` | `{ taskId, viaCrewMember?: { crewName, memberName? } }` | `{ ok: true, sessionRef?: CrewSessionRef } \| { ok: false, error: string }` | yes (invokes a Ralph skill or spawns a crew member) |
| `overview.list_recommendations` | `{ limit?: number, stageFilter?: RalphStage }` | `Array<{ taskId, score, stage, reasons }>` read from `snapshot.recommendations`; applies the filter and may fall back to `plans/overview-recommendations.json` | no |
| `overview.list_blockers` | `{}` | tasks with `stage === 'blocked'` OR `reviewOpenCount > 0` OR `deferredQuestionsCount > 0` | no |
| `overview.set_override` | `{ slug, taskId }` | writes `OverviewData.ralphOverrides[slug] = taskId` in `overview-data.js` via structured edit | **yes — single field** |
| `overview.add_journal_entry` | `{ taskId, note }` | appends to `tasks/<id>/journal.md` via `scripts/lib/append-journal.mjs` | yes (append-only) |
| `overview.list_crew_sessions` | `{ taskId? }` | crew sessions per task (re-reads `.crews/.../manifest.json` for live status, not cached snapshot) | no |
| `overview.get_transcript` | `{ sessionId, lastN?: number }` | reads the session's `transcriptPath` jsonl and returns the last N user/assistant turns (default 20) | no |

## Files

### To create

- **`tools/overview-mcp/package.json`** — declares `@codexu/overview-mcp`, depends on `@modelcontextprotocol/sdk`, `chokidar` (for snapshot watching), and dev-deps `typescript`, `tsx`. `bin` entry `overview-mcp` → `dist/index.js`.
- **`tools/overview-mcp/tsconfig.json`** — extends the workspace's TS config; output dir `dist`.
- **`tools/overview-mcp/src/index.ts`** — MCP server entry. Sets up stdio transport, registers all 10 tools.
- **`tools/overview-mcp/src/snapshot-reader.ts`** — `SnapshotReader` class. Watches `plans/overview-snapshot.json` via chokidar; reads on demand; validates against `plans/overview-snapshot.schema.json` when present; caches the parsed `Snapshot` object in memory. All tool handlers query through this.
- **`tools/overview-mcp/src/tools/list-tasks.ts`**, **`get-task.ts`**, **`next-command.ts`**, **`invoke-next.ts`**, **`list-recommendations.ts`**, **`list-blockers.ts`**, **`set-override.ts`**, **`add-journal-entry.ts`**, **`list-crew-sessions.ts`**, **`get-transcript.ts`** — one file per tool, each exporting a registration function.
- **`tools/overview-mcp/src/utils/set-override-edit.ts`** — structured edit for `overview-data.js`. Parses the JS object literal via a permissive parser (e.g. `@babel/parser` or hand-written for the simple object-literal grammar), mutates only the `ralphOverrides` key, serializes back with the surrounding code byte-identical.
- **`tools/overview-mcp/src/install-server.ts`** — adds the server entry to `.claude/settings.local.json` (or prints the JSON for manual addition).
- **`tools/overview-mcp/tests/*.test.ts`** — one test file per tool covering the happy path.
- **`tools/overview-mcp/README.md`** — installation + registration instructions.

### To modify

- **`pnpm-workspace.yaml`** — add `tools/overview-mcp` to `packages`.
- **`package.json`** (root) — add to `workspaces.packages` and add scripts:
  - `"overview-mcp:build": "pnpm --filter @codexu/overview-mcp build"`
  - `"overview-mcp:install": "pnpm --filter @codexu/overview-mcp install-server"`

### Read for reference

- `scripts/lib/derive-ralph-stage.mjs`, `scripts/lib/derive-next-command.mjs`, `scripts/lib/score-recommendations.mjs`, `scripts/lib/append-journal.mjs`, `scripts/lib/derive-pr-links.mjs` — imported by the server as the single source of truth. `score-recommendations.mjs` exports `scoreRecommendations({ byTaskId, overviewData, prdsByTaskId, weights, topN, now? })` for callers that need to recompute, but `overview.list_recommendations` should prefer the precomputed snapshot field.
- `plans/overview-snapshot.json` — primary data input, parsed as the TypeScript `Snapshot` shape from the shared overview types.
- `plans/overview-snapshot.schema.json` — runtime validation contract for snapshot JSON. Do not import the schema as TypeScript types.
- `plans/overview-recommendations.json` — compatibility fallback for `list_recommendations`; the file is a Plan 04 wrapper `{ recommendations, generatedAt, generatedFromCommit }`, while the snapshot field is the primary array when present.
- `plans/overview-dependency-graph.json` — Plan 04 unwrapped dependency graph `{ nodes, edges }`; story node ids are `${taskId}:${storyId}`, and all edge types use dependent -> prerequisite direction.
- `.crews/crews/*/members/*/manifest.json` and `.crews/crews/*/leads/*/manifest.json` — re-read live by `list_crew_sessions` for fresh status.
- `scripts/lib/crews-cross-walk.mjs` and `scripts/lib/parse-spawn-launcher.mjs` — Plan 08 crew-session discovery helpers; reuse their matching and launcher-parsing contracts instead of reimplementing task-id heuristics in the MCP package.
- `scripts/sync-ralph-state.mjs --update-crew-session` and `--finalize-crew-session` — lock-protected explicit write/finalize surface for `CrewSessionRef` rows in `plans/overview-ralph-state.json`.
- `D:\ai-developer-toolkit\plugins\seval\` (or any existing MCP server in the toolkit) — TypeScript pattern reference for stdio transport + tool registration.

## Tool implementation notes

### `overview.invoke_next`

Two modes:

**Default (no `viaCrewMember`):** the server cannot directly invoke a Claude Code skill (MCP servers run as subprocesses, not in the Claude Code session). Instead, return the derived command with `{ ok: true, command: '<derived>', invocationGuidance: 'use the Skill tool to invoke this' }`. The caller (another agent) then uses the `Skill` tool itself.

**`viaCrewMember`:** use the Plan 08 `/work-on --via-crew` flow as the contract. Derive the prompt with `node scripts/lib/derive-next-command-cli.mjs <taskId>`, spawn with `node D:/ai-developer-toolkit/plugins/crews/tools/spawn-member.js <memberName> --crew <crewName> --cwd <main-repo-root> -- "<prompt>"`, poll the member/lead manifest briefly for `sessionId` and `transcriptPath`, then persist the row through `node scripts/sync-ralph-state.mjs --update-crew-session <taskId> <stage> --json <ref>`. Record a partial explicit ref with `crewName`, `memberName`, `cwd`, and `startedAt` if manifest polling times out; heuristic discovery upgrades it later.

### `overview.set_override`

The ONLY tool that writes `overview-data.js`. Uses a structured edit:

1. Read the file.
2. Parse via `@babel/parser` with `errorRecovery: true`. Locate the `window.OVERVIEW_DATA = {...}` assignment.
3. Find the `ralphOverrides` property. If absent, insert as a new property at the same indentation level as `tasks: [`. If present, modify in place.
4. Serialize via `@babel/generator` configured to preserve whitespace and quoting.
5. Write atomically (tmp + rename).

If parsing fails (e.g. malformed JS), error with `{ ok: false, error: 'failed to parse overview-data.js — fix manually' }`. NEVER overwrite the whole file.

### `overview.list_crew_sessions`

Re-reads `.crews/crews/*/{members,leads}/*/manifest.json` on every call rather than relying on the snapshot's cached `CrewSessionRef`. This is the "live status" surface. Cache the directory scan for ~500ms to avoid hammering the filesystem on repeated calls. Resolve `.crews/` through `config.crewsRoot` so linked worktrees read the main repo's shared crew state.

### `overview.get_transcript`

Opens `transcriptPath` (a JSONL file), reads the last N lines, parses each as a Claude Code transcript entry, returns the user + assistant turns (filter out tool_use/tool_result by default; flag `--include-tool-events` to include them).

## Installation

After `pnpm overview-mcp:build`, run `pnpm overview-mcp:install`. The install script:

1. Reads `.claude/settings.local.json` (creating if absent).
2. Adds under `mcpServers`:
   ```json
   "codexu-overview": {
       "command": "node",
       "args": ["${workspaceFolder}/tools/overview-mcp/dist/index.js"]
   }
   ```
   (Using `${workspaceFolder}` if Claude Code supports it; otherwise the absolute path.)
3. Writes atomically.

Alternatively, the install script just prints the JSON for the user to paste manually.

## Implementation strategy

1. **Scaffold the package** — `tools/overview-mcp/{package.json, tsconfig.json, src/index.ts}`. Register in workspace.
2. **Build `SnapshotReader`** — chokidar watch on `plans/overview-snapshot.json`, in-memory cache, async `getSnapshot()` accessor.
3. **Implement read-only tools first** — `list_tasks`, `get_task`, `next_command`, `list_recommendations`, `list_blockers`. Each is a thin wrapper around the snapshot.
4. **Implement `add_journal_entry`** — wraps `scripts/lib/append-journal.mjs`. Atomic.
5. **Implement `list_crew_sessions` + `get_transcript`** — live manifest re-read for the former; jsonl tail for the latter.
6. **Implement `set_override`** — structured edit via babel. Test rigorously: every other field must be byte-identical after the edit.
7. **Implement `invoke_next`** — return command for default mode; spawn via crews CLI (or pending-spawn fallback) for `viaCrewMember`.
8. **Install script** — `.claude/settings.local.json` patcher.
9. **Tests** — one per tool. For `set_override`, fuzz with random insertion points; assert no other field changed.
10. **Document** the registration flow in the package README.

## Acceptance criteria

- [ ] `tools/overview-mcp/` registered in workspace; `pnpm --filter @codexu/overview-mcp build` succeeds.
- [ ] All 10 tools registered and callable via stdio transport.
- [ ] `SnapshotReader` watches the snapshot file and serves fresh data after writes.
- [ ] `set_override` writes ONLY the `ralphOverrides` field; `git diff plans/overview-data.js` shows changes confined to that key.
- [ ] `list_crew_sessions` reads live `.crews/.../manifest.json` (verify: kill a member's heartbeat, the tool reflects the change within seconds without re-running sync).
- [ ] `invoke_next` default mode returns `{ ok: true, command, invocationGuidance }`; caller-side invocation is documented in the README.
- [ ] `get_transcript` returns the last 20 turns by default.
- [ ] Per-tool tests pass.
- [ ] `pnpm overview-mcp:install` updates `.claude/settings.local.json` correctly (or prints the JSON if interactive mode).
- [ ] README documents the registration flow + each tool's contract.

- [ ] **Refresh downstream plans + INDEX.** After all other criteria pass, audit (a) the plans listed in this plan's "Hand-off to next plans" section and (b) `plans/ralph-pipeline-INDEX.md`'s "Source-of-truth modules" table and DAG diagram. Update any stale references — file paths, type signatures, function/export names, behavior contracts, module dependencies — that diverged from this plan's actual implementation. Apply updates atomically in the final implementation commit; in the commit message, list each diff (which file, which lines, what changed) so reviewers can verify the cascade.

## Verification

A. **Workspace registration:** `pnpm install` from repo root succeeds with the new package in the workspace.

B. **Build:** `pnpm overview-mcp:build` produces `tools/overview-mcp/dist/index.js`.

C. **Install:** `pnpm overview-mcp:install`. Open `.claude/settings.local.json`; the `mcpServers.codexu-overview` entry is present.

D. **Tool discovery:** in Claude Code, the server's tools should appear. Verify with `/mcp` (if available) or via the tool list.

E. **`overview.list_tasks`:** invoke from Claude Code. Returns the task list.

F. **`overview.get_task`:** with a specific taskId. Returns merged data + last 3 journal entries.

G. **`overview.next_command`:** matches the output of `derive-next-command.mjs` for the same task.

H. **`overview.set_override`:** invoke with `{ slug: 'test-slug', taskId: 'test-task' }`. `git diff plans/overview-data.js` shows ONLY the `ralphOverrides` field added/modified. All other content byte-identical (use `git diff --stat` to confirm).

I. **`overview.list_crew_sessions`:** with at least one active crew member. Returns sessions with live `lastHeartbeatAt` (not cached).

J. **`overview.get_transcript`:** with a valid `sessionId`. Returns the last 20 turns; default-excludes tool events.

K. **`overview.add_journal_entry`:** appends a line. `tail tasks/<id>/journal.md` shows the new line.

## Common mistakes / confusion points

1. **`set_override` writes a single field via structured edit.** NEVER overwrite the whole file. If parsing fails, error gracefully and tell the user to fix manually.
2. **MCP server runs as a subprocess.** It cannot directly call Claude Code skills. `invoke_next` returns the command; the caller invokes via the `Skill` tool.
3. **Live vs cached crew data.** `list_crew_sessions` re-reads member and lead manifests for live status; `get_task.crewSessions` is cached snapshot data (last tick's view). The MCP docstring for each tool makes this distinction explicit.
4. **Settings.local.json, not settings.json.** Machine-specific paths shouldn't pollute committed config.
5. **Don't import from `tools/overview-viewer/`.** The MCP server and the React viewer share `scripts/lib/` modules ONLY. Importing React/Vite code from the MCP server creates a circular workspace dep.
6. **`SnapshotReader` cache invalidation.** chokidar fires on writes; the reader re-reads. Don't add additional polling — single source of cache invalidation.
7. **Keep TypeScript types and JSON Schema roles separate.** Import TypeScript shapes from the shared overview types; use `plans/overview-snapshot.schema.json` only for runtime JSON validation and MCP schema composition.
8. **Backwards compatibility.** v1 tool contracts are committed once shipped. Adding a tool is non-breaking; changing an existing tool's input or output is breaking and requires a new tool or a versioned variant (`overview.list_tasks_v2`).
9. **`invoke_next` with `viaCrewMember`** assumes Plan 08 is shipped. Use the CLI mirror at `D:/ai-developer-toolkit/plugins/crews/tools/spawn-member.js` and persist refs through `scripts/sync-ralph-state.mjs --update-crew-session`; do not write ad-hoc queued spawn files. Without Plan 08, the tool returns an error; document this dependency in the README.

## Hand-off

This is the deepest plan in the DAG. After it ships, the agent-facing programmatic surface is complete. The only remaining work is Plan 10 (Ralph plugin handoff doc), which is decoupled and can ship independently at any time.
