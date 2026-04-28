---
name: happy-cli-iterate-no-release
description: >
  Rapid-iterate on `packages/happy-cli` without packing tarballs or
  cutting a GitHub release. Uses the repo's built-in `dev` variant
  (`happy-dev` binary, `~/.happy-dev/` data dir) so the user's stable
  `happy` install stays untouched, and the loop is `edit → build →
  restart dev daemon → retest`. Use for inner-loop debugging — when a
  hypothesis change needs to land on the tablet within ~30 seconds, not
  ~5 minutes (build + pack + tag + release + install). Promote to
  `/happy-release-to-fork` only once the change is validated.
---

# /happy-cli-iterate-no-release — fast inner loop without releases

The `happy-release-to-fork` skill cuts a tarball, tags `cli-vX.Y.Z-evy.N`,
uploads a GitHub release, and the user runs `npm install -g <tgz>` to
pick it up. That's the right flow for shipping. It is the **wrong** flow
for inner-loop debugging:

- Each cycle is ~3–5 minutes wall time (build + pack + tag + push + release + install).
- The user has to manually run a curl-and-install incantation.
- Restarting the daemon to pick up the install is a separate step.
- Burns a `-evy.N` version on every wrong hypothesis.

The repo already ships a complete dev-variant scheme that avoids all
that. This skill documents the loop.

## What "dev variant" means in this repo

Every CLI command can run in two parallel universes:

| Variant | Binary | Data dir | Daemon scripts | npm scripts |
|---------|--------|----------|----------------|-------------|
| **stable** (production) | `happy` | `~/.happy/` | `stable:daemon:*` | `npm run stable …` |
| **dev** (inner loop) | `happy-dev` | `~/.happy-dev/` | `dev:daemon:*` | `npm run dev …` |

The two variants share **no state** — separate auth tokens, separate
daemon, separate session keys, separate logs. Breaking the dev variant
cannot brick the user's stable install.

The dev binary `happy-dev` is a **symlink** that points at the worktree's
`bin/happy-dev.mjs`, which loads `dist/index.mjs` directly. After every
build the symlink immediately serves the new code — no reinstall step.

## Where things live

- `packages/happy-cli/scripts/setup-dev.cjs` — one-time directory + envrc setup.
- `packages/happy-cli/scripts/link-dev.cjs` — creates `happy-dev` symlink in npm global bin.
- `packages/happy-cli/scripts/env-wrapper.cjs` — runs the daemon under either variant with the right env.
- `packages/happy-cli/bin/happy-dev.mjs` — entry that sets `HAPPY_HOME_DIR=~/.happy-dev` + `HAPPY_VARIANT=dev`, then forwards to `dist/index.mjs`.
- `packages/happy-cli/package.json` scripts of interest (the package name is `happy`, NOT `happy-cli` — same trap as the merge-to-main and release-to-fork skills):
  - `setup:dev` — first-time scaffold.
  - `link:dev` / `unlink:dev` — manage the `happy-dev` global symlink.
  - `dev:daemon:start` / `dev:daemon:stop` / `dev:daemon:status` — control the dev daemon.
  - `dev:auth` — auth flow for the dev account.
  - `stable:*` mirrors of the same for the production variant (rarely needed in this loop).

## Procedure

### 1. One-time setup (skip if `happy-dev daemon status` already works)

```bash
cd packages/happy-cli
pnpm setup:dev          # creates ~/.happy/ and ~/.happy-dev/, writes .envrc.example
pnpm link:dev           # writes happy-dev shims into npm global bin
```

Then build at least once so `dist/` exists (the shim target reads from there):

```bash
pnpm --filter happy build
```

Sanity-check:

```bash
happy-dev daemon status        # should print yellow `🔧 DEV MODE` banner
which happy-dev                # should point under your npm global bin
```

**Avoid `happy-dev --version`** — the version path renders via `ink` and
crashes on most Windows terminals (react-reconciler error). Use
`happy-dev daemon status` to confirm the binary works; the version
appears in the daemon-state JSON output once it's running.

