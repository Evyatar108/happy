# BOOX Testing Handoff — Dev Tunnels Migration Cutover Gate

**Created:** 2026-05-12 (Dev Box without Android SDK), updated 2026-05-13 after
the first end-to-end BOOX validation surfaced multiple bugs in the Sprint A
migration. The original `main` HEAD `2a8b4bf9` did **not** pair end-to-end;
several files were modified during validation.

**For:** Fresh agent on the BOOX-connected tablet-dev machine (the one with `D:/Android/Sdk` + keystore + USB BOOX).
**Branch:** `main` (pull latest before starting; the validation work is uncommitted on this checkout).

This file is the single starting point. Read it top-to-bottom before doing anything else.

## Recent design corrections (2026-05-13)

The Sprint A migration shipped on main with several never-reached-end-to-end bugs. The validation session corrected them in source:

- **Header contract**: client sends `X-Tunnel-Authorization: tunnel <connect-jwt>` for Microsoft's gateway auth. The older Happy-specific daemon header has been retired, and the old `X-Tunnel-Connect` name is gone.
- **Pair protocol simplified**: `/pair/start` + `/pair/status` + per-machine GitHub device flow are replaced by a single `POST /pair/complete` that uses local `profile.json` identity. No `GITHUB_CLIENT_ID` env var needed.
- **Tunnel id prefix**: `happy-<host>-<uuid>` → `codexu-<host>` (Microsoft caps tunnel ids at 49 chars; the long form overflowed). Tunnel label stays `happy-machine` for now (F-014 deferred — server query in `pairRoutes.ts` still uses that label).
- **Port URL**: client + daemon now read `portForwardingUris` (plural array, what the Dev Tunnels API actually returns) and the daemon's `tunnelManager.parseTunnelUrl` also handles the CLI's `portUri` field. The base-tunnel URL `https://<tunnelId>.devtunnels.ms` (no port) does not resolve; the port-specific `https://<short-id>-<port>.<region>.devtunnels.ms` does.
- **US-007 Prisma migration** committed under `prisma/migrations/20260512224500_drop_legacy_models_sprint_e/`.
- **Encryption removed from happy-cli payload layer**: happy-app's decryption surface was already stripped in Sprint D (`encryptionDeletion.spec.ts` enforces this); happy-cli was the last holdout. Session/message/machine payloads are now plaintext JSON. Posture: single-tenant personal fork that trusts Dev Tunnels for transport auth.

See `packages/happy-app/scripts/sprint-a-gap.md` "R-D18 path (b) implementation log" for the full corrected design.

## Known issue for Phases 2–6: realtime sync perf

Phase 1 passed but the operator observed (a) several-second foreground refresh, (b) ~1 min new-message latency, and (c) HTTP-fallback churn on reconnect. None of these block Phases 2–6 attempts (the chat round-trip itself works once the message arrives), but expect the BOOX experience to feel slow until they land. Full diagnosis + workstreams in `plans/realtime-sync-perf.md`; deferred-section summary in `docs/validation/devtunnels-boox-result.md` "Realtime sync perf (deferred)".

---

## Context: where the migration stands

5 sprints of work converted happy-app from QR-code + libsodium pairing to GitHub OAuth device flow + Microsoft Dev Tunnels. **Sprints A+B+C+D+E (5/7 stories) are all merged to `main`.** Sprint E remaining:

- US-001 server route deletions ✓
- US-002 Prisma schema reduction ✓ (schema edits committed; `prisma migrate dev` not yet run)
- US-003 fan-out preservation integration test ✓
- US-004 R-D18 path (b) gateway-auth plumbing ✓ (the header was renamed from `X-Tunnel-Connect` to `X-Tunnel-Authorization: tunnel <connect-jwt>` during BOOX validation; later remove-tunnel-claim-layer work retired the separate Happy daemon header entirely)
- US-005 **THIS — BOOX hardware validation** (operator-blocked, what we're doing here)
- US-006 docs sweep ✓
- US-007 **THIS — run Prisma migration; commit migration file** (operator-blocked; depends on US-005 passing for go/no-go)

Branch chain (`ralph/devtunnels-E-cleanup` → `A-foundation` → `fan-out-survivors`) has been collapsed: `main` now carries everything. US-005 + US-007 commits will land directly on `main`, no merge chain to run.

R-D18 (the Dev Tunnels public-tunnel reachability question) is RESOLVED via path (b) — see "R-D18" in `packages/happy-app/scripts/sprint-a-gap.md`. Path (a) `--allow-anonymous` is permanently REJECTED by operator policy. Do not reintroduce it anywhere.

Codex engine fork is now consumed as a **git submodule at `codex/`** pointing at `gim-home/codex` (private repo). This replaces the prior per-machine `mklink /J` junction.

---

## What you need on the BOOX-machine before starting

| Prerequisite | Where | Notes |
|--------------|-------|-------|
| Repo on `main` | Clone or update | `git clone https://github.com/Evyatar108/codexu.git && cd codexu` OR `cd <existing>; git fetch origin; git checkout main; git pull --ff-only`. HEAD should be `2a8b4bf9` or newer. |
| `gh` auth with `gim-home` org access | gh-cli + git credential cache | `gh auth login` must complete for a user that's a member of the `gim-home` GitHub org. Confirm with `gh api repos/gim-home/codex --jq .full_name` → should print `gim-home/codex`. The codex submodule clone requires this. |
| Codex submodule populated | `codex/` directory | After clone: `git submodule update --init`. Verify `codex/.git` exists and `cd codex && git log -1` shows commit `69fc05e30` "feat(launcher): gate user-message background..." or newer. |
| `node` + `pnpm` | PATH | Versions per `package.json` engines fields. Run `pnpm install` at repo root after checkout. |
| `D:/Android/Sdk` (or alt path) | Filesystem | Android SDK + platform-tools. Set `ANDROID_HOME` to its location. |
| `adb` | On PATH (or via `ANDROID_HOME/platform-tools/`) | `adb devices` must list at least one BOOX. |
| BOOX tablet | USB-connected, dev mode on, USB debugging allowed | Or use wireless adb if you've set it up. |
| `D:/secrets/happy-app-release.keystore` | Filesystem | Production keystore. Required ONLY for Phase 6 of the validation (signed APK). Phases 1-5 work without it via Metro dev client. |
| `packages/happy-app/keystore.properties` | In repo | References the keystore + alias. Required ONLY for Phase 6. Gitignored per-machine. |
| Microsoft Dev Tunnels CLI (`devtunnel`) | On PATH | Required by `happy init`. Install: `winget install Microsoft.devtunnel`. Then `devtunnel user login -g` to auth with GitHub. |
| happy-cli daemon running somewhere | On any machine you trust | The app pairs to a happy-cli daemon via Dev Tunnels. Daemon must have been initialized with `happy auth login --force` (GitHub device flow, writes `~/.happy/profile.json`) THEN `happy init` (creates Dev Tunnel) THEN `happy daemon start`. The daemon you pair to does NOT need to be the same machine running Metro. |

If any of the above is missing, set it up FIRST. Don't try to power through gaps.

---

## Step-by-step execution

### Step 0 — Clone + populate submodule + install

```bash
# If first time on this machine:
gh auth login   # pick a user with gim-home org access; verify with `gh api repos/gim-home/codex`
git clone https://github.com/Evyatar108/codexu.git
cd codexu
git submodule update --init    # populates codex/ from gim-home/codex; needs gim-home auth

# If already cloned:
cd <existing-codexu-checkout>
git fetch origin
git checkout main
git pull --ff-only
git submodule update --init --remote   # bump codex/ to latest main (optional)

git log --oneline -1
# Should print: 2a8b4bf9 ... or newer

cat packages/happy-app/CHANGELOG.md | head -20
# Should show Version 31 at the top

pnpm install
```

### Step 1 — First-time dev-client install on the BOOX

Per the fork's CLAUDE.md, `expo run:android` is broken — go via gradle directly:

```bash
cd packages/happy-app/android
ANDROID_HOME=D:/Android/Sdk APP_ENV=development ./gradlew installDebug -PreactNativeArchitectures=arm64-v8a
```

(Adjust `ANDROID_HOME` if your SDK is elsewhere.)

This installs the dev variant (`com.slopus.happy.dev`) on the connected BOOX, ~10-15 min build.

### Step 2 — adb-reverse Metro port

```bash
adb reverse tcp:8081 tcp:8081
```

(If multiple devices, target the BOOX explicitly with `adb -s <serial> reverse ...`.)

### Step 3 — Start Metro

```bash
cd packages/happy-app
pnpm exec expo start --dev-client
```

Leave Metro running. Open the dev-variant app on the BOOX — it should connect.

### Step 4 — Pair to a happy-cli daemon

You need a happy-cli daemon reachable via Dev Tunnels. Two options:

- **(a)** Use the daemon on the BOOX-machine itself: in another terminal,
  ```bash
  cd packages/happy-cli && ./bin/happy.mjs init   # first time
  ./bin/happy.mjs daemon start
  ```
- **(b)** Use a daemon on another trusted machine. The BOOX must be able to reach its Dev Tunnel.

The app on the BOOX prompts "Sign in with GitHub" — complete the device flow on a browser. Pick the machine from the picker. The daemon mints a tunnel claim, the app stores it, you're paired.

### Step 5 — Walk the BOOX validation template

The template lives at `docs/validation/devtunnels-boox-result.md` (in the worktree). It has 6 phases:

1. **Phase 1** — Pairing + machine discovery (no anonymous access)
2. **Phase 2** — Session start + chat round-trip (verify e-ink readability)
3. **Phase 3** — Refresh-per-request durability (idle 2 min, then send)
4. **Phase 4** — Token revocation drill (revoke `ghu_*` token, verify re-pair prompt)
5. **Phase 5** — Multi-device fan-out (requires 2 BOOX; SKIP if only one available)
6. **Phase 6** — APK / Metro release procedure (signed APK + `apksigner verify --print-certs`)

For each phase:
- Run the steps
- Capture evidence:
  - Screenshots: `adb exec-out screencap -p > evidence/phase-N-<step>.png`
  - **WARNING**: screencap captures the full-color framebuffer, NOT what the e-ink panel actually renders after quantization. If contrast is barely visible in the screencap, it's invisible on the device. See "User Message Styling" in `packages/happy-app/CLAUDE.md` for e-ink contrast guidance.
  - Log snippets: pull from `~/.happy/logs/` on the daemon machine, or from the app's debug console
- Fill in `PASS | FAIL | SKIPPED` and the Evidence section per phase
- Save the markdown

If any phase FAILs and you want to defer it as a non-blocker, also add an entry to `.ralph/jobs/devtunnels-E-cleanup/notepad.md` under a clear "BOOX deferral" heading explaining the operator decision.

### Step 6 — Phase 6 specifically: signed APK + sign-verify

When you reach Phase 6:

1. Verify `packages/happy-app/keystore.properties` exists and points at `D:/secrets/happy-app-release.keystore` (or wherever your keystore lives).
2. Build the signed APK without Firebase distribution (test locally first):
   ```bash
   cd packages/happy-app
   pnpm release:android --no-distribute
   ```
3. The script auto-runs `parseChangelog.ts` (Version 31 should be picked up), bumps `versionCode`, builds, signs, and outputs the APK path. **`versionCode` must monotonically increase** — don't reuse a previous one.
4. Run `apksigner verify --print-certs <apk-path>` and paste the full output into Phase 6's evidence block. This proves the APK is signed with the production keystore.
5. Install on the tablet: `adb install -r <apk-path>`. Verify it installs over the dev variant cleanly. Open the production app on the BOOX, sanity-check that pairing still works (Phase 1 procedure but on the production-signed APK).
6. (Optional but recommended) If you want to verify the Firebase App Distribution path: run `pnpm release:android` (without `--no-distribute`). Both BOOX tablets should get a notification within minutes. Note that Firebase requires `evyatar109@gmail.com` Google account access.

### Step 7 — Commit the validation result + close US-005

```bash
cd <worktree-root>
git add docs/validation/devtunnels-boox-result.md
git commit -m "feat: US-005 — BOOX hardware validation result (PASS|PARTIAL|FAIL per phase)"
```

If you added a notepad deferral entry, commit that too in the same commit:
```bash
git add .ralph/jobs/devtunnels-E-cleanup/notepad.md
```

### Step 8 — Run the Prisma migration; commit on main; complete US-007

Sprint E US-007 was waiting on US-005 (BOOX validation) and the Prisma migration. **The branch chain has been collapsed — you commit directly on `main` now**, no merge chain to run.

```bash
# Make sure you're on main:
git checkout main
git pull --ff-only

# Run the Prisma migration outside the agent loop:
cd packages/happy-server
pnpm prisma migrate dev --name drop_legacy_models_sprint_e
# Commit the generated migration file:
cd ../..
git add packages/happy-server/prisma/migrations/
git commit -m "feat: US-007 — Prisma drop legacy models (Sprint E)"
```

Optionally resume ralph to land US-007's remaining items (server-route deletion verification, deploy-config docs, etc.):

```bash
# Job state was carried over via the E-cleanup merge.
/implement-with-ralph resume devtunnels-E-cleanup
```

Or drive US-007 manually if ralph isn't available — the story owns: server route deletion verification and final merge-handoff doc updates. (`HAPPY_TUNNEL_GITHUB_OWNER` is no longer relevant — it was removed during BOOX validation along with the per-machine GitHub device flow.)

### Step 9 — Smoke-test + push to main

```bash
# From the repo root:
pnpm install
pnpm --filter happy-server typecheck && pnpm --filter happy-server test
pnpm --filter happy-cli typecheck
pnpm --filter happy-agent typecheck && pnpm --filter happy-agent test
pnpm --filter happy-app typecheck   # tests are slow; consider --project unit only
pnpm --filter happy-wire typecheck && pnpm --filter happy-wire test

# Push:
git push origin main
# If push fails with auth:
#   - origin (Evyatar108/codexu) needs an account with write access to Evyatar108/*
#   - In our setup: `gh auth switch --user Evyatar108` before pushing.
#   - Conversely, the codex submodule pull needs `gh auth switch --user evmitran_microsoft`
#     (or whichever user is in the gim-home GitHub org).
#   - You'll switch back and forth as needed for the same machine.
```

### Step 10 — Post-cutover follow-up

After the cutover lands on `main`, address the deferred items:

- **F-013** code Low (Sprint E review): latent override path, non-production-reachable. Quick polish commit.
- **F-001 / F-002** security Mediums (Sprint E notepad): see `.ralph/jobs/devtunnels-E-cleanup/notepad.md` for details.
- **F-003..F-007** security Lows: queue for a polish PR.

Then sub-tasks 3, 4, 5 of the Codex multi-device work resume per `plans/codexu-roadmap.md`.

---

## Important gotchas

### `--allow-anonymous` is permanently rejected

Operator decision 2026-05-12. Do NOT add `--allow-anonymous` to `tunnelManager.ts` or any production code path. The R-D18 resolution shipped in US-004 (corrected during BOOX validation 2026-05-13) uses `X-Tunnel-Authorization: tunnel <connect-jwt>` for the Microsoft Dev Tunnels gateway auth channel. If any test, doc, or sample command mentions `--allow-anonymous`, it must be context-flagged as "manual local debug only" — never as a production path. See `packages/happy-app/scripts/sprint-a-gap.md`.

### E-ink contrast for screenshots

`adb exec-out screencap -p` captures the full-color framebuffer. On color e-ink BOOX panels, the quantizer washes light grays to pure white. Barely-visible in the screencap = definitely invisible on the device. Use this when iterating contrast issues. See `packages/happy-app/CLAUDE.md` "User Message Styling" + "Tappable Options on Color E-Ink" for full guidance.

### Windows-specific Android build pitfalls

The fork has several Windows-specific load-bearing gradle customizations. They're documented in `.agents/skills/happy-app-playstore-release/SKILL.md` "Common pitfalls". The non-obvious ones:

- `expo-embed-wrapper.cjs` wraps `@expo/cli` to absolutize `--entry-file` (Windows path bug in `@react-native/gradle-plugin`).
- `namespace 'com.slopus.happy.dev'` is FIXED; only `applicationId` is env-driven. Changing namespace breaks the committed Kotlin sources at `android/app/src/main/java/com/slopus/happy/dev/Main*.kt`.
- `google-services.json` is DUPLICATED in two locations. Both must contain `com.evyatar109.happy` as a registered client.
- CMake intermediate dir redirected to `C:\cxb\<root>-<module>\` to dodge Windows MAX_PATH.
- R8 minification is OFF. APK is ~103 MB.
- `pnpm prebuild` is STUBBED to error out — direct `npx expo prebuild` works but wipes every customization.

### versionCode monotonicity

`pnpm release:android` auto-bumps `versionCode`. **It must always monotonically increase, including across uninstalls** — otherwise tablets reject the install as `INSTALL_FAILED_UPDATE_INCOMPATIBLE`. The script auto-bumps from the previous CHANGELOG entry's number, so always bump CHANGELOG.md before each release. Version 31 is current (committed).

### CHANGELOG handoff state

The Version 31 entry is already drafted and `sources/changelog/changelog.json` is regenerated (commit `0afb289d`). If you need to tweak the wording before release, edit the `## Version 31 - 2026-05-12` block in `packages/happy-app/CHANGELOG.md`, then re-run `npx tsx sources/scripts/parseChangelog.ts` and amend the commit.

### Test failures in happy-app vitest

Per the merged worktree CLAUDE.md, the disabled file `sources/-session/SessionView.sendWhenIdle.test.tsx.disabled` is intentional (RN-test-setup follow-up; react-native-reanimated bump Flow `import typeof` issue bypasses vitest stub). Don't try to re-enable it; it's tracked separately.

### Dual gh-auth: gim-home vs Evyatar108

This machine likely needs **two GitHub identities cached in `gh`**:

- `evmitran_microsoft` (or equivalent gim-home org member) — to clone the codex submodule from `gim-home/codex` (private to the org).
- `Evyatar108` — to push to `Evyatar108/codexu` (origin).

Cycle with `gh auth switch --user <name>`. Confirm with `gh auth status`. Verify access with `gh api repos/<owner>/<repo> --jq .full_name` before fetch/push operations. Git's HTTPS credential cache for `github.com` is shared across both `gh` users so the most recently-active one wins — switch BEFORE running the git operation.

### Daemon required

The BOOX app pairs to a happy-cli daemon. If you don't have one running anywhere, you can't complete pairing tests. The daemon doesn't have to live on the BOOX-machine; any reachable Dev Tunnel works.

### happy-server

The daemon runs an embedded happy-server. You don't need a separate happy-server process. Sprint A landed `createHappyServer()` factory + dual-listener binding inside the daemon.

---

## File references in priority order for fresh context

1. **This file** — handoff playbook (you're here)
2. `docs/validation/devtunnels-boox-result.md` — the validation template you'll fill in
3. `.ralph/jobs/devtunnels-A-foundation/FINAL-STATUS.md` — Sprint A foundation outcome + 5-round review audit trail
4. `packages/happy-app/scripts/sprint-a-gap.md` — R-D18 history, rejected/acceptable resolution paths
5. `.ralph/jobs/devtunnels-E-cleanup/plan.md` — Sprint E full plan (the original PRD reference)
6. `.ralph/jobs/devtunnels-E-cleanup/notepad.md` — Sprint E deferred findings + reasoning
7. `.ralph/jobs/devtunnels-commands.md` — orchestration sheet (5-sprint dependency chain + post-Sprint-A constraints + Sprint E command + cutover merge chain)
8. `packages/happy-app/CLAUDE.md` — happy-app conventions, BOOX e-ink rendering invariants
9. `packages/happy-cli/CLAUDE.md` — happy-cli conventions, daemon architecture
10. `.agents/skills/happy-tablet-iterate/SKILL.md` — full Metro iteration loop (reload commands, hot-reload behavior)
11. `.agents/skills/happy-app-playstore-release/SKILL.md` — full APK release procedure + Common pitfalls
12. `docs/security-model.md` — Option A RPC payload contract (Sprint A US-A3)
13. `docs/operations/sprint-e-merge-handoff.md` — original operator merge playbook (this BOOX handoff supersedes it for US-005, but `sprint-e-merge-handoff.md` still has good detail on US-007 + the merge chain)

---

## When you're done

1. Fill out `docs/validation/devtunnels-boox-result.md` completely with PASS/FAIL/SKIPPED + evidence for every phase.
2. Commit US-005 result.
3. Run Prisma migration + commit US-007.
4. Run the cutover merge chain (Step 9 above).
5. Push to `main`.
6. Open a polish PR for the deferred items (F-013, F-001/F-002, F-003..F-007).

End state: `main` has the full Dev Tunnels migration; happy-app is shipping signed APKs with GitHub OAuth + Dev Tunnels; the migration is over.
