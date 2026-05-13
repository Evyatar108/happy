#!/usr/bin/env node
// Post-tunnel-claim-removal gate script.
// Verifies that the retired tunnel-claim auth layer has been fully removed
// from the codebase. Exits 0 if all checks pass, 1 if any fail.
//
// This replaces the former AC-D13 gate which asserted that `tunnelClaim.ts`
// and `verifyTunnelClaim` existed. Those artifacts were removed as part of
// the tunnel-claim layer removal. This gate now asserts their absence.

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

function repoPath(p) {
    return resolve(REPO_ROOT, p);
}

function readIfExists(file) {
    const path = repoPath(file);
    if (!existsSync(path)) {
        return { exists: false, path };
    }
    try {
        return { exists: true, text: readFileSync(path, 'utf-8'), path };
    } catch (err) {
        return { exists: true, text: '', path, error: err?.message ?? err };
    }
}

const checks = [];

function check(label, fn) {
    try {
        const result = fn();
        if (result === true || (result && result.pass !== false)) {
            checks.push({ label, pass: true, note: result?.note });
        } else {
            checks.push({ label, pass: false, note: result?.note ?? 'check returned falsy' });
        }
    } catch (err) {
        checks.push({ label, pass: false, note: err?.message ?? String(err) });
    }
}

// ---- Removal assertions: tunnel-claim artifacts must NOT exist ----

check('happy-server tunnelClaim.ts is deleted', () => {
    const r = readIfExists('packages/happy-server/sources/app/api/auth/tunnelClaim.ts');
    if (r.exists) {
        return { pass: false, note: 'packages/happy-server/sources/app/api/auth/tunnelClaim.ts still exists — tunnel-claim layer not fully removed' };
    }
    return true;
});

check('happy-server socket.ts does not reference verifyTunnelClaim', () => {
    const r = readIfExists('packages/happy-server/sources/app/api/socket.ts');
    if (!r.exists) {
        return { pass: false, note: 'socket.ts not found — cannot verify' };
    }
    if (/verifyTunnelClaim/.test(r.text)) {
        return { pass: false, note: 'socket.ts still references verifyTunnelClaim' };
    }
    return true;
});

check('happy-server socket.ts does not reference x-codexu-authorization (tunnel claim header)', () => {
    const r = readIfExists('packages/happy-server/sources/app/api/socket.ts');
    if (!r.exists) {
        return { pass: false, note: 'socket.ts not found — cannot verify' };
    }
    if (/x-codexu-authorization/i.test(r.text)) {
        return { pass: false, note: 'socket.ts still references x-codexu-authorization' };
    }
    return true;
});

check('happy-server pairRoutes.ts does not reference buildTunnelClaimPayload or encodeTunnelClaim', () => {
    const r = readIfExists('packages/happy-server/sources/app/api/routes/pairRoutes.ts');
    if (!r.exists) {
        return true;
    }
    if (/buildTunnelClaimPayload|encodeTunnelClaim/.test(r.text)) {
        return { pass: false, note: 'pairRoutes.ts still references buildTunnelClaimPayload or encodeTunnelClaim — tunnel-claim minting not fully removed' };
    }
    return true;
});

check('happy-app machineAuth.ts does not reference tunnelClaim', () => {
    const r = readIfExists('packages/happy-app/sources/auth/machineAuth.ts');
    if (!r.exists) {
        return true;
    }
    if (/tunnelClaim/.test(r.text)) {
        return { pass: false, note: 'machineAuth.ts still references tunnelClaim' };
    }
    return true;
});

check('happy-app tokenStorage.ts does not reference tunnelClaim', () => {
    const r = readIfExists('packages/happy-app/sources/auth/tokenStorage.ts');
    if (!r.exists) {
        return true;
    }
    if (/tunnelClaim/.test(r.text)) {
        return { pass: false, note: 'tokenStorage.ts still references tunnelClaim' };
    }
    return true;
});

// ---- Presence assertions: new contract artifacts must exist ----

check('happy-wire exports MachineTunnelSchema', () => {
    const r = readIfExists('packages/happy-wire/src/tunnel/types.ts');
    if (!r.exists) {
        return { pass: false, note: 'packages/happy-wire/src/tunnel/types.ts not found' };
    }
    if (!/export\s+const\s+MachineTunnelSchema/.test(r.text)) {
        return { pass: false, note: 'no `export const MachineTunnelSchema` found in packages/happy-wire/src/tunnel/types.ts' };
    }
    return true;
});

check('happy-server pairRoutes.ts registers POST /pair/complete', () => {
    const r = readIfExists('packages/happy-server/sources/app/api/routes/pairRoutes.ts');
    if (!r.exists) {
        return { pass: false, note: 'pairRoutes.ts not found' };
    }
    if (!/['"`]\/pair\/complete['"`]/.test(r.text)) {
        return { pass: false, note: '/pair/complete route not registered in pairRoutes.ts' };
    }
    return true;
});

check('happy-server registers GET /v2/me/machine (machineSelfRoutes)', () => {
    const r = readIfExists('packages/happy-server/sources/app/api/routes/machineSelfRoutes.ts');
    if (!r.exists) {
        return { pass: false, note: 'machineSelfRoutes.ts not found' };
    }
    if (!/['"`]\/v2\/me\/machine['"`]/.test(r.text)) {
        return { pass: false, note: '/v2/me/machine route not registered in machineSelfRoutes.ts' };
    }
    return true;
});

// ---- Output ----

let allPass = true;
console.log('\n=== Tunnel-claim removal gate ===\n');
for (const c of checks) {
    const symbol = c.pass ? 'PASS' : 'FAIL';
    if (!c.pass) allPass = false;
    console.log(`  [${symbol}] ${c.label}${c.note ? `\n         ${c.note}` : ''}`);
}
console.log('');

if (!allPass) {
    console.error('FAILED: one or more tunnel-claim removal checks did not pass. See PASS/FAIL list above.');
    process.exit(1);
}
console.log('PASSED: tunnel-claim layer removal verified.');
process.exit(0);
