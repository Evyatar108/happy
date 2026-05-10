# Fork roadmap

Deferred work for the personal [Evyatar108/happy](https://github.com/Evyatar108/happy) fork, roughly in priority order. Shipped items live in `docs/fork-notes.md`; this file is the backlog.

Ranking is by **e-ink tablet quality-of-life** (the fork's primary target), then by effort. An item marked *(optional)* means "ship as a user-facing toggle, not as default behaviour."

## Near-term

### Upcoming — Upstream merge batch (2026-04-22)

**What:** Cherry-pick ~10 curated open PRs from `slopus/happy` into the fork's `main` as a single integration batch. Mix of zero-risk correctness fixes and CLI bug fixes, saved from the 2026-04-22 triage pass.

**Plan:** [`docs/plans/upstream-merge-batch-2026-04-22.md`](plans/upstream-merge-batch-2026-04-22.md) — full per-PR breakdown, execution order, verification gates, rollback plan.

**Headline PRs:** #1061 (filter isMeta — pairs with our #779 fix so plugin skill bodies no longer flood chats), #1145 (reducer text-loss), #633 (tool_result schema crash), #1101 (base64 stack overflow), #1049 (change_title persist), #1157 (permission mode mapping).

**Risk spot:** #690 touches the `--settings` flag path that our #779 fix owns — plan saves it for last with an explicit 30-min abort criterion.

**Complexity:** 1.5–3 hours interactive, partially delegable to a general-purpose agent per PR.

---

### Interactive `/plugin`, `/mcp` (+ partial `/agents`, `/skills`, `/memory`) via the remote session

**What:** Today's intercepted slash commands (`usePreSendCommand.ts` → session-scoped catalog screens) are mostly read-only catalog routers — they show lists/info harvested from SDK init metadata. The one mutating intercept today is `/rename`, which writes `metadata.summary.text` via `sessionUpdateMetadata` (`packages/happy-app/sources/sync/ops.ts`). Claude Code's real `/plugin` and `/mcp` TUIs are interactive (install, uninstall, enable/disable, browse marketplaces, add servers, etc.); the fork can't do any of that from mobile.

**Key finding (2026-04-23):** The slash commands themselves are TUI-only and refuse to run in `--print` / SDK non-interactive mode (`/plugin isn't available in this environment`). BUT Claude Code exposes fully non-interactive equivalents as **CLI subcommands** — no TUI round-trip needed, no slash-command plumbing. This drops the estimate from multi-day to ~1 day for the two high-value commands.

**Coverage by command:**

| Command | Non-interactive CLI path | What the app can expose |
|---|---|---|
| `/plugin` | `claude plugin install/enable/disable/uninstall/list/update/validate/marketplace` | **Full CRUD** |
| `/mcp` | `claude mcp add/add-json/add-from-claude-desktop/get/…` | **Full CRUD** |
| `/agents` | `claude agents` (list only) | Read-only (already covered); create/edit = file ops on `.claude/agents/*.md` |
| `/skills` | none | File ops on `.claude/skills/<name>/SKILL.md` (or plugin-bundled skills) |
| `/memory` | none | Edit `CLAUDE.md` at user/project/local scope |
| `/model` | none | Keep as "run in terminal" hint |
| `/help` | `claude --help` | Not really a catalog — leave as hint |

**Proposed architecture (shell-out, not TUI round-trip):**
- **CLI side:** one new RPC handler `runClaudeSubcommand({ args: string[] })` that `execFile`s `claude` with the requested args, streams stdout/stderr back, returns exit code. Reuse `cross-spawn` (already a dep). Strict arg allowlist — only pass-through `plugin <verb> <args>` and `mcp <verb> <args>`; no arbitrary exec.
- **Wire side:** one new RPC shape in `packages/happy-wire/` for the request/response pair.
- **App side:** on the existing Plugins/MCP catalog screens, add action rows (enable/disable toggles, Install button with a text input, Uninstall confirm). Bind to the RPC via `useHappyAction` for error handling. On success, trigger a metadata refresh (SDK shadow session fires again on the CLI side, or server pushes new init metadata via the session).
- **Refresh after mutation:** the CLI should re-run `queryInitMetadata` after a mutating subcommand so the catalog reflects the new state without waiting for the next session start. This is the one piece that isn't free.
- **Security note:** `claude plugin install` downloads + executes plugin code on the CLI host. The RPC must be gated the same way session RPCs are today (session auth check); no privilege escalation beyond what the user already has in their local `claude`.

**Tiers to pick from:**
- **(a) Plugin enable/disable toggles only** — tiny slice, 2–3 hrs. Uses `claude plugin enable/disable`. No install UI, no marketplace browsing. Proves out the RPC pattern.
- **(b) Plugin full CRUD + MCP full CRUD** — ~1 day. Install input field, Uninstall confirm, list refresh, MCP add flow. The natural stopping point for "interactive parity on the things that benefit most from mobile".
- **(c) + agents/skills/memory file-edit UIs** — +1–2 days. A small file editor per catalog backed by existing CLI file access. Less leverage since these already work via any editor; mobile becomes the only reason to build it.

**Relevant files:**
- `packages/happy-app/sources/sync/slashCommandIntercept.ts` — keep `/plugin` and `/mcp` intercepts, but the target catalog screens now do more than read
- `packages/happy-app/sources/app/(app)/session/[id]/{plugins,agents}.tsx` + new `mcp.tsx` — extend with action rows; MCP screen is new (there's no `/mcp` catalog today)
- `packages/happy-cli/src/claude/claudeRemote.ts` — RPC registration site
- `packages/happy-cli/src/api/apiSession.ts` — RPC handler manager pattern
- `packages/happy-cli/src/claude/utils/queryInitMetadata.ts` — re-run after mutations to refresh catalog state
- `packages/happy-wire/` — new RPC shape
- Security reference: `packages/happy-cli/src/claude/mcp/startPermissionServer.ts` — existing session-auth gate pattern

**Complexity:** medium. (a) ~3hrs. (b) ~1 day. (c) +1–2 days. Do (a) first as a de-risker, then decide (b) based on how the RPC + refresh UX feels.

---

### 5. Hardware page-turn key support

**What:** Capture Android `KeyboardEvent` for `DPAD_UP`/`DPAD_DOWN` (and optionally volume keys) in `ChatList`. Scroll by ~90% of viewport height per press. Opt-in toggle.

**Why:** Most e-ink tablets (Boox, Onyx, Bigme) have physical page buttons; wiring them to scroll-by-viewport is the single most "this tablet actually makes sense for Happy" moment.

**Complexity:** small (~half a day), assuming DPAD events pass through the RN event system. Volume keys often get intercepted at the OS level; doc that limitation.

**Pairs with the shipped page-turn mode (item 4):** when paginated mode is on, these keys should cause a page flip instead of a scroll-offset change.

---

## Further out (mentioned in brainstorm, not planned yet)

- **Stream throttle / "quiet mode"** during agent streaming — coalesce token-by-token updates into 1–2 Hz redraws on e-ink. Biggest latent e-ink win but touches the message reducer, not just presentation. *Flagged for promotion to Near-term by the 2026-04-24 multi-model brainstorm (Claude × 2 + Codex + Copilot); two reviewers independently argued it outweighs cold-open latency on felt impact during active sessions.*
- **E-ink display profile** (single switch bundling: no animations, Skia fallbacks for `VoiceBars`/`ShimmerView`/`AvatarSkia`, monochrome theme, `animationEnabled: false` on navigation). Builds on top of the above.
- **"Collapse noise" defaults** — default-collapse tool-call views, default-hide thinking, cap long bash output.

---

## Shipped (see `docs/fork-notes.md` for details)

### 2026-05-10 — P1 tool rendering sweep: TaskOutput / TaskStop / Edit / MultiEdit / CodexPatch

Four broken tool renderers in the Happy app session transcript stopped producing misleading bubbles, plus a CodexPatchView shape extension so Codex 0.107 traces render. Delivered as 16 commits on `ralph/fix-p1-tool-rendering-bugs` merged to local `main` as `1ebe3244` (`--no-ff`); job directory at `.ralph/jobs/fix-p1-tool-rendering-bugs/` carries the plan, DSAT, per-story artifacts, and code/docs review findings.

1. **Edit & MultiEdit diff labels resolve to real paths** (US-001, US-002, commits `7ed2d55f`, `9dbbae87`) — `EditView`, `EditViewFull`, `MultiEditView`, `MultiEditViewFull` now compute `resolvePath(parsed.data.file_path ?? '', metadata)` inside the `parsed.success === true` narrowing and thread `fileName` into `ToolDiffView`. Diffs no longer fall back to the generic `file.txt` label. Metadata also threads through `<ToolFullView />` in `app/(app)/session/[id]/message/[messageId].tsx` so full views agree with compact.
2. **Visible parse-error block for Edit / MultiEdit** (US-003, commit `e7dfb80b`) — Zod parse failures now render a `ToolError` block and emit `[<Tool>] Zod parse failed: <issue>` via shared `parseFailure.ts` helper instead of silently rendering an empty diff shell.
3. **TaskOutput / TaskStop result shape captured** (US-004a, commit `7276a1ad`) — discovery story recorded the real `tool.result` payload shapes from a live Claude SDK background-task round-trip; canonical-field list (`task_id`, `status`, `output`, `result`) confirmed.
4. **TaskOutputView + TaskStopView shipped** (US-004, US-005, commits `9db1b7b0`, `543e94fe`) — `knownTools.tsx` registers both with `minimal: false`, function-form titles (`Task Output · <task_id>`, `Stop Task · <task_id>`), permissive `result: z.object(...).partial().passthrough()` schemas, and `hideDefaultError: true`. New views implement the 5-priority result-rendering ladder (`running` → schema-match → string → object-mismatch JSON-stringify → null/undefined parse-error) per the plan's TaskOutput / TaskStop result contract. Bubble is never invisible.
5. **CodexPatchView accepts real Codex `FileChange` flat tagged union** (US-006, commit `c18d6a89`) — `change.type === 'update' | 'add' | 'delete'` with sibling `unified_diff` / `content` / `move_path` now routes through the existing patch / empty-pair helpers; legacy wrapper branches (`change.diff`, `change.modify.{old,new}_content`, `change.add.content`, `change.delete.content`, `change.kind.*`) preserved. Schema additive.
6. **Vitest component tests** (US-007, commit `9488d3d8`) — 5 new test files (`EditView.test.tsx`, `MultiEditView.test.tsx`, `TaskOutputView.test.tsx`, `TaskStopView.test.tsx`, `CodexPatchView.test.tsx`) + shared `toolViewTestUtils.tsx`. `TaskOutputView` / `TaskStopView` cover all five priority branches; `CodexPatchView` covers each `FileChange` variant plus a legacy-wrapper variant. 83 files / 817 tests pass.
7. **Deterministic `/dev/tools2` fixtures** (US-008a, commit `3e713a44`) — 17 P1 fixtures under a new `ItemGroup title="P1 Bug Fixes"` section. Metadata-bearing fixtures pass `pathFixtureMetadata = { path: '/Users/steve/project', host: 'devbox' }` so `resolvePath(...)` actually shortens absolute paths; one fixture deliberately passes `metadata={null}` so the un-resolved fallback is also visible. Source of truth for AC #9 manual repro.
8. **Docs updated** (US-008, commit `919a60dc`) — `docs/plans/p1-bug-investigations.md` rewritten "P1 tool rendering sweep — FIXED" section; self-contained, no link to gitignored `.ralph/`. `docs/experimental/roadmap.md` lines 109-113 annotated `Status: shipped 2026-05-10`.
9. **Phase 5a 3-way code review fixes** (commits `d2a50695`, `70556573`, `bbb191bb`, `d6c966ac`, `454031b2`): five consensus Medium/Low findings. (a) F-001 — TaskOutput's nested `task.result` schema relaxed from `z.string()` to `z.unknown()` so structured task results don't trigger noisy JSON fallback. (b) F-002 — `getTaskStopOutcome` now maps `status: 'completed'` / `'success'` to `Stopped` before raw-string fall-through. (c) F-003 — `hasCanonicalTaskOutputField` narrowed to fields the renderer actually displays (dropped `task_type` / `description` / `prompt`). (d) F-004 — stale block comment in `knownTools.tsx` corrected. (e) F-005 — `tools.edit.parseError` / `tools.multiEdit.parseError` i18n keys added to `_default.ts` + all 10 locales; `parseFailure.ts` accepts a `userMessage` arg so the visible block uses the i18n string while console.warn keeps the technical Zod issue summary.
10. **Phase 5b docs review fix** (commit `bcd13122`): `docs/experimental/roadmap.md` P1 bullets carried the doc's own `Status: shipped 2026-05-10 — see docs/plans/p1-bug-investigations.md "P1 tool rendering sweep — FIXED"` annotation.

**Manual on-device verification:** `pnpm --filter happy-app web` → `/dev/tools2` via `agent-browser`. All 17 P1 markers rendered; 11 diff containers present; shortened metadata paths and raw absolute fallback both verified; no page errors; only expected `console.warn` from the deliberate object-mismatch / null branches.

### 2026-04-29 — Socket-pushed older-page prefetch (`session-message-range`) behind `enableSocketRangeFetch` flag

Scrolling back through a session no longer blocks on a single HTTP `loadOlder()` round-trip. With the new "Stream Older Messages" toggle on (Settings → Appearance), viewport ticks emit `session-message-range` request/response pairs over the existing socket.io connection so the next chunk lands **before** the user reaches the older edge. Drop-in replacement for `sync.loadOlder()` — no eviction. Cold-start `GET /v3/sessions/:id/messages` and live `new-message` push are untouched. Bounded plaintext memory (the original D-006 promise) is explicitly out of scope and tracked under `docs/plans/streaming-pagination.md ## Open Questions`. Delivered as 10 commits on `ralph/streaming-pagination` merged to local `main` as `a639af83` (`--no-ff`); job directory at `.ralph/jobs/streaming-pagination/` carries the plan, DSAT, per-story artifacts, and the 3-way (Claude + Codex + Copilot) code-review findings.

1. **Pure window math + prefetch-trigger module** (US-001, commit `c074a781`) — `packages/happy-app/sources/sync/messageWindow.ts` exports `computeRenderWindow({ visibleSeqs })`, `shouldPrefetchOlder(...)`, `computePrefetchOlderRange(...)`. Pending sentinel-seq messages (`DEFAULT_UNSEQUENCED_MESSAGE_SEQ`) are filtered out of every input — mirrors `ChatList.boundaryItems.ts:59`'s `isConfirmed` check.
2. **Wire schemas for `session-message-range`** (US-002, commit `98241f61`) — `SessionMessageRangeRequestSchema` (5 required integer-validated fields, refined `toSeq >= fromSeq`) and `SessionMessageRangeResponseSchema` as `z.discriminatedUnion('ok', [success, error])` with the 4-code error enum. `dist/index.{cjs,mjs,d.cts,d.mts}` regenerated and tracked.
3. **Storage shape + reducer-survival gate** (US-003, commit `000513eb`) — `SessionMessages` extended with `renderWindow: { firstSeq, lastSeq } | null` (required, null is the only valid initializer) and `activePrefetch?: { requestId, generation, direction, targetSeq, issuedAt }`. Four new actions (`setRenderWindow`, `setActivePrefetch`, `applyPrefetchedRange`, `clearActivePrefetch`) with requestId+generation guards. New `applyPrefetchedRange.ts` module hosts `mergeOlderMessagesIntoSession`, `computeNextOldestLoadedSeq`, `applyPrefetchedRangeToSession`; existing `applyOlderMessages` refactored to call the same helper for byte-equivalent reducer state. agentState-merge branch carries `renderWindow` and `activePrefetch` through field-by-field rewrite.
4. **Server `session-message-range` handler** (US-004, commit `b6dc9ebf`) — `packages/happy-server/sources/app/api/socket/sessionMessageRangeHandler.ts` with account-scoped `findFirst({ id, accountId })` (no global-by-id lookup; wrong-owner and never-existed both collapse to byte-identical `session_not_found` — info-disclosure guard, asserted by spy). Returns encrypted blobs as-is. `take: limit + 1` pattern, empty-result short-circuit. 9 tests.
5. **Client transport + per-session prefetch manager** (US-005, commit `3b147f04`) — `apiSocket.requestSessionMessageRange(...)` via `emitWithAck`. `prefetchManager.ts` keys in-flight by `(sessionId, generation)`; transport + decrypt run **outside** any per-session lock; only the final `storage.applyPrefetchedRange` commit runs inside the existing AsyncLock. Per-request terminal `Promise<void>` resolves after exactly ONE of: in-lock commit, closure-mismatch staleness discard, synchronous bail (the awaited-commit contract — Plan AC #16, addresses auto-skipped F-038). Failure-clear contract: `clearActivePrefetch` exactly once per non-commit terminal exit. Reconnect bumps generations and abandons in-flight (sweep + settle). 16 spec cases.
6. **Feature flag + Settings → Appearance toggle + `sync.reportRenderWindow` bridge + ChatList wiring** (US-006, commit `2aa563aa`) — largest story, 21 files. `enableSocketRangeFetch` lives in `LocalSettingsSchema` only (NOT in synced `SettingsSchema`); shipped default `false`, flipped to `true` on 2026-04-29 after BOOX verification. Toggle "Stream Older Messages" added to Appearance with i18n in `_default.ts` + all 10 translation files. New `sync.reportRenderWindow(sessionId, visibleSeqs)` is the **only** writer of concrete `renderWindow` values from the viewport path AND the **only** caller of `prefetchManager.requestSessionMessageRange` from the viewport path; flag-off and null-window short-circuits. New `sync.onActiveSessionChanged(sessionId)` is the **only** entrypoint that resets `renderWindow` and bumps the previous session's generation — distinct from `sync.onSessionVisible` (the F-046 regression guard). Flag-on `sync.loadOlder()` awaits the manager's terminal `Promise<void>` before resolving. ChatList adapter filters `ViewToken[]` to message-kind seqs only; ChatList does not import `messageWindow.ts` or `prefetchManager.ts`. 22 new tests + 127/127 regression.
7. **Page-turn-mode debounce** (US-007, commit `3b1d481e`) — test-only change; debounce was already in US-005's in-memory `inFlight` Map via the synchronous bail. Two new fixtures in `ChatList.pageTurn.test.ts` prove "exactly one request per page-turn" and "rate-limited, not unbounded mute".
8. **Documentation** (US-008, commit `e9101e63`) — new `docs/plans/streaming-pagination.md` covering Overview / Protocol (pinned schemas, `hasMore` semantics, empty-result invariant, ownership policy) / Reconnect Contract / Feature Flag / Rollout / Open Questions. Appended `## See also` to `docs/plans/reliable-http-messages-api.md` linking to the new doc and noting SSE (D-005) was considered and not chosen. Appended `## Socket-prefetch pagination invariants` to `packages/happy-app/CLAUDE.md` covering the three-extent rule, pending-message exclusion, and the explicit "this plan does NOT bound plaintext memory" note.

**Phase 5a 3-way code review fixes** (commit `40f56f43`): two consensus High findings + one Medium. (a) Server `hasMore` was `rows.length > limit` against a `[fromSeq, toSeq]` window the client always sized at most `limit` wide — `hasMore` was always `false` for full pages, terminating pagination after one page. The handler test had baked the wrong contract. Fixed with a `findFirst({ seq: { lt: fromSeq } })` probe; corrected fixtures (dense / `fromSeq=0` / no-older / older-exists-below-fromSeq). (b) `prefetchManager.onReconnected()` only bumped generations and cleared the in-memory `inFlight` map — never called `storage.clearActivePrefetch(...)` or settled the terminal Promises. Post-reconnect, `activePrefetch` stayed set permanently and `sync.loadOlder()` could hang on orphaned promises. Fixed by snapshotting `inFlight` on reconnect, sweeping `clearActivePrefetch` per session, firing `abandon-on-reconnect` terminal events, AND `prefetchPendingPromises.clear()` in `sync.ts`'s reconnect bridge. (c) Defensive `messages: [] && hasMore: true` short-circuit added in `applyPrefetchedRangeToSession` so a buggy server response can't put the client into an infinite-retry loop.

**Default flipped to on + post-default-flip 3-way re-review** (commits `ae0136b4` + `d59ea517`): after manual BOOX verification the `enableSocketRangeFetch` default was flipped from `false` to `true`. The post-flip 3-way re-review (Codex + Copilot independent passes) caught one High and one Medium that the original `40f56f43` round had missed: the reconnect cleanup pattern was not applied to the two analogous abandon-in-flight paths — `sync.onActiveSessionChanged`'s previous-session cleanup (Codex #1, High) and the `delete-session` handler (Copilot #1, Medium). Both went through the lightweight `bumpGeneration` (manager-side) and skipped `prefetchPendingPromises` cleanup (sync-side). Same failure mode as the original reconnect leak — stale `activePrefetch` permanently gating `shouldPrefetchOlder` and orphaned `prefetchPendingPromises` entries that flag-on `loadOlder()` would await indefinitely. With default-on this surfaces on every session switch. Fixed in `d59ea517` by adding `PrefetchManager.abandonInFlight(sessionId)` (full cleanup: bump generation + `clearActivePrefetch` + settle terminal Promise + fire new `abandon-on-cleanup` terminal kind) and routing both call sites through it. `bumpGeneration` kept for direction-reversal inside `requestSessionMessageRange`. New spec cases `(d-leak-session-cleanup)` + `(d-leak-no-inflight)` mirror the existing reconnect leak test. Full happy-app suite 709/709 (was 707; +2). The Reconnect / Cleanup Contract table in `docs/plans/streaming-pagination.md` covers all three abandon paths.

**Manual on-device verification (BOOX e-ink tablet):** in-session against a side-by-side test server on `:3006` with a snapshot of the live `:3005` HappyServer service's pglite + matching `HANDY_MASTER_SECRET` so existing auth tokens validated without re-pairing. See `.agents/skills/happy-tablet-iterate/SKILL.md ## Side-by-side test server` for the full pattern (this rollout extended the skill with the MMKV-precedence note and the token-reuse-via-pglite-snapshot recipe). Toggle confirmed flippable; with the flag on, post-toggle scrolls produced zero `/v3/sessions/.../messages?limit=80` HTTP loadOlder calls (the new socket path took over). Cold-start `limit=100` HTTP fetches still run on session open as designed.

### 2026-04-28 — Permission mode preservation across local→remote message-send and resume (Layer 1)

Running `claude --dangerously-skip-permissions` (or `--permission-mode bypassPermissions`) locally and then sending a message — or resuming the session — from the Happy mobile app no longer silently destroys the CLI's mode. The bug was structural: the app always emitted `permissionMode` in `meta` (defaulting to `'default'`) even when the user had not toggled the picker, and the CLI overwrote its in-memory mode whenever the field was present. Layer 1 ships the preservation half (3 coordinated changes); Layer 2 (Claude `setPermissionMode` RPC for picker without a message) is deferred. Delivered as 15 commits on `ralph/preserve-permission-mode-layer1` merged to local `main` as `ed78179d` (`--no-ff`); job directory at `.ralph/jobs/preserve-permission-mode-layer1/` carries the plan, DSAT, per-story artifacts, and code/docs review findings.

1. **CLI publishes effective `currentPermissionModeCode` in session metadata** via the new `publishPermissionModeIfChanged(...)` helper in `packages/happy-cli/src/utils/publishPermissionMode.ts` (US-001, commit `c5c76393`). Optimistic ref + in-place metadata mutation **before** the awaited `updateMetadata` is load-bearing — it gives concurrency correctness AND keeps `setupOfflineReconnection`'s reconnect path seeded with the live mode. Helper accepts `string | undefined` so callers can publish a "cleared" / no-opinion state (review F-002 widening).
2. **Claude runner publishes initial seed + on-change** through the helper (US-002, commit `3daa94f1`). Initial seed lands in the `metadata` object passed to `getOrCreateSession`; later changes go through `publishPermissionModeIfChanged`. Reconnect-regression covered by `setupOfflineReconnection.permissionMode.test.ts`.
3. **Codex runner publishes on-change + sandbox-forced `'yolo'` initial seed** when `client.sandboxEnabled === true` (US-003, commit `5c9e0b70`). Seed runs once after `client.connect()`.
4. **Static wiring guard test for both runners** (US-004, commit `8e62698b`) — `publishPermissionModeWiring.test.ts` reads runner sources as text and asserts via regex, so the wiring survives runner-test thinning.
5. **App schema + Session state + persistence with hydration** (US-005, commit `cf66e0ed`). New `permissionModeUserChosen: boolean` (own MMKV namespace `session-permission-mode-user-chosen`, decoupled from `session-permission-modes` so an explicit `'default'` pick is recordable). Five `updateSessionPermissionMode` callsites pass the right `userChosen` value; `EnterPlanMode` and `ExitPlanMode` auto-mutations explicitly reset to `false` in both memory and disk (machine-derived).
6. **App gates `permissionMode` in `messageMeta` + `sync`, with UI-key allowlist filter** (US-006, commit `fd29a046`). `WIRE_PERMISSION_MODES` allowlist; conditional spread in `sync.ts`. UI-only keys (`dontAsk`, `auto_edit`) are filtered from outbound meta. Sandbox-forced `bypassPermissions` always wins over user-chosen UI-only keys (review F-001 fix to the sandbox+UI-only-key drop).
7. **Picker resolver helper + SessionView wiring + info-sheet parity + EnterPlanMode persistence** (US-007, commit `374fb775`). Picker chip and info sheet share `resolvePermissionModeForPicker`: `permissionModeUserChosen ? session.permissionMode : (metadata.currentPermissionModeCode ?? metadata.dangerouslySkipPermissions ? 'bypassPermissions' : default)`. The Claude-only `dangerouslySkipPermissions` legacy fallback is by design (Codex has no equivalent flag).
8. **Documentation** (US-008, commit `b2ae6207` + 5 docs-review fixes). `packages/happy-cli/CLAUDE.md` Permission Mode Protocol subsection, `packages/happy-app/CLAUDE.md` Permission Picker Init Order subsection, and substantial rewrites to `docs/permission-resolution.md` covering the new CLI→app metadata channel, picker resolution chain, the `permissionModeUserChosen` flag, and the absent-`meta.permissionMode` preservation branch.

**Layer 1.5 follow-up** (logged from Phase 6 Step 0b synthesis-drop, not in this merge): `messageMeta.ts` keys its sandbox-forced `bypassPermissions` branch off the **configured** `metadata.sandbox.enabled`, not whether Codex actually enabled sandboxing. On Windows or after sandbox-init failure (`codexAppServerClient.ts:397-408`), the app still sends `bypassPermissions`; the CLI accepts it as an explicit override; `resolveCodexExecutionPolicy()` maps `bypassPermissions` to `danger-full-access`. Net: silent privilege escalation pathway on first app message in unsandboxed Codex sessions. Also: sandboxed Codex picker/info-sheet falls off `'yolo'` after first send because `resolvePermissionModeForPicker` cannot map `'bypassPermissions'` → display key for Codex. Fix: gate the app-side `bypassPermissions` force on actual runtime sandbox state rather than configured intent.

### 2026-04-27 — Expandable file-content preview for Write/Edit/MultiEdit tool views

Write, Edit, and MultiEdit tool bubbles now collapse their diff preview to 10 visible lines by default with an e-ink-safe Show / Hide toggle. Built around a shared `useDiffHunks` hook so the collapsed and expanded views share one memoized hunk list — single-pass diff confirmed by Vitest spies. Delivered as 10 commits on `ralph/expandable-diff-preview` merged to local `main` as `c8c0eca2` (`--no-ff`); job directory at `.ralph/jobs/expandable-diff-preview/` carries the plan, DSAT, per-story artifacts, and code/docs review findings.

1. **`useDiffHunks(oldText, newText, contextLines?)` hook** in `packages/happy-app/sources/components/diff/` (commit `0fec2341`). Memoized on `[oldText, newText, contextLines]`; default contextLines `3` matches the original `DiffView`.
2. **`DiffView` + `ToolDiffView` pass-through props.** Both accept optional `hunks?` and `maxVisibleLines?` props that bypass internal hunk computation when a precomputed list is supplied (commits `5dd6ce9e`, `772f5aca`). `DiffView` also suppresses its hunk header when the entire hunk falls outside the visible-line budget.
3. **`CollapsibleDiffPreview` wrapper component + Vitest unit test** (commit `c714a835`). Renders the hunk-truncated `ToolDiffView` inside a Pressable header showing `Show N more lines` / `Hide`.
4. **Two new i18n keys** (`tools.diff.showMore` with `count` plural, `tools.diff.collapse`) added to `_default.ts` + all 10 translation files (commit `3c7a9a5b`). Slavic locales (`ru`, `pl`) use the 3-form `plural({ count, one, few, many })` pattern.
5. **`WriteView`, `EditView`, `MultiEditView` wired** to render their diff inside `CollapsibleDiffPreview` with `collapsedLines={10}` (commits `2cfe488f`, `8dd494b4`, `2bf2a86e`). Existing `showLineNumbersInToolViews` / `showPlusMinusSymbols` behavior preserved; MultiEditView's outer horizontal `ScrollView` left unchanged.
6. **Two code-review fixes (round 1):** F-001 (consensus Medium, claude+codex+copilot) removed an unnecessary `(t as unknown as DiffTranslation)` cast at the new i18n call sites; F-002 (Claude-only Low) removed a superstitious `event.stopPropagation?.()` in the toggle handler (commits `68d5b9cc`, `7eba25da`).
7. **Manual on-device verification (US-009)** on the BOOX e-ink tablet passed in-session — expand/collapse cycle verified across Write/Edit/MultiEdit fixtures via Metro `--dev-client --clear` + `adb reverse tcp:8081`.

### 2026-04-25 - Worklet pinch-to-zoom text animation shipped on `main`

The chat pinch path now animates text leaves directly instead of scaling whole message bubbles. The shipped surface includes markdown, fenced code, diffs, tool output, permission/todo/codex views, and agent event text, while bubble chrome stays fixed. BOOX validation still runs as the separate manual hard gate documented in `docs/fork-notes.md`.

A discrete in-input Text Size picker (9 numbered chips spanning 0.85× to 1.5×, with chip 4 = default 1.0×) shipped alongside the worklet upgrade as a tap-friendlier alternative to pinch — especially useful on e-ink where pinch gestures are awkward. The picker writes the same `chatFontScale` MMKV key as the Settings → Appearance slider, so all three controls stay in sync. Pinch-to-zoom is still gated on `pinchToZoomEnabled` (default `false`) and remains opt-in.

### 2026-04-24 — Hygiene PR: chat font scale coverage + catalog loading banner

Single-commit hygiene bundle (`f3e92b2e`) that closes the two 2026-04-22 code-review follow-ups and the intercept-before-metadata option A, plus a test-suite repair.

1. **F-020 — `ToolError.tsx` + `PermissionFooter.tsx` typography.** Both now run their text through `useChatScaledStyles` / `useChatFontScaleOverride(14)`. The inline error line and all 8 permission-button labels (Claude + Codex variants) track `chatFontScale` along with the rest of the chat.
2. **F-021 — `ToolFullView.tsx` non-code chrome.** `sectionTitle`, `description`, `errorText`, `emptyOutputText`, `emptyOutputSubtext` now scale via `useChatScaledStyles`. Embedded `CodeView` blocks were already scaled via their `scaled` prop.
3. **Intercept banner (option A from the intercept-before-metadata backlog item).** On `/plugin`, `/skills`, and `/agents` the Loading Item now carries a self-explanatory subtitle (`session.catalogNotReadyBanner`: "Session hasn't loaded yet — send any message first to populate this list.") while `session.metadata.tools === undefined`. New i18n key added to `_default.ts` + all 10 locale files.
4. **Catalog test repair.** The three catalog screen tests pre-dated the `isLoading = metadata?.tools === undefined` condition and were asserting `EMPTY_STATE_TITLE` against `metadata: {}` (which actually triggers loading now). Fixed: pass `tools: []` to force the empty-state branch, added `@/text` mock, and added a new test case per screen asserting the loading-banner state.

**Deferred / killed:**
- Option B (auto-trigger session warm-up on intercept) dropped. The banner + `Loading…` state is now enough self-explanation for the 1–2s shadow-session gap; B's risk of sending unintended messages outweighs the remaining wait.
- The wider multi-model roadmap brainstorm (Claude × 2 + Codex + Copilot, 2026-04-24) flagged **stream throttle / "quiet mode"** as mis-categorized under "Further out" — two reviewers independently argued token-by-token redraws during active agent streaming are a larger latent e-ink cost than cold-open fetch. Treat as a near-term candidate next round.

### 2026-04-22 — Native & installed Claude Code skills support on `main` (merged from `feat/native-and-installed-skills-support`)

Merge commit `019a6109`; 20 commits stacked on the `fix/preserve-user-settings-for-plugin-skills` prerequisite. Plan + DSAT in `.ralph/jobs/native-and-installed-skills-support/`.

1. **Prerequisite #779 fix (`317fce8a`)** — `fix(cli): preserve enabledPlugins + MCP fields when passing --settings`. Without it, plugin-provided skills never reach the SDK's `slash_commands` emission. Upstream PR still TBD.
2. **Metadata forwarding CLI + app (US-001, US-002 — `b5d7f1fd`, `6ab3c9d0`)** — widened `onSDKMetadata` in `packages/happy-cli/src/claude/claudeRemote.ts` to forward `skills`, `agents`, `plugins`, `outputStyle`, `mcpServers`; extended the CLI `Metadata` type and the app-side `MetadataSchema` (`packages/happy-app/sources/sync/storageTypes.ts`) with matching optional fields. Wire/server unchanged (opaque encrypted passthrough).
3. **Classification picker (US-003, US-004 — `ed8223c9`, `8967509d`)** — replaced `IGNORED_COMMANDS` blocklist with an allowlist tagged by `CommandItem.source: 'native-prompt' | 'native-local' | 'skill' | 'plugin' | 'app-synthetic'`. Picker cap raised 5→15 (later aligned across test + production via shared constant in F-001/F-007). English description map for 16 commands (9 SDK built-ins + 7 app-synthetic).
4. **Pre-send intercept (US-005, US-006 — `e2f35101`, `cc387d69`)** — new `sources/sync/slashCommandIntercept.ts` + `sources/hooks/usePreSendCommand.ts`; both composer paths (`-session/SessionView.tsx` and `app/(app)/new/index.tsx`) intercept synthetic slash commands before `sync.sendMessage()` / `machineSpawnNewSession()`. Seven synthetic TUI entries (`/plugin`, `/skills`, `/agents`, `/memory`, `/model`, `/mcp`, `/help`); three route to session-scoped screens, four fall back to `Modal.alert` with a "run in terminal" hint.
5. **Three catalog screens (US-007..US-009 — `c8ab4bd7`, `71173b96`, `2d72e65f`)** — new read-only `app/(app)/session/[id]/{plugins,skills,agents}.tsx`, registered in `app/(app)/_layout.tsx`, linked from the session-info screen. Session-scoped (`[id]` route param) since metadata is per-session.
6. **Code-review fixes (F-001..F-007 — `d11476cc`, `e04bf888`, `7d2495ed`, `6277f50c`, `c4bd4509`, `a59bfcd3`, `80b19fbe`)** — picker limit, alert-title copy, plugin path rendering, i18n for the three nav-chrome screens (accepted exception to the fork's English-only debt), integration tests for the intercept short-circuit, `commit`/`commit-push-pr` added to `NATIVE_PROMPT_COMMANDS`, shared limit constant.
7. **Docs + security fixes (`756dd773`, `c1f8cd6f`, `0a5b79df`)** — `docs/encryption.md` lists the new `Metadata` fields; runtime shape validation for `mcpServers` in decrypted metadata and for `sessionId` in `maybeIntercept`.
8. **Cleanup (`f68dadbf`)** — deleted the stale `useAutocompleteSession.ts` hook (Codex-flagged during plan review).

**Deferred, not shipped:** `/help` full intercept coordination with upstream PR #543; ACP provider command-shape normalization; a global (non-session-scoped) catalog entry point; on-device tablet verification for US-004/006/007/008/009.

### 2026-04-22 — PR-A..PR-D batch on `main` (merged from `chat-text-ux-eink`)

1. **PR-A: finish chat font scale for the remaining tool views** — shared `useChatScaledStyles` helper; `DiffView`, `CodeView` (gated via new `scaled?: boolean` prop), `ToolView` header; per-view scaling for `TaskView`, `TodoView`, `GeminiExecuteView`, `CodexBashView`, `CodexDiffView`, `CodexPatchView`, `AskUserQuestionView`, `MultiEditViewFull`; `ToolFullView` passes `scaled` to its embedded `CodeView`s. Commit: `feat(chat): finish chat font scale coverage (roadmap item #1)`.
2. **PR-B: slider + live preview for chat text size** — replaces the tap-to-cycle Appearance item with a `@react-native-community/slider` (0.85–1.6, step 0.05) and a sample text rendered at the current preview scale. Fixes the `appearance.tsx` i18n debt along the way (three new `settingsAppearance.chatTextSize*` keys in `_default.ts` + all 10 locale files). Commit: `feat: [US-004] - [Slider UX + i18n debt fix (PR-B)]`.
3. **PR-C: pinch-to-zoom on chat (opt-in)** — `LocalSettings.pinchToZoomEnabled` (default `false`). Two-finger pinch on `ChatList` with live transform preview (`Animated.View` wrapping `MessageView` with `transform: [{ scale }]` and `transformOrigin: 'center'`); single persisted `chatFontScale` write on `.onEnd`; `renderToHardwareTextureAndroid` gated to the active-gesture window only. Zero cost at rest when toggle is off. Commit: `feat: [US-006] - [Pinch gesture + Appearance toggle (PR-C part 2)]`.
4. **PR-D: page-turn scroll mode (opt-in)** — `LocalSettings.chatPaginatedScroll` (default `false`). 15%-edge-strip tap zones (top/bottom); middle 70% stays pass-through so message long-press / link taps / `AskUserQuestionView` buttons keep working. Full-viewport paging via `scrollToOffset({ animated: false })`; tail-snap on new message keyed off `messages[0]?.id`. Hides the floating scroll-to-bottom button when paginated mode is on. Commit: `feat: [US-008] - [Page-turn Appearance toggle + docs (PR-D part 2)]`.

### 2026-04-24 — Three-state tablet sidebar landed on `main` (cherry-picked from `feature/tablet-sidebar-toggle`)

Cherry-picked the four sidebar commits onto a `merge/tablet-sidebar-toggle` integration branch off main, leaving the perf-freeze and Markdown metadata-tag commits behind (Tier 0/1 lazy-load already absorbed both perf fixes).

1. **Sidebar toggle + initial chat font-scale wiring (`9b4fa6ed`)** — `LocalSettings.sidebarCollapsed` (later replaced by `sidebarMode`), MarkdownView pulled the shared `useChatFontScaleOverride` from `@/hooks/useChatFontScale` instead of its inline one.
2. **Three-state core (`4e02270d`)** — `sidebarMode: 'expanded' | 'collapsed' | 'hidden'`, `SidebarContext`/`SidebarProvider`, `CollapsedSidebarView` (72-px rail), `CollapsibleSidebarEdge` (12-px chevron strip), `FABCompact`.
3. **Review-round fixups (`bded3b2e`)** — FABWide sibling, chevron hitSlop, a11y hint, avatar flavor.
4. **In-chrome restore (`f7baa660`)** — restore affordance moved into `ChatHeaderView`; `MainView` gate flipped from `!sidebarHidden` to `isExpanded`.
5. **i18n + Unistyles cleanup (`8ab002e7`)** — closes the two debt items that previously kept the branch out of `fork/main`. `sidebar.{show,hide,hideHint,expand,collapse}` keys added across `_default.ts` + 10 locales; restore-handle inline styles moved into `StyleSheet.create`.

### 2026-04-24 — Lazy-load long chats + cap initial message fetch on `main`

Three-tier client-side perf batch for the Onyx tablet cold-open freeze on long sessions.

1. **Tier 0 (`ddb0057d`)** — restored the regressed `FlatList` virtualization props in `ChatList`, kept `maintainVisibleContentPosition`, bumped `scrollEventThrottle` to 32, and re-wrapped `MessageView` in `React.memo`.
2. **Tier 1 (`1da743db`)** — bounded cold-start history fetches to the newest 80 messages, persisted pagination metadata in `SessionMessages`, and kept reconnect / gap-repair on the existing unbounded resume path.
3. **Tier 2 (`734dd960`)** — added `sync.loadOlder()` on the shared per-session lock plus `ChatList` triggers for both finger-scroll (`onEndReached`) and page-turn mode.

### Earlier (pre-2026-04-22)

- Chat freeze on large chats perf fix (upstream PR [#1154](https://github.com/slopus/happy/pull/1154))
- Three-state tablet sidebar (expanded / 72-px rail / hidden)
- `Settings → Appearance → Chat text size` — scale wiring landed across the chat in stages: initial integration (markdown body / composer), tool views (PR-A 2026-04-22 batch), `ToolError` / `PermissionFooter` / `ToolFullView` chrome (2026-04-24 hygiene PR), and the 2026-04-25 worklet pinch upgrade that animates the remaining text leaves in place across markdown, code, diffs, tool surfaces, and agent events.
- In-chrome restore for hidden sidebar (menu glyph in `ChatHeaderView`)
- Claude Code metadata-tag preprocessor for `MarkdownView` (`<command-*>`, `<local-command-*>`)
- Shared `useChatFontScale` / `useChatFontScaleOverride` hook at `sources/hooks/useChatFontScale.ts` (extended with `useChatScaledStyles` in PR-A)

---

## Process notes

- When picking up any of these, read `.agents/skills/happy-tablet-iterate/SKILL.md` first for the edit-reload loop.
- For anything that adds a user-facing string, remember the fork's i18n debt (hard-coded English historical) — add to `_default.ts` + every locale file now or flag in the commit message so it can be fixed before any upstream cherry-pick.
- Each item above is a potentially-shippable-upstream PR candidate. Bundle two items into one PR only if they share infrastructure.
- The 2026-04-22 batch used `/plan-with-ralph` + `/implement-with-ralph --autonomous` end-to-end. Plan + research + reviews + stories are archived under `.ralph/jobs/chat-text-ux-eink/` and survive past the merge into main.
