---
name: roadmap-and-overview
description: >
  Procedure for maintaining the codexu roadmap visualization. The
  dashboard is rendered by the React/Vite app under
  `tools/overview-viewer/` and ships as a generated `plans/overview.html`
  artifact backed by the sidecar data file `plans/overview-data.js`. Use
  when adding a new task, changing a task's status, recording a
  run/completion, adding a workstream category, or extending the
  visualization with a new feature. The dashboard renders from
  `window.OVERVIEW_DATA`; edit `plans/overview-data.js` for normal
  bookkeeping, and for renderer/UI changes edit
  `tools/overview-viewer/src/` and rebuild via `pnpm overview:build`
  (never hand-edit `plans/overview.html`).
---

# /roadmap-and-overview - maintain the codexu roadmap dashboard

## Fresh-agent orientation

This skill is for operator-side bookkeeping. Ralph implementation agents
ship code in isolated worktrees and report the dashboard delta; the
bookkeeper records that delta in `plans/overview-data.js`, verifies the
page still renders, and commits the bookkeeping change.

Start every session by reading:

1. `plans/overview-data.js` - source of truth for task rows, kanban cards,
   phase tree, run history, metadata maps, and freshness timestamps.
2. `plans/overview.html` - generated build artifact produced by
   `pnpm overview:build` from `tools/overview-viewer/`. Do not hand-edit;
   renderer/UI changes go to `tools/overview-viewer/src/` (see procedures
   F and G).
3. `plans/parallel-assignments.md` and `plans/codexu-roadmap.md` - context
   for phase/status definitions and long-form roadmap meaning.
4. `tools/overview-viewer/` - React/Vite renderer source and tests. Read
   this only when you need renderer context for procedure F or G; normal
   bookkeeping never touches it.

Before editing, run `git status` and confirm the current branch is the
bookkeeping branch you intend to commit on. If you are doing parent-repo
bookkeeping, `main` should usually be checked out.

## Source Files

- `plans/overview-data.js` - primary file for procedures A-F. It is a
  single top-level assignment: `window.OVERVIEW_DATA = { ... };`.
- `plans/overview.html` - generated build artifact emitted by
  `pnpm overview:build`. Do not hand-edit; regenerate it after renderer
  changes in `tools/overview-viewer/`.
- `tools/overview-viewer/src/` - React/Vite renderer source. All UI,
  component, hook, util, and `styles.css` changes live here (see procedures
  F and G). Tests live under `tools/overview-viewer/src/__tests__/`.
- `plans/parallel-assignments.md` - derived operator-facing command list and
  status table. Update when the operator expects markdown tracking to stay in
  sync, but never treat it as the canonical data source.
- `plans/codexu-roadmap.md` - durable roadmap context. Update only for
  material roadmap wording, not every status flip.

## Viewing

For interactive development of the roadmap viewer, run `pnpm overview` from
the repo root and open `http://localhost:5173`. The Vite app watches
`plans/overview-data.js` and reloads the shipped data contract without
restarting the server.

To rebuild the static file that can be opened via `file://`, run
`pnpm overview:build`; it emits the inlined artifact directly to
`plans/overview.html`.

The React renderer intentionally derives phase-tree task-ref classes from the
referenced task. `blocked` or `paused` tasks render with the `deferred` class,
which is a deliberate readability deviation from the `9f81c1f8` baseline.

A second deliberate deviation: in the Ralph command list, rows with
`status: "blocked"` or `"paused"` sort to the tail of their phase bucket
instead of interleaving with non-blocked rows in the same bucket. The baseline
ordered by phase only.

A third deliberate deviation: within each phase bucket in the Ralph command
list, tasks are sorted ascending by `lastTouchedAt` so neglected (oldest)
work surfaces at the top of its bucket. Tasks missing `lastTouchedAt` fall
to the tail. The baseline used DOM source order with no secondary key.

## Core Data Model

`plans/overview-data.js` owns this shape:

```js
window.OVERVIEW_DATA = {
  generatedAt: '2026-05-14T20:00:00Z',
  generatedFromCommit: 'd279d49d',
  tasks: [
    {
      id: 'task-id',
      scope: 'codexu',
      phase: 'plan-ready',
      status: 'ok',
      lastTouchedAt: '2026-05-13T19:30:00Z',
      mergeCommit: null,
      kanbanCards: [
        { column: 'ready', cardClass: null, inlineStyle: null, html: '...', order: 10 }
        // order-authoring note: `order` (numeric) takes precedence; `insertBeforeTaskId` is the fallback anchor only for cards that omit `order`. Do not set both on the same card.
      ],
      command: {
        name: 'task-id',
        descriptionHtml: 'Description fragment shown in the command row',
        warnings: [],
        planPrompt: '/plan-with-ralph "..."'
      }
    }
  ],
  phaseTree: [
    {
      id: 'phase-1',
      title: 'Phase 1 - Foundations',
      headerHtml: 'Phase 1 - Foundations <span class="ptag">parallel</span>',
      collapsible: false,
      collapsibleSummary: null,
      nodes: [
        { kind: 'task-ref', taskId: 'task-id', visibleText: 'Task label', state: 'open', trailingHtml: ' - context' },
        { kind: 'raw', html: '<span class="item-name deferred">Non-task bullet</span> - context' }
      ]
    }
  ],
  runs: [],
  periodic: {},
  cadence: {},
  lastTouched: { 'task-id': '2026-05-13T19:30:00Z' },
  effort: { 'task-id': 2 },
  risk: { 'task-id': 'medium' },
  workstream: { 'task-id': 'codex-spec' },
  sizeBucket: { 'task-id': 'small' },
  spawnedFrom: {}
};
```

Notes:

- `scope` is a free string consumed by copy-time preambles. Known values are
  `codexu`, `codex`, `codex|codexu`, `bookkeeping`, and
  `bookkeeping|codexu`.
- `phase` uses the 10-value phase enum from `plans/parallel-assignments.md`.
  `status` is `ok`, `blocked`, or `paused`.
- `command.planPrompt` is a decoded shell string. The renderer writes it with
  `textContent`, so do not HTML-encode `2>&1`, `<`, or `>` inside the data
  file.
- Rich HTML fragments in `descriptionHtml`, `warnings[].html`,
  `kanbanCards[].html`, `phaseTree[].headerHtml`, and `phaseTree raw.html`
  are trusted operator-authored fragments.
- Keep compatibility maps (`lastTouched`, `effort`, `risk`, `workstream`,
  `sizeBucket`, `spawnedFrom`) in sync with task entries until the renderer no
  longer reads them directly.

## Step-by-step Procedures

### A. Adding a new ralph task

1. Pick metadata: `id`, `title`, `scope`, `phase`, `status`, `workstream`,
   `sizeBucket`, `risk`, `effort`, optional `cadence`, optional `periodic`,
   optional `spawnedFrom`, and a single ISO timestamp for the edit.
2. Add one object to `OVERVIEW_DATA.tasks[]`. Keep the surrounding array
   formatting style; do not reformat the top-level object.
3. Add the same task id to `OVERVIEW_DATA.lastTouched`, `effort`, `risk`,
   `workstream`, and `sizeBucket`. If it was spawned by research, also add
   `OVERVIEW_DATA.spawnedFrom[childId] = parentId`.
4. If the task is periodic, add `cadence[id] = 'periodic'` and a
   `periodic[id]` schedule with `intervalDays`, `lastRunId`, and `nextDueAt`.
5. Add zero or more `kanbanCards[]` entries. Multiple cards per task are valid
   and common.
6. If the task belongs in the roadmap tree, add a `phaseTree[].nodes[]` entry
   via procedure E.
7. Bump `generatedAt` and `generatedFromCommit` in the same edit.

Working example based on the current `1b-multidev` entry in
`plans/overview-data.js`:

```js
{
  "id": "1b-multidev",
  "scope": "codexu",
  "phase": "plan-ready",
  "status": "ok",
  "lastTouchedAt": "2026-05-13T19:30:00Z",
  "kanbanCards": [
    {
      "column": "soon",
      "cardClass": null,
      "inlineStyle": null,
      "html": "\r\n      <div class=\"card-title\">Phase 1b sub-task 3 - multi-device discoverability hint</div>\r\n      <div class=\"sub\">Terminal-startup hint. Sprint E satisfied the \"tunnels protocol resolved\" gate. Re-read against finalized header + pair-complete shape, then assign.</div>\r\n      <div class=\"card-meta\">\r\n        <span class=\"pill area-cli\">happy-cli</span>\r\n        <span class=\"pill p-low\">low</span>\r\n        <span>~0.5 d</span>\r\n        <span class=\"sub\">roadmap §1b · plans/codex-seamless-multi-device.md</span>\r\n      </div>\r",
      "insertBeforeTaskId": "perf-WS2",
      "order": 10
    },
    {
      "column": "soon",
      "cardClass": null,
      "inlineStyle": null,
      "html": "\r\n      <div class=\"card-title\">Phase 1b sub-task 4 - multi-client approval fan-out</div>\r\n      <div class=\"sub\">Conflict-resolution UX when same approval fires on phone + laptop. Re-derive against tunnel-direct attach (no server relay).</div>\r\n      <div class=\"card-meta\">\r\n        <span class=\"pill area-cli\">happy-cli</span>\r\n        <span class=\"pill p-med\">medium</span>\r\n        <span>~0.5-1 d</span>\r\n      </div>\r",
      "insertBeforeTaskId": "perf-WS2",
      "order": 20
    },
    {
      "column": "soon",
      "cardClass": null,
      "inlineStyle": null,
      "html": "\r\n      <div class=\"card-title\">Phase 1b sub-task 5 - walkthrough verification</div>\r\n      <div class=\"sub\">Manual end-to-end verification of multi-device. Same tunnel re-derivation note.</div>\r\n      <div class=\"card-meta\">\r\n        <span class=\"pill area-multi\">manual</span>\r\n        <span>~1 d</span>\r\n      </div>\r",
      "insertBeforeTaskId": "perf-WS2",
      "order": 30
    }
  ],
  "command": {
    "name": "1b-multidev",
    "descriptionHtml": "Phase 1b sub-tasks 3+4 - multi-device discoverability + approval fan-out",
    "warnings": [
      {
        "className": "cmd-warn",
        "html": "⚠️ Conflicts with <code>mcp-discovery</code> (both touch <code>runCodex.ts</code>). Land mcp-discovery first, then 1b-multidev rebases trivially."
      }
    ],
    "planPrompt": "/plan-with-ralph \"Phase 1b sub-task 3 + 4 - multi-device discoverability hint and multi-client approval fan-out. Per plans/codexu-roadmap.md §Phase 1b sub-tasks 3-4 + docs/plans/codex-seamless-multi-device.md sub-tasks 3-4. Sub-task 3: terminal-startup hint when codex starts in a cwd that already has a discoverable app-server, pointing user at phone attach option. Files: packages/happy-cli/src/codex/codexAppServerClient.ts (discovery + startup messaging) + packages/happy-cli/src/ui/start.ts or equivalent. Sub-task 4: when multiple clients are attached (laptop TUI + phone via tunnel), an approval prompt from codex must fan out to all attached clients; first-answer-wins; remaining clients see resolution. Files: packages/happy-cli/src/codex/runCodex.ts + packages/happy-cli/src/codex/codexAppServerClient.ts approval-handler plumbing. CRITICAL CONTEXT: re-read docs/plans/codex-seamless-multi-device.md against the finalized post-Sprint-E tunnel protocol - the spec was drafted assuming relay-forwarded phone path, but tunnels attach phone DIRECTLY to CLI's local Socket.IO server (no relay). Specifically read the 'Walkthrough Step 5 fan-out semantics shift layer' note in roadmap §Phase 1b. Decide whether codex app-server's native fan-out covers tunneled clients OR whether CLI's lifted rpcHandler must broadcast - verify by tracing one approval event from codex → CLI → tunneled phone. Read packages/happy-cli/CLAUDE.md and packages/happy-cli/src/daemon/CLAUDE.md first. Acceptance: integration test for sub-task 3 (mock discovery file existence, assert hint message); integration test for sub-task 4 (mock two attached clients, fire approval, assert both receive + first-answer wins). Test command: pnpm --filter '{packages/happy-cli}' exec vitest run 2>&1 | tee /tmp/codexu-1b34.log. Single commit per sub-task (two commits).\""
  }
}

// Same edit, same timestamp:
OVERVIEW_DATA.lastTouched["1b-multidev"] = "2026-05-13T19:30:00Z";
```

