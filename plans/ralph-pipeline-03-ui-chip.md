# Plan 03 — UI: stage chip + filter axis + Vite sidecar plumbing

**Worktree:** main checkout at `D:\harness-efforts\codexu`.

**Position in DAG:** depends on Plan 01. Independent of Plan 02 (watcher) but pairs naturally — without 02 the user has to run `pnpm sync-ralph-state` manually to refresh.

## Context

Plans 01 and 02 produce sidecar data on disk but nothing renders. This plan adds the first user-visible value: a Ralph stage chip on every command row, a Radix Tooltip showing detail, a 9-chip filter axis in the toolbar, and the Vite plugin extension that serves / watches / inlines the sidecar for both dev and static builds.

## Dependencies

- **Plan 01 (Foundation)** — required. Types, `getOverviewRalphState()`, sidecar files.
- **Plan 02 (Watcher)** — optional but recommended. Without it the user has to manually rerun `pnpm sync-ralph-state` to see UI updates. Plan 02 emits the `overview-ralph-state:update` HMR event this plan subscribes to.

## Scope

**In scope:**
- New `tools/overview-viewer/src/components/RalphStageChip.tsx` with Radix Tooltip.
- Modification of `tools/overview-viewer/src/components/TaskCommand.tsx` to render the chip next to `WorkstreamPill`.
- Modification of `tools/overview-viewer/src/utils/filters.ts`: add `'ralphStage'` to `FilterAxis`; thread `ralphState: OverviewRalphState` parameter through `matchesTaskFilter`, `matchesKanbanFilter`, `getTaskSearchHaystack`.
- Modification of `tools/overview-viewer/src/hooks/useMultiAxisFilter.ts`: accept `ralphState` as a parameter, forward to filter functions, include in memo deps.
- Modification of `tools/overview-viewer/src/App.tsx`: read `getOverviewRalphState()`, thread `ralphState` through all consumers, add `reloadRalphState()` HMR helper + `useEffect` for `overview-ralph-state:update`.
- Modification of `tools/overview-viewer/src/components/Toolbar.tsx`: add `'ralphStage'` group to `FILTER_GROUPS` (9 chips, one per stage).
- Modification of `tools/overview-viewer/src/styles.css`: add `.ralph-stage-chip` base + 9 per-stage color variants + `matchSource: 'slug-default'` dotted-underline variant.
- Modification of `tools/overview-viewer/vite.config.ts`: serve `/overview-ralph-state.js` via dev middleware; inline into static build with `</script` escape (mirrors existing `overview-data.js` plumbing).
- Updates to `tools/overview-viewer/src/__tests__/testData.ts`: add `loadRalphState()` helper + `NO_RALPH_STATE` constant.
- Targeted modifications to existing tests where the new third `ralphState` parameter is needed: `searchHaystack.test.ts`, `kanban.test.tsx`, `commandList.test.tsx` — pass `NO_RALPH_STATE` to preserve existing behavior coverage.
- New `tools/overview-viewer/src/__tests__/ralphStageChip.test.tsx`: render coverage for the new component (returns null when no ralph state; renders correct stage color; tooltip exposes the right detail).

**Out of scope (other plans):**
- The aggregate Pipeline Overview histogram and its "click chip → filter" wiring → Plan 04
- `nextCommand` derivation and the "Copy next command" button in `TaskCommand` → Plan 06
- `injectRalphStagePill` on kanban cards (kanban gets stage chips later) → Plan 04 OR a follow-up; explicitly NOT in this plan
- Notepad surfacing, journal links, PR/branch backlinks in the tooltip → Plan 07
- Crew-session list in the tooltip → Plan 08
- RecentActivity sidebar → Plan 07

## Files

### To create

- **`tools/overview-viewer/src/components/RalphStageChip.tsx`** — props: `{ taskId: string; ralphState: OverviewRalphState }`. Looks up `ralphState.byTaskId[taskId]`. Returns `null` when undefined (does NOT render a placeholder). Renders a `<span class="ralph-stage-chip ralph-stage-<stage>">…</span>` wrapped in a Radix Tooltip (mirror `WorkstreamPill` per `tools/overview-viewer/CLAUDE.md` lines 74-76). Tooltip content: stage name, `jobSlug`, `lastUpdatedAt`. Future plans add more tooltip content; design the component to accept an optional `tooltipExtras: ReactNode` slot so Plans 07/08 can pass in additional rows without restructuring.
- **`tools/overview-viewer/src/__tests__/ralphStageChip.test.tsx`** — see test list under Acceptance.

### To modify

