#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const appRoot = join(fileURLToPath(import.meta.url), '..', '..');
const repoRoot = join(appRoot, '..', '..');
const candidates = [
    'tweetnacl',
    'rn-encryption',
    '@stablelib/hex',
    'react-native-quick-base64',
    '@livekit/react-native',
    '@livekit/react-native-webrtc',
    'livekit-client',
    'react-native-webrtc',
    'react-native-audio-api',
    'expo-audio',
    'expo-camera',
    'react-native-vision-camera',
    '@elevenlabs/react',
    '@elevenlabs/react-native',
];

const packageJson = JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8'));
const declared = new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
]);

const files = execFileSync('git', [
    'ls-files',
    'packages/happy-app/sources/*.ts',
    'packages/happy-app/sources/*.tsx',
    'packages/happy-app/app.config.js',
    'packages/happy-app/metro.config.js',
    'packages/happy-app/android/app/src/main/AndroidManifest.xml',
], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);

const report = ['# Dependency Audit', '', `Generated: ${new Date().toISOString()}`, ''];
for (const dep of candidates) {
    const matches = [];
    for (const file of files) {
        const text = readFileSync(join(repoRoot, file), 'utf8');
        if (text.includes(dep)) {
            matches.push(relative(appRoot, join(repoRoot, file)).replace(/\\/g, '/'));
        }
    }
    const status = matches.length === 0 ? 'no importers' : 'importers found';
    const packageStatus = declared.has(dep) ? 'declared' : 'not declared';
    report.push(`- ${dep}: [${status}], package.json: ${packageStatus}`);
    for (const match of matches) {
        report.push(`  - ${match}`);
    }
}

writeFileSync(join(appRoot, 'scripts', 'dep-audit.md'), `${report.join('\n')}\n`);
console.log(report.join('\n'));