### B. Marking a task as shipped

1. Find the landing commit(s) with `git log --oneline -10` and capture the
   short SHA plus commit ISO timestamp.
2. In the task object, set `phase: 'shipped'`, usually set `status: 'ok'`,
   and set `mergeCommit` when the shipped artifact has a merge SHA.
3. Update `command.descriptionHtml` so the command row says what shipped and
   includes the commit. Remove stale blocked/paused warnings.
4. Update each relevant `kanbanCards[]` entry. Typical shipped card style is
   `inlineStyle: 'border-color: var(--ok); opacity: 0.8;'`; update the card
   body to mention the shipped commit.
5. Append a `runs[]` record:

```js
{
  "id": "<taskId>/<YYYY-MM-DD>",
  "taskId": "<taskId>",
  "ranAt": "<commit ISO timestamp>",
  "outcome": "completed",
  "commits": ["<short sha>"],
  "summary": "One-line description of what landed."
}
```

6. Sweep dependents: search `tasks[]` warnings and descriptions for blockers
   that mention the shipped task. If a dependent is now unblocked, set its
   `status: 'ok'`, remove the warning, update its description, and bump its
   timestamp too.
7. When you set `tasks[x].lastTouchedAt = <new ISO>`, also set
   `OVERVIEW_DATA.lastTouched[<id>] = <new ISO>` in the same edit. The data
   file is invalid if these drift; the page freshness hint and ordering will
   be wrong until corrected.
8. Bump `generatedAt` and `generatedFromCommit`.

Multi-commit rules:

- Codex-submodule tasks: list the codex-side content commit first and the
  codexu pointer-bump commit second.
- Topic-branch landings: list the topic branch tip first and the merge SHA
  second, e.g. `['756d4290', 'merge e71497eb']`.

### C. Recording a periodic task run

Use procedure B for the `runs[]` entry, then update periodic scheduling:

1. Keep the durable task `phase` at the phase it should return to after the
   run, usually `plan-ready`.
2. Set `periodic[taskId].lastRunId` to the new run id.
3. Recompute `periodic[taskId].nextDueAt = ranAt + intervalDays`.
4. Set `cadence[taskId] = 'periodic'` if missing.
5. Update `lastTouchedAt`, `lastTouched[taskId]`, `generatedAt`, and
   `generatedFromCommit`.

### D. Marking a task paused / blocked

1. Keep `phase` as the durable lifecycle state and set `status: 'paused'` or
   `status: 'blocked'`.
2. Add or update `command.warnings[]` with a clear operator-facing reason.
   Use `className: 'cmd-warn'` for paused and `className: 'cmd-warn blocked'`
   for hard blockers.
3. Adjust `command.descriptionHtml` to mention the paused/blocked state only
   when that helps scanning.
4. If the task has a kanban card, update `inlineStyle` or `html` to show the
   state without moving unrelated cards.
5. When you set `tasks[x].lastTouchedAt = <new ISO>`, also set
   `OVERVIEW_DATA.lastTouched[<id>] = <new ISO>` in the same edit. The data
   file is invalid if these drift; the page freshness hint and ordering will
   be wrong until corrected.
6. Bump `generatedAt` and `generatedFromCommit`.

### E. Editing the phase tree

`OVERVIEW_DATA.phaseTree[]` is not derived from `tasks[]`; it is a curated
roadmap outline. The final node schema is `{kind: 'task-ref'|'raw', taskId?,
state?, html?}` with `visibleText` and `trailingHtml` allowed on task-ref
nodes when the rendered label/tail needs to preserve authored wording. Node
examples:

```js
{ kind: 'task-ref', taskId: '1b-multidev', visibleText: '1b.3 Multi-device discoverability hint', state: 'open', trailingHtml: ' - unblocked, re-read' }
{ kind: 'raw', html: '<span class="item-name deferred">4a-4m Coexistence verification</span> - gated' }
```

- `kind: 'task-ref'` links to an existing task. `state` is the CSS state class
  for the phase-tree label: `open`, `deferred`, `donefade`, or `closed`.
  `visibleText` is the stable label to render if the task has no `title`.
  `trailingHtml` is trusted rich text after the item label.
- `kind: 'raw'` is for non-task bullets, composite bullets with multiple item
  names, inline styles, or anything too irregular for `task-ref`.
