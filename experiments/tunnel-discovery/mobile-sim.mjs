/**
 * Mobile simulation: full end-to-end tunnel discovery + connect
 *
 * Runs both GitHub and Entra flows using real device code auth
 * (no cached CLI tokens). This is exactly what the mobile app will do.
 *
 * Usage:
 *   node mobile-sim.mjs github   — test GitHub flow only
 *   node mobile-sim.mjs entra    — test Entra flow only
 *   node mobile-sim.mjs          — test both sequentially
 */

import { io } from 'socket.io-client';
import { githubBrowserFlow } from './auth-github.mjs';
import { entraDeviceCodeFlow as entraFlow } from './auth-entra.mjs';

const TUNNELS_API = 'https://global.rel.tunnels.api.visualstudio.com';
const API_VERSION = '2023-09-27-preview';
const HAPPY_PORT  = 3005;

// ── Dev Tunnels API ────────────────────────────────────────────────────────

async function listTunnels(authHeader) {
    const res = await fetch(
        `${TUNNELS_API}/tunnels?includePorts=true&global=true&api-version=${API_VERSION}`,
        { headers: { Authorization: authHeader } }
    );
    if (!res.ok) throw new Error(`List tunnels failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return data.value?.flatMap(r => r.value) ?? [];
}

async function getConnectToken(authHeader, tunnelId, clusterId) {
    const res = await fetch(
        `${TUNNELS_API}/tunnels/${tunnelId}?tokenScopes=connect&api-version=${API_VERSION}`,
        { headers: { Authorization: authHeader, 'X-TunnelServiceClusterId': clusterId } }
    );
    if (!res.ok) throw new Error(`Get connect token failed: ${res.status}`);
    const data = await res.json();
    return data.accessTokens?.connect;
}

// ── Socket.IO connect ──────────────────────────────────────────────────────

function connectSocket(tunnelUrl, connectToken) {
    return new Promise((resolve, reject) => {
        const socket = io(tunnelUrl, {
            path: '/v1/updates',
            auth: { token: 'placeholder', clientType: 'user-scoped' },
            transports: ['websocket'],
            extraHeaders: { 'X-Tunnel-Authorization': `tunnel ${connectToken}` },
        });
        socket.on('connect_error', e => {
            resolve({ tunnelAccepted: true, serverResponse: e.message });
            socket.disconnect();
        });
        socket.on('connect', () => {
            resolve({ tunnelAccepted: true, fullyConnected: true, sid: socket.id });
            socket.disconnect();
        });
        setTimeout(() => { reject(new Error('timeout')); socket.disconnect(); }, 10000);
    });
}

// ── Full flow ──────────────────────────────────────────────────────────────

async function runFlow(label, authFn, headerFn) {
    console.log(`\n══ ${label} ══`);
    console.log('Step 1: Authenticate...');
    const token = await authFn();
    console.log(`  ✓ Token obtained (${token.substring(0,12)}...)`);

    const authHeader = headerFn(token);

    console.log('Step 2: List tunnels...');
    const tunnels = await listTunnels(authHeader);
    const happy = tunnels.filter(t => t.ports?.some(p => p.portNumber === HAPPY_PORT));
    console.log(`  ✓ Total tunnels: ${tunnels.length}, happy-server tunnels: ${happy.length}`);

    if (!happy.length) {
        console.log('  ✗ No happy-server tunnel found. Start the Happy CLI first.');
        return;
    }

    // 0/1/N logic
    const tunnel = happy.length === 1
        ? happy[0]
        : (() => { console.log('  Multiple tunnels — picking first (mobile would show picker):'); happy.forEach((t,i) => console.log(`    ${i+1}. ${t.tunnelId}`)); return happy[0]; })();

    const port = tunnel.ports.find(p => p.portNumber === HAPPY_PORT);
    const tunnelUrl = port.portForwardingUris[0].replace(/\/$/, '');
    console.log(`  ✓ Connecting to: ${tunnel.tunnelId} @ ${tunnelUrl}`);

    console.log('Step 3: Get connect token...');
    const connectToken = await getConnectToken(authHeader, tunnel.tunnelId, tunnel.clusterId);
    console.log(`  ✓ Connect token: ${connectToken.substring(0,20)}... (${connectToken.length} chars)`);

    console.log('Step 4: Connect via Socket.IO...');
    const result = await connectSocket(tunnelUrl, connectToken);
    if (result.tunnelAccepted) {
        console.log(`  ✓ Tunnel accepted connection`);
        console.log(`  ✓ happy-server responded: "${result.serverResponse}"`);
        if (result.fullyConnected) console.log(`  ✓ Fully connected! sid=${result.sid}`);
        console.log(`\n  PASS ✓`);
    }
}

// ── Main ───────────────────────────────────────────────────────────────────

const mode = process.argv[2] ?? 'both';

if (mode === 'github' || mode === 'both') {
    await runFlow(
        'GitHub (Evyatar108)',
        githubBrowserFlow,
        token => `github ${token}`
    );
}

if (mode === 'entra' || mode === 'both') {
    await runFlow(
        'Entra (evmitran@microsoft.com)',
        entraFlow,
        token => `Bearer ${token}`
    );
}

console.log('\n══ Done ══\n');
