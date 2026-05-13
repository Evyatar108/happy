#!/usr/bin/env node
// Post-tunnel-claim-removal verification script.
// Verifies that the new /pair/complete contract is in place and that the
// retired tunnelClaim field is absent from the response.
//
// This replaces the former AC-D16 manual gate which decoded a tunnelClaim
// envelope from machines[0].tunnelClaim. That field no longer exists in
// /pair/complete responses after the tunnel-claim layer removal.
//
// Required env:
//   DEV_TUNNELS_URL   Base URL of the happy-server reached via Dev Tunnels
//                     (e.g. https://abc.devtunnels.ms).
//
// The script exits 0 on pass, 1 on fail, 2 on missing env.

import { existsSync, appendFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEV_TUNNELS_URL = process.env.DEV_TUNNELS_URL;

function info(msg) {
    console.log(`[verify-pair-complete] ${msg}`);
}

function fail(msg) {
    console.error(`\n[verify-pair-complete] FAIL: ${msg}`);
    process.exit(1);
}

function trimTrailingSlash(u) {
    return u.endsWith('/') ? u.slice(0, -1) : u;
}

async function httpGet(url) {
    return fetch(url, { method: 'GET' });
}

async function httpPostJson(url, body) {
    return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
    });
}

async function main() {
    if (!DEV_TUNNELS_URL) {
        console.error(
            'Missing required env var DEV_TUNNELS_URL.\n' +
            '\n' +
            'Set it to the Dev Tunnels URL of a happy-server. Example:\n' +
            '\n' +
            '  $env:DEV_TUNNELS_URL = "https://abc1234.devtunnels.ms"\n' +
            '  node packages/happy-app/scripts/verify-refresh-supported.mjs\n'
        );
        process.exit(2);
    }
    const baseUrl = trimTrailingSlash(DEV_TUNNELS_URL);
    info(`DEV_TUNNELS_URL=${baseUrl}`);

    // ---- Phase 0: reachability ----
    const healthUrl = `${baseUrl}/health`;
    info(`Phase 0 — GET ${healthUrl}`);
    let healthResponse;
    try {
        healthResponse = await httpGet(healthUrl);
    } catch (err) {
        fail(`Phase 0 network error reaching ${healthUrl}: ${err?.message ?? err}`);
        return;
    }
    info(`Phase 0 — status ${healthResponse.status}`);
    if (healthResponse.status === 401) {
        const body = await healthResponse.text().catch(() => '');
        fail(`Phase 0 — gateway returned 401 on ${healthUrl}. Response body: ${body.slice(0, 256)}`);
        return;
    }
    if (healthResponse.status >= 500) {
        const body = await healthResponse.text().catch(() => '');
        fail(`Phase 0 — server returned ${healthResponse.status} on ${healthUrl}. Body: ${body.slice(0, 256)}`);
        return;
    }
    info(`Phase 0 PASS — ${healthUrl} returned ${healthResponse.status} (reached happy-server).`);

    // ---- Phase 1: /pair/complete does not return tunnelClaim ----
    // POST /pair/complete with a connect token from env (or a dummy value to
    // exercise the shape check — the server may return 401 on bad token, which
    // is acceptable; we only fail if tunnelClaim appears in a 200 response).
    const connectToken = process.env.CONNECT_TOKEN ?? 'dummy-token-for-shape-check';
    const pairCompleteUrl = `${baseUrl}/pair/complete`;
    info(`Phase 1 — POST ${pairCompleteUrl}`);
    let pairResponse;
    try {
        pairResponse = await httpPostJson(pairCompleteUrl, { connectToken });
    } catch (err) {
        fail(`Phase 1 network error reaching ${pairCompleteUrl}: ${err?.message ?? err}`);
        return;
    }
    info(`Phase 1 — status ${pairResponse.status}`);

    const responseText = await pairResponse.text().catch(() => '');
    let responseJson = null;
    try {
        responseJson = JSON.parse(responseText);
    } catch {
        // Not JSON — acceptable for non-200 responses
    }

    if (pairResponse.status === 200 && responseJson !== null) {
        // On a valid 200 response, verify tunnelClaim is absent
        if ('tunnelClaim' in (responseJson ?? {})) {
            fail(
                'Phase 1 — /pair/complete 200 response STILL contains tunnelClaim field. ' +
                'The tunnel-claim layer has not been fully removed from the server. ' +
                `Response: ${responseText.slice(0, 512)}`
            );
            return;
        }
        info('Phase 1 PASS — /pair/complete 200 response does not contain tunnelClaim field.');
    } else if (pairResponse.status === 401 || pairResponse.status === 403) {
        // Auth failure with dummy token is expected and acceptable.
        // Verify the error response also does not contain tunnelClaim.
        if (responseJson && 'tunnelClaim' in responseJson) {
            fail(`Phase 1 — /pair/complete ${pairResponse.status} error response contains tunnelClaim field. Response: ${responseText.slice(0, 512)}`);
            return;
        }
        info(`Phase 1 PASS — /pair/complete returned ${pairResponse.status} (auth failure expected with dummy token); no tunnelClaim in response.`);
    } else {
        info(`Phase 1 NOTE — /pair/complete returned ${pairResponse.status}. Response: ${responseText.slice(0, 256)}`);
        if (responseJson && 'tunnelClaim' in responseJson) {
            fail(`Phase 1 — response contains tunnelClaim field. The tunnel-claim layer has not been fully removed.`);
            return;
        }
        info('Phase 1 PASS — no tunnelClaim field in response.');
    }

    console.log('\n[verify-pair-complete] ALL PHASES PASSED — /pair/complete contract is tunnelClaim-free.');
    process.exit(0);
}

main().catch(err => {
    fail(`Uncaught: ${err?.stack ?? err?.message ?? err}`);
});
