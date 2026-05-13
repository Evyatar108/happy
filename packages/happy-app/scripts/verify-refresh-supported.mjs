#!/usr/bin/env node
// AC-D16 manual gate script (Sprint D / R-D17 + R-D18 verification).
// Runs ONCE before any Sprint D autonomous implementation.
//
// Verifies three preconditions of Sprint D's refresh-per-request auth model:
//   Phase 0  R-D18  Public-tunnel reachability      — GET /health is not blocked
//                                                     by the Dev Tunnels gateway (401).
//   Phase 1  R-D17  Immediate refresh reuse         — Two POST /pair/status calls
//                                                     with the same device_code,
//                                                     spaced >=15s, return claims
//                                                     with DIFFERENT jti values.
//   Phase 2  R-D17  Post-expires_in durability      — A POST /pair/status call
//                                                     made after device_code's
//                                                     advertised expires_in still
//                                                     returns status: "authorized".
//
// This script is NOT autonomously runnable: Phase 1 needs a human to approve the
// GitHub device-flow code in a browser, and Phase 2 sleeps for ~16 minutes.
//
// Required env:
//   DEV_TUNNELS_URL          Base URL of the happy-server reached via the
//                            public Dev Tunnels tunnel (e.g. https://abc.devtunnels.ms).
//
// Optional env:
//   HAPPY_SERVER_WORKTREE    Path to a Sprint A worktree (informational, logged
//                            into sprint-a-gap.md alongside the verdict).
//   TUNNEL_HEALTH_PATH       Path used by Phase 0. Default: /health.
//   PHASE_1_WAIT_SECONDS     Override Phase 1 sleep (>=12 per Sprint A's 5/60s
//                            rate limit on /pair/status). Default: 15.
//   PHASE_2_MIN_TOTAL_SECONDS  Override Phase 2 total elapsed deadline (since
//                            /pair/start). Default: expires_in + 60.
//   POLL_MAX_SECONDS         Maximum time to poll /pair/status waiting for
//                            human browser approval. Default: 600 (10 min).
//
// Note: this script does NOT spawn happy-server. The server must already be
// reachable at DEV_TUNNELS_URL when the script is invoked.

import { Buffer } from 'node:buffer';
import { existsSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import readline from 'node:readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SPRINT_A_GAP_PATH = resolve(__dirname, 'sprint-a-gap.md');

const DEV_TUNNELS_URL = process.env.DEV_TUNNELS_URL;
const HAPPY_SERVER_WORKTREE = process.env.HAPPY_SERVER_WORKTREE ?? '(unset)';
const TUNNEL_HEALTH_PATH = process.env.TUNNEL_HEALTH_PATH ?? '/health';
const PHASE_1_WAIT_SECONDS = Number(process.env.PHASE_1_WAIT_SECONDS ?? '15');
const PHASE_2_MIN_TOTAL_SECONDS_OVERRIDE = process.env.PHASE_2_MIN_TOTAL_SECONDS
    ? Number(process.env.PHASE_2_MIN_TOTAL_SECONDS)
    : null;
const POLL_MAX_SECONDS = Number(process.env.POLL_MAX_SECONDS ?? '600');

function fail(msg) {
    console.error(`\n[verify-refresh-supported] FAIL: ${msg}`);
    appendLog(`FAIL ${new Date().toISOString()} — ${msg}`);
    process.exit(1);
}

function info(msg) {
    console.log(`[verify-refresh-supported] ${msg}`);
}

function trimTrailingSlash(u) {
    return u.endsWith('/') ? u.slice(0, -1) : u;
}

function appendLog(line) {
    try {
        if (!existsSync(SPRINT_A_GAP_PATH)) {
            writeFileSync(SPRINT_A_GAP_PATH, '# Sprint A gap log\n\n## verify-refresh-supported.mjs runs\n\n', 'utf-8');
        }
        appendFileSync(SPRINT_A_GAP_PATH, `- ${line}\n`, 'utf-8');
    } catch (err) {
        console.error(`[verify-refresh-supported] could not append to sprint-a-gap.md: ${err?.message ?? err}`);
    }
}

function prompt(question) {
    return new Promise(resolveFn => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(question, answer => {
            rl.close();
            resolveFn(answer);
        });
    });
}

