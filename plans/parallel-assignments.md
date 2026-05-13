# Parallel ralph plan commands

Self-contained `/plan-with-ralph` prompts for parallel-safe tasks. Drop into a fresh Claude session.

**Batch 1 (six tasks below) are pairwise safe to run together.** Don't add a "perf WS2" agent yet — it must wait until B (WS3) lands, because both touch `storage.ts` and WS3 changes WS2's scope.

> **🛑 `3a-skills` is in pre-code discovery (2026-05-13).** The operator instructed that agent to survey prerequisites and update the roadmap + this file + `plans/overview.html` BEFORE starting code work. Phase 3 sub-phases that build on 3a's output — **`3b-agents`, `3d-workers`, `3fg-package` in batch 2** — should NOT be assigned until `3a-skills` either lands or commits its discovery pass. Re-read this file before firing those three.

Per-task usage:

1. Open a fresh Claude session, name the terminal tab per the title below.
2. Paste the `/plan-with-ralph "..."` block. Ralph drafts a PRD + plan under `.ralph/jobs/<auto-named>/`.
3. Review the plan, then run `/implement-with-ralph` (or `/implement-with-ralph resume <job-name>` if iterating).

When each task lands, mark its row done at the bottom of this file.

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

## C — `3a-skills` — Phase 3a, Ralph skills port

