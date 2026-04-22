---
name: happy-tablet-iterate
description: >
  Rapid-iterate a JS-only code change in the Happy app on the connected
  Android dev tablet. No Gradle rebuild, no reinstall -- just typecheck,
  push JS through Metro, force-reload the dev client, and observe.
  Assumes the first-time build has already happened (Gradle artefacts
  exist; the `com.slopus.happy.dev` APK is installed on the tablet).
---

# /happy-tablet-iterate -- JS-only reload loop

## Preconditions (check these before starting)

1. The short-path build clone lives at `D:\h`. Its checked-out branch is the source of truth for code you want loaded. If you've been editing in `D:\harness-efforts\happy`, commit and push to fork, then `git fetch` + fast-forward `main` (or the feature branch you're iterating) in `D:\h` first.
2. Metro is running as a background task from `D:\h`. If not, start it:
   `cd /d/h/packages/happy-app && pnpm start` (in the background).
3. `/d/Android/Sdk/platform-tools/adb.exe devices` shows the tablet as `device` (not `unauthorized`, not empty).
4. `adb reverse --list` shows `tcp:8081 tcp:8081`. If not: `adb reverse tcp:8081 tcp:8081`.
5. The HappyServer Windows service is running (`Get-Service HappyServer` → `Running`), and the named cloudflared tunnel is up (`curl -s -m 5 https://happy.evyatar.dev` → `200`). The tablet dev client reads MMKV `custom-server-url` = `https://happy.evyatar.dev`, so if either is down the app will fail to reach the server. See `.agents/skills/happy-service-manage/SKILL.md` for service ops.

## The loop

1. **Edit** code in `D:\h\packages\happy-app\sources\...`.
2. **Typecheck**:
   ```bash
   cd /d/h && pnpm --filter happy-app typecheck
   ```
3. **Commit** (small, focused commits -- one concern per commit). Even for throwaway diagnostics, a separate commit lets you `git revert` it cleanly when done.
4. **Force-reload the app** (most reliable; `shake to reload` is painful on e-ink):
   ```bash
   /d/Android/Sdk/platform-tools/adb.exe shell am force-stop com.slopus.happy.dev
   /d/Android/Sdk/platform-tools/adb.exe shell monkey -p com.slopus.happy.dev \
     -c android.intent.category.LAUNCHER 1
   ```
   The app relaunches, reconnects to Metro over `adb reverse tcp:8081`, fetches the fresh JS bundle.
5. **Observe.** Arm a Monitor on Metro's log:
   ```
   tail -f <metro-output-file> | grep -E --line-buffered "your-filter"
   ```
   Find the Metro output file via the background-task listing (`C:\Users\evmitran\AppData\Local\Temp\claude\*\tasks\*.output`).

## Critical gotchas

- **`console.log` is suppressed.** Happy's `sources/utils/consoleLogging.ts` monkey-patches `console.log/info/debug` and short-circuits them unless a runtime flag is on. Use `console.warn` or `console.error` for diagnostics -- those always pass through.
- **`__DEV__` IS true** in dev-client builds; the suppression above lives above that check. Don't waste time hunting a bad dev flag.
- **Metro cache + stale bundles.** If the reload doesn't seem to pick up your change after a force-stop-and-launch, check the Metro log for `Android Bundled` -- fresh bundle time should be a few hundred ms after your last save. If nothing, your edit didn't trigger the file watcher (rare; usually means the edit was in a file Metro doesn't watch).
- **Native-code changes (Android java/kotlin/cmake, any expo/RN upgrade, any new native module) require a Gradle rebuild** -- this skill does *not* cover that. For native changes:
  `cd /d/h/packages/happy-app && pnpm exec expo run:android`
  (~10 min first time, ~1-2 min after).
- **If the app shows a red/yellow error overlay on the tablet**, the screen is painful to read on e-ink; tail Metro instead to get the readable error.
- **If `adb devices` shows `unauthorized`**, unplug + replug the USB cable, accept the "Allow USB debugging?" prompt on the tablet (tick "Always allow from this computer").
- **Metro stale from a branch switch.** If you switched branches in `D:\h` while Metro was running, the file watcher sometimes misses the change set. Kill Metro (`taskkill //PID <node-pid> //F`) and restart. Typecheck clean + no change visible = restart Metro.

## When to stop using this loop

- If you're about to upgrade a native dependency -> rebuild.
- If the feature needs verification on prod-like behaviour (e.g. release-mode perf), build the preview variant via EAS and sideload.
- If you're doing many rapid edits and Metro starts choking, a full Metro restart is faster than diagnosing:
  ```
  # stop the old Metro background task, then:
  cd /d/h/packages/happy-app && pnpm start
  ```

## Related

- `.agents/skills/happy-service-manage/SKILL.md` -- managing HappyServer + cloudflared Windows services (what the app talks to).
- `.agents/skills/happy-discover-metadata-tags/SKILL.md` -- one concrete application of this loop (instrument → reload → observe → refine).
- `docs/fork-notes.md` -> "Things that bit us that aren't obvious" -- the `console.log` gotcha and others.