function decodeJti(tunnelClaim) {
    // Sprint A envelope: base64url(JSON({ p: base64url(JSON(payload)), s: hex(sig) })).
    // We only need the inner payload's jti — the signature is not verified here.
    let outer;
    try {
        outer = JSON.parse(Buffer.from(tunnelClaim, 'base64url').toString('utf-8'));
    } catch {
        throw new Error('tunnelClaim outer envelope did not decode as base64url(JSON)');
    }
    if (!outer || typeof outer !== 'object' || typeof outer.p !== 'string') {
        throw new Error('tunnelClaim outer envelope missing payload field "p"');
    }
    let payload;
    try {
        payload = JSON.parse(Buffer.from(outer.p, 'base64url').toString('utf-8'));
    } catch {
        throw new Error('tunnelClaim inner payload did not decode as base64url(JSON)');
    }
    if (!payload || typeof payload !== 'object') {
        throw new Error('tunnelClaim inner payload is not a JSON object');
    }
    if (typeof payload.jti !== 'string' || payload.jti.length === 0) {
        throw new Error('tunnelClaim inner payload missing jti');
    }
    return { jti: payload.jti, payload };
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

async function phase0Reachability(baseUrl) {
    const url = `${baseUrl}${TUNNEL_HEALTH_PATH}`;
    info(`Phase 0 — GET ${url}`);
    let response;
    try {
        response = await httpGet(url);
    } catch (err) {
        fail(`Phase 0 network error reaching ${url}: ${err?.message ?? err}`);
        return; // unreachable
    }
    info(`Phase 0 — status ${response.status}`);
    if (response.status === 401) {
        const body = await response.text().catch(() => '');
        fail(
            `Phase 0 — Dev Tunnels gateway returned 401 on ${url}. The tunnel is NOT public; ` +
            `Sprint D's public-tunnel MVP design cannot proceed. ` +
            `Resolution paths (per plan.md R-D18): (a) Sprint C patches tunnelManager to add ` +
            `accessControl.entries with anonymous:connect; (b) Sprint D adds a private-tunnel ` +
            `auth channel; (c) manual operator step \`devtunnel access create --tunnel-id <id> ` +
            `--anonymous\`. Response body: ${body.slice(0, 256)}`
        );
        return;
    }
    if (response.status >= 500) {
        const body = await response.text().catch(() => '');
        fail(`Phase 0 — server returned ${response.status} on ${url}. Body: ${body.slice(0, 256)}`);
        return;
    }
    // 200, 204, 404 etc. all prove the request reached happy-server (not blocked by gateway).
    appendLog(`Phase 0 PASS ${new Date().toISOString()} — GET ${url} returned ${response.status} (reached happy-server, not gateway-blocked)`);
    info(`Phase 0 PASS — ${url} returned ${response.status} (request reached happy-server, no gateway 401).`);
}

async function callPairStart(baseUrl) {
    const url = `${baseUrl}/pair/start`;
    info(`Calling GET ${url}`);
    const response = await httpGet(url);
    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`GET /pair/start returned ${response.status}: ${body.slice(0, 256)}`);
    }
    const json = await response.json();
    if (typeof json.device_code !== 'string' || typeof json.user_code !== 'string'
        || typeof json.verification_uri !== 'string' || typeof json.interval !== 'number'
        || typeof json.expires_in !== 'number') {
        throw new Error(`GET /pair/start response missing required fields: ${JSON.stringify(json)}`);
    }
    return json;
}

async function callPairStatus(baseUrl, deviceCode) {
    const url = `${baseUrl}/pair/status`;
    const response = await httpPostJson(url, { device_code: deviceCode });
    const text = await response.text();
    let json;
    try {
        json = JSON.parse(text);
    } catch {
        return { httpStatus: response.status, raw: text };
    }
    return { httpStatus: response.status, json };
}

async function pollUntilAuthorized(baseUrl, deviceCode, intervalSeconds) {
    const start = Date.now();
    const intervalMs = Math.max(intervalSeconds, 5) * 1000;
    while ((Date.now() - start) / 1000 < POLL_MAX_SECONDS) {
        const result = await callPairStatus(baseUrl, deviceCode);
        if (result.httpStatus === 429) {
            info('Poll — server returned 429 (rate_limited); backing off 12s');
            await sleep(12_000);
            continue;
        }
        if (result.httpStatus !== 200) {
            throw new Error(`POST /pair/status returned HTTP ${result.httpStatus}: ${JSON.stringify(result.json ?? result.raw).slice(0, 256)}`);
        }
        const body = result.json;
        if (body?.status === 'pending') {
            await sleep(intervalMs);
            continue;
        }
        if (body?.status === 'authorized') {
            return body;
        }
        throw new Error(`Unexpected /pair/status body during initial poll: ${JSON.stringify(body).slice(0, 256)}`);
    }
    throw new Error(`Timed out waiting for authorization after ${POLL_MAX_SECONDS}s — did you approve in the browser?`);
}

