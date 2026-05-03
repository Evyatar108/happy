#!/usr/bin/env node
/**
 * link-dev.cjs - Create symlink for happy-dev only
 *
 * This script creates a symlink for the happy-dev command pointing to the local
 * development version, while leaving the stable npm version of `happy` untouched.
 *
 * Usage: pnpm link:dev
 *
 * What it does:
 * 1. Finds the global npm bin directory
 * 2. Creates/updates a symlink: happy-dev -> ./bin/happy-dev.mjs
 *
 * To undo: pnpm unlink:dev
 */

const { execFileSync } = require('child_process');
const { join, dirname } = require('path');
const fs = require('fs');

const projectRoot = dirname(__dirname);
const binSource = join(projectRoot, 'bin', 'happy-dev.mjs');

// Get the action from command line args
const action = process.argv[2] || 'link';

function getGlobalBinDir() {
    const isWin = process.platform === 'win32';
    // On Windows `npm` is `npm.cmd` — `execFileSync('npm', ...)` errors with ENOENT
    // because it doesn't apply PATHEXT. Use `shell: true` (or call `npm.cmd`).
    // Also: pnpm workspace roots reject npm config commands with ENOWORKSPACES,
    // so always invoke from a non-workspace cwd (os.tmpdir()).
    const npmExec = (args) => execFileSync(isWin ? 'npm.cmd' : 'npm', args, {
        encoding: 'utf8',
        cwd: require('os').tmpdir(),
        shell: isWin,
    }).trim();

    // `npm bin -g` was removed in npm v9+. Prefer `npm config get prefix`.
    try {
        const prefix = npmExec(['config', 'get', 'prefix']);
        if (prefix && fs.existsSync(prefix)) {
            // On Windows, npm's prefix IS the bin dir. On Unix it's parent of bin.
            const candidate = isWin ? prefix : require('path').join(prefix, 'bin');
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }
    } catch (e) {
        // Fall through to alternatives
    }

    // Legacy `npm bin -g` for older npm (<v9)
    try {
        const npmBin = npmExec(['bin', '-g']);
        if (npmBin && fs.existsSync(npmBin)) {
            return npmBin;
        }
    } catch (e) {
        // Fall through to alternatives
    }

    // Common locations by platform
    if (process.platform === 'darwin') {
        // macOS with Homebrew Node (Apple Silicon)
        const homebrewBin = '/opt/homebrew/bin';
        if (fs.existsSync(homebrewBin)) {
            return homebrewBin;
        }
        // Intel Mac Homebrew
        const homebrewUsrBin = '/usr/local/bin';
        if (fs.existsSync(homebrewUsrBin)) {
            return homebrewUsrBin;
        }
    }

    // Fallback to /usr/local/bin
    return '/usr/local/bin';
}