- **`tools/overview-viewer/src/utils/filters.ts`:**
  - Line 5: `FilterAxis` union — add `'ralphStage'`.
  - Lines 8–16: `createEmptyFilters` — add `ralphStage: new Set()`.
  - Lines 18–26: `cloneFilters` — add `ralphStage: new Set(filters.ralphStage)`.
  - Lines 42–65: `getTaskSearchHaystack(task, data)` → `getTaskSearchHaystack(task, data, ralphState)`. Append `ralphState.byTaskId[task.id]?.stage`, `?.jobSlug`, `?.groupSlug` to `parts`.
  - Lines 67–83: `matchesTaskFilter(task, data, filters, query, taskIdFilter)` → `matchesTaskFilter(task, data, filters, query, taskIdFilter, ralphState)`. Add `const stage = ralphState.byTaskId[task.id]?.stage ?? '__no_ralph__'; const ralphStageOk = filters.ralphStage.size === 0 || filters.ralphStage.has(stage)`. AND it into the return.
  - Lines 85–92: `matchesKanbanFilter` — same parameter addition, same predicate.
- **`tools/overview-viewer/src/hooks/useMultiAxisFilter.ts`** (line 13 per the comprehensive plan's verification): accept `ralphState: OverviewRalphState` as a third parameter, forward to filter functions, include in memo deps.
- **`tools/overview-viewer/src/App.tsx`:**
  - Near the top: add `const ralphState = getOverviewRalphState()` (imported from `./types`).
  - Pass `ralphState` to `useMultiAxisFilter(data, taskIdFilter, ralphState)`.
  - Pass `ralphState` as a prop to `TaskCommand`, `Toolbar`, and any component that needs it.
  - Add `reloadRalphState()` helper next to `reloadOverviewData()` (mirror the existing pattern). It fetches `./overview-ralph-state.js?t=<timestamp>`, re-executes via `new Function(text)()` so `window.OVERVIEW_RALPH_STATE` repopulates. Then `setRalphState(getOverviewRalphState())` to trigger React re-render.
  - Add `useEffect(() => { import.meta.hot?.on('overview-ralph-state:update', reloadRalphState); return () => import.meta.hot?.off('overview-ralph-state:update', reloadRalphState) }, [])` mirroring the existing `overview-data:update` subscription.
- **`tools/overview-viewer/src/components/TaskCommand.tsx`:**
  - Add `RalphStageChip` rendered next to `WorkstreamPill` (around line 410 per the comprehensive plan's reference). Wire `ralphState` prop.
- **`tools/overview-viewer/src/components/Toolbar.tsx`:**
  - Add a new entry to `FILTER_GROUPS` (lines 10-40): `{ axis: 'ralphStage', title: 'Ralph stage', chips: [...9 entries with emoji-prefix labels...] }`. Suggested labels:
    - `{ value: 'brainstorming', label: '💡 brainstorming' }`
    - `{ value: 'brainstorm-ready', label: '✨ brainstorm-ready' }`
    - `{ value: 'planning', label: '📝 planning' }`
    - `{ value: 'plan-ready', label: '📋 plan-ready' }`
    - `{ value: 'implementing', label: '🟦 implementing' }`
    - `{ value: 'reviewing', label: '🔍 reviewing' }`
    - `{ value: 'review-fix', label: '🛠 review-fix' }`
    - `{ value: 'shipped', label: '✅ shipped' }`
    - `{ value: 'blocked', label: '🔒 blocked' }`
- **`tools/overview-viewer/src/styles.css`:** add at the bottom:
  - `.ralph-stage-chip` base — same shape as `.pill` (line 98).
  - 9 per-stage color variants — see comprehensive plan Part 3 for suggested mapping (cyan/yellow/blue/red/green tones).
  - `.ralph-stage-chip.match-slug-default { border-style: dotted }` — visual distinction for low-confidence matches per R5 / R1.
- **`tools/overview-viewer/vite.config.ts`:** extend `overviewDataPlugin` (or sibling plugin) to:
  - Serve `/overview-ralph-state.js` at the same dev URL pattern as `/overview-data.js`. Mirror lines 31-53 (`configureServer` hook).
  - Watch `plans/overview-ralph-state.js` for change events. (When Plan 02 ships, this watch becomes redundant because the Plan 02 watcher emits the `overview-ralph-state:update` event directly; keep both paths for safety. Dedup on the React side is fine — `reloadRalphState` is idempotent.)
  - `transformIndexHtml` / static-build path: inline `overview-ralph-state.js` content alongside `overview-data.js` (lines 54-72). Escape `</script` per the existing rule.
- **`tools/overview-viewer/src/__tests__/testData.ts`** (lines 7-12): add `loadRalphState()` helper that loads `plans/overview-ralph-state.js` via the same `new Function` pattern. Export `NO_RALPH_STATE: OverviewRalphState = { generatedAt: '', generatedFromCommit: '', byTaskId: {} }` for tests that want the no-op path.
- **`tools/overview-viewer/src/__tests__/searchHaystack.test.ts`**, **`kanban.test.tsx`**, **`commandList.test.tsx`**: every call to `matchesTaskFilter` / `matchesKanbanFilter` / `getTaskSearchHaystack` gains a final `NO_RALPH_STATE` argument. Existing test assertions should pass unchanged (proof that the no-ralph path is byte-identical to pre-feature behavior).

### Read for reference

- `tools/overview-viewer/CLAUDE.md` — Radix Tooltip pattern (`WorkstreamPill`), copy-feedback rule, trusted-HTML boundaries, HMR mechanism.
- `tools/overview-viewer/src/components/TaskCommand.tsx` existing `StatusBadge` (lines 73-76), `ScopeChip` (lines 78-86), `WorkstreamPill` (lines 276-322) as templates for the new chip component.
- `tools/overview-viewer/src/styles.css` `.pill` (line 98), `.cmd-badge.b-*` (lines 909-968), `.task-scope-chip` (lines 987-1010) as templates for chip styling.
- `tools/overview-viewer/vite.config.ts` existing `overviewDataPlugin` for the extension pattern.

## Implementation strategy

Ordered steps:

1. **Threading first** — `src/utils/filters.ts` → `src/hooks/useMultiAxisFilter.ts` → `src/App.tsx`. Run `pnpm --filter @codexu/overview-viewer typecheck` between each file. Existing tests will break at this step (signature changes); fix them by passing `NO_RALPH_STATE` from `testData.ts` (item 7 below).
2. **`testData.ts` helpers** — add `loadRalphState()` + `NO_RALPH_STATE` so tests have a way to opt into the new parameter.
3. **Fix existing tests** — update `searchHaystack.test.ts`, `kanban.test.tsx`, `commandList.test.tsx` to pass `NO_RALPH_STATE`. Assertions should remain unchanged.
4. **Build `RalphStageChip.tsx`** — copy `WorkstreamPill` Radix Tooltip pattern. Test rendering in isolation: `pnpm test src/__tests__/ralphStageChip.test.tsx`.
5. **Render `RalphStageChip` in `TaskCommand.tsx`** — next to `WorkstreamPill`. Verify the chip appears for tasks with ralph state and is absent for tasks without.
6. **Add filter group to `Toolbar.tsx`** — 9 chips. Verify the toolbar renders the new group.
7. **CSS variants** — add color classes. Verify in dev server.
8. **Vite plugin extension** — serve `/overview-ralph-state.js`, inline for static build.
9. **App.tsx HMR helper** — `reloadRalphState` + `useEffect`. With Plan 02's watcher running, edit a `.ralph/jobs/<test>/job-state.json` and confirm the chip color in the browser updates without reload (within ~2s of edit + ~0.2s for HMR).
10. **Static build verification** — `pnpm overview:build` produces a self-contained `plans/overview.html` under the 500KB budget that, opened via `file://`, renders the chips correctly.

## Acceptance criteria

- [ ] `RalphStageChip` returns `null` when `ralphState.byTaskId[taskId]` is undefined.
- [ ] `RalphStageChip` renders a chip with the correct color class for each stage value.
- [ ] `RalphStageChip` has a Radix Tooltip showing `stage`, `jobSlug`, `lastUpdatedAt` on hover.
- [ ] `RalphStageChip` with `matchSource: 'slug-default'` renders with a dotted underline.
- [ ] `FilterAxis` union includes `'ralphStage'`.
- [ ] Toolbar shows the 9 stage chips.
- [ ] Clicking a stage chip filters both the command list AND kanban view.
- [ ] `matchesTaskFilter` accepts `ralphState` as a non-optional parameter.
- [ ] `getTaskSearchHaystack` includes `ralphState.byTaskId[task.id]?.stage / jobSlug / groupSlug` in the haystack.
- [ ] All existing tests pass with the `NO_RALPH_STATE` argument added.
- [ ] New `ralphStageChip.test.tsx` covers: null-when-absent, stage-color rendering, tooltip content, dotted-underline for slug-default.
- [ ] `pnpm --filter @codexu/overview-viewer typecheck` and `pnpm --filter @codexu/overview-viewer test` both pass.
- [ ] `pnpm overview` dev server renders chips with HMR updates (when Plan 02's watcher is running). Without Plan 02, manual `pnpm sync-ralph-state` followed by browser reload shows updated chips.
- [ ] `pnpm overview:build` produces a static `plans/overview.html` under 500KB that renders chips when opened via `file://`.
- [ ] Kanban snapshot tests (`kanban.test.tsx`) remain unchanged (this plan does NOT inject pills into kanban HTML).

- [ ] **Refresh downstream plans + INDEX.** After all other criteria pass, audit (a) the plans listed in this plan's "Hand-off to next plans" section and (b) `plans/ralph-pipeline-INDEX.md`'s "Source-of-truth modules" table and DAG diagram. Update any stale references — file paths, type signatures, function/export names, behavior contracts, module dependencies — that diverged from this plan's actual implementation. Apply updates atomically in the final implementation commit; in the commit message, list each diff (which file, which lines, what changed) so reviewers can verify the cascade.

## Verification

Run from `D:\harness-efforts\codexu`.

A. **Type check + tests:** `pnpm --filter @codexu/overview-viewer typecheck && pnpm --filter @codexu/overview-viewer test`.

B. **Dev-server visual:** `pnpm sync-ralph-state` (Plan 01) then `pnpm overview`. Browser at `http://127.0.0.1:5173/` shows stage chips next to `WorkstreamPill` for any task whose Ralph slug matches an `OverviewTask.id`. Tasks without ralph state are visually identical to pre-feature.

C. **Tooltip:** hover a stage chip — Radix Tooltip appears showing stage, jobSlug, lastUpdatedAt.

D. **Filter:** click `🟦 implementing` in the toolbar. Command list and kanban both filter to only tasks in `implementing` stage.

E. **HMR (requires Plan 02):** with Plan 02's watcher running, edit a `.ralph/jobs/<test>/job-state.json` to flip its stage. Browser chip updates within ~2-3 seconds without page reload.

F. **Static build:** `pnpm overview:build`. Open `plans/overview.html` via `file://`. Chips render. Bundle is under 500KB (`ls -la plans/overview.html`).

G. **Snapshot stability:** `pnpm test src/__tests__/kanban.test.tsx` — snapshots unchanged because this plan does NOT modify the kanban HTML render path.

H. **Slug-default visual:** with at least one task matching via `slug-default`, confirm the chip renders with a dotted underline.

## Common mistakes / confusion points

1. **Don't use `title=` for tooltip content.** Use the Radix Tooltip pattern from `WorkstreamPill` (`tools/overview-viewer/CLAUDE.md` lines 74-76). `title=` is keyboard-invisible and inconsistent with the rest of the UI.
2. **`matchesTaskFilter`'s new parameter is non-optional.** Use `getOverviewRalphState()` (always returns a valid empty state) at the call site, not `?: OverviewRalphState | undefined`. This prevents accidental `undefined.byTaskId` crashes.
3. **Don't inject the chip into kanban HTML.** Kanban pill injection is explicitly OUT of scope for this plan to keep snapshot tests stable. A later plan can add `injectRalphStagePill` (the comprehensive plan describes the pattern); leave kanban alone here.
4. **`RalphStageChip` returns `null` when absent.** Do NOT render a "no ralph state" placeholder chip — pre-feature rows should be visually byte-identical for tasks without ralph data.
5. **HMR event subscription is in addition to the existing `overview-data:update` subscription, not a replacement.** Both fire independently; both helpers should be present.
6. **Vite plugin extension reuses the chokidar instance pattern, not the data.** Watching `plans/overview-ralph-state.js` for change in the plugin is defensive (works without Plan 02). With Plan 02, the watcher emits the event directly — both paths produce the same effect on the React side, harmlessly.
7. **Tooltip extras slot is reserved for future plans.** Plans 07 (notepad surfacing, PR/branch) and 08 (crew sessions) will add tooltip content via the `tooltipExtras` slot. Don't inline that content in this plan.

## Hand-off to next plans

- **Plan 04 — Pipeline Overview** adds the aggregate histogram. It reads `ralphState.byTaskId` and aggregates counts; pairs with this plan's filter axis (clicking a histogram bar sets `filters.ralphStage`).
- **Plan 05 — Agent exports** is unblocked but doesn't touch the React UI.
- **Plan 06 — Skills** is unblocked.
- **Plans 07 / 08** will add content to the `RalphStageChip` tooltip via the `tooltipExtras` slot.

After this plan ships, the user can see stage chips on every Ralph-tracked task and filter by stage. That's the minimum "is this feature even visible?" win.
