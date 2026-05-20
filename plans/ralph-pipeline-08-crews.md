# Plan 08 — Crews plugin integration: session tracking per phase

**Worktree:** `/implement-with-ralph --from-plan` creates the worktree at `D:\harness-efforts\codexu\.ralph\jobs\ralph-pipeline-08-crews\worktree\` on branch `ralph-pipeline-08-crews`. All file edits referenced in this plan happen in that worktree; commits land on the branch and are merged to `main` after Phase 6 review converges. Do NOT edit `main` directly. Note: this plan reads from `.crews/` (which is shared workspace state, not branch state); cross-walk runs against the live `.crews/` directory regardless of which worktree the implementer is in.

**Position in DAG:** depends on Plan 06 (`/work-on` skill, which gains the `--via-crew` flag here). Plan 07 recommended (tooltip extras slot for surfacing crew sessions).

## Context

The user runs an overview-bookkeeping agent (lead role in a crew) that delegates phase work to crew members spawned via the crews plugin. The overview needs to track which crew member's session worked on each phase of each task — enabling continuity (lead resumes the same member), audit (trace decisions back to a transcript), and parallelism (lead spawns multiple members across tasks).

The crews plugin is at `D:\ai-developer-toolkit\plugins\crews\`. Its runtime state lives under the consuming workspace's `.crews/` directory:

```
.crews/
├── crews/<crewName>/
│   ├── meta.json
│   ├── leads/<leadName>/{manifest.json, mailbox.json, outbox.jsonl, ...}
│   └── members/<memberName>/{manifest.json, mailbox.json, outbox.jsonl, ...}
├── sessions-configs/<sessionId>          # role+crew+name JSON per session
└── spawn-launchers/<member>-<ts>.ps1     # generated PS scripts
```

Each member's `manifest.json` exposes the canonical `sessionId` and `transcriptPath` we need.

## Dependencies

- **Plan 06 (Skills)** — required. `/work-on --via-crew` extends the skill.
- **Plan 07 (Context)** — recommended. The chip tooltip's `tooltipExtras` slot is the rendering target for crew session info.

## Scope

**In scope:**
- New `CrewSessionRef` type and `RalphPipelineState.crewSessions?: Record<RalphStage, CrewSessionRef[]>` field.
- Watcher cross-walk of `.crews/crews/*/members/*/manifest.json`, `.crews/crews/*/leads/*/manifest.json`, `.crews/sessions-configs/*` (shared 2s debounce window with `.ralph/` events).
- Heuristic match: member's `cwd === repo_root` (or worktree under it) AND `lastSummary` contains a task ID. When matched, the member is added to `crewSessions[<stage>]` for that task. Dedupe by `sessionId`.
- Subcommand modes for `scripts/sync-ralph-state.mjs`:
  - `--update-crew-session <taskId> <stage> --json <CrewSessionRef-as-JSON>` — atomically extends `RalphPipelineState.crewSessions` for that task and stage.
  - `--finalize-crew-session <taskId> <stage> --member <name> --outcome <s> --summary <text>` — sets `endedAt`, `outcome`, `summary` on an existing entry.
- `/work-on --via-crew <crewName>` mode: spawn a crew member with the derived next-command prompt; record the resulting `CrewSessionRef` via the subcommand mode.
- Stale-member detection: when `manifest.lastHeartbeatAt` is >60min old, set `outcome: 'stopped'` + `endedAt: lastHeartbeatAt`.
- Tooltip extras: render crew sessions for the current stage with clickable transcript paths.
- Tests for: heuristic match (positive + negative), subcommand-mode lock-protected update, stale detection, `/work-on --via-crew` spawn → `RalphPipelineState.crewSessions` update.

**Out of scope (other plans):**
- MCP tools `overview.list_crew_sessions` and `overview.get_transcript` → Plan 09 (this plan provides the data; Plan 09 wraps it in MCP tools)
- Multi-crew coordination across multiple lead agents → out of scope; single-lead model

## Files

### To create

- **`scripts/lib/crews-cross-walk.mjs`** — exports `discoverCrewSessions({ repoRoot, ralphState, overviewData }) -> Map<taskId, Record<stage, CrewSessionRef[]>>`. Walks `.crews/crews/*/members/*/manifest.json` and applies the heuristic match. Returns a sparse map.
- **`scripts/lib/parse-spawn-launcher.mjs`** — exports `parseSpawnLauncher(path) -> { initialPrompt: string }`. PowerShell-script parser that extracts the `--` initial prompt argument. Used by `crews-cross-walk` to associate spawned members to tasks via the prompt's content.
- Tests for the above two modules.

### To modify

- **`tools/overview-viewer/src/types.ts`** — add `CrewSessionRef` interface and extend `RalphPipelineState`:
  ```ts
  export interface CrewSessionRef {
      crewName: string
      memberName: string
      sessionId: string
      transcriptPath: string
      startedAt: string
      endedAt?: string
      outcome?: 'completed' | 'handed-off' | 'stopped' | 'failed'
      summary?: string
  }

  export interface RalphPipelineState {
      // ...existing fields...
      crewSessions?: Record<RalphStage, CrewSessionRef[]>
  }
  ```
- **`scripts/lib/sync-core.mjs`** — invoke `discoverCrewSessions` during the per-tick merge, AFTER the per-slug Ralph-side derivation. Merge crew session entries into the in-memory state (preferring entries written via `--update-crew-session` over the heuristic cross-walk on conflict — see Common Mistakes).
- **`scripts/lib/watch-ralph-state.mjs`** — add to the watched paths:
  - `.crews/crews/*/members/*/manifest.json`
  - `.crews/crews/*/leads/*/manifest.json`
  - `.crews/sessions-configs/*`
  Exclude `.crews/logs/`, `.crews/spawn-launchers/` (changes there are noise; manifest is the canonical source), mailbox files (`mailbox.json`, `outbox.jsonl` — high churn, not state). Preserve Plan 02's resolved-root behavior: Ralph paths come from `config.ralphSubdirs`, and any new `.crews/` root must be resolved from config or `repoRoot`, never from a worktree-local directory.
- **`scripts/sync-ralph-state.mjs`** — add CLI subcommand handlers:
  - `--update-crew-session <taskId> <stage> --json <ref>` — acquires the same lock, applies the merge, exits.
  - `--finalize-crew-session <taskId> <stage> --member <name> --outcome <s> [--summary <text>]` — same pattern.
- **`.claude/skills/work-on/SKILL.md`** — add the `--via-crew <crewName>` branch. When the flag is present:
  1. Derive the next command via `derive-next-command.mjs` as in the default path.
  2. Spawn a member by invoking the crews plugin's CLI mirror directly: `node D:/ai-developer-toolkit/plugins/crews/tools/spawn-member.js <generated-name> --crew <crewName> --cwd <main-repo-root> -- <derived-command-prompt>`. This is the canonical invocation path — Skill tool invocations of `/spawn-member` cannot fire the crews spawn hook, so the slash-command form is not viable from inside the `/work-on` skill. The CLI mirror is also the form Plan 09's MCP `overview.invoke_next` wraps for `viaCrewMember` (see "Hand-off to next plans").
  3. Read the new member's `manifest.json` to extract `sessionId`, `transcriptPath`, `startedAt`.
  4. Call `node scripts/sync-ralph-state.mjs --update-crew-session <taskId> <stage> --json <ref>` to atomically record the spawn.
  5. Return to the bookkeeping agent (lead). The lead later monitors the member's mailbox and calls `--finalize-crew-session` when the member returns a `<|report kind="final" ...|>` tag.
- **`tools/overview-viewer/src/components/TaskCommand.tsx`** — extend the `tooltipExtras` JSX passed to `RalphStageChip` (slot added in Plan 03, first populated by Plan 07) with crew sessions for the current stage. Each session row: member name, started/ended timestamps, outcome, clickable link to `transcriptPath` (rendered as `file://` so clicking opens the JSONL in the system viewer or VS Code). Keep `RalphStageChip.tsx` generic and unchanged unless the slot contract itself needs to change.
- **`tools/overview-viewer/src/App.tsx`** — no changes (the type extension flows through transparently).

### Read for reference

- `D:\ai-developer-toolkit\plugins\crews\skills\spawn-member\SKILL.md` — `/spawn-member` invocation contract.
- `D:\ai-developer-toolkit\plugins\crews\skills\read-member\SKILL.md` — `/read-member` for monitoring outcomes.
- `D:\ai-developer-toolkit\plugins\crews\README.md` — overall coordination model.
- `D:\harness-efforts\codexu\.crews\crews\smoke\members\alice\manifest.json` — sample real manifest for field reference.
- `scripts/lib/sync-core.mjs` from Plans 01, 02, 05 — extension point.

## Heuristic matching contract

`discoverCrewSessions` matches member → task using:

1. **Strong signal:** `manifest.lastSummary` contains a task ID (matched against `OverviewTask.id` case-sensitively). High confidence.
2. **Medium signal:** the initial-prompt file at `.crews/spawn-launchers/<memberName>-<ts>.ps1` contains a task ID in the `--` initial prompt. Parse via `parseSpawnLauncher.mjs`.
3. **Filter:** member's `cwd` MUST be inside `repo_root` (resolve via `path.resolve` and check `startsWith`). Members spawned in unrelated repos surface in `.crews/` but should NOT appear in this repo's snapshot — they cross workspace boundaries.

When 0 signals match: do NOT add the member to any task. Log to stderr: `crews: member <crewName>/<memberName> (session <sessionId>) could not be associated with any task`.

When multiple tasks match (rare — e.g. prompt mentions two task IDs): pick the first by file ordering and log the ambiguity.

## Subcommand-mode contract

Both `--update-crew-session` and `--finalize-crew-session` share the same `config.lockFile` (Plan 01 default: `.ralph/overview-sync.lock`) as the watcher (introduced in Plan 02) by calling `scripts/lib/sync-lock.mjs`. Plan 02's watcher holds that lock for its full lifetime and refreshes it with a 30s heartbeat; do not assume it releases between debounce ticks. If a watcher or one-shot sync already owns the lock, subcommands fail fast with the canonical diagnostic `another sync in progress (pid <N>, process <label>, started <ts>)` and make no partial snapshot write. If the lock is stale, reuse the shared helper's PID-liveness gate: ESRCH or unparseable metadata may be removed; EPERM/alive PIDs remain active.

After the subcommand updates `RalphPipelineState.crewSessions` and rewrites the snapshot while it owns the lock, it sets the file mtime. If a Vite-plugin watcher is running, the subcommand should not have acquired the lock; callers should surface the diagnostic and retry after the watcher stops, or this plan must add an explicit watcher-mediated queue before claiming concurrent subcommand writes are supported.

## Conflict resolution between heuristic and explicit writes

`discoverCrewSessions` is invoked on every watcher tick. `--update-crew-session` is called by `/work-on --via-crew` (explicit user/agent action). Both can produce a `CrewSessionRef` for the same `sessionId`.

Rule: explicit-write entries WIN over heuristic-discovered entries. Implementation:

- Each `CrewSessionRef` carries an internal `_source: 'explicit' | 'heuristic'` field (NOT serialized to the snapshot — it's an in-memory annotation during merging).
- On merge, if two entries have the same `sessionId`:
  - If one is `explicit` and one is `heuristic`: keep the `explicit` entry.
  - If both are explicit: keep the more recent `startedAt`.
  - If both are heuristic: keep the more recent `startedAt`.

`endedAt` / `outcome` / `summary` from `--finalize-crew-session` always override whatever was there (the lead explicitly told us the outcome).

## Implementation strategy

1. **Add types** (`CrewSessionRef`, extend `RalphPipelineState`). Typecheck.
2. **Build `parseSpawnLauncher.mjs`** — PowerShell-quoted-string extraction. Test against the real spawn-launcher files in `.crews/spawn-launchers/`.
3. **Build `discoverCrewSessions.mjs`** — full walk + match. Test against `.crews/crews/smoke/` real data (5+ members across alice/bob).
4. **Wire into `sync-core.mjs`** — merge crew sessions into `byTaskId` AFTER per-slug derivation.
5. **Extend `watch-ralph-state.mjs` watched paths** — add `.crews/` paths with appropriate excludes.
6. **Add CLI subcommand modes** — `--update-crew-session`, `--finalize-crew-session`. Share the lock through `sync-lock.mjs`. Test that two subcommand invocations without a running watcher serialize without lost updates, and that either subcommand against a fresh watcher lock fails before writing with the canonical diagnostic.
7. **Update `/work-on` skill** — add `--via-crew` branch.
8. **Extend chip tooltip extras** — append crew session rows to the `tooltipExtras` JSX composed in `TaskCommand.tsx` and passed to `RalphStageChip`.
9. **Stale-member detection** — in `discoverCrewSessions`, mark `lastHeartbeatAt > 60min` ago as `outcome: 'stopped'` with `endedAt: lastHeartbeatAt`.

## Acceptance criteria

- [ ] `CrewSessionRef` and `RalphPipelineState.crewSessions` types added.
- [ ] `scripts/lib/crews-cross-walk.mjs` walks `.crews/` and matches members to tasks via heuristic. Stderr-logs unmatched.
- [ ] `scripts/lib/parse-spawn-launcher.mjs` extracts the initial prompt from a PS1 file.
- [ ] Watcher includes `.crews/` paths in its watch list.
- [ ] `pnpm sync-ralph-state --update-crew-session <id> <stage> --json <ref>` atomically adds a session entry.
- [ ] `pnpm sync-ralph-state --finalize-crew-session <id> <stage> --member <m> --outcome completed --summary <text>` atomically updates the matching entry.
- [ ] `/work-on --via-crew <crewName>` spawns a member, records the session ref, and returns.
- [ ] Tooltip extras render crew session rows with clickable transcript paths.
- [ ] Stale-member detection: a member with `lastHeartbeatAt` >60min old gets `outcome: 'stopped'` automatically on the next tick.
- [ ] Conflict resolution: explicit-write entries override heuristic entries for the same `sessionId`.
- [ ] All existing tests pass.

- [ ] **Refresh downstream plans + INDEX.** After all other criteria pass, audit (a) the plans listed in this plan's "Hand-off to next plans" section and (b) `plans/ralph-pipeline-INDEX.md`'s "Source-of-truth modules" table and DAG diagram. Update any stale references — file paths, type signatures, function/export names, behavior contracts, module dependencies — that diverged from this plan's actual implementation. Apply updates atomically in the final implementation commit; in the commit message, list each diff (which file, which lines, what changed) so reviewers can verify the cascade.

## Verification

A. **Heuristic match smoke:** with a real crew member spawned via `/spawn-member alice --crew smoke --cwd D:\harness-efforts\codexu -- "Work on task overview-vite-react: ..."`, after the next watcher tick, `cat plans/overview-snapshot.json | jq '.tasks[] | select(.id == "overview-vite-react") | .ralph.crewSessions'` shows a session entry for alice.

B. **Cwd filter:** spawn a member with `--cwd C:\some-other-repo`. After tick, that member does NOT appear in this repo's snapshot.

C. **Subcommand mode atomic update:** invoke `pnpm sync-ralph-state --update-crew-session <id> implementing --json '{...}'`. Confirm the session is added; rerun with a different `sessionId`; confirm both are present.

D. **Subcommand mode concurrency:** invoke two `--update-crew-session` calls in parallel for different task IDs without a running watcher. Both succeed via lock serialization. Then run the same command while `pnpm overview` owns the watcher lock; it fails before writing and prints the canonical `another sync in progress ...` diagnostic.

E. **Finalize:** invoke `--finalize-crew-session <id> implementing --member alice --outcome completed --summary "implemented US-001"`. The matching entry's `endedAt`, `outcome`, `summary` update.

F. **`/work-on --via-crew`:** run `/work-on overview-vite-react --via-crew smoke`. A member spawns. After the sync tick, the session appears in `crewSessions[<stage>]`.

G. **Stale detection:** synthetically set `manifest.lastHeartbeatAt` to 2 hours ago for a member. After the next tick, the member's `CrewSessionRef.outcome === 'stopped'`.

H. **Tooltip render:** hover the chip for a task with a crew session. Tooltip shows the member name, outcome, and a clickable transcript link.

I. **Conflict resolution:** add a session via subcommand mode (explicit). Then on the next tick, the heuristic cross-walk also discovers the same `sessionId` (because the manifest hints match). Verify the explicit entry's fields are preserved (not overwritten).

## Common mistakes / confusion points

1. **Don't watch `.crews/spawn-launchers/`.** Spawn launchers are write-once and read-once; watching them produces spurious events. The manifest is the canonical state source.
2. **Don't watch mailbox/outbox files.** Mailboxes churn on every message; that's not pipeline state. Filter via chokidar's `ignored` pattern.
3. **`cwd` filter is critical.** Crews state is workspace-scoped at the directory level, so members from unrelated repos may appear in `.crews/`. The cwd filter is the only safeguard against showing them in this repo's snapshot.
4. **Explicit writes win over heuristic.** Without this rule, the heuristic cross-walk might overwrite an explicitly-recorded `summary` or `outcome` on the next tick. The `_source` annotation enforces precedence.
5. **`CrewSessionRef` is append-only, not authoritative.** The real-time member state (alive, idle, stopped) lives in `manifest.json`. The snapshot's `CrewSessionRef` reflects state as of the last tick. For live status, consult `manifest.json` directly (Plan 09's MCP tool re-reads manifests on demand).
6. **Don't surface members from worktree-local `.crews/`.** Worktrees may have their own `.crews/` directory. The watch root is the main repo's `.crews/`, not `.worktrees/<name>/.crews/`.
7. **Heuristic match by task ID, not stage.** A member spawned for "work on overview-vite-react: implement Story 3" is recorded under the task `overview-vite-react`, with `stage` derived from the task's current stage at spawn time (read from `byTaskId[<task>].stage`). Don't try to infer stage from the prompt text.
8. **Plan 02 lock is long-lived.** The watcher does not release the sync lock between debounce ticks. Any Plan 08 write path that needs to coexist with a running watcher must add a queue/IPC handoff or stop the watcher; otherwise it should fail fast through `sync-lock.mjs`.

## Hand-off to next plans

- **Plan 09 — MCP** exposes `overview.list_crew_sessions` and `overview.get_transcript` tools that wrap the same data + manifest re-read. `overview.invoke_next` with `viaCrewMember` follows the same flow as `/work-on --via-crew`.
