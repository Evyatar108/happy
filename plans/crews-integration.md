# Codexu integration with the `crews` plugin

**Goal**: when `crews` 1.0 ships (see `D:/ai-developer-toolkit/plugins/assigned-roles/PLAN-1.0-crews.md`), use it here to run a team-lead session that manages `plans/overview-data.js` (the task/run data source) and the roadmap, and spawns ralph members for individual stories instead of running ralph runs manually in detached tabs.

**Scope**: this doc covers only the codexu-side changes needed to adopt crews. The plugin itself is workspace-agnostic; nothing in this doc requires changes to the plugin.

**Worktree**: applies to the main codexu workspace at `D:/harness-efforts/codexu/`. Worktrees under `.worktrees/*` get the integration for free once the plugin is installed at user scope.

---

## What changes

### 1. Install the plugin at user scope (not project scope)

Today the 0.8.0 (`assigned-roles`) install is project-scoped in `D:/harness-efforts/codexu/.claude/settings.json`. For 1.0:

- After plugin 1.0 ships, uninstall the 0.8 project-scope entry and remove the line from `.claude/settings.json` (the existing modification of that file may need committing or reverting first).
- Install at user scope so it's available in codexu, every worktree, and any other workspace where you want crews:
  ```
  claude plugin install crews@ai-developer-toolkit --scope user
  ```
- Per the upgrade procedure in the plugin's plan doc: delete `D:/harness-efforts/codexu/.assigned-roles/` after closing any open 0.8.0 worker tabs. Optionally back up `tasks/*/outbox.jsonl` first.

### 2. Make the operator's main codexu tab the team-lead

Set role on the main tab once at session start (or via env vars at launch):

```
/assign-role lead --crew codexu --name <your-handle>
```

This:
- Creates `D:/harness-efforts/codexu/.crews/crews/codexu/leads/<your-handle>/` with a manifest, an (initially empty) mailbox, and the listener-arm protocol applied.
- Auto-creates the `general` thread under `crews/codexu/threads/general/` with you subscribed.

If you want this to happen automatically when you open the codexu tab, set in your shell profile or a workspace launcher script:

```
$env:CREWS_ROLE = 'lead'
$env:CREWS_CREW = 'codexu'
$env:CREWS_NAME = '<your-handle>'
```

### 3. Spawn ralph members through `/spawn-member`, not manual `wt.exe new-tab`

Current pattern (manual): open a new wt tab, start `claude`, paste `/ralph-plan <story>`. The session has no crews state and you track its status separately.

New pattern:

```
/spawn-member <story-id> --crew codexu --allow-peers -- /ralph-plan <story-id>
```

`--allow-peers` lets ralph members coordinate with each other (e.g., one member pings another about a shared file). Leave it off for fully independent stories.

Initial prompt after `--` is the ralph-plan invocation as before; member auto-registers, arms the listener, runs ralph as turn 1.

### 4. Read member state via `/list-members` and `/read-member`

The lead view of `/list-members` gives full manifest details for every member in the crew:

```
/list-members
```

Returns names + heartbeat status + last kind + last summary + outbox seq. This is the new "is the agent alive and what did it last say" query that replaces eyeballing each wt tab.

To read an individual member's full outbox (their turn-by-turn reports):

```
/read-member <story-id>
```

### 5. Update `plans/overview-data.js` workflow

Task state is stored in `OVERVIEW_DATA.tasks[]` in `plans/overview-data.js` (the data source); `plans/overview.html` is the rendered view that reads from it. The lead's job is to translate `/list-members` output into edits to `plans/overview-data.js`.

**New workflow**:
1. Run `/list-members` to see the live picture.
2. For each member whose `lastKind` changed since the last refresh:
   - In-progress (`progress`) → find the task in `OVERVIEW_DATA.tasks[]` and set `phase` to the in-progress value with the latest `lastSummary` as its inline status.
   - Done (`done`) → flip the task's `phase` to `shipped` or `closed` based on whether the PR landed.
   - Blocked (`blocked`) → set `status` to `blocked`, surface the blocker from the summary.
   - Question (`question`) → flag so you can `/send-to-member <story-id> "<answer>"` to unblock.
