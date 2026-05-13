---
name: dev
description: >
  Local development guide for the Happy monorepo. How to build, install,
  test, and run the CLI, server, mobile app, and desktop (Tauri) locally.
  Use when the user types /dev, asks how to "build", "start dev", "install
  locally", or "run the ___ package".
---

# /dev - Local Development

Happy is a pnpm monorepo. Everything uses pnpm workspaces — do not use `npm` or `yarn` directly.

## First-time setup

```bash
pnpm install                       # installs deps for every package
pnpm --filter happy cli:install    # builds happy-cli + links it as the global `happy` binary
```

`cli:install` replaces whatever `happy` is on your PATH (npm-installed or not) with a symlink to `packages/happy-cli/`. Daemon is restarted as part of the script. Uses `~/.happy/` — same as production.

To undo: `npm unlink -g happy && npm i -g happy@latest`.

## Packages

    packages/happy-cli     # the `happy` CLI and daemon, published to npm
    packages/happy-server  # Node + Prisma server, deployed via TeamCity
    packages/happy-app     # Expo app: iOS, Android, web, Tauri desktop
    packages/happy-agent   # agent runtime
    packages/happy-wire    # shared Zod schemas + wire types

## happy-cli

    packages/happy-cli
    scripts in package.json:
      typecheck      # tsc --noEmit
      build          # rm -rf dist && tsc --noEmit && pkgroll
      test           # build + vitest run
      cli:install    # build + stop daemon + npm link + start daemon
      prepublishOnly # pnpm test (runs build inside test)
      postinstall    # unpacks difft + rg binaries into tools/unpacked/

Work loop:

```bash
pnpm --filter happy cli:install   # rebuild + relink + restart daemon
happy daemon status               # confirm your build is running
happy doctor                      # list all happy processes
tail -f ~/.happy/logs/$(ls -t ~/.happy/logs/ | head -1)
```

Run a single test file quickly:

```bash
pnpm --filter happy exec vitest run src/path/to/file.test.ts
```

Unit-only (fast, ~1 min):

```bash
pnpm --filter happy exec vitest run --project unit
```

Integration tests hit real APIs and are flaky — run on demand, never in the release gate.

### Dev data sandbox (optional)

`happy` reads `HAPPY_HOME_DIR` to override `~/.happy/`. To run two versions side-by-side without touching your prod auth:

```bash
HAPPY_HOME_DIR=~/.happy-dev happy daemon start
HAPPY_HOME_DIR=~/.happy-dev happy auth
```

Point at a local server the same way:

```bash
HAPPY_SERVER_URL=http://localhost:3005 happy daemon start
```

## happy-server

```bash
pnpm --filter happy-server standalone:dev   # localhost:3005, embedded PGlite, no Docker
```

App auto-reloads on source changes. Point the CLI or the Expo app at it with `HAPPY_SERVER_URL=http://localhost:3005` / `EXPO_PUBLIC_HAPPY_SERVER_URL=...`.

## happy-app (Expo)

```bash
pnpm --filter happy-app start           # expo start (Metro bundler)
pnpm --filter happy-app ios:dev         # iOS simulator, development variant
pnpm --filter happy-app android:dev
pnpm --filter happy-app web             # web build, served locally
pnpm --filter happy-app tauri:dev       # macOS desktop app
```

Variants:

    development    com.slopus.happy.dev       # hot reload, internal
    preview        com.slopus.happy.preview   # OTA / beta testing
    production     com.ex3ndr.happy           # App Store

## happy-app-logs (remote log receiver)

```bash
pnpm --filter happy-app-logs dev       # starts on http://0.0.0.0:8787
```

Receives POST requests to `/logs` from the mobile app's patched console (see `consoleLogging.ts`).
Logs to stdout and `~/.happy/app-logs/<timestamp>.log`.

To connect: set the log server URL in the app's dev settings to `http://<LAN_IP>:8787`.
The app's `consoleLogging.ts` sends all console.log/warn/error to this endpoint when configured.

Console output must be enabled in the app (dev/preview variants default on, production defaults off,
togglable from the dev settings screen).

