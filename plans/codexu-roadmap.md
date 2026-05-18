# codexu — codex multi-device + multi-agent stack roadmap

*Living doc. First captured 2026-05-02. Holistic 3-way review (Claude × Claude × Codex) applied 2026-05-02. Project rename to "codexu" attempted 2026-05-02; **package-level rebrand REVERTED 2026-05-03** to enable clean upstream merge with `slopus/happy`. Update as decisions land or evidence shifts.*

> **🔄 Companion snapshot:** `plans/overview.html` is a visual kanban + phase-tree
> snapshot of this roadmap, backed by `plans/overview-data.js`. **When you edit
> this file in a way that changes assignment readiness, blocks, or phase status,
> refresh `plans/overview-data.js` in the same commit.** The HTML is a derivative
> view — the markdown and data file are authoritative.

## 🚀 Status — fresh agents start here

**Project name:** **codexu** — umbrella brand for the multi-device +
multi-agent codex stack. The repo + monorepo are named `codexu`. The
NEW `packages/codexu-plugin/` is named `codexu-plugin`. **Internal
package directories `packages/happy-{cli,app,server,agent,wire,app-logs}`
intentionally KEEP their `happy-*` names** to preserve clean upstream
merges from `slopus/happy`.

**Rebrand status (2026-05-03):**
- ✅ GitHub repo renamed `Evyatar108/happy` → `Evyatar108/codexu`
- ✅ Local dir renamed `C:/harness-efforts/happy` → `C:/harness-efforts/codexu`
- ✅ NEW `packages/codexu-plugin/` scaffold added
- ✅ Roadmap moved to `codexu/plans/codexu-roadmap.md`
- ✅ Workspace junctions/submodule (`codexu/codex` is now a submodule pointing at gim-home/codex; `codexu/ralph`, `codexu/options-mode`, `codexu/inspirations/*` remain per-machine junctions)
- ❌ Package-level rebrand (happy-cli → codexu-cli, npm names, bin
   names, `@slopus/happy-wire` → `codexu-wire`) was applied then
   **REVERTED** 2026-05-03. Reason: 79 upstream commits + 1971-file diff
   with `slopus/happy` would conflict heavily on renamed paths.
   Re-attempt deferred until upstream tracking is dropped or merge
   cadence stabilizes.

**Decision change:** the earlier "codexu fork stops tracking upstream
slopus/happy" decision is **partially reversed**. Resume one-time-or-
periodic merges from `slopus/happy` to absorb upstream improvements
(codium plugins, theme system, model adds, init-hang fix). Long-term
divergence direction (codex-only, GitHub-OAuth + Microsoft Dev Tunnels)
is unchanged.

