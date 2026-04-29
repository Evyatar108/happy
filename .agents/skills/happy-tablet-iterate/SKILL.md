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

> **This loop is also the fork's app release path, not just dev iteration.** The fork (`Evyatar108/happy`) does not use EAS / OTA — the only consumer of happy-app on the fork is this dev tablet, so "shipping an app change" *is* "Metro reload here." See `.agents/skills/release/SKILL.md` "Mobile Release (fork — Metro-based, not EAS)" for the full release procedure (the extra steps beyond this loop are: bump `packages/happy-app/CHANGELOG.md`, regenerate `sources/changelog/changelog.json`, commit).

## Preconditions (check these before starting)

1. **Choose the right working tree.** The short-path build clone lives at `D:\h` and is the conventional Metro source. You may also drive Metro from any other worktree (e.g. `.ralph/jobs/<job>/worktree`) — both work as long as the tip you're testing is checked out there. If you're editing in `D:\harness-efforts\happy` directly, either commit + push + fast-forward `D:\h`, or just run Metro from the active worktree. Mixing is the trap — pick one.
2. **Identify any Metro already on port 8081 BEFORE starting.** Multiple worktrees on the same machine = multiple potential Metros, and a stale one from a different worktree silently serves the wrong JS.
   ```bash
   netstat.exe -ano | grep ':8081.*LISTEN'   # PID column = the metro
   powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter 'ProcessId=<PID>' | Select-Object CommandLine | Format-List"
   ```
   The `CommandLine` will reveal the working directory (look for `<worktree>\node_modules\.bin\..\expo\bin\cli`). If it's not the worktree you intend, kill it: `taskkill.exe //F //PID <PID>`. Only THEN start a new Metro.
3. **Node version**: ≥ 20.19.4 required by Expo, but **avoid Node 22.x** (as of 2026-04 the 22.12 `importSyncForRequire` change loads `app.config.js` as ESM and `require()` blows up on it). Use 20.19.x: `nvm use 20.19.6` or similar. Verify with `node --version` before starting.
4. **Start Metro with the correct flags** (both `--dev-client` and `--clear` are load-bearing — without `--dev-client` Metro advertises the wrong manifest endpoint and the dev-client APK lands on `DevLauncherErrorActivity`):
   ```bash
   cd <worktree>/packages/happy-app && pnpm exec expo start --dev-client --clear
   ```
   Run as a background task. **Do not use** `pnpm start` / `pnpm --filter happy-app start` — those resolve to `expo start` without `--dev-client`.
5. `/d/Android/Sdk/platform-tools/adb.exe devices` shows the tablet as `device` (not `unauthorized`, not empty).
6. `adb reverse --list` shows `tcp:8081 tcp:8081`. If not: `adb reverse tcp:8081 tcp:8081`.
7. The HappyServer Windows service is running (`Get-Service HappyServer` → `Running`), and the named cloudflared tunnel is up (`curl -s -m 5 https://happy.evyatar.dev` → `200`). The tablet dev client reads MMKV `custom-server-url` = `https://happy.evyatar.dev`, so if either is down the app will fail to reach the server. See `.agents/skills/happy-service-manage/SKILL.md` for service ops.

## The loop

1. **Edit** code in `D:\h\packages\happy-app\sources\...`.
2. **Typecheck**:
   ```bash
   cd /d/h && pnpm --filter happy-app typecheck
   ```