function readEnvelope(authorizedBody) {
    if (!authorizedBody?.machines?.length) {
        throw new Error('authorized /pair/status response has no machines[] entries');
    }
    const first = authorizedBody.machines[0];
    if (typeof first.tunnelClaim !== 'string' || first.tunnelClaim.length === 0) {
        throw new Error('machines[0].tunnelClaim is missing or not a string');
    }
    return first.tunnelClaim;
}

async function main() {
    if (!DEV_TUNNELS_URL) {
        console.error(
            'Missing required env var DEV_TUNNELS_URL.\n' +
            '\n' +
            'Set it to the public Dev Tunnels URL of a happy-server checked out from\n' +
            'ralph/devtunnels-A-foundation (A+B+C merged). Example:\n' +
            '\n' +
            '  $env:DEV_TUNNELS_URL = "https://abc1234.devtunnels.ms"\n' +
            '  node packages/happy-app/scripts/verify-refresh-supported.mjs\n' +
            '\n' +
            'Note: the script does NOT spawn happy-server. Start it manually first:\n' +
            '  cd <HAPPY_SERVER_WORKTREE> && pnpm standalone:dev\n' +
            'then expose port 3005 over a public Dev Tunnels tunnel.\n'
        );
        process.exit(2);
    }
    const baseUrl = trimTrailingSlash(DEV_TUNNELS_URL);

    info(`DEV_TUNNELS_URL=${baseUrl}`);
    info(`HAPPY_SERVER_WORKTREE=${HAPPY_SERVER_WORKTREE}`);
    info(`Logging verdict to ${SPRINT_A_GAP_PATH}`);
    appendLog(`RUN START ${new Date().toISOString()} — DEV_TUNNELS_URL=${baseUrl}, worktree=${HAPPY_SERVER_WORKTREE}`);

    // ---- Phase 0 ----
    await phase0Reachability(baseUrl);

    // ---- Pairing handshake ----
    let pairStart;
    try {
        pairStart = await callPairStart(baseUrl);
    } catch (err) {
        fail(`/pair/start failed: ${err?.message ?? err}`);
        return;
    }
    const pairStartedAtMs = Date.now();
    info(`/pair/start returned device_code=${pairStart.device_code.slice(0, 8)}…, expires_in=${pairStart.expires_in}s, interval=${pairStart.interval}s`);

    console.log('\n========================================');
    console.log('  GITHUB DEVICE-FLOW APPROVAL REQUIRED');
    console.log('========================================');
    console.log(`  Open:  ${pairStart.verification_uri}`);
    console.log(`  Code:  ${pairStart.user_code}`);
    console.log('========================================\n');

    await prompt('Press Enter AFTER you have approved in the browser… ');

    let envelope1;
    let envelope1Jti;
    try {
        const authorized1 = await pollUntilAuthorized(baseUrl, pairStart.device_code, pairStart.interval);
        envelope1 = readEnvelope(authorized1);
        envelope1Jti = decodeJti(envelope1).jti;
        info(`Captured envelope1 — jti=${envelope1Jti.slice(0, 12)}…`);
        appendLog(`PAIR AUTHORIZED ${new Date().toISOString()} — envelope1 jti=${envelope1Jti}`);
    } catch (err) {
        fail(`Initial /pair/status flow failed: ${err?.message ?? err}`);
        return;
    }

    // ---- Phase 1: immediate refresh reuse ----
    if (!Number.isFinite(PHASE_1_WAIT_SECONDS) || PHASE_1_WAIT_SECONDS < 12) {
        fail(`PHASE_1_WAIT_SECONDS must be >=12 (Sprint A rate-limits /pair/status to 5/60s). Got: ${PHASE_1_WAIT_SECONDS}`);
        return;
    }
    info(`Phase 1 — sleeping ${PHASE_1_WAIT_SECONDS}s before calling /pair/status again with same device_code`);
    await sleep(PHASE_1_WAIT_SECONDS * 1000);

    let envelope2Jti;
    try {
        const result2 = await callPairStatus(baseUrl, pairStart.device_code);
        if (result2.httpStatus !== 200) {
            throw new Error(`HTTP ${result2.httpStatus} body=${JSON.stringify(result2.json ?? result2.raw).slice(0, 256)}`);
        }
        const body2 = result2.json;
        if (body2?.status !== 'authorized') {
            throw new Error(`Phase 1 — expected status:"authorized" on second call, got: ${JSON.stringify(body2).slice(0, 256)}`);
        }
        const envelope2 = readEnvelope(body2);
        envelope2Jti = decodeJti(envelope2).jti;
        info(`Captured envelope2 — jti=${envelope2Jti.slice(0, 12)}…`);
        if (envelope1Jti === envelope2Jti) {
            fail(`Phase 1 — envelope2.jti === envelope1.jti (${envelope1Jti}). R-D17 FAILED: Sprint A does not mint fresh claims on repeated /pair/status. Sprint D's refresh-per-request design cannot proceed. Coordinate with Sprint A + Sprint C team to redesign — likely a Socket.IO-only model where one connection consumes the claim once and stays open.`);
            return;
        }
        appendLog(`Phase 1 PASS ${new Date().toISOString()} — envelope2 jti=${envelope2Jti} (different from envelope1)`);
        info(`Phase 1 PASS — envelope1.jti !== envelope2.jti (immediate refresh reuse works).`);
    } catch (err) {
        fail(`Phase 1 — second /pair/status failed: ${err?.message ?? err}`);
        return;
    }

    // ---- Phase 2: post-expires_in durability ----
    const phase2DeadlineSeconds = PHASE_2_MIN_TOTAL_SECONDS_OVERRIDE ?? (pairStart.expires_in + 60);
    const elapsedNowSeconds = (Date.now() - pairStartedAtMs) / 1000;
    const remainingSleepSeconds = Math.max(0, Math.ceil(phase2DeadlineSeconds - elapsedNowSeconds));
    info(`Phase 2 — total elapsed-since-pair-start must reach ${phase2DeadlineSeconds}s (expires_in=${pairStart.expires_in} + 60). Currently at ${Math.round(elapsedNowSeconds)}s; sleeping ${remainingSleepSeconds}s (~${Math.round(remainingSleepSeconds / 60)} min).`);
    if (remainingSleepSeconds > 0) {
        await sleep(remainingSleepSeconds * 1000);
    }

    try {
        const result3 = await callPairStatus(baseUrl, pairStart.device_code);
        if (result3.httpStatus !== 200) {
            fail(`Phase 2 — HTTP ${result3.httpStatus} on /pair/status after device_code TTL. Body: ${JSON.stringify(result3.json ?? result3.raw).slice(0, 256)}. R-D17 (post-expires_in durability) FAILED: device_code expired server-side before refresh could complete. Sprint D halts pending Sprint A coordination.`);
            return;
        }
        const body3 = result3.json;
        if (body3?.status !== 'authorized') {
            fail(`Phase 2 — expected status:"authorized" but got: ${JSON.stringify(body3).slice(0, 256)}. R-D17 (post-expires_in durability) FAILED.`);
            return;
        }
        const envelope3 = readEnvelope(body3);
        const envelope3Jti = decodeJti(envelope3).jti;
        info(`Captured envelope3 — jti=${envelope3Jti.slice(0, 12)}…`);
        appendLog(`Phase 2 PASS ${new Date().toISOString()} — envelope3 jti=${envelope3Jti} (status=authorized after ${Math.round((Date.now() - pairStartedAtMs) / 1000)}s elapsed; expires_in was ${pairStart.expires_in}s)`);
        info(`Phase 2 PASS — /pair/status still authorized after device_code's expires_in elapsed.`);
    } catch (err) {
        fail(`Phase 2 — third /pair/status failed: ${err?.message ?? err}`);
        return;
    }

    appendLog(`RUN PASS ${new Date().toISOString()} — Phase 0 + Phase 1 + Phase 2 all passed. R-D17 confirmed; R-D18 confirmed. Sprint D autonomous implementation may proceed.`);
    console.log('\n[verify-refresh-supported] ALL PHASES PASSED — Sprint D may proceed.');
    process.exit(0);
}

main().catch(err => {
    fail(`Uncaught: ${err?.stack ?? err?.message ?? err}`);
});
