# Overview Viewer

React + Vite port of `plans/overview.html`. The app reads the existing `window.OVERVIEW_DATA` sidecar from `plans/overview-data.js` and renders the roadmap dashboard from that shipped data contract.

## File Layout

- `overview.html` is the Vite HTML entry. Keep the sidecar script tag as `./overview-data.js` so the build can inline it and file URLs stay relative.
- `src/main.tsx` mounts the React app and imports the copied legacy CSS from `src/styles.css`.
- `src/App.tsx` wires the top-level dashboard surfaces, filters, hash navigation, and HMR data reload.
- `src/components/` contains the command rows, kanban, phase tree, Today panel, toolbar, and static sections.
- `src/hooks/` and `src/utils/` hold testable behavior ported from the legacy static renderer.

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
3. Add a unit test under `src/__tests__/<name>.test.tsx`. Tests run in `node` environment via `react-dom/server` for SSR — avoid jsdom unless you genuinely need DOM event simulation (most existing tests assert on the rendered HTML string).

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

Client side, an effect in `src/App.tsx` subscribes to the WS event via `import.meta.hot.on('overview-data:update')` and invokes the inline `reloadOverviewData()` helper, which fetches `/overview-data.js?t=<cache-bust>`, evaluates the response body with `new Function(text)()` so `window.OVERVIEW_DATA` repopulates, then triggers a React re-render. Reconciliation preserves DOM state (open `<details>`, scroll, search filter, bulk-select). The loader is intentionally NOT factored out into a `src/hooks/useOverviewData` hook — keeping it inline avoids cycles with `import.meta.hot` typing and the data is a global, not a hook-shaped resource.

This is **option (c) — fetch + re-execute**. Do not switch to option (a) ws-payload (pushing the data through the WS message) or option (b) virtual-module (importing the sidecar as a module) without operator approval — option (c) is the only design that keeps the dev server, the static build, and the trusted-HTML semantics consistent.

## Intentional Deviations

Three deliberate UX improvements over the `9f81c1f8` baseline:

1. **Phase-tree `deferred` class** — the phase tree derives task-ref classes from the referenced task instead of trusting legacy `phaseTree[].nodes[].state`: `shipped` maps to `donefade`, `closed` maps to `closed`, `blocked` or `paused` status maps to `deferred`, and everything else maps to `open`. The `deferred` class for blocked/paused task refs is an e-ink readability improvement.

2. **Command-row sub-order — blocked/paused to tail** — within each phase bucket in the Ralph command list, rows with `data-task-status="blocked"` or `"paused"` fall to the tail (+1 CSS `order` offset). The baseline ordered command rows by phase only and interleaved blocked/paused rows with their non-blocked peers in the same bucket; this is a UX improvement so the actionable rows stay at the top of each bucket. Implemented in `src/styles.css` via combined attribute selectors on the existing `data-cmd-status` + `data-task-status` attributes.

3. **Command-row secondary sort — oldest `lastTouchedAt` first** — within each phase bucket (and within each blocked/non-blocked sub-bucket), tasks are sorted ascending by `lastTouchedAt` so the most-neglected work surfaces at the top. Tasks without a `lastTouchedAt` field fall to the bottom of their bucket. Stable sort preserves the manual order in `plans/overview-data.js` for tasks with equal/missing timestamps. The baseline rendered command rows in DOM source order with no secondary key. Implemented in `src/components/CommandList.tsx` via `sortTasksByLastTouchedAsc`; covered by `src/__tests__/commandSort.test.ts`.
