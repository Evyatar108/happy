---
name: happy-release-to-fork
description: >
  Ship an installable tarball of `happy-cli` (or any fork monorepo package)
  as a GitHub release on the fork (`Evyatar108/happy`), so any machine can
  install it with a single `gh release download … | npm install -g`
  command. Use after a feature batch has landed on the fork's `main` via
  `/happy-merge-to-fork-main` and is ready for self-install on other
  machines. NOT for upstream contributions to `slopus/happy` — that uses
  a different workflow (PR, not tarball release).
---

# /happy-release-to-fork — ship an installable tarball to the fork

The fork's `main` is the consolidated personal work branch, but `main`
alone doesn't help you install on a second machine. This skill is the
shipping step: tag, pack, upload a tarball, and hand back a one-line
install command.

## Fork conventions that matter

- **Target remote is `fork`** (= `https://github.com/Evyatar108/happy`).
  Not `origin`, not upstream. Always `git push fork main` before tagging
  so the tag is reachable from the remote default branch.
- **Version scheme is `<upstream-base>-evy.<N>`.** The upstream base is
  the *next* upstream release we'd have gone to. Example chain:
  upstream 1.1.7 is current → our first fork release is
  `1.1.8-evy.1` → next fork release on the same upstream is
  `1.1.8-evy.2` → when upstream ships 1.1.8 we jump to
  `1.1.9-evy.1`. The pre-release suffix sorts AFTER `1.1.7` but
  BEFORE `1.1.8` — that's the right semver property, and it makes
  `npm install -g happy@latest` on a user's machine still prefer
  upstream's stable release over our pre-release.
- **Tag prefix is `cli-v`**, not `v`. Reserves room for `app-v`,
  `agent-v`, `server-v` as we start releasing the other monorepo
  packages. A tag for the cli release above: `cli-v1.1.8-evy.1`.
- **Asset naming:** `<package-name>-<version>.tgz` — pnpm pack's
  default. For happy-cli the package name is literally `happy`, so the
  tarball is `happy-1.1.8-evy.1.tgz`. The install command uses a
  glob (`happy-*.tgz`) so it works version-agnostic.

## Where things live

- Source of truth for version + `files` field:
  `packages/happy-cli/package.json`.
- Postinstall extractor the tarball depends on:
  `packages/happy-cli/scripts/unpack-tools.cjs`. If you change what the
  tarball ships, reconcile against this script or the CLI binary won't
  find its tools on a fresh install.
- Build toolchain: pkgroll via `pnpm --filter happy build`. Produces
  `packages/happy-cli/dist/`. `dist/` is in `.gitignore` but
  `.npmignore` has `!dist/` so `pnpm pack` picks it up.
- `.npmignore` overrides: `packages/happy-cli/.npmignore`. Read it
  before assuming you can shrink the tarball — `files` in
  `package.json` dominates it (see Gotchas).

## Technical gotchas (read before packing)

- **`pnpm pack` auto-resolves `workspace:*` to a concrete version** in
  the generated tarball, pulling from the workspace package's
  currently-declared version. If a `workspace:*` dep of happy-cli is
  NOT published on npm at a matching version, the tgz will fail to
  install on a fresh machine. Verify before packing:
  ```bash
  npm view <dep-name> version
  ```
  If the workspace dep has drifted ahead of what's on npm, either
  publish the dep first or pin the tarball's declared version to
  something that resolves.
- **`files` in `package.json` dominates `.npmignore`.** Per npm's docs:
  "Files included with the files attribute cannot be excluded through
  `.npmignore` or `.gitignore`." So `files: ["tools"]` ships the
  entire `tools/` directory even if `.npmignore` lists
  `tools/unpacked/`. Our happy-cli tarball ends up around **~128 MB**
  because it bundles platform-specific `ripgrep` + `difftastic`
  archives for all six platform/arch combos
  (darwin-arm64, darwin-x64, linux-arm64, linux-x64, win32-arm64,
  win32-x64). **This is normal.** Don't "optimize" by trimming unless
  you're ready to rewrite the postinstall extraction logic in
  `scripts/unpack-tools.cjs`.
- **Build before pack.** `pnpm build` (via pkgroll) produces `dist/`.
  Skip it and the tarball's `bin` entry points at an empty dir —
  postinstall runs but `happy` on PATH is broken.
