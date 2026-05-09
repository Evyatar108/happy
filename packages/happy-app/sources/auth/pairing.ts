import * as WebBrowser from 'expo-web-browser';

import { AuthCredentials } from './tokenStorage';
import { decodeBase64, encodeBase64 } from '@/encryption/base64';
import { getServerUrl } from '@/sync/serverConfig';
import { createX25519KeyPair, deriveX25519SessionKey } from '@/sync/tunnelTransport';

// devtunnel's public GitHub App — no client secret required (device flow public client)
const DEVTUNNEL_GITHUB_CLIENT_ID = 'Iv1.e7b89e013f801f03';
const DEV_TUNNELS_API = 'https://global.rel.tunnels.api.visualstudio.com';
const DEV_TUNNELS_API_VERSION = '2023-09-27-preview';
// Dev Tunnels connect tokens are valid for 24h; we treat them as 23h to refresh early
const CONNECT_TOKEN_TTL_MS = 23 * 60 * 60 * 1000;

export type DeviceTunnelFlowResponse = {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete?: string;
    expires_in: number;
    interval: number;
};

/** Start GitHub device flow using devtunnel's GitHub App (mobile-side, no server proxy). */
export async function startDeviceTunnelFlow(): Promise<DeviceTunnelFlowResponse> {
    const body = new URLSearchParams({
        client_id: DEVTUNNEL_GITHUB_CLIENT_ID,
        scope: 'read:user',
    });
    const response = await fetch('https://github.com/login/device/code', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });
    if (!response.ok) throw new Error(`GitHub device flow start failed: ${response.status}`);
    return await response.json() as DeviceTunnelFlowResponse;
}

/**
 * Poll GitHub for access token. Returns ghu_ token on success, null if still pending.
 * Throws on error or expiry.
 */
export async function pollDeviceTunnelFlow(deviceCode: string): Promise<string | null> {
    const body = new URLSearchParams({
        client_id: DEVTUNNEL_GITHUB_CLIENT_ID,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });
    const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });
    if (!response.ok) throw new Error(`GitHub token poll failed: ${response.status}`);
    const data = await response.json() as { access_token?: string; error?: string };
    if (data.error === 'authorization_pending' || data.error === 'slow_down') return null;
    if (data.error) throw new Error(data.error);
    if (!data.access_token) return null;
    return data.access_token;
}

type DevTunnelsListItem = {
    clusterId: string;
    tunnelId: string;
    description?: string;
    status?: { value: string };
};

/** List all happy-* tunnels for the authenticated GitHub user. */
export async function listHappyTunnels(githubToken: string): Promise<DiscoveredMachine[]> {
    const response = await fetch(
        `${DEV_TUNNELS_API}/tunnels?includePorts=true&global=true&api-version=${DEV_TUNNELS_API_VERSION}`,
        { headers: { Authorization: `github ${githubToken}`, Accept: 'application/json' } }
    );
    if (!response.ok) return [];
    const tunnels = await response.json() as DevTunnelsListItem[];
    if (!Array.isArray(tunnels)) return [];
    return tunnels
        .filter(t => typeof t.tunnelId === 'string' && t.tunnelId.startsWith('happy-'))
        .map(t => ({
            tunnelId: t.tunnelId,
            tunnelUrl: `https://${t.tunnelId}.devtunnels.ms`,
            displayName: t.description || t.tunnelId.replace(/^happy-/, '').replace(/-[a-z0-9]{20,}$/, ''),
            isOnline: t.status?.value === 'host-connected',
        }));
}

/** Fetch a Dev Tunnels connect JWT for a specific tunnel. Returns token + expiry. */
export async function fetchTunnelConnectToken(
    tunnelId: string,
    githubToken: string,
): Promise<{ connectToken: string; connectTokenExpiry: number }> {
    const response = await fetch(
        `${DEV_TUNNELS_API}/tunnels/${tunnelId}?tokenScopes=connect&api-version=${DEV_TUNNELS_API_VERSION}`,
        { headers: { Authorization: `github ${githubToken}`, Accept: 'application/json' } }
    );
    if (!response.ok) throw new Error(`Failed to fetch connect token: ${response.status}`);
    const data = await response.json() as { tokens?: { connectAccessToken?: string } };
    const connectToken = data.tokens?.connectAccessToken;
    if (!connectToken) throw new Error('No connect token in Dev Tunnels response');
    return { connectToken, connectTokenExpiry: Date.now() + CONNECT_TOKEN_TTL_MS };
}

export { createX25519KeyPair };

export type PairStartResponse = {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete?: string;
    expires_in: number;
    interval: number;
};

export type PairMachine = {
    machineId: string;
    tunnelUrl: string;
    ed25519PublicKey: string;
    x25519PublicKey: string;
    ed25519Fingerprint?: string;
    tunnelClaim: string;
};

export type DiscoveredMachine = {
    tunnelId: string;
    tunnelUrl: string;
    displayName: string;
    isOnline: boolean;
};

export type PairStatusResponse = {
    status: 'pending' | 'authorized';
    githubLogin?: string;
    githubToken?: string;
    machines?: PairMachine[];
    discoveredMachines?: DiscoveredMachine[];
};

export async function startPairing(): Promise<PairStartResponse> {
    const response = await fetch(`${getServerUrl()}/pair/start`);
    if (!response.ok) {
        throw new Error(`Failed to start pairing: ${response.status}`);
    }
    return await response.json() as PairStartResponse;
}

export async function pollPairing(deviceCode: string, localKeyPair?: ReturnType<typeof createX25519KeyPair>): Promise<PairStatusResponse> {
    const mobileEcdhPublicKey = localKeyPair ? encodeBase64(localKeyPair.publicKey, 'base64') : undefined;
    const response = await fetch(`${getServerUrl()}/pair/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_code: deviceCode, mobileEcdhPublicKey }),
    });
    if (!response.ok) {
        throw new Error(`Failed to poll pairing: ${response.status}`);
    }
    return await response.json() as PairStatusResponse;
}

export async function openGitHubDeviceFlow(pairing: PairStartResponse): Promise<void> {
    await WebBrowser.openBrowserAsync(pairing.verification_uri_complete ?? pairing.verification_uri);
}

export async function connectMachine(
    tunnelUrl: string,
    connectToken: string,
    localKeyPair?: ReturnType<typeof createX25519KeyPair>,
): Promise<PairMachine> {
    const mobileEcdhPublicKey = localKeyPair ? encodeBase64(localKeyPair.publicKey, 'base64') : undefined;
    const response = await fetch(`${tunnelUrl}/pair/connect`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Tunnel-Authorization': `tunnel ${connectToken}`,
        },
        body: JSON.stringify({ mobileEcdhPublicKey }),
    });
    if (!response.ok) {
        throw new Error(`Failed to connect to machine: ${response.status}`);
    }
    return await response.json() as PairMachine;
}

export function credentialsFromPairMachine(machine: PairMachine, localKeyPair: ReturnType<typeof createX25519KeyPair>): AuthCredentials {
    const sessionKey = deriveX25519SessionKey(localKeyPair.secretKey, decodeBase64(machine.x25519PublicKey, 'base64'));
    return {
        machineId: machine.machineId,
        tunnelUrl: machine.tunnelUrl,
        tunnelClaim: machine.tunnelClaim,
        pinnedPubkey: machine.ed25519PublicKey,
        sessionKey,
        firstSeenAt: Date.now(),
    };
}