If `happy-dev` is missing after `link:dev`, your `npm config get prefix`
may be wrong. The script falls back to `/usr/local/bin` if it can't
resolve the global bin dir — on Windows that's a useless path, leading
to `ENOENT: 'D:\usr\local\bin\happy-dev.cmd'`. The fix landed in
commit `64e93925` (use `npm.cmd` with `shell: true` and `npm config get prefix`
instead of the deprecated `npm bin -g`). If you're on a worktree that
predates that fix, you can manually drop the three shims (`happy-dev`,
`happy-dev.cmd`, `happy-dev.ps1`) into `%APPDATA%\npm\` using the
templates in commit `64e93925`'s `link()` function.

### 2. Authenticate the dev variant

The dev daemon **needs its own auth** because `~/.happy-dev/access.key`
is independent from `~/.happy/access.key`. Two paths — the **copy shortcut
is the one you want for tablet testing**:

**Option A — copy stable's auth (no re-pairing required):**

```bash
cp ~/.happy/access.key   ~/.happy-dev/access.key
cp ~/.happy/settings.json ~/.happy-dev/settings.json
```

Same account, same tablet — but the dev daemon registers a new
machine ID with the server, so it shows up as a *separate machine* in
your tablet's machine list. You pick the dev machine when you want to
test the worktree's changes.

**Option B — fresh dev account (only if you want isolation):**

```bash
cd packages/happy-cli
pnpm dev:auth
# follow prompts; pair the tablet via QR code
```

Verify with `happy-dev daemon status` — running `daemon start` after
copying should NOT prompt for auth and the log will say
`[AUTH] Using existing credentials`.

### 3. The iteration loop

```text
            ┌──────────────────────────────────────────┐
            │ edit → build → restart dev daemon → test │
            └──────────────────────────────────────────┘
```

Each step:

1. **Edit** any file under `packages/happy-cli/src/`.

2. **Typecheck + build** (build is required because the symlink reads from `dist/`):

   ```bash
   pnpm --filter happy build
   ```

   Build is ~10 s incremental on a warm cache. Do not skip it — the dev
   binary reads `dist/index.mjs` directly. (`pnpm cli` and `pnpm dev`
   exist for tsx-direct execution but they bypass the daemon path; only
   useful for `cli`-style one-shot runs, not for daemon-mediated tablet
   testing.)

3. **Restart the dev daemon** so it picks up the new code. Daemons hot-load
   nothing — every code change requires a daemon bounce. Use the
   **direct form** (works from any directory):

   ```bash
   happy-dev daemon stop
   happy-dev daemon start
   happy-dev daemon status      # confirm new PID + version
   ```

   The `pnpm dev:daemon:start` form (via `env-wrapper.cjs`) works too
   but adds a yellow banner and is less reliable across cwds — it
   sometimes prints "Failed to start daemon" on a stop/start race even
   when the daemon actually came up cleanly. Always confirm with
   `happy-dev daemon status` regardless of which form you used; the
   visible "Failed to start" message is misleading on its own.

4. **Test.** Open the tablet's machine list — you'll see your stable
   daemon AND a separate dev-daemon machine (different machine ID).
   Pick the dev machine, start a chat. Reproduce the bug, watch the
   dev daemon's log for the diagnostic you added:

   ```bash
   ls -lt ~/.happy-dev/logs/ | head -3
   tail -f ~/.happy-dev/logs/<latest>.log | grep -E "your-marker"
   ```

   To start a Claude Code session from a specific working directory:

   ```powershell
   cd D:\my-project
   happy-dev
   ```

   `happy-dev` is on PATH from the `link:dev` step and works from any
   directory; it scopes the Claude session to whatever cwd it's run in.

5. **Hypothesis confirmed** → repeat from step 1 with a real fix, or graduate to step 4 below.

### 4. Graduating to a release

Once the change is stable and validated on the dev variant:

1. Commit and merge the worktree branch to `main` (the
   `/happy-merge-to-fork-main` skill handles this if you have multiple
   features queued).
2. Cut a real release with `/happy-release-to-fork`. That bumps
   `-evy.N`, packs the tarball, tags `cli-vX.Y.Z-evy.N`, uploads to
   GitHub, and the user `npm install -g`s on every machine.

**Do not skip the release step for a change that other devices need.**
Tablets paired to the dev account see dev-daemon sessions only. Other
machines, the user's phone, etc. all hit the stable CLI.

## Common mistakes / confusion points

- **`happy-dev --version` crashes on Windows** (and probably any non-TTY
  terminal). The version-rendering path uses `ink` + react-reconciler
  and chokes. Use `happy-dev daemon status` instead — the running
  daemon's `startedWithCliVersion` field is the version anyway.
- **"Failed to start daemon" is often a lie.** The error is printed by
  `pnpm dev:daemon:start` / `env-wrapper.cjs` on the stop/start race —
  the daemon usually came up fine. Always verify with
  `happy-dev daemon status` before assuming failure. Prefer the direct
  `happy-dev daemon stop && happy-dev daemon start` form to bypass the
  env-wrapper layer entirely.
- **Tablet sees the dev daemon as a *separate machine*.** Even with the
  Option A auth-copy shortcut (same account), the dev daemon registers
  a new machine ID with the server. Look for it as a sibling entry in
  your tablet's machine list — NOT inside your stable daemon's session
  list. Pick the dev machine to test a code change.
- **`pnpm --filter happy-cli …` is silently a no-op.** Package name is
  `happy`. Use `pnpm --filter happy …` everywhere. Same trap as the
  release-to-fork and merge-to-main skills.
- **Forgetting to rebuild.** The symlink reads `dist/index.mjs`; if you
  edit `src/foo.ts` and don't run `pnpm --filter happy build`, the dev
  binary still serves yesterday's code. Symptom: log doesn't contain the
  diagnostic you added; behavior unchanged.
- **Forgetting to restart the daemon.** Even after a build, the
  long-running daemon process still has the old code in memory. Always
  `dev:daemon:stop && dev:daemon:start` after `build`.
- **Polluting the stable variant.** If you run `happy daemon stop` /
  `happy daemon start` you've just bounced the **stable** daemon, not
  the dev one. The dev daemon scripts are `pnpm dev:daemon:start` (or
  `node scripts/env-wrapper.cjs dev daemon start`). The visual feedback
  helps: dev runs print a yellow `🔧 DEV` banner.
- **Tablet shows stale state across daemon restarts.** The dev daemon's
  reconnect can lag a few seconds. If the tablet shows `disconnected`
  for the dev session, give it 5–10s after `dev:daemon:start`.
- **`HAPPY_SERVER_URL` env var.** If you set this in your shell, both
  variants point at the same server. That's usually fine for testing
  against `https://api.cluster-fluster.com`, but if you're running a
  local server (`packages/happy-server`) for full-stack iteration, set
  the URL only for dev: `HAPPY_SERVER_URL=http://localhost:3005 pnpm dev:daemon:start`.
