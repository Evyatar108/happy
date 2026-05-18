# @codexu/overview-viewer Notes

Vite + React 18 + TypeScript renderer for the codexu roadmap dashboard. Consumes the `window.OVERVIEW_DATA` global emitted by `plans/overview-data.js` (the hand-edited data file) and produces two outputs:

- **Dev server** (`pnpm overview` from repo root): `http://127.0.0.1:5173/` with HMR re-execution of the sidecar on every save of `plans/overview-data.js` — `<details>` open state, scroll position, search filter, and bulk-select all preserved across updates.
- **Static build** (`pnpm overview:build` from repo root): a singleFile-inlined `plans/overview.html` that opens via `file://` double-click with no external `<script src>` or `<link href>` references.

## Source of truth

- Task data lives in `plans/overview-data.js` (hand-edited by bookkeepers — never modify it from inside this package).
- Renderer behavior lives entirely in `src/` under this package.
- `plans/overview.html` at the repo root is a generated artifact. **Never hand-edit it.** Renderer changes go in `src/`, then `pnpm overview:build` regenerates the artifact.

## Layout

```
src/
├── App.tsx               # top-level composition; reads window.OVERVIEW_DATA via useOverviewData hook
├── main.tsx              # React entry; imports styles.css
├── styles.css            # verbatim port of plans/overview.html:6-1060 CSS (no Tailwind, no CSS-in-JS)
├── components/           # TaskCommand, Kanban, PhaseTree, CommandList, Toolbar, TodayPanel, ...
├── hooks/                # useOverviewData, useTaskClassification, useBulkSelection, useMultiAxisFilter, ...
├── utils/                # taskClassification, kanbanOrdering, copyCommand, urlFilter, whatsNew, freshness, ...
└── __tests__/            # vitest unit tests (10 files / 24 tests; env: node)
overview.html             # Vite entry (NOT the build artifact in plans/)
vite.config.ts            # includes the custom overviewDataPlugin (HMR sidecar watcher + serve + singleFile inline)
vitest.config.ts          # env: node, include: src/__tests__/**/*.test.{ts,tsx}
README.md                 # contributor-facing notes + intentional deviations
```

## Intentional deviations from the 9f81c1f8 baseline

Three deliberate UX improvements; full rationale in `README.md`:

1. **Phase-tree `deferred` class** — `blocked`/`paused` task refs render with the `deferred` class instead of legacy `phaseTree[].nodes[].state`. E-ink readability improvement.
2. **Command-row sub-order — blocked/paused to tail of bucket** — combined CSS attribute selectors on `data-cmd-status` + `data-task-status` push blocked/paused rows to the tail of each phase bucket.
3. **Command-row secondary sort — oldest `lastTouchedAt` first** — `sortTasksByLastTouchedAsc` in `CommandList.tsx` surfaces neglected work at the top of each bucket. Tasks without `lastTouchedAt` fall to the tail. ES2019+ stable sort preserves manual order in the data file for tasks with equal/missing timestamps.

## HMR mechanism (option c — fetch + re-execute)

The custom Vite plugin in `vite.config.ts`:

1. Serves `plans/overview-data.js` at `/overview-data.js` via dev middleware.
2. Watches the file path. On change, emits a custom WebSocket event `overview-data:update`.
3. `useOverviewData` subscribes via `import.meta.hot.on('overview-data:update')`, re-fetches with a cache-busting query string, and re-executes via `new Function(text)()` so `window.OVERVIEW_DATA` repopulates.
4. React re-renders; reconciliation preserves DOM state (open `<details>`, scroll, search filter, bulk-select).

**Do not switch the sidecar to async / module loading or fetch-only delivery.** The static build inlines the sidecar; the dev server serves it synchronously before the React bundle runs. Both depend on the `window.OVERVIEW_DATA` global being populated before the first `useOverviewData` read.

## Trusted-HTML boundaries

Six `dangerouslySetInnerHTML` sites consume operator-authored HTML strings from the data file (kanban card html, command description html, phase-tree node html, static parallelism/dependencies tables). These are NOT user input — the data file is hand-curated.

- `linkBlockedOnHtml` (in `utils/warnings.ts`) escapes regex metacharacters in task IDs before building matchers.
- The Vite plugin escapes `</script` inside the inlined data sidecar so a malicious task entry cannot terminate the bundle.

## Adding a feature

See `.agents/skills/roadmap-and-overview/SKILL.md` Procedure G for the bookkeeper-facing protocol. Short version:

1. Add the component/hook/util under `src/`.
2. Add a unit test under `src/__tests__/`.
3. Run `pnpm --filter @codexu/overview-viewer typecheck` and `pnpm --filter @codexu/overview-viewer test` (or run from this directory with the same flags).
4. Run `pnpm overview` and verify the change live in a browser.
5. Run `pnpm overview:build` so the inlined `plans/overview.html` artifact picks up the change.
6. Commit all of: `src/` changes, the regenerated `plans/overview.html`, and any updated tests.

## Cross-package

This package is registered in BOTH `pnpm-workspace.yaml` AND root `package.json` → `workspaces.packages`. Dropping either yields silent breakage of pnpm filtering and lockfile resolution.