3. Save `plans/overview-data.js`; the dev viewer (`pnpm overview`) will reflect the changes on reload via the custom Vite HMR plugin. To update the static `plans/overview.html` artifact, run `pnpm overview:build`.

The data plane is `plans/overview-data.js`; do not hand-edit the HTML directly.

### 6. `roadmap.md` workflow

Same pattern: lead manually edits `roadmap.md` based on what they see in `/list-members` and per-story outbox reads. Threads are useful here:

- Subscribe to a `roadmap-changes` thread (`/create-thread roadmap-changes`, `/subscribe-thread roadmap-changes`).
- Tell members to `/send-to-thread roadmap-changes "..."` when their work changes a roadmap item (e.g., scope shift, dependency added, deadline change).
- You get a mailbox notification per post; `Read` the thread file to see the running log; update `roadmap.md` accordingly.

### 7. Naming conventions

- **Crew name**: `codexu` (matches the workspace).
- **Member names**: match story IDs verbatim (e.g., `F-015-toast`, `B-101-server-bus`). One member = one story.
- **Lead name**: your handle, stable across sessions. Pick once and keep it (no rename in 1.0).
- **Threads**: kebab-case topical names (e.g., `roadmap-changes`, `build-status`, `cross-cutting`).

### 8. Cleanup of legacy state (one-time, when upgrading from 0.8.0)

After plugin 1.0 lands:

- Close all 0.8.0 worker tabs that are still open.
- `rm -rf D:/harness-efforts/codexu/.assigned-roles/`
- Remove `assigned-roles@ai-developer-toolkit` from `D:/harness-efforts/codexu/.claude/settings.json` `enabledPlugins`.
- Reinstall at user scope (step 1 above).
- Restart any codexu Claude tabs.

### 9. Worktree behavior

The plugin treats each cwd as a separate state root (`.crews/` lives in the cwd). That means:

- Each worktree under `.worktrees/*` would get its OWN `.crews/` state if you `/assign-role lead` from inside it.
- For unified visibility across worktrees, run the team-lead from the main repo and spawn workers into worktrees with `--state-cwd D:/harness-efforts/codexu --cwd D:/harness-efforts/codexu/.worktrees/<wt>` — state reports back to the main repo, work happens in the worktree.

---

## Codexu md/skill files that need updating

I grepped codexu for references to the old plugin and ralph orchestration patterns. Findings:

**No existing md or skill files reference `assigned-roles`/`/spawn-worker`/`/send-to-worker` directly** — the 0.8.0 plugin was only ever invoked via slash commands at runtime, never embedded in docs. Only matches were transient `.assigned-roles/spawn-launchers/*.ps1` (runtime state; deleted as part of cleanup) and the `.claude/settings.json` `enabledPlugins` entry.

**Skill that does need updating**: `D:/harness-efforts/codexu/.agents/skills/roadmap-and-overview/SKILL.md`. This is the bookkeeping-spine skill that runs `procedure B` (mark-task-shipped). It has 28 mentions of "ralph" baked into its current workflow:

- "Fresh-agent orientation" section frames the operator as running many ralph agents in parallel and the skill as cleaning up their landing reports.
- "Scan `plans/overview-data.js` (`OVERVIEW_DATA.tasks[]`) for tasks whose `phase` ends in `-in-progress`" — this discovery step changes: under crews, the lead queries `/list-members` for live state instead.
- Procedure B references landing reports arriving as ad-hoc operator pastes. Under crews, members emit `kind=done` envelopes with the same content; the skill should consume `/read-member <story-id>` as the canonical source.
- The "operator runs many ralph agents" memory reference is correct in spirit but the orchestration mechanic is now `/spawn-member` instead of manual wt-new-tabs.

**Edits to `roadmap-and-overview/SKILL.md`** (do these once crews 1.0 ships and the workflow has been validated for ~1 week):

