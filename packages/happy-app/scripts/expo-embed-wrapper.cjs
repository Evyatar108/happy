#!/usr/bin/env node
// Wrapper around @expo/cli that absolutifies --entry-file before delegating.
//
// The React Native Gradle plugin (BundleHermesCTask) passes paths through
// `File.cliPath(base)` which on Windows returns a relative path
// (`this.relativeTo(base).path`). Metro/Expo on this pnpm-workspace setup
// then mis-resolves the relative entry-file (looks for it from the
// monorepo root instead of the package root), failing with
// "Unable to resolve module ./index.ts from D:\harness-efforts\happy/.".
//
// Switching the cliFile in android/app/build.gradle to point at this
// wrapper instead of @expo/cli directly is the minimal fix that doesn't
// require patching the @react-native/gradle-plugin JAR.
//
// We anchor the absolutification on the wrapper's own directory
// (__dirname is .../packages/happy-app/scripts; package root is one
// level up) instead of process.cwd(). The Gradle plugin sets cwd to the
// package root today, but a future `react.root` override would silently
// break a cwd-based resolution; __dirname survives that.

const { spawnSync } = require('child_process');
const path = require('path');

const PACKAGE_ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);

const entryIdx = args.indexOf('--entry-file');
if (entryIdx >= 0) {
    if (entryIdx + 1 >= args.length) {
        console.error('expo-embed-wrapper: --entry-file passed without a value.');
        process.exit(2);
    }
    const entryArg = args[entryIdx + 1];
    if (!path.isAbsolute(entryArg)) {
        args[entryIdx + 1] = path.resolve(PACKAGE_ROOT, entryArg);
    }
}

const expoCli = require.resolve('@expo/cli', {
    paths: [require.resolve('expo/package.json')],
});

const result = spawnSync(process.execPath, [expoCli, ...args], {
    stdio: 'inherit',
});

if (result.signal) {
    console.error(`expo-embed-wrapper: child killed by signal ${result.signal}.`);
}

process.exit(result.status ?? 1);
