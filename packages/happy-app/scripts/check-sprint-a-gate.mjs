#!/usr/bin/env node
// AC-D13 gate script. Verifies the Sprint A artifacts that Sprint D depends on
// are present on the rebase base (ralph/devtunnels-A-foundation, A+B+C merged).
//
// This script is FULLY AUTONOMOUS — it greps source files and exits 0 if every
// required artifact is found, 1 if any are missing.
//
// It also REPORTS (does not gate on) the shipped field name for the tunnel URL
// in `MachineTunnelSchema` (`url` vs `tunnelUrl`); Sprint D code must match
// whichever name shipped.
//
// Sprint A is LOCKED. This script does NOT request patches; it only verifies
// the shipped surface is the surface Sprint D was planned against.

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

function repoPath(p) {
    return resolve(REPO_ROOT, p);
}

function readOrFail(file, label) {
    const path = repoPath(file);
    if (!existsSync(path)) {
        return { ok: false, error: `${label}: file not found at ${file}` };
    }
    try {
        return { ok: true, text: readFileSync(path, 'utf-8'), path };
    } catch (err) {
        return { ok: false, error: `${label}: read failed for ${file}: ${err?.message ?? err}` };
    }
}

const checks = [];
const reports = [];

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

function report(label, fn) {
    try {
        reports.push({ label, value: fn() });
    } catch (err) {
        reports.push({ label, value: `(error: ${err?.message ?? err})` });
    }
}

// ---- Required artifacts ----

check('happy-wire exports MachineTunnelSchema', () => {
    const r = readOrFail('packages/happy-wire/src/tunnel/types.ts', 'MachineTunnelSchema');
    if (!r.ok) return { pass: false, note: r.error };
    if (!/export\s+const\s+MachineTunnelSchema/.test(r.text)) {
        return { pass: false, note: 'no `export const MachineTunnelSchema` found in packages/happy-wire/src/tunnel/types.ts' };
    }
    return true;
});