- **`pnpm pack` is for releases, not dev.** Don't ever pack a dev build.
  The dev variant exists specifically so you don't have to.
- **Auth drift between variants.** If you re-auth the dev variant and the
  account differs from stable, your tablet's session list will look
  empty for the dev daemon until you pair it. Easiest fix: pair the
  tablet's existing account on the dev variant via `pnpm dev:auth`.
- **`dist/` is gitignored** but the dev symlink reads from it directly —
  always run `pnpm --filter happy build` after `git checkout` of a
  different branch, otherwise `happy-dev` runs whatever stale `dist/`
  was last produced.
- **Daemon state file mismatch.** The dev daemon writes its PID/port to
  `~/.happy-dev/daemon.state.json`. If a previous run crashed, the file
  may point at a stale PID. `dev:daemon:stop` cleans up; if not, delete
  the state file and re-`start`.

## When to use this skill vs alternatives

| Goal | Right tool |
|------|------------|
| Inner-loop CLI debug, single dev machine, single dev tablet | **This skill** |
| Ship a fix to all your machines + your phone | `/happy-release-to-fork` |
| Iterate on the **app** (Metro) without rebuilding the APK | `/happy-tablet-iterate` |
| Merge multiple features to fork's `main` | `/happy-merge-to-fork-main` |
| Pull upstream fixes into the fork before the next release | `/happy-triage-upstream-prs` |

## Golden rules

1. **Never ship a dev build.** The dev variant is for the inner loop; users get the release tarball.
2. **Always `build` before `dev:daemon:start`.** No exceptions — the symlink reads from `dist/`.
3. **Always `dev:daemon:stop && dev:daemon:start`** after a build. Daemons don't hot-reload.
4. **Keep `~/.happy/` and `~/.happy-dev/` separate.** Don't symlink them, don't copy state between them.
5. **`pnpm --filter happy …`** — package name is `happy`, not `happy-cli`. Repeating because it's the most common waste.

## Related

- `.agents/skills/happy-release-to-fork/SKILL.md` — the shipping skill, used after this skill validates the change.
- `.agents/skills/happy-tablet-iterate/SKILL.md` — the app-side analogue (JS hot reload via Metro).
- `.agents/skills/happy-merge-to-fork-main/SKILL.md` — feature consolidation before a release.
- `packages/happy-cli/package.json` — source of truth for `setup:dev`, `link:dev`, `dev:daemon:*` scripts.
- `packages/happy-cli/bin/happy-dev.mjs` — the symlink target; reads `dist/index.mjs` and sets `HAPPY_HOME_DIR=~/.happy-dev`.
