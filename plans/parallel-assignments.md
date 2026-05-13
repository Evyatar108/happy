# Parallel ralph plan commands

Self-contained `/plan-with-ralph` prompts for parallel-safe tasks. Drop into a fresh Claude session.

**All five below are pairwise safe to run together.** Don't add a 6th "perf WS2" agent — it must wait until B (WS3) lands, because both touch `storage.ts` and WS3 changes WS2's scope.

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

## D — `F-013-perms` — Claude permission latent override

```
/plan-with-ralph "F-013 fix — latent permission-mode override path in Claude permission handler. Per .ralph/jobs/devtunnels-E-cleanup/notepad.md F-013 entry — re-read the exact finding text and reproduction before scoping the fix. Likely file: packages/happy-cli/src/claude/permissions.ts (mapToClaudeMode) or src/claude/utils/sessionAllowlist.ts. Read packages/happy-cli/CLAUDE.md 'Permission Mode Protocol' section first — it documents the 7-mode wire enum vs 4-mode SDK enum, and how publishPermissionModeIfChanged mutates runner-local metadata. Apply the fix per the notepad's remediation; if remediation is vague, write the plan in plan form and surface the question to the operator before implementing. Acceptance: existing permission tests stay green; add one test exercising the previously-latent override path. Test command: pnpm --filter '{packages/happy-cli}' exec vitest run 2>&1 | tee /tmp/codexu-f013.log. Cross-package typecheck must stay green. Single commit; reference F-013 in the commit body."
```

---

## E — `F-015-toast` — Stale-creds toast on cold launch

```
/plan-with-ralph "F-015 fix — stale-creds profile-parse error toast surfaces on cold app launch before pair completes (cosmetic). Per .ralph/jobs/devtunnels-E-cleanup/notepad.md F-015 entry — re-read exact text before scoping. Trace: app cold-launches → AuthContext loads persisted creds from TokenStorage → if a persisted profile is in the pre-Sprint-E shape, profileParse throws → an error toast surfaces before the user sees the pair screen. Files likely involved: packages/happy-app/sources/auth/AuthContext.tsx, packages/happy-app/sources/sync/profile.ts (profileParse), packages/happy-app/sources/auth/tokenStorage.ts. Fix: suppress the toast on the pre-pair branch (TokenStorage has no machine credentials yet); silently fall through to the pair screen. Do NOT add a backwards-compat shim to profileParse — per the production-quality-code preference, delete unused shape branches if they exist. Read packages/happy-app/CLAUDE.md sync invariants. Acceptance: cold launch with no creds → pair screen, zero error toast; cold launch with valid post-Sprint-E creds → session list as before; pollutes-MMKV launch (simulate by writing a v1 profile shape) → pair screen, zero toast. Test command: pnpm --filter '{packages/happy-app}' exec vitest run 2>&1 | tee /tmp/codexu-f015.log. Single commit; reference F-015."
```

---

## Status

Mark each row when the agent's commit lands on `origin/main`. Refresh `plans/overview.html` after.

| Tab title | Task | Status | Commit |
|---|---|---|---|
| `perf-WS1` | Realtime perf — refresh-skip | ⬜ not started | — |
| `perf-WS3` | Realtime perf — replay buffer | ⬜ not started | — |
| `3a-skills` | Phase 3a — Ralph skills port | ⬜ not started | — |
| `F-013-perms` | Claude permission latent override | ⬜ not started | — |
| `F-015-toast` | Stale-creds toast on cold launch | ⬜ not started | — |

After all five land, the next batch:

- **`perf-WS2`** — optimistic placeholder session (gated on WS3 landing — re-scope per WS3's overflow semantics)
- **`3b-i-agents`** — Phase 3b-i, ralph subagents → codex agent roles
- **`3h-options`** — Phase 3h, options-mode plugin migration (575 LOC hooks)
- **`1b-3-multidev`** — Phase 1b sub-task 3, multi-device discoverability hint
- **F-014 / F-017 / F-001-F-007** — remaining polish

When that batch is queued, append new sections below and update `plans/overview.html`.
