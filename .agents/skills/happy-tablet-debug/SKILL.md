---
name: happy-tablet-debug
description: >
  Sad-path sibling to `/happy-tablet-iterate`. When the Happy dev app on
  the Android e-ink tablet fails to load, won't connect to Metro, shows
  DevLauncherErrorActivity, renders a white screen after a Metro restart,
  or throws "runtime not ready" — systematically diagnose which of the
  five known failure modes is the culprit and fix it. Also use after any
  `pnpm expo start --clear` or Metro restart to verify the dev loop
  still works end-to-end.
---

# /happy-tablet-debug — the five ways the tablet dev loop breaks

`/happy-tablet-iterate` assumes everything's wired up. This skill is
for when it isn't: the edit-reload loop's happy path is silent, so when
it breaks you can burn an hour blaming the wrong layer. Seven failure
modes account for what we've seen — check them in order. Modes 1–5
are launch-time failures from a working Metro; modes 6–7 are
"can't start Metro / Metro is wrong" failures.

## Preflight checklist (do all at once)

Run these in one bash call; you need the answers to classify the
failure mode:

```bash
/d/Android/Sdk/platform-tools/adb.exe devices
/d/Android/Sdk/platform-tools/adb.exe reverse --list
curl.exe -s -m 3 http://localhost:8081/status
curl.exe -s -m 15 -H "expo-platform: android" -H "expo-api-version: 1" http://localhost:8081/
/d/Android/Sdk/platform-tools/adb.exe shell pm path com.slopus.happy.dev
/d/Android/Sdk/platform-tools/adb.exe shell "dumpsys activity activities | grep topResumedActivity"
```

Expected-healthy answers:

- `adb devices` → tablet listed as `device` (not `unauthorized`, not empty).
- `adb reverse --list` → `tcp:8081 tcp:8081` present.
- `curl …/status` → `packager-status:running`.
- `curl …/` with the expo headers → a JSON manifest, NOT an error message about `expo-updates/bin/cli.js`.
- `pm path …happy.dev` → a path under `/data/app/...`.
- `topResumedActivity` → `com.slopus.happy.dev/...MainActivity`.

Any deviation maps to one of the five modes below.

## Mode 1 — Metro spawn-CLI context rot (Windows)

**Symptom.** `curl http://localhost:8081/` returns a JSON error:
```
{"error":"... expo-updates/bin/cli.js runtimeversion:resolve ... exited with non-zero code: 3221225794"}
```
The app shows "Failed to download remote update" in
DevLauncherErrorActivity. Metro itself is still responsive on `/status`
but can't spawn its helper CLIs.

**Why.** After Metro's been running for hours (or after certain
system events), Windows child-process spawns start failing with exit
code `3221225794` = `0xC0000142` = `STATUS_DLL_INIT_FAILED`. It's a
Windows-only environment rot — the parent process's DLL state has
drifted such that new child processes can't load. No amount of
reloading the app fixes it because Metro is broken, not the app.

**Fix.** Kill Metro cleanly and restart with `--clear`:

```bash
# Find the Metro PID by port-LISTEN and kill it:
taskkill.exe //F //PID $(netstat.exe -ano | grep ":8081.*LISTEN" | awk '{print $NF}' | sort -u | head -1)

# Restart from the app package (in D:/h for the short-path build clone):
cd /d/h/packages/happy-app && pnpm expo start --dev-client --clear
```

Both flags are load-bearing: `--dev-client` makes Metro advertise the
correct manifest endpoint for the dev-client build (without it, the
app hits the wrong URL and silently re-enters this failure mode);
`--clear` is needed after any config change (see Golden rule 3 below).

## Mode 2 — Test files inside `app/`

**Symptom.** logcat shows a Hermes compile error:
```
HermesVM: Compiling JS failed: 482446:29:';' expected
[runtime not ready]: Error: Non-js exception: Compiling JS failed
```
The dev launcher renders a red DevLauncherErrorActivity mentioning
"runtime not ready". Happens on every launch — reloading doesn't help.