- A phase can carry `headerHtml` for headers with `<span class="ptag">...`.
  `collapsible: true` wraps nodes in `<details class="phase-subdetails">`
  and uses `collapsibleSummary` for the nested summary.

Worked edit example:

```js
// Before
{
  "id": "phase-1",
  "title": "Phase 1 - Foundations",
  "headerHtml": "Phase 1 - Foundations <span class=\"ptag\">parallel</span>",
  "nodes": [
    { "kind": "raw", "html": "<span class=\"item-name donefade\">1b.2 Discovery + reattach</span>" },
    { "kind": "task-ref", "taskId": "1b-multidev", "visibleText": "1b.3 Multi-device discoverability hint", "state": "open", "trailingHtml": " - unblocked, re-read" }
  ]
}

// After shipping 1b-multidev and removing an obsolete raw bullet
{
  "id": "phase-1",
  "title": "Phase 1 - Foundations",
  "headerHtml": "Phase 1 - Foundations <span class=\"ptag\">parallel</span>",
  "nodes": [
    { "kind": "task-ref", "taskId": "1b-multidev", "visibleText": "1b.3 Multi-device discoverability hint", "state": "donefade", "trailingHtml": " - shipped 197b0148" }
  ]
}
```

### F. Adding a new workstream

1. Add the new workstream key to each relevant task in
   `OVERVIEW_DATA.workstream`.
2. In `tools/overview-viewer/src/components/Toolbar.tsx`, add a chip entry
   to the `workstream` group inside `FILTER_GROUPS`, and add a matching
   display label to the `WORKSTREAM_LABELS` map in
   `tools/overview-viewer/src/components/TaskCommand.tsx`.
3. Run `pnpm overview:build` so the inlined `plans/overview.html` artifact
   picks up the renderer change, and verify the filter chip, workstream pill,
   and URL filter still compose.

This is one of the few normal procedures that touches both the data file and
the React renderer source, because filter labels are renderer UI. Do not
hand-edit `plans/overview.html`; it is a generated build artifact and your
change would be lost on the next `pnpm overview:build`.

### G. Adding a visualization feature

1. Decide whether the feature is data-only or renderer/UI. Data-only fields go
   into `plans/overview-data.js`; renderer/UI changes go into
   `tools/overview-viewer/src/` (TSX components, hooks, utils, and
   `styles.css`), then rebuild via `pnpm overview:build` to regenerate
   `plans/overview.html`. Do not hand-edit `plans/overview.html`; it is a
   generated build artifact and your change would be lost on the next
   `pnpm overview:build` (and would also bypass the test suite under
   `tools/overview-viewer/src/__tests__/`).
2. Preserve `file://` compatibility for the built artifact. Do not add
   fetch-only data loading; the build inlines `overview-data.js`.
3. Keep `overview-data.js` as one top-level `window.OVERVIEW_DATA = { ... };`
   assignment. No IIFE, no module syntax, no conditional setup.
4. Match existing CSS tokens and compact dashboard styling. Test dark, light,
   and narrow viewport when browser tooling is available.
