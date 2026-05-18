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

## Intentional Deviations

Three deliberate UX improvements over the `9f81c1f8` baseline:

1. **Phase-tree `deferred` class** — the phase tree derives task-ref classes from the referenced task instead of trusting legacy `phaseTree[].nodes[].state`: `shipped` maps to `donefade`, `closed` maps to `closed`, `blocked` or `paused` status maps to `deferred`, and everything else maps to `open`. The `deferred` class for blocked/paused task refs is an e-ink readability improvement.

2. **Command-row sub-order — blocked/paused to tail** — within each phase bucket in the Ralph command list, rows with `data-task-status="blocked"` or `"paused"` fall to the tail (+1 CSS `order` offset). The baseline ordered command rows by phase only and interleaved blocked/paused rows with their non-blocked peers in the same bucket; this is a UX improvement so the actionable rows stay at the top of each bucket. Implemented in `src/styles.css` via combined attribute selectors on the existing `data-cmd-status` + `data-task-status` attributes.

3. **Command-row secondary sort — oldest `lastTouchedAt` first** — within each phase bucket (and within each blocked/non-blocked sub-bucket), tasks are sorted ascending by `lastTouchedAt` so the most-neglected work surfaces at the top. Tasks without a `lastTouchedAt` field fall to the bottom of their bucket. Stable sort preserves the manual order in `plans/overview-data.js` for tasks with equal/missing timestamps. The baseline rendered command rows in DOM source order with no secondary key. Implemented in `src/components/CommandList.tsx` via `sortTasksByLastTouchedAsc`; covered by `src/__tests__/commandSort.test.ts`.
