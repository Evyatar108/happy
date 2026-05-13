# Parallel ralph plan commands

Self-contained `/plan-with-ralph` prompts for parallel-safe tasks. Drop into a fresh Claude session.

**Batch 1 (six tasks below) are pairwise safe to run together.** Don't add a "perf WS2" agent yet — it must wait until B (WS3) lands, because both touch `storage.ts` and WS3 changes WS2's scope.

> **⏸ `3a-skills` is PAUSED (operator-closed 2026-05-13).** The session was closed because the discovery prerequisites the agent needs aren't yet met. Don't re-spawn until the operator re-establishes that context. Phase 3 sub-phases that build on 3a's output — **`3b-agents`, `3d-workers`, `3fg-package` in batch 2** — remain blocked on 3a's eventual discovery commit. `3c-hooks` and `3h-options` are unaffected.
>
> **🛡️ Minimize-conflict-surface tenet (codex submodule):** for any ralph plan that needs codex source changes, follow `plans/codexu-roadmap.md` §"Codex changes — minimize upstream conflict surface". Tldr: (1) avoid editing codex source if possible — most happy-cli work doesn't need it; (2) when new behavior IS needed, prefer a NEW package alongside in `codex/codex-rs-overlay/` (the `codex-copilot` / `codex-copilot-launcher` / `codex-invariant-tests` precedent), not edits to upstream-canonical files; (3) if patching `codex/external/repos/codex-patched/codex-rs/` is unavoidable, keep the diff minimal and surface to the operator; (4) work in a `.ralph/jobs/<name>/codex-worktree/` git worktree of the codex submodule, not in the parent codexu's checkout; (5) submodule pointer bump on codexu is a separate commit after the codex-side commit lands.

Per-task usage:

1. Open a fresh Claude session, name the terminal tab per the title below.
2. Paste the `/plan-with-ralph "..."` block. Ralph drafts a PRD + plan under `.ralph/jobs/<auto-named>/`.
3. Review the plan, then run `/implement-with-ralph` (or `/implement-with-ralph resume <job-name>` if iterating).

When each task lands, mark its row done at the bottom of this file.

---

## 🚀 Recommended parallel lanes — fire now

Five batch-1 tasks are pairwise file-disjoint and can run concurrently:

| Lane | Tab | Files touched | Why safe with the others |
|---|---|---|---|
| 1 | `perf-WS1` | `packages/happy-app/sources/sync/refreshClaim.ts` + its test | Only file in its tree |
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

## A — `perf-WS1` — Realtime perf, refresh-skip

```
/plan-with-ralph "Realtime sync perf — Workstream 1: skip refreshTunnelClaim roundtrip when current claim is still valid. Per plans/realtime-sync-perf.md §Workstream 1. In packages/happy-app/sources/sync/refreshClaim.ts, before doing the HTTP POST to /pair/complete, parse the cached credentials.tunnelClaim via parseTunnelClaimPayload (from packages/happy-app/sources/auth/pairing.ts) and skip the network call when exp - now > SAFETY_WINDOW_S (suggest 60-120s). Keep the existing MIN_REFRESH_INTERVAL_MS as a secondary guard. Read packages/happy-app/CLAUDE.md sync invariants (especially 'Session/machine-scoped network calls') before editing. Acceptance: existing refreshClaim tests stay green; add one new test asserting no fetch when cached claim still has exp > now + SAFETY_WINDOW_S. Test command: pnpm --filter '{packages/happy-app}' exec vitest run sources/sync/refreshClaim.test.ts 2>&1 | tee /tmp/codexu-ws1.log. Cross-package typecheck must stay green. Single commit on main with body referencing plans/realtime-sync-perf.md §WS1. Update plans/realtime-sync-perf.md and docs/validation/devtunnels-boox-result.md 'Realtime sync perf (deferred)' subsection to mark WS1 done."
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
| `perf-WS1` | Realtime perf — refresh-skip | 🟡 in progress | — |
| `perf-WS3` | Realtime perf — replay buffer | 🟡 in progress | — |
| `perf-WS2` | Realtime perf — placeholder (after WS3) | ⬜ blocked on WS3 | — |
| `3a-skills` | Phase 3a — Ralph skills port | ⏸ paused (prerequisites not yet met) | — |
| ~~`F-013-perms`~~ | Claude permission latent override | 🚫 closed (obsolete-by-design) | b5d18eb5 → close-out |
| `F-015-toast` | Stale-creds toast on cold launch | ⬜ not started | — |
| `mcp-discovery` | Codex agent project-.mcp.json parity | ⬜ not started | — |
| `codex-parity-audit` | Research: gaps in codex agent feature parity vs Claude | ⬜ not started | — |
| `1a-fork-doc` | Phase 1a — fork strategy commit | ⬜ not started | — |
| `1b-multidev` | Phase 1b sub-tasks 3 + 4 | ⬜ not started | — |
| `3b-agents` | Phase 3b-i + ii — subagents → roles | ⬜ blocked on 3a discovery | — |
| `3c-hooks` | Phase 3c — hooks port / verify | ⬜ not started | — |
| `3d-workers` | Phase 3d — native worker spawn (after 3b) | ⬜ blocked on 3a + 3b | — |
| `3fg-package` | Phase 3f + 3g — asset + packaging | ⬜ blocked on 3a discovery | — |
| `3h-options` | Phase 3h — options-mode migration | ⬜ not started | — |
| `polish-Fs` | F-017 + F-001/F-002 + F-003-F-007 | ⬜ not started | — |
| `userid-cleanup` | Drop multi-tenant userId scoping in happy-server | ⬜ blocked on perf-WS3 | — |
| `happy-upstream-sync` 🔄 | Periodic — review new slopus/happy commits since last sync | ⬜ next due ~4w from 2026-05-03 | — |
| `codex-upstream-rebase` 🔄 | Periodic — rebase codex submodule on openai/codex | ⬜ first run pending | — |

🟡 = in progress (agent actively working, not yet committed). Refresh after each landing.

When all of the above land, the roadmap's next gate is **Phase 4 — Coexistence verification** (13 integration sub-items 4a-4m). Those run sequentially per environment, not parallel, so they're not in this file.