**Why.** Expo Router scans `app/` for routes and Metro bundles every
`.ts(x)` file under it. If a test file lives there (e.g.
`app/(app)/session/[id]/agents.test.ts`), Metro bundles it too, with
`await import('./agents')` at top level. Hermes can't compile
top-level `await`, so the whole bundle blows up on the device.

**Diagnostic.** Inspect the bundle for Hermes-incompatible constructs:

```bash
curl -s -m 120 "http://localhost:8081/<entry-bundle-url>?..." > /tmp/app.bundle
grep -c "await require(" /tmp/app.bundle
```

Any count `> 0` means Hermes-incompatible code snuck in via a `.test.ts`
or `.spec.ts` inside `app/`.

**Fix.** Add a `resolver.blockList` in
`packages/happy-app/metro.config.js` that matches test files:

```js
config.resolver.blockList = exclusionList([
  /.*\.test\.(ts|tsx|js|jsx)$/,
  /.*\.spec\.(ts|tsx|js|jsx)$/,
]);
```

Metro's `resolver.blockList` feeds Expo Router's route scan too, so
the same edit keeps the tests out of both the bundle AND the route
graph. Restart Metro with `--clear` afterwards (see Golden rule 3).

## Mode 3 — Expo Router typed-routes silent drift

**Symptom.** Typecheck passes on the primary clone at
`D:/harness-efforts/happy` but fails in `D:/h` with:
```
Argument of type 'string' is not assignable to parameter of type '"/" | RelativePathString | …'
```
Specifically on `router.push(<string>)` call sites.

**Why.** The `D:/h` clone runs Metro, so Metro generates
`.expo/types/router.d.ts` with the typed-routes definitions. The
primary clone at `D:/harness-efforts/happy` never runs Metro, so the
generated types file is absent — its typecheck silently falls back
to the looser `string`-accepting overload and passes.

**Fix.** Cast to `Href` at the call site and comment why:

```ts
import { Href } from 'expo-router';
// Validated allowlist upstream — the string comes from the safe set.
router.push(result.path as Href);
```

**Always typecheck in `D:/h` before declaring a feature done.** The
primary clone's typecheck is the "quick" check; the `D:/h` clone's is
the authoritative one.

## Mode 4 — Android 15 + Onyx per-app network block

**Symptom.** The app's socket connects time out (white screen, no
manifest download, SocketTimeoutException in logcat). But `adb shell
ping` or `adb shell nc` from the default shell user works fine to the
same address.

**Why.** Onyx e-ink tablets add a per-app network toggle on top of
stock Android 15. When that toggle is off for Happy dev, the app's UID
is network-isolated even though other processes on the device can
reach the host.

**Diagnostic.** Compare nc from shell vs nc from the app's UID via
`run-as`:

```bash
adb shell "echo | toybox nc -w 3 192.168.0.130 8081 && echo REACHED || echo FAILED"
adb shell "run-as com.slopus.happy.dev sh -c 'echo | toybox nc -w 3 192.168.0.130 8081 && echo REACHED || echo FAILED'"
```

First command REACHED, second FAILED → per-app network is blocked.

**Fix.** On the tablet, enable "Internet access" for Happy dev via
Onyx's app-management UI. Location varies by firmware — it is NOT in
the standard Android path (Settings → Apps → Battery). Try Onyx's own
"Apps / Permissions Manager" or long-press the launcher icon for a
per-app network toggle. There is no adb path to fix this without
root. Verify by re-running the `run-as` nc — it should flip to
REACHED.

## Mode 5 — DevLauncherErrorActivity swallows the root cause

**Symptom.** The dev launcher shows "There was a problem loading the
project" with an opaque message, but logcat doesn't contain the
specific error — the full stack (SocketTimeoutException, Hermes
compile messages, update-download failures) is rendered only to the
device surface.

**Why.** The dev-launcher error UI is drawn with its own messaging
pipeline; the strings are in the View tree, not emitted to Logcat at
a level you can grep.