3. **Commit** (small, focused commits -- one concern per commit). Even for throwaway diagnostics, a separate commit lets you `git revert` it cleanly when done.
4. **Force-reload the app** via deep link (most reliable; `shake to reload` is painful on e-ink). **Use the deep link, NOT `monkey -p ...LAUNCHER` — `monkey` opens the dev launcher's home screen, not your project, so you end up debugging the launcher.** See `happy-tablet-debug/SKILL.md` golden rule 4.
   ```bash
   /d/Android/Sdk/platform-tools/adb.exe shell am force-stop com.slopus.happy.dev
   /d/Android/Sdk/platform-tools/adb.exe shell am start -a android.intent.action.VIEW \
     -d 'happy://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081'
   ```
   The app relaunches, reconnects to Metro over `adb reverse tcp:8081`, fetches the fresh JS bundle. Verify with `adb shell "dumpsys activity activities | grep topResumedActivity"` — should show `com.slopus.happy.dev/.MainActivity` (NOT `DevLauncherErrorActivity`, NOT `com.onyx.android.dream.DreamActivity`).

   **If `topResumedActivity` shows `com.onyx/...DreamActivity`** the BOOX is in screensaver mode and your deep link landed under the dream. Wake it then re-fire the deep link:
   ```bash
   /d/Android/Sdk/platform-tools/adb.exe shell input keyevent KEYCODE_WAKEUP
   /d/Android/Sdk/platform-tools/adb.exe shell input keyevent KEYCODE_HOME
   # then re-run the force-stop + am start deep-link block above
   ```
   `KEYCODE_WAKEUP` alone is not enough — the dream activity stays on top until something else is launched, so a `HOME` keyevent (or another `am start`) is needed to dismiss it.
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
- **If `adb` commands hang indefinitely with no output** (this hits the Claude Code harness specifically — and any other automation that spawns adb without a TTY), there is almost certainly a stale adb client process holding a connection to the adb-server. The legitimate server lives at `D:\Android\Sdk\platform-tools\adb.exe`; a second adb binary at `D:\bin\platform-tools\adb.exe` (or any other location on PATH) can have been spawned hours ago by a previous session and never exited. Diagnose and kill:
  ```bash
  # find every running adb.exe and its source path:
  powershell -NoProfile -Command "Get-Process adb -ErrorAction SilentlyContinue | Select-Object Id, StartTime, Path | Format-List"
  # the one whose StartTime is from a previous session AND whose Path is NOT D:\Android\Sdk\platform-tools\adb.exe is the ghost:
  taskkill.exe //F //PID <ghost-pid>
  # then retry adb devices — should return immediately.
  ```
  Symptom: even `adb kill-server` hangs because the server is fine; the client is the one stuck. Do not blindly kill PID on port 5037 — that's the legitimate server.
- **Metro stale from a branch switch.** If you switched branches in `D:\h` while Metro was running, the file watcher sometimes misses the change set. Kill Metro (`taskkill //PID <node-pid> //F`) and restart. Typecheck clean + no change visible = restart Metro.

## When to stop using this loop

- If you're about to upgrade a native dependency -> rebuild.
- If the feature needs verification on prod-like behaviour (e.g. release-mode perf), build the preview variant via EAS and sideload.
- If you're doing many rapid edits and Metro starts choking, a full Metro restart is faster than diagnosing:
  ```
  # stop the old Metro background task, then:
  cd /d/h/packages/happy-app && pnpm exec expo start --dev-client --clear
  ```
  (Note: not `pnpm start` — that resolves to `expo start` without `--dev-client`; see preflight step 4.)

## Side-by-side test server (different port)