1. **"Fresh-agent orientation" → add crews framing**: the bookkeeping agent IS the lead session itself. Peer-member bookkeepers are not viable in 1.0 — `/list-members` returns only `{crew, name, role, lastHeartbeatAt, liveness}` to `--allow-peers` members, which is insufficient for driving overview-data.js / roadmap.md updates (needs `lastKind` + `lastSummary` + outbox seq, which only the lead view exposes). Splitting bookkeeping out to a dedicated peer member is parked until the plugin either exposes those fields to peers or ships `/grant-cap` for selective full-visibility (1.1+).
2. **Step 3 of "First five things to do"**: replace "scan `OVERVIEW_DATA.tasks[]` in `plans/overview-data.js` for tasks whose `phase` ends in `-in-progress` or that have a `blocked` status" with "run `/list-members --crew codexu` to see live status of all in-flight ralph members, then reconcile against `plans/overview-data.js`."
3. **Procedure B** (mark-task-shipped) intake: the canonical landing report becomes the member's outbox under `crews/codexu/members/<story-id>/outbox.jsonl`. Each turn the member did is one outbox line; the most recent `kind=done` entry is the close-out report. Skill should `Read` this directly rather than wait for operator paste.
4. **Pitfalls section**: add "stale member state — if a member emitted `kind=done` but their wt-tab is still alive, the lead should confirm the merge landed (via `git log` on the relevant branch) before flipping the badge."

**Other plan files that reference ralph orchestration** (no update needed for 1.0 adoption, but worth a future revisit):

- `plans/parallel-assignments.md` — catalog of ralph plan prompts. The prompts themselves don't change; only how they're kicked off (was: manual wt-new-tab; now: `/spawn-member ... -- /ralph-plan ...`). Add a brief note at the top pointing to this integration doc.
- `plans/codexu-roadmap.md` — workflow doc. May want a sentence near "How we run stories" pointing at crews as the new spawn mechanism.

**Memory note worth updating**: the user-memory file `codexu_orchestration_pattern.md` (in your global memory) currently says "operator runs many ralph agents in parallel and delegates dashboard bookkeeping to you." Update to note the crews layer: "operator runs many ralph agents in parallel as members of crew `codexu`; lead is the human's main tab; lead handles dashboard bookkeeping directly (a separate peer-member bookkeeper is deferred to 1.1 because 1.0 doesn't expose `lastKind`/`lastSummary` to peer-allowed members)."

---

## What doesn't change

- `overview.html` format and layout (rendered view — do not edit directly).
- `roadmap.md` structure.
- The story/area/status taxonomy defined in `plans/overview-data.js` and rendered by `overview.html`.
- Ralph commands themselves (`/ralph-plan`, etc.). They run unchanged inside a member session.
- The codexu-roadmap.md schema.

---

## Open questions to resolve before adopting

1. **Lead handle**: pick a stable name (e.g., `evyatar`, `evm`, or workspace-coded like `codexu-lead`). Used in every envelope's `from`; permanent for 1.0.
2. **Default `--allow-peers` for ralph members**: do we want stories to be able to message each other? Probably yes for cross-cutting work, no for isolated stories. Decide a default; override per spawn.
3. **Threads we want from day one**: just `general` (auto-created)? Plus `roadmap-changes` and `build-status`? Decide before adoption so the template is consistent.
4. **State-cwd policy for worktrees**: report unified to main repo, or each worktree own its own crew? Probably unified — the operator wants one dashboard.

---

## Sequencing

- **Today (pre-1.0)**: this doc, no code changes. Keep using 0.8.0 `assigned-roles` or no plugin.
- **When crews 1.0 ships**: do the install + lead-assignment + cleanup steps. The first day will involve manually editing `plans/overview-data.js` via the new `/list-members` flow to confirm it feels right.
- **After ~1 week of real use**: revisit this doc with notes on what's clunky. Likely changes: threads we want auto-created, conventions around member naming for sub-stories, anything missing from `/list-members` that you find yourself wanting.

---

## Related docs

- `D:/ai-developer-toolkit/plugins/assigned-roles/PLAN-1.0-crews.md` — the plugin's own 1.0 plan.
- `D:/ai-developer-toolkit/plugins/assigned-roles/ROADMAP-1.1-and-beyond.md` — items deferred from 1.0 (notably `/rename`, recursive crew-leading, capability mutation).
- `D:/harness-efforts/codexu/plans/overview.html` — the dashboard.
- `D:/harness-efforts/codexu/plans/codexu-roadmap.md` — the roadmap.
