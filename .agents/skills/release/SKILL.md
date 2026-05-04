---
name: release
description: >
  Release pipeline for CLI, mobile, web, and server. Guides through version
  bumping, building, testing, publishing, and deploying. Replaces the old
  interactive release-it flow with a Claude Code-native experience.
  Use when user types /release or asks to release, publish, deploy, or ship
  any component.
---

# Release

You are the release operator for the Happy monorepo. When invoked, walk the user through releasing the component they choose.

## Step 1: Pick a target

Ask which component to release:

- **CLI** — npm package `happy`
- **Mobile** — Expo/EAS builds for iOS + Android
- **Web** — Docker image + K8s deploy via TeamCity
- **Server** — Docker image + K8s deploy via TeamCity
- **Docs** — GitHub Pages (separate repo)

Present these as options. Wait for the user to pick.

---

## CLI Release

    Package:     packages/happy-cli
    npm name:    happy
    Registry:    https://registry.npmjs.org
    Git tags:    cli-{version}

Tag namespace note:
- CLI releases use `cli-X.Y.Z`
- Native releases use `native-<runtime-version>`
- OTA releases use `ota-<ota-version>`
- Do not use a bare `vX.Y.Z` tag for Happy releases because multiple release streams coexist in this repo

### Step 2: Gather state

Run these in parallel:
1. `npm view happy dist-tags` — see current latest + beta
2. `cat packages/happy-cli/package.json | grep version` — local version
3. `git status --short` — check for dirty state
4. `git branch --show-current` — confirm branch
5. `git log --oneline -10` — recent commits for release notes context

Present a summary:
```
Local version:  X.Y.Z
npm latest:     X.Y.Z
npm beta:       X.Y.Z-N
Branch:         main
Working tree:   clean / dirty
```

### Step 3: Pick channel and version

Ask the user:
- **Channel**: `latest` or `beta`
- **Bump type**: For latest: `patch`, `minor`, `major`. For beta: `prerelease` (appends `-N`), or explicit version.

Suggest a sensible default based on the current state. For beta, the next prerelease of the current version. For latest, a patch bump.

Present as options. Wait for confirmation.

### Step 4: Version bump

Edit `packages/happy-cli/package.json` directly — do NOT use `npm version` (it chokes on pnpm workspace protocol).

IMPORTANT: do this **before** build/test for the CLI. The build imports `package.json` and bakes the version into the generated bundle. If you build first and bump later, `happy --version` can still report the old prerelease version even though npm metadata shows the new one.

### Step 5: Build

```bash
cd packages/happy-cli
pnpm --filter happy run build
```

Report success/failure. Stop on failure.

### Step 6: Test (unit only)

```bash
cd packages/happy-cli
pnpm --filter happy exec vitest run --project unit
```

Integration tests are slow and flaky — skip them for releases. Unit tests are the gate.
Expect the unit suite to take around a minute; `src/utils/serverConnectionErrors.test.ts` is particularly slow, so don't mistake a long run for a hang.

Report results. If failures, ask the user whether to proceed or abort.

### Step 7: Publish

```bash
cd packages/happy-cli
pnpm publish --tag {channel} --no-git-checks --ignore-scripts
```

- `--no-git-checks`: allows dirty working tree (we already verified state)
- `--ignore-scripts`: skips `prepublishOnly` (we already built and tested)

### Step 8: Verify

```bash
npm view happy dist-tags
```

Confirm the new version appears under the correct tag.
If `latest` doesn't move immediately, wait 10-15 seconds and check again; npm tag propagation is not always instant.

### Step 9: Git tag + commit (latest only)

For `latest` releases only:
1. Commit the version bump: `Release version X.Y.Z`
2. Tag: `git tag cli-X.Y.Z`
3. Push: `git push && git push --tags`

For `beta` releases: ask the user if they want to commit the version bump or leave it uncommitted.

If `git push` is rejected because `origin/main` advanced while releasing, fetch and rebase the release commit before retrying:
```bash
git fetch origin main
git rebase --autostash origin/main
git tag -f cli-X.Y.Z
git push && git push --tags
```

Use `--autostash` when the worktree is dirty from unrelated local changes so those edits are preserved. Recreate the tag after rebase because the release commit hash changes.

### Step 10: GitHub Release (latest only)

For `latest` releases, create a GitHub release:
```bash
gh release create cli-X.Y.Z --generate-notes --title "cli-X.Y.Z"
```

### Step 11: Install + verify locally

```bash
npm i -g happy@{channel}
happy --version
happy daemon status
```

Report the installed version and daemon status.
The smoke check must confirm that `happy --version` matches the published version, not just npm metadata. If it reports the old version, rebuild after the version bump and cut a corrective patch release.

---

## Mobile Release (fork — Metro-based, not EAS)

    Package:     packages/happy-app
    Platform:    Expo SDK 54 / React Native 0.81.4
    Distribution on the fork:  one BOOX dev tablet, JS pushed via local Metro

### THE FORK DOES NOT USE EAS / OTA

The `pnpm ota`, `pnpm ota:production`, `release:build:developer`, and `release:build:appstore` scripts in `packages/happy-app/package.json` are leftover upstream tooling (`slopus/happy` ships through EAS Build + EAS Update). The fork (`Evyatar108/happy`) does not have an Expo cloud subscription, has no production OTA channel, and no App Store presence — invoking any of those scripts will either fail with `An Expo user account is required` (no saved EAS session) or push a bundle to a channel that nothing on the fork actually consumes. **Do not run them.**

The fork's mobile distribution is split into two paths:

