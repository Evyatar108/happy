# Overview Viewer

React + Vite port of `plans/overview.html`. The app reads the existing `window.OVERVIEW_DATA` sidecar from `plans/overview-data.js` and renders the roadmap dashboard from that shipped data contract.

## File Layout

- `overview.html` is the Vite HTML entry. Keep the sidecar script tag as `./overview-data.js` so the build can inline it and file URLs stay relative.
- `src/main.tsx` mounts the React app and imports the copied legacy CSS from `src/styles.css`.
- `src/App.tsx` wires the top-level dashboard surfaces, filters, hash navigation, and HMR data reload.
- `src/components/` contains the command rows, kanban, phase tree, Today panel, toolbar, static sections, and the `RecentActivity` sidebar rendered through the `Layout` component's right-side sidebar slot.
- `src/hooks/` and `src/utils/` hold testable behavior ported from the legacy static renderer, including `useActivityEvents` which streams Ralph activity from `/overview-activity.jsonl`.

## Development

Run the Vite server from the repo root:

```bash
pnpm overview
```

The dev server listens on `http://localhost:5173`. The custom Vite plugin serves `plans/overview-data.js` as `/overview-data.js`, watches it, and emits `overview-data:update`; the app fetches and re-executes the sidecar so edits appear without restarting Vite.

## Builds

Use the safe preview build before replacing the live static page:

```bash
pnpm overview:build:preview
```

This sets `OVERVIEW_BUILD_SAFE_NAME=1`, inlines `plans/overview-data.js`, writes the React artifact to `plans/overview.html.next`, and restores the existing `plans/overview.html`. Review `plans/overview.html.next` via `file://` before approving the destructive swap.

The live build is intentionally destructive:

```bash
pnpm overview:build
```

Without the safe-name flag, Vite emits the inlined artifact directly to `plans/overview.html`.

## Development Workflow

### Adding a component

1. Create `src/components/<Name>.tsx`. Use existing components as style references — they read data from props (typed via `OverviewData` / `OverviewTask` from `src/types.ts`) and lean on the verbatim ported CSS in `src/styles.css` for visual styling. Avoid Tailwind, CSS-in-JS, or inline `style` props for new visual rules — extend `styles.css` instead.
2. Wire the component into `src/App.tsx` (or its parent, e.g., `CommandList.tsx`).
3. Add a unit test. Vitest ships **two projects** (configured in `vitest.config.ts`):
   - **node project** — default. SSR-style assertions via `react-dom/server`. Tests live in `src/__tests__/<name>.test.tsx` and `src/__tests__/<name>.test.ts`. Most tests belong here — they assert against the rendered HTML string.
   - **jsdom project** — for Radix-surface interaction tests that need real DOM event simulation (focus, keyboard, portals). Tests live in `src/__tests__/interactions/**/*.test.tsx`, use `@testing-library/react` + `@testing-library/user-event`, and run under `jsdom`.

   Place a test in `interactions/` only when SSR can't cover it (Tooltip open/close, Dialog focus trap, click-outside dismiss, etc.). Default to the node project.

### Adding a hook

1. Create `src/hooks/use<Name>.ts`. Keep hooks pure — derive state from props/data, no side effects beyond `useEffect`/`useState`/`useMemo`.
2. If the hook touches `localStorage`, follow `usePersistentExpanded` as a template (key prefixes, JSON-encoded values, fail-open on parse errors).
3. Test against a `localStorage` stub or the rendered output of a host component.

### Adding a utility

1. Create `src/utils/<name>.ts`. Utilities should be pure functions with no React imports.
2. Test directly — utilities are the easiest layer to cover.

### Test, typecheck, build

```bash
# From the repo root or this directory:
pnpm --filter @codexu/overview-viewer typecheck
pnpm --filter @codexu/overview-viewer test
pnpm overview         # dev server with HMR on plans/overview-data.js
pnpm overview:build   # destructive: overwrites plans/overview.html
```

### How HMR works under the hood

The custom `overviewDataPlugin` in `vite.config.ts` wires three things:

1. **Serve middleware** at `/overview-data.js` — reads `plans/overview-data.js` from disk on every request, so the browser always gets the latest bytes (no Vite module-graph caching).
2. **Watcher** on `plans/overview-data.js` — emits a custom WebSocket event `overview-data:update` whenever the file mtime changes.
3. **`transformIndexHtml`** — for `pnpm overview:build`, inlines the sidecar contents into the artifact at build time, escaping `</script` so a malicious task entry cannot terminate the bundle.

A sibling `overviewRalphStatePlugin` in the same `vite.config.ts` wires the Ralph-pipeline state sidecar (`plans/overview-ralph-state.js`) with only **two** responsibilities — it intentionally does NOT own a watcher:

1. **Serve middleware** at `/overview-ralph-state.js` — reads `plans/overview-ralph-state.js` from disk on every request, mirroring the overview-data behavior.
2. **`transformIndexHtml`** — for `pnpm overview:build`, inlines the Ralph state sidecar into the artifact at build time, escaping `</script` with the same hardening as the overview-data inline path.

The `overview-ralph-state:update` HMR event is emitted by an **external watcher** (owned by Plan 02, not by `overviewRalphStatePlugin`). An effect in `src/App.tsx` subscribes to that event via `import.meta.hot.on('overview-ralph-state:update')` and re-fetches `/overview-ralph-state.js` with the same fetch + re-execute pattern used for overview-data, mirroring the App.tsx subscription shape.

Client side, an effect in `src/App.tsx` subscribes to the WS event via `import.meta.hot.on('overview-data:update')` and invokes the inline `reloadOverviewData()` helper, which fetches `/overview-data.js?t=<cache-bust>`, evaluates the response body with `new Function(text)()` so `window.OVERVIEW_DATA` repopulates, then triggers a React re-render. Reconciliation preserves DOM state (open `<details>`, scroll, search filter, bulk-select). The loader is intentionally NOT factored out into a `src/hooks/useOverviewData` hook — keeping it inline avoids cycles with `import.meta.hot` typing and the data is a global, not a hook-shaped resource.

This is **option (c) — fetch + re-execute**. Do not switch to option (a) ws-payload (pushing the data through the WS message) or option (b) virtual-module (importing the sidecar as a module) without operator approval — option (c) is the only design that keeps the dev server, the static build, and the trusted-HTML semantics consistent.

## Intentional Deviations — phase-tree + command-list ordering (vs 9f81c1f8 baseline)

Three deliberate data-driven ordering improvements that the renderer applies on top of the data file's natural order:

1. **Phase-tree `deferred` class** — the phase tree derives task-ref classes from the referenced task instead of trusting legacy `phaseTree[].nodes[].state`: `shipped` maps to `donefade`, `closed` maps to `closed`, `blocked` or `paused` status maps to `deferred`, and everything else maps to `open`. The `deferred` class for blocked/paused task refs is an e-ink readability improvement.

2. **Command-row sub-order — blocked/paused to tail** — within each phase bucket in the Ralph command list, rows with `data-task-status="blocked"` or `"paused"` fall to the tail (+1 CSS `order` offset). The baseline ordered command rows by phase only and interleaved blocked/paused rows with their non-blocked peers in the same bucket; this is a UX improvement so the actionable rows stay at the top of each bucket. Implemented in `src/styles.css` via combined attribute selectors on the existing `data-cmd-status` + `data-task-status` attributes.

3. **Command-row secondary sort — oldest `lastTouchedAt` first** — within each phase bucket (and within each blocked/non-blocked sub-bucket), tasks are sorted ascending by `lastTouchedAt` so the most-neglected work surfaces at the top. Tasks without a `lastTouchedAt` field fall to the bottom of their bucket. Stable sort preserves the manual order in `plans/overview-data.js` for tasks with equal/missing timestamps. The baseline rendered command rows in DOM source order with no secondary key. Implemented in `src/components/CommandList.tsx` via `sortTasksByLastTouchedAsc`; covered by `src/__tests__/commandSort.test.ts`.

## Polish features (post 9f81c1f8)

Behaviors added by the `overview-viewer-polish` effort (US-001..US-011). Each lists the load-bearing file, dependency, or storage key so future contributors can extend without colliding.

