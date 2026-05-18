# Overview Vite + React viewer — live HMR updates as agents edit task state

*Drafted 2026-05-17 as input to a future `/plan-with-ralph` invocation. THIRD of three sibling plans. Strict dependencies: `plans/task-phases.md` AND `plans/overview-data-split.md` MUST both land first.*

> **STATUS: SHIPPED 2026-05-18.** This planning brief is preserved as a historical record of the original framing/motivation. The feature shipped as the `@codexu/overview-viewer` workspace package at `tools/overview-viewer/`; the final implementation plan lives at `.ralph/jobs/overview-vite-react/plan.md`. See `tools/overview-viewer/README.md` and `.agents/skills/roadmap-and-overview/SKILL.md` for the as-shipped contributor/bookkeeper docs. Three deliberate UX improvements over the `9f81c1f8` baseline were added during the run — see the viewer README's "Intentional Deviations" section.

## Why

Today the operator opens `plans/overview.html` (static), reads it, sees stale state. When the bookkeeper agent updates a task's phase mid-session, the operator has to F5 to see the change. With ~50 tasks and frequent state churn during active development, this is significant friction — the operator either misses landings or refreshes constantly.

After plan #2 ships, `plans/overview-data.js` is the single source of truth. A small Vite + React app pointed at that file gives:

- **HMR live update.** Operator keeps `localhost:5173` open. Agent edits `overview-data.js`. Vite's file watcher fires HMR. React re-renders only the changed task's card. Operator sees the kanban card slide from "Impl in progress" → "Shipped" within ~50ms, without losing scroll position, without collapsing expanded `<details>`, without losing search filter state.
- **Component model for free.** The current `overview.html` inline JS is ~400 lines of imperative DOM manipulation (filter, search, URL banner, copy buttons, hash nav, spawned-from arrows, expand-collapse). React components — `<TaskCommand>`, `<KanbanColumn>`, `<PhaseTree>`, `<StatusBadge>`, `<RunsLog>` — collapse the duplication and make future features (inline edit, drag-drop, persistent expanded state) tractable.
- **Static fallback preserved.** `pnpm overview:build` emits a deployable static `plans/overview.html` for casual viewing (open from `file://`, share with someone who doesn't have the repo, open on a phone).

## What the data-split implementation locked in (read before drafting)

Plan #2 shipped 2026-05-17 at `9f81c1f8`. The schema in `plans/overview-data.js` (1630 lines) and the render contract in `plans/overview.html` (2657 lines) have a few specifics worth knowing before the React port:

1. **`window.OVERVIEW_DATA` is a live global** read by `getRoadmapData()` (`plans/overview.html:2398-2400` — `function getRoadmapData() { return window.OVERVIEW_DATA; }`). Plan #3's `useSyncExternalStore` hook works as-is against this global; no further indirection required.

2. **Tasks have NO flat `title` field.** Title text lives inside `task.kanbanCards[].html` (trusted HTML fragment) and `task.command.descriptionHtml`. The string `task.command.name` is the slug-style id label (e.g. `"perf-WS3"`, used in the `<summary>`'s `.cmd-name` chip), not a human title. Plan #3 components MUST NOT assume `task.title` exists.

3. **Kanban placement uses `insertBeforeTaskId` + `order`, NOT a column index.** Per F-006 fix in `9f81c1f8`: each `kanbanCards[]` entry carries `{ column, cardClass, inlineStyle, html, insertBeforeTaskId?, order? }`. Numeric `order` takes precedence; `insertBeforeTaskId` is the fallback anchor for cards without `order`. The React `<KanbanColumn>` must sort within each column by `order` ascending (nulls last), placing null-order cards before the anchor referenced by `insertBeforeTaskId`. See `plans/overview.html:1316-1335` for the reference implementation.

4. **Phase-tree task-ref state derives from `task.phase` at render time.** Per F-009 fix: nodes shaped as `{ kind: "task-ref", taskId, trailingHtml? }` look up the matching `task.phase`, then map it to one of four CSS state classes (`open`/`deferred`/`donefade`/`closed`). The phase-tree data file does NOT store the state class. `<PhaseTreeNode>` must perform the lookup. See `plans/overview.html:1401-1480` for `renderPhaseTree()`.

5. **`applyEnrichments()` orchestrates 13 DOM-decoration passes** that run after every `renderTasks()` (see `plans/overview.html:2523-2539`). Each one is a function the React port must either replace with a component/hook OR call from a `useEffect` after initial render. The full list:
   - `renderPhaseBadges` — phase badge text/glyph mapping → port to `<StatusBadge>`
   - `injectTaskScopeChips` — scope pill (`codexu`/`codex`/`codex|codexu`) → `<ScopeChip>` in `<TaskCommand>` summary
   - `classifyAndOrderCmds` — sort command rows by phase/status precedence → sort logic in `<TaskCommand>` parent (kept as a hook, not a component)
   - `injectCopyNameButtons` — "Copy Name" button in summary → `<CopyNameButton>` in `<TaskCommand>` summary
   - `injectCheckboxes` — bulk-copy selection checkbox in summary, disabled for closed rows → `<BulkSelectCheckbox>` in `<TaskCommand>` summary
   - `injectWorkstreamPills` — workstream key pill (clickable filter shortcut) → `<WorkstreamPill>` in `<TaskCommand>` summary
   - `injectKanbanPhasePills` — phase pill on each kanban card derived from its linked command row → `<KanbanCard>` reads `task.phase` and renders the pill itself
   - `linkBlockedOn` — converts blocked-by references in warnings into clickable links → handled inside `<Warning>` component
   - `linkKanbanToCmds` — clicking a kanban card scrolls to + expands the matching command row → `<KanbanCard>` onClick handler
   - `injectSpawnRelationships` — spawned-from pill + spawned-children strip → `<SpawnedFromPill>` + `<SpawnedChildren>` (already in plan)
   - `injectRunHistory` — appends run records to the command body when shipped → handled inside `<TaskCommand>` from `OVERVIEW_DATA.runs`
   - `buildTodayPanel` — renders the "Today" panel (running/blocked/paused/recently-shipped) → new component `<TodayPanel>` (not previously in plan)
   - `populateKanbanCount` — section count badges → derived from `tasks[]` length; no separate component
   - `applyFilter` — URL filter + search → existing `useUrlFilter` + `useSearch` hooks
   These functions today all walk the DOM with `document.querySelectorAll`. In the React port they consume data props directly — no DOM walks.

6. **Static fallback strategy.** The implementation kept the static `plans/overview.html` rendering from `OVERVIEW_DATA` via inline JS at first load. Plan #3 has a choice: (a) replace the inline-JS path entirely with the Vite build output, OR (b) keep both paths and let `vite build` emit a second self-contained HTML somewhere else. Recommend (a) — one rendering codebase. Static `file://` viewing is preserved because the React-built HTML inlines everything next to `overview-data.js`.

7. **Map-shaped metadata preserved at top level.** `OVERVIEW_DATA.{effort, risk, workstream, sizeBucket, spawnedFrom, lastTouched, runs, periodic, cadence}` are all top-level maps (not on the task objects). `spawnedFrom` is also denormalized onto each `task.spawnedFrom` per the schema, but the top-level map is what existing enrichment IIFEs read. The React port can derive these from `tasks[]` if it wants — or just consume them as-is for parity.

## What changes

New workspace package at `tools/overview-viewer/`. Two execution modes:

1. **Dev mode** (live updates):
   ```
   pnpm --filter @codexu/overview-viewer dev
   # → opens http://localhost:5173, HMR watches plans/overview-data.js
   ```

2. **Static mode** (one-shot build):
   ```
   pnpm --filter @codexu/overview-viewer build
   # → writes plans/overview.html (replaces existing) referencing plans/overview-data.js
   ```

Both modes consume the SAME `plans/overview-data.js` file as written by the bookkeeper. No second source of truth.

### Layout

```
tools/overview-viewer/
  package.json            # private workspace package, name: @codexu/overview-viewer
  vite.config.ts          # base: './', outDir: '../../plans', single rolled output
  tsconfig.json
  index.html              # vite entry, becomes plans/overview.html on build
  src/
    main.tsx              # React mount
    App.tsx               # top-level: reads OVERVIEW_DATA, dispatches to sections
    components/
      KanbanColumn.tsx           # sort cards by order asc, then resolve insertBeforeTaskId anchors
      KanbanCard.tsx             # consumes kanbanCards[].html via dangerouslySetInnerHTML; applies cardClass + inlineStyle on wrapping <div class="card">; reads task.phase to emit the kanban phase pill (replaces injectKanbanPhasePills); onClick scrolls + expands matching TaskCommand (replaces linkKanbanToCmds)
      TaskCommand.tsx            # the <details> command row; renders summary (StatusBadge + ScopeChip + CopyNameButton + WorkstreamPill + BulkSelectCheckbox) + body (descriptionHtml + warnings + planPrompt + runs)
      PhaseBlock.tsx             # one phase's: source chip + prompt + (optional) job/commit deep-link
      SourceChip.tsx             # "Source: fresh" | "⤴ brainstorm output" | "📄 plans/task-phases.md"
      JobLink.tsx                # deep-link to .ralph/jobs/<planJobId>/plan.md when populated (sparse today)
      MergeCommitLink.tsx        # links to GitHub commit when phase === "shipped" and mergeCommit is set
      StatusBadge.tsx            # phase + status modifier pill (10 phases + blocked/paused modifier); ports renderPhaseBadges glyph map
      ScopeChip.tsx              # scope pill in summary (replaces injectTaskScopeChips)
      CopyNameButton.tsx         # "Copy Name" button in summary (replaces injectCopyNameButtons)
      BulkSelectCheckbox.tsx     # bulk-copy checkbox in summary; disabled for closed rows (replaces injectCheckboxes)
      WorkstreamPill.tsx         # workstream key pill, clickable filter shortcut (replaces injectWorkstreamPills)
      Warning.tsx                # cmd-warn rendering; converts blocked-by refs into <a> links (replaces linkBlockedOn)
      SpawnedFromPill.tsx        # spawned-from pill (replaces injectSpawnRelationships, parent side)
      SpawnedChildren.tsx        # spawned-children strip (replaces injectSpawnRelationships, child side)
      RunsLog.tsx                # consumes OVERVIEW_DATA.runs; also exposes per-task runs for TaskCommand body (replaces injectRunHistory)
      TodayPanel.tsx             # "Today" panel: running / blocked / paused / recently-shipped rows (replaces buildTodayPanel; NEW component, was missing from earlier draft)
      PhaseTree.tsx
      PhaseTreeNode.tsx          # task-ref nodes look up task.phase and map it to state CSS class (open|deferred|donefade|closed); raw nodes render via dangerouslySetInnerHTML
      Legend.tsx
      UrlFilterBanner.tsx
      SearchInput.tsx
    data/
      schema.ts           # TS types matching overview-data.js
      useOverviewData.ts  # subscribes to window.OVERVIEW_DATA with HMR
    hooks/
      useUrlFilter.ts     # ?tasks=foo,bar URL param handling (matches overview.html's parseTaskIdFilter() at line 3206)
      useHashNav.ts       # #cmd-perf-WS3 scroll-into-view on load
      usePersistentExpanded.ts  # localStorage-backed expanded state
    styles.css            # ported from overview.html <style>
```

### Data loading mechanics

`plans/overview-data.js` stays as the source — `window.OVERVIEW_DATA = {...};` assignment. The React app loads it two ways:

- **Dev mode:** `index.html` includes `<script src="/plans/overview-data.js"></script>` (resolved via Vite's `resolve.alias` to the actual file on disk). Vite's HMR plugin (or a small custom plugin) watches that file. On change, re-execute the script, then signal React to re-read `window.OVERVIEW_DATA`.
- **Static build mode:** same `<script src="overview-data.js">` reference, with the JS file copied next to the built HTML. Plain page load on `file://` works because the script is co-located.

Recommended HMR hookup:

```ts
// src/data/useOverviewData.ts
import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
function notify() { listeners.forEach(fn => fn()); }
function subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); }
function getSnapshot() { return (window as any).OVERVIEW_DATA; }

if (import.meta.hot) {
  // Custom Vite plugin (see below) fires this on overview-data.js change.
  import.meta.hot.on('overview-data:updated', () => {
    notify();
  });
}

export function useOverviewData() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
```

A tiny custom Vite plugin (~20 lines in `vite.config.ts`) watches `plans/overview-data.js`, re-reads it, evals it to update `window.OVERVIEW_DATA` (or sends the new content over the HMR channel for the client to re-eval), and dispatches the `overview-data:updated` event.

Alternative: import the JSON content directly via Vite's JSON loader, sidestepping the `window.OVERVIEW_DATA` global. But that requires the data file to be valid JSON, not the JS-wrapped form. Plan #2 chose the JS-wrapped form for `file://` static compatibility — keeping that means React loads via the `window` global. If plan #2 reconsiders and ships dual files (`overview-data.json` for canonical, `overview-data.js` as a thin wrapper for static), React can `import data from '../../plans/overview-data.json'` and Vite watches the JSON natively. Cleaner. Worth raising in plan #2 review.

## Files to change

- `pnpm-workspace.yaml` — add `tools/overview-viewer` to `packages:` list (currently lines 1-10 enumerate packages; not a glob).
- `package.json` (root) — add `scripts`:
  - `"overview": "pnpm --filter @codexu/overview-viewer dev"`
  - `"overview:build": "pnpm --filter @codexu/overview-viewer build"`
- `tools/overview-viewer/` — NEW. Full package per the layout above.
- `plans/overview.html` — DELETED in favor of the `vite build` output that replaces it. The build emits to `plans/` via `outDir: '../../plans'` + `emptyOutDir: false` (preserve other files in `plans/`).
- `plans/overview-data.js` — UNCHANGED. Both modes consume it.
- `tools/overview/validate.mjs` (if created in plan #2) — UNCHANGED. The schema validation continues to work.
- `plans/parallel-assignments.md` — viewing-instructions section update:
  - "For live updates during a session: `pnpm overview` and open http://localhost:5173."
  - "For static viewing or sharing: open `plans/overview.html` directly (file://). After editing `overview-data.js`, run `pnpm overview:build` to refresh the static HTML."
- `plans/codexu-roadmap.md` — single-line addendum under the existing "Companion snapshot" callout (lines 5-9): note the dev-server pattern + the static-build refresh requirement.
- `README.md` (root) — new "Roadmap viewer" subsection. ~5 lines: dev server URL, build command, link to `plans/parallel-assignments.md` for the full bookkeeping protocol.
- `tools/overview-viewer/README.md` — NEW. Dev/build instructions, contributor notes, schema link.
- `.gitignore` — verify `tools/overview-viewer/dist/` and `node_modules/` are covered (probably already are via wildcard).

## Files to read as reference (do NOT edit)

- `plans/overview.html` (post-`overview-data-split`) — agent must read the full file (2657 lines) to understand the rendering behavior being preserved. Specific functions to study end-to-end:
  - `renderTasks()` (lines 1287-1397) — kanban card placement via `insertBeforeTaskId` + `order`, command-row emission, open-state preserve/restore.
  - `renderPhaseTree()` (lines 1401-1480) — phase node + sub-details rendering, task-ref state derivation.
  - `applyEnrichments()` (lines 2523-2539) — the 13 DOM-decoration passes orchestrated after each render.
  - `renderPhaseBadges()` — phase → badge text/glyph mapping (port verbatim to `<StatusBadge>`).
  - `injectKanbanPhasePills()` (line 2303) — phase pill on kanban cards.
  - `buildTodayPanel()` (line 1851) — Today panel construction.
  - `injectCheckboxes()` (line 2015) — bulk-select checkboxes with disabled-on-closed rule.
  - `injectCopyNameButtons()` (line 1700) — copy-name button.
  - `injectTaskScopeChips()` (line 1639) — scope chip placement.
  - URL filter `parseTaskIdFilter()` for `?tasks=` param.
- `plans/overview-data.js` (1630 lines) — schema source of truth. Every field type maps directly to a TS interface in `src/data/schema.ts`. Note the actual shape: no flat `task.title`, kanban placement via `insertBeforeTaskId`+`order`, command body under `task.command`, phase-tree state derived not stored.
- `plans/overview-data.js` — schema source of truth (output of plan #2).
- `plans/task-phases.md` — phase enum and `data-task-phase`/`data-task-status` conventions. The 10 CSS classes (`b-brainstorm-ready`, `b-plan-ready`, …, `b-shipped`, `b-closed`) port directly to React's `StatusBadge`.
- `plans/overview-data-split.md` — schema definitions for the TS types in `src/data/schema.ts`.
- `.agents/skills/roadmap-and-overview/SKILL.md` — bookkeeper procedure as updated by plans #1 + #2. Read end-to-end before drafting any UI affordance that affects how the bookkeeper interacts with the data file.
- `tools/render-roadmap.ts` and `tools/render-roadmap.test.ts` — example of an out-of-workspace TS tool (different pattern from what this plan uses; this plan adds a workspace package proper).
- `packages/happy-app/package.json` — for reference on the workspace's TS + React conventions (matching strictness, lint config, etc.).
- `packages/happy-app/tsconfig.json` — reference for tsconfig shape.
- `vite.config.ts` patterns: search `packages/happy-app/` for an existing Vite config if present; otherwise consult Vite's docs.

## Acceptance

- `pnpm overview` starts a dev server. Browser at http://localhost:5173 renders the same kanban + commands list + phase tree + runs log as the static HTML pre-replacement.
- Visual parity: open `plans/overview.html` from `9f81c1f8` (the post-data-split baseline) and new dev-mode page side-by-side. Same layout, same colors (dark + light theme), same pills, same warnings, same spawned-from arrows. The 10 phase-badge CSS classes from `task-phases` port verbatim to `src/styles.css`.
- All 13 `applyEnrichments()` behaviors render correctly in React without DOM-walking `querySelectorAll` calls — each maps to a component or hook per the layout above.
- Kanban placement matches the data file's `insertBeforeTaskId` + `order` ordering. Tasks with multiple `kanbanCards[]` entries (e.g. `1b-multidev`'s 3 cards in "soon" column) render in the correct order.
- Phase-tree task-ref nodes correctly look up `task.phase` and render the matching CSS state class. Flipping a task's `phase` from `impl-in-progress` to `shipped` in `overview-data.js` updates BOTH the command row badge AND the phase-tree state class (strike-through, color) within the same HMR cycle.
- TodayPanel renders the 4 buckets (running / blocked / paused / recently-shipped) with correct task ids per the existing `buildTodayPanel` precedence rules.
- Phase input/output affordances render correctly:
  - **`planOnly: true`** tasks (7 in the shipped data file as of `9f81c1f8`) render their plan-review terminal as `shipped` with no implement block visible. This is the only input/output field heavily populated today.
  - **`mergeCommit`** when set → shipped pill is clickable, links to the commit (GitHub URL pattern: `https://github.com/Evyatar108/codexu/commit/<sha>`). Populated on 6 tasks today.
  - **`planSource`** / **`planSourceRef`** / **`planJobId`** / **`brainstormPrompt`** — these are forward-compatibility fields in the schema but NOT populated on any task today. Components MUST render nothing (no chip, no link, no error) when these fields are `undefined` or `null`. The bookkeeper will start populating them over time as new tasks come through; existing tasks may stay un-populated indefinitely. Don't require these fields in the TS types — make them `string | null | undefined` so the data file's omission of the keys is valid.
  - `<SourceChip>` only renders when `planSource` is set AND not equal to `"fresh"`. `<JobLink>` only renders when `planJobId` is set. `<BrainstormBlock>` only renders when `brainstormPrompt` is set. Three independent gates, no inter-dependence.
- Live update smoke: with the dev server running, hand-edit `plans/overview-data.js` (e.g., flip a task's `phase` from `"impl-ready"` to `"shipped"`). Within 200ms the browser reflects the change. Expanded `<details>` rows remain expanded. Search input keeps its value. Scroll position is preserved.
- `pnpm overview:build` emits `plans/overview.html` (singleFile-inlined or co-located with `overview-data.js`). Open the file from `file://` (double-click). Renders identically to dev mode (modulo the live-update behavior).
- URL filter (`?tasks=perf-WS3,1b-multidev`) works in both modes. (Matches plan #2's `parseTaskIdFilter()` at `plans/overview.html` line 3206 — same query-string param name, same comma-separated list semantics.)
- Hash navigation (`#cmd-perf-WS3`) scrolls to and expands the target task in both modes.
- Search input filters live in both modes.
- Copy-command button on each task row works (writes the prompt to clipboard).
- TypeScript build is strict (`strict: true`) and `pnpm overview:build` exits 0 with zero type errors.
- A new (or extended) `pnpm overview:validate` (from plan #2's `tools/overview/validate.mjs`) passes against the current data file.

## Worktree

`.worktrees/overview-vite-react/` per `plans/parallel-assignments.md` lines 10-11. Topic branch: `ralph/overview-vite-react`. Likely multiple commits — see staging.

## Staging (recommended sub-commits)

1. **Scaffold + hello-world.** Add the new workspace package, minimal `App.tsx` that renders the count of tasks from `window.OVERVIEW_DATA`. Verify `pnpm overview` dev server starts and shows the count. Verify HMR fires by hand-editing the data file. ~1 hour.
2. **Port styles.** Copy `plans/overview.html`'s `<style>` block to `tools/overview-viewer/src/styles.css` verbatim. Wire into `main.tsx` via `import './styles.css'`. ~30 min.
3. **Port command list.** Implement `<TaskCommand>` (the `<details>` row), render all tasks. Verify filter/search/copy-button/URL-banner work. Diff visually against static HTML. ~half-day.
4. **Port kanban.** Implement `<KanbanColumn>` + `<KanbanCard>`. Verify column counts and per-card styling (border colors for shipped, opacity, etc.). ~half-day.
5. **Port phase tree.** `<PhaseTree>` + `<PhaseTreeNode>`. The tree references task ids; resolve via the same data array. ~half-day.
6. **Port runs log.** `<RunsLog>` rendering the `runs[]` array. ~1-2 hours.
7. **Wire static build.** Configure `vite build` with `base: './'` and either `vite-plugin-singlefile` (one HTML, all CSS/JS inlined) OR plain build that emits `plans/overview.html` + `plans/overview-data.js` reference. Verify `file://` open works. ~1-2 hours.
8. **Replace static HTML.** Delete the old `plans/overview.html`, replace with `vite build` output. Wire `pnpm overview:build` to rebuild. Verify operator workflow end-to-end. ~30 min.
9. **Docs.** Update `parallel-assignments.md`, `codexu-roadmap.md`, root `README.md`, new `tools/overview-viewer/README.md`. ~30 min.

Each stage commits independently. Stage 8 is the destructive one (replaces the static HTML); operator should review stages 1-7 first.

## Common mistakes / confusion points

1. **React vs vanilla Vite tradeoff.** Vanilla Vite gives HMR for ~5 deps less and no JSX, but you re-implement the imperative bits (~400 LOC of filter/search/URL-banner). React is the right call HERE because the existing JS is component-shaped already. Do NOT downgrade to vanilla without operator sign-off — the upgrade path to inline edit + drag-drop is much harder without components.

2. **`base: './'` is mandatory for static `file://` viewing.** Without it, Vite emits asset URLs as `/assets/index-abc123.js` which the browser tries to load from filesystem root, failing. With `'./'`, URLs become relative (`./assets/...`), which works when `overview.html` and its assets are co-located.

3. **`vite-plugin-singlefile` simplifies static distribution** but complicates HMR/build parity. If singleFile is used, all CSS + JS are inlined into one HTML — great for sharing, breaks if any external image/font is referenced. If not used, build emits ~3-5 files and they must all live next to `overview-data.js`. Pick one strategy and document it in the package README. Recommend singleFile for simplicity.

4. **Don't import any network resource.** No web fonts, no external CSS, no API calls. Everything must work on `file://`. The current `overview.html` uses system fonts (`-apple-system, BlinkMacSystemFont, 'Segoe UI'`) — preserve that approach.

5. **`<details>` `open` state vs React component state.** The native `<details>`/`<summary>` HTML element manages its `open` attribute in the DOM. React's reconciler may NOT preserve this across re-renders. Two options:
   - Use native `<details>` and manage `open` via a ref + uncontrolled mode (`<details open={undefined}>` and never re-set it). Works but fragile.
   - Implement the expand/collapse via React state (`useState<boolean>`) and don't use `<details>` at all. Lose the keyboard accessibility built into `<details>`.
   - Hybrid: use `<details>` for accessibility + read its `open` attribute via ref + persist to localStorage on toggle. On data update from HMR, restore from localStorage.
   Recommend the hybrid via `usePersistentExpanded`. This is THE reason React earns its keep here over vanilla Vite.

6. **HMR double-mount in dev (StrictMode).** React 18 StrictMode re-runs effects twice in dev to catch bugs. This means effects subscribing to `window.OVERVIEW_DATA` updates will double-subscribe; if unsubscribe isn't clean, you'll get phantom re-renders. Standard React hygiene — return cleanup functions from every `useEffect`.

7. **Workspace addition needs `pnpm install` in root.** After adding `tools/overview-viewer` to `pnpm-workspace.yaml`, run `pnpm install` from the repo root to register the package and install deps. Don't `cd tools/overview-viewer && npm install` — that creates a non-workspace node_modules and breaks hoisting.

8. **Vite watching files OUTSIDE the project root.** `tools/overview-viewer/` is the Vite project root; `plans/overview-data.js` is outside. Vite by default doesn't watch outside-root files. Use `server.fs.allow` to permit reading, and the custom plugin to subscribe via `server.watcher.add(absolutePathToOverviewDataJs)` explicitly.

9. **Path resolution for the static build.** `vite build`'s `outDir: '../../plans'` writes outside the project root, which Vite warns about (and may prompt). Add `emptyOutDir: false` to preserve other files in `plans/`. Verify post-build that no `plans/*.md` files were deleted.

10. **CSS port losing dark/light theme.** The existing styles use `@media (prefers-color-scheme: light)` with CSS custom property overrides (lines ~22-37 in `overview.html`). Verbatim port — don't refactor to Tailwind or CSS-in-JS. The theme switch must keep working.

11. **Status badges should consume CSS classes from plan #1's shipped implementation.** The `StatusBadge` component reads `task.phase` + `task.status` and renders the right CSS class — emit `<span class="cmd-badge b-${task.phase}">` and optionally `<span class="cmd-status-mod ${task.status}">` for blocked/paused. Don't re-implement the phase→color mapping in TS — the 10 CSS classes already exist at lines ~852-880 of pre-refactor overview.html; port them to `src/styles.css` verbatim. Full enum (already in HTML today): brainstorm-{ready,in-progress,review}, plan-{ready,in-progress,review}, impl-{ready,in-progress}, shipped, closed. Modifier pill values: `ok`, `blocked`, `paused`.

15. **The existing `renderPhaseBadges()` JS function is the badge-rendering reference.** It maps phase → glyph + label (e.g., `plan-ready` → "📋 plan ready", `shipped` → "✅ shipped"). Port that mapping into the React `StatusBadge` component verbatim — the operator already memorized the glyphs.

12. **Don't add a backend or write-back from React.** This is a viewer, not an editor. The data flow is one-way: bookkeeper edits `overview-data.js` (text edit), React reads. Inline editing is Stage 6.5 (optional, future) and requires a dev-only write endpoint — out of scope here.

13. **Pre-commit hook for static build refresh.** If the team wants `plans/overview.html` to always match `plans/overview-data.js` on disk (so people who don't run the dev server see fresh state), add a pre-commit hook that runs `pnpm overview:build` when `overview-data.js` is staged. Optional but reduces drift.

14. **Workspace package name conflicts.** `@codexu/overview-viewer` — verify this name doesn't conflict with anything else in `packages/`. If `@codexu` scope isn't used elsewhere (the existing packages use `@slopus/` and unscoped names), pick a scope that fits convention. Acceptable alternatives: unscoped `codexu-overview-viewer`, or `@codexu-internal/overview-viewer`.

16. **Trusted-HTML escape hatch from plan #2.** Plan #2 deliberately carries trusted HTML fragments in two places: `kanbanCards[].html` (full inner HTML of `<div class="card">` — needed to round-trip rich `.card-meta` content like pills, icons, inline `<code>`, `<a>`) and `phaseTree` `raw` nodes (`{kind: 'raw', html}` for structural bullets like `1b.1`, `4a-4m` with inline styles). The React port consumes these via `dangerouslySetInnerHTML`:

    ```tsx
    // KanbanCard.tsx — accepts a kanbanCards[] entry, not a Task
    export function KanbanCard({ card, taskId }: { card: KanbanCardData; taskId: string }) {
      const className = card.cardClass ? `card ${card.cardClass}` : 'card';
      const style = card.inlineStyle ? parseInlineStyle(card.inlineStyle) : undefined;
      return (
        <div className={className} style={style} data-task-id={taskId}
             dangerouslySetInnerHTML={{ __html: card.html }} />
      );
    }

    // PhaseTreeNode.tsx — raw branch
    if (node.kind === 'raw') {
      return <span dangerouslySetInnerHTML={{ __html: node.html }} />;
    }
    ```

    **Security stance:** `plans/overview-data.js` is operator- and agent-authored. Trust is by convention, identical to today's hand-authored `plans/overview.html`. The data file never accepts user input from a browser. Use ESLint's `react/no-danger` rule at warn-level (not error) and silence with comments on these two component sites only — every other component continues to use JSX child syntax. Do NOT reconstruct the fragments as JSX in v1 — that path is high-risk and out of scope for both plan #2 and plan #3.

    The structured fields on the SAME schemas are NOT trusted HTML: `command.descriptionHtml`, `warnings[].html`, `phaseTree` task-ref nodes' `trailingHtml`. Treat those as future-tighten-able — wrap them with `dangerouslySetInnerHTML` for v1 parity, but a future plan can convert each to structured tokens without changing the data file's escape hatch.

## Out of scope

- Inline edit of task state from the UI (Stage 6.5 — separate plan if desired).
- Drag-drop to reorder kanban columns.
- WebSocket-backed multi-operator live presence.
- Migrating the bookkeeper agent to write directly to `overview-data.js` via the UI (still text-edits via Edit tool).
- Replacing `tools/render-roadmap.ts` (the existing standalone tool serves a different purpose — rendering ledger records into `codexu-roadmap.md`).
- Mobile-specific UI. The existing `overview.html` has minimal responsive breakpoints (`@media (max-width: 1100px)`); preserve those, don't redesign for mobile in this plan.

## Dependency notes

- Plan #1 (`task-phases.md`) — ✅ SHIPPED 2026-05-17. The phase + status data model is in place; the new React `StatusBadge` reads `task.phase` + `task.status` and renders the same CSS classes (`.cmd-badge.b-<phase>` + `.cmd-status-mod.<status>`).
- Plan #2 (`overview-data-split.md`) — ✅ SHIPPED 2026-05-17 at `9f81c1f8`. `plans/overview-data.js` is the source of truth (1630 lines); `plans/overview.html` renders from it via `renderTasks()` + `renderPhaseTree()` + `applyEnrichments()`. The React port replaces these three functions but consumes the same data file.
- After this lands, the bookkeeper SKILL (`.agents/skills/roadmap-and-overview/SKILL.md`) needs a small further update: add a "live-update viewing" subsection explaining the dev server URL. Plan #2 already rewrote the editing-procedure sections; this plan only adds the viewing sub-section.
- Downstream: an `inline-edit-task-state` plan becomes viable (Stage 6.5). Out of scope here but trivially layerable once React is in place.