5. If you add localStorage, use a new versioned key. Current keys:
   `codexu-overview-details-state-v2` (open/closed state),
   `codexu-overview-last-visit-v1` (what's-new banner),
   `codexu-overview-notes-v1` (operator scratch notes), and
   `codexu-overview-density-v1` (comfortable / compact row density, toggles
   `body.compact`). The details key is `v2`; do not resurrect the old
   `codexu-overview-details-state-v1` name. The density key is `v1`; do not
   introduce a parallel density store or component-local `body.compact`
   mutation — reuse `useDensity()` from the renderer.

## Pitfalls

- **JS string escaping in `overview-data.js`.** Decode HTML entities exactly
  once when porting prompt text (`&lt;`, `&gt;`, `&amp;` become `<`, `>`, `&`).
  Store prompt text as JS string data and let the renderer write it with
  `textContent`; never re-encode entities in render. Prefer single-quoted or
  JSON-style double-quoted literals with explicit backslash escapes for the
  surrounding quote. Avoid template literals for prompt bodies because prompts
  contain markdown backticks and shell fragments.
- **lastTouched dual-update invariant.** Every status/metadata edit must update
  both `task.lastTouchedAt` and `OVERVIEW_DATA.lastTouched[task.id]` to the
  same ISO timestamp. Common mistake: changing `task.lastTouchedAt` during a
  shipped close-out but leaving `lastTouched[taskId]` at the old value; the UI
  then sorts and highlights by stale data.
- **Skeleton-ownership invariant.** Each story PRD mutates only its own array
  body (`tasks[]` for task ports, `phaseTree[]` for phase-tree ports, specific
  map entries for bookkeeping). Never reformat the top-level object literal,
  reorder top-level keys, or rewrite braces/comma layout as drive-by cleanup.
  That skeleton is owned by the foundation story and preserves parallel merge
  safety.
- **`overview-data.js` must load before the React bundle.** The built
  `plans/overview.html` inlines the sidecar via the build pipeline; in dev
  (`pnpm overview`), the custom Vite plugin serves `plans/overview-data.js` at
  `/overview-data.js` so `window.OVERVIEW_DATA` is populated before React mounts;
  HMR re-fetch is wired by the inline `reloadOverviewData()` helper in
  `tools/overview-viewer/src/App.tsx`. Do not switch the sidecar to async/module
  loading or fetch-only data delivery.
- **`data-task-id` and `id="cmd-<taskId>"` are load-bearing.** Rendered command
  rows must emit both. URL hash navigation, filters, copy-name buttons, run
  history, and spawned-from pills depend on them.
- **Phase/status separation is load-bearing.** `phase` is durable lifecycle;
  `status` is a temporary availability modifier. Do not turn a blocked task
  into a fake phase.
- **Multiple kanban cards per task are normal.** Do not collapse
  `kanbanCards[]` to a single column field.
- **`spawnedFrom` is one-directional and flat.** Store child -> parent. The
  renderer computes parent -> children at runtime.
- **Ralph agents must work in isolated worktrees.** Bookkeeping tasks may edit
  the dashboard files directly, but implementation agents should not commit on
  the parent repo's `main` while they are doing feature work.

## Action-button cluster (`.cmd-actions`)

Every rendered `<div class="cmd-body">` gets a `.cmd-actions` flex wrapper.
The wrapper owns positioning and spacing for Copy Command, Copy Name, Notes,
and future action buttons. When adding a new button, call the existing
`getOrCreateCmdActions(body)` helper and append the button; do not add another
absolute-positioned button rule.

## Copy-time preambles - driven by `data-task-scope`

Each command row carries a `scope` field that renders to `data-task-scope`.
The Copy Command button injects preambles from that scope:

| Scope label | Effect |
|---|---|
| `bookkeeping` | Suppresses the default "do not edit dashboard files" preamble. |
| `codexu` | Injects the codexu worktree preamble. |
| `codex` | Injects the codex-submodule worktree preamble. |
| `codex|codexu` | Injects the dual-repo preamble. |

Default to `codexu` for typical happy-* work. Use `bookkeeping` only when the
task deliverable really is a dashboard/roadmap data edit.

## URL filtering

The command list supports `?tasks=<comma-separated-task-ids>`. It composes
with axis filters and search. If you add task ids, keep them stable; shared
links depend on them.

## File map

```
plans/
├── codexu-roadmap.md
├── parallel-assignments.md
├── realtime-sync-perf.md
├── overview.html        # generated artifact - see tools/overview-viewer/
└── overview-data.js

tools/overview-viewer/
├── README.md
├── overview.html        # Vite entry (NOT the artifact in plans/)
├── package.json
├── vite.config.ts
└── src/
    ├── App.tsx
    ├── components/
    ├── hooks/
    ├── utils/
    └── styles.css

.agents/skills/
└── roadmap-and-overview/
    └── SKILL.md
```

`plans/overview.html` is generated from `tools/overview-viewer/` via
`pnpm overview:build`.

## When NOT to use this skill

- If you are implementing a product feature, follow the ralph task prompt
  instead. This skill is for maintaining the dashboard and roadmap data.
- If you are trying to regenerate the whole dashboard from scratch, stop and
  read `tools/overview-viewer/src/` (App.tsx + components + hooks) and
  `plans/overview-data.js` end-to-end first; `plans/overview.html` is a
  generated artifact and is not a useful study target. Keep normal bookkeeping
  patch-based.