function link() {
    const globalBin = getGlobalBinDir();
    const isWin = process.platform === 'win32';

    console.log('Creating happy-dev shim...');
    console.log(`  Source: ${binSource}`);
    console.log(`  Target dir: ${globalBin}`);

    // Check if source exists
    if (!fs.existsSync(binSource)) {
        console.error(`\n❌ Error: ${binSource} does not exist.`);
        console.error("   Run 'pnpm build' first to compile the project.");
        process.exit(1);
    }

    // Remove existing shims (cmd/ps1 on win, the bare file on unix, in case of stale state)
    const targets = isWin
        ? ['happy-dev', 'happy-dev.cmd', 'happy-dev.ps1']
        : ['happy-dev'];
    for (const t of targets) {
        const p = join(globalBin, t);
        try {
            const stat = fs.lstatSync(p);
            if (stat.isSymbolicLink() || stat.isFile()) {
                fs.unlinkSync(p);
                console.log(`  Removed existing: ${p}`);
            }
        } catch (e) {
            // File doesn't exist, that's fine
        }
    }

    try {
        if (isWin) {
            // npm.cmd-style shims — Windows needs three: .cmd for cmd.exe,
            // .ps1 for PowerShell, and a bare sh shim for Git Bash / MSYS.
            // Symlinks would require admin / Developer Mode, so write shims.
            const winSrc = binSource.replace(/\//g, '\\');

            const cmdContent = [
                '@ECHO off',
                'GOTO start',
                ':find_dp0',
                'SET dp0=%~dp0',
                'EXIT /b',
                ':start',
                'SETLOCAL',
                'CALL :find_dp0',
                '',
                'IF EXIST "%dp0%\\node.exe" (',
                '  SET "_prog=%dp0%\\node.exe"',
                ') ELSE (',
                '  SET "_prog=node"',
                '  SET PATHEXT=%PATHEXT:;.JS;=;%',
                ')',
                '',
                `endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "${winSrc}" %*`,
                '',
            ].join('\r\n');
            fs.writeFileSync(join(globalBin, 'happy-dev.cmd'), cmdContent);

            const ps1Content = [
                '#!/usr/bin/env pwsh',
                '$basedir=Split-Path $MyInvocation.MyCommand.Definition -Parent',
                '$exe=""',
                'if ($PSVersionTable.PSVersion -lt "6.0" -or $IsWindows) { $exe=".exe" }',
                '$ret=0',
                'if (Test-Path "$basedir/node$exe") {',
                '  if ($MyInvocation.ExpectingInput) {',
                `    $input | & "$basedir/node$exe"  "${winSrc.replace(/\\/g, '/')}" $args`,
                '  } else {',
                `    & "$basedir/node$exe"  "${winSrc.replace(/\\/g, '/')}" $args`,
                '  }',
                '  $ret=$LASTEXITCODE',
                '} else {',
                '  if ($MyInvocation.ExpectingInput) {',
                `    $input | & "node$exe"  "${winSrc.replace(/\\/g, '/')}" $args`,
                '  } else {',
                `    & "node$exe"  "${winSrc.replace(/\\/g, '/')}" $args`,
                '  }',
                '  $ret=$LASTEXITCODE',
                '}',
                'exit $ret',
                '',
            ].join('\n');
            fs.writeFileSync(join(globalBin, 'happy-dev.ps1'), ps1Content);

            const shContent = [
                '#!/bin/sh',
                'basedir=$(dirname "$(echo "$0" | sed -e \'s,\\\\,/,g\')")',
                '',
                'case `uname` in',
                '    *CYGWIN*|*MINGW*|*MSYS*) basedir=`cygpath -w "$basedir"`;;',
                'esac',
                '',
                'if [ -x "$basedir/node" ]; then',
                `  exec "$basedir/node"  "${binSource}" "$@"`,
                'else',
                `  exec node  "${binSource}" "$@"`,
                'fi',
                '',
            ].join('\n');
            fs.writeFileSync(join(globalBin, 'happy-dev'), shContent);
            try { fs.chmodSync(join(globalBin, 'happy-dev'), 0o755); } catch {}
        } else {
            // Unix: a real symlink works fine
            fs.symlinkSync(binSource, join(globalBin, 'happy-dev'));
        }

        console.log('\n✅ Successfully linked happy-dev to local development version');
        console.log('\nNow you can use:');
        console.log('  happy      → stable npm version (unchanged)');
        console.log('  happy-dev  → local development version');
        console.log('\nTo undo: pnpm unlink:dev');
    } catch (e) {
        if (e.code === 'EACCES') {
            console.error('\n❌ Permission denied. Try running with sudo:');
            console.error('   sudo pnpm link:dev');
        } else {
            console.error(`\n❌ Error creating shim: ${e.message}`);
        }
        process.exit(1);
    }
}

function unlink() {
    const globalBin = getGlobalBinDir();
    const isWin = process.platform === 'win32';
    const targets = isWin
        ? ['happy-dev', 'happy-dev.cmd', 'happy-dev.ps1']
        : ['happy-dev'];

    console.log('Removing happy-dev shim(s)...');

    let removed = 0;
    let skipped = 0;
    for (const t of targets) {
        const p = join(globalBin, t);
        try {
            const stat = fs.lstatSync(p);
            // Sanity check: if it's a symlink, only remove if it points into our source.
            // For plain files (the cmd/ps1/sh shims we wrote), trust the name.
            if (stat.isSymbolicLink()) {
                const linkTarget = fs.readlinkSync(p);
                if (linkTarget === binSource || linkTarget.includes('happy-cli')) {
                    fs.unlinkSync(p);
                    removed++;
                } else {
                    console.log(`  ⚠️  ${p} symlink points elsewhere: ${linkTarget} — skipping`);
                    skipped++;
                }
            } else if (stat.isFile()) {
                fs.unlinkSync(p);
                removed++;
            }
        } catch (e) {
            if (e.code !== 'ENOENT') {
                if (e.code === 'EACCES') {
                    console.error(`\n❌ Permission denied removing ${p}. Try running with sudo:`);
                    console.error('   sudo pnpm unlink:dev');
                    process.exit(1);
                }
                console.error(`  ⚠️  Error removing ${p}: ${e.message}`);
            }
        }
    }

    if (removed > 0) {
        console.log(`\n✅ Removed ${removed} happy-dev shim file(s)`);
    } else if (skipped === 0) {
        console.log("\n✅ happy-dev shim doesn't exist (already removed or never created)");
    }
}

// Main
if (action === 'unlink') {
    unlink();
} else {
    link();
}