- **The `happy-cli` filter trap.** `packages/happy-cli/package.json`
  declares `"name": "happy"`, NOT `"happy-cli"`. So
  `pnpm --filter happy-cli build` is silently a no-op. Use
  `pnpm --filter happy build`. Same trap as in
  `/happy-merge-to-fork-main` typecheck step.

## Procedure

### 1. Preconditions

- `main` is clean (except untracked `.ralph/` / `logs/` noise).
- Feature batch has already landed via `/happy-merge-to-fork-main`.
- Typechecks green in every changed package:
  ```bash
  pnpm --filter happy-app typecheck
  cd packages/happy-cli && npx tsc --noEmit
  ```
  (Remember: the pnpm filter for happy-cli is `happy`, so the bare
  `tsc` call is the reliable one.)
- You know what's new since the last fork release — you'll need it
  for both the commit body and the release notes.

### 2. Bump the version

Edit `packages/happy-cli/package.json` to the next `X.Y.Z-evy.N`:

```bash
# Check current:
node -e 'console.log(require("./packages/happy-cli/package.json").version)'
```

Commit with a descriptive body:

```bash
git add packages/happy-cli/package.json
git commit -m "$(cat <<'EOF'
chore(cli): bump version to X.Y.Z-evy.N for fork release

<one paragraph describing what's new since the last fork release —
which features / fixes / skills landed. Be concrete enough that a
future agent can reconstruct the release without re-reading the
merge commits.>
EOF
)"
```

### 3. Push main to fork

```bash
git push fork main
```

(Not `origin`. The tag in step 5 needs to be reachable from
`fork/main` or the release UI will complain.)

### 4. Build + pack

```bash
pnpm --filter happy build
mkdir -p /tmp/happy-release
cd packages/happy-cli && pnpm pack --pack-destination=/tmp/happy-release
```

Verify the tarball:

```bash
ls -lh /tmp/happy-release/happy-X.Y.Z-evy.N.tgz
```

~128 MB is the expected size. If it's drastically smaller, the build
step was skipped or the `files` field changed — don't ship without
figuring out why.

### 5. Tag

Annotated tag, with a message that mirrors the release notes shape:

```bash
git tag -a cli-vX.Y.Z-evy.N -m "$(cat <<'EOF'
happy-cli vX.Y.Z-evy.N (fork)

What's new vs upstream <upstream-base>:
- <bullet>
- <bullet>

Install:
  PowerShell: gh release download --repo Evyatar108/happy --pattern 'happy-*.tgz' --output "$env:TEMP\happy.tgz" --clobber; npm install -g "$env:TEMP\happy.tgz"
  Bash: gh release download --repo Evyatar108/happy --pattern 'happy-*.tgz' --output /tmp/happy.tgz --clobber && npm install -g /tmp/happy.tgz

Notes:
- <anything non-obvious, e.g. first run needs network for ripgrep/difftastic postinstall extraction>
EOF
)"
git push fork cli-vX.Y.Z-evy.N
```

### 6. Create the GitHub release

```bash
gh release create cli-vX.Y.Z-evy.N --repo Evyatar108/happy \
  --title "happy-cli vX.Y.Z-evy.N (fork)" \
  --notes "$(cat <<'EOF'
## What's new vs upstream <upstream-base>

- <bullet>
- <bullet>

## Install

**PowerShell (Windows):**
```powershell
gh release download --repo Evyatar108/happy --pattern 'happy-*.tgz' --output "$env:TEMP\happy.tgz" --clobber
npm install -g "$env:TEMP\happy.tgz"
```

**Bash (macOS / Linux / WSL / Git Bash):**
```bash
gh release download --repo Evyatar108/happy --pattern 'happy-*.tgz' --output /tmp/happy.tgz --clobber
npm install -g /tmp/happy.tgz
```

Binary lands on PATH as `happy` (plus `happy-mcp`).

## Notes

- <anything the installer should know>
EOF
)" \
  /tmp/happy-release/happy-X.Y.Z-evy.N.tgz
```

### 7. Smoke-test in a fresh env

Before telling the user "done", verify the tarball actually installs
and the binary unpacks its postinstall tools:

```bash
# In a scratch dir or a second shell without the dev repo on PATH:
npm install -g /tmp/happy-release/happy-X.Y.Z-evy.N.tgz
happy --version
happy --help   # triggers the tool path lookups
```

If `happy --version` fails, the tarball is broken — don't let the
user `npm install` from the release until you've fixed it. Delete
the release asset, bump `-evy.N+1`, re-pack, re-tag.

## Golden rules

1. **Never republish the same version tag.** If a release is broken,
   bump `-evy.N+1` and cut a new one. npm and `gh` both cache
   aggressively — re-uploading the same tag name is a support
   nightmare.
2. **Don't `files`-field-optimize the tarball** without verifying
   postinstall still works on a fresh machine first. The ~128 MB is
   load-bearing for the bundled native tools.
3. **Always build before pack.** `dist/` is in `.gitignore`; if you
   skip build, the tarball has no compiled output and the bin is
   broken.
4. **Push `main` to `fork` before tagging.** A tag pointing at a
   commit that isn't on the remote default branch makes the GitHub
   release UI flag it as "this tag is not on any branch".
5. **Match the release-notes shape.** Three sections: "What's new vs
   upstream X.Y.Z", "Install" (both shells), "Notes". Keep it
   greppable for future triage.
6. **Smoke-test before declaring done.** `happy --version` in a fresh
   shell is the minimum gate.

## Gotchas

- **Use `pnpm pack`, NEVER `npm pack`.** `npm pack` does not resolve
  the `workspace:*` protocol — it leaves the literal string in the
  packaged `package.json`, and the tarball then fails on install with:
  ```
  npm ERR! code EUNSUPPORTEDPROTOCOL
  npm ERR! Unsupported URL Type "workspace:": workspace:*
  ```
  `pnpm pack` (and `pnpm publish`) substitute concrete versions. This
  burned `-evy.5`, which had to be re-cut as `-evy.6`. Step 4's
  `pnpm pack --pack-destination=...` is the only correct command —
  do not "simplify" it to `npm pack`.
- **`gh release create` fails with "workflow scope may be required" — the real cause is the wrong active gh account.**
  If `gh auth status` shows multiple accounts and the active one is your
  Microsoft enterprise account (`evmitran_microsoft` or similar with SSO),
  the API call to `Evyatar108/happy` is silently rejected and gh
  surfaces a misleading "workflow scope" error. Both accounts already
  have `repo` scope — that is not the issue. Fix:
  ```bash
  gh auth switch --user Evyatar108     # before `gh release create`
  gh release create ...                  # now succeeds
  gh auth switch --user evmitran_microsoft   # restore default
  ```
  Do NOT run `gh auth refresh -h github.com -s workflow` — it's a
  red herring and adds a scope you don't need.
- **`pnpm --filter happy-cli ...` is silently a no-op.** Package name
  is `happy`. Use `pnpm --filter happy` or `cd packages/happy-cli`.
  Same trap as the merge-to-main skill.
- **`LF will be replaced by CRLF` warnings** on Windows are pre-existing
  repo line-ending noise. Ignore.
- **If the user installs from the tarball and `happy` hangs on first
  run**, the postinstall `unpack-tools.cjs` may have failed silently.
  Check `~/.npm/_logs/` on their machine. Bundling the tools means we
  don't need a second network round on install, but the extraction
  still has to succeed.
- **`workspace:*` resolution surprises.** If you bump a workspace dep's
  version without publishing it to npm, `pnpm pack` will happily
  resolve the concrete version into the tarball, and then
  `npm install -g <tgz>` will fail on a fresh machine trying to fetch
  that exact version. `npm view <dep> version` before packing.

## Related

- `.agents/skills/happy-merge-to-fork-main/SKILL.md` — sibling skill,
  the consolidation step that feeds this one. Always run first; this
  skill is the shipping step after.
- `.agents/skills/happy-triage-upstream-prs/SKILL.md` — inverse
  direction (pulling fixes from upstream into the fork before the next
  release).
- `packages/happy-cli/package.json` — source of truth for version
  and the `files` field that decides what ships.
- `packages/happy-cli/scripts/unpack-tools.cjs` — postinstall the
  tarball depends on. Don't break its assumptions about where
  `tools/` lives relative to the install dir.