## Cross-cutting

- **Hoisted deps:** pnpm hoists node_modules to the repo root. `packages/*/node_modules/` is mostly empty. Node's resolution walks up, so imports work transparently.
- **Workspace deps:** `"@slopus/happy-wire": "workspace:*"` resolves to `packages/happy-wire/` — edits are picked up live.
- **`$npm_execpath`:** legacy; happy-cli uses `pnpm` literally. Windows cmd.exe doesn't expand `$VAR`.
- **Build before tests:** tests spawn the built CLI binary (for daemon integration), so `pnpm test` runs `build` first. Do not remove.
- **pnpm filter syntax:** `pnpm --filter happy-cli ...` **silently no-ops** because the package name in `packages/happy-cli/package.json` is `happy`, not `happy-cli`. Use the path-style filter: `pnpm --filter "{packages/happy-cli}" ...`. Same for `happy-app`, `happy-server`, etc.

## Capture long-running command output

Tests, typechecks, and full builds are slow (10s – 5min) and produce more output than fits in conversation context. **Always tee stdout+stderr to a log file** so the run can be re-inspected with grep / Read without re-executing. Re-run only when source has actually changed since the captured run.

```bash
# Test run:
pnpm --filter "{packages/happy-app}" exec vitest run 2>&1 | tee /tmp/codexu-app-tests.log

# Typecheck:
pnpm --filter "{packages/happy-cli}" exec tsc --noEmit 2>&1 | tee /tmp/codexu-cli-tc.log

# Cross-package:
pnpm --filter "{packages/happy-server}" --filter "{packages/happy-cli}" exec tsc --noEmit 2>&1 | tee /tmp/codexu-tc.log
```

Subsequent inspection:

```bash
grep -E "FAIL|×|✗|error TS" /tmp/codexu-*.log
```

## Codex submodule edits (minimize conflict surface)

`codex/` is a git submodule pointing at `gim-home/codex`. When a ralph plan needs codex source changes, follow `plans/codexu-roadmap.md` §"Codex changes — minimize upstream conflict surface":

1. **Avoid editing codex source if possible** — most happy-cli work doesn't need it; reading codex source for schema / call-site signatures is fine.
2. **When new behavior IS needed in codex, prefer a new package alongside** in `codex/codex-rs-overlay/`. The working precedents are `codex-copilot`, `codex-copilot-launcher`, and `codex-invariant-tests` (all overlay crates).
3. **If patching `codex/external/repos/codex-patched/codex-rs/` (the openai/codex subtree mirror) is unavoidable, keep the diff minimal** and surface to operator review — every local edit there creates a merge conflict on the next subtree pull.
4. **Work in a `.ralph/jobs/<name>/codex-worktree/`** git worktree of the submodule (`git -C codex worktree add ../.ralph/jobs/<name>/codex-worktree -b ralph/<name>`), not in the parent codexu's checkout. This isolates the agent's in-flight codex edits.
5. **Submodule pointer bumps in codexu** are a separate commit on codexu `main` after the codex-side commit lands and is pushed to `gim-home/codex`.

## Releasing

Do not publish by hand. Use `/release` — it handles npm publish, git tags, GitHub releases, and the smoke check.

## Troubleshooting

    happy: command not found     → pnpm --filter happy cli:install
    daemon won't start           → happy daemon stop; rm ~/.happy/daemon.state.json.lock; happy daemon start
    wrong `happy` version        → which happy && ls -la $(which happy) — confirms where it resolves to
    tools/unpacked missing       → pnpm install (postinstall re-extracts)
    stale deps after branch swap → pnpm install (pnpm is picky about lockfile drift)

## Rules

- Never use `npm install` or `yarn install` — only pnpm.
- Never add a `dev` / `cli` tsx-based script back to happy-cli. The build step is not optional — daemon spawns the built binary and would desync.
- Never bring back `release-it`. Releases go through `/release`.
- Never introduce `~/.happy-dev` as a default. It exists as an opt-in via `HAPPY_HOME_DIR`, nothing more.
