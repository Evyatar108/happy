---
name: happy-app-playstore-release
description: >
  Build a signed Android release of `happy-app` and ship it to the
  maintainer's two BOOX tablets without USB/Metro. Current default
  channel: **Firebase App Distribution** (the Play Console developer
  account is currently locked, see "Channel selection" below). When
  Play Console reopens, the same signed pipeline also targets the
  Google Play **Internal Testing** track. Use whenever the user asks
  to "publish happy-app", "ship the app to my tablets remotely",
  "release the Android build", "AAB", "App Distribution", etc. NOT
  for inner-loop dev iteration — Metro is still the dev loop
  (`.agents/skills/happy-tablet-iterate/SKILL.md`). NOT for iOS — App
  Store remains out of scope on the fork.
---

# /happy-app-playstore-release — Android release for the fork's tablets

The fork's mobile inner-loop is Metro+USB to the primary BOOX tablet.
This skill covers the **propagation** channel: a signed APK (or AAB)
delivered to both BOOX tablets over WiFi, so the maintainer doesn't
have to plug each tablet in.

## Channel selection

The fork has two interchangeable "ship the build" channels. Both consume
the same signed `app-release.apk` from `pnpm release:android`. Pick the
one that's currently available:

| Channel | When to use | Setup cost | Per-update UX on tablet |
| --- | --- | --- | --- |
| **Firebase App Distribution** (default today) | Always available; no Play Console required | One-time `firebase login` + invite testers | Notification → tap install (no USB) |
| Google Play Internal Testing | Only when Play Console developer account `evyatar109@gmail.com` is active | $25 + identity verification + Play App Signing | Standard Play auto-update (no USB) |

**As of 2026-04-30 the Play Console account is closed for inactivity** —
Firebase App Distribution is the working channel. When Play reopens,
you can run both channels in parallel (App Distribution = pre-release
testing for the maintainer, Play Internal Testing = stable channel for
extra testers) by adding a `bundleRelease` step alongside the existing
`assembleRelease`. The keystore, package id, `versionCode` flow, and
`google-services.json` are shared between both channels — the only
delta is the upload destination.

## Fork conventions that matter

- **Package id is `com.evyatar109.happy`** (production variant only).
  Renamed from upstream's `com.ex3ndr.happy` because the fork does not
  own that namespace, and **the package id is permanent once published**
  to a Play Store listing. Dev/preview ids (`com.slopus.happy.dev`,
  `com.slopus.happy.preview`) stay under the upstream namespace because
  they never see Play Store or App Distribution.
