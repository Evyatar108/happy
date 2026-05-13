import * as WebBrowser from 'expo-web-browser';

import { AuthCredentials, TokenStorage } from './tokenStorage';
import { decodeBase64Url } from '@/utils/base64url';
import { DevTunnelsClientProvider, type MachineTunnel } from '@/sync/tunnelProvider';
// devtunnel's public GitHub App — no client secret required (device flow public client)
const DEVTUNNEL_GITHUB_CLIENT_ID = 'Iv1.e7b89e013f801f03';

export type AuthBrowserInfo = {
    user_code: string;
    verification_uri: string;
    verification_uri_complete?: string;
};

export type AuthBrowserOpener = (info: AuthBrowserInfo) => Promise<void>;

let activeAuthOpener: AuthBrowserOpener | null = null;

export function setAuthBrowserOpener(opener: AuthBrowserOpener | null): void {
    activeAuthOpener = opener;
}

async function openAuthBrowser(info: AuthBrowserInfo): Promise<void> {
    if (activeAuthOpener) {
        await activeAuthOpener(info);
        return;
    }
    await WebBrowser.openBrowserAsync(info.verification_uri_complete ?? info.verification_uri);
}

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

export type GitHubUserProfile = {
    login: string;
    avatarUrl: string;
};

export async function fetchGitHubUserProfile(githubToken: string): Promise<GitHubUserProfile> {
    try {
        const response = await fetch('https://api.github.com/user', {
            headers: {
                Accept: 'application/vnd.github+json',
                Authorization: `Bearer ${githubToken}`,
            },
        });
        if (!response.ok) {
            return { login: '', avatarUrl: '' };
        }
        const data = await response.json() as { login?: unknown; avatar_url?: unknown };
        return {
            login: typeof data.login === 'string' ? data.login : '',
            avatarUrl: typeof data.avatar_url === 'string' ? data.avatar_url : '',
        };
    } catch {
        return { login: '', avatarUrl: '' };
    }
}

// Aggressive client-side poll. GitHub's `interval` is just a hint; if we poll
// too fast they return `slow_down` and we just keep going. The previous code
// honored `interval` literally (5s+) which made the post-authorize wait feel
// slow — the user often sees a 5-10s lag between completing the browser flow
// and the app advancing. 2s is the sweet spot.
const DEVICE_FLOW_POLL_INTERVAL_MS = 2000;

export async function loginInteractive(): Promise<string> {
    const flow = await startDeviceTunnelFlow();
    await openAuthBrowser({
        user_code: flow.user_code,
        verification_uri: flow.verification_uri,
        verification_uri_complete: flow.verification_uri_complete,
    });
    const deadline = Date.now() + flow.expires_in * 1000;
    while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, DEVICE_FLOW_POLL_INTERVAL_MS));
        const token = await pollDeviceTunnelFlow(flow.device_code);
        if (token) {
            await TokenStorage.setDevTunnelsToken(token);
            return token;
        }
    }
    throw new Error('GitHub device authorization expired');
}

export type PairMachine = {
    machineId: string;
    tunnelUrl: string;
    tunnelClaim: string;
};

export type PairCompleteResponse = {
    githubLogin: string;
    machine: PairMachine;
};

export class PairingClaimMissingAccountId extends Error {
    constructor() {
        super('Pairing response did not include accountId in tunnel claim.');
        this.name = 'PairingClaimMissingAccountId';
    }
}

export async function acquireConnectTokenForPair(machine: MachineTunnel): Promise<{ connectToken: string }> {
    const provider = new DevTunnelsClientProvider({ credentials: TokenStorage });
    const connectToken = await provider.getConnectToken(machine.tunnelId);
    return { connectToken };
}

/** Single-step pair against the daemon's /pair/complete endpoint. Gateway
 *  X-Tunnel-Authorization is the identity gate; the daemon mints a signed
 *  tunnel claim using identity from its local profile.json. Also used for
 *  refresh — same endpoint returns a fresh claim every call. */
export async function completePair(machine: MachineTunnel, connectToken: string): Promise<PairCompleteResponse> {
    const response = await fetch(`${machine.url}/pair/complete`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Tunnel-Authorization': `tunnel ${connectToken}`,
        },
        body: JSON.stringify({}),
    });
    if (!response.ok) {
        throw new Error(`Failed to complete pairing: ${response.status}`);
    }
    const data = await response.json() as PairCompleteResponse;
    assertMachineHasAccountId(data.machine);
    return data;
}

export function credentialsFromPairMachine(machine: MachineTunnel, pairMachine: PairMachine, metadata: {
    login?: string;
    avatarUrl?: string;
    connectToken: string;
    connectTokenExpiry: number;
}): AuthCredentials {
    return {
        machineId: pairMachine.machineId,
        tunnelUrl: pairMachine.tunnelUrl,
        tunnelId: machine.tunnelId,
        tunnelClaim: pairMachine.tunnelClaim,
        firstSeenAt: Date.now(),
        login: metadata.login ?? '',
        avatarUrl: metadata.avatarUrl ?? '',
        connectToken: metadata.connectToken,
        connectTokenExpiry: metadata.connectTokenExpiry,
    };
}

type TunnelClaimPayload = {
    sub?: unknown;
    iat?: unknown;
    exp?: unknown;
    jti?: unknown;
    accountId?: unknown;
};

export function parseTunnelClaimPayload(tunnelClaim: string): TunnelClaimPayload {
    const envelope = JSON.parse(decodeBase64Url(tunnelClaim)) as { p?: unknown };
    if (typeof envelope.p !== 'string') throw new Error('Invalid tunnel claim envelope');
    return JSON.parse(decodeBase64Url(envelope.p)) as TunnelClaimPayload;
}

function assertMachineHasAccountId(machine: PairMachine): void {
    const payload = parseTunnelClaimPayload(machine.tunnelClaim);
    if (payload.accountId === undefined) {
        throw new PairingClaimMissingAccountId();
    }
}