- **Inner-loop dev / verification** → Metro+USB to the maintainer's primary BOOX e-ink dev tablet (described in this section). The dev-client APK pulls JS over `adb reverse` from a local Metro server.
- **Cross-device propagation (Android)** → a signed APK pushed via **Firebase App Distribution** to the maintainer's personal Google account `evyatar109@gmail.com` (package id `com.evyatar109.happy`). Google Play Internal Testing is the planned long-term channel under the same account but is currently blocked by the developer account being locked for inactivity (as of 2026-04-30); the same pipeline targets either channel by swapping `assembleRelease` ↔ `bundleRelease`. See `.agents/skills/happy-app-playstore-release/SKILL.md` for the full procedure (one-time prerequisites, `pnpm release:android` build script, App Tester install on each tablet, channel-swap notes). iOS App Store remains out of scope.

### What "release the app" actually means on the fork

For an app-only change to reach the dev tablet:

1. **Commit and push** the change to `main` (or land a feature batch via `/happy-merge-to-fork-main` if it's coming off a worktree branch).
2. **Update `packages/happy-app/CHANGELOG.md`** with a new `Version N - YYYY-MM-DD` entry. This is documentation only — no script consumes it on the fork side. Run `npx tsx sources/scripts/parseChangelog.ts` from `packages/happy-app/` to regenerate `sources/changelog/changelog.json`, which the in-app "What's new" sheet reads. Commit that too.
3. **Get the new JS onto the tablet** via the Metro reload loop in `.agents/skills/happy-tablet-iterate/SKILL.md`. Concretely: ensure Metro is serving from a worktree at the latest `main` commit (the conventional source is `D:\h`; `D:\harness-efforts\happy` also works), `adb reverse tcp:8081 tcp:8081`, then deep-link force-launch the dev client. The tablet fetches the fresh bundle. Verify with `adb shell "dumpsys activity activities | grep topResumedActivity"` (expect `com.slopus.happy.dev/.MainActivity`).
4. **Restart `HappyServer`** if-and-only-if the change touched `packages/happy-server/`. See `.agents/skills/happy-service-manage/SKILL.md`. JS-only happy-app changes do not need a server restart.

That's it. There's no app-version tag, no `gh release`, no upload step — Metro is the distribution channel.

### Native code changes (rare)

If `packages/happy-app/android/` or `ios/` changes (or a native-module dependency is added/upgraded), Metro reload is not enough — the dev-client APK must be rebuilt and reinstalled:

```bash
cd /d/h/packages/happy-app && pnpm exec expo run:android
```

(~10 min cold, ~1–2 min warm.) This rebuilds the APK locally; it does not invoke EAS Build. Native changes are out of scope for this skill — defer to `.agents/skills/happy-tablet-iterate/SKILL.md` "When to stop using this loop".

### Versioning is documentation-only

`packages/happy-app/package.json` `"version"` is `1.0.0` and not bumped on the fork — the upstream EAS pipeline used a remote version source, so the local field is inert. The user-facing "Version N" string is the integer counter in `CHANGELOG.md`, which is parsed into the in-app "What's new" sheet. Bump that, regenerate the JSON, commit, and stop. No `git tag` for app releases on the fork.

    App Store Connect App IDs:
    Production:   6748571505  (com.ex3ndr.happy)
    Preview:      6749025570  (com.slopus.happy.preview)
    Development:  6748984254  (com.slopus.happy.dev)

---

## Web Release

    Package:     packages/happy-app (same Expo app, web export)
    Dockerfile:  Dockerfile.webapp
    Image:       docker.korshakov.com/happy-app:{version}
    K8s:         packages/happy-app/deploy/happy-app.yaml (3 replicas)

Web releases go through TeamCity (`Lab_HappyWeb`). The config is in the TeamCity UI, not in the repo.

Flow: `expo export --platform web` -> nginx:alpine static serve -> Docker build -> push -> K8s deploy.

Build args: `POSTHOG_API_KEY`, `REVENUE_CAT_STRIPE`.

Guide the user to trigger the TeamCity build, or help with manual Docker builds if needed.

---

## Server Release

    Package:     packages/happy-server
    Dockerfile:  Dockerfile.server (production), Dockerfile (standalone w/ PGlite)
    Image:       docker.korshakov.com/handy-server:{version}
    K8s:         packages/happy-server/deploy/handy.yaml (1 replica, port 3005)

Server releases go through TeamCity (`Lab_HappyServer`). The config is in the TeamCity UI, not in the repo.

Build: node:20 + python3 + ffmpeg, builds happy-wire + happy-server.
Secrets from Vault: handy-db, handy-master, handy-github, handy-files, handy-e2b, handy-revenuecat, handy-elevenlabs.
Redis: happy-redis StatefulSet (redis:7-alpine, 1Gi persistent volume).

Guide the user to trigger the TeamCity build.

---

## Docs Release

    Site:    happy.engineering (GitHub Pages)
    Repo:    github.com/slopus/slopus.github.io

Separate repo, not part of this monorepo. Guide the user to push to that repo.

---

## Rules

- **Always present options** — never assume which component, channel, or version.
- **Always verify before publishing** — show the user what will be published and get confirmation.
- **Unit tests are the gate, not integration tests** — integration tests are slow and have flaky abort/interrupt tests.
- **Use pnpm publish, not npm publish** — avoids workspace protocol issues.
- **Use --ignore-scripts** — we build and test explicitly, no need for prepublishOnly to redo it.
- **Never force-push tags** — if a tag exists, stop and ask.