- **Build is local Gradle**, not EAS. `./gradlew assembleRelease` for
  APK (App Distribution + adb fallback) or `./gradlew bundleRelease`
  for AAB (Play Store). No Expo cloud, no `eas build`, no `eas submit`.
  The upstream `release:build:appstore`, `release:build:developer`,
  `ota`, `ota:production` scripts in `packages/happy-app/package.json`
  are dead-but-present (per memory `release_via_github.md` and the
  fork's `packages/happy-app/CLAUDE.md`). **Do not run them.**
- **OTA is disabled.** The upstream `updates.url`
  (`https://u.expo.dev/4558dd3d-...`) was removed from `app.config.js`.
  `expo-updates` is a no-op at runtime; auto-update happens via the
  active distribution channel only.
- **Versioning** mirrors `CHANGELOG.md`. The script reads the highest
  `## Version N - YYYY-MM-DD` heading and computes `versionCode = N`
  and `versionName = "1.N.0"`. **`versionCode` must monotonically
  increase across all releases**, including across uninstalls — Play
  Store rejects an AAB whose `versionCode` is `<=` the highest one ever
  uploaded for the listing, and App Distribution gets confused if a
  newer-by-name build has a smaller `versionCode`. Always bump
  CHANGELOG before each release.

## Where things live

- APK output: `packages/happy-app/android/app/build/outputs/apk/release/app-release.apk`
  (~103 MB unminified — see pitfall #10 for the R8 status).
- AAB output (when Play reactivates and we swap `assembleRelease` →
  `bundleRelease`): `packages/happy-app/android/app/build/outputs/bundle/release/app-release.aab`.
- Keystore: `D:\secrets\happy-app-release.keystore` (or whatever path
  is referenced from `keystore.properties`). **Outside the repo.**
  Backed up to `C:\Users\evmitran\OneDrive\secrets\happy-app-release\`
  with a README documenting the password + SHA-256 fingerprint.
- Keystore credentials: `packages/happy-app/android/keystore.properties`
  (gitignored). Format:
  ```
  RELEASE_STORE_FILE=D:/secrets/happy-app-release.keystore
  RELEASE_STORE_PASSWORD=<store password>
  RELEASE_KEY_ALIAS=happy-app
  RELEASE_KEY_PASSWORD=<key password>
  ```
- Firebase config: there are **two copies that must stay in sync** —
  `packages/happy-app/google-services.json` (the source-of-truth file
  Expo points at via `app.config.js` `android.googleServicesFile`)
  AND `packages/happy-app/android/app/google-services.json` (the file
  the Gradle `com.google.gms.google-services` plugin actually reads
  during `processReleaseGoogleServices`). Without prebuild running
  on every build, the second copy is stale-by-default. **Always copy
  the package-root file into `android/app/` after a Firebase project
  change** — see pitfall #2.
- Build script entry point: `packages/happy-app/release-android.cjs`
  (invoked by `pnpm release:android`).
- Expo-CLI wrapper: `packages/happy-app/scripts/expo-embed-wrapper.cjs`
  — absolutifies `--entry-file` before delegating to `@expo/cli`.
  Required because the RN Gradle plugin's `File.cliPath(base)` returns
  a relative path on Windows (the bug is in
  `node_modules/@react-native/gradle-plugin/shared/src/main/kotlin/com/facebook/react/utils/Os.kt`),
  and Metro on this pnpm-workspace mis-resolves the relative path.
  Pointed at from `android/app/build.gradle` `react.cliFile`.
- Signing-config injection: `packages/happy-app/android/app/build.gradle`
  reads `keystore.properties` from the Android project root and wires a
  `signingConfigs.release` block; the `release` build type uses it
  conditionally (`keystoreProperties['RELEASE_STORE_FILE'] ? release : debug`).
- App-id-by-env mapping: also in `build.gradle` — `appPackageByEnv`
  maps `APP_ENV` → `applicationId` so a raw `gradlew assembleRelease`
  with `APP_ENV=production` produces `com.evyatar109.happy` instead of
  the dev variant id. **`namespace` is decoupled from `applicationId`**
  and stays at `com.slopus.happy.dev` because the committed Kotlin
  sources at `android/app/src/main/java/com/slopus/happy/dev/Main*.kt`
  reference `BuildConfig` from that package; changing `namespace`
  breaks compilation.
- Env-driven app label: `appLabelByEnv` in `build.gradle` →
  `resValue "string", "app_name", appLabel`. Replaces the hardcoded
  `Happy (dev)` that used to live in `android/app/src/main/res/values/strings.xml`.
- CMake intermediate dir: redirected to `C:\cxb\<rootName>-<module>\` via
  `android.externalNativeBuild.cmake.buildStagingDirectory` in
  `build.gradle`. Required to keep CMake/ninja output paths under
  Windows MAX_PATH (~260 chars). See pitfall #6.
- Android SDK location: `D:\Android\Sdk` (per memory `drive_preferences.md`),
  pointed at from `packages/happy-app/android/local.properties`
  (`sdk.dir=D:/Android/Sdk`). The system `ANDROID_HOME` env var still
  references a stale `C:\Users\evmitran\AppData\Local\Android\Sdk`
  path; `local.properties` overrides it for Gradle.
- Gradle JVM heap: `org.gradle.jvmargs=-Xmx6g` in
  `packages/happy-app/android/gradle.properties`. The default 2 GB
  isn't enough for parallel native-module CMake builds and produces
  `Insufficient memory for the JRE` on `:react-native-quick-base64:configureCMake...`.
- Release ABI filter: `release-android.cjs` passes
  `-PreactNativeArchitectures=arm64-v8a` to Gradle. BOOX tablets are
  64-bit ARM only; building x86 / armeabi-v7a / x86_64 wastes ~3× the
  time and memory and produces dead weight.

## Prerequisites — Firebase App Distribution path (current default)

One-time setup; verify in place before each release.

1. **`firebase-tools` installed globally**:
   ```bash
   npm install -g firebase-tools
   firebase --version          # confirm CLI works
   firebase login              # browser-based auth as evyatar109@gmail.com
   firebase login:list         # confirm: "Logged in as evyatar109@gmail.com"
   ```
   `firebase login` requires a TTY — run it directly in a terminal,
   not via Bash tool / non-interactive shell, or it errors with
   "Cannot run login in non-interactive mode."
2. **Firebase project** created under `evyatar109@gmail.com` with an
   Android app registered for `com.evyatar109.happy`. Currently:
   project id `happy-app-141ff`, app id
   `1:646513741933:android:3c65be8ee7299f5bc46f64`. Download the
   project's `google-services.json` and place it at:
   ```
   packages/happy-app/google-services.json
   packages/happy-app/android/app/google-services.json   # ALSO HERE
   ```
   Both copies must contain `com.evyatar109.happy` as a registered
   client package name. The Gradle plugin reads the second copy at
   build time; the first is the Expo source-of-truth that prebuild
   would copy from. Since this fork doesn't run prebuild, both must
   be maintained manually.
3. **App Distribution enabled** for that Firebase project (Console →
   App Distribution → Get started, no extra cost).
4. **Tester group "tablets"** created in Firebase Console → App
   Distribution → Testers & Groups → Add group → name `tablets` → add
   `evyatar109@gmail.com` (the Google account both tablets are signed
   into). Override the group name with `FIREBASE_GROUPS=othergroup` env
   var if you want a different name. Adding a tester directly without
   a group works for delivery but breaks the script's default
   `--groups tablets` argument.
5. **Keystore present** at the path referenced by `keystore.properties`.
   Generated once with:
   ```bash
   keytool -genkey -v -keystore D:/secrets/happy-app-release.keystore \
     -alias happy-app -keyalg RSA -keysize 2048 -validity 10000
   ```
   **Backed up offline** to OneDrive at
   `C:\Users\evmitran\OneDrive\secrets\happy-app-release\` (with a
   `README.md` documenting password + SHA-256 fingerprint). Without
   Play App Signing (only available via Play Console), losing this
   keystore means losing update continuity — testers would have to
   uninstall and reinstall under a new key.
6. **`keystore.properties` present** in `packages/happy-app/android/`
   with the four `RELEASE_*` keys (gitignored). Copy from
   `packages/happy-app/android/keystore.properties.example`.
   **Use forward slashes on Windows paths** — `RELEASE_STORE_FILE=D:/secrets/...`,
   not `D:\secrets\...`. Java `Properties` parses backslash as an
   escape character and the build silently falls through to the debug
   keystore (which `build.gradle` now blocks for production builds, so
   you'll see a `GradleException` instead of a debug-signed APK
   shipping). Without `RELEASE_STORE_FILE` set, production builds
   deliberately fail — see pitfall #5.
7. **Android SDK present at `D:\Android\Sdk`** with the exact
   components used by this build:
   ```
   sdkmanager "platforms;android-36" \
              "build-tools;36.0.0" \
              "ndk;27.1.12297006" \
              "cmake;3.22.1"
   ```
   `local.properties` at `packages/happy-app/android/local.properties`
   should contain `sdk.dir=D:/Android/Sdk` (forward slashes — see #6).
   Copy from the tracked `local.properties.example`. The stale system
   `ANDROID_HOME=C:\...` does not need to be unset; `local.properties`
   wins for Gradle.
8. **JDK 11+ on PATH** for `keytool`/`apksigner`/Gradle. The dev PC
   has Microsoft OpenJDK 11.0.16.101 at
   `C:\Program Files\Microsoft\jdk-11.0.16.101-hotspot\`. AGP 8.x
   tolerates JDK 11/17/21; JDK 8 hard-fails. `JAVA_HOME` does not
   need to be set if `java` is on PATH.
9. **Both BOOX tablets set up once** (per memory `devices.md`, resolve
   serial via `model:Air5C` / `model:TabXC`):
   - Sign in to the tablet with `evyatar109@gmail.com`.
   - Open the email invitation from Firebase ("You've been invited to
     test Happy") → tap the link → install **App Tester** when
     prompted.
   - Sign in to App Tester with `evyatar109@gmail.com`. Accept the
     invitation. Done forever — every future build pushed to the
     `tablets` group will land as a notification.
   - Allow "Install unknown apps" for App Tester the first time it
     prompts (Settings → Apps → App Tester → Install unknown apps →
     Allow). BOOX-specific note: GMS must be enabled for App Tester
     login to work; enable in Settings → Apps → Google Play if not
     already.

## Prerequisites — Play Internal Testing path (deferred)

Only when the Play Console developer account `evyatar109@gmail.com` is
active. Same keystore + same `google-services.json` + same package id
as the App Distribution path. Additional setup:

1. Play Console developer registration ($25, identity verification).
2. App created in Play Console with package id `com.evyatar109.happy`.
3. App content declarations completed (privacy policy URL, data safety
   form, target audience, content rating, ads = no, app access).
4. Play App Signing accepted on first AAB upload — Google manages the
   upload signing key and gives a recovery path if the keystore is
   ever lost.
5. Both tablets opted in via the Internal Testing tester URL from Play
   Console.

## Per-release procedure (App Distribution path)

```bash
# 1. Update CHANGELOG.md with a new "## Version N - YYYY-MM-DD" entry.
#    versionCode = N; versionName = 1.N.0. N must be strictly greater
#    than the highest versionCode ever uploaded.

# 2. From packages/happy-app:
pnpm release:android
#    - Reads N from CHANGELOG.md.
#    - Regenerates sources/changelog/changelog.json.
#    - Runs `./gradlew assembleRelease` with APP_ENV=production,
#      -PVERSION_CODE=N -PVERSION_NAME=1.N.0,
#      -PreactNativeArchitectures=arm64-v8a.
#    - Writes the Version-N section of CHANGELOG.md to a temp file
#      and uploads via `firebase appdistribution:distribute --release-notes-file <tmp>`
#      (inline `--release-notes` blows past the Windows command-line
#      buffer for non-trivial release notes — pitfall #11).
#    - Auto-detects the Firebase App ID from google-services.json.
#    - Distributes to the `tablets` group (override with
#      FIREBASE_GROUPS=othergroup).

# 3. On each tablet:
#    Notification arrives within ~minutes -> tap -> Install.
#    No cable, no laptop interaction.
```

Build timing on the dev PC: ~5–10 min cold (full native compile of
~30 modules), ~30 s incremental once Gradle's cache is warm.

To skip the upload (for example, when iterating on signing locally and
you want to `adb install` instead): `pnpm release:android --no-distribute`.

## Per-release procedure (Play Internal Testing, when reactivated)

When Play reopens, swap the build command from `assembleRelease` to
`bundleRelease` (or run both in `release-android.cjs`). Then:

```bash
# Build AAB
pnpm release:android   # (after switching the script to bundleRelease)
# Upload manually: Play Console -> Internal testing -> Create new release
# -> upload android/app/build/outputs/bundle/release/app-release.aab
# -> set release name to "Version N", paste release notes, roll out.
```

Tablets auto-update via Play Store within hours.

## Verification

After upload + tablet install:

1. **APK built**:
   ```bash
   ls -la packages/happy-app/android/app/build/outputs/apk/release/
   # Expect: app-release.apk (~100 MB unminified)
   ```
2. **APK signed with the release key** (not debug). **Use `apksigner`,
   not `keytool`** — `keytool -printcert -jarfile` reports
   "Not a signed jar file" against an APK because APKs use the v2/v3
   signing schemes, not jar signing:
   ```bash
   "$ANDROID_HOME"/build-tools/36.0.0/apksigner.bat verify --print-certs \
     packages/happy-app/android/app/build/outputs/apk/release/app-release.apk
   # Expect:
   #   Signer #1 certificate DN: CN=Evyatar Mitrani, O=Personal, C=IL
   #   Signer #1 certificate SHA-256 digest: 3a1f595d2089b193e8b1ef52dfe55d21932513d6e32ad07d3bc1c996221ed5a5
   ```
   The SHA-256 above is the canonical fingerprint; if it differs the
   build picked up the debug keystore (because `keystore.properties`
   wasn't loaded — see pitfall #5).
3. **Package id, versionCode, label correct in the APK**:
   ```bash
   "$ANDROID_HOME"/build-tools/36.0.0/aapt.exe dump badging \
     packages/happy-app/android/app/build/outputs/apk/release/app-release.apk \
     | grep -E "package:|application: "
   # Expect:
   #   package: name='com.evyatar109.happy' versionCode='N' versionName='1.N.0' ...
   #   application: label='Happy' icon='res/BW.xml'
   # If label shows 'Happy (dev)', the env-driven resValue isn't taking
   # effect — APP_ENV not set or the strings.xml entry wasn't removed
   # (pitfall #9).
   ```
4. **Tablet has the new versionCode** (after the user accepted the
   Install prompt in App Tester — adb is fine for this read-only check
   even though installs are over WiFi):
   ```bash
   adb -s $DEV_TABLET shell dumpsys package com.evyatar109.happy | grep -E "versionCode|versionName"
   # Expect: versionCode=N, versionName=1.N.0 matching CHANGELOG.md
   ```
   For the secondary tablet, resolve serial by `model:TabXC` per memory
   `devices.md`.
5. **No `u.expo.dev` traffic**: `adb logcat | grep -i expo-updates` shows
   nothing relevant on app launch — confirms OTA is fully disabled.

If any of (1)–(4) fails, fall back to Metro
(`.agents/skills/happy-tablet-iterate/SKILL.md`) for fast inner-loop
iteration, fix the underlying issue, then re-bump CHANGELOG and re-run.

## Common pitfalls

These were all hit empirically during the initial bring-up on
2026-04-30 (or caught in the post-bring-up review). The fixes are
checked in; this list is here so a future regression / fresh worktree
/ cache wipe doesn't require rediscovering them.

1. **`expo prebuild --clean` wipes the build.gradle customizations.**
   The keystore wiring, env-based `applicationId`, env-based app
   label (`resValue "string", "app_name", appLabel`), versioned
   `applicationId`/`namespace` decoupling, gradle-property `versionCode`/
   `versionName`, the `expo-embed-wrapper.cjs` cliFile pointer, the
   CMake `buildStagingDirectory`, and the
   `-PreactNativeArchitectures` ABI filter all live as direct edits
   to `packages/happy-app/android/app/build.gradle`, not as Expo
   config plugins. If you ever run prebuild, re-apply every block.
   The fork has not run prebuild to-date; the committed `android/`
   is the source of truth. A future cleanup is to wrap the
   injection in an Expo config plugin (pattern:
   `packages/happy-app/plugins/withEinkCompatibility.js`).
2. **`google-services.json` lives in TWO places that must stay in
   sync.** `packages/happy-app/google-services.json` is what
   `app.config.js` `android.googleServicesFile` points at — Expo's
   prebuild would copy this into `android/app/`, but on this fork
   prebuild never runs, so the second copy at
   `packages/happy-app/android/app/google-services.json` must be
   updated manually. If only the first is updated, Gradle fails at
   `processReleaseGoogleServices` with
   `No matching client found for package name 'com.evyatar109.happy'`.
   Any future package-id rename or Firebase project change has to
   touch BOTH files.
3. **RN Gradle plugin passes a relative `--entry-file` on Windows
   and Metro mis-resolves it.** The bug is in
   `node_modules/@react-native/gradle-plugin/shared/src/main/kotlin/com/facebook/react/utils/Os.kt`
   around line 41: `cliPath()` returns `relativeTo(base).path` on
   Windows but `absolutePath` on Unix. Metro on this pnpm-workspace setup then
   fails with
   `Unable to resolve module ./index.ts from D:\harness-efforts\happy/.`
   The workaround in this skill: a wrapper script
   `packages/happy-app/scripts/expo-embed-wrapper.cjs` that
   intercepts the `--entry-file` arg and absolutifies it before
   delegating to the real `@expo/cli`. `react.cliFile` in
   `build.gradle` points at this wrapper instead of `@expo/cli`
   directly. Don't revert this without also fixing the upstream bug.
4. **Don't `subst H: D:\harness-efforts\happy` to shorten paths.**
   Metro's pnpm-workspace module resolution breaks under a virtual
   drive — it can't find `@slopus/happy-wire` because the
   workspace-root walk hits a different layout via the substituted
   drive. Tested 2026-04-30, build failed with
   `Unable to resolve module @slopus/happy-wire`. The Windows
   MAX_PATH issue is solved differently — see pitfall #6.
5. **Production build with no `keystore.properties` is now BLOCKED**
   (since 2026-04-30). `build.gradle` throws a `GradleException`
   when `APP_ENV=production` is set on a release task without
   `RELEASE_STORE_FILE` in `keystore.properties`. Same for
   `APP_ENV=development` on any release task. Pre-2026-04-30 the
   build silently fell through to debug signing, distributed a
   debug-signed APK to Firebase, and tablets rejected the next
   update with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`. Don't loosen
   the guards.

   The package-root → `android/app/` `google-services.json` sync is
   automated in `release-android.cjs` (`syncGoogleServicesJson`):
   the package-root file is the source-of-truth, the script copies
   it into `android/app/` before invoking Gradle. Manually editing
   only `android/app/google-services.json` will be silently
   overwritten on the next release run. Edit the package-root file.
6. **Windows MAX_PATH (260) limit hits CMake/ninja intermediate
   files.** A native module like `react-native-enriched` produces
   intermediate paths like
   `<src>/android/app/.cxx/Release/<hash>/arm64-v8a/RNEnrichedTextInputViewSpec_autolinked_build/CMakeFiles/react_codegen_RNEnrichedTextInputViewSpec.dir/D_/harness-efforts/happy/node_modules/react-native-enriched/...` —
   ~360 chars. Even with Windows `LongPathsEnabled=1` in the
   registry (it is on this PC), the bundled Android-SDK ninja 1.x
   from CMake 3.22 doesn't honor long paths and stat() fails with
   `Filename longer than 260 characters`. **Fix:** redirect the
   CMake intermediate dir to a short prefix via
   `android.externalNativeBuild.cmake.buildStagingDirectory file("C:/cxb/${rootProject.name}-${project.name}")`
   in `build.gradle`. With the embedded source path
   (`D_/harness-efforts/happy/...`) shrunk by the short prefix,
   the longest path lands under 260.
7. **Gradle JVM heap default is too small for parallel native
   builds.** With `org.gradle.jvmargs=-Xmx2048m` and
   `org.gradle.parallel=true`, the parallel CMake configure tasks
   for `react-native-quick-base64` / `react-native-nitro-modules` /
   `expo-updates` race for memory and one of them dies with
   `There is insufficient memory for the Java Runtime Environment to continue.`
   Bumped to `-Xmx6g` in `gradle.properties`. Don't lower without
   also disabling parallel.
8. **`namespace` and `applicationId` are different things — only
   `applicationId` should track APP_ENV.** `namespace` is the package
   of the generated `BuildConfig` and `R` classes. The committed
   Kotlin sources at
   `android/app/src/main/java/com/slopus/happy/dev/Main{Activity,Application}.kt`
   declare `package com.slopus.happy.dev` and reference
   `BuildConfig` from that package. If `namespace` is changed to
   `com.evyatar109.happy` (e.g. by setting `namespace appPackage`),
   `BuildConfig` is regenerated under the new package and the
   Kotlin sources fail with `Unresolved reference 'BuildConfig'`.
   Keep `namespace 'com.slopus.happy.dev'` fixed; only vary
   `applicationId`. A separate cleanup would move the Kotlin
   sources to a per-env package, but that's out of scope.
9. **The autolinking-config cache survives package-id changes.**
   `android/build/generated/autolinking/autolinking.json` is keyed
   on lockfiles, not on `app.config.js`. If you change the package
   id in `app.config.js` (or namespace in `build.gradle`) without
   touching `package.json` / `pnpm-lock.yaml`, the autolinking
   cache stays stale and the auto-generated
   `ReactNativeApplicationEntryPoint.java` ends up with
   `if (.BuildConfig.IS_NEW_ARCHITECTURE_ENABLED)` (empty package
   prefix) — a Java syntax error. **Fix:** delete the cache:
   ```bash
   rm -rf packages/happy-app/android/build/generated/autolinking
   ```
   Then rebuild.
10. **R8 minification + shrinking is currently DISABLED.** Enabling
    it (`android.enableMinifyInReleaseBuilds=true` +
    `android.enableShrinkResourcesInReleaseBuilds=true` in
    `gradle.properties`) trips R8 with `Missing classes detected`
    — references to optional code in `expo.modules.core.MapHelper`,
    `io.netty.internal.tcnative.*`, `org.apache.log4j.*` from
    transitive deps. R8 generates a `missing_rules.txt` at
    `app/build/outputs/mapping/release/missing_rules.txt`; to
    re-enable, pipe those rules into `android/app/proguard-rules.pro`.
    APK is ~103 MB unminified (acceptable for App Distribution
    over WiFi to two tablets); revisit when Play Internal Testing
    promotes to Production where smaller is meaningful.
11. **Inline `--release-notes` blows past Windows command-line
    length limits for long CHANGELOG sections.** `firebase
    appdistribution:distribute` exits 1 with
    `The system cannot find the file specified.` because the
    quoted argument confuses cmd.exe. **Fix (already in
    `release-android.cjs`):** the notes are written to a temp file
    in `os.tmpdir()` and passed via `--release-notes-file`. The
    temp file is cleaned up in `finally`.

    Watch out for the JS-regex `\Z` trap: `\Z` is **not** an end-of-input
    anchor in JavaScript (it's interpreted as the literal character
    `Z`). The pre-2026-04-30 `extractReleaseNotes` regex used
    `(?=^## Version |\Z)` and silently truncated notes at any literal
    `Z` in the section, or — when the version was the last entry in
    the file — fell through to the `"Version N"` fallback. Today's
    implementation uses a `String.split(/^## Version /m)` and
    header-prefix match instead; verified against the full CHANGELOG
    on 2026-04-30. If you ever rewrite this to a regex, use
    `$(?![\s\S])` for end-of-input, not `\Z`.
12. **Two `app_name` resources at once is a dupe-resource error.**
    The committed `android/app/src/main/res/values/strings.xml`
    used to hardcode `<string name="app_name">Happy (dev)</string>`.
    Adding `resValue "string", "app_name", appLabel` in `defaultConfig`
    on top of that fails with "duplicate resource". **Fix:** remove
    the entry from `strings.xml` and let `resValue` be the only
    source. Already done; the file now has a comment placeholder.
13. **`firebase login` requires a real TTY**, and
    `firebase appdistribution:distribute` needs an active session.
    Running `firebase login` via a non-interactive shell errors
    with `Cannot run login in non-interactive mode. See login:ci to
    generate a token for use in non-interactive environments.`
    First-time setup must come from the user's actual terminal;
    verify with `firebase login:list`. CI would need a service-account
    key (`FIREBASE_TOKEN` or `GOOGLE_APPLICATION_CREDENTIALS`).
14. **App Tester needs "Install unknown apps" permission.**
    Per-tablet, first-time only. If the install silently fails,
    check Settings → Apps → App Tester → Install unknown apps →
    Allow. **BOOX-specific:** GMS must also be enabled (Settings →
    Apps → Google Play) — BOOX ships with GMS disabled, and App
    Tester sign-in fails silently without it.
15. **`versionCode` must monotonically increase, including across
    uninstalls and across re-uploads to App Distribution.** Always
    bump `CHANGELOG.md` before each release; never reuse or
    downgrade `N`. Tablets that already have a higher `versionCode`
    installed won't show the notification at all. Lose the keystore
    too and you lose update continuity entirely (App Distribution
    has no upload-key recovery; only Play App Signing does, and
    the Play account is currently locked) — back up
    `D:\secrets\happy-app-release.keystore` + `keystore.properties`
    to OneDrive (already done at
    `C:\Users\evmitran\OneDrive\secrets\happy-app-release\`).
16. **Don't run upstream release scripts or `pnpm prebuild`.**
    `pnpm ota`, `pnpm release:build:appstore`,
    `pnpm release:build:developer`, etc. are upstream `bulkacorp`
    tooling and either fail or push to channels nothing on the
    fork consumes. `pnpm prebuild` is now stubbed to error out with
    a pointer to this skill — running `npx expo prebuild` directly
    is still possible but wipes every customization documented in
    pitfall #1. Per memory `release_via_github.md` and
    `feedback_read_skills_first.md`, only run `pnpm release:android`
    for Android releases on this fork. Also: "auto-update" via App
    Distribution / Play Store ships full APK rebuilds, NOT the Expo
    cloud JS-bundle "OTA" channel that the upstream `pnpm ota`
    script targets.
17. **Production-track 14-day rule does NOT apply to Internal
    Testing.** When Play reactivates, stay on Internal Testing —
    the 14-day-with-12-testers rule only kicks in if the listing
    is promoted to a Production track.

## Out of scope

- iOS App Store submission. The user only ships to BOOX (Android).
- Production track promotion (Internal Testing serves the user's two
  tablets indefinitely).
- EAS Update / self-hosted OTA.
- Automating the Play Console upload via `fastlane supply` or Play
  Developer API. Manual upload for the first ~3 Play releases keeps
  moving parts low. (App Distribution upload is already automated by
  `release-android.cjs`.)