**Upstream merge 2026-05-03 (commit `25fe2cf3`):** absorbed 79 upstream
commits / 1971 files / 25 conflicts. All 5 typechecks green post-merge.
Headline upstream additions: codium plugin system + plugin-host
inference, codium theme system (55 presets) + picker, Codex OAuth via
PKCE in-process, Streamdown rendering, model adds (Opus 4.7, GPT 5.5),
**`@pierre/diffs` as canonical diff renderer**, init-ready-hang fix,
EAS submit profiles. Fork divergences kept: BOOX/Firebase release SKILL,
sidebarMode 3-state (alongside upstream's sidebarCollapsed boolean),
1.1.8-evy.10 version suffix, `mergeSDKInitMetadata` helper,
`publishPermissionMode`, `AnimatedDiffText`/`AnimatedMarkdownText`
font-scaling path, `CollapsibleDiffPreview` `maxVisibleLines` path.

**Hybrid merges — follow-up cleanup status:**
- ✅ **`ToolDiffView.tsx` dual-path** — DONE 2026-05-03 (commit
  `1c978964`). Collapse-diff (`maxVisibleLines`) ported into
  `PierreDiffView`. ToolDiffView now uses a single PierreDiff path for
  both fork (Edit/MultiEdit) and codex (CodexDiff/CodexPatch) callers.
  Native still routes through DiffView under the hood (with hunks +
  maxVisibleLines forwarded); web wraps in `maxHeight` for clipping.
- ✅ **`runClaude.ts` parallel `currentMode` + `currentRunMode`** — DONE
  2026-05-03 (commit `e50f63d6`). Dropped `currentRunMode`; single
  `currentMode` var; updated 1 reader (line 464, `/mcp` + `/skills`
  special-command handler).
- ⬜ **`MarkdownView.tsx`** absorbed upstream's row-based table layout
  but kept `AnimatedMarkdownText` for font scaling — visual review
  TBD on tablet.

**Test failures from upstream merge — RESOLVED 2026-05-03** (commit
`e50f63d6`):
- ✅ `sources/sync/modeHacks.test.ts` — 3 tests (source was
  title-casing 'build'/'plan'; reverted to lowercase per fork philosophy)
- ✅ `sources/components/modelModeOptions.test.ts` — 1 test (added
  `gpt-5.5` to expected codex fallback list; the 2nd test was already
  fixed by the modeHacks revert)
- ✅ `sources/sync/settings.spec.ts` — 1 test (added
  `compactSessionView` + `fileDiffsSidebar` to expected defaults)
- ✅ `sources/hooks/useSessionQuickActions.test.tsx` — 1 test (extended
  `machineResumeSession` expected args with `model: undefined` +
  `permissionMode: 'bypassPermissions'`)
- ⏸ `sources/-session/SessionView.sendWhenIdle.test.tsx.disabled` —
  file-level fail; renamed `.disabled` to skip vitest collection. Root
  cause: upstream's react-native-reanimated bump pulls Flow
  `import typeof` syntax through the import chain bypassing the vitest
  RN stub. Tracked as deeper RN-test-setup follow-up.

745 tests passing (was 738); 0 failing.

**Internal symbols** (function names like `spawnHappyCLI`), **schema
field names** (`happyHomeDir`), **env vars** (`HAPPY_VARIANT`), **runtime
state directories** (`~/.happy/`), **tmux session names**, and **brand
references in docs/skills** intentionally **left as-is** — those carry
runtime + wire-compat with existing user installs and need per-symbol
review before renaming.

### What's where

| Component | Location | Repo |
|---|---|---|
| codexu monorepo (`packages/happy-{cli,app,server,agent,wire,app-logs}` + `packages/codexu-plugin` + `packages/codium`) | `C:/harness-efforts/codexu/` | `Evyatar108/codexu` |
| Personal codex plugin | `C:/harness-efforts/codexu/packages/codexu-plugin/` | (in codexu monorepo) |
| Codex engine fork | `C:/harness-efforts/codex/` | `Evyatar108/codex-patched` (canonical name; currently stale; sync in Phase 1a) |
| Upstream (resumed tracking) | n/a | `slopus/happy` |
| Roadmap (this file) | `C:/harness-efforts/codexu/plans/codexu-roadmap.md` | (in codexu monorepo) |

Workspace dependencies inside `C:/harness-efforts/codexu/`:

```
codexu/codex          → git submodule (gim-home/codex, pinned SHA in .gitmodules)
codexu/ralph          → C:/ai-developer-toolkit/plugins/ralph             (per-machine junction)
codexu/options-mode   → C:/ai-developer-toolkit/plugins/options-mode      (per-machine junction)
codexu/inspirations/oh-my-codex      → C:/harness-efforts/oh-my-codex      (per-machine junction)
codexu/inspirations/just-every-code  → C:/harness-efforts/just-every-code  (per-machine junction)
codexu/inspirations/claude-code      → C:/harness-efforts/claude-code/worktrees/main (per-machine junction)
```

`codex/` is a real git submodule (committed since 2026-05-12); fresh
clone needs `git submodule update --init` to populate it, AND `gh auth
switch` to a user with `gim-home` org access (only that user's git
credentials can clone gim-home/codex which is private). The four
non-codex paths above remain per-machine `mklink /J` junctions
(gitignored); the recipe lives in README — replicate on a fresh
machine before working in this tree.

**Codex fork stays separate.** The runtime codex engine is `gim-home/codex`,
pinned via the `codex/` submodule. Inside that fork, the structure follows
the just-every/code pattern: `external/repos/codex-patched/codex-rs/` as a
subtree mirror of upstream openai/codex + gim-home's overlay crates for
fork-divergence work. **Hard rule:** never edit upstream-mirror files
inside the subtree directly — minimizes upstream-merge conflicts. All
patches go in the overlay crates.

**Engine fork sync status (2026-05-12).** codexu now pins gim-home/codex
directly via the `codex/` submodule (commit `8c520489`), eliminating the
prior "canonical-target naming" gap. `Evyatar108/codex-patched` still
exists as an optional public mirror, but codexu does NOT pin it — public
mirror sync is now a "nice to have" for openai/codex absorption tracking
rather than a release blocker. The 142 gim-home-only subtree commits
remain unpushed to codex-patched; Phase 1a sync becomes opportunistic
polish.

### Settled decisions — do NOT relitigate

- **Decision #1 (fork strategy):** stay on upstream codex + adopt
  read-only-mirror + `codexu-rs/` divergence-dir layout (just-every
  style). Goal: keep upstream merges clean.
- **Decision #4 (consensus model):** keep cross-vendor 3-way via
  shell scripts (claude-exec.sh + codex-via-role + copilot-exec.sh).
- **codexu fork resumed tracking upstream `slopus/happy` (revised 2026-05-03).**
  Earlier decision to stop tracking was reversed when 79 upstream commits
  worth absorbing (codium plugins, theme system, model adds, init-hang
  fix) made the rebrand-blocking-merge tradeoff untenable. Long-term
  divergence direction (codex-only, GitHub-OAuth + Microsoft Dev Tunnels
  per `github-auth-via-vscode-tunnels.md`) is unchanged; tracking is for
  pulling improvements, not for following slopus's product direction.
- **Personal plugin lives as subdir** `packages/codexu-plugin/` of
  codexu monorepo. Single source of truth.
- **Roadmap moved** to `codexu/plans/codexu-roadmap.md` with 1-line
  stub redirect at old `codex/plans/codex-stack-roadmap.md`.
- **Workspace consolidation:** the codexu monorepo IS the workspace.
  Junction codex fork + ralph plugin + options-mode plugin +
  inspirations into the codexu working tree for navigation
  convenience.

### Standing rules

- The codex fork repo at `Evyatar108/codex-patched` is NOT being
  renamed. References to `codex` / `codex-rs` / `codex-patched` stay.
- Codexu = brand, the consumer-facing multi-device stack.
  Codex (or codex-patched) = the engine, separate fork.
- Internal `happy*` symbols, env vars, schema fields, and `~/.happy/`
  directories remain — wire-compat. Rename per-symbol after the relevant
  user-facing breaking change lands (e.g., schema bump, env-var migration
  helper, etc.).
- Upstream-derived doc/skill references to "Happy Coder", `slopus/happy`,
  and `happy.engineering` are HISTORICAL and stay as-is.
- **Task phase model:** roadmap command rows are rendered from
  `plans/overview-data.js` and split durable lifecycle from temporary
  availability: `data-task-phase` uses the 10-value enum documented in
  `plans/parallel-assignments.md`, while `data-task-status` is only `ok` /
  `blocked` / `paused`. Phase controls ordering; blocked/paused status
  overrides filter and Today-panel buckets.

### In-flight ralph jobs (2026-05-13)

Track here when an agent is actively working a roadmap story. **Refresh after
each commit lands or when scope shifts**.

- **`3a-skills`** (Phase 3a — Ralph plugin skills port to codex plugin format):
  ⏸ **PAUSED 2026-05-13**. Operator closed the session because the prerequisites
  the agent needs to survey are not yet met. Don't re-spawn until the operator
  re-establishes the missing context (the agent was asked to survey codex plugin
  format quirks, marketplace schema constraints, scaffold-template gaps before
  writing any code). Phase 3 sub-phases that build on 3a — `3b-agents`,
  `3d-workers`, `3fg-package` — remain blocked on 3a's eventual discovery
  commit. `3c-hooks` and `3h-options` are parallel-safe and unaffected.
- **`3h-options`** (Phase 3h — options-mode plugin migration):
  ✅ **DONE 2026-05-13**. Shipped `packages/codexu-options-mode-plugin/`
  with Codex SessionStart, UserPromptSubmit, and Stop hook wiring, docs,
  smoke script, marketplace registration, and tests. Two parity gaps remain
  explicit Phase 3h-tail engine follow-ups: a Codex TUI plugin statusline slot
  and a `request_user_input` `pre_tool_use_payload()` override for
  AskUserQuestion auto-intercept.
- **`agent-tree-rpc`** (Phase 6 / agent architecture): ✅ **DELIVERED
  2026-05-13** on branch `agent-tree-rpc`. Shipped shared agent-tree wire
  schemas, happy-cli reducer/RPC/delta emission, Codex v2 + legacy spawn-event
  parsing, and happy-server validation/fan-out for live `agent-tree-update`
  frames. The real-Codex nested-child acceptance remains blocked by the pinned
  child-agent tool surface, but downstream app work can consume the shipped
  `sessionGetAgentTree` snapshot and `{ sessionId, delta }` fan-out semantics.

### Codex changes — minimize upstream conflict surface

**`codex/` is a git submodule** (its own repo: `gim-home/codex`). Inside it
there's a subtree mirror of openai/codex at
`codex/external/repos/codex-patched/`, overlay crates at
`codex-rs-overlay/` (e.g. `codex-copilot`, `codex-copilot-launcher`,
`codex-invariant-tests`), and divergence docs at `codex/docs/`.

The tenet for every ralph plan that needs codex changes:

1. **Avoid editing codex source if you can.** Most happy-cli–side work
   doesn't need to touch the submodule at all — read-only references for
   schema shape / call-site signatures are fine. Verify "do I actually need
   to patch codex?" before assuming so.
2. **When new behavior IS needed inside codex, prefer a new package
   alongside.** The `codex-rs-overlay/` divergence crates are the
   working precedent (Copilot adapter, Copilot launcher, invariant tests).
   New divergence work goes there, not into upstream-canonical files.
3. **If you must patch upstream-canonical files inside
   `external/repos/codex-patched/codex-rs/`, keep the diff as small as
   possible.** Every local edit there creates a merge conflict on the next
   subtree pull. Surface the patch to the operator for review BEFORE
   committing.
4. **Use a worktree of the codex submodule** for the ralph job's work, the
   same way ralph jobs use codexu worktrees under
   `.ralph/jobs/<name>/worktree/`. Recommended layout:
   `.ralph/jobs/<name>/codex-worktree/` — a `git worktree add` off
   gim-home/codex's main, scoped to the job, cleaned up when the job
   merges. This isolates the agent's in-flight codex edits from the
   shared submodule checkout in the parent codexu worktree.
5. **Submodule pointer bumps in codexu** are a separate commit on codexu
   main after the codex-side commit lands and is pushed to gim-home/codex.

The corresponding ralph commands in `plans/parallel-assignments.md` carry
this tenet inline. If a new ralph command needs codex changes, propagate
the callout there too. Phase 1a (`1a-fork-doc`) is the canonical commit
that locks the fork-tracking strategy in `codex/docs/implementation/`,
including how `codex-rs-overlay/` relates to the subtree and how upstream
syncs land.

### Right now (2026-05-07): Phase 1b sub-task 2 shipped; pause before sub-task 3

**Phase 1b sub-task 1 shipped:** Codex app-server transport refactor
from stdio-only to the transport interface + stdio extraction + loopback
WebSocket adapter, with `--codex-transport=stdio|ws`, ws as the default,
and sandbox-enabled non-Windows sessions forced back to stdio for this
phase.

**Phase 1b sub-task 1 security follow-up shipped:** the default ws
transport now uses upstream-native per-spawn capability-token auth. Each
spawn attempt passes `--ws-auth capability-token --ws-token-sha256
<64-hex-sha256>` to `codex app-server`; the raw token stays in memory
and is sent only as `Authorization: Bearer <token>` on the ws upgrade.
Happy probes `codex app-server --help` once per client instance for
`--ws-auth`: explicit `--codex-transport=ws` fails closed when unsupported,
while the implicit default falls back to stdio with one warning.

**Phase 1b sub-task 2 shipped:** Discovery + reattach now writes
`${configuration.happyHomeDir}/codex-active-${cwdHash}.json` plus the
matching `.lock`, preserves detached ws app-servers across foreground
`happy codex` exits, reattaches same-realpath(cwd) invocations to the
running backend, and holds the lock across force-restart terminate ->
delete -> respawn -> discovery-write. Real-Codex integration acceptance
for ws reattach, force-restart non-hang behavior, and stdio discovery
skip is green. Branch: `ralph/codex-discovery-reattach`; PR link:
<https://github.com/Evyatar108/codexu/pull/new/ralph/codex-discovery-reattach>.

**Next concrete deliverable:** Dev Tunnels migration — **all 5 sprints landed on
`main`** (Sprints A+B+C+D earlier; Sprint E 5/7 collapsed in 2026-05-12, then
the remaining US-005 BOOX validation + US-007 Prisma migration finished
2026-05-13 with substantial corrections to the originally-shipped design — see
"BOOX validation 2026-05-13" sub-bullet under Sprint E below). Local `main` is
**6 commits ahead of origin/main** awaiting push. 5-sprint plans
live under
`.ralph/jobs/devtunnels-{A-foundation,B-cli,C-agent,D-app,E-cleanup}/plan.md`;
master reference + 5-round review audit trail at
`.ralph/jobs/devtunnels-migration/`. Orchestration sheet (per-sprint
plan-with-ralph + implement-with-ralph commands, dependency chain,
conflict-surface analysis) at `.ralph/jobs/devtunnels-commands.md`.

**Sprint status:**
- **Sprint A — Foundation: COMPLETE.** 12 stories (US-A1..US-A10 + US-A5a/b/c)
  + 5 review rounds. 42 commits including the Dev Tunnels API spike
  (`docs/spikes/devtunnel-api-discovery-result.md`), Option A plaintext RPC
  payload contract (`docs/security-model.md`), dual-listener binding off
  shared context, /v2/me/* routes with paths injection, /pair/status
  unconditional accountId derivation, MachineTunnelSchema in happy-wire,
  DaemonTunnelProvider (cli) + ClientTunnelProvider (agent), and embedded
  Redis gating. Audit trail at
  `.ralph/jobs/devtunnels-A-foundation/FINAL-STATUS.md`.
- **Sprint B — happy-cli cutover: COMPLETE.** 20 commits including
  GitHub device flow, per-machine credentials, daemon dual-listener
  integration, REST + Socket.IO retarget, RPC encryption deletion,
  promoted `writeJsonAtomically` helper to `@slopus/happy-wire/node`,
  and the daemon Socket.IO middleware `socket.data.accountId` wiring (US-B5).
  Merged into A's branch.
- **Sprint C — happy-agent migration: COMPLETE.** 15 commits including
  credentials reshape, `discoverMachineTunnels` + the historical claim-refresh helper,
  `monitor.ts` adoption of the new pipeline, and RPC encryption deletion
  on the caller side. Merged into A's branch.
- **Sprint D — happy-app cleanup: COMPLETE.** 30 commits (6 stories + 19
  review fixes + 5 doc updates) including `ClientTunnelProvider` HTTP impl,
  picker refactor + unified pairing flow, `tokenStorage` additive reshape
  + migration shim, per-request claim refresh + multi-machine pairing,
  full QR / libsodium / X25519 / encryption surface deletion, voice /
  realtime / microphone surface deletion. Merged into A's branch.
  Cross-package totals after all four merges:
  **151 test files / 1452 tests pass, 0 failures**; all 5 package
  typechecks green (happy-server, happy-cli, happy-agent, happy-wire,
  happy-app).
- **Sprint E — cleanup + cutover: COMPLETE (with corrections).** 25
  commits originally on `ralph/devtunnels-E-cleanup`, collapsed to `main`
  2026-05-12, then US-005 + US-007 finished 2026-05-13. **The migration as
  originally shipped did not pair end-to-end** — BOOX validation surfaced
  bugs that required real code/design changes (header design, pair protocol,
  tunnel id format, port URL parsing — see "BOOX validation 2026-05-13"
  below). Passed stories:
  - **US-001** server routes + socket handlers deleted (with caller-audit
    gating; happy-agent `/v1/machines` migration first; happy-app friends
    graph removed)
  - **US-002** Prisma schema reduced (9 authorized drops + 5 zero-ref
    over-drops; `PushToken` preserved)
  - **US-003** fan-out preservation: Daemon Fan-Out Integration block
    added to `daemon.integration.test.ts`; 3-agent test in 25.4s; Windows
    ACL cleanup hardening
  - **US-004** R-D18 path (b) **shipped (header design corrected during BOOX
    validation 2026-05-13)**: `X-Tunnel-Authorization: tunnel <connect-jwt>`
    for the Dev Tunnels gateway (Microsoft's `WWW-Authenticate: tunnel`
    scheme; gateway strips before forwarding) +
    a separate daemon-side Happy claim header, later retired by remove-tunnel-claim-layer work.
    The original Sprint A `X-Tunnel-Connect` name was never reachable
    end-to-end. Plumbed through happy-app + happy-agent + happy-cli + CORS
    allow-list. Pair protocol simplified to a single `POST /pair/complete`
    (deletes `/pair/start`, `/pair/status`, per-machine GitHub device flow,
    `GITHUB_CLIENT_ID`, and `HAPPY_TUNNEL_GITHUB_OWNER`).
  - **US-006** docs sweep: `security-model.md`, `api.md`,
    `backend-architecture.md`, `cli-architecture.md`, `happy-wire`,
    `protocol.md`, `deployment.md` all updated;
    `packages/happy-agent/CLAUDE.md` created
  - **US-005** BOOX hardware Phase 1 (pairing + machine discovery)
    **PASS 2026-05-13** after substantial design corrections. Phases 2–6
    (chat round-trip, refresh-per-request, token revocation, multi-device
    fan-out, signed-APK release) deferred to a follow-up session — operator
    paused validation after Phase 1 to commit the design corrections.
    Evidence + findings table at `docs/validation/devtunnels-boox-result.md`.
  - **US-007** Prisma migration `20260512224500_drop_legacy_models_sprint_e/`
    hand-written and applied via `standalone migrate` against PGLite
    (Prisma's `migrate dev` needs an external Postgres for shadow DB, which
    we don't have on the daemon path). Migration drops 18 legacy tables
    (Account, Friendship, Feed, etc.), drops `accountId` from Machine and
    Session, creates `PushToken`. Commit `a12a5e46`.

  - **BOOX validation 2026-05-13 — corrections landed in 5 commits.** The
    Sprint A migration as shipped did not work end-to-end. See
    `docs/validation/devtunnels-boox-result.md` for the full findings
    table; high-level corrections:
    - **Header design**: Microsoft's gateway requires
      `X-Tunnel-Authorization: tunnel <connect-jwt>` (not the Sprint A
      `X-Tunnel-Connect`) AND strips that header before forwarding. The
      Happy claim moved to a separate daemon header so it survived gateway
      pass-through. That separate claim layer has since been removed. Commit `fe1626a2`.
    - **Pair protocol**: `/pair/start` + `/pair/status` + per-machine
      GitHub device flow + `GITHUB_CLIENT_ID` + `HAPPY_TUNNEL_GITHUB_OWNER`
      all deleted. Replaced with a single `POST /pair/complete` that reads
      identity from `~/.happy/profile.json`. Commit `fe1626a2`.
    - **Tunnel id**: `happy-<host>-<uuid>` (58 chars) overflowed
      Microsoft's 49-char limit. Renamed to `codexu-<host>` (22 chars).
      Tunnel label stays `happy-machine` (server discovery query) — F-014
      deferred to a future label rename + happy-server redeploy.
    - **Port URL**: client + daemon were reading `portForwardingUri`
      (singular) — Dev Tunnels API actually returns `portForwardingUris`
      (plural array). Fixed in both `tunnelProvider.ts` (app) and
      `tunnelManager.ts` (daemon). Daemon now re-derives the port URL via
      `devtunnel show --json` on every `loadForDaemon`.
    - **Pair UX**: chooser modal (browser vs device code) before login,
      inline auto-dismissing banner for the device code, 2-second poll
      interval. Needed because the operator's enterprise GitHub identity
      can't sign in on the BOOX's browser. Commit `fed4a1cd`.
    - **Stale persisted profile**: `profileParse` now accepts both V2
      server shape and the local on-disk shape persisted by `saveProfile`
      into MMKV.
  - **Review convergence:** Phase 5a code (3 rounds, 12 of 13 findings
    fixed; F-013 latent override path, Low, **closed 2026-05-13 obsolete-by-design** — superseded by Phase 5 drop-Claude; see `docs/operations/BOOX-TESTING-HANDOFF.md` and `.ralph/jobs/f-013-perms-closeout/plan.md`); Phase 5b docs (2
    rounds, 7 findings, all fixed); Phase 5c security (1 round, 0
    Critical/High, 2 Medium + 5 Low accepted as open). DSAT report at
    `.ralph/jobs/devtunnels-E-cleanup/dsat-report.md`.
  - **Open findings (deferred to polish PR):** 0 code (F-013 closed obsolete-by-design 2026-05-13); 7
    security (F-001/F-002 Medium; F-003..F-007 Low); F-014 label rename
    (needs server redeploy); F-015 stale-creds profile-error toast on
    pre-pair launch (cosmetic); F-016 adb input tap on RN buttons (BOOX
    e-ink quirk); F-017 enhancement device-pair-code shortcut;
    F-018 orphaned encryption test files (typecheck noise, no runtime
    impact); Phases 2–6 of BOOX validation (need follow-up session).
  - **Realtime sync perf (deferred, drafted 2026-05-13):** Phase 1 surfaced
    3 latency symptoms — multi-second foreground refresh, ~1 min new-message
    latency on the "unknown session" path, and HTTP-fallback churn on socket
    reconnect — that don't block Phase 1 PASS but should land before the
    migration is declared production-ready. Plan at `plans/realtime-sync-perf.md`
    covers 3 workstreams (the former claim-refresh workstream is now obsolete;
    optimistic placeholder session for unknown-session new-message path;
    server-side per-user event replay buffer + client `lastSeenSeq`
    handshake) + optional WS4 (full sockets-only `fetchSessions` /
    `fetchMessages`). Targeted at a fresh agent with file paths, line refs,
    test plans, risks, pre-flight checklist. **This is the next concrete
    deliverable after Sprint E.**
  - **Drop `userId` scoping in happy-server (open, surfaced 2026-05-13):**
    happy-server is now embedded inside the per-user daemon (Sprint A
    `createHappyServer()` + `dualListenerBinding()`). There is exactly ONE user
    per process; multi-tenant `userId` scoping is dead weight. ~140 `userId`
    references across `packages/happy-server/sources/` today — query WHERE
    clauses, socket auth payloads, event-router fan-out keys, log fields,
    Prisma column hints. Cleanup: remove `userId` from socket auth + request
    decorators (everything resolves to a single static identity per process),
    drop `userId` from Prisma queries (sessions/messages/machines), simplify
    `eventRouter` to single-user fan-out (no per-user partition), drop
    `allocateUserSeq`'s userId scoping (becomes process-global seq). Keep
    Prisma columns themselves if cheap (re-introducing multi-tenancy later
    would re-require them); the cleanup is at the code-path level. **Coordinate
    with `perf-WS3`:** WS3's plan currently spec's a per-user replay-buffer
    ring; in single-user mode the partition is trivial. Land the userId
    cleanup AFTER WS3 lands so WS3 doesn't have to re-design mid-flight; the
    cleanup then strips WS3's trivial userId partition. Estimated medium —
    140 refs but mostly mechanical. Plan: `userid-cleanup` ralph command in
    `plans/parallel-assignments.md`.
  - **Agent architecture workstream (new, 2026-05-13):** six coupled
    research / design / implementation tasks investigating multi-agent
    topology:
    - `agent-view-research` — research-only spike on Claude Code's
      recently-released "agent view" feature; output =
      `plans/agent-view-research.md` + follow-up decomposition.
    - `plugin-scope-agents` (blocked on the above) — extend Phase 2c
      plugin scoping with a top-level-only tier + an agent-spawner
      that can spawn top-level sessions on behalf of the operator,
      so plugins like `ralph-orchestration` stay scoped-out from
      sub-agents but reachable through the spawner.
    - `agent-comms` (blocked on plugin-scope-agents + channels-research)
      — MCP-based communication across THREE scopes: (A) cross-tunnel /
      cross-machine (different daemons, codexu-specific), (B)
      same-machine daemon-managed (multiple sessions on one daemon),
      (C) parent-spawned-child (agent-spawner retains the channel
      from spawn time). Design has to decide unified-transport-with-
      routing vs three distinct mechanisms vs a spectrum.
    - `channels-research` — research Claude Code's "channels" concept
      (2-way agent ↔ MCP communication) and design a codex equivalent
      if it doesn't exist there. Likely transport for agent-comms.
    - `async-events-design` (blocked on channels-research) — design
      how an agent listens to async events (commit lands on main,
      periodic task fires, sibling-agent finishes). Compare MCP
      channels vs exit-and-respawn vs long-poll vs codex-app-server
      subscription RPC.
    - `native-agent-parity` (independent) — research codex parity
      with Claude Code's preset subagent palette (Explore, Plan, etc.)
      and decide on packaging (plugin / overlay crate / migration
      command).
    Cross-references Phase 2c "Plugin scoping (host vs agent context)",
    Phase 2d "ask_user_question primitive", Phase 3b-i "subagents →
    agent roles", and Phase 6 "Long-lived teammates". New workstream
    value `agent-arch` in the overview viewer filter axis
    (`tools/overview-viewer/src/components/Toolbar.tsx` plus the
    workstream label map in
    `tools/overview-viewer/src/components/TaskCommand.tsx`); rebuild
    with `pnpm overview:build` to regenerate `plans/overview.html`.
  - **Tooling workstream (new, 2026-05-14):** roadmap-meta automation —
    a plugin in `packages/codexu-plugin/` that lets agents manage the
    roadmap (`plans/overview-data.js` + `plans/parallel-assignments.md`,
    surfaced via the overview viewer at `plans/overview.html`)
    programmatically via skill commands and/or an MCP server. Tools:
    `add-task`, `update-status`, `record-run`, `take-task` (the last
    spawns a top-level agent with the task's ralph command + flips the
    task to in-progress). Builds on the manual procedure documented in
    `.agents/skills/roadmap-and-overview/SKILL.md`. Overlaps with
    `agent-comms` Scope B (same-daemon spawn) — the plugin can ship
    v1 using existing happy-cli `spawn-happy-session` RPC without
    waiting for the broader agent-comms design. New workstream value
    `tooling` in the overview viewer filter axis
    (`tools/overview-viewer/src/components/Toolbar.tsx` plus the
    workstream label map in
    `tools/overview-viewer/src/components/TaskCommand.tsx`); rebuild
    with `pnpm overview:build` to regenerate `plans/overview.html`.
    Initial task: `roadmap-plugin`.
  - **Periodic upstream sync (new workstream, 2026-05-13):** added two
    periodic-cadence maintenance tasks that should cycle every ~4 weeks:
    `happy-upstream-sync` (review new commits in `slopus/happy` since
    last sync, decide cherry-pick / manual / defer / skip per commit;
    skill at `.agents/skills/happy-upstream-sync/SKILL.md`) and
    `codex-upstream-rebase` (rebase the codex submodule on
    openai/codex via the codex-side `rebase-upstream` skill). Tracked
    on the overview viewer (built to `plans/overview.html`) with a 🔄
    cadence indicator + new "Upstream sync" workstream + new "Cadence"
    filter axis (filter chips in
    `tools/overview-viewer/src/components/Toolbar.tsx`, workstream
    label map in `tools/overview-viewer/src/components/TaskCommand.tsx`;
    rebuild with `pnpm overview:build`). Last full happy-upstream-sync:
    2026-05-03 (absorbed 79 commits). Next due ~2026-06-03.
  - ✅ **Codex agent project-`.mcp.json` parity (delivered 2026-05-13):**
    The Claude agent under happy reads `.mcp.json` from the session cwd (Claude
    Code's standard project-MCP convention) — so `codexu/.mcp.json` (with the
    `paper` MCP server) lights up automatically. Codex now mirrors that
    project-MCP convention from happy-cli: `loadProjectMcpServers(process.cwd())`
    reads and Zod-validates `<cwd>/.mcp.json`, skips malformed entries with
    structured warnings, and merges valid project servers into the object passed
    to both `client.startThread` and `client.resumeThread` through the existing
    resume forwarder. The Happy bridge remains authoritative on duplicate names.
  - **Codex agent parity audit (shipped 2026-05-13):** structured survey of
    every Claude-Code feature the codex agent under happy doesn't match today —
    doc at `plans/codex-agent-parity-audit.md`. 12 gaps catalogued with
    file:line evidence, proposed fix-site (happy-cli vs overlay crate vs
    upstream patch), effort, severity, and a ralph-command shape per gap. 3
    High-severity gaps (project-`.mcp.json` discovery, project-`CLAUDE.md`
    auto-load, image attachments never reaching codex turn input); 4 Medium
    (hooks parity, slash commands, plan mode, custom system prompts); 5 Low
    (tool gating, codex-args passthrough, `.claude/skills/` category
    mismatch, statusline, init-metadata mirror). All proposed fix-sites are
    happy-cli-side except Gap 6 (plan mode) which has a v2 overlay-crate
    option deferred. No upstream-canonical codex edits proposed. Closes the
    "found the `.mcp.json` gap by accident" failure mode. Recommended landing
    order in the doc; Gap 1 is the existing `mcp-discovery` ralph command.

**R-D18 (pre-production gate): RESOLVED (corrected 2026-05-13).** Sprint E
US-004 shipped resolution path **(b)** — a private-tunnel auth channel via
`X-Tunnel-Authorization: tunnel <connect-jwt>` (Microsoft's standard
`WWW-Authenticate: tunnel` gateway-auth scheme). Plumbed through happy-app,
happy-agent, and happy-cli; CORS allow-list updated. The daemon-side Happy
claim originally moved to a separate daemon header to avoid colliding with the gateway
header; that separate claim layer has since been removed. The original Sprint A `X-Tunnel-Connect` naming was never reachable
end-to-end — corrected during BOOX validation. Operator policy 2026-05-12
**REJECTED** the original "Sprint C patches `tunnelManager.ts` to add
`--allow-anonymous`" path (path (a)); path (b) avoids exposing happy-server
anonymously while still allowing pair reachability through the Dev Tunnels
gateway.
Operator stopgap (path (c)) is no longer needed. Full record at
`packages/happy-app/scripts/sprint-a-gap.md` "R-D18".

Phase 1b sub-tasks 3+ became **unblocked when Sprint E completed
2026-05-13**. Before assigning, re-read the master plan
(`docs/plans/codex-seamless-multi-device.md`) against the now-resolved
tunnels protocol (`X-Tunnel-Authorization`, single `POST /pair/complete`, `codexu-<host>`
tunnel id, `portForwardingUris` plural — see "BOOX validation 2026-05-13"
above). OAuth app vs GitHub app, the now-retired signed Ed25519 envelope contract,
access path (resolved by US-A1 spike), and
local WS port policy (locked: dual-listener on tunnel-port +
loopback-port) decisions are documented in the master plan and the
per-sprint FINAL-STATUS files.

**Shipped vs deferred:**
- Shipped: `JsonRpcConnection`, extracted stdio transport, ws transport,
  `--codex-transport`, configuration.logsDir app-server logs, sandbox+
  ws->stdio override, per-spawn ws auth, detached ws spawn, discovery
  record + lock helpers, reattach-before-spawn, preserve-by-default
  foreground disconnect, and held-lock force restart. Also landed
  Windows integration cleanup for detached Codex process trees and
  generated-environment removal retries.
- Deferred: sub-tasks 3-5, daemon ownership integration, full sandbox+ws
  integration, stdio sunsetting, and stronger
  `isCodexAppServerAvailable` version-gate behavior.
- **Deferred to replan: resolved.** Phase 5c F-002 is closed by
  upstream-native per-spawn ws auth (`--ws-auth capability-token`,
  `--ws-token-sha256 <hex>`, and client `Authorization: Bearer <token>`).
  Phase 5c F-003 is closed by passing the explicit `listenUrl` into
  `createWsConnection` / `createWsTransport` instead of reading `args[2]`.
  The invariant remains: app-server ws listeners bind only loopback.

**Read for full context** (in this order, ~25 min):
1. This Status block (you're here).
2. `.ralph/jobs/devtunnels-A-foundation/FINAL-STATUS.md` — Sprint A
   completion record + 5-round review audit trail. Required reading
   before Sprint E.
3. `docs/operations/sprint-e-merge-handoff.md` — operator playbook for
   the two operator-blocked Sprint E stories (US-005 BOOX validation,
   US-007 Prisma migration) and the final
   `ralph/devtunnels-E-cleanup` → `ralph/devtunnels-A-foundation` →
   `ralph/fan-out-survivors` → `main` merge chain.
4. `docs/validation/devtunnels-boox-result.md` — BOOX 6-phase manual
   validation template (US-005).
5. `.ralph/jobs/devtunnels-commands.md` — orchestration sheet with the
   5-sprint dependency chain, conflict-surface analysis, and post-Sprint-A
   constraints (removed code paths, shared helpers, claim shape).
6. `packages/happy-app/scripts/sprint-a-gap.md` — R-D18 history. Path (b)
   shipped in Sprint E US-004; path (a) `--allow-anonymous` remains
   permanently rejected.
7. `.ralph/jobs/devtunnels-E-cleanup/notepad.md` — Sprint E deferred
   findings + reasoning (1 code Low + 7 security findings: 2 Medium + 5 Low).
8. `docs/security-model.md` — Option A RPC payload contract (Sprint A
   US-A3) — applied end-to-end across cli/agent/app via Sprints B+C+D
   encryption deletion.
9. `docs/plans/codex-seamless-multi-device.md` — sub-task 1 spec at
   "Phase 1 — Persistent multi-client app-server with reattach". The
   tunnels-supersedes callout at the top lists what NOT to apply to
   sub-tasks 3+ (those resume after Sprint E lands and the merged branch
   reaches `ralph/fan-out-survivors`).

**Recommended workflow (Sprint E completion):**

Operator-blocked tasks must complete BEFORE the cutover merge chain runs.
Step-by-step in `docs/operations/sprint-e-merge-handoff.md`. Summary:

```
# 1. Run the Prisma migration outside the agent loop, then commit:
cd C:/harness-efforts/codexu/.ralph/jobs/devtunnels-E-cleanup/worktree
pnpm prisma migrate dev --name drop_legacy_models_sprint_e
git add prisma/migrations/* && git commit -m "feat: US-007 — Prisma drop legacy models"

# 2. Run BOOX 6-phase validation, fill in docs/validation/devtunnels-boox-result.md
#    and commit.

# 3. Re-invoke ralph on US-007 to produce the final cutover commit:
/implement-with-ralph resume devtunnels-E-cleanup

# 4. Cutover merge chain (operator):
git checkout ralph/devtunnels-A-foundation
git merge --no-ff ralph/devtunnels-E-cleanup -m "Merge ralph/devtunnels-E-cleanup: Sprint E"
git checkout ralph/fan-out-survivors
git merge --no-ff ralph/devtunnels-A-foundation -m "Merge devtunnels migration"
git checkout main
git merge --no-ff ralph/fan-out-survivors -m "Merge fan-out + devtunnels migration"
git push origin main
```

After cutover lands on `main`, address F-001/F-002 security Mediums (deferred
to Sprint E notepad) as a follow-up commit on `main` or a polish branch.
Sub-tasks 3, 4, 5 of the Codex multi-device work resume only after Sprint E
hits `ralph/fan-out-survivors`.

**Pause-point:** reached. Sprints A+B+C+D are merged onto
`ralph/devtunnels-A-foundation`; Sprint E is 5/7 done with US-005 + US-007
operator-blocked. Stop here until the operator-blocked tasks complete.
Sub-tasks 3, 4, 5 resume after the full cutover chain reaches
`ralph/fan-out-survivors` (the migration's terminal step).

### Phase 2b — `.claude/skills` discovery via junctions (status 2026-05-03)

Implementation NOTE — diverged from roadmap's original sketch: codex's
plugin manifest `skills` field supports only ONE path inside plugin
root (verified against `core-plugins/src/loader.rs:678`
`plugin_skill_roots()`). NO support for arbitrary absolute paths or
multi-root arrays. The "personal plugin's `plugin_skill_roots` includes
`~/.claude/skills`" idea doesn't match the actual code.

Working approach instead: **Windows junctions** mirror Claude Code skill
locations under codex's existing `~/.agents/skills/` user-skill
discovery root (which Phase 2a Test 1 already proved works).

- ✅ User-wide: `~/.claude/skills/` → `~/.agents/skills/` junction.
- ✅ Per-repo smoke test: `~/.agents/skills/codexu-agent-browser/` →
  `C:/harness-efforts/codexu/.claude/skills/agent-browser/`. Verified
  via `codex debug prompt-input` — skill appears with frontmatter `name:`
  and real underlying path. Claude-specific frontmatter fields
  (`allowed-tools`) silently tolerated; no warnings in
  `~/.codex/log/codex-tui.log`.

Recipe documented in `packages/codexu-plugin/README.md` under
"Discovering Claude Code skills" section.

Per-cwd `.claude/skills/<name>` discovery requires explicit junction
setup per skill — the codex CLI doesn't auto-discover repo-local
skill roots. Acceptable cost for the codexu use case (only the
codexu repo carries a `.claude/skills/`); document + apply junctions
on demand.

### Phase 2a — verify upstream features end-to-end (status 2026-05-03)

Verified via `codex-cli 0.128.0-copilot-api.1` smoke tests. Detail
captured in `C:/harness-efforts/codex/docs/implementation/regression-history.md`
under "Phase 2a smoke-test verification".

- ✅ **Test 1** — `~/.agents/skills/` user-skill discovery. Dropped
  `~/.agents/skills/codexu-test-skill/SKILL.md`; verified via
  `codex debug prompt-input` that codex picks it up alongside the 5
  `.system/` skills with the correct file path attribution.
- ✅ **Test 2** — agent role spawn. Defined `[agents.researcher]` with
  `config_file = "./agents/researcher.toml"` and a custom
  `developer_instructions`. Spawned via `codex exec`; researcher
  returned the literal probe sentence — confirms role registration +
  config_file resolution + developer_instructions plumbing.
- ⏸ **Test 3** — execpolicy sandbox denial. DEFERRED. Local config has
  `sandbox_mode = "danger-full-access"`; `-c sandbox_mode="read-only"`
  override didn't switch at runtime (overlay layering issue). Re-verify
  later in a non-trusted dir or with the actual config flipped to a
  restrictive sandbox.

Phase 2a verdict: 2 of 3 tests verified, 1 deferred. No regressions
from the fork baseline. Agent role + skill discovery primitives both
work as the roadmap assumes.

### Phase 1c — personal codex plugin scaffolding (status 2026-05-03)

- ✅ **Plugin scaffold** at `packages/codexu-plugin/` (commit `5ed14a13`):
  `.codex-plugin/plugin.json`, `skills/hello-world/SKILL.md`, README.
- ✅ **Marketplace catalog** at `packages/codexu-plugin/.agents/plugins/marketplace.json`
  (commit `2e824210`). Lists single codexu-plugin entry with
  `source: { source: local, path: "." }`.
- ✅ **Marketplace registered** via `codex plugin marketplace add
  C:/harness-efforts/codexu/packages/codexu-plugin`. Stored in
  `~/.codex/config.toml` as `[marketplaces.codexu]`.
- ✅ **Junction** `~/.codex/plugins/codexu-plugin → packages/codexu-plugin`
  established for direct manifest discovery.
- ✅ **Per-user defaults** at `~/.codex/AGENTS.md` (outside this repo;
  lives per Phase 1c step 5 caveat).
- ⏸ **Plugin install + enable in TUI** — manual step. The codex CLI
  exposes only `plugin marketplace add/upgrade/remove`; actual plugin
  install (which makes plugin-provided skills appear in `/skills`
  picker) happens via the TUI plugin picker or via app-server RPC.
  Smoke test: open codex TUI → plugins picker → enable codexu-plugin →
  verify `hello-world` appears in `/skills` picker.

Phase 1c work-as-roadmap: ~90% done. Remaining is interactive TUI
verification — not blocking other roadmap items.

---

# Roadmap (existing content below)

**Goal:** consolidate on a codex-only stack. Codex is the runtime,
codexu-cli is the multi-device transport, ralph-orchestration and
options-mode plugins (migrated from Claude Code) are the workflow
drivers, and codexu-plugin holds private content. **Drop Claude Code
as a maintained surface.** No project-memory or session-notepad MCP —
knowledge stays in repo markdown. Take inspiration from oh-my-codex
(omx), just-every/code, and claude-code; do not fork or maintain any
of them.

> **🚀 If you've just been handed this roadmap, jump to ["Quick orientation
> for a future agent picking this up"](#quick-orientation-for-a-future-agent-picking-this-up)
> first** (the read-order index, ~20 min). Sections 2-5 below provide
> what-and-why context the orientation index assumes you've absorbed.

## What "symbiosis" looks like for the user

After all phases ship, the user-visible result is:

- **From any device** (laptop terminal, native codex `--remote` TUI, codexu
  ink renderer, or phone via codexu app) the user sees the SAME conversation,
  same agent state, same approval prompts, same skill catalog. Walk away
  from the laptop, pick up the phone, walk back — no mode switch, no
  reattach ceremony, no lost in-flight work.
- **Long-running ralph jobs run in the background** on the laptop's
  app-server. Phone shows their progress as cards; user can answer
  approvals or AskUserQuestion prompts from anywhere; jobs survive
  client disconnects.
- **Agent-spawned workers** (codex agent roles invoked by ralph or any
  skill) appear as additional cards/threads in the SAME session, not
  separate sessions. Resumable, optionally long-lived as teammates.
  Cross-vendor workers (claude-cli, copilot-cli) still spawn as separate
  processes but their output merges back into the main thread visibly.

That's the deliverable. Phases 1-5 ship this; phases 6-7 polish it.

## Platform context: Windows-first

The user runs Windows 11 as primary dev OS. Several pieces are
Windows-flavored:

- `windows-sandbox-rs` crate is the active sandbox backend; the Linux/macOS
  paths are well-tested upstream but secondary for our use
- Discovery file paths use `cwdHash` keying that assumes case-insensitive
  filesystem behavior (works on NTFS without surprise)
- `.claude/skills/` discovery via plugin-registered roots may need
  `mklink /D` symlink fallback if plugin scope semantics misbehave
- codexu's smoke tests verified against `codex-cli 0.125.0-copilot-api.8`
  on Windows 10.0.26200, 2026-05-02
- **Currently installed `codex` version (probed 2026-05-02): `codex-cli
  0.128.0-copilot-api.1`** — slight drift since codexu's Phase 0 baseline.
  Re-run codexu's verification scripts before Phase 1b sub-task 1 if more
  time elapses.

The stack is not Windows-only — Linux and macOS should work — but Windows
is the verified-on-this-machine target. Cross-platform gotchas (path
separators, line endings, symlink semantics, PATHEXT resolution) get
priority attention.

## Current state of codex-patched fork (the baseline before our new patches)

`gim-home/codex` already adds these vs upstream `openai/codex`. Future
agents working on this stack should understand these patches exist before
proposing new ones:

- **Copilot routing is built in.** `codex-core` talks directly to GitHub
  Copilot's chat API; the patch removes the non-LLM network paths from
  the upstream Codex workspace.
- **Built-in Copilot provider.** Launcher selects the Copilot provider and
  execs `codex-core.exe`.
- **Auth via `codex login --provider copilot`.**
- **Per-request Copilot headers injected in-process** — no loopback model
  service in v6.

See `C:/harness-efforts/codex/CLAUDE.md` and
`docs/implementation/patch-surface.md` for the full inventory and rebase
notes. New patches we add (plugin scoping, AskUserQuestion, Claude-via-
Copilot adapter) layer on top of these existing patches.

## Quick orientation for a future agent picking this up

Read in order, ~20 minutes:

1. **This whole file** end-to-end. Phases assume you've absorbed the
   `## Pre-existing capabilities` section — most of what naive readers
   assume needs forking is already in upstream codex.
2. `C:/harness-efforts/codex/CLAUDE.md` — the codex working tree's
   overview (what `gim-home/codex` adds vs upstream openai/codex).
3. `C:/harness-efforts/codexu/docs/plans/codex-fork-extension-strategy.md`
   and `codex-seamless-multi-device.md` — codexu's perspective. Phase 1b
   here is just executing the latter; do not re-derive.
4. `C:/harness-efforts/just-every-code/code-rs/core/src/agent_tool.rs`
   and `agent_defaults.rs` — read once for the cross-vendor agent
   pattern, then set aside (we are NOT vendoring this; cross-vendor goes
   through shell scripts; see Phase 3e).
5. `C:/harness-efforts/claude-code/worktrees/main/src/tools/AskUserQuestionTool/`
   — full TS implementation of AskUserQuestion. Borrow the schema
   verbatim for Phase 2d.
6. `C:/ai-developer-toolkit/plugins/ralph/CLAUDE.md` and
   `plugins/options-mode/CLAUDE.md` — the two Claude Code plugins we are
   migrating. Phase 3 is bounded by what's in those directories.

## Worktrees

| Component | Working tree | Origin remote | Role |
|---|---|---|---|
| codex (patched) | `C:/harness-efforts/codexu/codex/` (git submodule of `gim-home/codex.git`) | `gim-home/codex.git` | runtime fork (wraps `external/repos/codex-patched/` subtree). Already routes to Copilot API; ditches non-LLM network paths. Pinned by codexu via `.gitmodules`. |
| codexu | `C:/harness-efforts/codexu/` | `Evyatar108/codexu` | multi-device transport fork |
| ralph plugin | `C:/ai-developer-toolkit/plugins/ralph/` | `gim-home/ai-developer-toolkit` | autonomous-loop workflow driver (Claude Code plugin → codex plugin) |
| options-mode plugin | `C:/ai-developer-toolkit/plugins/options-mode/` | `gim-home/ai-developer-toolkit` | structured-choice prompt mode (Claude Code plugin → codex plugin); collapses into Phase 2d's AskUserQuestion primitive |
| personal codex plugin | TBD | TBD | private content + conventions |

The user's installed `codex` binary IS the patched fork. No wrappers,
no engine selection, no version pinning per consumer.

## Inspiration sources (read-only, never maintained as forks)

| Source | Working tree | What we mine |
|---|---|---|
| `just-every/code` | `C:/harness-efforts/just-every-code/` | Auto Drive design, cross-vendor `agent_tool.rs` pattern, ghost-commit utilities, layout discipline (`code-rs/` + read-only `codex-rs/`), `[[agents]]` schema for cross-vendor CLI workers |
| `claude-code` | `C:/harness-efforts/claude-code/worktrees/main/` | **AskUserQuestion tool spec** (`src/tools/AskUserQuestionTool/AskUserQuestionTool.tsx` + `prompt.ts`) — schema borrowed verbatim for Phase 2d. Plus plan-mode tool pattern (`tools/{Enter,Exit}PlanModeTool/`) and permission handler design. |
| `oh-my-codex` (omx) | `C:/harness-efforts/oh-my-codex/` | Skill content prose patterns ($ralph, $team, $deep-interview, $autoresearch). Slated for wind-down — do not maintain. |

## Architecture

```
SURFACES:        [phone] [native codex --remote TUI] [codexu ink] [bare codex CLI]
                              ↓
MULTI-DEVICE:                codexu bridge (encrypted relay + codexu CLI)
                              ↓
RUNTIME:                  codex app-server (JSON-RPC, persistent, loopback ws)
                          ┌───┼───┬───────┬─────────┬──────────┐
                          ↓   ↓   ↓       ↓         ↓          ↓
                       skills agents MCPs sandbox  AGENTS.md  AskUserQuestion
                                ↑                                (new, Phase 2d)
                                │
                       (sub-threads on the SAME app-server when codex-based)
CONTENT:                  ↑   ↑   ↑
                          └───┴───┴── personal codex plugin + ralph + options-mode
```

**Key architectural facts:**
- Codex agent roles (`[agents.<role>]`) spawn **sub-threads on the same
  app-server**, not new codex processes. `apply_role_to_config` (role.rs:40)
  applies the role's config layer to a freshly-allocated thread. Same
  process, same RPC server, same lifecycle. visible in codexu.
- Cross-vendor workers (claude-cli, copilot-cli, gemini-cli) DO get spawned
  as separate processes via shell scripts — they're external vendors, no
  way around it. No `agent_tool.rs` port needed.
- Personal plugin holds private skills + AGENTS.md fragments. Agent role
  TOMLs go in `~/.codex/config.toml` (plugins can't register them today;
  see Phase 3b).
- Phase 6 (long-lived teammates) and Phase 7 (Claude models via Copilot
  adapter) are deferred polish — not required for the codex-only stack to
  ship.

## Pre-existing capabilities (audited 2026-05-02 against `external/repos/codex-patched/codex-rs/`)

These are already in upstream codex; future agents should NOT re-implement:

- **Skills with plugin-extensible discovery roots** —
  `core-skills/src/loader.rs:221` `skill_roots()` accepts
  `plugin_skill_roots: Vec<AbsolutePathBuf>`; plugins register their own
  discovery roots. Plugin-supplied roots default to `SkillScope::User`.
  Scopes: Repo/User/System/Admin. Mention via `$<skill-name>`, picker
  via `/skills`.
- **Built-in skill discovery roots** (verified):
  `.agents/skills/` (repo + home), `$CODEX_HOME/skills/`,
  `$CODEX_HOME/skills/.system/`, `/etc/codex/skills/`. Note: **`.codex/skills/`
  is NOT a discovery root** (was incorrectly listed in earlier drafts).
- **Sub-agent system** — `core/src/agent/` has internal `AgentRegistry`,
  public-ish `AgentControl`, `Mailbox`, spawn-depth helpers
  (`exceeds_thread_spawn_depth_limit`, `next_thread_spawn_depth`). Active
  built-in roles: `default`, `explorer`, `worker` (per `role.rs:396-413`;
  `awaiter` is commented out, and `builtins/explorer.toml` is empty —
  only `awaiter.toml` actually demonstrates the role config_file format).
- **`[agents]` TOML config** — `config/src/config_toml.rs:584`
  `AgentsToml`: `max_threads`, `max_depth`, `job_max_runtime_seconds`,
  `interrupt_message`, plus user-defined `[agents.<role>]` entries via
  `AgentRoleToml { description, config_file, nickname_candidates }`.
- **Agent role spawning** — entry point is `apply_role_to_config`
  (`role.rs:40`). Spawn tool description auto-built from declared roles
  by `role::spawn_tool_spec::build` (no extra registration). Spawn tool
  lives at `core/src/tools/handlers/multi_agents_v2/spawn.rs:34-80`,
  takes `agent_type: <role-name>` argument.
- **Spawn depth tracking** — env var + registry helpers; recursion
  protection.
- **Sandboxing** — `execpolicy`, `sandboxing`, `windows-sandbox-rs`,
  `linux-sandbox`, `execpolicy-legacy` crates present and integrated.
- **Plugin system** — `plugin/`, `core-plugins/`, marketplace install /
  upgrade / disable / scope (`RemotePluginScope::Global` vs `Workspace`,
  install-location only — distinct from the host/agent scoping we
  propose in Phase 2c).
- **Hooks** — `core/src/hook_runtime.rs` (singular file, not
  `hooks*.rs`) plus `config/src/hook_config.rs`.
- **MCP host** — codex hosts MCP servers; servers register via plugin
  manifest (`mcpServers` field) or user config.
- **AGENTS.md merging** — built-in across global / repo-root / cwd, capped
  at 32 KiB.
- **App-server JSON-RPC over multiple transports** — `stdio://`,
  `unix://`, `ws://`, `off`. **`wss://` is NOT a listen transport**
  (was incorrectly listed in earlier drafts; only outbound to ChatGPT's
  remote-control endpoint). Multi-client supported (verified by codexu
  2026-05-02).
- **Native `codex --remote ws://...`** — TUI client to remote app-server;
  with Happy's per-spawn ws auth, this needs an upstream-supported way to
  supply the matching client credential without raw-token leakage before
  it becomes a Happy feature.
- **`request_user_input` tool (PLAN-MODE-SCOPED, root-thread-only).**
  `core/src/tools/handlers/request_user_input.rs` is the existing
  structured-input tool. Two intentional restrictions:
  - **Root-thread-only** (`request_user_input.rs:43-47`) — spawned
    agents cannot call it.
  - **Mode-gated** (`request_user_input.rs:49-52` +
    `request_user_input_tool_tests.rs:107-130`) — default available_modes
    is **Plan only**; Default mode rejected unless
    `default_mode_enabled_available_modes` feature flag set;
    Execute / PairProgramming always rejected.

  Schema (`protocol/src/request_user_input.rs:8-55`): `id` (stable),
  `header` (required, chip-style label), `question`, `is_other`,
  `is_secret`, optional `options[]` (each `label`+`description`),
  plus `RequestUserInputArgs.questions: Vec<RequestUserInputQuestion>`
  (multi-question batching already supported, up to 3 per tool
  description).

  **What `request_user_input` LACKS that Phase 2d's `ask_user_question`
  adds:** `preview` field on options, 2-4 options bound (existing has
  no minimum), Claude-style "Other" auto-add (existing has `is_other`
  flag the model must opt into), broader gating (any mode + any thread
  depth), bumped multi-question count to 4. Phase 2d builds a sibling
  tool not because the schema is far off — it's actually close — but
  because the gating and "Other" semantics differ enough to warrant
  preserving plan-mode UX scoping in `request_user_input` while
  `ask_user_question` covers the broader case.

**NOT in upstream (do not assume):**
- **Ghost snapshots** — `GhostSnapshotConfig` is documented as
  "Compatibility-only config retained so legacy ghost_snapshot settings
  continue to load even though snapshots are no longer produced"
  (`core/src/config/mod.rs:142-149`). Removed feature. If we want it,
  we'd port from `code-rs/git-tooling::create_ghost_commit`.
- **Plugin-registered agent roles** — plugin manifest fields are
  `skills`, `mcpServers`, `apps`, `hooks`, `interface`. There is NO
  `agent_roles` field. Roles must live in `~/.codex/config.toml`. This
  is a real gap; see Phase 3b.
- **Plugin scoping (host vs agent context)** — no `host_only`,
  `agent_only`, or scope hint in any loader. New work for Phase 2c.
- **AskUserQuestion-style structured choice tool** — codex has approval
  flows and MCP elicitation, but no first-class typed AskUserQuestion
  tool with TUI affordance. New work for Phase 2d.
- **Plugin-side `.claude/skills/` discovery** — possible by registering
  `~/.claude/skills/` and `.claude/skills/` as `plugin_skill_roots`
  (Phase 2b). Default loader doesn't include them.

## Decisions made

The user has explicitly committed to the following — do not relitigate
without new evidence:

- **Drop Claude Code as a maintained surface.** Reach for codex via
  codexu or via the migrated plugins instead. Phase 5 makes this
  permanent. (User: *"my goal is to ditch claude code and use only
  codex."*)
- **Codex installed = the patched fork.** No engine selection, no
  per-tool config knobs. Plugins assume codex behaves the way the fork
  ships. (User: *"my installed codex is the fork, so no need for
  special attention to it in the plugin."*)
- **Do not fork or maintain omx.** Take inspiration only from skill
  prose. Existing `oh-my-codex/` checkout is for reference; do not
  commit to it.
- **No project-memory or session-notepad MCP.** Knowledge lives as
  markdown in repos. Ralph's per-job notepad pattern (under
  `.ralph/jobs/<name>/`) is the closest thing and is sufficient.
  (User: *"I prefer to keep the project memory in the repo as md doc
  files etc."*)
- **Cross-vendor agent fan-out via shell scripts.** Do not port
  just-every/code's `agent_tool.rs` (~2000 LOC fork debt). Ralph's
  existing `claude-exec.sh` / `copilot-exec.sh` pattern is sufficient.
  Upgrade path stays open. (User: *"we can take an approach like my
  ralph-orchestration where we have a skill/script to spawn a codex
  cli etc."*)
- **Codex-based workers reuse the running app-server.** Native
  `[agents.<role>]` spawn already does this — sub-thread on the same
  app-server, NOT a new codex process. Replace ralph's `codex-exec.sh`
  invocation pattern with native role spawn (Phase 3d). Side benefit:
  spawned codex workers become visible in codexu and resumable as
  long-lived teammates if desired. (User: *"I want spawned agents, at
  least when they are codex based, to be using the daemon/app-server
  we will have so we can also have the option to integrate them with
  codexu or make them long lived teammates if we want."*)
- **AskUserQuestion is integrated into core, not MCP.** Want first-class
  TUI affordance and unified app-server fan-out (so phone via codexu
  renders properly). Borrow Claude's TS schema verbatim. **Implementation:
  see Phase 2d** — sibling tool `ask_user_question` reusing
  `request_user_input` infrastructure with broader gating + Claude-style
  schema additions.
  (User: *"I think I prefer integrated so we can also have a similar
  tui for it as claude code later."*)
- **options-mode plugin migrates alongside ralph.** Likely collapses
  to "skills + AskUserQuestion calls" once Phase 2d ships. Tag-based
  Stop-hook gating becomes redundant. (User: *"in addition to ralph-
  orchestration plugin I want to also include options-mode plugin."*)
- **Personal content as a codex plugin** (not dotfiles + bootstrap
  script). Plugin distribution gives install / upgrade / disable for
  free.
- **Plugin manifest is `.codex-plugin/plugin.json`, NOT `plugin.toml`.**
  Verified during 3-way review. JSON schema with fields `skills`,
  `mcpServers`, `apps`, `hooks`, `interface`.
- **Plugin scoping (host vs agent context) is required new feature.**
  Without it, ralph plugin's skills load inside spawned worker agents
  and create recursion / context bloat.

## Decisions still open

Two shapes intermixed below: **decision matrices** (multiple named
options + default-if-no-decision) at #1, #2, #4, #5, #7; and **open
questions** (drill-in items requiring research) at #3, #6, #8, #9.

1. **Codex fork strategy.** When: Phase 1a. Owner: user.

   | Option | Action | Trade-off | Default-if-no-decision |
   |---|---|---|---|
   | (a) Stay on `gim-home/codex` | Accumulate patches under `evyatar-rs/` (fork-divergence dir) | Familiar; small ongoing rebase cost | **this happens** |
   | (b) PR upstream `openai/codex` | Push plugin scoping + AskUserQuestion + Claude adapter as PRs | Maintainer interest unknown; long lead time | n/a |
   | (c) Switch tracking to `just-every/code` | Inherit Auto Drive + agent_tool.rs + browser; track their pace | Accept their feature opinions; lose direct upstream | n/a |

   **Recommendation:** (a) + opportunistic (b) for pieces upstream is
   likely to want.

2. **Personal plugin distribution.** When: Phase 1c. Owner: user.

   | Option | Action | Trade-off | Default-if-no-decision |
   |---|---|---|---|
   | (a) Public GitHub marketplace | Push to `gim-home` org, register marketplace | Discoverable; commits to a name | n/a |
   | (b) Private GitHub marketplace | Push to private org or repo, marketplace add via path | Auth still required for clone | n/a |
   | (c) Local marketplace-add | `codex plugin marketplace add <local-marketplace-root>` (the local root must contain `marketplace.json` listing the plugin) | Zero remote distribution; per-machine | **this happens** |

   **Recommendation:** start (c); promote to (b) once content stabilizes.

3. **Plugin scoping spec details** — manifest field shape, default value
   ("both"?), how host/agent context propagates to skill / MCP / hook /
   app loaders, plugin-load cache identity (must include scope in cache
   key OR materialize separate filtered views). When: Phase 2c
   (drill-in question, not a decision matrix).

4. **Ralph review consensus model post-migration.** When: during Phase 3.
   Owner: user.

   | Option | Action | Trade-off | Default-if-no-decision |
   |---|---|---|---|
   | (a) Keep cross-vendor 3-way via shell scripts | claude-exec.sh + codex-via-role + copilot-exec.sh | Multi-auth; multi-billing; cross-vendor blind-spot diversity | **this happens** (status quo) |
   | (b) Codex-only multi-effort | All reviewers spawned as `[agents.<role>]` with same vendor, different model/effort tier | One auth, one billing; less diversity in blind-spots | n/a |
   | (c) After Phase 7: Claude-via-Copilot + Codex-via-Copilot | All routed through one provider, multiple model families | One auth, one billing, retain cross-family diversity | n/a (depends on Phase 7) |

   **Recommendation:** (a) until Phase 7 resolves; then (c) if Phase 7
   lands.

5. **Plugin scoping upstream-PR vs fork-patch.** When: at start of
   Phase 2c. Owner: user.

   | Option | Action | Trade-off | Default-if-no-decision |
   |---|---|---|---|
   | (a) File upstream issue + PR | Gauge maintainer interest first | Long lead; may get rejected | n/a |
   | (b) Fork-patch only | Land in `evyatar-rs/`, never upstream | Permanent divergence | **this happens** |
   | (c) Fork-patch first, upstream-PR later | Ship our patch; submit upstream once stable | Two-step; merge conflicts on upstream changes | n/a |

   **Recommendation:** (c) — ship in fork to unblock Phase 3, then PR.
6. **App-server idle-timeout default** — when the last client disconnects,
   how long before app-server exits? codexu's seamless-multi-device plan
   defers this to its Phase 2; the tunnels plan adds another wrinkle
   (heartbeat lifecycle for the directory entry). Surface both here so
   it isn't forgotten.
7. **Disposition of the omx `findProjectRoot` fix.** When: any time;
   sooner is better. Owner: user. During the brainstorm that produced
   this roadmap, a real bug was found and fixed in
   `C:/harness-efforts/oh-my-codex/src/mcp/code-intel-server.ts` (the
   workspace-symbols search was walking up to drive root and scanning
   the entire system drive when no project marker was found). Working
   tree change is uncommitted.

   | Option | Action | Trade-off | Default-if-no-decision |
   |---|---|---|---|
   | (a) Upstream PR | Push fix to `Yeachan-Heo/oh-my-codex` as a one-shot drive-by | ~1 hr; benefits omx upstream users | n/a |
   | (b) Revert and abandon | `git checkout -- src/mcp/code-intel-server.ts src/mcp/__tests__/code-intel-server.test.ts` in oh-my-codex worktree | ~1 min; loses the fix | n/a |
   | (c) Leave as scratch | Do nothing; uncommitted change persists | 0 cost; risk of accidental loss via `git clean` | **this happens** |

   Default-if-no-decision: option (c). Working tree stays dirty and a
   future `git clean -fdx` or accidental checkout could destroy the fix.
   Mention in fresh-machine bootstrap appendix as a "stash before clean
   clone" footnote until resolved.

8. **Claude state migration through Phase 5.** Existing `.ralph/jobs/`
   state directories from the Claude-Code era — does codex-driven ralph
   read them transparently, or do they need a migration pass? Add to
   Phase 4 verification (4i): smoke-test that pre-Phase-3 ralph job
   state survives codex-driven ralph reads.

9. **Copilot Terms of Service for Claude prompts (Phase 7 blocker).**
   Phase 7 routes Anthropic prompts through GitHub's Copilot proxy.

   **Owner:** the user (evmitran). Read both Copilot's ToS and
   Anthropic's customer-facing terms. If unclear, get explicit answer
   from a legal-review channel (Microsoft Copilot legal contact OR
   Anthropic's enterprise team) before committing. **No Phase 7 work
   starts until #9 is resolved with a documented answer.**

   Specific questions to answer:
   - Does Copilot retain prompts/responses for those Claude calls?
   - Does proxying violate Anthropic's customer-facing terms (which the
     user accepted when signing up for direct Anthropic access)?
   - Does it violate Copilot's terms (which assume the prompts are for
     the user's own coding tasks, not third-party model evaluation)?
   - Is there a data-residency obligation that breaks if prompts move
     between Anthropic-hosted-via-Copilot vs Anthropic-hosted-direct?

   **Default-if-unresolved:** Phase 7 stays deferred indefinitely;
   cross-vendor consensus stays on `claude-exec.sh`.

## Out of scope

These are NOT goals; do not propose them as additions:

- **Multi-user collaboration** — different humans on the same session.
  This stack is "one user, multiple personal devices." If multi-user
  becomes a real requirement, the security model (loopback-only,
  per-spawn ws auth, and relay-mediated cross-device access) must be
  re-derived.
- **Cross-machine codex backends.** One app-server per cwd, on one
  machine. Phone reaches it via codexu's encrypted relay; another laptop
  doesn't connect directly. Out-of-scope unless the relay model is
  re-thought.
- **Browser integration.** just-every/code's `code-rs/browser` crate
  + Code Bridge are tempting but not adopted. If you want browser tools,
  use an existing MCP server (e.g., toolkit's `edge-browser` plugin)
  rather than vendoring just-every's browser crate.
- **Auto Drive-style autonomous loops in codex itself.** just-every/code
  has Auto Drive; we're using ralph as the autonomous-loop driver. Don't
  port Auto Drive — it would compete with ralph.
- **Project-memory MCP / session-notepad MCP.** Explicitly rejected.
  Project knowledge lives as markdown in repos. Ralph's per-job
  `.ralph/jobs/<name>/notepad.md` covers the in-flight need.
- **Tool registry centralization across codex + codexu + ralph.** Each
  layer keeps its own tool model. codexu's permission handler bridges to
  codex's approvals; ralph's `[agents.<role>]` invocations bridge to
  codex's spawn tool. No grand unified tool surface.
- **Vendor adapters beyond Phase 7's Claude-via-Copilot.** Don't
  generalize to "any vendor via any provider." Phase 7 specifically
  exists because Copilot already proxies Claude; adding Gemini-via-
  Copilot or Qwen-via-OpenRouter or similar is a separate decision.
- **Replacing `codex-exec.sh` for non-codex shell-out paths.** Cross-
  vendor workers (claude-cli, copilot-cli, gemini-cli) stay as shell
  invocations. The shell-script pattern is good enough for the use
  cases we have.
- **Migrating other Claude Code plugins** beyond ralph + options-mode.
  Toolkit has many plugins (ado, dotnet, edge-browser, teams,
  sharepoint-docs, etc.) — explicitly OFF the table for now per user
  direction. They stay as Claude Code plugins or accept being unused
  post-Phase-5.

## Phases

### Phase 1 — Foundations (parallel)

#### 1a. Codex fork strategy commit

Decide between options under "Decisions still open #1" and document.
Cross-reference: codexu's
`docs/plans/codex-fork-extension-strategy.md` covers the *consumer*
side of fork strategy — what codexu assumes about the codex fork's
release cadence + protocol contract. Read it before committing to a
strategy here so we don't pick something codexu can't track against.

**Files to update:**
- `C:/harness-efforts/codex/docs/implementation/architecture.md` — add a
  "Fork strategy" section.
- `C:/harness-efforts/codex/docs/implementation/patch-surface.md` — note
  upcoming patches: plugin scoping, AskUserQuestion primitive, Claude-
  via-Copilot adapter.
- `C:/harness-efforts/codex/CLAUDE.md` — top-level pointer to this
  roadmap.
- `C:/harness-efforts/codexu/docs/plans/codex-fork-extension-strategy.md`
  — read-only reference; no edits expected, but if our chosen strategy
  invalidates an assumption there, surface to codexu maintainer.


#### 1b. Codexu: continue stdio→ws transport plan

Not new work. Execute codexu's existing
`docs/plans/codex-seamless-multi-device.md` plan. Phase 0 verified
2026-05-02; sub-tasks 1-5 to ship.

**🔑 Read alongside `github-auth-via-vscode-tunnels.md`** (also in
codexu's `docs/plans/`). That doc replaces the encrypted-relay
assumption underpinning seamless-multi-device. Sub-tasks 1-2
(transport refactor + discovery file) port unchanged. Sub-task 3+
(relay-dependent flows: pairing, E2E messages, mobile reconnect) need
re-reading against the tunnels plan before implementation; the relay
becomes a Microsoft devtunnel + GitHub-OAuth identity instead of
codexu-server-relayed E2E.

**Files to track (read-only here):**
- `C:/harness-efforts/codexu/docs/plans/codex-seamless-multi-device.md`
- `C:/harness-efforts/codexu/docs/plans/github-auth-via-vscode-tunnels.md`
- `C:/harness-efforts/codexu/packages/happy-cli/src/codex/codexAppServerClient.ts`
- `C:/harness-efforts/codexu/packages/happy-cli/src/codex/runCodex.ts`

Independent of codex/plugin work; runs in parallel.

##### Phase 1b kickoff context for fresh agents (2026-05-03)

Digest of the two plans (committed via plan agent's read+classify pass)
plus current state of the actual code:

**Sub-task list (`codex-seamless-multi-device.md` Phase 1):**
1. Transport refactor — stdio → loopback WebSocket in
   `codexAppServerClient.ts` (~1215 LOC) + test adaptation
   (`codexAppServerClient.test.ts` ~1100 LOC). 1-2 days.
2. Discovery + reattach — write
   `${configuration.happyHomeDir}/codex-active-${cwdHash}.json`,
   reuse running app-server. 1 day.
3. Discoverability — terminal-startup multi-device hint. 0.5 day.
   **Blocked on tunnels.**
4. Conflict-resolution UX — multi-client approval fan-out. 0.5-1 day.
   **Blocked on tunnels.**
5. Walkthrough verification — manual end-to-end. 1 day. **Blocked on
   tunnels.**

**Classification (verified 2026-05-03):**
- Sub-tasks 1, 2 → **PORTS UNCHANGED.** Pure local plumbing, loopback-
  only, no relay/E2E/pairing dependence.
- Sub-tasks 3, 4, 5 → **NEEDS TUNNELS-AWARE RE-DERIVATION.** Block on
  the tunnels Phase 0 spike (`docs/spikes/devtunnel-auth-result.md` —
  does not exist yet) AND on the tunnels companion's pre-implementation
  decisions (OAuth app vs GitHub app, token contract, access path
  (a)/(b), local WS port policy).

**Current starting point:** sub-task 2 is complete. The hard pause-point
now sits between sub-task 2 and sub-task 3. Run the tunnels Phase 0 spike
and resolve the four pre-implementation decisions before continuing.

**Risk hotspots — read these before starting:**
- **Line numbers in `codex-seamless-multi-device.md` are stale** after
  the upstream merge (commit `25fe2cf3`, 2026-05-03) and after Phase 1c
  + 2a + 2b work. Use `grep` to locate spawn sites, request handlers,
  etc. (e.g., `grep -n 'crossSpawn\|app-server\|--listen\|stdin.write'
  packages/happy-cli/src/codex/codexAppServerClient.ts` confirms the
  spawn at line 432 is still accurate, but other line refs may have
  drifted).
- **Path drift fixed 2026-05-03:** the original plan and tunnels
  companion both cited `D:/harness-efforts/happy/...`. Both files have
  been search-replaced to `C:/harness-efforts/codexu/...`.
- **`Credentials` shape will change.** Sub-task 3 references "check via
  the existing pairing/auth state in `Credentials`". Tunnels plan §
  "happy-server"/Phase 2 rewrites `~/.happy/credentials.json` to hold
  `{ githubAccessToken, login, machineId, tunnelId }`. Sub-task 3
  cannot use today's `Credentials` shape; it must read whichever post-
  tunnels shape exists at implementation time. Possible cross-phase
  ordering hazard.
- **Walkthrough Step 5 fan-out semantics shift layer.** Plan assumes
  codex `app-server` fans out RPC events to attached clients including
  the relay-forwarded phone path. Under tunnels, phone attaches
  directly to CLI's local Socket.IO server (not relay). Whether codex
  app-server's native fan-out covers this or whether CLI's lifted
  `rpcHandler` must broadcast — re-derive when sub-task 4 starts.

**Recommended ralph workflow for sub-task 1:**

The transport refactor is design-y at the interface boundary
(stdio↔ws abstraction) but mechanical at the test-adaptation boundary
(~1100 LOC of mock plumbing rewrites). Recommend:

```
/plan-with-ralph "Phase 1b sub-task 1 — codex app-server transport refactor stdio → loopback WebSocket per codexu/docs/plans/codex-seamless-multi-device.md sub-task 1, with --codex-transport=stdio|ws fallback flag (default ws), preserving processEpoch lifecycle + force-restart semantics from current codexAppServerClient.ts. Use OpenClawSocket.ts as the in-fork ws-client precedent. Adapt codexAppServerClient.test.ts mocks accordingly."
```

Once plan looks good:

```
/implement-with-ralph
```

Sub-task 2 (discovery file) is small enough for direct interactive
implementation OR `/implement-with-ralph` with a 1-paragraph PRD.

#### 1c. Personal codex plugin scaffolding

**Objective:** create the plugin holding private skills + (later)
`scope = "host"` and AskUserQuestion-using skills.

**Manifest format (verified 2026-05-02 against
`core-plugins/src/manifest.rs:12-33`):**

```rust
struct RawPluginManifest {
    name: String,
    version: Option<String>,
    description: Option<String>,
    skills: Option<String>,        // path, must start with "./"
    mcp_servers: Option<String>,   // serde "mcpServers"
    apps: Option<String>,          // path, can bundle assets
    hooks: Option<RawPluginManifestHooks>,
    interface: Option<RawPluginManifestInterface>,
}
```

`RawPluginManifestInterface` has: `displayName`, `shortDescription`,
`longDescription`, `developerName`, `category`, `capabilities[]`,
`websiteURL`, `privacyPolicyURL`, `termsOfServiceURL`, `defaultPrompt`
(string or array, max 3 entries × 128 chars each), `brandColor`,
`composerIcon`, `logo`, `screenshots[]`.

Path validation (`manifest.rs:392-433`): paths must start with `./`;
`..` and absolute paths are rejected. Manifest discovery looks at
`.codex-plugin/plugin.json` first, falls back to `.claude-plugin/plugin.json`
(discovery preference order in `utils/plugins/src/plugin_namespace.rs:8-9`:
`DISCOVERABLE_PLUGIN_MANIFEST_PATHS = &[".codex-plugin/plugin.json", ".claude-plugin/plugin.json"]`
with first-match semantics in `find_plugin_manifest_path`).

**NOT supported in the manifest:**
- No `agent_roles` field — agent role TOMLs go in `~/.codex/config.toml`.
- No direct `AGENTS.md` field. AGENTS.md merging happens at the
  file-discovery layer (global / repo-root / cwd traversal, capped at
  32 KiB), not via the plugin manifest. Plugins can ship an `AGENTS.md`
  at the plugin root, but it gets picked up only if the plugin's
  install location is inside a project tree where AGENTS.md merging
  walks. For per-user defaults, write to `~/.codex/AGENTS.md` directly.

**Initial layout:**
```
<repo>/
  .codex-plugin/
    plugin.json          # codex plugin manifest (JSON, NOT TOML)
  skills/                # SKILL.md files (referenced via "skills": "./skills")
  apps/                  # asset bundle (prompts, schemas, helper scripts)
  README.md
```

**Steps:**
1. Pick a name. Suggested: `codex-personal-plugin` or `evyatar-codex`.
2. Create the repo (private GitHub or local).
3. Author `.codex-plugin/plugin.json` referencing `./skills` for
   `skills` field, optionally `./apps` for `apps`.
4. Author one starter `skills/hello-world/SKILL.md` for smoke testing.
5. Author per-user `~/.codex/AGENTS.md` separately — NOT inside the
   plugin (see manifest caveat above).
6. **Install via `codex plugin marketplace add <local-marketplace-root>`.**
   Codex has NO `codex plugin install <path>` command (verified
   2026-05-02 against `codex plugin --help`). The only install path is
   marketplace-add; `<local-marketplace-root>` must be a directory
   containing `marketplace.json` that lists the plugin. For a single
   personal plugin, create a tiny marketplace stub OR drop the plugin
   straight under `~/.codex/plugins/<name>/.codex-plugin/plugin.json`
   and rely on direct discovery.
7. Verify: skill appears in `/skills` picker; the per-user AGENTS.md
   merges into thread context.

**Critical silent-skip behaviors to know about** (verified
`core-plugins/src/manifest.rs:248-433`):
- **Malformed `plugin.json`** → parse failure logs `tracing::warn!`
  and returns `None`. Plugin silently absent. No user-facing error.
- **`skills`/`apps`/`mcp_servers` path missing `./` prefix** → silent
  skip with `tracing::warn!`. Plugin loads but the field is dropped;
  picker shows nothing, no error explaining why.
- **Unknown manifest fields** → silently ignored. No
  `#[serde(deny_unknown_fields)]` on `RawPluginManifest`. Typos like
  `skill` (singular) or `mcpServer` are silently dropped.
- **Smoke-test discipline:** when verifying step 7, check
  `~/.codex/log/` for `tracing::warn!` lines. If skills don't appear,
  this is the only signal. Do not trust silent success.

**Install location:** plugins land under `~/.codex/plugins/...` —
**per-user globally**, not per-repo. Per-repo discovery exists via
`.agents/plugins/marketplace.json` for marketplace catalogs, but
installs themselves are user-scoped.

### Phase 2 — Codex divergences

Phase 2a-b are small; 2c-d are real new features that land additive
fork code on top of upstream codex.

#### Phase 2 prerequisite (REQUIRED before any brainstorm or plan) — minimize upstream-canonical conflict surface

Every Phase 2 brainstorm + planning round MUST treat conflict surface
against `external/repos/codex-patched/codex-rs/` (upstream-canonical
territory, pulled via `git subtree pull` on every rebase) as a
first-class design constraint, not an afterthought. The rust-v0.128 →
rust-v0.129 trial rebase surfaced 297 conflicts across 1151 files
before the W-1..W-3 mitigations landed; v0.129→v0.130 was 18 after W-1
and 3 after W-2+W-3. Every new line we author inside the subtree
recurs as conflict cost on every future upstream pull, *forever*.

**Hard rules for Phase 2 planning agents:**

1. **Default new code to `codex-rs-overlay/`, not `external/repos/codex-patched/codex-rs/`.** The
   `codex-rs-overlay/` directory is the fork-exclusive crate area
   (sibling to the subtree). Crates there are NEVER conflict surface.
   Authoritative pattern: `codex-rs-overlay/codex-copilot-launcher/`
   and `codex-rs-overlay/codex-invariant-tests/` (W-3 + D-001
   deliverables from the codex submodule's
   `docs/plans/reduce-conflict-surface.md`). Plans MUST prefer new
   crates / new modules in `codex-rs-overlay/` whenever the design
   admits it — even if it costs a thin trait extension or wrapper in
   the subtree.

2. **Budget upstream-canonical-file edits explicitly.** Every plan must
   include an "Upstream-canonical edit budget" table listing each
   touched file inside `external/repos/codex-patched/codex-rs/` with
   columns for *why this can't go in overlay*, *expected re-conflict
   probability per rebase* (Low/Medium/High based on upstream churn
   rate from `regression-history.md`), and *fallback if upstream
   refactors this seam away* (re-port plan, not "we'll figure it out").
   A plan with > 10 upstream-canonical files needs explicit reviewer
   sign-off, not silent acceptance.

3. **Prefer additive symbol surfaces over inline edits.** When the
   subtree must be touched, add new symbols (new function, new struct,
   new trait impl block) over editing existing ones. New symbols
   collide with upstream only if upstream picks the same name; inline
   edits collide on every nearby change. When extending existing
   structs, add fields with `#[serde(default)]` so upstream-canonical
   construction sites still compile after a rebase even if our
   initializer site silently drops the field (the silent-drop hazard
   from `regression-history.md` v0.129+v0.130 rebase narratives).

4. **Every new patch site MUST be registered.** New SANDBOX-PATCH
   markers, audit-script entries (`scripts/audit_network_calls.sh`'s
   `KNOWN_PATCH_FILES`), and invariant-check entries
   (`scripts/audit_invariants.sh`, the 19-invariant inventory in
   `docs/implementation/patch-surface.md` §14) MUST land in the same
   PR as the patch. A patch the audit script doesn't know about gets
   silently dropped by a future merge driver (this happened repeatedly
   in v0.129; see `regression-history.md` "Silent-drop patches
   recovered" table). The invariant test must run in
   `.github/workflows/invariant-check.yml`.

5. **Document the rebase-replant recipe for every patch.** Every
   upstream-canonical edit must add a row to
   `codex/docs/implementation/patch-surface.md` §14 (invariant
   inventory) and §15 (rebase-replant recipes) with a code-pointer
   exact enough that a rebase agent can find the patch without
   reading the original PR (`file:line` + the exact 1-2-line marker
   block, not "see the change near function X").

6. **Upstream-PR what we can.** If a patch is a pure improvement
   upstream might accept (security hardening, accessibility, generic
   bug fixes), file an upstream PR in parallel — even if it takes
   months to merge, every upstream-accepted change is one fewer
   permanent fork patch. The Phase 2 brainstorm output must list each
   proposed patch's "upstream-PR-able? y/n + reasoning" alongside the
   technical design.

**Cross-references (read before brainstorm):**
- `codex/docs/plans/reduce-conflict-surface.md` — the W-1..W-6
  workstream that landed the merge-driver + overlay-relocation +
  invariant-check CI in the codex submodule. Section "Approach"
  explains why each conflict bucket needs a different mitigation.
- `codex/docs/implementation/patch-surface.md` §14 (the 19-invariant
  inventory + which test enforces each) and §15 (rebase-replant
  recipe template).
- `codex/docs/implementation/regression-history.md` — the
  "Silent-drop patches" tables from v0.128.0 / v0.129.0 / v0.130.0
  rebase entries. New Phase 2 patches WILL hit the same silent-drop
  trap if they're not registered in the audit script. Read these
  before designing the registration surface for your patch.
- `codex/.claude/commands/rebase-upstream.md` — what a rebase agent
  actually does when reconciling. Your patch must survive this
  workflow without manual rescue every time.

#### 2a. Verify upstream features end-to-end

Run smoke tests:
- Define `[agents.researcher]` with `config_file = "./agents/researcher.toml"`
  in `~/.codex/config.toml`; spawn it from a parent thread; confirm
  sub-thread runs with the right `developer_instructions`.
- Drop a SKILL.md under `~/.agents/skills/test-skill/` and a separate one
  via Phase 1c plugin's `plugin_skill_roots`. Confirm both appear in
  `/skills` picker.
- Run a sandbox-restricted command via execpolicy; confirm denial fires.

Document anything that doesn't match expectations in
`docs/implementation/regression-history.md`.

**Note:** ghost snapshots are documented as removed; do NOT smoke-test
them. If we want ghost commits later, plan a separate port from
`code-rs/git-tooling`.

#### 2b. `.claude/skills/` discovery support (depends on 1c)

**Approach: personal plugin's `plugin_skill_roots` includes
`~/.claude/skills` and per-cwd `.claude/skills`.** Zero core change.

Caveat: Claude Code skills with elaborate frontmatter beyond
`name`/`description` may have ignored fields in codex. Verify behavior
during smoke test. SKILL.md body Markdown carries over unchanged.

Fallback: symlinks if plugin-registered roots have unexpected scoping.

Mechanical change; trivial once Phase 1c plugin exists.

#### 2c. Plugin scoping (host vs agent context)

**Why:** ralph-orchestration plugin must NOT load inside its own spawned
worker agents (recursion + context bloat). Personal plugin's preferences
similar.

**Spec sketch:**

Manifest field:
```json
{
  "name": "ralph-orchestration",
  "scope": "host",         // "host" | "agent" | "both" — default "both"
  ...
}
```

Loader behavior:
- Each thread's spawn depth derived from
  `agent::registry::next_thread_spawn_depth`. Depth 0 = host context;
  depth > 0 = agent context.
- Plugin loader filters by scope when materializing skills, MCP servers,
  hooks, apps for a given thread.
- **Cache identity** — current plugin loader has a **single
  `Option<CachedPluginLoadOutcome>` slot** (NOT a map) keyed by
  `(config_version, plugin_hooks_enabled)` at
  `core/src/plugins/manager.rs:374, 447, 469-473, 529-551`. Two
  concrete options:
  - **(i) Slot → small map**: cache becomes `HashMap<(config_version,
    hooks, scope), outcome>`. Extra disk loads but per-scope
    correctness. Each host↔agent flip would otherwise thrash the
    single slot.
  - **(ii) Filtered views**: keep one unscoped full outcome cached;
    add `PluginLoadOutcome::filtered_for_scope(scope)`. No duplicate
    disk loads but `LoadedPlugin` and `PluginCapabilitySummary` need
    to recompute correctly post-filter.

  Recommendation: **(ii) filtered views** is correctness-cleaner.
- Bridge: spawn depth lives in `SessionSource`/agent registry; plugin
  load happens before skills consume effective roots
  (`core-plugins/src/loader.rs:569`). The actual spawn-time plugin/hook
  lookup is in **`core/src/session/mod.rs:478, 2666, 3373`**
  (`plugins_for_config(&config)` is called WITHOUT session source).
  Threading scope through requires touching session construction +
  `build_hooks_for_config`, NOT `agent/registry.rs` directly.

**Conflict-surface requirement for Phase 2c brainstorm + plan.** The
file list below currently touches **9 upstream-canonical files**
across `core-plugins/`, `core/`, `plugin/`, `core-skills/`. This is the
HIGHEST upstream-edit count of any planned Phase 2 work and the
roadmap flags 2c as "highest-risk" partly for this reason. Per the
Phase 2 prerequisite above (REQUIRED), the brainstorm MUST evaluate at
least these alternatives before settling on the inline-edit list:

- **(A) Overlay-first scope filter.** A new `codex-rs-overlay/codex-scope-loader/`
  crate that wraps `core-plugins::PluginLoader` and applies scope
  filtering at the boundary. Upstream-canonical files would only need
  to (i) make `PluginLoader::load` return something the overlay crate
  can post-process, and (ii) accept the wrapping at session
  construction. If the upstream API already exposes enough surface,
  zero subtree edits.
- **(B) Manifest-only patch + runtime scope gate via session callback.**
  Add `scope` field to `core-plugins/src/manifest.rs` (one file) and
  do all filtering in a session-side callback that lives in
  `codex-rs-overlay/`. Trades cache-correctness work in `manager.rs`
  for a callback contract; the cache stays unscoped.
- **(C) Upstream PR for the `scope` field + manifestVersion.**
  Plugin-scoping is a generic concern (any spawned-agent system has
  it). Worth an RFC issue against upstream `openai/codex` BEFORE
  committing to fork-only landing. If accepted, the schema patch
  evaporates on the next subtree pull.
- **(D) Current inline approach** — only chosen if A/B/C are rejected
  with explicit "why these don't work" reasoning in the plan output.

The plan MUST include the "Upstream-canonical edit budget" table from
the Phase 2 prerequisite for the chosen approach, with re-conflict
probability per file derived from `regression-history.md` (files
already named in silent-drop tables get **High**; files in the W-1
merge-driver allowlist get **Low**; everything else **Medium**). The
manifestVersion piggyback bullet stays valid in any approach since
it's a one-file edit either way.

**Files to modify (if approach D is chosen)** (in
`external/repos/codex-patched/codex-rs/`):
- `core-plugins/src/manifest.rs` — add `scope` field AND
  `manifestVersion` field (the latter for the upgrade-paths concern in
  Cross-cutting; piggybacks on this same patch since it touches the
  manifest schema anyway)
- `core-plugins/src/loader.rs` — accept scope hint; filter outputs
- `core/src/plugins/manager.rs` — extend cache (slot→map OR
  filtered-views); thread scope through call sites
- `plugin/src/load_outcome.rs` — if filtered-views chosen, add
  `filtered_for_scope` + ensure `PluginCapabilitySummary` recomputes
  correctly
- `core-skills/src/loader.rs` — filter `plugin_skill_roots` by scope
- `core/src/session/mod.rs` — thread scope hint through session
  construction (lines 478, 2666, 3373 + `build_hooks_for_config` at
  3362-3389). NOT `agent/registry.rs` — that has no plugin call sites
  today.
- `core/src/mcp_tool_call.rs` — MCP plugin server scope filtering
  (lines 765, 1813)
- `core/src/config/mod.rs` — `Config::to_mcp_config` calls
  `plugins_for_config(self)` and merges plugin MCPs (lines 1002-1019);
  needs scope context
- `core/src/hook_runtime.rs` + `effective_plugin_hook_sources()`
  consumer at `session/mod.rs:3362` — filter plugin-supplied hooks by
  scope
- Tests across the above

**Open sub-question:** PR-able upstream, or our patch? File an issue
first; gauge maintainer interest. Code in our fork either way.
Codex reviewer gauges upstream interest as "uncertain to weak without
an RFC" — host-vs-spawned-agent semantics are fork-specific.

**Highest-risk phase** because cache identity correctness is subtle
and threading scope through every `plugins_for_config` call site is
broad (sessions, turn context, MCP, handlers, skills watcher, tools).

#### 2d. `ask_user_question` sibling tool — clone/adapt `request_user_input` pattern

**Why:** options-mode workflow + general clarification needs a typed
structured-choice tool with proper TUI affordance + cross-surface
fan-out (codex TUI, codexu ink, phone). MCP elicitation works but
doesn't get rich UI.

**Naming convention.** `ask_user_question` (lowercase snake-case) is
the function tool name in codex; `AskUserQuestion` (PascalCase) is the
concept name inherited from Claude Code. The two refer to the same
thing.

**Critical context — codex already has `request_user_input` BUT it's
plan-mode-scoped:**

`core/src/tools/handlers/request_user_input.rs` is the existing tool.
Two intentional restrictions:
- **Root-thread-only.** Line 43-47: `if turn.session_source.is_non_root_agent() { return Err("can only be used by the root thread") }`. Spawned agents cannot call it.
- **Collaboration-mode-gated.** Line 49-52 + `request_user_input_unavailable_message` test (`request_user_input_tool_tests.rs:107-130`): `Plan` mode = available; `Default` = "unavailable in Default mode" unless `default_mode_enabled_available_modes` feature flag set; `Execute`/`PairProgramming` = always unavailable.

The existing schema (`protocol/src/request_user_input.rs:8-55`) **does**
have `id`, `header` (required), answer arrays, `is_other`, `is_secret`,
optional `options[]`, AND `RequestUserInputArgs.questions: Vec<...>`
(multi-question batching, up to 3 per tool description). It **does NOT**
have `preview`, 2-4 options bound, or Claude-style "Other" auto-add
semantics.

**Why NOT just extend `request_user_input`:** doing so muddies its
plan-mode-interview UX expectations. Plan-mode users would suddenly see
behavior changes; tests around mode gating would either weaken or
duplicate. The existing tool has a clear, deliberate scope; preserve it.

This is the *implementation manifestation* of the user's decision in
**Decisions made**: "*AskUserQuestion is integrated into core, not MCP.
Want first-class TUI affordance and unified app-server fan-out (so phone
via codexu renders properly).*" Building a sibling tool with broader
gating + Claude-style schema is how that decision lands without
disturbing plan-mode `request_user_input`.

**Strategy: build sibling tool `ask_user_question`, clone/adapt the
`request_user_input` pattern.**

The codex review flagged that "reuse" overstates: the existing tool's
infrastructure is a *pattern* not drop-in code. Each layer needs a
parallel implementation:
- New protocol structs (sibling to `RequestUserInputEvent`,
  `RequestUserInputAnswer`, `RequestUserInputResponse`)
- New `EventMsg::RequestUserInput`-style event variant
- New `Session::request_user_input`-style oneshot bridge
- New `ServerRequestPayload::ToolRequestUserInput` variant in
  `app-server-protocol`
- New `ServerRequest::ToolRequestUserInput` TUI cases across
  `app_server_requests.rs`, `pending_interactive_replay.rs`,
  `replay_filter.rs`, `side.rs`
- New overlay/card in `tui/src/bottom_pane/` (sibling to
  `request_user_input/{mod.rs, layout.rs, render.rs}` —
  **4011 LOC actual** across the directory: `mod.rs` 3066,
  `layout.rs` 363, `render.rs` 582. Earlier drafts cited "1300+
  lines"; that was wrong. Decide upfront whether to clone (~3500-4500
  LOC) or extract a shared base (~1000-1500 LOC; higher regression
  risk on existing tool))
- New codexu bridge (sibling to existing `requestUserInput` handler)

**What is genuinely reusable (patterns, not code):**
- The handler-registration shape — see `core/src/tools/spec.rs:168, 244`
  for how `RequestUserInputHandler` plugs in
- The blocking-oneshot pattern in `Session::request_user_input` (see
  `core/src/session/mod.rs:2145`)
- The app-server bridge shape in `bespoke_event_handling.rs`
- The TUI overlay-with-keyboard-driven-options pattern
- The codexu permission-handler-style mobile bridge

**What's new for `ask_user_question`:**
- Tool definition with broader gating (any `ModeKind`, any thread depth
  — including spawned non-root agents)
- Schema additions: `preview` field on options. **Options bound bumped
  from 2-3 (existing advisory) to 2-4 — needs description text update
  + actual validator** (existing tool only validates options array
  presence, not count: see `tools/src/request_user_input_tool.rs:116-122`).
- Claude-style "Other" auto-add — note: existing tool ALREADY has
  `is_other` field plus `tools/src/request_user_input_tool.rs:124-126`
  force-sets `is_other = true` in normalization. Can reuse this
  pattern; not a new behavior.
- Multi-question count bumped from 3 to 4 (matching Claude's API)
- TUI card variant with side-by-side preview layout
- codexu mobile UI variant

**🔴 Spawned-agent attribution is a BLOCKER, not a deferrable risk.**
The existing `Session::request_user_input` keys its blocking-oneshot
on `turn_context.sub_id`; events tag with the same. For sub-agents,
the only existing parent-chain propagation path is
`maybe_notify_parent_of_terminal_turn` at `session/mod.rs:1500-` —
**which only handles terminal events, not mid-turn interactive
requests.** Mid-turn AskUserQuestion from a sub-agent has no path up
to the parent client today. Removing the root-thread guard means
designing + implementing new event-routing for interactive requests
through the spawn chain. This is real new work, not a guard removal.
Add an integration test for the child-agent-question routing case
BEFORE scoping the rest of Phase 2d.

The "reuse cuts most of the plumbing" framing in earlier drafts was
optimistic — this is genuinely a clone-and-adapt operation, not a
schema-tweak.

**Schema (borrows Claude's structure, normalized to codex naming).**
**Critical: keys answers by stable `id`, NOT `questionText`** — Claude's
TS uses questionText keys but that's brittle for edits/localization.
codex's existing `request_user_input` already uses stable ids; do the
same here.

```
ask_user_question {
  questions: Question[1..4]      // multi-question batching in one call
  answers?: Record<questionId, answerString>
  annotations?: Record<questionId, { preview?, notes? }>
  metadata?: { source?: string }  // analytics
}

Question {
  id: string                      // stable, unique within request
  question: string                // ends with ?
  header: string                  // 12-char chip label, e.g. "Auth method"
  options: Option[2..4]           // 2-4 choices (NOT 0-N)
  multi_select: boolean           // default false
}

Option {
  id: string                      // stable, unique within question
  label: string                   // 1-5 words
  description: string             // explains trade-offs
  preview?: string                // markdown/HTML for visual comparison
}

Result {
  answers: Record<questionId, answerString>     // multi-select = comma-joined option ids
  annotations?: Record<questionId, { preview?, notes? }>
}
```

**Behaviors to mirror from Claude's TS implementation
(`C:/harness-efforts/claude-code/worktrees/main/src/tools/AskUserQuestionTool/`):**
- `shouldDefer: true` — turn pauses cleanly. Critical.
- **"Other" auto-added** — every question gets a free-text escape; agent
  never has to anticipate it.
- **Side-by-side preview layout** — when any option has `preview` (and
  question is single-select), TUI switches from vertical list to
  options-on-left + preview-on-right.
- **Multi-question batching** — agent asks up to 4 questions in one
  call; user answers all; single tool result.
- **Uniqueness** — unique question texts + unique option labels per
  question. Port Zod-style `.refine()` to Rust serde validation.

**Plan-mode interlock:** `ask_user_question` runs alongside
`request_user_input`, NOT replacing it. Plan-mode interview UX stays in
`request_user_input` (its scope, its tests, its mode gating). Skill
authors use `ask_user_question` for general clarification regardless of
mode/thread depth.

**Conflict-surface requirement for Phase 2d brainstorm + plan.** Most
of the ~3500-4500 LOC for `ask_user_question` is NEW content (new
module, new schema file, new TUI card), which is naturally low
conflict surface — new files only conflict when upstream picks the
same path/name. The high-risk surface is the registration + bridging
edits inside existing upstream-canonical files:
`core/src/tools/spec.rs` (handler registration at lines 168, 244),
`app-server-protocol/src/protocol/v2.rs` (new request shape),
session/oneshot bridging for the spawned-agent attribution work, and
the TUI request-routing files (`app_server_requests.rs`,
`pending_interactive_replay.rs`, `replay_filter.rs`, `side.rs`).

Per the Phase 2 prerequisite above (REQUIRED), the brainstorm MUST
evaluate at least these alternatives for **each** existing-file edit
before accepting it into the plan:

- **(A) Move the new module + tool registration into an overlay
  crate** (`codex-rs-overlay/codex-ask-user-question/`) and expose a
  single registration call that `core/src/tools/spec.rs` invokes. If
  upstream's tool-registration surface supports `inventory!`-style
  registration or a registry-pattern entry point, the only subtree
  edit is one call site (or zero). The bulk of the 3500-4500 LOC
  lives outside the subtree.
- **(B) Reuse `request_user_input`'s existing protocol envelope and
  app-server bridge** by adding a `kind: "ask_user_question"`
  discriminator at the existing seam, instead of authoring a parallel
  `ServerRequestPayload::ToolRequestUserInput` sibling. Trades
  protocol-purity for a much smaller upstream-canonical edit
  footprint. Risk: muddies the existing tool's protocol; mitigation:
  keep the discriminator at the wire layer only and switch on it
  inside the new handler module.
- **(C) Upstream PR for the AskUserQuestion schema.** Structured
  agent-asks-user is a generic concern. Worth an RFC. Spawned-agent
  attribution (the 🔴 blocker above) is also generic; an upstream PR
  for parent-chain event routing benefits every codex consumer with
  sub-agents.
- **(D) Current parallel-implementation approach** — only if A/B/C are
  rejected with explicit reasoning in the plan.

The plan MUST include the "Upstream-canonical edit budget" table for
the chosen approach. The spawned-agent attribution work (new
event-routing through the spawn chain) MUST be designed with the same
conflict-surface lens — it's net-new code, so default it to
`codex-rs-overlay/` unless a session/turn-context API change forces a
subtree edit.

**Files to author (if approach D is chosen, scoped to the
upstream-canonical seam)** (in
`external/repos/codex-patched/codex-rs/`):
- `core/src/tools/handlers/ask_user_question/{mod.rs, schema.rs,
  prompt.rs, handler.rs}` — new function tool definition + schema
- `core/src/tools/handlers/ask_user_question/tests.rs` — schema
  validation tests, uniqueness refinement tests
- `protocol/src/ask_user_question.rs` — schema types (sibling to
  `protocol/src/request_user_input.rs`)
- `app-server-protocol/src/protocol/v2.rs` — add server-initiated
  `item/tool/askUserQuestion/request` shape mirroring
  `item/tool/requestUserInput`
- `core/src/tools/spec.rs` — register `AskUserQuestionHandler` next to
  `RequestUserInputHandler` (lines 168, 244)
- `tui/src/cards/ask_user_question.rs` — ratatui card with side-by-side
  preview layout + keyboard nav + Esc-cancels
- `tools/src/ask_user_question_tool.rs` and tests — gating policy
  (any mode, any thread depth)
- Integration test for the full flow including from-spawned-agent path

**Files in codexu packages that need updating:**
- `packages/happy-cli/src/codex/codexAppServerClient.ts` — handle the
  new server-initiated request, route through permission-handler-like
  pipeline (mirrors how it handles `requestUserInput` today)
- `packages/happy-cli/src/codex/utils/permissionHandler.ts` — add an
  `ask_user_question` handler alongside permission handlers
- `packages/happy-cli/src/codex/sessionProtocolMapper.ts` — map the new
  RPC to a `UserQuestionEnvelope` for mobile rendering
- happy-app phone app: `UserQuestionCard.tsx` mirroring
  `PermissionFooter` pattern; supports preview side-by-side, multi-
  select, multi-question

**Cost shape:** the existing `request_user_input` implementation is
~4194 LOC across protocol/handler/TUI/app-server. The sibling tool
is genuinely a clone-and-adapt operation across all 6 layers above —
not a schema tweak. Decide upfront whether to clone wholesale or
extract a shared base from the existing TUI overlay (3066 LOC of
state machine + keybindings). Spawned-agent attribution is real new
work (see blocker note above), not a guard removal.

### Phase 3 — Plugin migrations (Claude Code → codex)

Migrate ralph + options-mode from Claude Code plugin format to codex
plugin format. Phase 3a-d **do NOT depend on Phase 2c** — skills can
port and ship without scoping; only Phase 4d (scoping verification)
needs both done. Critical path: Phase 3 can start right after Phase 1.

#### 3a. Skills port

**Ralph: 4 user-invocable + 9 internal = 13 skills** (verified
2026-05-02 against `C:/ai-developer-toolkit/plugins/ralph/skills/`
SKILL.md frontmatter `user-invocable` flags):

User-invocable (`user-invocable: true`):
- `/brainstorm-with-ralph`
- `/plan-with-ralph`
- `/implement-with-ralph`
- `/review-plan-with-ralph`

Internal (`user-invocable: false`): `analyze-iteration`,
`convert-to-ralph-prd`, `create-prd`, `decompose-plan`, `edit-prd`,
`list-jobs`, `parallel-ralph`, `review-changes`, `run-ralph`.

**options-mode: NOT covered here.** It is 575 LOC of hook logic + a
slash command + statusline scripts, not skills. Migrated separately in
**Phase 3h**.

Conversion checklist per skill:
- Move `<plugin>/skills/<name>/SKILL.md` →
  `<codex-plugin-root>/skills/<name>/SKILL.md`
- Frontmatter: `name`, `description` already present; `argument-hint`
  is ignored by codex (extra fields tolerated)
- Body Markdown: review for Claude-Code-specific assumptions
  (`Task` tool with `subagent_type` references — these point to the
  Claude Code subagent system, must be rephrased to use codex's
  `agent_type` spawn parameter from `multi_agents_v2/spawn.rs`)
- Skills referencing options-mode tag-based gating: rewrite to call
  `ask_user_question` directly

**Mapping:** Claude Code `Task({subagent_type: "code-fixer"})` calls in
skill bodies become `agent.spawn({agent_type: "code-fixer"})` references
to codex agent role names defined in 3b-i.

#### 3a-tail. Codex API parity follow-ups (surfaced during skills port)

Pre-Phase-3a planning on 2026-05-13 (job
`.ralph/jobs/phase-3a-port-ralph-skills/`) confirmed that a mechanical
Claude→codex skill-body port is blocked by three concrete API/feature
gaps. The decision was **not** to warp ralph SKILL.md bodies to fit
codex's current narrow API; instead track each gap here so codex
parity becomes a real deliverable rather than a hidden body-rewrite
cost inside Phase 3a.

**3a-tail-i. `context: fork` frontmatter support.** 5 ralph skills
carry `context: fork` in frontmatter
(`analyze-iteration`, `convert-to-ralph-prd`, `create-prd`,
`decompose-plan`, `review-changes`). Claude Code interprets it as
"run this skill in a forked subprocess context"; codex has no
equivalent and silently tolerates the field (per Phase 2b loader
verification, unknown frontmatter is dropped without warning). The
ported skills will run in-process under codex. Resolve by either
(a) implementing codex support for the hint, (b) auditing each of the
5 skills for behavioral impact and stripping the field after
confirming no divergence, or (c) keeping as a no-op marker for
upstream-ralph re-sync diff-cleanness. Owner: TBD. Blocks: nothing
today (silent tolerance is acceptable); flagged for behavioral audit
before Phase 4d parity verification.

**3a-tail-ii. `agent.spawn` argument parity with Claude's `Agent()` /
`Task()`.** Per `multi_agents_v2/spawn.rs` (Phase 3d-i audit):
`SpawnAgentArgs` requires `agent_type`, `message`, `task_name`; uses
`#[serde(deny_unknown_fields)]`; rejects `fork_context`. Ralph SKILL.md
bodies pass Claude-shaped args (`subagent_type`, `prompt`,
`run_in_background`, sometimes a returned-value pattern). The 9
function-call sites the 2026-05-13 port touched receive only a syntactic
prefix swap (`Agent(subagent_type=` → `agent.spawn({agent_type:`); the
trailing args are preserved verbatim and will be rejected by codex
spawn today. To unblock end-to-end execution without a second skill
re-edit:

- Accept `prompt` as an alias for `message` (or document a one-way
  rename and update skill bodies in a follow-up commit).
- Support a `run_in_background` flag (Claude's per-call semantics:
  fire-and-forget vs await final message). Codex pattern today is
  spawn → `wait_agent`; expose as a single arg if practical.
- Auto-generate a stable `task_name` when omitted (e.g., from
  `agent_type` + a per-session counter or hash). Today every call
  site must invent a unique name; ralph skill bodies do not.
- Relax `deny_unknown_fields` for forward-compatible extras, OR
  publish the exact field allowlist so plugin authors get a clear
  error rather than silent rejection.

Owner: TBD. Blocks: full end-to-end execution of every ralph skill
that calls `Agent(...)` — affects `brainstorm-with-ralph`,
`convert-to-ralph-prd`, `implement-with-ralph`, `plan-with-ralph`
(9 call sites total). Phase 4d parity verification cannot pass without
this or a follow-up skill re-edit.

**3a-tail-iii. Result-collection contract.** Claude's
`Agent(subagent_type=..., prompt=...)` returns the agent's final
message inline to the caller. Codex spawn returns
`SpawnAgentResult { task_name, nickname }` and emits events; callers
must `wait_agent` (which itself has no per-child wait semantics —
see Phase 3d-i audit) or watch the filesystem for a written artifact.
Ralph skill bodies consume returned agent output synchronously
(reviewer findings, validator JSON, fixer diff summaries). Define a
result-collection contract that ralph skill bodies can use without
becoming polling loops. Two candidate shapes:

- **Inline return parity**: codex's app-server returns the final
  agent message on `wait_agent` completion. Closest to Claude
  semantics; needs spawn-side changes to attach the final message
  to the result.
- **Filesystem artifact convention**: standardize that ralph workers
  write their output to `<job_dir>/<task_name>.{json,txt}` and
  orchestrator skills read on `wait_agent` completion. Already
  partially used by `codex-exec.sh -o $FILE` (Phase 3d-i table); make
  it the documented contract.

Owner: TBD. Blocks: same skills as 3a-tail-ii; same parity gate.

**Scheduling note:** 3a-tail-i is independent (silent tolerance is
acceptable short-term). 3a-tail-ii and 3a-tail-iii are entangled —
fixing either alone leaves the other as a blocker for end-to-end
execution. Recommend resolving both before Phase 3b ships agent role
TOMLs, otherwise the role TOMLs themselves can't be smoke-tested via
unedited ralph skills.

#### 3b-i. Subagents → `[agents.<role>]` TOML conversion

Ralph subagents (12 total per `plugins/ralph/agents/`, verified
2026-05-02):

| Claude Code subagent | model in source | Codex agent role |
|---|---|---|
| `code-fixer` | sonnet | `[agents.code-fixer]` |
| `code-reviewer` | opus | `[agents.code-reviewer]` |
| `criteria-validator` | opus | `[agents.criteria-validator]` |
| `docs-reviewer` | opus | `[agents.docs-reviewer]` |
| `docs-updater` | opus | `[agents.docs-updater]` |
| `dsat-analyst` | opus | `[agents.dsat-analyst]` |
| `plan-reviewer` | sonnet | `[agents.plan-reviewer]` |
| `progress-analyst` | opus | `[agents.progress-analyst]` |
| `refactoring-agent` | sonnet | `[agents.refactoring-agent]` |
| `security-fixer` | opus | `[agents.security-fixer]` |
| `security-reviewer` | opus | `[agents.security-reviewer]` |
| `story-doctor` | opus | `[agents.story-doctor]` |

**`[agents.<role>]` declaration** in `~/.codex/config.toml` carries
ONLY `description`, `config_file`, `nickname_candidates`. The
**`config_file` is the role config TOML** (e.g.,
`~/.codex/agents/code-fixer.toml`) which carries everything else
(`developer_instructions`, `model`, `model_reasoning_effort`,
`permission_profile`, etc.) via `#[serde(flatten)]` over `ConfigToml`.

Each role config TOML carries:
- `developer_instructions` — Claude agent's body (required, nonblank;
  `agent_roles.rs:360-380`)
- `model` / `model_provider` — **must translate `sonnet`/`opus` Claude
  labels to valid codex/Copilot model slugs** (e.g., `gpt-5.5`) OR
  omit and inherit session default
- `model_reasoning_effort` — explicit (was implicit in Claude)
- `permission_profile` — codex's profile name (see 3b-ii)

**🔑 Auto-discovery requires config layers** (`agent_roles.rs:119-137`).
Without enabled layers, codex only reads declared `[agents.<role>]`
entries from `config.toml` — auto-scan of `agents/*.toml` is bypassed.
User's `~/.codex/` is typically a layer; verify by smoke-testing role
discovery during Phase 2a.

**Critical constraint:** plugin manifests do NOT register agent roles
today. Ralph plugin install must instruct user to copy the role TOMLs
into `~/.codex/config.toml` + `~/.codex/agents/`, OR ship an installer
script. Flag for upstream contribution if/when willing.

**Path resolution:** `config_file` paths in `[agents.<role>]` are
resolved relative to the defining `config.toml`. Document in plugin's
README so the install instructions are right.

#### 3b-ii. Tool permission equivalence audit

**🔑 Major scope reduction:** verified 2026-05-02 that **NO ralph
subagent declares a `tools:` allowlist in its frontmatter** (none of
the 12 .md files have a tools list). All 12 inherit the parent
session's full toolset in Claude. Phase 3b-ii therefore collapses from
"per-agent tool translation" to "pick read-only vs workspace-write
profile per role."

Mapping (per codex `PermissionProfile` semantics — FS+network only;
NO Bash-subcommand restrictions possible in profile, but acceptable
since none of ralph's 12 declare them):

| Profile | Role membership | Why |
|---|---|---|
| `read-only` (or custom `ralph-readonly`) | `code-reviewer`, `docs-reviewer`, `security-reviewer`, `criteria-validator`, `progress-analyst`, `plan-reviewer`, `dsat-analyst` | reviewers/analysts must not edit |
| `workspace-write` (or custom `ralph-workspace-write`) | `code-fixer`, `docs-updater`, `security-fixer`, `refactoring-agent`, `story-doctor` | fixers/updaters need write |

If a role needs Bash-subcommand-level restrictions
(e.g., `Bash(git status:*)` style), that has **no profile equivalent**
— codex sandbox is FS+network only. Workaround: either accept full
Bash with read-only FS, OR add a custom hook gating exec. Document
explicitly if a role needs this.

#### 3c. Hooks port

Toolkit ralph plugin's CLAUDE.md says "skills-only", suggesting no hooks
to port. Verify by inspecting `plugins/ralph/`. If hooks are present,
port to codex's hook system per `core/src/hook_runtime.rs` and
`config/src/hook_config.rs`.

options-mode plugin IS hook-based today (SessionStart + UserPromptSubmit
+ Stop). After Phase 2d, those hooks may become unnecessary — the
underlying choice-prompt UX is now an AskUserQuestion call. Verify and
prune.

Scope depends on actual hook surface; verify ralph plugin first.

#### 3d. Codex-based workers via native agent role spawn (replaces ralph's `codex-exec.sh` codex-side)

**Today:** ralph orchestrator skill runs `bash → codex-exec.sh` to spawn
fresh `codex exec` process for codex-based workers (planner, reviewer,
verifier). Separate process, separate app-server, no continuity.

**After:** ralph orchestrator skill calls native spawn-agent-role tool
for codex-based workers. Each becomes a sub-thread on the SAME
app-server codexu is connected to. visible in codexu. Resumable via
`thread/resume`. Optional long-lived teammate (Phase 6).

**3d-i. Compatibility audit FIRST.** `multi_agents_v2/spawn.rs`
constraints (verified 2026-05-02):
- **Requires `message` (string) AND `task_name`** — `SpawnAgentArgs`
  fields at lines 217-218
- **Inter-agent fast path supports text-only initial input** — lines
  96-114 (`UserInput::Text { .. }` filter)
- **Rejects `fork_context` field** — lines 228-232
- **Denies unknown fields** — `#[serde(deny_unknown_fields)]` at line 215
- **Empty `agent_type` silently mapped to default role** — lines 37-41
- **`task_name` becomes `AgentPath`** — lines 196-200; orchestrator
  cannot reuse names within a session
- **Spawn telemetry** — counter `codex.multi_agent.spawn` keyed by role
  (lines 191-195)
- **Lifecycle limits** (from broader audit):
  - Spawn capped by `agent_max_threads` reservation (`control.rs:191`)
  - Inherits runtime/environment selections from parent (`spawn.rs:105`)
  - Close cascades to descendants only via `close_agent` tool
    (`control.rs:749`); a parent thread that just finishes does NOT
    auto-cancel children
  - `wait_agent` has timeout but no cancellation itself (`wait.rs:28`)
  - **`wait_agent` cannot wait for specific children or return per-child
    statuses.** It waits for any mailbox change with a timeout. "Wait
    for all reviewers to complete" cannot be expressed as a single
    `wait_agent` call; ralph must poll filesystem artifacts (one file
    per reviewer) to determine completion. Implication: the orchestrator
    skill needs an explicit "all artifacts present?" check loop, not a
    typed agent-level barrier.
  - `fork_turns` accepts `"none"` / `"all"` / integer string
    (lines 234-253)
  - `model` and `reasoning_effort` overrides accepted (lines 220-221)

For each `codex-exec.sh` invocation in ralph orchestrator skills,
document. Behavior of `codex-exec.sh` verified 2026-05-02 (lines 80-93,
`gpt-5.5` hardcoded, high-effort default, unconditional sandbox
bypass, file-based output via `-o`):

| Aspect | What ralph uses today | Mapped to spawn surface? |
|---|---|---|
| cwd | callers `cd` before invoking (e.g., `ralph.sh:674` `( cd "$WORK_DIR" && bash codex-exec.sh ...)`); script itself doesn't `cd` | spawn inherits parent runtime; no per-call cwd arg |
| env | no exported env vars; only shell-local arrays | NOT supported; encode in role config or shared filesystem |
| stdin | piped via `codex exec -` (prompt file + `--text` blocks + `--section HEADER PATH` blocks concatenated) | spawn takes single `message` string; `--section` semantics must be encoded in prompt |
| argv: `--model "$MODEL"` | hardcoded `gpt-5.5` | spawn `model` arg, BUT see fork_turns gotcha below |
| argv: `-c model_reasoning_effort=$EFFORT` | per-call (`low`/`medium`/`high`/`xhigh`) | spawn `reasoning_effort` arg, same fork_turns gotcha |
| argv: `--dangerously-bypass-approvals-and-sandbox` | unconditional per-call | **🔴 NO equivalent.** Spawn inherits parent runtime/exec policy (`control.rs:195-197`). If parent runs sandboxed, codex workers can't selectively bypass. Migration must run parent in a permission profile that matches what `codex-exec.sh` calls expected. |
| argv: `-o "$OUTPUT_FILE"` | codex CLI writes structured output to a path; callers tail file + parse `<review-meta>` sentinel | **🔴 NO equivalent.** Spawn returns `SpawnAgentResult { task_name, nickname }` (`spawn.rs:265-273`) + emits events; no file contract. Migration must rewrite callers to consume final-message via app-server APIs, OR have role prompts explicitly write to `.ralph/jobs/<name>/...` |
| state mutations | callers create/remove temp prompt/output/progress files; tail PIDs | shared filesystem still works (same process); but the `-o`/sentinel contract above is the harder gap |
| cancellation | parent kills child PID via Bash signal cascade | `close_agent` cascades to descendants (`control.rs:735-757`). No per-spawn timeout; `wait_agent` does NOT cancel — only times out (`wait.rs:30-65`). Pattern: `wait_agent timeout → close_agent`. |

**🔴 `fork_turns` gotcha:** `model` and `reasoning_effort` overrides
are **rejected** when `fork_turns` defaults to `"all"`
(`spawn.rs:63-80` `reject_full_fork_spawn_overrides`). Migration
MUST explicitly set `fork_turns: "none"` (or integer string) to allow
per-spawn model/effort overrides. Roadmap audit must encode this in
role configs, not assume per-spawn args work.

**Direct invocation surfaces of codex-exec.sh** (5+ verified): ralph
plugin's `brainstorm-with-ralph`, `plan-with-ralph` Phases 2/4,
`review-changes`, `plan-reviewer`, `ralph.sh`, `review-loop.sh`. Each
needs the audit applied.

Patterns that can't be cleanly translated need to either (a) get
encoded into the role's `developer_instructions` prompt, (b) get
expressed via the shared filesystem contract under `.ralph/jobs/<name>/`,
or (c) stay on `codex-exec.sh` as a justified fallback.

**3d-ii. Migration:**
- For each compatible codex-exec.sh invocation: replace with
  `agent.spawn({agent_type: "<role>", message: "<prompt>", task_name: "<name>"})`
- Each role lives as a `[agents.<role>]` entry from 3b-i.
- Incompatible cases: keep on `codex-exec.sh` with a note.

**Side benefit:** migrated workers become first-class in codexu. User on
phone can inspect/interact with them mid-flight. Worker thread can be
archived or kept alive (`inactivity_timeout` config; future Phase 6
keepalive flag).

Mechanical migration is small per call site; the real cost is parity
verification across the bypass / output-file / sentinel / wait /
cancel semantics gaps documented above. Treat 3d-i (audit) as a
prerequisite for 3d-ii (migration) — do NOT skip it.

#### 3e. Cross-vendor workers via shell scripts (no port needed)

`claude-exec.sh`, `copilot-exec.sh`, and other non-codex worker scripts
stay as-is. They spawn separate vendor CLI processes; that's the only
way absent a vendor-API-side adapter (Phase 7).

**Decision pending (open #4):** if Phase 7 (Claude via Copilot adapter)
ships, claude-exec.sh's role shrinks — Claude becomes available as just
another model in codex's provider list, spawnable as an agent role. May
collapse the cross-vendor pattern into the in-process pattern for some
review roles.

#### 3f. Asset migration

The ralph plugin has substantial non-skill, non-agent assets that the
roadmap originally underplayed. Port unchanged into the codex plugin
bundle:

- `lib/finding-merge.sh`, `lib/parse-not-tested-trailers.sh` — shell
  helper libs
- `schemas/*.json` — 4 JSON schemas (prd, group, job-state,
  review-findings)
- `tests/*.sh` — 6+ shell test scripts including
  `test-review-loop-rereview.sh`
- `prd.json.example`
- `prompts/{claude.md, codex.md, repo-detector.md, review-agent.md,
  review-plan-initial.md, review-verifier.md}` — 6 prompt assets
- `path-utils.sh`, `copy-plan.sh`, `copy-prompt.sh` — helper scripts
- 6 cross-vendor prompt files in `agents/` (`{codex,copilot}-{brainstorm,
  planner,reviewer}-prompt.md`) — these are NOT codex agent role TOMLs;
  they're prompt assets for shell-script invocations. Bundle as plain
  files, NOT as `[agents.<role>]` entries.

**Manifest field resolved (verified 2026-05-02):** asset bundles go in
the `apps` field — `Option<String>` path, validated to start with `./`,
rejects `..` and absolute paths (`manifest.rs:392-433`). Bundle layout:

```
<ralph-codex-plugin>/
  .codex-plugin/plugin.json   # references "apps": "./apps"
  skills/                     # SKILL.md files
  apps/
    lib/                      # finding-merge.sh, parse-not-tested-trailers.sh
    schemas/                  # 4 JSON schemas
    tests/                    # 6+ shell test scripts
    prompts/                  # 6 prompt assets
    cross-vendor-prompts/     # codex-{brainstorm,planner,reviewer}-prompt.md
                              # copilot-{brainstorm,planner,reviewer}-prompt.md
    helpers/                  # path-utils.sh, copy-plan.sh, copy-prompt.sh
    prd.json.example
```

Skills reference assets by relative path (`./apps/lib/finding-merge.sh`)
from within their SKILL.md bodies via the bash tool.

Mostly mechanical: file moves + plugin.json authoring + smoke-test
that skills can find the relative paths from inside the codex plugin
install location.

#### 3g. Plugin packaging

Convert from Claude Code marketplace plugin (`.claude-plugin/plugin.json`)
to codex plugin format (`.codex-plugin/plugin.json`):
- Manifest schema change (verify field-level differences against
  `core-plugins/src/manifest.rs`)
- Bundle layout (no `agents/` directory unless it's pure-asset; agent
  roles go in user config)
- Distribution: `codex plugin marketplace add <SOURCE>` (per Phase 1c
  finding — `codex plugin install <path>` does NOT exist). SOURCE
  options: GitHub repo, git URL, or local marketplace root containing
  `marketplace.json`. For ralph + options-mode + personal plugins,
  publish a marketplace catalog (one repo) listing all three; users
  add the catalog once, install plugins from it.

**Files to author/update:**
- `<ralph-codex-plugin>/.codex-plugin/plugin.json`
- `<options-mode-codex-plugin>/.codex-plugin/plugin.json`
- Update install instructions in
  `C:/ai-developer-toolkit/plugins/ralph/CLAUDE.md` and the in-repo
  `packages/codexu-options-mode-plugin/README.md` +
  `packages/codexu-options-mode-plugin/CLAUDE.md`

#### 3h. options-mode plugin migration - DONE 2026-05-13

**Status:** Phase 3h shipped as `packages/codexu-options-mode-plugin/`.
The port keeps the upstream tag protocol and Codex hook integration while
adapting Stop enforcement to Codex's plain-string `last_assistant_message`
and JSONL `function_call` shape. The plugin includes install docs, a
documentation-only `/codexu-options-mode-plugin:options-mode` skill,
forward-compatible statusline script copies, and
`scripts/smoke.mjs` for reproducible local verification.

**Phase 3h-tail follow-ups:**
- Codex TUI statusline plugin slot so `apps/statusline/` can be wired into
  the visible statusline instead of SessionStart in-band context.
- Codex `request_user_input` handler `pre_tool_use_payload()` override so
  AskUserQuestion auto-intercept can be restored for auto mode.

**The plugin is hook-driven, not skill-driven.** The shipped port at
`packages/codexu-options-mode-plugin/` is Node.js hook logic
(SessionStart + UserPromptSubmit + Stop) plus a documentation-only
skill and forward-compat statusline scripts. Tag-protocol enforcement
runs deterministically in the Stop hook against codex's pre-extracted
`last_assistant_message`.

What it does today (shipped reality):
- **SessionStart hook** injects mode-specific rules (`on` / `strict` /
  `auto`) and emits an in-band `options-mode: <mode>` line via
  `additionalContext` (substitutes for a TUI statusline badge until
  codex grows a plugin statusline slot).
- **UserPromptSubmit hook** is the **primary** `/options-mode <args>`
  toggle surface. It intercepts the literal slash text (codex TUI
  passes unknown slash commands through to hooks per
  `chat_composer.rs:2797-2823`) and toggles
  `on|off|strict|auto|status`.
- **Stop hook** reads `input.last_assistant_message` directly (plain
  `string | null` per codex's `serde(transparent)` `NullableString` at
  `hooks/src/schema.rs:34-35`) and enforces the active mode's tag
  contract. Tags recognised:
  - `<options-mode>no-question</options-mode>` — plain-prose escape
    hatch (valid in `on` mode only)
  - `<options-mode>task-complete</options-mode>` — task done, no
    follow-up question (valid in `auto` mode)
  - `<options-mode>background-task</options-mode>` — polling a
    background task (valid in `strict` + `auto`)
  - `<options-mode>background-agent</options-mode>` — polling a
    background agent (valid in `strict` + `auto`)
  There is **NO** `<options-mode>continue</options-mode>` tag in the
  codex port; the upstream "continue" sentinel was replaced by the
  four explicit terminators above plus AskUserQuestion detection.
- **AskUserQuestion detection** for an empty `last_assistant_message`
  scans the codex JSONL transcript for a trailing
  `payload.type: "function_call"` with `name: "request_user_input"` or
  `"ask_user_question"` (forward-compat — both names accepted) after
  the last `payload.type: "message"` line.
- **No LLM classification** — pure tag + function-call detection
  (deterministic).

**Config root contract** (`hooks/config.js`):
- `getConfigRoot()` reads the **`PLUGIN_DATA`** env var that codex sets
  during plugin discovery (`hooks/src/engine/discovery.rs:184-186`).
- **Fail-loud:** if `PLUGIN_DATA` is unset, `getConfigRoot()` throws
  `ERR_OPTIONS_PLUGIN_DATA_REQUIRED`. There is **no fallback** to
  `CODEX_HOME`, `~/.codex/`, or `~/.claude/` — by design. This keeps
  state co-located with the plugin install and matches codex's plugin
  data convention.
- All state paths (session flag files under
  `options-mode/sessions-configs/`, `options.json`, `options.log`) hang
  off `PLUGIN_DATA`. TOCTOU symlink window in `safeWriteFlag` /
  `_writeConfigJsonAtomic` is accepted as out-of-threat-model (a local
  attacker with write access to `PLUGIN_DATA` already owns plugin state).

**Codex hook surface verified:**
- `Stop` kind: `config/src/hook_config.rs:42`
- `StopCommandInput` carries `transcript_path`, `last_assistant_message`,
  `stop_hook_active` as plain `string | null` / `bool` per
  `hooks/src/schema.rs:34-35`
- `stop_hook_active` semantics are byte-identical to upstream Claude:
  initialised `false` (`turn.rs:366`), set to `true` after a Stop hook
  block (`turn.rs:557`). The upstream
  `if (input.stop_hook_active === true) return;` guard is preserved
  verbatim — do NOT invert.
- Block + continue: hook returns `decision:"block"` + `reason`; codex
  records the continuation prompt and loops (`turn.rs:534-547`).
- `${CLAUDE_PLUGIN_ROOT}` is set by codex during discovery
  (`discovery.rs:181-186`) — `hooks.json` uses this literal for
  byte-identical parity with upstream.

**Slash command + skill surface** (shipped):
- Codex TUI does **not** reject unknown slash commands; the composer
  falls through to normal submission (`chat_composer.rs:2797-2823`).
  The UserPromptSubmit hook is therefore the **primary** toggle
  surface — typing `/options-mode strict` invokes the hook directly.
- The skill `/codexu-options-mode-plugin:options-mode` is
  **documentation-only**. It has no `--cmd` flag and never shells out;
  it tells the user/agent to type `/options-mode <args>` literally so
  the hook handles it.
- Codex slash commands remain built-ins
  (`tui/src/bottom_pane/slash_commands.rs:27`); plugin
  `commands/*.toml` files do not register native slash commands and
  are NOT used by this port.

**Statusline** (forward-compat, not wired):
- `apps/statusline/options-mode-statusline.{ps1,sh}` ship in the
  plugin but are **not wired** into a manifest entry. Codex has no
  plugin statusline slot yet — the SessionStart `additionalContext`
  `options-mode: <mode>` prefix is the in-band substitute. The scripts
  are shipped so they can be hooked up the moment codex grows a
  statusline plugin slot (Phase 3h-tail).

**Phase 2d interaction (`ask_user_question`):** Codex currently emits
`request_user_input` (verified at
`core/src/tools/handlers/request_user_input.rs`). `config.js` exports
`FUNCTION_CALL_NAMES = ['request_user_input', 'ask_user_question']` so
detection scans both names for forward-compat with any future rename.
The "structured choice prompt" half of options-mode is already
agent-callable via either tool name today.

**Files shipped** (under `packages/codexu-options-mode-plugin/`):
- `.codex-plugin/plugin.json` — codex plugin manifest
- `hooks/hooks.json` — registers SessionStart, UserPromptSubmit, Stop
  hooks (NO PreToolUse — deferred to Phase 3h-tail)
- `hooks/config.js`, `hooks/session-start.js`,
  `hooks/user-prompt-submit.js`, `hooks/stop.js` — Node.js hook
  implementations (note: hooks live under `hooks/`, NOT `apps/hooks/`)
- `skills/options-mode/SKILL.md` — documentation-only skill
- `apps/statusline/options-mode-statusline.{ps1,sh}` — forward-compat
  statusline scripts, not wired
- `README.md` + `CLAUDE.md` — in-repo install + engine docs
- `scripts/smoke.mjs` — reproducible local verification
- `tests/` — vitest coverage for hooks + config

**Phase 3h-tail (deferred follow-ups):**
- **Codex TUI statusline plugin slot** — once codex exposes a
  `StatusLineItem` variant for plugin-driven badges (or equivalent
  manifest entry), wire `apps/statusline/` in and drop the
  SessionStart `additionalContext` in-band substitute.
- **`request_user_input` `pre_tool_use_payload()` override** — codex's
  `request_user_input` handler currently has no
  `pre_tool_use_payload()` override
  (`core/src/tools/handlers/request_user_input.rs`), which is why this
  port deliberately does NOT register a PreToolUse hook in
  `hooks.json`. Auto-mode enforcement falls back to the Stop hook
  (function_call detection passes through; bare prose blocks). Once
  codex grows that override, restore the upstream `pre-tool-use.js`
  auto-intercept path so AskUserQuestion can be enforced before the
  tool runs.

#### Phase 3 summary — behavior parity is the cost, not syntax

Codex reviewer flagged: ralph isn't "mostly markdown" — it has durable
job state, recurrence detection, review-loop contracts, cross-vendor
subprocesses, terminal markers, resume semantics. Porting syntax is
easy; **proving behavior parity is the real work**. Budget time for
end-to-end runs of sample ralph jobs and diffing observed behavior
against pre-migration baselines.

**Phase 3 cost shape:** behavior parity dominates. Each sub-phase
3a-h has its own bounded scope, but proving end-to-end equivalence
against pre-migration baselines is the real work. Thin-slice option
("skills invoke existing scripts, no parity verification, no
options-mode") defers parity risk to dogfood.

### Phase 4 — Coexistence verification

End-to-end tests across the full stack:

- 4a. **codex from codexu works** — `codexu codex` spawns the patched
  codex via app-server, ws transport, multi-client. Smoke test.
- 4b. **ralph from codex works** — invoke `$implement-with-ralph` in
  a codex session; ralph orchestrator skill spawns codex-based
  reviewer agents (Phase 3d) and cross-vendor reviewers (3e); merged
  results land in working tree.
- 4c. **ralph + codexu combined** — start `codexu codex` on laptop,
  attach phone, invoke `$implement-with-ralph` from phone. Watch ralph
  progress on phone via the relay; answer approvals from either
  surface; spawned codex worker threads visible as cards on phone.
- 4d. **Plugin scoping works** — confirm ralph plugin (scope=`host`)
  does NOT load inside spawned worker agents. Confirm personal plugin
  (scope=`both`) DOES load there. Test cache identity: a host load
  doesn't leak host-scope-only plugins into agent threads.
- 4e. **Cross-vendor fan-out works** — within ralph's review phase,
  `claude-exec.sh` and `copilot-exec.sh` get invoked; their output
  merges back into the codex thread. Multi-vendor billing visible
  per-worker.
- 4f. **AskUserQuestion fan-out** — codex agent calls
  `ask_user_question`; both codex TUI and codexu phone receive the
  request; first-answer-wins; "Other" free-text path works.
- 4g. **App-server lifecycle** — close all clients; observe app-server
  exit (or idle-timeout-driven exit). Reattach via `codexu codex` on
  the same cwd; thread state preserved.
- 4h. **End-to-end trace IDs** — a single user action correlates
  across `~/.codex/logs/{app-server,ralph,codexu}/<session>/` log
  directories.
- 4i. **Pre-Phase-3 ralph state migrates** — take a `.ralph/jobs/<name>/`
  directory created by Claude-Code-era ralph; resume / inspect it via
  codex-driven ralph; verify `job-state.json` reads transparently and
  `dashboard.md` renders. If migration is needed, document the steps
  and add a one-shot migrator skill or script.
- 4j. **Reviewer fan-out determinism** — smoke-test 3-way fan-out with
  deliberate ordering chaos: introduce artificial latency in one
  reviewer (e.g., `sleep` in `claude-exec.sh`), let two other reviewers
  return fast. Confirm orchestrator merge produces deterministic output
  regardless of arrival order. See "Reviewer fan-out contract" in
  Cross-cutting concerns.
- 4k. **Output-file contract migration** — for codex-based ralph
  workers migrated from `codex-exec.sh -o OUTPUT_FILE` (Phase 3d), run
  a sample story end-to-end. Confirm orchestrator consumes
  final-message via app-server APIs OR role prompts write to
  `.ralph/jobs/<name>/...`. The pre-migration `<review-meta>` sentinel
  contract must still resolve (or its replacement signal does).
- 4l. **Sandbox-bypass parity** — `codex-exec.sh` ran with
  `--dangerously-bypass-approvals-and-sandbox` per call; native spawn
  inherits parent runtime. Verify migrated workers still complete
  their tasks with the new permission profile (Phase 3b-ii). Specific
  test: workspace-write fixer role spawned from a workspace-write
  parent — does the fixer actually edit files? If parent is sandboxed
  read-only, does the fixer fail cleanly?
- 4m. **Stop-hook tag enforcement post-port** — for options-mode
  (Phase 3h), confirm the ported Stop hook still detects and enforces
  the `<options-mode>continue</options-mode>` tag. Test: agent ends
  turn without tag → Stop hook returns `decision:"block"` with
  reason; codex records continuation prompt and loops. Test:
  AskUserQuestion / `ask_user_question` properly emitted → Stop hook
  early-returns (does not block). Verify against codex's JSONL
  transcript shape (since the existing Claude-shape parser is
  replaced with `last_assistant_message`-based detection).

Failures get filed back into the appropriate phase.

### Phase 5 — Drop Claude Code (with dogfood buffer)

- 5a. **Dual-stack dogfood** — run codex-only stack alongside
  Claude Code as fallback. If Phase 3 migration regresses behavior,
  fall back via `codex plugin disable ralph-orchestration` and reach
  for the Claude Code original.
- 5b. **Audit remaining Claude Code workflows** beyond ralph +
  options-mode. Migrate or accept loss.
- 5c. **Archive** Claude Code-specific configs (`~/.claude/`, project
  `.claude/` dirs) to a backup location. Leave the directory tree
  intact so plugin-registered `.claude/skills/` discovery in Phase 2b
  keeps working.
- 5d. **Uninstall** Claude Code binary.
- 5e. **Update** personal docs (`C:/ai-developer-toolkit/CLAUDE.md`,
  any `AGENTS.md` files) to reflect codex-only stack.
- 5f. **Update** `C:/harness-efforts/codex/CLAUDE.md` to mark migration
  complete.

Phase 5 is the point of no return; the dogfood buffer is what keeps
that statement true and survivable.

### Phase 6 — Long-lived teammates (deferred polish)

Codex's `thread/resume`, `thread/list`, thread metadata, and agent
nicknames (`AgentRoleToml::nickname_candidates`) already give most of
what "teammate" needs. After Phase 4, the underlying primitive works:
spawn an agent role, do a task, the thread persists and can be resumed.

What's missing for a polished teammate UX:
- Per-role `keepalive: bool` flag (or `inactivity_timeout: never`) to
  opt out of auto-pruning
- Workflow conventions ("ping teammate Researcher with question Y"
  without spawning a new role each time)
- codexu phone UI: an "active teammates" tab listing resumable threads
  with last-activity timestamps
- Documentation patterns for teammate types (e.g., "Researcher" stays
  pinned as a long-lived background agent; "Code-Fixer" is one-shot)

None of this is required to ship the rest. Defer until usage warrants.

**Un-defer condition:** the user reports concrete friction with
re-spawning specialist roles instead of resuming long-lived ones —
e.g., "I keep spawning a fresh `[agents.researcher]` thread every
day for the same project; I want one persistent thread I can ping."
Once that friction is felt 3+ times in a working week, Phase 6 promotes
from deferred to active.

### Phase 7 — Claude model support via Copilot adapter (deferred, spike-first)

`gim-home/codex` already routes through GitHub Copilot's API. Copilot
proxies Claude Opus / Claude Sonnet as available models. An adapter
*may* let codex select Claude models the same way it selects GPT — same
provider, same auth, different slug.

**Effort range is wide and depends on a spike.** The 3-way review found:
- Existing dispatch is provider-id-based (`provider.rs:139`), not
  slug-based — adding `claude-*` is not a model-list edit alone
- Zero existing Claude/Anthropic code paths in `model-provider/` —
  fully greenfield
- Copilot transport hardwired to `/responses` API
  (`copilot_models_endpoint.rs:11-13`); Anthropic streaming/tool-call
  shape may or may not match
- Models discovery already filters by `supported_endpoints contains "/responses"`
  — Claude variants must surface there or get filtered out

**Phase 7-pre: spike (PRECONDITION).** Before any committed work:

**Test commands** — run each, capture output, classify per branch table
below:

1. **Auth + model discovery:** verify existing auth via `codex login`
   (the patched fork already routes via Copilot — no `--provider`
   flag needed). Then `curl` the Copilot `/models` endpoint via the
   auth chain (or use `codex` model-picker output) to enumerate Claude
   slugs Copilot exposes.
2. **Config:** `~/.codex/config.toml` with
   `model = "<claude-slug-from-step-1>"`.
3. **Plain prompt:** `codex exec "hello world"` — observe transport
   behavior end-to-end (request fires, response comes back, no errors).
4. **Tool-call shape:** `codex exec "list 3 colors and use a tool to write them to /tmp/colors.txt"` —
   exercise tool calling. Inspect: does the model emit tool calls in
   the shape codex expects?
5. **Multi-tool sequence:** prompt that requires Read + Edit + Bash in
   sequence; observe whether Claude's content-blocks vs OpenAI's
   function-calls reconcile across the conversation.
6. **Long streaming answer:** prompt requesting a 500-word essay;
   observe streaming chunks render correctly (no garbled output).
7. **Tool error / retry:** force a tool error (write to nonexistent
   path); observe whether Claude handles the error response correctly.
8. **App-server surface:** repeat steps 3-4 via `codexu codex`
   (i.e., `codex` driven from codexu's app-server) — verify the same
   prompt works through the full stack, not just `codex exec`.
9. **Spawned-agent surface:** define `[agents.claude-reviewer]` with the
   Claude slug; spawn it from a parent codex session; verify it runs.
10. **Structured output / schema constraints:** prompt that requires
    JSON-shape output (e.g., `output_schema` config); verify Claude
    honors the constraint via Copilot proxy.
11. **Image / file attachments:** `codex exec --image <path> "describe"`
    — check whether Copilot's Claude variant accepts vision inputs at
    all (Copilot may strip them).
12. **Long-context behavior:** prompt with a large file pasted (50k+
    tokens); verify response coherence + no truncation surprises.
13. **Interrupted / resumed turns:** start a turn, Ctrl+C mid-generation,
    verify codex's interrupt + resume semantics work with the Claude slug.
14. **Auth expiry / 401 refresh:** force a stale Copilot token; verify
    `on_unauthorized → invalidate` plumbing fires correctly for Claude
    routing (not just GPT).
15. **Model picker cache behavior:** rotate selected model (Claude →
    GPT → Claude) several times in one session; verify the cache
    doesn't pin to one variant.
16. **Golden transcript diff:** save a multi-turn tool-loop transcript
    against `model = "gpt-5.5"` (existing baseline); replay the same
    user turns against `model = "claude-opus-4.6"`; diff at the
    structural level (tool-calls fired, tool args, response shape).
    Cross-model diffs that are "different but both valid" are normal;
    diffs that show structural drops (missing tool calls, garbled
    streams) classify as branch (b) or (c).

**Note on coverage:** the codex review flagged steps 1-9 as "minimum
smoke matrix, not enough to justify branch (a) confidently." Steps
10-16 close that gap. Branch (a) (metadata-only) requires ALL 16 steps
pass without translation. Anything less classifies as (b) at minimum.

**Branch table** — classify spike outcome:

| Outcome | Branch | Phase 7 actual scope |
|---|---|---|
| All 16 steps pass cleanly | (a) Metadata-only path | Add slug recognition + ModelInfo entries; smallest scope |
| Plain prompts work, tool-calls/streaming need translation | (b) Pre-send routing in core Responses client | Slug-aware payload translation in `CopilotResponsesEndpoint` |
| Different wire format (Anthropic Messages vs Responses) — basic prompts fail | (c) Full transport adapter | New endpoint variant + Anthropic-Messages-to-Responses translator; largest scope |
| Mixed / partial / hard to classify (e.g., tool-calls work for some shapes but not others; OR `codex exec` works but app-server doesn't) | (d) Ambiguous — extended spike | Run extended golden-transcript comparison; prepare to fall to (b) by default |

**Default-if-ambiguous rule:** if the spike result is hard to classify
after the extended run, **default to branch (b) (pre-send routing).**
Don't commit to (a) on optimism; don't jump to (c) on pessimism. The
mid-path is recoverable from in either direction.

Resolve **Decision still open #9** (Copilot ToS) BEFORE spike. If terms
don't allow it, Phase 7 is dead and cross-vendor stays on
`claude-exec.sh`.

**Why this matters (assuming spike resolves favorably):**
- True in-process cross-vendor — Claude becomes a model in codex's
  registry, spawnable as an agent role, visible in codexu, resumable as a
  teammate
- Simplifies ralph's review fan-out: instead of `claude-exec.sh`
  shell-out, define `[agents.claude-reviewer]` with `model =
  "claude-opus-4.6"` and spawn natively
- Eliminates auth chain complexity (claude-cli needs Anthropic key;
  Copilot-routed Claude reuses Copilot OAuth)

**Caveats — what does NOT survive Copilot routing:**
- **Prompt caching** — Anthropic's beta cache_control headers are unlikely
  to be honored by Copilot's proxy; expect to pay full prompt tokens on
  every turn
- **Computer-use tool** — Anthropic's beta tool surface; Copilot does not
  expose it
- **Extended thinking modes** — Anthropic's reasoning tokens may be
  stripped or rendered differently by Copilot
- **System prompt prefix** — Copilot may inject its own prepend; user's
  full control over system prompt is not guaranteed
- **Beta API endpoints** — anything behind Anthropic's `anthropic-beta`
  header (vision improvements, new tool shapes, message-batching) won't
  surface
- **Rate limits and quotas** — governed by Copilot's plan, not the
  Anthropic account; surprise throttling possible
- **Streaming format / tool-call shape** — adapter must reconcile
  Anthropic-style tool blocks vs OpenAI-style function calls; subtle
  bugs likely
- **Token billing** flows through Copilot, not Anthropic — different
  cost visibility, different invoice line items, no per-Claude-call
  metering against an Anthropic plan

**What needs building** (depends on spike outcome):
- (a) Branch: ModelInfo entries for Claude variants in `models-manager/models.json`
  + slug recognition in any branching logic that hardcodes GPT
- (b) Branch: pre-send routing in `CopilotResponsesEndpoint` that
  recognizes Claude slugs and either translates payloads or routes to
  a different upstream endpoint
- (c) Branch: new transport variant (sibling to `CopilotResponsesEndpoint`)
  speaking Anthropic Messages format, plus translator to codex's
  internal Responses-like model
- All branches: tests for the adapter; smoke test that spawns
  `[agents.claude-reviewer]` and verifies the response comes from Claude
- All branches: regression tests around tool calls, streaming, model
  metadata

**Scope after spike:** smallest for (a), middle for (b), largest for
(c). Spike itself is bounded — see test commands above.

**Strategic implication:** if Phase 7 lands, **Phase 3e cross-vendor
shell scripts get simpler but cross-vendor consensus value is preserved.**
Specifically:
- **Auth/billing surface consolidates** — Claude routed via Copilot
  reuses one OAuth chain and one invoice; eliminates `claude-exec.sh`'s
  Anthropic-API-key requirement
- **Spawn pattern unifies** — Claude becomes a model in codex's registry,
  spawnable as `[agents.claude-reviewer] { model = "claude-opus-4.6" }`,
  visible in codexu as a sub-thread
- **Cross-vendor consensus is NOT lost.** Even routed through one
  provider, Claude / GPT / Codex are still distinct model FAMILIES with
  different blind spots. 3-way ralph review preserves its consensus
  benefit. What changes is the plumbing: in-process role spawn instead
  of shell-out for Claude.
- **Copilot model variant** could similarly become a same-provider model
  (eliminating `copilot-exec.sh`). At that point shell-script cross-
  vendor shrinks to "things Copilot doesn't proxy" — Gemini, Qwen,
  Ollama-local, future models — and stays useful for that subset.

Defer until Phases 1-5 are stable.

**Un-defer conditions** (any one is sufficient):
- Decision #9 (Copilot ToS) resolves favorably AND auth-chain
  fragmentation becomes painful in dogfood (e.g., user has to log
  into 3 different vendor CLIs every fresh laptop)
- Cross-vendor consensus quality regresses on dogfood and we want
  Claude in-process to verify the reviewer signal isn't degrading
  due to claude-cli flag / arg drift
- A new feature in codex (e.g., teammates, Phase 6) materially
  benefits from having Claude as a first-class model rather than
  shell-script worker

**Stay-deferred conditions:**
- Decision #9 unresolved or unfavorable
- Phase 1-5 not yet shipped
- `claude-exec.sh` shell-out is "good enough" — quality + latency
  acceptable, billing visible, auth not a daily papercut

## Cross-cutting concerns

**Versioning.** Pin a specific codex-patched rev in codexu's `codexCli`
dep and in any ralph plugin scripts that reference codex behavior. Bump
in coordination. Define an **RPC contract version** in
`external/repos/codex-patched/codex-rs/protocol/src/` (specific file TBD
during Phase 1a) so consumers detect incompatible runtimes on
`initialize`. Document the version-bump policy in
`docs/implementation/patch-surface.md`.

**Logs.** Consolidate to `~/.codex/logs/{app-server,ralph,codexu}/<session>/`.
Each tool writes to its subdir. A single user action should be
correlatable across all three via end-to-end trace IDs (decide format —
W3C TraceContext? Codex-specific?). Add to Phase 4h verification.

**Auth.** Loopback-only for codex app-server. No tokens for local IPC.

**Hard invariant (post-tunnels-plan refinement):** Codex app-server
must bind only loopback and must never be directly exposed; any
remote/mobile access terminates at codexu-cli's authenticated
tunnel-facing server, which is a separate client of the loopback
codex app-server. codexu-cli's WS server MAY be exposed via Microsoft
devtunnel per `github-auth-via-vscode-tunnels.md` — that is an
authenticated-tunnel hop, not a non-loopback bind on codex.

Worker CLIs (claude, copilot, gemini) handle their own auth via their
respective configs. After Phase 7, Claude-via-Copilot routes through
codex's Copilot auth — single auth chain.

**Updates.** Three install paths today (codex npm, codexu npm, ralph +
options-mode + personal plugins via `codex plugin marketplace add`). Acceptable;
revisit only if it causes pain.

**Identity.** Same auth identity across surfaces. codexu's relay handles
this for cross-machine; on-machine is just the user account.

**Disaster recovery.** When something goes wrong:
- Corrupted thread state: `~/.codex/sessions/<thread-id>.jsonl` is the
  source of truth; can be replayed via `thread/resume`
- Hung app-server: kill PID from discovery file at
  `~/.happy/codex-active-${cwdHash}.json` (or
  `$HAPPY_HOME_DIR/codex-active-${cwdHash}.json`); codexu will reattach
  on next `codexu codex` invocation (per Phase 1b plan)
- Stuck ralph job: state at `.ralph/jobs/<name>/job-state.json`;
  manual intervention via `list-jobs` skill or direct file edit
- Force-restart fallback path documented per codexu's existing
  `runCodex.ts:265-280` abort flow

**Observability across layers.** When debugging:
1. Start with codexu's mobile-side trace (`~/.happy-dev/logs/`)
2. Cross-reference codex app-server log
   (`~/.codex/logs/app-server/<session>/`)
3. Drill into ralph's per-job artifacts
   (`.ralph/jobs/<name>/dashboard.md`, `progress.md`,
   `job-state.json`)
4. Worker subprocess output captured per ralph's existing log
   conventions

**Rollback strategy for Phase 3.** During the 2-week dogfood buffer in
Phase 5a:
- `codex plugin disable ralph-orchestration` falls back to Claude
  Code's ralph (re-enable Claude Code if uninstalled)
- Personal plugin can be disabled the same way
- Phase 5d (uninstall Claude Code) is the point of no return; do not
  proceed until rollback path is no longer needed

**Trust model for cross-vendor workers.** Phase 3e relies on
`claude-exec.sh` / `copilot-exec.sh` shelling out. Each worker:
- Brings its own auth (Anthropic key, Copilot OAuth, codex Copilot)
- Bills against the user's vendor account separately — a 3-way review
  triples API spend per round vs. single-vendor
- Runs with whatever sandbox/permissions THAT CLI enforces (claude
  `--dangerously-skip-permissions` IS dangerous; codex sandbox does
  NOT extend to the spawned process)
- Worker's stdout/stderr is the ONLY observability into what it did

Document where each vendor's auth is configured. Surface billing
visibility as a cross-cutting concern (e.g., a "vendor activity"
section in ralph's job dashboard tracking calls per worker). After
Phase 7, claude-via-Copilot collapses three accounts into one — single
billing, single auth.

**Fresh-machine bootstrap appendix** (TBD — populate after Phase 1c
solidifies):
1. `gh auth login` with a user that has `gim-home` org access (needed
   for the codex submodule clone)
2. `git clone https://github.com/Evyatar108/codexu.git && cd codexu`
3. `git submodule update --init` — populates `codex/` from
   `gim-home/codex` at the pinned SHA. Re-run with `--remote` to bump
   to the latest `main`.
4. `pnpm install`
5. Create the per-machine junctions (gitignored) for ralph,
   options-mode, and inspirations/* — see "Workspace dependencies"
   above. `mklink /J` recipe lives in the top-level README.
6. `codex plugin marketplace add <catalog-source>` to install ralph +
   options-mode + personal codex plugins from the catalog.
7. `~/.codex/config.toml` — add `[agents.<role>]` entries from each
   plugin's documentation.
8. `codexu login` — auth chain.
9. Verify: `codex` opens; `/skills` shows installed skills;
   `codexu codex` starts; phone pairs.

**App-server lifecycle acceptance tests** (Phase 4g):
- Idle exit: all clients disconnect; app-server eventually exits per
  configured idle timeout
- Reattach: app-server alive; new `codexu codex` reattaches via
  discovery file; missed turns catch up via `thread/turns/list`
- Orphan child: app-server exits with running background bash; the
  bash should NOT survive (avoid orphan processes)
- Discovery file staleness: dead PID in discovery file; new `codexu codex` deletes stale entry, spawns fresh

**Reviewer fan-out contract.** When ralph fans out 3 reviewers (or any
multi-agent spawn writing back to a parent thread), prevent races.

**Important:** codex does NOT enforce deterministic delivery natively.
`Mailbox::send` (`core/src/agent/mailbox.rs:32`) is sequence/as-arrival
on an unbounded channel. `wait_agent` (`multi_agents_v2/wait.rs:28`)
does NOT take named-child arguments at all — it just waits for any
mailbox change with a timeout. Per-reviewer wait semantics ("did
reviewer X finish?") have to come from filesystem artifacts (each
reviewer writes its own file under
`.ralph/jobs/<job>/reviewers/<reviewer-name>/`), not from a typed
agent-level wait. Determinism is **ralph's responsibility**, achieved
through filesystem artifacts + parent-side merge — not by trusting
codex events to arrive in any particular order.

The contract:
- **Children produce immutable per-reviewer artifacts** under
  `.ralph/jobs/<job>/reviewers/<reviewer-name>/findings.json` (or
  similar). One file per reviewer; no shared writes.
- **Parent owns the merge** — orchestrator reads all reviewer artifacts
  in deterministic order (alphabetical by reviewer name), merges,
  produces consolidated `findings-merged.json`.
- **No child writes to the consolidated file.** Child outputs are
  proposals, not commits.
- **No tool-call interleaving** in the parent thread between waiting on
  reviewers and merging. Parent blocks until all reviewers complete
  (or are cancelled), then runs merge as a single tool call.
- **Cancellation is parent-driven.** If one reviewer hangs, parent
  invokes `close_agent` (the actual lifecycle primitive — `core/src/agent/control.rs:749`)
  to cascade-cancel the descendant thread and either retries that
  reviewer or proceeds with partial merge (with explicit "reviewer X
  unavailable" note). Note: `wait_agent` does NOT support waiting for
  specific children — it waits on the parent's mailbox + a timeout
  (`wait.rs:28`). To "wait for all reviewers," ralph polls the
  filesystem artifacts each reviewer writes (one file per reviewer)
  rather than relying on a typed agent-level wait.

Document this contract in ralph's review-loop skill body. Verified by
Phase 4j.

**Plugin upgrade paths.** Codex bumps and breaks `core-plugins/src/manifest.rs`
schema. Without versioning:
- Plugin's `plugin.json` declared with old field shape → new codex
  rejects it with parse error → plugin silently disabled
- User has no migration path other than re-author manifest

Mitigations:
- Plugin manifest gains a top-level `manifestVersion` field (negotiated
  on Phase 2c plugin-scoping work; piggyback)
- Codex skips plugins with newer `manifestVersion` than it understands,
  emits warning rather than crashing
- Document supported manifest versions per codex release in
  `docs/implementation/patch-surface.md`

**Worker auth invalidation mid-job.** In a long ralph loop:
- `claude-cli` token expires at iteration 47; `claude-exec.sh` returns
  auth error; ralph orchestrator must distinguish auth-failure from
  task-failure
- `codex-copilot/src/auth.rs` already has `on_unauthorized → invalidate`
  for codex's own auth chain
- `claude-exec.sh` does NOT have equivalent — needs explicit error
  detection and re-auth instruction back to the user
- After Phase 7 lands (if it does), this collapses for Claude (one
  auth chain) but stays an issue for `copilot-exec.sh`, `gemini-exec.sh`
  if used

Document in ralph plugin: each `*-exec.sh` script must distinguish
auth errors from task errors and emit a structured marker the
orchestrator can recognize.

**Skill versioning conflict precedence.** If the user has
`~/.codex/skills/$ralph` (one version) AND ralph plugin's
`<plugin-root>/skills/$ralph` (another version), which wins?
- `core-skills/src/loader.rs` has scope precedence
  (Repo > User > System > Admin per `loader.rs:201-216`); user-scope
  files come from `$HOME/.agents/skills` and `$CODEX_HOME/skills`,
  plugin-supplied paths default to `SkillScope::User`
- Risk: conflicting skill names with same scope; loader behavior on
  duplicates is "first match wins by scan order"
- Mitigation: ralph plugin should namespace its skills (`ralph-implement`
  vs `implement`) OR document that plugin install will shadow any
  user-scope same-named skill

Add to ralph plugin install instructions: "this plugin provides skills
named `<list>`; if you have your own same-named skills they may be
shadowed."

## Common mistakes for future agents

These recur in design discussions; flagging here saves re-derivation.
Grouped by topic.

### Plugins + manifest

- **Plugin manifest is `.codex-plugin/plugin.json`, NOT `plugin.toml`.**
  Verified against `core-plugins/src/loader.rs:554` (loader error text
  says "missing or invalid plugin.json"). Manifest schema fields:
  `skills`, `mcpServers`, `apps`, `hooks`, `interface`. NO
  `agent_roles` field; NO `agents/` directory.
- **`codex plugin install <path>` does NOT exist.** Install path is
  `codex plugin marketplace add <SOURCE>`; SOURCE is owner/repo, git
  URL, or local marketplace root containing `marketplace.json`.
- **Plugin manifest silent-skip behaviors:** malformed JSON, missing
  `./` prefix on path fields, unknown fields all warn-and-skip
  silently (no `deny_unknown_fields` on RawPluginManifest). Smoke-test
  must check `~/.codex/log/`.
- **Plugin install location is per-user globally** (`~/.codex/plugins/`),
  not per-repo. Per-repo discovery is via `.agents/plugins/marketplace.json`
  catalogs, but installs themselves go to user scope.
- **Plugin manifests do NOT register agent roles today.** Roles must
  live in `~/.codex/config.toml`. Plugin install instructions must say
  so. This is a real gap; plugin-side role registration would be a
  new feature on top of Phase 2c scope.
- **`RemotePluginScope::Global` vs `Workspace`** is install-location
  scoping (where the plugin lives). Distinct from the host/agent
  scoping we propose in Phase 2c (when the plugin loads). Don't
  conflate.

### Skills

- **Skill body IS sent to the model on activation.** "Name +
  description only" is *discovery-time* behavior to keep context tight
  on startup. At invocation (`$<skill-name>`), the full body is read
  and sent.
- **`.codex/skills/` is NOT a built-in discovery root.** Only
  `.agents/skills/` (repo + home), `$CODEX_HOME/skills/`,
  `$CODEX_HOME/skills/.system/`, `/etc/codex/skills/`. Use plugin-
  registered roots for `.claude/skills/` support.
- **Ralph has 4 user-invocable + 9 internal = 13 skills.** Verify
  via `user-invocable: true|false` frontmatter flag in each
  `SKILL.md`. User-invocable: `brainstorm-with-ralph`,
  `implement-with-ralph`, `plan-with-ralph`, `review-plan-with-ralph`.
  `list-jobs` is NOT user-invocable (`SKILL.md:4` declares
  `user-invocable: false`).

### Agents (codex sub-agents vs cross-vendor)

- **Don't conflate "codex sub-agents" with "cross-vendor agents."**
  Two different concepts:
  - Codex sub-agent (`[agents.<role>]`) = sub-thread within the same
    codex app-server. Same vendor, same auth.
  - Cross-vendor agent (just-every/code's `agent_tool.rs` or ralph's
    shell scripts) = spawn a foreign CLI subprocess (claude, copilot,
    gemini). Different vendor, different auth, different cost.
- **Codex agent roles ARE sub-threads on the SAME app-server**, not
  separate codex processes. `apply_role_to_config` (role.rs:40)
  applies the role's config layer to a fresh thread within the
  running app-server. This is why ralph's codex workers should use
  native role spawn (Phase 3d), not `codex-exec.sh`.
- **Cross-vendor workers (claude, copilot) ARE separate processes**
  because they're separate vendors. No way around it absent Phase 7
  Copilot adapter.
- **Don't vendor `agent_tool.rs`** unless you've measured concrete
  pain with the shell-script approach. ~2000 LOC fork debt for
  nice-to-have TUI ergonomics.
- **Multi-agent spawn lives at `multi_agents_v2/spawn.rs`** (the v1
  path also exists at `multi_agents/spawn.rs`). v2 is the live one for
  current sessions.
- **`multi_agents_v2/spawn.rs` schema constraints** (lines 215-232 +
  96-114): `#[serde(deny_unknown_fields)]` (line 215); requires
  `message` + `task_name` (217-218); inter-agent fast path is text-only
  (96-114); rejects `fork_context` (228-232). Don't pass argv / env /
  cwd / structured payloads through spawn args. Encode in
  `developer_instructions` (role TOML) or via shared filesystem under
  `.ralph/jobs/<name>/`.
- **Agent role files require nonblank `developer_instructions`** when
  auto-discovered. Roles need descriptions or get dropped with
  warnings (`agent_roles.rs:346, 360`).
- **`config_file` paths in `[agents.<role>]`** are resolved relative
  to the defining `config.toml`. Plugin install instructions must
  account for this.
- **`AgentRegistry` is internal**, not part of the public agent API.
  Public surface (`pub(crate)`): `AgentControl`, `Mailbox`,
  `MailboxReceiver`, spawn-depth helpers. Don't route plugin scoping
  through `agent_resolver` — it resolves existing references, not
  spawning.
- **`builtins/explorer.toml` is empty (0 bytes).** Only
  `awaiter.toml` demonstrates the role config_file format. And
  awaiter is commented out of the active built-in registry; runtime
  built-ins are `default`, `explorer`, `worker`.
- **6 prompt files in `plugins/ralph/agents/`**
  (`{codex,copilot}-{brainstorm,planner,reviewer}-prompt.md`) are NOT
  codex agent role TOMLs. They're prompt assets for cross-vendor
  shell-script invocations. The 12 actual subagents are different files.
- **Concurrent reviewer fan-out can race in the parent thread.** Three
  reviewers writing to the same parent thread → nondeterministic
  ordering. Use the reviewer fan-out contract (Cross-cutting): children
  produce immutable per-reviewer artifacts, parent owns deterministic
  merge.

### User input + AskUserQuestion

- **AskUserQuestion has 2-4 options per question, NOT 0-N.** Free-form
  input is the auto-added "Other" path. Don't reinvent.
- **`shouldDefer: true` is the critical AskUserQuestion flag** —
  without it the turn doesn't pause and the agent thinks the tool
  returned synchronously.
- **`request_user_input` is plan-mode-scoped, root-thread-only.** Don't
  use it as a general-purpose AskUserQuestion equivalent. It rejects
  non-root agents (`request_user_input.rs:43-47`) and rejects most
  `ModeKind` (`request_user_input_tool_tests.rs:107-130`). The
  `ask_user_question` sibling tool from Phase 2d is the broader
  general-purpose primitive; the two coexist deliberately.

### Transport + lifecycle

- **`wss://` is NOT an app-server listen transport.** Only `stdio://`,
  `unix://`, `ws://`, `off`. `wss://` only outbound to ChatGPT
  remote-control endpoint.
- **Don't bind non-loopback addresses for the app-server.** Refined
  invariant: codex app-server stays loopback; codexu-cli's WS server
  may be exposed via Microsoft devtunnel per the tunnels plan — that
  is an authenticated-tunnel hop, not a non-loopback bind on codex.
- **Per-cwd discovery file is the right reattach mechanism.** codexu's
  `codex-seamless-multi-device.md` Phase 1 sub-task 2 already nails
  this. Don't propose alternatives without concrete reason.
- **App-server lifecycle is not a detail.** Codexu + long ralph jobs
  means process exit, reattach, orphan children, log/session identity
  all need acceptance tests (Phase 4g).

### Tooling quirks

- **Don't fork omx.** Decided 2026-05-02. Take inspiration from skill
  prose only. Existing `oh-my-codex/` checkout is for reference; do
  not commit to it.
- **Ghost snapshots are REMOVED**, not just unverified.
  `GhostSnapshotConfig` is documented "Compatibility-only ... no longer
  produced". If you want them, port from `code-rs/git-tooling`.
- **`core/src/hook_runtime.rs` is singular.** No `hooks*.rs` matches
  the wildcard.
- **Phase 7 spike resolves scope, not just route.** Don't commit to
  Phase 7 work without running the spike first. Outcome bands span
  metadata-only / pre-send routing / full transport adapter — order-of-
  magnitude difference. Picking the wrong path before the spike
  misallocates the work.

## Companion documents

Ordered by Phase-1 relevance:

- `C:/harness-efforts/codexu/docs/plans/codex-seamless-multi-device.md`
  — multi-device session plan; the Phase 1b deliverable here is just
  executing that plan (sub-tasks 1-2 stay; sub-task 3+ refactored per
  the tunnels plan below).
- `C:/harness-efforts/codexu/docs/plans/github-auth-via-vscode-tunnels.md`
  — **load-bearing for Phase 1b sub-task 3+.** Major codexu architecture
  change: replaces codexu's E2E-encrypted relay model with GitHub-OAuth
  identity + Microsoft Dev Tunnels (`devtunnel`) transport +
  codexu-server demoted to a directory service. Phone connects via
  authenticated WS to `*.tunnels.api.visualstudio.com` → tunnel host →
  codexu-cli's local WS server.

  **Intersections with this roadmap:**
  - Codex app-server stays loopback-only (the hard invariant from
    `codex-seamless-multi-device.md`, refined in this roadmap's
    Cross-cutting "Auth" section) — only codexu's relay role moves
    behind a tunnel, NOT the codex backend.
  - codexu-cli becomes both a codex-app-server client (loopback) AND a
    WS server for the phone (exposed via devtunnel).
  - Drops E2E encryption in favor of GitHub-authenticated TLS via
    Microsoft tunnel relay. Strictly weaker but much simpler trust
    model. The cross-cutting "trust model for cross-vendor workers"
    section in this roadmap is about WORKER subprocesses (Anthropic
    key, Copilot OAuth per-CLI) — different axis from the
    codexu↔phone trust model. The codexu↔phone model is covered by the
    tunnels plan; not duplicated here.
  - Backward compatibility: none. Existing pairings/sessions on
    codexu-server intentionally dropped per that plan.

  Treat as the canonical codexu-side architecture going forward; the
  earlier `codex-seamless-multi-device.md` plan describes the
  multi-device UX shape, this one describes the transport shape that
  underpins it post-migration.

- `C:/harness-efforts/codexu/docs/plans/codex-fork-extension-strategy.md`
  — codexu-side strategic doc covering codex integration evolution.
- `C:/harness-efforts/codex/docs/implementation/architecture.md` —
  codex-patched fork architecture overview.
- `C:/harness-efforts/codex/docs/implementation/patch-surface.md` —
  inventory of fork patches vs upstream.
- `C:/harness-efforts/codex/docs/implementation/regression-history.md`
  — release-keyed regression ledger.
- `C:/ai-developer-toolkit/plugins/ralph/CLAUDE.md` — ralph plugin
  documentation; Phase 3 work is bounded by what's in this directory.
- `C:/ai-developer-toolkit/plugins/options-mode/CLAUDE.md` —
  options-mode plugin documentation; collapses into Phase 2d
  AskUserQuestion primitive.
- `C:/harness-efforts/claude-code/worktrees/main/src/tools/AskUserQuestionTool/`
  — Claude's reference implementation; schema borrowed for Phase 2d.

## Execution approach

### Per-story flow

**Small stories** (1a, 1c, 2a, 2b — doc / scaffolding / smoke-test sized):
plan in chat, implement directly, commit. Ralph overhead not worth it.

**Big stories** (2c, 2d, 3a-h, 4): use ralph-orchestration plugin.

```
/brainstorm-with-ralph "<story>"   # if fuzzy
/plan-with-ralph                    # parallel research + multi-model plan
/implement-with-ralph --autonomous  # PRD → ralph loop → review → iterate
```

Each story: plan → PRD → implement → review → next story.

### Bootstrap paradox

Ralph plugin lives in Claude Code today. Phase 3 migrates it to codex.
**Means early stories built USING Claude Code + ralph, the very tool
being deprecated.** Acceptable bootstrap. After Phase 3 ships, dogfood
codex + ralph for remaining work.

### Recommended first-story order

**Pre-work** (no story machinery):
- v5.x doc cleanup (LOC fixes, residual review findings)
- Decision #7 (omx `findProjectRoot` fix disposition — 1 min revert OR
  ~1 hr upstream PR)
- Decision #1 (codex fork strategy)
- Decision #9 (Copilot ToS — defer until Phase 7)

**Stories, in order:**
1. **Phase 1c** — personal codex plugin scaffolding (no blockers,
   smallest concrete deliverable, validates marketplace-add path)
2. **Phase 2a** — verify upstream features end-to-end
3. **Phase 2b** — `.claude/skills` discovery via plugin roots
4. **Phase 1b** — codexu continuation (read against tunnels plan first)
5. **Phase 3a-h** — ralph migration (start ralph autonomy here)
6. **Phase 2c** — plugin scoping (biggest core fork patch)
7. **Phase 2d** — `ask_user_question` (second biggest, blocker on
   spawned-agent attribution design)
8. **Phase 4** — coexistence verification (4a-4m)
9. **Phase 5** — drop Claude Code (with dogfood buffer)

Phase 6, 7 — deferred polish. Phase 7 spike resolves before any
Phase 7 implementation.

### Engine selection per story

- Stories 1-4: Claude Code + ralph (or no ralph for tiny ones).
- Stories 5-9: prefer codex once Phase 3 ships; fall back to Claude
  Code if codex-side ralph blocks on something.

### Pause-points

- After Phase 3a-d: validate codex-only ralph works on a sample story
  before continuing to 3e-h + Phase 2 patches.
- After Phase 4: dogfood the full stack before Phase 5 (Claude Code
  uninstall) — Phase 5a's 2-week buffer enforces this.
- After Phase 7-pre spike: classify outcome before committing to
  branch (a)/(b)/(c)/(d) work.

## Phase ordering + risk profile

Critical path and dependency structure (no time estimates — sequencing
only):

**Critical path:** Phase 1 → Phase 3 → Phase 4 → Phase 5.

**Parallelism:**
- Phase 1a/1b/1c run in parallel.
- Phase 2 (codex divergences) runs in parallel with Phase 3
  (ordering correction from 3-way review: 3a-h do NOT block on 2c
  except for Phase 4d's scoping verification).
- Phase 6 and 7 are deferred polish — not required for the codex-only
  stack to ship.

**Highest-risk phases:**
- **Phase 2c** (plugin scoping) — single-slot cache must become a map
  or filtered-views; many `plugins_for_config` call sites must take
  scope hint; correctness subtle.
- **Phase 2d** (`ask_user_question`) — TUI overlay is 4011 LOC; sibling
  tool is genuinely a clone-and-adapt across 6 layers; spawned-agent
  attribution is a real new event-routing requirement, not a guard
  removal.
- **Phase 3** (ralph + options-mode migration) — behavior parity is
  the cost; ralph has 5+ direct codex-exec.sh invocation surfaces
  with file-based output contracts that don't translate to spawn-tool
  events; options-mode JSONL transcript shape differs from Claude's.
- **Phase 7** (Copilot Claude adapter) — scope is unbounded until the
  spike resolves; could be metadata-only OR a parallel transport
  adapter. Decision #9 (Copilot ToS) gates the work.

**Phase 7 outcome exclusivity:** ONE branch lands per spike, not all
three. (a)/(b)/(c) are mutually exclusive paths.

**Thin-slice option:** Phase 1 + Phase 3a-d (skills + scripts; SKIP
options-mode) ships a usable codex-only ralph without Phase 2c, 2d, or
parity verification. AskUserQuestion + plugin scoping + Claude
adapter become follow-ups.
