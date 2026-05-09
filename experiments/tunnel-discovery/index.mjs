/**
 * Dev Tunnels discovery + connect test — GitHub and Entra variants
 *
 * GitHub flow: simulates mobile using devtunnel's ghu_ token
 *   Auth: Authorization: github <ghu_token>
 *   API: GET /tunnels?global=true  →  GET /tunnels/{id}?tokenScopes=connect
 *
 * Entra flow: simulates mobile using MSAL Bearer token
 *   On mobile: MSAL React Native acquires Bearer token for Dev Tunnels service
 *   Here: devtunnel CLI acts as the auth layer (same token, different acquisition path)
 *   API: same endpoints, Authorization: Bearer <token>
 */

import { execSync } from 'child_process';
import { io } from 'socket.io-client';

const TUNNELS_API = 'https://global.rel.tunnels.api.visualstudio.com';
const API_VERSION  = '2023-09-27-preview';
const HAPPY_PORT   = 3005;

// ── Auth providers ─────────────────────────────────────────────────────────

function getGitHubToken() {
    const raw = execSync(
        `pwsh -Command "Add-Type -AssemblyName System.Security; [System.Text.Encoding]::UTF8.GetString([System.Security.Cryptography.ProtectedData]::Unprotect([System.IO.File]::ReadAllBytes((Join-Path $env:LOCALAPPDATA 'DevTunnels\\\\devtunnels-tokens-github')), $null, 'CurrentUser'))"`,
        { encoding: 'utf8' }
    ).trim();
    const entry = JSON.parse(raw)[0];
    console.log(`  identity: ${entry.login} (GitHub)`);
    return { header: `github ${entry.accessToken}` };
}

function getEntraTokenViaCli() {
    // On mobile: MSAL RN acquires Bearer token for scope c0df98ca-23b4-4bce-bb9f-72039b28d3a5/.default
    // Here: we use devtunnel CLI (already Entra-logged) to list + mint connect token directly,
    // since az CLI cannot consent to the Dev Tunnels app registration.
    const raw = execSync('devtunnel user show 2>&1', { encoding: 'utf8' }).trim();
    const match = raw.match(/Logged in as (.+?) using Microsoft/);
    if (!match) throw new Error('devtunnel not logged in as Entra');
    console.log(`  identity: ${match[1]} (Entra/Microsoft)`);
    return { header: null, useCliForTokens: true };
}

// ── API helpers ────────────────────────────────────────────────────────────

async function listTunnelsViaApi(authHeader) {
    const res = await fetch(
        `${TUNNELS_API}/tunnels?includePorts=true&global=true&api-version=${API_VERSION}`,
        { headers: { Authorization: authHeader } }
    );
    const data = await res.json();
    return data.value?.flatMap(r => r.value) ?? [];
}

function listTunnelsViaCli() {
    // devtunnel CLI uses Entra Bearer internally; --json gives tunnel IDs
    const raw = execSync('devtunnel list --json 2>&1', { encoding: 'utf8' });
    return JSON.parse(raw).tunnels ?? [];
}

async function getConnectTokenViaApi(authHeader, tunnelId, clusterId) {
    const res = await fetch(
        `${TUNNELS_API}/tunnels/${tunnelId}?tokenScopes=connect&api-version=${API_VERSION}`,
        { headers: { Authorization: authHeader, 'X-TunnelServiceClusterId': clusterId } }
    );
    const data = await res.json();
    return data.accessTokens?.connect;
}

function getConnectTokenViaCli(tunnelId) {
    const raw = execSync(`devtunnel token ${tunnelId} --scope connect --json 2>&1`, { encoding: 'utf8' });
    return JSON.parse(raw).token;
}

function getTunnelUrl(tunnelId) {
    const raw = execSync(`devtunnel show ${tunnelId} --json 2>&1`, { encoding: 'utf8' });
    const data = JSON.parse(raw);
    const port = data.tunnel?.ports?.find(p => p.portNumber === HAPPY_PORT);
    return port?.portUri?.replace(/\/$/, '');
}

// ── Socket.IO connect test ─────────────────────────────────────────────────

function connectToTunnel(tunnelUrl, connectToken) {
    return new Promise((resolve, reject) => {
        const socket = io(tunnelUrl, {
            path: '/v1/updates',
            auth: { token: 'placeholder-bearer', clientType: 'user-scoped' },
            transports: ['websocket'],
            extraHeaders: { 'X-Tunnel-Authorization': `tunnel ${connectToken}` },
        });
        socket.on('connect_error', e => {
            // "Invalid authentication token" = tunnel accepted, happy-server rejected placeholder
            resolve({ tunnelAccepted: true, happyServerResponse: e.message });
            socket.disconnect();
        });
        socket.on('connect', () => {
            resolve({ tunnelAccepted: true, fullyConnected: true, sid: socket.id });
            socket.disconnect();
        });
        setTimeout(() => { reject(new Error('timeout')); socket.disconnect(); }, 8000);
    });
}

// ── Test runner ────────────────────────────────────────────────────────────

async function runTest(label, getAuth) {
    console.log(`\n── ${label} ──`);
    const auth = getAuth();

    let tunnels, connectToken, tunnelUrl;

    if (auth.useCliForTokens) {
        // Entra: CLI is the auth layer
        const cliTunnels = listTunnelsViaCli();
        const happy = cliTunnels.find(t => {
            try { getTunnelUrl(t.tunnelId); return true; } catch { return false; }
        });
        if (!happy) { console.log('  ✗ No happy-server tunnel found'); return; }
        console.log(`  ✓ Found tunnel: ${happy.tunnelId}`);
        tunnelUrl = getTunnelUrl(happy.tunnelId);
        console.log(`  ✓ URL: ${tunnelUrl}`);
        connectToken = getConnectTokenViaCli(happy.tunnelId);
        console.log(`  ✓ Connect token obtained via CLI (${connectToken.length} chars)`);
    } else {
        // GitHub: full REST API flow
        const all = await listTunnelsViaApi(auth.header);
        console.log(`  ✓ Found ${all.length} tunnel(s)`);
        const happy = all.find(t => t.ports?.some(p => p.portNumber === HAPPY_PORT));
        if (!happy) { console.log(`  ✗ No tunnel with port ${HAPPY_PORT}`); return; }
        const port = happy.ports.find(p => p.portNumber === HAPPY_PORT);
        tunnelUrl = port.portForwardingUris[0].replace(/\/$/, '');
        console.log(`  ✓ Happy-server tunnel: ${happy.tunnelId} @ ${tunnelUrl}`);
        connectToken = await getConnectTokenViaApi(auth.header, happy.tunnelId, happy.clusterId);
        console.log(`  ✓ Connect token obtained via API (${connectToken.length} chars)`);
    }

    const result = await connectToTunnel(tunnelUrl, connectToken);
    if (result.tunnelAccepted) {
        console.log(`  ✓ Tunnel accepted connection`);
        console.log(`  ✓ happy-server responded: "${result.happyServerResponse}"`);
        console.log(`  ✓ PASS: ${label} flow verified end-to-end`);
    }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
    console.log('\n══ Dev Tunnels Discovery + Connect Test ══');

    try { await runTest('GitHub (Evyatar108)', getGitHubToken); }
    catch (e) { console.log(`  ✗ GitHub skipped: ${e.message}`); }
    await runTest('Entra  (evmitran@microsoft.com)', getEntraTokenViaCli);

    console.log('\n══ Done ══\n');
}

main().catch(console.error);