- **Global `prefers-reduced-motion` guard (US-006)** — `src/styles.css` early `@media (prefers-reduced-motion: reduce)` block neutralizes all subsequent animations and transitions. JS scroll behavior is the one gap (tracked as F-002 in the replan queue).
- **Smooth `<details>` expand/collapse (US-001)** — `styles.css` uses `interpolate-size: allow-keywords` + a height transition on `details[open] > .cmd-body`. Browsers without `interpolate-size` snap instantly.
- **Search-hit highlighting (US-002)** — `src/utils/searchHighlighting.ts` wraps case-insensitive matches in `<mark class="search-match">` over text-node positions only (skips HTML tags and `<code>` blocks). Highlighting respects the filter haystack; query is `escapeRegExp`-sanitized.
- **Hash-nav smooth-scroll + flash pulse (US-003)** — `src/hooks/useHashNav.ts` + `src/utils/commandNavigation.ts` + `src/utils/flashCommandElement.ts`. Hash arrivals expand the row, call `scrollIntoView({behavior:'smooth', block:'center'})`, then apply the `cmd-flash` keyframe for 1.5s. Reuse via `navigateToCommand(taskId)`.
- **Sticky-toolbar elevation (US-004)** — `styles.css` uses `animation-timeline: scroll()` to fade in `box-shadow` over the first 24px of scroll. Browsers without scroll-driven CSS animations get the static shadow. **Important:** the original Phase A version also interpolated `backdrop-filter: blur()` — that was dropped because the sticky + blur + scroll-timeline combination caused scroll jank.
- **Bucket-count chips (US-005)** — `Kanban.tsx` shows visible ready / soon / blocked counts; `CommandList.tsx` shows visible brainstorm / inprogress / ready / shipped / closed counts. Styling reuses the existing `.section-counts` span — no new CSS classes.
- **Copy-Command success toast (US-007)** — `src/components/CopyToast.tsx` + `src/hooks/useToast.ts`. Copy buttons call `copyTextWithToast(...)` and receive `showToast` from App's single `useToast()` instance. The boolean return from `writeClipboard` drives both the toast and the temporary `.copy-btn.copied` class.
- **Per-row quick-actions strip (US-008)** — `QuickActions` block in `TaskCommand.tsx`. Copy actions stay on the `copyTextWithToast(...)` path; parent/child jumps call `navigateToCommand(...)`; kanban jumps target `kanban-card-<taskId>-0` IDs.
- **Density toggle (US-009)** — `src/hooks/useDensity.ts` + `body.compact` class + versioned `codexu-overview-density-v1` localStorage key. Do not introduce a parallel density store or component-local body mutation.
- **Radix Tooltip on WorkstreamPill (US-010)** — `@radix-ui/react-tooltip`. Hover/focus reveals the workstream label. Reuse the `WorkstreamPill` pattern for any future pill that needs a hover/focus tooltip — do not reintroduce `title=` attributes for keyboard-invisible hints.
- **Radix Dialog for KeyboardHelp (US-011)** — `@radix-ui/react-dialog`. `?` keyboard shortcut and the toolbar trigger both open the same Radix Dialog. `App` owns `helpOpen` state so the two triggers stay in sync. Dialog z-index ≥ 100 to render above `.kbd-help`-style surfaces.

## Dependencies

Runtime:
- `react`, `react-dom` — 19.x
- `vite` + `@vitejs/plugin-react` — dev server + build
- `vite-plugin-singlefile` — inlines bundle into one HTML for `file://` distribution
- `@radix-ui/react-tooltip` — WorkstreamPill hover/focus tooltip (US-010)
- `@radix-ui/react-dialog` — KeyboardHelp modal (US-011)

Dev / test only:
- `vitest` — test runner with split projects
- `@testing-library/react` + `@testing-library/user-event` + `jsdom` — interactions project (Radix surface tests)
- `esbuild` — invoked inside `vite.config.ts` to minify the inlined `overview-data.js` sidecar so the static build stays under the 500 KB single-file budget
- `typescript`, `@types/react`, `@types/react-dom`, `@types/node` — types only