```
/plan-with-ralph "Phase 3a — port Ralph plugin skills from Claude Code plugin format to codex plugin format. Per plans/codexu-roadmap.md §Phase 3a. Source: C:/ai-developer-toolkit/plugins/ralph/skills/ — 13 SKILL.md files (4 user-invocable: brainstorm-with-ralph, plan-with-ralph, implement-with-ralph, review-plan-with-ralph; 9 internal: analyze-iteration, convert-to-ralph-prd, create-prd, decompose-plan, edit-prd, list-jobs, parallel-ralph, review-changes, run-ralph). Target: under packages/codexu-plugin/ — use existing packages/codexu-plugin/skills/hello-world/SKILL.md as the format template. Conversion per skill: keep SKILL.md frontmatter shape (name, description, model if set); strip Claude-only fields like allowed-tools (silently tolerated by codex per Phase 2b finding); add manifest entries to packages/codexu-plugin/.codex-plugin/plugin.json under skills array. Verify manifest shape against codex/core-plugins/src/manifest.rs:12-33 (codex is a git submodule — read but do not edit). Read packages/codexu-plugin/README.md and the roadmap §Phase 1c for the existing scaffold context. Acceptance: after `codex plugin marketplace upgrade codexu` and re-enable, all 13 skills appear in `codex debug prompt-input` with correct paths; one user-invocable skill (suggest /list-jobs) works end-to-end via TUI /skills picker. Do NOT port options-mode (Phase 3h, separate plan). Commit-per-skill or single bundle commit, your judgment. Pitfall: codex's skills field in plugin.json supports only ONE path inside plugin root — see Phase 2b note in roadmap."
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

# Batch 2 — additional roadmap stories

Less-critical or sequenced-after-batch-1 ralph commands. Each is parallel-safe with the batch-1 set (different file trees) **except as noted**. Mark batch-2 status in the bottom table.

## G — `perf-WS2` — Realtime perf, optimistic placeholder

> **Wait until `perf-WS3` lands** — both touch `storage.ts` and WS3's replay-overflow semantics define WS2's fallback scope.

```
/plan-with-ralph "Realtime sync perf — Workstream 2: stop blocking new-message processing on a full sessions re-fetch. Per plans/realtime-sync-perf.md §Workstream 2. When a new-message socket event arrives for a sid not in storage (current code at packages/happy-app/sources/sync/sync.ts:1693-1710 blocks on sessionsSync.invalidateAndAwait() then replays queued messages), instead synthesize an optimistic placeholder StoredSession from event envelope fields (machineId from socket scope, sid, lastSeq from message, placeholder metadata { path: '', host: '', flavor: 'unknown' }, active: true, updatedAt: createdAt), insert via storage.applySessions, then apply the message immediately via the existing enqueueMessages fast path. Kick off sessionsSync.invalidate() (NOT invalidateAndAwait) to back-fill real metadata; applySessions overwrites the placeholder when the fetch resolves. Remove sessionInitInFlight set + pendingNewMessages queue (lines ~199-200) — both become unnecessary. Read packages/happy-app/CLAUDE.md sync invariants AND the new 'Session/machine-scoped network calls' note before editing. Acceptance: new test in sources/sync/sync.test.ts — mock storage with no session for sid='sx', fire new-message event, assert placeholder inserted + message enqueued BEFORE any fetchSessions mock awaited; existing new-message lifecycle tests (turn-start/turn-end thinking) stay green. Test command: pnpm --filter '{packages/happy-app}' exec vitest run sources/sync/sync.test.ts 2>&1 | tee /tmp/codexu-ws2.log. PREREQUISITE: WS3 must already be on main — re-read WS3's replayOverflow handling so the placeholder path defers to socket replay when available. Single commit; update plans/realtime-sync-perf.md and docs/validation/devtunnels-boox-result.md."
```

---

## H — `1a-fork-doc` — Phase 1a, Codex fork strategy commit

> Parallel with anything. Documentation-only in the codex submodule.

```
/plan-with-ralph "Phase 1a — Codex fork strategy commit. Per plans/codexu-roadmap.md §Phase 1a + Decisions still open #1. Decide between the documented fork-strategy options (subtree mirror + overlay crates vs alternative) and write up the chosen approach. Files to write: codex/docs/implementation/architecture.md (new 'Fork strategy' section), codex/docs/implementation/patch-surface.md (note upcoming patches: plugin scoping per Phase 2c, AskUserQuestion primitive per Phase 2d, Claude-via-Copilot adapter per Phase 7), codex/CLAUDE.md (top-level pointer to codexu-roadmap.md). Read codexu's docs/plans/codex-fork-extension-strategy.md FIRST — that doc covers the consumer side of fork strategy (what codexu assumes about cadence + RPC contract version); do not pick a fork strategy that invalidates its assumptions. The codex/ directory is a git submodule pointing at gim-home/codex; commit in the submodule (separate repo), then bump the submodule pointer in codexu main repo. Acceptance: 3 files updated in codex submodule with internally consistent strategy + cross-reference; codexu submodule pointer bumped; codexu-roadmap.md §Decisions made gets a new entry locking the choice. No code changes, no tests. Surface choice to operator before final commit if more than one option seems viable."
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
| `perf-WS1` | Realtime perf — refresh-skip | ⬜ not started | — |
| `perf-WS3` | Realtime perf — replay buffer | ⬜ not started | — |
| `perf-WS2` | Realtime perf — placeholder (after WS3) | ⬜ blocked on WS3 | — |
| `3a-skills` | Phase 3a — Ralph skills port | 🟡 in discovery (no code yet) | — |
| ~~`F-013-perms`~~ | Claude permission latent override | 🚫 closed (obsolete-by-design) | b5d18eb5 → close-out |
| `F-015-toast` | Stale-creds toast on cold launch | ⬜ not started | — |
| `mcp-discovery` | Codex agent project-.mcp.json parity | ⬜ not started | — |
| `1a-fork-doc` | Phase 1a — fork strategy commit | ⬜ not started | — |
| `1b-multidev` | Phase 1b sub-tasks 3 + 4 | ⬜ not started | — |
| `3b-agents` | Phase 3b-i + ii — subagents → roles | ⬜ blocked on 3a discovery | — |
| `3c-hooks` | Phase 3c — hooks port / verify | ⬜ not started | — |
| `3d-workers` | Phase 3d — native worker spawn (after 3b) | ⬜ blocked on 3a + 3b | — |
| `3fg-package` | Phase 3f + 3g — asset + packaging | ⬜ blocked on 3a discovery | — |
| `3h-options` | Phase 3h — options-mode migration | ⬜ not started | — |
| `polish-Fs` | F-017 + F-001/F-002 + F-003-F-007 | ⬜ not started | — |

🟡 = in flight (agent running but not yet committed). Refresh after each landing.

When all of the above land, the roadmap's next gate is **Phase 4 — Coexistence verification** (13 integration sub-items 4a-4m). Those run sequentially per environment, not parallel, so they're not in this file.
