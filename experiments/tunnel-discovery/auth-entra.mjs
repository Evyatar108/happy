/**
 * Entra browser OAuth flow — simulates mobile auth
 *
 * Uses devtunnel's Azure AD public client ID (c0df98ca-23b4-4bce-bb9f-72039b28d3a5).
 * Requests scope for the Dev Tunnels resource app (46da2f7e-b5ef-422a-88d4-2a7f9de6a0b2).
 * Opens browser, catches callback on localhost, exchanges code for Bearer token.
 */

import { createServer } from 'http';
import { exec } from 'child_process';

const CLIENT_ID     = 'c0df98ca-23b4-4bce-bb9f-72039b28d3a5';
const TENANT_ID     = '72f988bf-86f1-41af-91ab-2d7cd011db47';
const RESOURCE      = '46da2f7e-b5ef-422a-88d4-2a7f9de6a0b2';
const SCOPE         = `${RESOURCE}/.default openid profile`;
const CALLBACK_PORT = 51424;
// Azure AD public clients allow http://localhost redirect URIs without pre-registration
const REDIRECT_URI  = `http://localhost:${CALLBACK_PORT}`;

const AUTH_URL  = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize` +
    `?client_id=${CLIENT_ID}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(SCOPE)}` +
    `&response_mode=query`;

const TOKEN_URL = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;

export async function entraDeviceCodeFlow() {
    // Step 1: start local callback server
    const code = await new Promise((resolve, reject) => {
        const server = createServer((req, res) => {
            const url = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);
            const code = url.searchParams.get('code');
            const error = url.searchParams.get('error');

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<html><body><h2>Authorized ✓ — return to the terminal.</h2></body></html>');
            server.close();

            if (error) reject(new Error(`Entra auth error: ${error} — ${url.searchParams.get('error_description')}`));
            else resolve(code);
        });

        server.listen(CALLBACK_PORT, () => {
            console.log(`  Opening browser for Entra login...`);
            exec(`powershell.exe -Command "Start-Process '${AUTH_URL}'"`)
        });

        setTimeout(() => { server.close(); reject(new Error('Browser auth timeout (2 min)')); }, 120000);
    });

    // Step 2: exchange code for token
    const tokenRes = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: CLIENT_ID,
            grant_type: 'authorization_code',
            code,
            redirect_uri: REDIRECT_URI,
            scope: SCOPE
        })
    });
    const data = await tokenRes.json();
    if (!data.access_token) throw new Error(`Token exchange failed: ${JSON.stringify(data)}`);
    return data.access_token;
}
