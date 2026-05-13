# Parallel ralph plan commands

Self-contained `/plan-with-ralph` prompts for parallel-safe tasks. Drop into a fresh Claude session.

**Batch 1 (six tasks below) are pairwise safe to run together.** Don't add a "perf WS2" agent yet — it must wait until B (WS3) lands, because both touch `storage.ts` and WS3 changes WS2's scope.

> **⏸ `3a-skills` is PAUSED (operator-closed 2026-05-13).** The session was closed because the discovery prerequisites the agent needs aren't yet met. Don't re-spawn until the operator re-establishes that context. Phase 3 sub-phases that build on 3a's output — **`3b-agents`, `3d-workers`, `3fg-package` in batch 2** — remain blocked on 3a's eventual discovery commit. `3c-hooks` and `3h-options` are unaffected.
>
> **🛡️ Minimize-conflict-surface tenet (codex submodule):** for any ralph plan that needs codex source changes, follow `plans/codexu-roadmap.md` §"Codex changes — minimize upstream conflict surface". Tldr: (1) avoid editing codex source if possible — most happy-cli work doesn't need it; (2) when new behavior IS needed, prefer a NEW package alongside in `codex/codex-rs-overlay/` (the `codex-copilot` / `codex-copilot-launcher` / `codex-invariant-tests` precedent), not edits to upstream-canonical files; (3) if patching `codex/external/repos/codex-patched/codex-rs/` is unavoidable, keep the diff minimal and surface to the operator; (4) work in a `.ralph/jobs/<name>/codex-worktree/` git worktree of the codex submodule, not in the parent codexu's checkout; (5) submodule pointer bump on codexu is a separate commit after the codex-side commit lands.
>
> **🌿 Worktree isolation (codexu side):** every ralph task MUST work in an isolated worktree, never on the parent codexu's `main` branch directly. Pattern: `git worktree add .worktrees/<task-id> -b ralph/<task-id> origin/main` → do all edits + commits there → `git push origin ralph/<task-id>` → surface to operator for merge into `main` (typically a `--no-ff` merge so the topic-branch boundary stays visible). Reason: 2026-05-14 codex-wire-spike committed directly on the parent codexu repo's working branch (`0dcd8614`), which forced manual cherry-picking + branch juggling to keep `main` clean. If a ralph command's prompt body doesn't already specify a worktree, follow this default. Cleanup: `git worktree remove .worktrees/<task-id>` + `git branch -D ralph/<task-id>` once merged. (codex-submodule tasks have their OWN worktree convention per the tenet above — those land in `.ralph/jobs/<name>/codex-worktree/`; codexu-side tasks land in `.worktrees/<task-id>/`.)

Per-task usage:

1. Open a fresh Claude session, name the terminal tab per the title below.
2. Paste the `/plan-with-ralph "..."` block. Ralph drafts a PRD + plan under `.ralph/jobs/<auto-named>/`.
3. Review the plan, then run `/implement-with-ralph` (or `/implement-with-ralph resume <job-name>` if iterating).

When each task lands, mark its row done at the bottom of this file.

---

## 🚀 Recommended parallel lanes — fire now

Batch-1 tasks are pairwise file-disjoint and can run concurrently:

| Lane | Tab | Files touched | Why safe with the others |
|---|---|---|---|
| 1 | `perf-WS1` | ⚠️ **OBSOLETE after remove-tunnel-claim-layer** — the refreshClaim path was deleted end-to-end | Do not assign; start remaining perf work at WS2 or later |
| 2 | `perf-WS3` | server `eventRouter.ts` + `socket.ts`; app `storage.ts` + `socketOptions.ts` | Server side untouched by any other lane; app-side files distinct from lanes 1/3/4 |
| 3 | `mcp-discovery` | `packages/happy-cli/src/codex/runCodex.ts` + test | Only happy-cli codex file edited in batch 1 |
| 4 | `F-015-toast` | `packages/happy-app/sources/auth/AuthContext.tsx`, `sync/profile.ts`, `auth/tokenStorage.ts` | Auth surface, not sync — no overlap with perf |
| 5 | `codex-parity-audit` | `plans/codex-agent-parity-audit.md` (new), `plans/codexu-roadmap.md`, `plans/overview.html` | Docs-only; runs in parallel with anything |

If you have spare capacity, three more lanes are also parallel-safe with all five above:

| Lane | Tab | Why safe |
|---|---|---|
| 6 | `1a-fork-doc` | Codex submodule docs-only (uses its own `.ralph/jobs/<name>/codex-worktree/`). No overlap with codexu files. |
| 7 | `3c-hooks` | Verifies the ralph plugin for hooks; likely zero work; touches `C:/ai-developer-toolkit/plugins/ralph/`. |
| 8 | `3h-options` | Separate plugin (options-mode); its own directory. |

### ❌ Do NOT fire concurrently

- **`perf-WS2` + `perf-WS3`** — both touch `storage.ts`; WS3 changes WS2's scope. Fire WS2 only after WS3 lands.
- **`mcp-discovery` + `1b-multidev`** — both touch `runCodex.ts`. Fire mcp-discovery first (45 min), then 1b-multidev rebases trivially.
- **`polish-Fs` + `perf-WS3`** — polish-Fs touches happy-server for the security findings; could collide with perf-WS3's eventRouter changes. Fire polish-Fs after perf-WS3 lands, or coordinate which server file each agent owns.
- **`3a-skills`** — paused; not fire-able until prerequisites are re-established (operator gate).
- **`3b-agents` / `3d-workers` / `3fg-package`** — blocked on 3a-skills's discovery commit (which doesn't exist yet).

### Sequencing after batch 1

