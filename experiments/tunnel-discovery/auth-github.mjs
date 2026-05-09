/**
 * GitHub device flow — simulates mobile auth (no client secret)
 *
 * Uses devtunnel's GitHub App (Iv1.e7b89e013f801f03) with Device Flow.
 * No client secret needed — designed for public clients.
 * Opens browser to github.com/login/device with code pre-filled.
 * User clicks Authorize — no typing required.
 */

import { exec } from 'child_process';

const CLIENT_ID       = 'Iv1.e7b89e013f801f03';
const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const TOKEN_URL       = 'https://github.com/login/oauth/access_token';

export async function githubBrowserFlow() {
    // Step 1: request device code — no secret
    const res = await fetch(DEVICE_CODE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ client_id: CLIENT_ID })
    });
    const { device_code, user_code, verification_uri, expires_in, interval } = await res.json();

    // Step 2: open browser with code pre-filled — user just clicks Authorize
    const url = `${verification_uri}?user_code=${user_code}`;
    exec(`powershell.exe -Command "Start-Process '${url}'"`)
    console.log(`  Browser opened — click Authorize (code: ${user_code})`);

    // Step 3: poll until authorized
    const pollMs  = (interval ?? 5) * 1000;
    const deadline = Date.now() + expires_in * 1000;
    while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, pollMs));
        const t = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
                client_id:  CLIENT_ID,
                device_code,
                grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
            })
        });
        const data = await t.json();
        if (data.access_token) return data.access_token;
        if (data.error === 'authorization_pending') continue;
        if (data.error === 'slow_down') { await new Promise(r => setTimeout(r, 5000)); continue; }
        throw new Error(`GitHub auth error: ${data.error} — ${data.error_description}`);
    }
    throw new Error('Device code expired');
}
