# Plan 02 — Continuous watcher with debounce + incremental processing

**Worktree:** `/implement-with-ralph --from-plan` creates the worktree at `D:\harness-efforts\codexu\.ralph\jobs\ralph-pipeline-02-watcher\worktree\` on branch `ralph-pipeline-02-watcher`. All file edits referenced in this plan happen in that worktree; commits land on the branch and are merged to `main` after Phase 6 review converges. Do NOT edit `main` directly.

**Position in DAG:** depends on Plan 01. Optional but recommended early — unblocks live UI updates during the work on Plans 03+.

## Context

Plan 01 ships a one-shot sync that the user runs manually. For a usable daily-dev flow the sidecar needs to track `.ralph/` changes in real time: when `ralph.sh` writes a new `job-state.json`, the dashboard should refresh within seconds without the user running anything. This plan adds a continuous chokidar watcher with debounce + incremental processing, plus an opt-in Vite plugin auto-start so `pnpm overview` keeps the sidecar fresh in one terminal.

The user-stated requirements (verbatim, 2026-05-18):
> "I want an automatic state watcher that will sync the data when the ralph files change, it should probably have a delay period and it should then process the tasks that changed"

Translates to: chokidar watch, debounce window (default 2s), per-slug incremental re-derivation.

## Dependencies

- **Plan 01 (Foundation)** — required. Imports `scripts/lib/derive-ralph-stage.mjs` and `scripts/lib/sync-core.mjs` directly. The watcher must keep the Plan 01 contracts intact: `deriveRalphStage` receives a single bundle with `jobDirMarker`, sync-core owns direct-child walking/cross-kind collapse/nested-member suppression, and all paths come from `loadConfig`.

## Scope

**In scope:**
- New `scripts/lib/watch-ralph-state.mjs` — chokidar-based watcher exposing `{ start, stop, status }`.
- Extension of `scripts/sync-ralph-state.mjs` to accept `--watch [--debounce-ms <N>]` flag.
- Lock file from `config.lockFile` (Plan 01 default: `.ralph/overview-sync.lock`) shared by one-shot and watch modes.
- npm script `sync-ralph-state:watch` in root `package.json`.
- Vite plugin auto-start: extension of `tools/overview-viewer/vite.config.ts` `overviewDataPlugin` to spawn the watcher at `configureServer` time and call its `stop()` on teardown.
- Cold-start full walk before event-driven watching begins.
- Incremental processing — only re-derive state for slugs whose files changed during the debounce window.
- Error resilience — malformed JSON in a watched file logs to stderr but doesn't crash the watcher.
- Watcher tests A–G (see Verification).

**Out of scope (other plans):**
- `.crews/` cross-walk and `CrewSessionRef` updates → Plan 08
- Aggregated snapshot / activity tail / additional emitted files → Plan 05
- UI subscription to sidecar updates via HMR events → Plan 03 (its sidecar-serving Vite plugin extension handles the HMR event emission; this plan just emits the WebSocket event directly when the watcher writes)

## Files

### To create

- **`scripts/lib/watch-ralph-state.mjs`** — exports:
  - `start({ repoRoot, configPath?, debounceMs?, processLabel = 'watcher', onWrite?, onError? }) -> { stop, status }` — non-blocking; spawns chokidar internally; returns immediately. `configPath` is forwarded to `loadConfig` for override-config flows. `processLabel` becomes the `process` field of the JSON lock file (default `'watcher'`; the CLI watch entrypoint passes `'standalone'` and the Vite plugin auto-start passes `'vite-plugin'`).
  - `stop()` — closes the chokidar instance, releases the lock.
  - `status()` — returns `{ running, pendingSlugs: string[], queueDepth: number, lastTickAt?: string }` for debug.
- **`scripts/lib/sync-lock.mjs`** (+ `.d.mts`) — shared lock primitive consumed by both watch mode and the one-shot CLI. Exports `acquireLock({ lockPath, processLabel, staleAfterMs })` which writes a JSON payload `{ pid, process, startedAt }` with the `wx` flag and surfaces the canonical `another sync in progress (pid <N>, process <label>, started <ts>)` diagnostic on contention. EEXIST triggers a PID-liveness probe via `process.kill(pid, 0)`: ESRCH or unparseable JSON past the 60 s staleness window → remove and re-create; EPERM → treat as alive and refuse acquisition. Also exports `releaseLock(handle)` (used in a finally) and `touch(handle)` (used by the watcher heartbeat). Plans 06 / 08 / 11 import this module by name.
- **`scripts/lib/path-utils.mjs`** (+ `.d.mts`) — small helpers extracted during code-review-fix: `compileIgnoredPatterns`, `matchesIgnored`, `resolveHeadShortSha`, `splitPath`. Consumed by `watch-ralph-state.mjs` and shared with `sync-core.mjs` for the chokidar `ignored` callback and HEAD-SHA resolution.
- Tests added under `tools/overview-viewer/src/__tests__/`: `ralphWatcher.test.ts` (debounce, incremental, cold-start, lock collision, heartbeat, error resilience, deletion), `syncLock.test.ts` (acquire / contention / stale-PID / heartbeat), `syncRalphStateCli.test.ts` (CLI `--watch` + one-shot lock-share), plus new cases extending `syncCore.test.ts` for `deriveAffectedTaskUpdate` / `mergeAndWrite`. NOTE: keep these as Node tests, not jsdom — the watcher is server-side.

### To modify

- **`scripts/sync-ralph-state.mjs`** — accept `--watch` flag. When present, after the cold-start one-shot sync, invoke `start({ ...args })` from `scripts/lib/watch-ralph-state.mjs` and block indefinitely (`process.stdin.resume()` or signal handlers). Accept `--debounce-ms <N>` (default 2000, clamp `[500, 30000]`).
- **`scripts/lib/sync-core.mjs`** — expose additional exports needed by the watcher (shipped names; replaces the earlier `deriveOneSlug` draft):
  - `readBundleForSlug({ repoRoot, config, kind, slug })` — direct-child reader for ONE slug + kind, mirroring the parse-error policy and `jobDirMarker` behavior of the full walk.
  - `assembleStateFromBundles({ bundles, repoRoot, config, generatedFromCommit })` — assembles `OverviewRalphState` from a set of bundles using the same match resolution + cross-kind precedence as `walkRalphState`.
  - `deriveAffectedTaskUpdate({ repoRoot, config, kind, slug, currentState, generatedFromCommit })` — per-slug re-derivation entry point used on each debounce flush. Returns the partial `byTaskId` patch to apply, or a deletion marker if the slug is gone.
  - `mergeAndWrite({ repoRoot, config, currentState, updates, generatedFromCommit }) -> Promise<OverviewRalphState>` — merges per-slug updates into the in-memory `byTaskId`, then calls the existing atomic `writeSidecar`. Returns the new state.
- **`tools/overview-viewer/vite.config.ts`** — extend `overviewDataPlugin` (or sibling plugin) at `configureServer`:
  - Dynamic-import `../../scripts/lib/watch-ralph-state.mjs`.
  - Call `start({ debounceMs: 2000, onWrite: () => server.ws.send({ type: 'custom', event: 'overview-ralph-state:update' }) })`.
  - Store the returned handle.
  - In `closeBundle` / `buildEnd` (or `configureServer`'s teardown hook), call `handle.stop()`.
- **`package.json` (root)** — add `"sync-ralph-state:watch": "node scripts/sync-ralph-state.mjs --watch"`.

### Read for reference

- `scripts/lib/derive-ralph-stage.mjs` and `scripts/lib/sync-core.mjs` from Plan 01 — single source of truth, do not duplicate logic.
- `C:\Users\evmitran\.claude\plugins\cache\ai-developer-toolkit\ralph-orchestration\5.30.0\lib\sync_job_statuses.sh` — atomic-update pattern and stale-RUNNING (60-min mtime) detection.
- `tools/overview-viewer/vite.config.ts` existing `overviewDataPlugin` for the chokidar usage pattern.
- `tools/overview-viewer/CLAUDE.md` — HMR mechanism section explains the existing `overview-data:update` event the React app subscribes to. Mirror this pattern with `overview-ralph-state:update` (Plan 03 wires the React-side subscription).

## Watched paths

```
.ralph/jobs/*/job-state.json
.ralph/jobs/*/prd.json
.ralph/jobs/*/code-review-findings.json
.ralph/jobs/*/docs-review-findings.json
.ralph/job-groups/*/group.json
.ralph/job-groups/*/job-state.json
.ralph/brainstorms/*/brainstorm.json
.ralph/brainstorms/*/selected-direction.md
```

Excludes (explicit):

```
.worktrees/**
**/.git/**
.ralph/jobs/*/worktree/**     # per-job worktree git noise
.ralph/jobs/.staging/**       # transient plan-with-ralph staging
.ralph/telemetry/**           # ralph-internal telemetry, not state
```

Use `chokidar`'s `ignored` option (array of glob patterns).

## Implementation strategy

Ordered steps:

1. **Add `readBundleForSlug` + `assembleStateFromBundles` + `deriveAffectedTaskUpdate` + `mergeAndWrite` to `scripts/lib/sync-core.mjs`.** All pure functions. `readBundleForSlug` reads only the files belonging to one (kind, slug) pair; if the directory is gone, the bundle is reported as deleted. `deriveAffectedTaskUpdate` is the per-slug re-derivation entry point used by the watcher on each debounce flush — it returns the partial `byTaskId` patch (or a deletion marker) for the affected task. `mergeAndWrite` takes a current state + the collected updates, applies them (deletion marker removes the entry), and writes both `.js` and `.json` atomically.
2. **Create `scripts/lib/watch-ralph-state.mjs`** with chokidar:
   - On `start`:
     - Acquire the lock via `await acquireLock({ lockPath: config.lockFile, processLabel })` from `scripts/lib/sync-lock.mjs` (see Files » To create). The helper writes JSON metadata `{ pid, process, startedAt }` with the `wx` flag. On `EEXIST` it runs a layered stale-recovery check: parse the existing payload, then `process.kill(pid, 0)` — ESRCH or unparseable JSON past the 60 s `staleAfterMs` window → log "stale lock removed" and overwrite; EPERM (or a live PID within the window) → throw the canonical `another sync in progress (pid <N>, process <label>, started <ts>)` diagnostic. The watcher passes `processLabel = 'watcher'` by default (CLI watch mode overrides to `'standalone'`; Vite plugin uses `'vite-plugin'`).
     - Start a 30 s heartbeat (`HEARTBEAT_MS = 30_000`) that calls `touch(handle)` to refresh the lock-file mtime, so the 60 s staleness window in `sync-lock.mjs` never fires for a live watcher. Plans 06 / 08 / 11 rely on this heartbeat as part of the cross-plan contract.
     - Perform a cold-start full walk via `walkRalphState` from Plan 01. Write sidecar. Set `currentState`.
     - Subscribe to chokidar events. On `add | change | unlink`, parse the path → slug + kind, push to `pendingSlugs: Set<string>`, reset debounce timer.
     - When debounce timer fires: for each slug in `pendingSlugs`, call `deriveAffectedTaskUpdate`. Collect results into a Map. Call `mergeAndWrite`. Clear `pendingSlugs`. Call `onWrite()` callback.
   - On `stop`: clear the heartbeat interval, close chokidar, and `releaseLock(handle)` in a `finally`.
   - On unhandled errors during `deriveAffectedTaskUpdate` or bundle read: log to stderr with slug + reason, retain previous `byTaskId[<taskId>]` entry, continue. Track consecutive failures per slug; after 10, emit `watcher: <slug> failing repeatedly` warning.
3. **Wire CLI `--watch` flag** in `scripts/sync-ralph-state.mjs`. Validate `--debounce-ms` clamp. Handle SIGINT/SIGTERM cleanly (call `stop()` then exit 0).
4. **Add npm script** `sync-ralph-state:watch`.
5. **Vite plugin auto-start** in `tools/overview-viewer/vite.config.ts`:
   - In the existing `overviewDataPlugin` factory (or add a sibling `overviewRalphStatePlugin`), inside `configureServer(server)`:
     ```js
     const repoRoot = resolveRepoRoot()  // existing or new helper
     const watcher = await import(path.resolve(__dirname, '../../scripts/lib/watch-ralph-state.mjs'))
     const handle = watcher.start({
         repoRoot,
         debounceMs: 2000,
         onWrite: () => server.ws.send({ type: 'custom', event: 'overview-ralph-state:update' }),
         onError: (slug, err) => server.config.logger.warn(`[ralph-watcher] ${slug}: ${err.message}`)
     })
     server.httpServer?.on('close', () => handle.stop())
     ```
   - The watcher writes the sidecar AND fires the WebSocket event directly. The React side (Plan 03) subscribes to this event.
6. **Tests:** add the watcher cases under `tools/overview-viewer/src/__tests__/` across the four shipped files (NOT appended to `ralphStage.test.ts`):
   - `ralphWatcher.test.ts` — debounce coalesces multiple events into one write; incremental processing only re-derives changed slugs; cold-start walk runs once before watching begins; heartbeat refreshes the lock mtime; malformed JSON in a watched file → stderr log, watcher stays alive, previous entry retained; `unlink` removes `byTaskId` entry.
   - `syncLock.test.ts` — `acquireLock` happy path; contention surfaces the canonical diagnostic with the live lock's `pid` / `process` / `startedAt`; stale-PID recovery (ESRCH / EPERM / unparseable JSON); `touch(handle)` updates mtime.
   - `syncRalphStateCli.test.ts` — CLI `--watch` flag honoured; one-shot vs. watch lock-share semantics; `--debounce-ms` clamp.
   - extend `syncCore.test.ts` with new cases for `deriveAffectedTaskUpdate` and `mergeAndWrite`.

## Acceptance criteria

- [ ] `scripts/lib/watch-ralph-state.mjs` exports `start({ repoRoot, configPath?, debounceMs?, processLabel = 'watcher', onWrite?, onError? })` returning `{ stop, status }`. `processLabel` is propagated into the JSON lock-file `process` field (`'standalone'` for the CLI watch mode, `'vite-plugin'` for the Vite plugin auto-start, default `'watcher'`).
- [ ] `scripts/lib/sync-core.mjs` exports `readBundleForSlug`, `assembleStateFromBundles`, `deriveAffectedTaskUpdate`, and `mergeAndWrite` in addition to the Plan 01 exports.
- [ ] `pnpm sync-ralph-state:watch` runs continuously and writes the sidecar atomically on file changes.
- [ ] Default debounce is 2000 ms; `--debounce-ms <N>` clamps to `[500, 30000]`.
- [ ] Lock file at `config.lockFile` (default `.ralph/overview-sync.lock`) is managed by `scripts/lib/sync-lock.mjs` with a JSON `{ pid, process, startedAt }` payload. Second instance startup fails fast with the canonical `another sync in progress (pid ..., process ..., started ...)` diagnostic if a live lock exists; stale lock (>60s and ESRCH/unparseable on `process.kill(pid, 0)`) is overwritten with a warning.
- [ ] Lock-file mtime is refreshed every ~30 s (`HEARTBEAT_MS = 30_000`) via `touch(handle)` from `sync-lock.mjs`, so the 60 s staleness window never triggers for a live watcher. This heartbeat is the cross-plan contract relied on by Plans 06 / 08 / 11 and recorded in `plans/ralph-pipeline-INDEX.md`.
- [ ] `pnpm overview` auto-starts the watcher (verifiable: kill `pnpm overview`, run again, the lock file appears within ~5s).
- [ ] All Plan 01 acceptance criteria continue to pass (one-shot mode unchanged).
- [ ] Tests for debounce / incremental / cold-start / lock / error-resilience pass.
- [ ] On chokidar event for a deleted file (`unlink`), the affected slug is removed from `byTaskId` in the next debounced write.

- [ ] **Refresh downstream plans + INDEX.** After all other criteria pass, audit (a) the plans listed in this plan's "Hand-off to next plans" section and (b) `plans/ralph-pipeline-INDEX.md`'s "Source-of-truth modules" table and DAG diagram. Update any stale references — file paths, type signatures, function/export names, behavior contracts, module dependencies — that diverged from this plan's actual implementation. Apply updates atomically in the final implementation commit; in the commit message, list each diff (which file, which lines, what changed) so reviewers can verify the cascade.

## Verification

A. **Cold-start walk:** `pnpm sync-ralph-state:watch` runs once → cold-start walk → write sidecar → start watching. `cat plans/overview-ralph-state.json | jq '.generatedAt'` matches startup time.

B. **Debounce behavior:** in another terminal, `touch .ralph/jobs/<test>/job-state.json` three times within 1 second. Confirm `plans/overview-ralph-state.js` mtime updates exactly once ~2 seconds later. `cat plans/overview-ralph-state.json | jq '.generatedAt'` updated once.

C. **Incremental processing:** modify `.ralph/jobs/<test>/job-state.json` (change `status`). Confirm only that task's `byTaskId[<taskId>]` entry changes; `diff <sidecar before> <sidecar after>` shows only the one task's section diffing (plus `generatedAt`).

D. **Lock contention:** with watcher running, `pnpm sync-ralph-state` (one-shot) in another terminal. One-shot exits non-zero with "another sync in progress" message OR succeeds (if lock acquired between watcher ticks). No corruption either way.

E. **Vite auto-start:** stop the standalone watcher; `pnpm overview`. Open dev tools, confirm a WebSocket message `overview-ralph-state:update` arrives within seconds of a `.ralph/` file touch. `window.OVERVIEW_RALPH_STATE.generatedAt` updates in the browser without reload (after Plan 03 wires the React side; for Plan 02 alone, verify via the WebSocket frames in dev tools).

F. **Concurrent watcher rejection:** `pnpm overview` running (Vite plugin auto-started watcher) + `pnpm sync-ralph-state:watch` in another terminal. Second instance exits with "another watcher holds lock" within ~5 s.

G. **Error resilience:** with watcher running, `echo "not json" > .ralph/jobs/<test>/job-state.json`. Watcher logs stderr but stays alive. Restore valid JSON; watcher recovers within debounce window. Repeating 10 times triggers the "failing repeatedly" warning.

H. **Deletion handling:** `rm -rf .ralph/jobs/<test>/`. After debounce window, `byTaskId[<taskId>]` is gone from the sidecar (assuming `<test>` was the slug for that task id).

## Common mistakes / confusion points

1. **Don't re-implement the stage predicate.** Import `deriveRalphStage` from `scripts/lib/derive-ralph-stage.mjs` — never inline a duplicate. The single-source-of-truth rule from Plan 01 carries forward.
2. **Watcher write is atomic-or-nothing.** Always tmp + rename for BOTH `.js` and `.json`. A torn write to either crashes consumers.
3. **The watcher emits the HMR event directly when it writes.** Don't also configure the Vite plugin to watch `plans/overview-ralph-state.js` itself for changes — that would double-tick (watcher writes → Vite picks up → fires event again). The watcher → `onWrite` callback → `server.ws.send` is the only event path.
4. **Lock release flows through `releaseLock(handle)` in a `finally`.** Do NOT inline `fs.openSync(path, 'wx')` + `fs.unlinkSync(path)` — the canonical primitive lives in `scripts/lib/sync-lock.mjs` and writes JSON metadata `{ pid, process, startedAt }`, not a 0-byte sentinel. Recovery from a crash relies on the layered stale check (60 s mtime threshold combined with a `process.kill(pid, 0)` liveness probe): ESRCH or unparseable JSON past the window removes the lock; EPERM treats it as still alive. Design the happy path to release reliably via `releaseLock`, and run the 30 s `touch(handle)` heartbeat so a live watcher's lock never falls into the stale window.
5. **`chokidar.watch()` with `awaitWriteFinish: true`** is essential — Ralph's tmp+rename pattern means a file may briefly look incomplete. Chokidar's `awaitWriteFinish` debounces individual file events until the file stabilizes, eliminating spurious "torn read" errors.
6. **Don't watch `.crews/`** in this plan. Plan 08 adds the `.crews/` cross-walk. Adding it here without the rest of Plan 08's protocol creates entries that have nowhere to go.
7. **`unlink` event must remove the entry from `byTaskId`**, not retain a stale copy. Confirm via Verification step H.

## Hand-off to next plans

After this plan ships:

- **Plan 03 — UI chip** can subscribe to the `overview-ralph-state:update` HMR event. The watcher is the event source.
- **Plan 05 — Agent exports** extends `scripts/lib/sync-core.mjs` further (snapshot generation, activity log, etc.). The watcher's `mergeAndWrite` will need to invoke those additional emitters when 05 ships — keep `mergeAndWrite` factored so it's easy to add downstream emitters.
- **Plan 08 — Crews** adds `.crews/` to the watched paths and adds subcommand modes (`--update-crew-session`, `--finalize-crew-session`) to `scripts/sync-ralph-state.mjs`. Plan 08's protocol shares the lock file.

The first commit after this plan ships should verify `pnpm overview` works end-to-end (auto-start watcher + dev server in one terminal).
