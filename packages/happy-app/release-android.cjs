#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const workspaceRoot = __dirname;
const PACKAGE_ID = 'com.evyatar109.happy';

function readLatestChangelogVersion() {
    const changelogPath = path.join(workspaceRoot, 'CHANGELOG.md');
    if (!fs.existsSync(changelogPath)) {
        throw new Error(`CHANGELOG.md not found at ${changelogPath}`);
    }
    const content = fs.readFileSync(changelogPath, 'utf-8').replace(/\r\n/g, '\n');
    let latest = 0;
    const re = /^## Version (\d+) - /gm;
    let m;
    while ((m = re.exec(content)) !== null) {
        const n = parseInt(m[1], 10);
        if (!isNaN(n) && n > latest) latest = n;
    }
    if (latest <= 0) {
        throw new Error('No `## Version N - YYYY-MM-DD` entry found in CHANGELOG.md');
    }
    return latest;
}

// Returns the markdown body between `## Version N - DATE` and the next
// `## Version` heading (or end of file). String split keeps this simple
// and avoids the JS-regex pitfall that there is no `\Z` anchor and
// template-literal `\\s\\S` collapses to bare `s`/`S` after one round
// of escape processing.
function extractReleaseNotes(versionN) {
    const changelogPath = path.join(workspaceRoot, 'CHANGELOG.md');
    const content = fs.readFileSync(changelogPath, 'utf-8').replace(/\r\n/g, '\n');
    const sections = content.split(/^## Version /m);
    for (const section of sections) {
        const headerMatch = section.match(/^(\d+) - .+\n/);
        if (!headerMatch) continue;
        if (parseInt(headerMatch[1], 10) !== versionN) continue;
        const body = section.slice(headerMatch[0].length).trim();
        return body || `Version ${versionN}`;
    }
    return `Version ${versionN}`;
}

function readFirebaseAppId() {
    const gsPath = path.join(workspaceRoot, 'google-services.json');
    if (!fs.existsSync(gsPath)) return null;
    let data;
    try {
        data = JSON.parse(fs.readFileSync(gsPath, 'utf-8'));
    } catch {
        return null;
    }
    const clients = (data && data.client) || [];
    const matches = clients.filter((c) => {
        const pkg = c && c.client_info && c.client_info.android_client_info && c.client_info.android_client_info.package_name;
        return pkg === PACKAGE_ID;
    });
    if (matches.length === 0) return null;
    if (matches.length > 1) {
        throw new Error(`google-services.json: ${matches.length} Android clients match package ${PACKAGE_ID}; expected exactly 1.`);
    }
    const id = matches[0].client_info && matches[0].client_info.mobilesdk_app_id;
    if (!id) {
        throw new Error(`google-services.json: client for ${PACKAGE_ID} is missing mobilesdk_app_id.`);
    }
    return id;
}

// Both copies of google-services.json must stay byte-identical: the
// package-root copy is the Expo source-of-truth, the android/app/ copy
// is what Gradle's processReleaseGoogleServices reads at build time.
// Without expo prebuild running (the fork doesn't), drift is silent.
function syncGoogleServicesJson() {
    const root = path.join(workspaceRoot, 'google-services.json');
    const app = path.join(workspaceRoot, 'android', 'app', 'google-services.json');
    if (!fs.existsSync(root)) {
        throw new Error(`google-services.json missing at ${root}`);
    }
    const rootContent = fs.readFileSync(root);
    if (!fs.existsSync(app) || !fs.readFileSync(app).equals(rootContent)) {
        console.log(`Syncing google-services.json -> ${app}`);
        fs.copyFileSync(root, app);
    }
}

function runOrExit(cmd, args, opts) {
    console.log(`> ${cmd} ${args.join(' ')}`);
    const result = spawnSync(cmd, args, {
        stdio: 'inherit',
        shell: process.platform === 'win32',
        ...opts,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        if (result.signal) {
            console.error(`Child killed by signal ${result.signal}.`);
        }
        process.exit(result.status ?? 1);
    }
}

let releaseNotesFile = null;
try {
    const args = process.argv.slice(2);
    const knownFlags = new Set(['--no-distribute']);
    for (const a of args) {
        if (a.startsWith('--') && !knownFlags.has(a)) {
            throw new Error(`Unknown flag: ${a}. Known: ${[...knownFlags].join(', ')}`);
        }
    }
    const noDistribute = args.includes('--no-distribute');

    const versionN = readLatestChangelogVersion();
    const versionName = `1.${versionN}.0`;
    const versionCode = versionN;

    console.log(`Building Android release for Version ${versionN} (code=${versionCode}, name=${versionName})`);

    syncGoogleServicesJson();

    runOrExit('npx', ['tsx', 'sources/scripts/parseChangelog.ts'], { cwd: workspaceRoot });

    const androidDir = path.join(workspaceRoot, 'android');
    const gradleCmd = path.join(androidDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
    runOrExit(gradleCmd, [
        'assembleRelease',
        `-PVERSION_CODE=${versionCode}`,
        `-PVERSION_NAME=${versionName}`,
        // BOOX tablets are 64-bit ARM only; building x86/v7a wastes
        // ~3x the time + memory and produces dead weight.
        '-PreactNativeArchitectures=arm64-v8a',
    ], {
        cwd: androidDir,
        env: { ...process.env, APP_ENV: 'production' },
    });

    const apk = path.join(workspaceRoot, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
    console.log('');
    console.log(`APK built: ${apk}`);

    if (noDistribute) {
        console.log('--no-distribute flag set; skipping Firebase upload.');
        console.log(`Manual install: adb install -r "${apk}"`);
        process.exit(0);
    }

    const firebaseAppId = readFirebaseAppId();
    if (!firebaseAppId) {
        console.log('');
        console.log(`No Firebase App ID found in google-services.json for ${PACKAGE_ID}.`);
        console.log('Skipping Firebase App Distribution upload.');
        console.log(`Manual install: adb install -r "${apk}"`);
        process.exit(0);
    }

    const groups = process.env.FIREBASE_GROUPS || 'tablets';
    const releaseNotes = extractReleaseNotes(versionN);
    releaseNotesFile = path.join(os.tmpdir(), `happy-app-release-notes-${versionN}.txt`);
    fs.writeFileSync(releaseNotesFile, releaseNotes, 'utf-8');

    console.log('');
    console.log(`Uploading APK to Firebase App Distribution (app=${firebaseAppId}, groups=${groups})`);
    runOrExit('firebase', [
        'appdistribution:distribute', apk,
        '--app', firebaseAppId,
        '--groups', groups,
        '--release-notes-file', releaseNotesFile,
    ], { cwd: workspaceRoot });

    console.log('');
    console.log('Distributed. Both tablets should get a notification within ~minutes.');
    console.log('Force a check on the tablet: open the App Tester app -> pull-to-refresh.');
} catch (e) {
    console.error(e.message || String(e));
    process.exit(1);
} finally {
    if (releaseNotesFile) {
        try { fs.rmSync(releaseNotesFile, { force: true }); } catch { /* best-effort */ }
    }
}