**Fix.** Screenshot and read the screenshot:

```bash
/d/Android/Sdk/platform-tools/adb.exe exec-out screencap -p \
  > /d/harness-efforts/happy/.ralph/tablet-error.png
```

Then use the Read tool on the PNG — Claude reads screenshots natively
and the on-screen message (including SocketTimeoutException stacks,
Hermes compile errors, update-URL problems) is fully legible. This
maps you straight back to modes 1–4.

## Mode 6 — Stale Metro from a different worktree on port 8081

**Symptom.** `pnpm exec expo start --dev-client --clear` from your
intended worktree fails with "port 8081 already in use, use 8083?"
or, if you accept the new port, the dev-client APK still hits the
default 8081 (because `adb reverse tcp:8081 tcp:8081` and the deep
link both point at 8081) and loads JS from the wrong worktree. The
chat may even render correctly — just from the wrong tip.

**Why.** Multiple worktrees on the same machine can each have started
Metro at some point. The first one to bind 8081 wins. Without
checking who owns 8081 first, you can't tell which worktree is actually
serving JS.

**Diagnostic.** Trace 8081 to its working directory:

```bash
netstat.exe -ano | grep ':8081.*LISTEN'
# read the PID from the last column, then:
powershell -NoProfile -Command \
  "Get-CimInstance Win32_Process -Filter 'ProcessId=<PID>' | Select-Object CommandLine | Format-List"
```

The `CommandLine` reveals the path — look for `<some-worktree>/node_modules/.bin/../expo/bin/cli`. If that's not the worktree you think you're testing, you've found the leak.

**Fix.** Kill the stale Metro and start a fresh one in the correct worktree:

```bash
taskkill.exe //F //PID <PID>
cd <intended-worktree>/packages/happy-app && pnpm exec expo start --dev-client --clear
```

Then re-deep-link the BOOX (golden rule 4). The dev-client APK is
naive — it has no idea which worktree's JS it's getting. You're the
gatekeeper.

## Mode 7 — Node version mismatch (too old, or Node 22 `app.config.js` ESM regression)

**Symptom A (too old).** `pnpm exec expo start ...` exits immediately
with `Node.js (v20.x.x) is outdated and unsupported. Please update to
a newer Node.js LTS version (required: >=20.19.4)`.

**Symptom B (Node 22).** Metro starts on 20.x fine but on Node 22.x
fails with:
```
file:///.../packages/happy-app/app.config.js:90
        plugins: [
                 ^
ReferenceError: require is not defined
    at ModuleJobSync.runSync (node:internal/modules/esm/module_job:...)
    at ModuleLoader.importSyncForRequire ...
```
The `file://` URL prefix and `importSyncForRequire` in the trace are
the giveaway: Node 22.12 added a new sync-import-of-ESM path, and
expo's `require('./app.config.js')` is being routed through it as
ESM despite the file being plain CJS (no top-level `import`, no
`"type": "module"` in package.json).

**Why.** Expo's CLI requires Node ≥ 20.19.4. Node 22.x introduced a
behavior change in the CJS↔ESM loader that breaks expo's config
loading. The sweet spot is **20.19.x** — high enough for expo, low
enough to avoid the 22 regression.

**Fix.**
```bash
nvm list                       # see what's installed
nvm install 20.19.6            # if not yet installed
nvm use 20.19.6
node --version                 # verify v20.19.x
cd <worktree>/packages/happy-app && pnpm exec expo start --dev-client --clear
```

If you must run on Node 22 for some other reason, the workaround is to
rename `app.config.js` → `app.config.cjs` to force CJS treatment — but
this dirties the worktree diff and Node 22 may have other regressions
in this repo's stack. Prefer 20.19.x.

## Wake + screenshot pattern (e-ink specific)

The Onyx DreamActivity (screensaver) takes over aggressively, so a
naive screencap often captures the dream instead of the app. To get a
useful screenshot:

```bash
adb shell input keyevent KEYCODE_WAKEUP
sleep 2
adb shell input keyevent KEYCODE_MENU   # or KEYCODE_HOME — just dismiss dream
adb shell dumpsys activity activities | grep "topResumedActivity"  # verify app is top
adb exec-out screencap -p > tablet.png
```

If `topResumedActivity` still shows `com.onyx.android.dream.DreamActivity`
after the wake sequence, the device re-dreamed between keyevent and
screencap — retry with a shorter gap, or disable the dream
temporarily in Onyx settings.

## Bundle diff probe (verify Metro is serving current code)

When an edit "doesn't take", make sure Metro is actually serving your
change and not a cached bundle:

```bash
curl -s -m 120 "http://localhost:8081/<entry-url>" > /tmp/app.bundle
grep -c "await require(" /tmp/app.bundle                 # 0 = Hermes-safe, >0 = bad
grep -c "MAX_COMMAND_SUGGESTIONS = 15" /tmp/app.bundle   # verify recent source hit
```

Pick grep strings that are unique to the code you just added. If the
string isn't in the bundle, Metro's cache is stale — restart with
`--clear`.

## Golden rules

1. **Screenshot before diagnosing.** The device surface knows more than
   Logcat, especially when DevLauncherErrorActivity is up. Mode 5 is
   not optional; run it first when symptoms are vague.
2. **Distinguish `run-as` nc failures from shell nc failures.** That's
   the cleanest single signal for per-app restrictions (mode 4). Don't
   conclude "network broken" from a single nc test.
3. **Never restart Metro without `--clear`** after a config change —
   `metro.config.js`, `blockList`, resolver tweaks, package-json
   script edits. Metro's cache is aggressive enough that the old
   bundle survives restarts without it.
4. **Always re-send the dev-launcher deep link** after force-stopping:
   ```bash
   adb shell am start -a android.intent.action.VIEW \
     -d 'happy://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081'
   ```
   `monkey -p com.slopus.happy.dev` opens the dev launcher's home
   screen, not the project — you end up debugging the launcher
   instead of the app.
5. **After fixing something, FULLY force-stop the app before
   re-testing.** Happy has state that persists across Metro reloads
   (MMKV, zustand hydration). `adb shell am force-stop
   com.slopus.happy.dev` then re-send the deep link.
6. **Run typecheck in `D:/h`, not just the primary clone.** Mode 3
   bites every time this rule is skipped.

## Gotchas

- **The entry-bundle URL changes per-session.** The full URL includes
  hashed query parameters; grab it from the `curl http://localhost:8081/`
  manifest JSON (the `launchAsset.url` field) rather than reconstructing
  it by hand.
- **`adb reverse` doesn't survive USB re-enumeration.** If the tablet
  re-auths or the cable is jostled, re-run
  `adb reverse tcp:8081 tcp:8081`. This looks like mode 4 but isn't —
  check `adb reverse --list` first.
- **`pnpm --filter happy-app typecheck` uses the primary clone's types
  cache.** If you've been switching between clones, `rm -rf
  packages/happy-app/.expo/types` in `D:/h` before a clean typecheck.
- **Onyx DreamActivity auto-reappears even after `input keyevent
  KEYCODE_WAKEUP` + a screenshot.** If you need multiple screenshots in
  a row, keep sending `KEYCODE_MENU` between each to suppress it.

## Related

- `.agents/skills/happy-tablet-iterate/SKILL.md` — happy-path iterate
  loop (typecheck → reload → observe). This skill is the sad-path
  sibling: run it when the iterate loop stops producing results.
- `.agents/skills/happy-probe-claude-sdk/SKILL.md` — sibling, how to
  verify what Claude Code is actually emitting. Useful when symptoms
  look like a missing feature but might be upstream SDK drift.
- `.agents/skills/happy-service-manage/SKILL.md` — HappyServer +
  cloudflared service ops. If the server side is down, mode 4-like
  timeouts manifest even when the tablet's network is fine.
- `docs/fork-notes.md` — `D:/h` vs `D:/harness-efforts/happy` clone
  split and why both exist.