Sometimes you want to test a server-touching change without touching the live HappyServer Windows service on `:3005` (its pglite holds your real account data, and you can't `taskkill` it without elevation anyway because it runs in Session 0). Stand up a second `happy-server` on `:3006`, point Metro at it, and either pair fresh OR snapshot the live pglite for token reuse (covered below).

### Why env-var overrides alone don't redirect the tablet

The dev-client APK reads its server URL from MMKV key `custom-server-url`, set during onboarding to the cloudflared tunnel `https://happy.evyatar.dev`. There are two server-URL code paths:

- `appConfig.ts` reads `EXPO_PUBLIC_SERVER_URL` — overrides the persisted MMKV value. Logs `[loadAppConfig] Override serverUrl from EXPO_PUBLIC_SERVER_URL` on success.
- `serverConfig.ts:getServerUrl()` checks **MMKV first**, then `EXPO_PUBLIC_HAPPY_SERVER_URL`. **MMKV wins.** Every consumer in `auth/*`, `sync/api*`, and the socket initializer (`sync.ts:2676 apiSocket.initialize({ endpoint: getServerUrl(), ... })`) goes through `getServerUrl()`. So if the device ever onboarded against ANY server, MMKV is non-empty and the env var is silently ignored — every API call still hits the original tunnel.

Symptom of this trap: `[loadAppConfig] Override` log fires, `appConfig.serverUrl` looks correct, but the server log shows zero traffic; the tablet still talks to `https://happy.evyatar.dev`. **Setting the env vars is necessary but insufficient.**

To actually redirect, do **one** of:

- **(A) On-device:** open the app's `Settings → Server` screen (`packages/happy-app/sources/app/(app)/server.tsx`) and set the custom URL to `http://<lan-ip>:<test-port>`. This writes MMKV directly. Painful on e-ink.
- **(B) Local source patch (preferred for short test sessions):** flip the precedence in `serverConfig.ts` so the env var beats MMKV. Don't commit this — it's a worktree-only override:
   ```ts
   // serverConfig.ts:getServerUrl — LOCAL TEST OVERRIDE, revert before commit.
   return process.env.EXPO_PUBLIC_HAPPY_SERVER_URL ||
          serverConfigStorage.getString(SERVER_KEY) ||
          DEFAULT_SERVER_URL;
   ```
   Save → Metro auto-rebundles → the next deep-link force-launch picks up the redirect. **Always `git checkout -- packages/happy-app/sources/sync/serverConfig.ts` before merging the worktree.**

### Steps

```bash
# 1. Pick a worktree and a fresh data dir
WORKTREE=D:/harness-efforts/happy/.ralph/jobs/<job>/worktree
TEST_PORT=3006

# 2. Drop a .env.test file
cat > $WORKTREE/packages/happy-server/.env.test <<EOF
DB_PROVIDER=pglite
HANDY_MASTER_SECRET=test-key-$(date +%s)
PORT=$TEST_PORT
NODE_ENV=development
PGLITE_DIR=./data-test/pglite
DATA_DIR=./data-test
METRICS_ENABLED=false
DANGEROUSLY_LOG_TO_SERVER_FOR_AI_AUTO_DEBUGGING=false
EOF

# 3. Migrate the test pglite (37 migrations on a clean tree as of 2026-04)
cd $WORKTREE/packages/happy-server
npx tsx --env-file=.env.test ./sources/standalone.ts migrate

# 4. Serve in the background
npx tsx --env-file=.env.test ./sources/standalone.ts serve &

# 5. Confirm health
curl.exe -s -m 3 http://localhost:$TEST_PORT/health   # → {"status":"ok",...}

# 6. Apply the serverConfig.ts precedence patch (option B above) IF using env-var redirect
# (skip if using on-device option A)

# 7. Start Metro with BOTH env-var overrides + --dev-client --clear
cd $WORKTREE/packages/happy-app
EXPO_PUBLIC_SERVER_URL="http://<lan-ip>:$TEST_PORT" \
EXPO_PUBLIC_HAPPY_SERVER_URL="http://<lan-ip>:$TEST_PORT" \
  pnpm exec expo start --dev-client --clear

# 8. adb reverse + deep-link force-launch
/d/Android/Sdk/platform-tools/adb.exe reverse tcp:8081 tcp:8081
/d/Android/Sdk/platform-tools/adb.exe shell am force-stop com.slopus.happy.dev
/d/Android/Sdk/platform-tools/adb.exe shell am start -a android.intent.action.VIEW \
  -d 'happy://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081'
```

**Verify the redirect actually took.** Server log (`packages/happy-server/.logs/<timestamp>.log`) should show requests from the tablet's LAN IP within seconds — `Auth check - path: /v1/sessions, has header: true`. If you see only your own `curl /health` probes and nothing from `192.168.0.x`, the redirect didn't take — re-check that the precedence patch is saved AND that Metro rebundled after the save.

### Token reuse via pglite snapshot (avoid fresh QR pairing)

Pairing the tablet fresh is annoying — empty pglite → no sessions to scroll, no real-world data, every test starts from zero. Better: snapshot the live `:3005` pglite into the test data-dir, match the master secret, and the tablet's existing auth token validates against `:3006` immediately (verified by `module: "auth-decorator", msg: "Auth success - user: <userId>"` in the server log).

This works because pglite stores its data as Postgres files with FILE_SHARE_READ on Windows — you can `cp -r` a live pglite tree while the running service holds it open. Token verification is `Ed25519`-signed with the seed from `HANDY_MASTER_SECRET`, so as long as the secret matches AND the user record exists in the snapshot, the existing token from the production tunnel verifies on the test server.

```bash
# 1. Stop the :3006 test server (don't touch the :3005 service)
TEST_PID=$(netstat -ano | grep ":$TEST_PORT" | grep LISTENING | awk '{print $NF}')
taskkill //F //PID $TEST_PID

# 2. Snapshot the live pglite + files (read-shareable on Windows, no admin needed)
LIVE=D:/harness-efforts/happy/packages/happy-server/data
TEST=$WORKTREE/packages/happy-server/data-test
rm -rf $TEST/pglite $TEST/files
cp -r $LIVE/pglite $TEST/pglite
cp -r $LIVE/files $TEST/files     # voice / artifact blobs, if you care about them

# 3. Match the master secret in .env.test (matches the dev .env.dev value used by the live service)
sed -i 's|HANDY_MASTER_SECRET=.*|HANDY_MASTER_SECRET=your-super-secret-key-for-local-development|' \
  $WORKTREE/packages/happy-server/.env.test

# 4. Restart serve (skip migrate — the snapshot already has every migration applied)
cd $WORKTREE/packages/happy-server
npx tsx --env-file=.env.test ./sources/standalone.ts serve &
```

**Caveat: live snapshot is not transactionally consistent.** pglite WAL files in the snapshot may be slightly ahead of the data files because the source service was running. In practice startup recovery handles this fine for the streaming-pagination test ( the snapshot booted clean and accepted all reads). If pglite refuses to start with WAL errors, stop the live service briefly (needs admin), snapshot, restart — or just `rm -rf data-test/pglite/pg_wal/*` after copy and let pglite cold-recover from the data files only (acceptable for a read-only test scenario, will lose any unflushed writes from the moment of copy).

**LAN reachability.** `<lan-ip>:3006` works because the desktop's HappyServer-on-3005 doesn't bind 3006, and the test server binds `0.0.0.0:3006`. The cloudflared tunnel only routes to `:3005`, so external HTTPS isn't an option for `:3006` — the tablet must be on the same LAN as the desktop. If you need TLS / external access, run a second cloudflared named tunnel pointing at `:3006` (out of scope for this skill).

### Verifying which path the app actually uses (HTTP vs socket)

Once redirected, you'll need to confirm the new code path is running, not the legacy fallback. Some socket-event handlers are deliberately silent on entry (no per-request `log()`) so direct telemetry isn't visible — fall back to indirect signals:

- **HTTP path is logged** — every `/v3/sessions/.../messages?after_seq=N&limit=M` shows up as a request line in the server log. `limit=100` means cold-start (always HTTP, untouched by feature flags); `limit=80` means legacy `loadOlder()` (the path you want to see *disappear* when a flag-gated socket replacement is on).
- **Socket events are NOT logged by default.** If you need per-event telemetry, add a one-liner to the handler entry:
   ```ts
   socket.on('session-message-range', async (data, callback) => {
     log({ module: 'session-message-range' }, `request: ${data?.fromSeq}..${data?.toSeq}`);
     ...
   });
   ```
   Worktree-only, or commit it as a small follow-up if it stays useful.
- **Socket connection alive?** `module: "websocket", msg: "User connected: <userId>"` confirms the dev-client's `/v1/updates` websocket is up. No connection event = the socket layer never connected; the new path can't fire at all and the app silently falls back to HTTP. Look for active TCP via `netstat -ano | grep :<port> | grep ESTABLISHED`.

### Cleanup

```bash
# stop the test server
ps -ef | grep "standalone.ts serve" | grep -v grep | awk '{print $2}' | xargs -r kill -9
rm -rf $WORKTREE/packages/happy-server/data-test
rm $WORKTREE/packages/happy-server/.env.test
git checkout -- $WORKTREE/packages/happy-app/sources/sync/serverConfig.ts   # revert option-B precedence patch
```
The Windows service on `:3005` was untouched throughout — your real account is unchanged.

## Related

- `.agents/skills/happy-service-manage/SKILL.md` -- managing HappyServer + cloudflared Windows services (what the app talks to).
- `.agents/skills/happy-discover-metadata-tags/SKILL.md` -- one concrete application of this loop (instrument → reload → observe → refine).
- `docs/fork-notes.md` -> "Things that bit us that aren't obvious" -- the `console.log` gotcha and others.