check('happy-agent declares ClientTunnelProvider interface', () => {
    const r = readOrFail('packages/happy-agent/src/tunnel/clientProvider.ts', 'ClientTunnelProvider');
    if (!r.ok) return { pass: false, note: r.error };
    if (!/(interface|type)\s+ClientTunnelProvider/.test(r.text)) {
        return { pass: false, note: 'no `interface ClientTunnelProvider` (or `type ClientTunnelProvider`) declaration found' };
    }
    if (!/getConnectToken\s*\(/.test(r.text)) {
        return { pass: false, note: 'ClientTunnelProvider does not reference getConnectToken(tunnelId)' };
    }
    return true;
});

check('happy-server registers GET/PUT /v2/me/profile + /v2/me/settings (accountRoutes)', () => {
    const r = readOrFail('packages/happy-server/sources/app/api/routes/accountRoutes.ts', '/v2/me/profile + /v2/me/settings');
    if (!r.ok) return { pass: false, note: r.error };
    if (!/['"`]\/v2\/me\/profile['"`]/.test(r.text)) {
        return { pass: false, note: '/v2/me/profile route not registered in accountRoutes.ts' };
    }
    if (!/['"`]\/v2\/me\/settings['"`]/.test(r.text)) {
        return { pass: false, note: '/v2/me/settings route not registered in accountRoutes.ts' };
    }
    return true;
});

check('happy-server registers GET /v2/me/machine (machineSelfRoutes)', () => {
    const r = readOrFail('packages/happy-server/sources/app/api/routes/machineSelfRoutes.ts', '/v2/me/machine');
    if (!r.ok) return { pass: false, note: r.error };
    if (!/['"`]\/v2\/me\/machine['"`]/.test(r.text)) {
        return { pass: false, note: '/v2/me/machine route not registered in machineSelfRoutes.ts' };
    }
    return true;
});

check('happy-server pairRoutes.ts registers GET /pair/start and POST /pair/status', () => {
    const r = readOrFail('packages/happy-server/sources/app/api/routes/pairRoutes.ts', 'pair routes');
    if (!r.ok) return { pass: false, note: r.error };
    if (!/['"`]\/pair\/start['"`]/.test(r.text)) {
        return { pass: false, note: '/pair/start route not registered' };
    }
    if (!/['"`]\/pair\/status['"`]/.test(r.text)) {
        return { pass: false, note: '/pair/status route not registered' };
    }
    return true;
});

check('happy-server tunnelClaim.ts validates Happy envelope only (no Dev Tunnels JWT fallback)', () => {
    const r = readOrFail('packages/happy-server/sources/app/api/auth/tunnelClaim.ts', 'verifyTunnelClaim');
    if (!r.ok) return { pass: false, note: r.error };
    if (!/export\s+(async\s+)?function\s+verifyTunnelClaim/.test(r.text)) {
        return { pass: false, note: 'verifyTunnelClaim() not exported from tunnelClaim.ts' };
    }
    if (!/verifyHappyEnvelope/.test(r.text)) {
        return { pass: false, note: 'verifyHappyEnvelope helper not present in tunnelClaim.ts' };
    }
    // Confirm the Dev Tunnels JWT fallback was removed: tunnelClaim.ts must not
    // import a JWT verifier (jose, jsonwebtoken, jwks-rsa). Comments mentioning
    // "JWT" are allowed — they document the removal.
    const hasJwtLibImport = /^\s*import[^;]*['"`](jose|jsonwebtoken|jwks-rsa)['"`]/m.test(r.text);
    if (hasJwtLibImport) {
        return { pass: false, note: 'tunnelClaim.ts imports a JWT verification library — the Dev Tunnels JWT fallback may not be fully removed' };
    }
    return true;
});

check('happy-server pairRoutes claim payload may include accountId', () => {
    const r = readOrFail('packages/happy-server/sources/app/api/routes/pairRoutes.ts', 'claim accountId');
    if (!r.ok) return { pass: false, note: r.error };
    if (!/buildTunnelClaimPayload/.test(r.text)) {
        return { pass: false, note: 'buildTunnelClaimPayload helper not referenced in pairRoutes.ts' };
    }
    // Sprint A passes the GitHub user id as the second arg. Accept either an inline
    // accountId literal or evidence of the helper being invoked with two args.
    if (!/accountId/.test(r.text) && !/buildTunnelClaimPayload\([^)]+,[^)]+\)/.test(r.text)) {
        return { pass: false, note: 'pairRoutes.ts does not reference accountId nor pass a second arg to buildTunnelClaimPayload' };
    }
    return true;
});

check('happy-server socket.ts sets socket.data.accountId after tunnel-claim verification', () => {
    const r = readOrFail('packages/happy-server/sources/app/api/socket.ts', 'socket.data.accountId');
    if (!r.ok) return { pass: false, note: r.error };
    if (!/socket\.data\.accountId\s*=/.test(r.text)) {
        return { pass: false, note: 'socket.data.accountId is not assigned in socket.ts' };
    }
    return true;
});

// ---- Reports (do not gate; surfaced to operator for downstream impl decisions) ----

report('MachineTunnelSchema tunnel-URL field name (`url` vs `tunnelUrl`)', () => {
    const path = repoPath('packages/happy-wire/src/tunnel/types.ts');
    if (!existsSync(path)) return '(types.ts missing)';
    const text = readFileSync(path, 'utf-8');
    // Look for the field inside MachineTunnelSchema's z.object({ ... }) block.
    const schemaMatch = text.match(/MachineTunnelSchema\s*=\s*z\.object\(\{([\s\S]*?)\}\)/);
    if (!schemaMatch) return '(schema block not found)';
    const block = schemaMatch[1];
    if (/^\s*tunnelUrl\s*:/m.test(block)) return 'tunnelUrl';
    if (/^\s*url\s*:/m.test(block)) return 'url';
    return '(neither `url` nor `tunnelUrl` matched in schema block)';
});

report('MachineTunnel named-type export present in happy-wire', () => {
    const path = repoPath('packages/happy-wire/src/tunnel/types.ts');
    if (!existsSync(path)) return 'no (types.ts missing)';
    const text = readFileSync(path, 'utf-8');
    return /export\s+type\s+MachineTunnel\b/.test(text) ? 'yes' : 'no (only MachineTunnelSchema; derive via z.infer)';
});

// ---- Output ----

let allPass = true;
console.log('\n=== Sprint A artifact gate (AC-D13) ===\n');
for (const c of checks) {
    const symbol = c.pass ? 'PASS' : 'FAIL';
    if (!c.pass) allPass = false;
    console.log(`  [${symbol}] ${c.label}${c.note ? `\n         ${c.note}` : ''}`);
}
console.log('\n=== Sprint A field reports (informational) ===\n');
for (const r of reports) {
    console.log(`  - ${r.label}: ${r.value}`);
}
console.log('');

if (!allPass) {
    console.error('AC-D13 FAILED: one or more required Sprint A artifacts missing. See PASS/FAIL list above.');
    process.exit(1);
}
console.log('AC-D13 PASSED: all required Sprint A artifacts present.');
process.exit(0);