Once perf-WS3 lands → fire `perf-WS2` AND `userid-cleanup` (the latter strips WS3's now-trivial userId partition).
Once perf-WS3 + F-015 land → fire `polish-Fs` (different operator may also choose to fire F-014 deploy when convenient).
Once 3a-skills is re-spawned and lands its discovery → fire `3b-agents`, `3d-workers`, `3fg-package` (themselves serialized internally per plan).
Once codex-parity-audit lands → operator triages the gaps and may queue new per-gap ralph commands.

---

## A — `perf-WS1` — Realtime perf, obsolete

```
/plan-with-ralph "Realtime sync perf — Workstream 1 is obsolete after remove-tunnel-claim-layer. Do not assign the old claim-refresh optimization. Start from plans/realtime-sync-perf.md §Workstream 2 or later. Read packages/happy-app/CLAUDE.md sync invariants (especially 'Session/machine-scoped network calls') before editing. Cross-package typecheck must stay green."
```

---

## B — `perf-WS3` — Realtime perf, replay buffer

```
/plan-with-ralph "Realtime sync perf — Workstream 3: server-side per-user event replay buffer + client lastSeenSeq handshake. Per plans/realtime-sync-perf.md §Workstream 3. Server: in packages/happy-server/sources/app/events/eventRouter.ts add a per-user ring buffer of last N events (cap MAX_REPLAY_BUFFER=1024 or MAX_REPLAY_AGE_MS=60_000, whichever is larger); every emitUpdate appends keyed by userId. In packages/happy-server/sources/app/api/socket.ts on connection check socket.handshake.auth.lastSeenSeq; if present and within buffer, replay events with seq > lastSeenSeq in order; if older than oldest buffered seq respond { replayOverflow: true, currentSeq }. Client: in packages/happy-app/sources/sync/storage.ts add lastSeenUpdateSeq to MMKV-persisted state; persist on every applied update.seq. In packages/happy-app/sources/sync/socketOptions.ts:30 inside buildTunnelSocketOptions add lastSeenSeq to the auth object. On server replayOverflow, fall back to existing fetchSessions path. Read packages/happy-server/CLAUDE.md and packages/happy-app/CLAUDE.md sync invariants first. Document the in-memory-only nature: ring buffer is single-process state; cross-cluster Redis is deferred. Acceptance: unit test eventRouter — emit 10 events, disconnect, reconnect with lastSeenSeq=5, verify 6-10 in order; overflow test with cap and 2000 events. Client test — lastSeenUpdateSeq persists across applyUpdate calls. Test command: pnpm --filter '{packages/happy-server}' --filter '{packages/happy-app}' exec vitest run 2>&1 | tee /tmp/codexu-ws3.log. Single commit on main. Pitfall: do not reorder allocateUserSeq vs emitUpdate."
```

---

## C — `3a-skills` — Phase 3a, Ralph skills port — ⏸ PAUSED

> **⏸ Paused 2026-05-13.** Operator closed the discovery session because the prerequisites the agent needs aren't yet met. Do not re-spawn until the operator re-establishes that context (e.g., the missing notepad / scaffolding inputs / template clarifications). When re-spawning, fold in any prerequisite gaps the operator now wants enforced.
>
> **Codex source (read-only).** This plan should not need codex submodule edits at all — it only edits `packages/codexu-plugin/`. Read manifest schema / loader behavior from `codex/external/repos/codex-patched/codex-rs/core-plugins/...` as a reference; don't modify it. Per `plans/codexu-roadmap.md` §"Codex changes — minimize upstream conflict surface".

```
/plan-with-ralph "Phase 3a — port Ralph plugin skills from Claude Code plugin format to codex plugin format. Per plans/codexu-roadmap.md §Phase 3a. Source: C:/ai-developer-toolkit/plugins/ralph/skills/ — 13 SKILL.md files (4 user-invocable: brainstorm-with-ralph, plan-with-ralph, implement-with-ralph, review-plan-with-ralph; 9 internal: analyze-iteration, convert-to-ralph-prd, create-prd, decompose-plan, edit-prd, list-jobs, parallel-ralph, review-changes, run-ralph). Target: under packages/codexu-plugin/ — use existing packages/codexu-plugin/skills/hello-world/SKILL.md as the format template. Conversion per skill: keep SKILL.md frontmatter shape (name, description, model if set); strip Claude-only fields like allowed-tools (silently tolerated by codex per Phase 2b finding); add manifest entries to packages/codexu-plugin/.codex-plugin/plugin.json under skills array. Verify manifest shape against codex/external/repos/codex-patched/codex-rs/core-plugins/src/manifest.rs (codex submodule — READ-ONLY; per plans/codexu-roadmap.md §'Codex changes — minimize upstream conflict surface', no edits anywhere in the codex submodule for this plan; everything happens under packages/codexu-plugin/). Read packages/codexu-plugin/README.md and the roadmap §Phase 1c for the existing scaffold context. Acceptance: after `codex plugin marketplace upgrade codexu` and re-enable, all 13 skills appear in `codex debug prompt-input` with correct paths; one user-invocable skill (suggest /list-jobs) works end-to-end via TUI /skills picker. Do NOT port options-mode (Phase 3h, separate plan). Commit-per-skill or single bundle commit, your judgment. Pitfall: codex's skills field in plugin.json supports only ONE path inside plugin root — see Phase 2b note in roadmap."
```

---

## D — ~~`F-013-perms`~~ — closed (obsolete-by-design, Phase 5 drop-Claude)

> Closed 2026-05-13. F-013 is structurally Claude-only (Codex/Gemini share `BasePermissionHandler` which has no `mode` field). The Claude surface itself is being deleted in Phase 5 of the roadmap, so fixing this latent path pays nothing back. TypeScript blocks the misuse at compile time today (`PermissionResponse.mode: ClaudeSdkPermissionMode`). The latent code path stays as-is at `packages/happy-cli/src/claude/utils/permissionHandler.ts:87-89` until Phase 5 deletion removes the surface. See `.ralph/jobs/f-013-perms-closeout/plan.md` for full rationale.

---

## E — `F-015-toast` — Stale-creds toast on cold launch

```
/plan-with-ralph "F-015 fix — stale-creds profile-parse error toast surfaces on cold app launch before pair completes (cosmetic). Per .ralph/jobs/devtunnels-E-cleanup/notepad.md F-015 entry — re-read exact text before scoping. Trace: app cold-launches → AuthContext loads persisted creds from TokenStorage → if a persisted profile is in the pre-Sprint-E shape, profileParse throws → an error toast surfaces before the user sees the pair screen. Files likely involved: packages/happy-app/sources/auth/AuthContext.tsx, packages/happy-app/sources/sync/profile.ts (profileParse), packages/happy-app/sources/auth/tokenStorage.ts. Fix: suppress the toast on the pre-pair branch (TokenStorage has no machine credentials yet); silently fall through to the pair screen. Do NOT add a backwards-compat shim to profileParse — per the production-quality-code preference, delete unused shape branches if they exist. Read packages/happy-app/CLAUDE.md sync invariants. Acceptance: cold launch with no creds → pair screen, zero error toast; cold launch with valid post-Sprint-E creds → session list as before; pollutes-MMKV launch (simulate by writing a v1 profile shape) → pair screen, zero toast. Test command: pnpm --filter '{packages/happy-app}' exec vitest run 2>&1 | tee /tmp/codexu-f015.log; reference F-015."
```

---

## F — `mcp-discovery` — Codex agent project-`.mcp.json` parity

> Parallel with everything in batch 1 (different file from perf workstreams; isolated to `packages/happy-cli/src/codex/runCodex.ts`).

```
/plan-with-ralph "Add per-cwd .mcp.json discovery for the codex agent under happy-cli. Per plans/codexu-roadmap.md 'Codex agent project-.mcp.json parity' bullet. Gap: the Claude agent under happy reads .mcp.json from session cwd (Claude Code's native convention), but the codex agent does NOT — packages/happy-cli/src/codex/runCodex.ts:700-705 builds the mcpServers object handed to client.startThread({ mcpServers }) with ONLY the 'happy' bridge entry; project-level MCP servers are silently dropped. The codex fork at gim-home/codex HEAD ed5d2fd has .mcp.json reading code only in the external-agent one-shot migrator and the plugin-internal loader; no per-thread cwd discovery exists upstream. Fix on the happy-cli side: read <process.cwd()>/.mcp.json (Claude shape: { mcpServers: Record<string, { command: string; args?: string[]; env?: Record<string,string>; type?: 'stdio' | 'http'; url?: string }> }), validate with a Zod schema, merge its mcpServers into the object passed to startThread AND resumeExistingThread (both call sites in runCodex.ts at lines ~724 and ~791). On malformed .mcp.json or individual entry validation failure, log a structured warning via @/ui/logger and skip that entry — never abort the session. Silently skip if .mcp.json is absent. Read packages/happy-cli/CLAUDE.md and packages/happy-cli/src/daemon/CLAUDE.md for the codex transport context. Acceptance: 3 new tests in packages/happy-cli/src/codex/runCodex.test.ts or sibling — (a) cwd with valid .mcp.json containing 1 entry, assert mcpServers passed to startThread mock contains BOTH 'happy' bridge AND the project entry; (b) absent .mcp.json, assert only 'happy' bridge passed; (c) malformed .mcp.json (broken JSON or invalid shape), assert warning logged + only 'happy' bridge passed. Test command: pnpm --filter '{packages/happy-cli}' exec vitest run 2>&1 | tee /tmp/codexu-mcp-disc.log. Cross-package typecheck stays green. Single commit referencing the roadmap bullet. Update the roadmap bullet to mark this delivered."
```

---

## `userid-cleanup` — drop multi-tenant `userId` scoping from happy-server

> **Sequence after `perf-WS3` lands.** WS3's current plan adds a per-user replay-buffer ring; this cleanup strips that partition (and ~140 other `userId` references) since happy-server is embedded in a single-user daemon. Doing this BEFORE WS3 lands would force WS3's mid-flight redesign — wait.

```
/plan-with-ralph "Drop multi-tenant userId scoping from happy-server. Per plans/codexu-roadmap.md 'Drop userId scoping in happy-server' bullet. Context: happy-server is now embedded inside the per-user daemon (Sprint A createHappyServer() + dualListenerBinding); exactly ONE user per process. Multi-tenant userId scoping (~140 refs across packages/happy-server/sources/) is dead weight. Scope: remove userId from request decorators (api.ts:88, loopbackCapability.ts:34); drop userId from Prisma queries on Session / SessionMessage / Machine; simplify eventRouter (packages/happy-server/sources/app/events/eventRouter.ts) to single-user fan-out (no per-user partition); drop allocateUserSeq's userId scoping (becomes process-global seq). Keep Prisma columns themselves — schema migration is OUT OF SCOPE; only code paths change. PREREQUISITE: perf-WS3 must already be on main; WS3's per-user ring buffer's userId partition gets stripped as part of this commit (mention this in commit body referencing the WS3 commit). Read packages/happy-server/CLAUDE.md before starting. Acceptance: cross-package typecheck green (happy-server + happy-cli + happy-app); all happy-server tests green; commit body lists every userId code path removed with file:line counts. Test command: pnpm --filter '{packages/happy-server}' exec vitest run 2>&1 | tee /tmp/codexu-userid-cleanup.log; cross-package: pnpm --filter '{packages/happy-server}' --filter '{packages/happy-cli}' --filter '{packages/happy-app}' exec tsc --noEmit 2>&1 | tee /tmp/codexu-userid-tc.log. Single commit on main. Pitfall: socket auth payload — clients still send a token; resolve it once at process start to the single-user identity, don't strip the auth layer."
```

---

## `codex-parity-audit` — research: codex-vs-Claude agent feature parity survey

> Research/audit ralph command (no code commits). Output is a new doc + roadmap entries listing every Claude-Code feature the codex agent under happy doesn't yet match, with proposed fix-site (happy-cli vs codex submodule overlay vs upstream) per gap. Parallel with anything — produces only docs.

```
/plan-with-ralph "Codex agent parity audit — produce a survey doc listing every Claude-Code feature the codex agent under happy doesn't match today. Motivation: the .mcp.json discovery gap (see plans/codexu-roadmap.md 'Codex agent project-.mcp.json parity' bullet) was found by accident; more gaps likely exist. Run a structured survey: (1) For each Claude-Code feature category — project-MCP discovery, project-CLAUDE.md auto-load, project-.claude/skills/ discovery, hook system parity, slash commands, plan mode / ExitPlanMode, permission modes (7-mode wire vs codex 4-mode), agent-spawned sub-threads, attachment handling, file-watch / SessionStart triggers, statusline parity, etc. — check whether the codex agent path (packages/happy-cli/src/codex/runCodex.ts + codex submodule) honors it. (2) For each gap, propose a fix-site: (a) happy-cli side (read project files + plumb into codex's startThread params), or (b) new package in codex/codex-rs-overlay/ (overlay crate, no upstream-canonical edits), or (c) upstream codex patch (only if absolutely necessary; minimize-conflict-surface tenet). (3) Estimate effort and severity per gap. Read packages/happy-cli/src/codex/runCodex.ts + codexAppServerClient.ts for the current codex-side surface. Read packages/happy-cli/src/claude/{claudeLocalLauncher,claudeRemoteLauncher,permissions}.ts + the project's .claude/ + .mcp.json + CLAUDE.md files for the Claude-side conventions. Read codex/codex-rs-overlay/codex-copilot/ for an example of the overlay-crate pattern. Read plans/codexu-roadmap.md §'Codex changes — minimize upstream conflict surface' before proposing any codex-side fix. Output: new file plans/codex-agent-parity-audit.md with one section per gap (Gap / Current State / Proposed Fix Site / Effort / Severity / Suggested ralph-command-shape). Also update plans/codexu-roadmap.md by appending a 'Codex agent parity audit' bullet under the Sprint E follow-on section pointing at the new doc, and update plans/overview.html similarly. NO CODE CHANGES — this is research output only. Acceptance: the doc lists at minimum 5 gaps (including .mcp.json already known); each gap has a concrete proposed fix-site and effort estimate; no false positives — every claimed gap is verified against current code with file:line evidence. Surface the doc to operator for review before opening any subsequent ralph fix-commands."
```

---

# Batch 2 — additional roadmap stories

Less-critical or sequenced-after-batch-1 ralph commands. Each is parallel-safe with the batch-1 set (different file trees) **except as noted**. Mark batch-2 status in the bottom table.

## G — `perf-WS2` — Realtime perf, optimistic placeholder

> **Wait until `perf-WS3` lands** — both touch `storage.ts` and WS3's replay-overflow semantics define WS2's fallback scope.

```
/plan-with-ralph "Realtime sync perf — Workstream 2: stop blocking new-message processing on a full sessions re-fetch. Per plans/realtime-sync-perf.md §Workstream 2. When a new-message socket event arrives for a sid not in storage (current code at packages/happy-app/sources/sync/sync.ts:1693-1710 blocks on sessionsSync.invalidateAndAwait() then replays queued messages), instead synthesize an optimistic placeholder StoredSession from event envelope fields (machineId from socket scope, sid, lastSeq from message, placeholder metadata { path: '', host: '', flavor: 'unknown' }, active: true, updatedAt: createdAt), insert via storage.applySessions, then apply the message immediately via the existing enqueueMessages fast path. Kick off sessionsSync.invalidate() (NOT invalidateAndAwait) to back-fill real metadata; applySessions overwrites the placeholder when the fetch resolves. Remove sessionInitInFlight set + pendingNewMessages queue (lines ~199-200) — both become unnecessary. Read packages/happy-app/CLAUDE.md sync invariants AND the new 'Session/machine-scoped network calls' note before editing. Acceptance: new test in sources/sync/sync.test.ts — mock storage with no session for sid='sx', fire new-message event, assert placeholder inserted + message enqueued BEFORE any fetchSessions mock awaited; existing new-message lifecycle tests (turn-start/turn-end thinking) stay green. Test command: pnpm --filter '{packages/happy-app}' exec vitest run sources/sync/sync.test.ts 2>&1 | tee /tmp/codexu-ws2.log. PREREQUISITE: WS3 must already be on main — re-read WS3's replayOverflow handling so the placeholder path defers to socket replay when available. Single commit; update plans/realtime-sync-perf.md and docs/validation/devtunnels-boox-result.md."
```

---

## H — `1a-fork-doc` — Phase 1a, Codex fork strategy commit

> Parallel with anything. **Touches codex submodule (documentation only)** — edits stay in `codex/docs/` and top-level `codex/CLAUDE.md`. Work in a `.ralph/jobs/<name>/codex-worktree/` worktree of the codex submodule. Do not edit `codex/external/repos/codex-patched/codex-rs/` or `codex/codex-rs-overlay/` — those are out of scope for Phase 1a's docs-only commit.

```
/plan-with-ralph "Phase 1a — Codex fork strategy commit. Per plans/codexu-roadmap.md §Phase 1a + Decisions still open #1 + §'Codex changes — minimize upstream conflict surface'. Document the current fork strategy: codex/ is a git submodule (gim-home/codex). Inside, codex/external/repos/codex-patched/codex-rs/ is a subtree mirror of openai/codex; divergence work lives in codex/codex-rs-overlay/ as overlay crates (codex-copilot, codex-copilot-launcher, codex-invariant-tests are the working precedent). Subtree pulls bring upstream openai/codex in; overlay crates Cargo-workspace-reference the subtree as their root. Documentation files to write (all in codex/docs/ or top-level codex/CLAUDE.md — DO NOT EDIT anything under codex/external/repos/codex-patched/ or codex/codex-rs-overlay/): codex/docs/implementation/architecture.md (new 'Fork strategy' section), codex/docs/implementation/patch-surface.md (note upcoming patches: plugin scoping per Phase 2c, AskUserQuestion primitive per Phase 2d, Claude-via-Copilot adapter per Phase 7), codex/CLAUDE.md (top-level pointer to codexu-roadmap.md and to the minimize-conflict-surface tenet). Read codexu's docs/plans/codex-fork-extension-strategy.md FIRST — that doc covers the consumer side of fork strategy (what codexu assumes about cadence + RPC contract version); do not pick a strategy that invalidates its assumptions. Workflow: create a worktree of the codex submodule at .ralph/jobs/<job-name>/codex-worktree/ pointed at gim-home/codex's main; do edits there; commit on a topic branch in the submodule; push to gim-home/codex; then bump the codexu submodule pointer as a separate commit on codexu main. Acceptance: 3 files updated in codex submodule with internally consistent strategy + cross-reference; codexu submodule pointer bumped; codexu-roadmap.md §Decisions made gets a new entry locking the strategy. No code changes, no tests. Surface choice to operator before final commit if more than one approach seems viable."
```

---

## I — `1b-multidev` — Phase 1b sub-tasks 3 + 4, multi-device

> Parallel with anything outside `packages/happy-cli/src/codex/` and the seamless-multi-device spec.

```
/plan-with-ralph "Phase 1b sub-task 3 + 4 — multi-device discoverability hint and multi-client approval fan-out. Per plans/codexu-roadmap.md §Phase 1b sub-tasks 3-4 + docs/plans/codex-seamless-multi-device.md sub-tasks 3-4. Sub-task 3: terminal-startup hint when codex starts in a cwd that already has a discoverable app-server, pointing user at phone attach option. Files: packages/happy-cli/src/codex/codexAppServerClient.ts (discovery + startup messaging) + packages/happy-cli/src/ui/start.ts or equivalent. Sub-task 4: when multiple clients are attached (laptop TUI + phone via tunnel), an approval prompt from codex must fan out to all attached clients; first-answer-wins; remaining clients see resolution. Files: packages/happy-cli/src/codex/runCodex.ts + packages/happy-cli/src/codex/codexAppServerClient.ts approval-handler plumbing. CRITICAL CONTEXT: re-read docs/plans/codex-seamless-multi-device.md against the finalized post-Sprint-E tunnel protocol — the spec was drafted assuming relay-forwarded phone path, but tunnels attach phone DIRECTLY to CLI's local Socket.IO server (no relay). Specifically read the 'Walkthrough Step 5 fan-out semantics shift layer' note in roadmap §Phase 1b. Decide whether codex app-server's native fan-out covers tunneled clients OR whether CLI's lifted rpcHandler must broadcast — verify by tracing one approval event from codex → CLI → tunneled phone. Read packages/happy-cli/CLAUDE.md and packages/happy-cli/src/daemon/CLAUDE.md first. Acceptance: integration test for sub-task 3 (mock discovery file existence, assert hint message); integration test for sub-task 4 (mock two attached clients, fire approval, assert both receive + first-answer wins). Test command: pnpm --filter '{packages/happy-cli}' exec vitest run 2>&1 | tee /tmp/codexu-1b34.log. Single commit per sub-task (two commits)."
```

---

## J — `3b-agents` — Phase 3b-i + 3b-ii, subagents → agent roles

> Parallel with most things; serializes with other Phase 3 sub-phases that touch `packages/codexu-plugin/.codex-plugin/plugin.json`.

```
/plan-with-ralph "Phase 3b-i + 3b-ii — convert 12 ralph subagents to codex [agents.<role>] TOML + pick permission profile per role. Per plans/codexu-roadmap.md §Phase 3b-i and §Phase 3b-ii. Source: C:/ai-developer-toolkit/plugins/ralph/agents/ — 12 .md subagent files (code-fixer, code-reviewer, criteria-validator, docs-reviewer, docs-updater, dsat-analyst, plan-reviewer, progress-analyst, refactoring-agent, security-fixer, security-reviewer, story-doctor). Target: ~/.codex/agents/<role>.toml per role + [agents.<role>] entries in ~/.codex/config.toml. Each [agents.<role>] declaration carries ONLY description, config_file, nickname_candidates — everything else (developer_instructions, model, model_reasoning_effort, permission profile) goes in the role config TOML. Model mapping from frontmatter: keep sonnet/opus assignments as-is, convert to codex model slugs (gpt-5-codex for sonnet equivalent, gpt-5.5 for opus or whichever the operator wants — surface this choice in plan form). Phase 3b-ii: NO ralph subagent declares tools: allowlist (verified roadmap §3b-ii) — collapse to picking PermissionProfile per the table: read-only for code-reviewer/docs-reviewer/security-reviewer/criteria-validator/progress-analyst/plan-reviewer/dsat-analyst, workspace-write for code-fixer/docs-updater/security-fixer/refactoring-agent/story-doctor. Document any Bash-subcommand restrictions needed (no profile equivalent in codex; document workaround). Read packages/codexu-plugin/CLAUDE.md if present + the existing Phase 1c scaffolding. Acceptance: 12 .toml files + 12 config.toml entries; one role (suggest code-reviewer) verified end-to-end via `codex exec` agent spawn returning a probe sentence. Single commit on main (the role .toml files are user-config, not repo-tracked — only the config.toml template + docs go in repo). Surface model-mapping choice to operator before implementing."
```

---

## K — `3c-hooks` — Phase 3c, Ralph hooks port

> Light verification task. Likely zero work. Parallel with anything.

```
/plan-with-ralph "Phase 3c — port ralph plugin hooks from Claude Code to codex hook system, OR verify there are no hooks to port. Per plans/codexu-roadmap.md §Phase 3c. Toolkit ralph plugin's CLAUDE.md (C:/ai-developer-toolkit/plugins/ralph/CLAUDE.md) says 'skills-only', suggesting no hooks. Verify by inspecting C:/ai-developer-toolkit/plugins/ralph/ — look for .claude/hooks/ entries, hook references in skill SKILL.md frontmatter, or any subprocess invocation pattern that mirrors Claude Code's PreToolUse/PostToolUse/SessionStart/Stop/Notification/UserPromptSubmit/PreCompact lifecycle. If zero hooks found, write a one-paragraph 'Phase 3c verified — no hooks to port' note in plans/codexu-roadmap.md under §Phase 3c (replacing the open status) and that's the entire commit. If hooks ARE found, port to codex hook system per codex/core/src/hook_runtime.rs — surface plan to operator before implementing. Acceptance: roadmap §3c marked verified-no-port OR ported hooks ship with parity tests. Light single commit either way."
```

---

## L — `3d-workers` — Phase 3d, codex-based workers via native spawn

> Parallel with batch-1 perf work; serializes with I (`3b-agents`) since both rely on the `[agents.<role>]` config.

```
/plan-with-ralph "Phase 3d — replace ralph's codex-exec.sh subprocess pattern with codex native spawn-agent-role for codex-based workers. Per plans/codexu-roadmap.md §Phase 3d (+ §3d-i compatibility audit). PREREQUISITE: Phase 3b-i (I 3b-agents) must have landed the agent role TOMLs so spawn-agent-role has roles to invoke. Today: ralph orchestrator skill runs `bash → codex-exec.sh` to spawn a fresh `codex exec` for each codex-based worker (planner, reviewer, verifier) — separate process, no continuity. Target: ralph orchestrator skill calls the native spawn-agent-role tool; each worker becomes a sub-thread on the SAME app-server codexu is connected to. Compatibility constraints (audited 2026-05-02, see roadmap §3d-i): SpawnAgentArgs requires message (string) + task_name; inter-agent fast path supports text-only initial input (UserInput::Text only); fork_context field is rejected; deny_unknown_fields is strict; empty agent_type maps to default role; task_name becomes AgentPath. Files to touch: ralph orchestrator skill SCRIPT under C:/ai-developer-toolkit/plugins/ralph/skills/run-ralph/ (or wherever the codex-exec.sh shellout lives) — replace shell invocation with codex native spawn API call. codex-exec.sh stays in tree but becomes unused for codex roles (still used by claude-exec.sh and copilot-exec.sh per Phase 3e). Read packages/codexu-plugin/CLAUDE.md and the spawn audit in roadmap. Acceptance: one orchestrator job (suggest a small 3-way review) runs end-to-end using native spawn; each worker thread visible in codexu/codex thread list (Phase 6 resumability hook); ralph .ralph/jobs/<name>/ artifacts produced as before. Test by running an existing job end-to-end via `/implement-with-ralph` against a trivial PRD. Surface to operator before merging — this changes ralph orchestration behavior."
```

---

## M — `3fg-package` — Phase 3f + 3g, asset migration + plugin packaging

> Serializes with I (3b-agents) and K (3d-workers) for plugin.json edits. Otherwise parallel.

```
/plan-with-ralph "Phase 3f + 3g — port ralph plugin assets (shell libs, scripts) and convert plugin packaging from Claude Code format to codex format. Per plans/codexu-roadmap.md §Phase 3f and §Phase 3g. Phase 3f assets to port from C:/ai-developer-toolkit/plugins/ralph/: lib/finding-merge.sh, lib/parse-not-tested-trailers.sh (shell utilities), any other lib/*.sh, statusline scripts (.ps1 + .sh) if present. Target: under packages/codexu-plugin/ — preserve directory structure. Phase 3g packaging: convert C:/ai-developer-toolkit/plugins/ralph/.claude-plugin/plugin.json to packages/codexu-plugin/.codex-plugin/plugin.json (new manifest schema per codex/core-plugins/src/manifest.rs); update bundle layout (no agents/ directory — agent roles go in user config per Phase 3b-i); set up marketplace catalog at packages/codexu-plugin/.agents/plugins/marketplace.json (per Phase 1c finding — `codex plugin install <path>` does not exist; only `codex plugin marketplace add <SOURCE>`). Existing packages/codexu-plugin/.agents/plugins/marketplace.json already lists codexu-plugin (Phase 1c); extend or add ralph as second catalog entry, your choice. Update install instructions in C:/ai-developer-toolkit/plugins/ralph/CLAUDE.md and (if exists) plugins/options-mode/CLAUDE.md to reflect codex marketplace add. Read packages/codexu-plugin/README.md + Phase 1c §Personal plugin scaffolding. Acceptance: `codex plugin marketplace upgrade codexu` picks up ralph plugin; ralph skills + asset references resolve from new locations; one user-invocable skill works via TUI /skills picker. Single commit or split per-asset, your judgment."
```

---

## N — `3h-options` — Phase 3h, options-mode plugin migration

> Separate plugin (options-mode) — parallel with everything else.

```
/plan-with-ralph "Phase 3h — migrate options-mode plugin from Claude Code (575 LOC of Node.js hook logic + slash command + statusline + tag-protocol enforcement) to codex plugin format. Per plans/codexu-roadmap.md §Phase 3h. Source: C:/ai-developer-toolkit/plugins/options-mode/ — 4 hook files (SessionStart, UserPromptSubmit, Stop, statusline), slash command /options-mode, PowerShell + Bash statusline scripts. What it does today: SessionStart injects rules (agent must close every turn with <options-mode>continue</options-mode> tag OR structured choice prompt); UserPromptSubmit handles /options-mode on|off|status toggle; Stop hook reads JSONL transcript, deterministically checks for closing tag, blocks turn-end if missing; statusline shows enabled/disabled state; NO LLM classification — pure tag detection. Codex hook parity (verified 2026-05-02, see roadmap §3h codex hook parity check): config/src/hook_config.rs:42 defines Stop hook kind — capabilities options-mode needs are supported. Target: new codex plugin packages/codexu-options-mode-plugin/ (or under codexu-plugin/, your choice — surface to operator). Convert Node hooks to codex hook format; convert slash command; preserve tag-protocol enforcement byte-identically. CRITICAL: the Stop hook reads codex JSONL transcript shape (NOT Claude's) — verify against codex thread JSONL format and adapt the last_assistant_message detection per roadmap note. Read C:/ai-developer-toolkit/plugins/options-mode/CLAUDE.md if present. Acceptance: enable plugin; agent ends turn WITHOUT tag → Stop hook returns decision:'block' with reason + continuation prompt; agent ends turn WITH <options-mode>continue</options-mode> tag → Stop allows turn end; /options-mode off → Stop becomes pass-through; statusline shows current state. Test command: integration test against codex exec session with mock transcript shapes. Single commit; reference Phase 3h."
```

---

## P — `happy-upstream-sync` 🔄 — periodic upstream-commit triage

> **Periodic** (~every 4 weeks). Last full sync: 2026-05-03 (absorbed 79 commits). Skill: `.agents/skills/happy-upstream-sync/SKILL.md`. Parallel-safe with everything else (touches mostly happy-app + docs).

```
/plan-with-ralph "Run the happy-upstream-sync periodic procedure. Per the skill at .agents/skills/happy-upstream-sync/SKILL.md (read end-to-end first). Anchor on the latest upstream release: gh api repos/slopus/happy/releases/latest --jq '{tag,sha:.target_commitish}'. Resume from the previous sync's upstream commit (look in docs/fork-notes.md and the 'Upstream merge YYYY-MM-DD' bullet in plans/codexu-roadmap.md — last full sync was 2026-05-03 at slopus/happy commit absorbed in our 25fe2cf3). For each commit in the range: classify cherry-pick / manual / defer / skip per the heuristics in the skill (file-location-based fast filter; happy-app/sources/sync is usually Manual; happy-server is usually Skip; happy-app/sources/components UI is usually Cherry-pick; bug-fix commits in code we still have are usually Cherry-pick; libsodium/account-auth/multi-tenant code is Skip). Apply decisions. Run cross-package typecheck + happy-app vitest (skill has the exact tee commands). Update the 4 sync-trail docs in one commit: docs/fork-notes.md, plans/codexu-roadmap.md 'Upstream merge' bullet, packages/happy-app/CHANGELOG.md if user-visible, regenerate sources/changelog/changelog.json. Final commit message: 'chore(upstream-sync): absorb slopus/happy through <tag> (<N> commits triaged)' with per-bucket counts in body. Surface to operator if cherry-pick volume is >30 (split into batches) or if any pick fails typecheck after manual conflict resolution. After commit, bump the lastRanAt timestamp for happy-upstream-sync in plans/overview.html's roadmap-data JSON to today's date."
```

---

## Q — `codex-upstream-rebase` 🔄 — periodic codex-submodule rebase on openai/codex

> **Periodic** (~every 4 weeks). Procedure lives in the codex submodule's existing skill: `codex/.claude/commands/rebase-upstream.md` + `sync-upstream.md`. This codexu-side entry is a tracking reminder.

```
/plan-with-ralph "Run the codex-submodule upstream rebase. The procedure lives in the codex submodule itself: codex/.claude/commands/rebase-upstream.md and codex/.claude/commands/sync-upstream.md (read both end-to-end before starting). Workflow: cd into a worktree of the codex submodule at .ralph/jobs/<job-name>/codex-worktree/ pointed at gim-home/codex's main (don't edit the parent codexu checkout's submodule directly — minimize-conflict-surface tenet from plans/codexu-roadmap.md). Run the subtree pull from openai/codex per the codex submodule's sync-upstream skill. Resolve conflicts between upstream and our overlay crates (codex-rs-overlay/codex-copilot, codex-copilot-launcher, codex-invariant-tests). Run cargo build --workspace from inside codex/external/repos/codex-patched/codex-rs to verify. Commit on a topic branch IN THE SUBMODULE; push to gim-home/codex; then in this codexu repo bump the submodule pointer as a SEPARATE commit on codexu main. After commit, bump the lastRanAt timestamp for codex-upstream-rebase in plans/overview.html's roadmap-data JSON. Surface to operator if openai/codex has a major-version upstream bump or if overlay crates need API-shape changes to match new upstream — those are escalations, not routine sync work."
```

---

## R — `agent-view-research` — Research Claude Code's agent-view feature

> ✅ **LANDED 2026-05-14.** Research doc at `plans/agent-view-research.md`. Spawned 6 follow-up tasks (Y–DD below): `agent-tree-rpc`, `session-parent-link`, `mobile-tree-view`, `session-role-pill`, `spawn-from-app`, `agent-status-stream`. Each tagged `spawnedFrom='agent-view-research'` in `plans/overview.html` roadmap-data JSON. These follow-ups ARE the Phase 6 ("Long-lived teammates") implementation per `plans/codexu-roadmap.md:2455-2479`. Operator should review the research doc before opening any follow-up code task.
>
> Research-only ralph job. Output: `plans/agent-view-research.md` + a decomposition into follow-up tasks. Parallel with anything.

```
/plan-with-ralph "Research Claude Code's 'agent view' feature (released recently). Output: a research doc at plans/agent-view-research.md that covers: (1) what the feature IS — how it presents agents, what UI affordances it gives, what spawning model it uses, what state it persists, what permissions / scoping it enforces; (2) where it lives in Claude Code (file paths, schema, RPC surface) — read the relevant source if accessible from C:/harness-efforts/claude-code/worktrees/main; (3) how it differs from codex's existing multi_agents_v2/spawn.rs and codex's [agents.<role>] TOML world (read codex/external/repos/codex-patched/codex-rs/multi_agents_v2/spawn.rs as reference — READ-ONLY per the minimize-conflict-surface tenet in plans/codexu-roadmap.md); (4) what concepts we'd want to bring to codexu: spawning model, state, persistence, communication, plugin-scoping. Output: the doc + a decomposition into follow-up ralph tasks with file:line refs and effort estimates. NO CODE CHANGES — research-only. Add new task entries to plans/parallel-assignments.md and plans/overview.html roadmap-data JSON for each follow-up that emerges from the research. Cross-reference plans/codexu-roadmap.md §Phase 6 'Long-lived teammates' since this feature likely overlaps. Surface to operator before opening any follow-up code task — the research output is itself the deliverable."
```

---

## S — `plugin-scope-agents` — top-level-only plugins + agent-spawner pattern

> Blocked on `agent-view-research`. Extends Phase 2c (host vs agent context) with a "top-level only" plugin scope, plus a designated agent-spawner so top-level-scope plugins remain reachable through it.

```
/plan-with-ralph "Extend codex's plugin-scoping (Phase 2c — host vs agent context) with a third dimension: 'top-level-agent-only' plugins. Today's spec: scope=host|agent|both. New spec: scope=top-level|subagent|both (or equivalent — see plans/codexu-roadmap.md §Phase 2c for current shape). Some plugins like ralph-orchestration must be available only to TOP-LEVEL agents (operator-spawned sessions, or sessions spawned by a designated 'agent-spawner' agent) — never to sub-agents spawned via codex's multi_agents_v2/spawn.rs (recursion + context bloat). Build the spawner agent (similar to Claude Code's agent-view if the research from agent-view-research clarifies the model): it can SPAWN top-level sessions on behalf of the operator, those spawned sessions inherit top-level scope and have ralph-orchestration + similar host-tier plugins. Read plans/agent-view-research.md (output of agent-view-research) before scoping. Read codex/codex-rs-overlay/* for divergence-crate precedent (changes should land as overlay if they touch codex; happy-cli changes are fine). Plugin manifest schema lives in codex/external/repos/codex-patched/codex-rs/core-plugins/src/manifest.rs (READ-ONLY). Acceptance: ralph-orchestration plugin manifest declares scope=top-level; spawning a subagent that tries to load it fails or silently no-ops; spawning via the new agent-spawner succeeds and the new session sees ralph-orchestration. Tests: codex integration test with mock plugin in both scopes. Cross-package typecheck green. Surface to operator before merging — this changes the plugin-loading contract."
```

---

## T — `agent-comms` — top-level agent ↔ top-level agent comms (3 scopes)

> Blocked on `plugin-scope-agents` + `channels-research`. Three scoping dimensions — design has to decide unified-transport vs distinct-mechanisms.

```
/plan-with-ralph "Build top-level-agent ↔ top-level-agent communication across THREE distinct scopes — design has to decide whether to unify them under one transport or distinguish them with different mechanisms.

Scope A — Cross-tunnel / cross-machine (codexu-specific). Two top-level sessions live on different daemons (e.g., laptop daemon + remote machine daemon, both paired to the same operator's GitHub identity). Today daemons are silo'd (single-user-per-process embedded happy-server per Sprint A); no cross-daemon routing exists. This is the hardest scope because there's no existing routing layer. Options: (i) re-introduce a relay (we explicitly deleted this — operator policy); (ii) use Microsoft Dev Tunnels as a P2P channel between daemons; (iii) operator's mobile app acts as the rendezvous broker. Surface this choice to operator BEFORE designing the wire shape.

Scope B — Same-machine, daemon-managed. Two top-level sessions on ONE daemon. Daemon already coordinates via Socket.IO event-routing (packages/happy-server/sources/app/events/eventRouter.ts). The cross-session message-pass would extend that with a per-session inbox + a tool the agent invokes. This is the easiest scope.

Scope C — Parent-spawned-child relationship. An agent-spawner (from plugin-scope-agents) spawned the child top-level session; the parent retains a 'session reference' or capability. Communication has implicit trust + a known channel from spawn time. Could be a strict subset of B/A but with stronger invariants (e.g., parent can read child's logs/state; child can post back to parent's inbox without explicit handshake).

The design must answer: are these three separate mechanisms (different MCP servers / RPC surfaces per scope), one unified transport with scope-aware routing (single MCP with a 'scope' parameter), or a spectrum (parent-child piggybacks on B; B uses daemon Socket.IO; A needs the explicit cross-daemon design)?

Two consumer-facing channels to cover regardless of scope: (1) SPAWNING — request another top-level agent be spawned with role/cwd/plugins; (2) MESSAGE PASSING — request-response or pub-sub between live sessions.

Read plans/agent-view-research.md, plans/channels-research.md, plans/agent-view-followups.md if exists, codex/external/repos/codex-patched/codex-rs/multi_agents_v2/ for codex's existing inter-agent plumbing (READ-ONLY per minimize-conflict-surface). Read packages/happy-cli/src/api/apiMachine.ts + apiSession.ts for how spawn-happy-session is currently exposed; the agent-comms MCP likely lives in happy-cli. Read packages/happy-server/sources/app/events/eventRouter.ts for the existing fan-out primitive that Scope B would extend.

Acceptance: design doc + per-scope working fixture: (B) two sessions on the same daemon exchange a message; (C) a spawned child reports back to its parent without re-handshake; (A) the design names a concrete transport choice for cross-daemon (no full implementation required for the first pass). Tests: vitest fixture for each scope. Pitfall: cycle-prevention applies across scopes (A spawns B spawns A → loop); need hop counter + operator-approval gate. Surface ARCHITECTURAL CHOICES (relay-vs-P2P-vs-broker, unified-vs-separate transports) to operator BEFORE landing code."
```

---

## U — `channels-research` — Research Claude Code's "channels" + codex implementation plan

> Research-only. Goal: 2-way agent ↔ MCP communication. Parallel with anything.

```
/plan-with-ralph "Research Claude Code's 'channels' concept and design a codex equivalent if it doesn't exist there. Goal: 2-way communication between agents and MCP servers (today MCP is largely request-response from the agent; we want the MCP to be able to push messages back / stream state changes / interrupt the agent). Output: plans/channels-research.md covering: (1) What Claude Code calls 'channels' — read the relevant Claude Code source (C:/harness-efforts/claude-code/worktrees/main/ if accessible) + Anthropic's docs/changelog. Capture the wire shape, lifecycle (open/close), back-pressure model, how an MCP server discovers/registers a channel, how the agent subscribes. (2) Codex's current MCP support — `codex` ships an MCP client; what does it support today? Read codex/external/repos/codex-patched/codex-rs/ (READ-ONLY per minimize-conflict-surface tenet) for mcp_tool_call.rs / mcp_client / rmcp_client modules. Identify whether codex's MCP transport (stdio? sse? streamable-http? something else?) admits server-initiated messages. (3) Gap analysis: if codex doesn't support 2-way channels, what's the minimal patch? An overlay crate in codex/codex-rs-overlay/ that extends mcp_client with channel semantics? A new tool type? A protocol upgrade? (4) Implementation sketch: file:line refs for where the patches would land, effort estimate, risk areas. (5) Cross-reference Phase 2d (ask_user_question primitive) and the MCP spec evolution (https://spec.modelcontextprotocol.io/) — channels might already be standardized. NO CODE — research + design only. Add follow-up ralph task entries to plans/parallel-assignments.md if the gap analysis surfaces concrete next steps. Surface to operator before committing the doc."
```

---

## U.1 — `mcp-server-notifications` — Bridge rmcp notification handlers into the codex agent event loop

> Concrete Stage A follow-up surfaced by `plans/channels-research.md`. Codex's `rmcp-client` already decodes every server→client notification kind the MCP spec defines, but `logging_client_handler.rs:49–135` drops them into `tracing::info!` with no back-channel to the agent. This task wires them through `tx_event: Sender<Event>` — modelled on the existing elicitation path (`codex-mcp/src/elicitation.rs:103–231`). Minimize-conflict-surface tenet applies; prefer overlay crate + minimal sandbox-patch seams. Parallel with anything that doesn't touch rmcp-client.

```
/plan-with-ralph "Plumb MCP server-initiated notifications (progress, cancelled, resources/updated, resources/list_changed, tools/list_changed, prompts/list_changed, message) AND sampling/createMessage into the codex agent event loop. Today codex's rmcp-client (codex/external/repos/codex-patched/codex-rs/rmcp-client/) decodes every one of these but the handlers in src/logging_client_handler.rs:49–135 are tracing-only — they never reach the agent. The elicitation path at codex/external/repos/codex-patched/codex-rs/codex-mcp/src/elicitation.rs:103–231 is the working precedent: emit Event { msg: EventMsg::… } over the tx_event: Sender<Event> sink that's already wired in at codex/external/repos/codex-patched/codex-rs/codex-mcp/src/connection_manager.rs:175. READ-ONLY on codex/external/repos/codex-patched/ per minimize-conflict-surface tenet (plans/codexu-roadmap.md:190–228); prefer a new overlay crate at codex/codex-rs-overlay/codex-mcp-bridge/ for the NotificationBridge struct + EventMsg additions; accept minimal sandbox-patch seams in logging_client_handler.rs (~12 lines additive) and elicitation_client_service.rs (~30 lines for sampling/createMessage). Add a new Feature::McpServerNotifications gate (default off). Add an invariant test under codex/codex-rs-overlay/codex-invariant-tests/ asserting the bridge is off by default. Bump codex-protocol with new EventMsg variants (McpServerNotification, McpSamplingRequest). Effort estimate per plans/channels-research.md §6.5: ~3–5 d wall. Read plans/channels-research.md FIRST — it has the full file:line map, the overlay-vs-inline decision, and the risk surface. Surface the overlay-vs-inline-patch shape choice to operator BEFORE landing code."
```

---

## U.2 — `codex-channels` — Claude-Code-parity `experimental["codex/channel"]` envelope

> Stage B follow-up surfaced by `plans/channels-research.md`. **Deferred — decision required first.** Blocked on `mcp-server-notifications` landing AND on operator deciding whether channels (external-user-message envelope) are the right primitive for the intended use cases (vs raw notifications, which cover state-change push perfectly without the channels framing).

```
/plan-with-ralph "Design + implement Claude-Code-parity 'channels' on top of mcp-server-notifications: capability key experimental['codex/channel'] advertised by participating MCP servers, notification methods notifications/codex/channel and notifications/codex/channel/permission mirroring Claude Code's wire shape at D:/harness-efforts/claude-code/worktrees/main/src/services/mcp/channelNotification.ts:37–316. Agent-loop policy: when a channel message arrives between turns, enqueue as a prompt with priority:'next' semantics; when one arrives during an LLM call, buffer until the call completes (matches Claude Code's non-preemption behaviour). Permission half is out of scope for first cut — codex doesn't have a real-time permission dialog with race resolution to relay to. Use codex/ namespace, not claude/ (cross-vendor experimental keys aren't coordinated). READ plans/channels-research.md §6.2 FIRST — it has the full design. READ-ONLY on codex/external/repos/codex-patched/ per minimize-conflict-surface tenet. Effort estimate per plans/channels-research.md §6.5: ~1.5–2 d on top of mcp-server-notifications. SURFACE TO OPERATOR FIRST whether channels (as opposed to plain notifications) are wanted for the intended use cases — channels are specifically the 'external-user pipes messages into prompt queue' shape and may be narrower than the operator needs."
```

---

## V — `async-events-design` — Design async event listening for agents

> **Re-blocked 2026-05-14 on `mcp-server-notifications`.** Was briefly run — draft preserved at `plans/async-events-design.md` (working tree only) recommends long-poll MCP for v1 and channels-research's notification bridge as fast-follow. Operator decided the design should be informed by an actually-landed channels primitive before locking the v1 transport, otherwise the v1 risks settling on long-poll just because it ships faster. Resume after `mcp-server-notifications` (Stage A from `plans/channels-research.md`) lands.

```
/plan-with-ralph "Design how an agent listens to async events — e.g., 'wake me when a commit lands on main', 'notify me when a periodic task fires', 'tell me when another agent finishes its turn'. Today an agent's only async-trigger model is: exit and be re-spawned (e.g., a periodic background task that exits to wake the operator/agent). That's not ideal — loses context, restart latency, can't subscribe to fine-grained events. Output: plans/async-events-design.md covering: (1) The use cases — at least these 4: git events (commit on main / branch updated / push), periodic-task firings, inter-agent notifications (sibling-agent completion / sibling-agent question), file-system events (file changed under cwd). (2) Current options in Claude Code — is there a 'wait for X' tool? hooks? streamable MCP? A 'send-when-idle' channel? Read C:/harness-efforts/claude-code/worktrees/main/ if accessible. (3) Current options in codex — codex's hook system (config/src/hook_config.rs), inter-agent fast path in multi_agents_v2/, MCP support. READ-ONLY on codex/external/repos/codex-patched/ per minimize-conflict-surface. (4) Design options for codexu — compare at least: (a) MCP with 2-way channels (depends on channels-research outcome); (b) periodic background task that exits to wake agent (current model — note limits); (c) long-poll MCP tool (block until event); (d) a 'subscription' RPC on the codex app-server side that streams events to the agent's session; (e) hybrid (use codex hooks for in-session triggers, channels for cross-session). (5) Recommendation with rationale; identify the smallest-viable subset that covers the 4 use cases. (6) Surface to operator before committing follow-up implementation tasks. NO CODE — design only. The output doc IS the deliverable."
```

---

## W — `native-agent-parity` — Research codex parity with Claude Code's native subagents

> Research + decision doc. Unrelated to channels/async. Parallel with anything.

```
/plan-with-ralph "Research whether (and how) we want codex parity with Claude Code's native subagent palette — e.g., Explore (fast codebase exploration), Plan (architect), claude-code-guide, statusline-setup, etc. Today codex's [agents.<role>] TOML system is operator-defined; Claude Code ships preset subagent types with curated system prompts. Output: plans/native-agent-parity.md covering: (1) Enumerate Claude Code's preset subagents — use the Agent tool yourself if accessible to list them, or grep C:/harness-efforts/claude-code/worktrees/main/ for the subagent registry. For each: name, purpose, tool allowlist, model preference, system prompt. (2) For each, assess whether it makes sense for codex too: high-value port (e.g., Explore — every developer benefits from a fast codebase-explorer subagent) vs Claude-specific (e.g., claude-code-guide — references Claude Code features that may not apply). (3) Implementation packaging — should codex parity ship as: (a) a plugin in packages/codexu-plugin/ that registers default [agents.<role>] entries; (b) an overlay crate in codex/codex-rs-overlay/ that bakes them into the binary; (c) a one-time `codex agent install --preset claude-code-equivalents` migration. Discuss tradeoffs. (4) Should we LEVERAGE Claude Code's system prompts as inspiration? Yes — they're battle-tested. Should we copy verbatim (license / attribution question — check Claude Code's license) or paraphrase? Recommend. (5) Cross-reference Phase 3b-i (subagents → [agents.<role>] for ralph's 12 internal subagents) — that's the analogous port but operator-private; this is the public-facing 'native palette' port. (6) Pick top 3 most-valuable to port first. NO CODE — research + decision doc. Surface recommendations to operator before opening follow-up implementation tasks."
```

---

## X — `roadmap-plugin` 🛠 — agents manage roadmap/overview.html programmatically

> New "Tooling" workstream. Plugin in `packages/codexu-plugin/` that exposes roadmap-CRUD via skill commands and/or MCP server. Parallel with anything. Foundational for agent-driven planning workflows.

```
/plan-with-ralph "Build a plugin that lets agents manage the codexu roadmap (plans/overview.html + plans/parallel-assignments.md + plans/codexu-roadmap.md) programmatically. Plugin home: packages/codexu-plugin/.

TWO INTERFACE SURFACES — surface design choice to operator before scoping the build:

1. Skill commands (lower overhead, easier first version). Slash commands like /roadmap-add-task, /roadmap-update-status, /roadmap-record-run, /roadmap-take-task. Implementation: SKILL.md files under packages/codexu-plugin/skills/roadmap/. Each skill is a procedure the agent follows that reads/edits plans/overview.html's JSON block + plans/parallel-assignments.md's status table. Reuses the existing .agents/skills/roadmap-and-overview/SKILL.md as the data-model reference (it documents the JSON schema + update procedures exhaustively).

2. MCP server (richer, agent-callable without slash commands). Stdio MCP server registered via packages/codexu-plugin/.codex-plugin/plugin.json's mcp_servers field. Tools exposed: roadmap.list, roadmap.addTask, roadmap.updateStatus, roadmap.recordRun, roadmap.takeTask. Server lives in packages/codexu-plugin/mcp-roadmap/ (new Node/TS subdir; can reuse @slopus/happy-wire for any shared types).

CORE OPERATIONS (regardless of surface):
- add-task: takes task metadata (id, status, workstream, sizeBucket, risk, effort, cadence?, ralphCommand string, optional blockedOn list). Writes a new <details class='cmd'> row in plans/overview.html + new lettered section in plans/parallel-assignments.md + entries in every JSON map. Validates against the data model documented in .agents/skills/roadmap-and-overview/SKILL.md.
- update-status: takes (taskId, newStatus, optional commit sha + summary if flipping to closed). Flips badge class + text in HTML; updates lastTouched in JSON; updates parallel-assignments.md status table cell; if status='closed' appends a run record to runs[].
- record-run: takes (taskId, ranAt ISO, outcome, commits[], summary). Appends to runs[]. If task is periodic, recomputes periodic[taskId].lastRunId + nextDueAt.
- take-task: spawns a top-level agent session running the task's ralph command, then calls update-status to flip the task to in-progress. Spawn integration: call happy-cli's existing spawn-happy-session RPC. The MCP server (which runs as a stdio child of codex) needs to reach the daemon — via daemon's HTTP control surface at 127.0.0.1:<httpPort> (read from ~/.happy/daemon.state.json) OR via the daemon's existing socket. Surface this integration choice to operator.

DEPENDENCIES / CROSS-REFERENCES:
- READ .agents/skills/roadmap-and-overview/SKILL.md FIRST — it's the canonical data-model + per-operation procedure documentation. The plugin should automate exactly what that skill describes manually.
- Read packages/codexu-plugin/README.md + Phase 1c scaffolding for the plugin layout.
- For MCP transport: stdio MCP. Codex's MCP client docs in codex/external/repos/codex-patched/codex-rs/core/src/mcp_tool_call.rs (READ-ONLY per minimize-conflict-surface).
- For task-taking spawn: packages/happy-cli/src/daemon/run.ts:spawnSession (daemon-side handler) + packages/happy-cli/src/api/apiMachine.ts (apiMachineClient with spawn-happy-session RPC method registration).
- OVERLAPS WITH agent-comms: agent-comms's Scope B (same-daemon spawn/message) covers similar ground. Coordinate to avoid duplicating the spawn surface — this plugin can ship v1 using existing happy-cli RPCs without waiting for agent-comms; agent-comms can later subsume or refactor the spawn integration.

ACCEPTANCE v1 (skill-only):
- /roadmap-add-task with full metadata writes a new task and the operator sees it on reload.
- /roadmap-update-status flips a task's badge + status table cell + JSON lastTouched.
- /roadmap-record-run appends a run + updates periodic metadata if applicable.
- /roadmap-take-task spawns a happy session with the ralph command and flips the task to in-progress.
- The 4 skills are documented in packages/codexu-plugin/skills/roadmap/*/SKILL.md.

ACCEPTANCE v1.5 (MCP add-on):
- Same operations exposed as MCP tools.
- An agent in a codex session with codexu-plugin enabled can call roadmap.addTask etc. without slash commands.

Surface scope choice (skill-only vs MCP-only vs both for v1) to operator BEFORE writing code. NO CODE until operator agrees on scope."
```

---

## Y — `agent-tree-rpc` — App-server RPC exposing codex's live spawn tree

> Spawned by `agent-view-research`. Bucket (a) codex agent runtime. Parallel-safe with everything else in batch 1/2 (touches happy-cli + new RPC handler; codex source READ-ONLY). 8h estimate; medium risk.

```
/plan-with-ralph "Expose codex's live spawn tree as a queryable + streamable app-server RPC. Per plans/agent-view-research.md §6 task `agent-tree-rpc`. Today codex already has the data — AgentRegistry.agent_tree (codex/external/repos/codex-patched/codex-rs/core/src/agent/registry.rs), control.rs:832-840 subscribe_status, and CollabAgentSpawnBegin/EndEvent are emitted (spawn.rs:71-205) — but nothing exposes the live tree as a single queryable surface that mobile clients can render. Minimize-conflict-surface tenet per plans/codexu-roadmap.md: codex source READ-ONLY; add the RPC bridge on the happy-cli side (packages/happy-cli/src/codex/codexAppServerClient.ts + runCodex.ts) by subscribing to codex's existing event stream and re-emitting structured spawn-tree updates over happy-server's Socket.IO. Add two RPC shapes: (1) sessionGetAgentTree(sessionId) → { nodes: AgentTreeNode[], edges: { parent, child }[] } where AgentTreeNode = { threadId, agentRole, nickname, status, lastTaskMessage, spawnedAt }; (2) socket subscription event 'agent-tree-update' emitting incremental deltas (node-added, node-status-changed, node-removed). Read codex/external/repos/codex-patched/codex-rs/core/src/agent/registry.rs + control.rs (READ-ONLY) for the data shape. Read packages/happy-cli/src/codex/runCodex.ts for the existing codex event subscription pattern. Read packages/happy-server/sources/app/events/eventRouter.ts for the fan-out primitive. Acceptance: codex spawns 2 sub-agents via spawn_agent → happy-cli detects + emits agent-tree-update events → happy-server fans out → vitest assertion that subscribed clients receive both spawn-begin and spawn-end deltas in correct order with parent linkage. Cross-package typecheck green. Single commit on main, NO codex submodule edits. Pitfall: subscribe_status returns a tokio watch::Receiver that lives in codex's process — happy-cli's bridge must hold the receiver in a task that survives across the agent's lifetime, not just for one tool call."
```

---

## Z — `session-parent-link` — Add parentSessionId + spawnedChildren to Session metadata

> Spawned by `agent-view-research`. Bucket (b) codexu mobile app UI (also touches happy-server wire shape). 4h estimate; medium risk; small. Foundation for `mobile-tree-view` and `spawn-from-app`.

```
/plan-with-ralph "Add parentSessionId + spawnedChildren tracking to Session metadata end-to-end. Per plans/agent-view-research.md §6 task `session-parent-link`. Today Session has no concept of parent-child (packages/happy-app/sources/sync/storageTypes.ts:130-163) — the mobile app shows a flat list. Add: Metadata.parentSessionId?: string and Metadata.spawnedChildren?: string[] (composite session IDs). Plumb through: (1) happy-server schema/wire shape — if backend tracks the link, add columns; if metadata-only, just extend the JSON contract; surface choice to operator. (2) happy-app storageTypes.ts Session/Metadata types. (3) storage.ts:395-570 applySessions reducer — preserve the new fields on update merges. (4) New helper getSessionChildren(sid) and getSessionParent(sid) in sources/sync/storage.ts. NO UI changes yet — that's mobile-tree-view's job. Acceptance: writing a Session with parentSessionId='m1:abc' and spawnedChildren=['m1:def','m1:ghi'] round-trips through happy-server → app → MMKV → re-fetch unchanged; helpers return correct neighbours; cross-package typecheck green. Read packages/happy-app/CLAUDE.md sync invariants — composite-id (machineSessionId.ts) helpers must be respected for parent refs. Single commit on main. Pitfall: existing sessions have no parent — null parentSessionId means top-level; don't backfill spawnedChildren=[] on every existing session (use undefined/null to distinguish missing-field from empty-children)."
```

---

## AA — `mobile-tree-view` — Tree-style session list with depth indentation + expand/collapse

> Spawned by `agent-view-research`. Bucket (b) codexu mobile app UI. **Blocks on `session-parent-link`.** 12h estimate; medium risk; large.

```
/plan-with-ralph "Convert the happy-app session list from flat-with-date-groups to a tree with depth indentation + expand/collapse. Per plans/agent-view-research.md §6 task `mobile-tree-view`. PREREQUISITE: session-parent-link must have landed so Session.metadata.parentSessionId + spawnedChildren are queryable. Files: packages/happy-app/sources/sync/storage.ts:250-343 buildSessionListViewData — change from flat SessionListViewItem[] to depth-tagged flattened-tree (each item carries `depth: number` and `hasChildren: boolean`). packages/happy-app/sources/components/SessionsList.tsx:193-333 FlatList — keep FlatList but consume the new depth-tagged data; SessionsList.tsx:342-463 SessionItem memo — render depth-based left indent (e.g., depth × 20px) + chevron icon when hasChildren; toggle expanded state in a new MMKV-persisted Map<sid, boolean>. Active-vs-inactive grouping: when a parent is in the active group, render its children inline beneath it (still in the active group); otherwise children appear inside their date group, indented under parent if the parent is in the SAME date group, otherwise as orphans (rare). Read packages/happy-app/CLAUDE.md sync invariants — renderWindow + seq-based pagination must not be touched. Acceptance: vitest snapshot of buildSessionListViewData with mocked parent + 2 children → correct depth ordering; manual smoke: cold-launch with synthetic parentSessionId data → tree renders, chevron toggles expand/collapse, persists across refresh. Cross-package typecheck green. Single commit on main. Pitfall: SessionItem memo must include depth + expanded in its keyExtractor / memo deps, or stale rows will render at wrong depth on tree mutations."
```

---

## BB — `session-role-pill` — Surface agent flavor + model + permission-mode in session row

> Spawned by `agent-view-research`. Bucket (b) codexu mobile app UI. Parallel-safe with everything (no schema changes — uses existing metadata fields). 3h estimate; low risk; small.

```
/plan-with-ralph "Surface agent flavor + currentModelCode + currentPermissionModeCode inline in the session-list row. Per plans/agent-view-research.md §6 task `session-role-pill`. Today these fields live in Session.metadata (packages/happy-app/sources/sync/storageTypes.ts:130-163) and are visible only inside SessionContextDrawer — never in the list row. The Claude Code 'teammate view' shows agent role + model on every spinner-tree line; this brings the same visual affordance to the mobile session list. File: packages/happy-app/sources/components/SessionsList.tsx:342-463 SessionItem memo — add a small horizontal pill row beneath the subtitle showing: (a) flavor icon (codex/claude/...), (b) abbreviated model code (e.g., 'gpt-5-codex' → 'codex' or full code based on width budget), (c) permission-mode badge (plan / default / acceptEdits, color-coded). Reuse existing components from sources/components/ if a Pill / Badge primitive exists. Acceptance: vitest snapshot of SessionItem with metadata.flavor='codex' + currentModelCode='gpt-5-codex' + currentPermissionModeCode='plan' → renders the three pills; existing list-row tests stay green. Cross-package typecheck green. Single commit on main. Pitfall: shallow-copy of SessionRowData might already include these fields — confirm before adding to keyExtractor / memo deps. Independent of mobile-tree-view (no schema changes); land first as a quick UX win."
```

---

## CC — `spawn-from-app` — "Spawn child session" affordance + spawnSessionFromSession RPC

> Spawned by `agent-view-research`. Bucket (c) both — happy-app + happy-cli. **Blocks on `session-parent-link`.** 8h estimate; medium risk; medium.

```
/plan-with-ralph "Add a 'spawn child session' affordance to the happy-app session detail view + new spawnSessionFromSession RPC end-to-end. Per plans/agent-view-research.md §6 task `spawn-from-app`. PREREQUISITE: session-parent-link must have landed so the new child can carry parentSessionId. New RPC shape: spawnSessionFromSession(parentSid: compositeSessionId, config: { agent, path?, permissionMode?, model?, initialMessage? }) → newSid. happy-cli side (packages/happy-cli/src/api/apiSession.ts or apiMachine.ts): register the handler; resolve parent's machineId from compositeSessionId; call existing machineSpawnNewSession-equivalent path with auto-set Metadata.parentSessionId = parentSid; also update parent's metadata.spawnedChildren via sessionUpdateMetadata. happy-app side (packages/happy-app/sources/sync/ops.ts): add machineSpawnSessionFromSession wrapper; in session detail view (sources/app/(app)/session/[id].tsx or wherever the detail screen lives), add a 'Spawn child agent' action button that opens a sheet with agent flavor/permission/model pickers and an optional initial-message field. Read packages/happy-app/CLAUDE.md sync invariants. Acceptance: vitest fixture in happy-cli — call spawnSessionFromSession against a mocked parent; assert new session created with parentSessionId set + parent's spawnedChildren contains new sid. Manual smoke from app: tap 'spawn child' on a session → new child appears in list with parent linkage visible (if mobile-tree-view has landed, indented under parent; otherwise just present in flat list with correct metadata). Cross-package typecheck green. Single commit on main per side (happy-cli commit, happy-app commit). Pitfall: cycle prevention — if a user tries to spawn under a session that's already a child of the new child (cycle), the handler must reject; document the limit (max-depth 1? unlimited with hop counter?). Coordinate with the agent-comms task — spawnSessionFromSession is the same RPC Scope C will need; this lands the wire shape first."
```

---

## DD — `agent-status-stream` — Bridge codex spawn events through to mobile as "active teammates" overlay

> Spawned by `agent-view-research`. Bucket (c) both — codex (via happy-cli bridge) + happy-app. **Blocks on `agent-tree-rpc`.** 10h estimate; high risk; large.

```
/plan-with-ralph "Bridge codex's per-session spawn-tree updates from agent-tree-rpc through to a live 'active teammates' overlay in the happy-app session detail view. Per plans/agent-view-research.md §6 task `agent-status-stream`. PREREQUISITE: agent-tree-rpc must have landed so happy-server emits 'agent-tree-update' events with structured deltas. happy-app side: (1) sources/sync/storage.ts — add agentTreeBySession: Record<sid, AgentTreeNode[]> reducer state; subscribe to agent-tree-update events via the existing socket plumbing; apply deltas with monotonic guard (use the codex thread's spawn timestamp as the seq, since this is out-of-band from message seq). (2) sources/app/(app)/session/[id].tsx — add a collapsible 'Active teammates' overlay panel showing the spawn tree (parent thread + spawned sub-agents) with live status indicators ('running' / 'idle' / 'completed' / 'failed' pulsed dot); tap a teammate row to peek its last-task-message + lastN messages (separate RPC, follow-up). Reuse mobile-tree-view's depth-indentation pattern for the teammate sub-tree rendering. Read packages/happy-app/CLAUDE.md sync invariants — the new reducer state is in-memory only (ephemeral; don't persist to MMKV); reconnect should re-fetch full tree via sessionGetAgentTree(sid) once and then resume incremental deltas. Acceptance: integration test — happy-cli emits 'agent-tree-update' with 2 spawn events, app receives both, panel shows 2 teammates with correct status; status transition to 'completed' updates the panel pulsed dot. Cross-package typecheck green. ONE commit per side (happy-app commit; happy-cli changes minimal since agent-tree-rpc already lands the wire shape). Pitfall: subscribe_status's watch::Receiver fires aggressively (every internal state tick); happy-cli's bridge must coalesce to status-changed deltas only — verify the bridge dedupes idempotent re-emissions before fanning out to clients. Surface UX choice to operator BEFORE building: should the 'Active teammates' overlay auto-show when a session has > 0 children, or only after user opens it from a menu?"
```

---

## MM — `3h-tail` — Phase 3h-tail codex-submodule follow-ups

> Spawned by `3h-options`. Two distinct codex-submodule deferrals: (1) TUI statusline plugin slot, (2) `request_user_input` pre_tool_use_payload override for auto-mode AskUserQuestion. ~8h total; medium risk; medium. Surface to operator whether to ship together or split. Codex-submodule worktree per the minimize-conflict-surface tenet.

```
/plan-with-ralph "Phase 3h-tail — two codex-submodule follow-ups deferred during the 3h-options-mode plugin migration (commit 756d4290 + merge e71497eb). Per plans/codexu-roadmap.md §Phase 3h closure. Read the deferred-items log in packages/codexu-options-mode-plugin/README.md (or the 3h-options run record at plans/overview.html — runs['3h-options/2026-05-14']) for what's outstanding. Two distinct deferrals — surface to operator whether to ship together or split:

ITEM 1 — codex TUI statusline plugin slot. The codex TUI's status_line_setup.rs currently exposes NO plugin slot for plugins to contribute statusline content; the options-mode plugin had to fall back to an in-band 'options-mode: <mode>' prefix injected via SessionStart additionalContext. The proper fix is upstream-style: add a plugin-slot registration seam in codex/external/repos/codex-patched/codex-rs/tui/src/status_line_setup.rs (or wherever the TUI status line is composed) that plugins can call to contribute a segment. Prefer an overlay-crate approach (codex/codex-rs-overlay/codex-statusline-slots/?) over editing status_line_setup.rs directly to honor the minimize-conflict-surface tenet (plans/codexu-roadmap.md §'Codex changes — minimize upstream conflict surface'). If overlay isn't viable, fall back to a minimal sandbox-patch seam in status_line_setup.rs.

ITEM 2 — codex request_user_input handler override for auto-mode AskUserQuestion. The options-mode plugin's auto-mode wants to intercept AskUserQuestion (or codex's request_user_input equivalent) and respond with a default-continuation envelope so an unattended session doesn't stall. Codex currently has no override seam for request_user_input handling. Probe: codex/external/repos/codex-patched/codex-rs/ for request_user_input call sites + the handler trait; design a pre_tool_use_payload() override seam that plugins can register.

Workflow (codex submodule): work in a codex-submodule worktree at .ralph/jobs/<job-name>/codex-worktree/ pointed at gim-home/codex's main; do edits there on a topic branch; push to gim-home/codex; bump the codexu submodule pointer as a separate commit on codexu main. Cargo build --workspace from codex/external/repos/codex-patched/codex-rs/ must stay green. For each item: surface design choice to operator BEFORE landing — overlay-crate vs sandbox-patch seam, registration shape, default behavior. Acceptance: (1) options-mode plugin can register a TUI statusline segment via the new slot, and the statusline-script fallback in packages/codexu-options-mode-plugin/apps/statusline/ is reduced or eliminated; (2) options-mode plugin's auto-mode hook can override request_user_input to inject a default-continuation envelope without the existing transcript-scan workaround. Tests under codex/codex-rs-overlay/codex-invariant-tests/ if a new overlay crate is created. NO happy-cli or happy-app changes — purely codex-submodule + the options-mode plugin's hook code consuming the new seams."
```

---

## EE — `codex-wire-spike` — Pre-flight wire-acceptance spike for parity gaps 2/3/5

> Spawned by `codex-parity-audit`. 30 minutes. No code changes — research only. Unblocks `codex-attachments` and informs `codex-claude-md-autoload`. Parallel-safe.

```
/plan-with-ralph "30-minute pre-flight spike against a real codex app-server to resolve wire-acceptance questions blocking Gaps 2, 3, 5 from plans/codex-agent-parity-audit.md. Spike 3 questions: (1) does codex-core accept InputItem `{ type: 'image', url: 'data:image/png;base64,...' }` or does it require `{ type: 'localImage', path }` (Gap 3)? (2) does codex-core honor `config: { project_doc_fallback_filenames: ['CLAUDE.md', 'AGENTS.md'] }` in NewConversationParams (Gap 2)? (3) what's the behavior of `compactPrompt` in NewConversationParams (Gap 5)? Method: spawn a real `codex app-server` and send hand-crafted JSON-RPC requests via netcat / node script. Read packages/happy-cli/src/codex/codexAppServerTypes.ts for the wire shape; read codex/external/repos/codex-patched/codex-rs/protocol/src/lib.rs for the deserializer behavior. Output: new section 'Wire spike results' appended to plans/codex-agent-parity-audit.md with concrete answers and any follow-up steps. NO production code changes — research/spike only. Acceptance: each of the 3 questions has a definitive answer in the doc (works / requires X / unsupported), with evidence (request + response payload or referenced source-line). This unblocks codex-attachments (Gap 3) and informs codex-claude-md-autoload (Gap 2) + future codex-slash-commands (Gap 5)."
```

---

## FF — `codex-claude-md-autoload` — Gap 2: project CLAUDE.md auto-load on codex path

> Spawned by `codex-parity-audit`. ~30-45 min, High severity. Conflicts with `mcp-discovery` / `codex-system-prompts` / `codex-hooks-parity` (all touch `runCodex.ts` + `codexAppServerClient.ts`); sequence after `mcp-discovery` lands.

```
/plan-with-ralph "Gap 2 from plans/codex-agent-parity-audit.md — codex project CLAUDE.md auto-load. Today happy-cli passes `config: null` in NewConversationParams / ResumeConversationParams (codexAppServerTypes.ts:26,56) and the codex app-server therefore uses codex's default project-doc filename (AGENTS.md only). Fix: pass `config: { project_doc_fallback_filenames: ['CLAUDE.md', 'AGENTS.md'] }` in BOTH client.startThread (runCodex.ts:794) AND resumeExistingThread (runCodex.ts:725). Add a happy CLI flag `--codex-project-doc <name>` (repeatable) to packages/happy-cli/src/codex/cliArgs.ts so power users can override the dual fallback; default unset → use ['CLAUDE.md', 'AGENTS.md'] in that order (CLAUDE.md wins per codex-core's first-non-empty semantics). PREREQ DECISION: optionally consume codex-wire-spike's confirmation that codex honors project_doc_fallback_filenames in NewConversationParams; if spike not done, ship anyway — the wire field is documented in codexAppServerTypes.ts. CONFLICT WARNING: same files as mcp-discovery (currently in progress); sequence after mcp-discovery lands. Acceptance: smoke test with only CLAUDE.md present in cwd → fresh codex session reports awareness of the project doc; with both CLAUDE.md + AGENTS.md present, CLAUDE.md wins. Test command: pnpm --filter '{packages/happy-cli}' exec vitest run 2>&1 | tee /tmp/codexu-claude-md.log. Single commit referencing audit Gap 2. Update plans/codex-agent-parity-audit.md Gap 2 section to mark shipped."
```

---

## GG — `codex-attachments` — Gap 3: image attachments on codex turn input

> Spawned by `codex-parity-audit`. ~2-3h, High severity. **Blocks on `codex-wire-spike`** (wire shape decision).

```
/plan-with-ralph "Gap 3 from plans/codex-agent-parity-audit.md — image attachments never reach codex turn input. Today packages/happy-cli/src/codex/runCodex.ts:321 calls messageQueue.push(message.content.text, ...) — message.content.attachments is read NOWHERE on the codex path, and sendTurnAndWait (codexAppServerClient.ts:1338-1341) hardcodes input as `[{ type: 'text', text: prompt }]`. The wire InputItem (codexAppServerTypes.ts:134-137) DOES support image inputs — happy-cli just never produces them. PREREQUISITE: codex-wire-spike must have landed and answered whether codex accepts InputItem `{ type: 'image', url: 'data:image/png;base64,...' }` (preferred — no tmpfile management) or requires `{ type: 'localImage', path }` (needs tmpfile write + cleanup). Fix: plumb MessageQueueAttachment[] through MessageQueue2's payload to runCodex.ts's main loop (mirror the Claude path's claudeRemote.ts:65-90 `toClaudeUserContent`), synthesize InputItem[] in sendTurnAndWait based on the spike's chosen wire shape. Support PNG/JPEG/GIF/WebP (same set as Claude); skip + log unsupported MIME types. Acceptance: integration test sends a PNG attachment end-to-end against a mocked codex app-server; codex agent acknowledges the image content. Cross-package typecheck green. Test command: pnpm --filter '{packages/happy-cli}' exec vitest run 2>&1 | tee /tmp/codexu-attachments.log. Single commit; update plans/codex-agent-parity-audit.md Gap 3 section to mark shipped."
```

---

## HH — `codex-system-prompts` — Gap 7: customSystemPrompt + appendSystemPrompt parity

> Spawned by `codex-parity-audit`. ~2h, Medium severity. Conflicts with `mcp-discovery` / `codex-claude-md-autoload` / `codex-hooks-parity` (all touch `runCodex.ts`); sequence after earlier ones land.

```
/plan-with-ralph "Gap 7 from plans/codex-agent-parity-audit.md — customSystemPrompt + appendSystemPrompt parity on codex path. Today the codex EnhancedMode (runCodex.ts:96-100) is restricted to { permissionMode, model, thinkingLevel }; customSystemPrompt + appendSystemPrompt are tracked on the Claude side (runClaude.ts:376-377, 490-518) but NOT on codex. The codex wire protocol has NewConversationParams.baseInstructions + developerInstructions (codexAppServerTypes.ts:27-28) and ResumeConversationParams equivalents (lines 57-58) — happy-cli never sets them. Fix: extend codex EnhancedMode in runCodex.ts:96-100 with `customSystemPrompt?: string; appendSystemPrompt?: string`. Mirror Claude's per-message tracking pattern (runClaude.ts:490-518) — store currentCustomSystemPrompt + currentAppendSystemPrompt at the codex session scope; pass through to client.startThread on first turn (baseInstructions = customSystemPrompt, developerInstructions = appendSystemPrompt) AND resumeExistingThread on resume. Mid-session changes deferred to next thread start (matches Claude's 'next turn only' semantics). CONFLICT WARNING: same files as mcp-discovery / codex-claude-md-autoload; sequence after those land. Acceptance: vitest fixture in runCodex.test.ts — send a message with meta.customSystemPrompt='You are a pirate' to a fresh codex session; assert startThread called with baseInstructions='You are a pirate'; resume the thread, assert resumeExistingThread also called with the persisted baseInstructions. Test command: pnpm --filter '{packages/happy-cli}' exec vitest run 2>&1 | tee /tmp/codexu-sysprompts.log. Single commit; update plans/codex-agent-parity-audit.md Gap 7 section to mark shipped."
```

---

## II — `codex-hooks-parity` — Gap 4: fan codex events to happy turn-lifecycle handlers

> Spawned by `codex-parity-audit`. ~6-10h, Medium severity, larger task. Sequence AFTER `mcp-discovery` / `codex-claude-md-autoload` / `codex-system-prompts` have landed.

```
/plan-with-ralph "Gap 4 from plans/codex-agent-parity-audit.md — fan codex JSON-RPC events to the same downstream handlers Claude hooks drive (onTurnStarted, onTurnCompleted, onNotification, sendContextBoundary). Today happy-cli wires 6 Claude hooks (SessionStart/PreCompact/PostCompact/Stop/UserPromptSubmit/Notification) via generateHookSettings.ts:42-49 + runClaude.ts:265-314 to drive turn lifecycle, auto-compact boundaries, idle detection. The codex path infers turn lifecycle from task_started/task_complete/turn_aborted (runCodex.ts:605-642) but does NOT call onTurnStarted/onTurnCompleted/sendContextBoundary({ kind:'autocompact' }). Fix: wire 3 codex events to the equivalent handlers — (1) task_started → call session.onTurnStarted() (currently only toggles thinking=true at runCodex.ts:628-633); (2) task_complete/turn_aborted → call session.onTurnCompleted() — defer the deferred-switch-protocol question (operator open item, see .ralph/jobs/preserve-turn-on-mode-switch/plan.md); (3) codex's setApprovalHandler permission-request path (runCodex.ts:563-583) → emit a session.onNotification()-equivalent envelope. Auto-compact (codex-internal compaction signal) is the hardest piece — investigate whether codex emits a turn_diff or compact event we can detect; if not, defer to a follow-up. CONFLICT WARNING: sequence after mcp-discovery + codex-claude-md-autoload + codex-system-prompts have landed. Acceptance: a codex session that hits codex's internal compaction threshold emits sendContextBoundary({ kind:'autocompact', ... }) visible in the wire log; permission-prompt events fire a notification path equivalent to Claude's. Cross-package typecheck green. Tests: vitest fixtures for each of the 3 event paths. Test command: pnpm --filter '{packages/happy-cli}' exec vitest run 2>&1 | tee /tmp/codexu-hooks.log. Single commit; update plans/codex-agent-parity-audit.md Gap 4 section to mark shipped."
```

---

## JJ — `port-explorer-prompt` — Fill empty `explorer.toml` stub

> Spawned by `native-agent-parity`. ~3h, low risk. Codex-submodule edit + submodule pointer bump. Parallel-safe (no `role.rs` change needed — file is already wired).

```
/plan-with-ralph "Fill the empty explorer.toml stub at codex/external/repos/codex-patched/codex-rs/core/src/agent/builtins/explorer.toml with a paraphrased Explore prompt — smallest delta from plans/native-agent-parity.md §2.1. Per plans/codexu-roadmap.md 'minimize-conflict-surface' tenet, this is the only built-in role port that requires NO core/src/agent/role.rs match-arm change (file is already wired in role.rs's config_file_contents() switch). Read the inspiration source at D:/harness-efforts/claude-code/worktrees/main/src/tools/AgentTool/built-in/exploreAgent.ts — paraphrase the prose per the license posture in plans/native-agent-parity.md §4 (keep structural patterns like READ-ONLY enforcement; rewrite all prose; cite inspiration in a comment header). Replace any 'Claude Code, Anthropic's CLI' references with codex-functional descriptions ('the codex agent'). Workflow: create a worktree of the codex submodule at .ralph/jobs/<job-name>/codex-worktree/ pointed at gim-home/codex's main; do edits there; commit on a topic branch in the submodule; push to gim-home/codex; then bump the codexu submodule pointer as a separate commit on codexu main. Acceptance: cargo build --workspace from codex/external/repos/codex-patched/codex-rs/ stays green; the role parses (check via existing agent_roles.rs tests or a tiny new test); a 1-minute smoke 'codex exec' against the new explorer role returns a sensible exploration of a small target. Surface to operator before committing — license-paraphrase review is gating. No happy-cli or happy-app changes; pure codex-submodule edit + submodule pointer bump."
```

---

## KK — `port-plan-and-verification-roles` — Add `plan.toml` + `verification.toml` built-ins

> Spawned by `native-agent-parity`. ~6h, medium risk. **Blocked on `native-agent-parity.md` §6 questions 1/4/5 (operator-gated).**

```
/plan-with-ralph "Add plan + verification built-in roles to codex per plans/native-agent-parity.md §2.2 + §2.3. New files: codex/external/repos/codex-patched/codex-rs/core/src/agent/builtins/plan.toml (read-only architect role; ends each turn with 'Critical Files for Implementation' list) + codex/external/repos/codex-patched/codex-rs/core/src/agent/builtins/verification.toml (workspace-write adversarial reviewer; VERDICT: PASS|FAIL|PARTIAL final-line contract). Edit codex/external/repos/codex-patched/codex-rs/core/src/agent/role.rs to add two new match arms in config_file_contents() + extend the built-ins table. License posture per native-agent-parity.md §4: paraphrase all prose from D:/harness-efforts/claude-code/worktrees/main/src/tools/AgentTool/built-in/planAgent.ts + verificationAgent.ts; keep structural patterns; cite inspiration in TOML comment headers. PREREQUISITES (operator-gated, must be resolved before opening): §6 Q1 role.rs edit policy (3 small match-arm edits vs design a registration seam first); §6 Q4 workspace-write tmpdir scope (verification needs $TMPDIR writes outside project tree); §6 Q5 test baseline location (codex-invariant-tests overlay vs piggyback on agent_roles.rs tests). §6 Q3 browser-MCP availability affects verification's frontend-strategy section but isn't gating — investigate codex's mcp__ namespace before writing that section. Workflow: codex-submodule worktree at .ralph/jobs/<job-name>/codex-worktree/; commit on a topic branch in gim-home/codex; bump codexu submodule pointer in a separate commit. Acceptance: cargo build --workspace green; new test (codex-invariant-tests or core agent_roles.rs test) validates both new TOMLs parse + have non-blank developer_instructions + valid permission_profile; smoke 'codex exec --agent plan' returns a 'Critical Files for Implementation' list; smoke 'codex exec --agent verification' returns a VERDICT: line. Surface to operator before merging."
```

---

## LL — `audit-general-purpose-vs-worker` — 30-min prompt diff

> Spawned by `native-agent-parity`. ~30 min. Parallel-safe.

```
/plan-with-ralph "30-minute prompt-diff task per plans/native-agent-parity.md §2.4. Compare D:/harness-efforts/claude-code/worktrees/main/src/tools/AgentTool/built-in/generalPurposeAgent.ts (or whichever file exposes Claude's general-purpose system prompt) against codex/external/repos/codex-patched/codex-rs/core/src/agent/builtins/worker.toml's developer_instructions. Identify guidance present in general-purpose that's missing from worker.toml — likely candidates per the research: 'NEVER create files unless absolutely necessary', 'NEVER create documentation files unless explicitly requested', other safety-rail rules. If worker.toml is sparser, fold the missing rules into worker.toml as a small targeted change (NOT a wholesale rewrite); keep the change minimal so codex's worker behavior shifts only at the margins. If worker.toml already covers the same ground (likely — codex's worker is mature), document this in plans/native-agent-parity.md §2.4 as a no-op finding. License posture: paraphrase any rule text from Claude's general-purpose; do NOT copy verbatim. Workflow: codex-submodule worktree; commit on topic branch; bump codexu submodule pointer. Acceptance: either (a) worker.toml updated with N paraphrased rule additions referenced in commit body, OR (b) plans/native-agent-parity.md §2.4 amended with a 'no merge needed, worker.toml already covers X/Y/Z' note. Surface to operator before merging. No happy-cli/happy-app changes."
```

---

## O — `polish-Fs` — Bundle remaining F-* findings

> Parallel with everything outside the touched files. Bundle into one PR to amortize review.

```
/plan-with-ralph "Polish PR — bundle remaining devtunnels-E findings: F-017 (device pair-code shortcut), F-001/F-002 (security Medium), F-003-F-007 (security Low). Per .ralph/jobs/devtunnels-E-cleanup/notepad.md — re-read each finding's exact text + severity + remediation before scoping. F-014 (tunnel label rename) is EXCLUDED from this bundle — needs server redeploy, separate effort. F-013 closed (Sprint E review, obsolete-by-design 2026-05-13); F-015, F-016 deferred (don't include). For each F-* in scope, propose the fix in plan form FIRST, then implement after operator sign-off — security findings warrant explicit acknowledgement of the remediation choice before code lands. Read packages/happy-server/CLAUDE.md and packages/happy-app/CLAUDE.md sync invariants. Acceptance: each F-* has a green test (new or extended); all 5 happy-* package typechecks green; security findings explicitly mark severity + CVE-style remediation note in commit body. Test command: pnpm --filter '{packages/happy-server}' --filter '{packages/happy-app}' --filter '{packages/happy-cli}' exec vitest run 2>&1 | tee /tmp/codexu-polish-fs.log. ONE commit per F-finding (six commits) so each can be reverted independently if needed."
```

---

## Operator-only tasks (not ralph-able)

These need manual operator action; ralph won't help.

- **Phase 1c residual** — TUI plugin install smoke test (operator opens codex TUI → plugins picker → enable codexu-plugin → verify hello-world in /skills). ~10 min.
- **Phase 1b sub-task 5** — walkthrough verification (manual end-to-end multi-device test against real codex + tunnels + phone). ~1 d when sub-tasks 3 + 4 land.
- **Phase 2a Test 3** — execpolicy sandbox denial verification. Flip local config to non-`danger-full-access` sandbox or use a non-trusted dir, then re-run the deferred test. ~30 min.
- **BOOX Phases 2–6** — chat round-trip, refresh-per-request, token revocation, multi-device fan-out, signed-APK release. Manual hardware validation. ~2-3 h end-to-end.
- **F-014** — code change is small (~30 min) but blocked on a happy-server redeploy window. Bundle with the next planned server change.
- **Phase 2c, 2d** — upstream codex patches (plugin scoping, ask_user_question). Lives in the codex git submodule (gim-home/codex repo), not codexu. Separate workflow.

---

## Status table (batches 1 + 2)

Mark each row when the agent's commit lands on `origin/main`. Refresh `plans/overview.html` after.

| Tab title | Task | Status | Commit |
|---|---|---|---|
| ~~`perf-WS1`~~ | Realtime perf — refresh-skip | 🚫 closed (obsolete) | 188cfd9c |
| `perf-WS3` | Realtime perf — replay buffer | 🟡 in progress | — |
| `perf-WS2` | Realtime perf — placeholder (after WS3) | ⬜ blocked on WS3 | — |
| `3a-skills` | Phase 3a — Ralph skills port | ⏸ paused (prerequisites not yet met) | — |
| ~~`F-013-perms`~~ | Claude permission latent override | 🚫 closed (obsolete-by-design) | b5d18eb5 → close-out |
| `F-015-toast` | Stale-creds toast on cold launch | ⏸ paused (awaiting reproduction) | — |
| `mcp-discovery` | Codex agent project-.mcp.json parity | ✅ landed 2026-05-13 | 462776df |
| `codex-parity-audit` | Research: gaps in codex agent feature parity vs Claude | ✅ landed 2026-05-13 | — (research-only; output `plans/codex-agent-parity-audit.md`) |
| `codex-wire-spike` 🤖 | Pre-flight wire-acceptance spike for Gaps 2/3/5 | ⬜ not started | — |
| `codex-claude-md-autoload` 🤖 | Gap 2: project CLAUDE.md auto-load on codex path | ⬜ not started | — |
| `codex-attachments` 🤖 | Gap 3: image attachments on codex turn input | ⬜ blocked on codex-wire-spike | — |
| `codex-system-prompts` 🤖 | Gap 7: customSystemPrompt + appendSystemPrompt parity | ⬜ not started | — |
| `codex-hooks-parity` 🤖 | Gap 4: fan codex events to happy turn-lifecycle handlers | ⬜ not started (sequence after earlier codex-* land) | — |
| `1a-fork-doc` | Phase 1a — fork strategy commit | 🟡 in progress | — |
| `1b-multidev` | Phase 1b sub-tasks 3 + 4 | ⬜ not started | — |
| `3b-agents` | Phase 3b-i + ii — subagents → roles | ⬜ blocked on 3a discovery | — |
| `3c-hooks` | Phase 3c — hooks port / verify | 🟡 in progress | — |
| `3d-workers` | Phase 3d — native worker spawn (after 3b) | ⬜ blocked on 3a + 3b | — |
| `3fg-package` | Phase 3f + 3g — asset + packaging | ⬜ blocked on 3a discovery | — |
| `3h-options` | Phase 3h — options-mode migration | ✅ shipped (merged from `phase-3h-options-mode-plugin`) | 756d4290 + merge |
| `3h-tail` 🤖 | Codex TUI statusline plugin slot + `request_user_input` override | ⬜ not started | — |
| `polish-Fs` | F-017 + F-001/F-002 + F-003-F-007 | ⬜ not started | — |
| `userid-cleanup` | Drop multi-tenant userId scoping in happy-server | ⬜ blocked on perf-WS3 | — |
| `happy-upstream-sync` 🔄 | Periodic — review new slopus/happy commits since last sync | ⬜ next due ~4w from 2026-05-03 | — |
| `codex-upstream-rebase` 🔄 | Periodic — rebase codex submodule on openai/codex | ⬜ first run pending | — |
| `agent-view-research` | Research Claude Code's agent-view feature | ✅ landed 2026-05-14 | — (research-only; output `plans/agent-view-research.md`) |
| `agent-tree-rpc` 🤖 | App-server RPC for codex live spawn tree | 🟡 in progress | — |
| `session-parent-link` 🤖 | Add parentSessionId + spawnedChildren to Session metadata | ✅ shipped (read path; writer deferred) | 11c3eafb |
| `mobile-tree-view` 🤖 | Tree-style session list with depth indentation | ⬜ ready (unblocked 2026-05-14) | — |
| `session-role-pill` 🤖 | Flavor + model + permission-mode pills in session row | ✅ shipped | 7e9f724c |
| `spawn-from-app` 🤖 | "Spawn child session" affordance + RPC | ⬜ ready (unblocked 2026-05-14) | — |
| `agent-status-stream` 🤖 | Live "active teammates" overlay (codex events → mobile) | ⬜ blocked on agent-tree-rpc | — |
| `plugin-scope-agents` | Top-level-only plugin scoping + agent-spawner | ⬜ blocked on agent-view-research | — |
| `agent-comms` | Top-level agent ↔ agent communication (MCP-based) | ⬜ blocked on plugin-scope-agents + channels-research | — |
| `channels-research` | Research Claude Code "channels" + codex 2-way MCP plan | ✅ done — `plans/channels-research.md` (2026-05-13) | — |
| `mcp-server-notifications` | Stage A from channels-research: bridge rmcp notifications + sampling into codex agent event loop, feature-gated | ⬜ not started | — |
| `codex-channels` | Stage B from channels-research: `experimental["codex/channel"]` envelope + prompt-queue policy | ⬜ deferred — operator decision before scoping | — |
| `async-events-design` | Design async event listening for agents | 🔒 blocked on `mcp-server-notifications` (re-blocked 2026-05-14) | — (draft preserved at `plans/async-events-design.md`) |
| `native-agent-parity` | Research codex parity with Claude Code's native subagents | ✅ landed 2026-05-14 | — (research-only; output `plans/native-agent-parity.md`) |
| `port-explorer-prompt` 🤖 | Fill empty `explorer.toml` stub | ⬜ not started | — |
| `port-plan-and-verification-roles` 🤖 | Add `plan.toml` + `verification.toml` built-ins | ⬜ blocked on §6 operator decisions | — |
| `audit-general-purpose-vs-worker` 🤖 | 30-min prompt diff vs codex worker.toml | ⬜ not started | — |
| `roadmap-plugin` 🛠 | Plugin: agents manage roadmap/overview.html via skill + MCP | ⬜ not started | — |

🟡 = in progress (agent actively working, not yet committed). Refresh after each landing.

When all of the above land, the roadmap's next gate is **Phase 4 — Coexistence verification** (13 integration sub-items 4a-4m). Those run sequentially per environment, not parallel, so they're not in this file.
