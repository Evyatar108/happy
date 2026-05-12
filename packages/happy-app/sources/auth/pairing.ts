import * as WebBrowser from 'expo-web-browser';

import { AuthCredentials, TokenStorage } from './tokenStorage';
import { decodeBase64Url } from '@/utils/base64url';
import type { MachineTunnel } from '@/sync/tunnelProvider';

// devtunnel's public GitHub App — no client secret required (device flow public client)
const DEVTUNNEL_GITHUB_CLIENT_ID = 'Iv1.e7b89e013f801f03';
const PAIRING_FALLBACK_EXPIRY_SECONDS = 15 * 60;
const MIN_PAIR_POLL_INTERVAL_SECONDS = 12;

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

export async function loginInteractive(): Promise<string> {
    const flow = await startDeviceTunnelFlow();
    await WebBrowser.openBrowserAsync(flow.verification_uri_complete ?? flow.verification_uri);
    const deadline = Date.now() + flow.expires_in * 1000;
    while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, Math.max(flow.interval, 1) * 1000));
        const token = await pollDeviceTunnelFlow(flow.device_code);
        if (token) {
            await TokenStorage.setDevTunnelsToken(token);
            return token;
        }
    }
    throw new Error('GitHub device authorization expired');
}

export type PairStartResponse = {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete?: string;
    expires_in?: number;
    interval: number;
};

export type PairMachine = {
    machineId: string;
    tunnelUrl: string;
    tunnelClaim: string;
};

export type PairStatusResponse = {
    status: 'pending' | 'authorized';
    githubLogin?: string;
    machines?: PairMachine[];
};

export type PollPairStatusResult = PairStatusResponse & {
    retryAfterMs?: number;
};

export class PairingClaimMissingAccountId extends Error {
    constructor() {
        super('Pairing response did not include accountId in tunnel claim.');
        this.name = 'PairingClaimMissingAccountId';
    }
}

export async function startPairFlow(machine: MachineTunnel): Promise<PairStartResponse> {
    const response = await fetch(`${machine.url}/pair/start`);
    if (!response.ok) {
        throw new Error(`Failed to start pairing: ${response.status}`);
    }
    const data = await response.json() as PairStartResponse;
    return {
        ...data,
        expires_in: data.expires_in ?? PAIRING_FALLBACK_EXPIRY_SECONDS,
        interval: Math.max(data.interval ?? MIN_PAIR_POLL_INTERVAL_SECONDS, MIN_PAIR_POLL_INTERVAL_SECONDS),
    };
}

export async function pollPairStatus(machine: MachineTunnel, deviceCode: string, intervalSeconds: number): Promise<PollPairStatusResult> {
    const response = await fetch(`${machine.url}/pair/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_code: deviceCode }),
    });
    if (response.status === 429) {
        const body = await response.json().catch(() => null) as { error?: unknown } | null;
        if (body?.error === 'rate_limited') {
            return { status: 'pending', retryAfterMs: MIN_PAIR_POLL_INTERVAL_SECONDS * 1000 };
        }
    }
    if (!response.ok) {
        throw new Error(`Failed to poll pairing: ${response.status}`);
    }
    const data = await response.json() as PairStatusResponse;
    if (data.status === 'authorized') {
        assertPrimaryMachineHasAccountId(data);
    }
    return {
        ...data,
        retryAfterMs: Math.max(intervalSeconds, MIN_PAIR_POLL_INTERVAL_SECONDS) * 1000,
    };
}

export async function openGitHubDeviceFlow(pairing: PairStartResponse): Promise<void> {
    await WebBrowser.openBrowserAsync(pairing.verification_uri_complete ?? pairing.verification_uri);
}

export function credentialsFromPairMachine(machine: MachineTunnel, pairMachine: PairMachine, metadata: {
    login?: string;
    avatarUrl?: string;
    deviceCode: string;
    deviceCodeExpiresAt: number;
}): AuthCredentials {
    return {
        machineId: pairMachine.machineId,
        tunnelUrl: pairMachine.tunnelUrl,
        tunnelId: machine.tunnelId,
        tunnelClaim: pairMachine.tunnelClaim,
        firstSeenAt: Date.now(),
        login: metadata.login ?? '',
        avatarUrl: metadata.avatarUrl ?? '',
        deviceCode: metadata.deviceCode,
        deviceCodeExpiresAt: metadata.deviceCodeExpiresAt,
    };
}

export async function waitForPairStatus(machine: MachineTunnel, flow: PairStartResponse): Promise<PairStatusResponse> {
    const interval = Math.max(flow.interval, MIN_PAIR_POLL_INTERVAL_SECONDS);
    const deadline = Date.now() + (flow.expires_in ?? PAIRING_FALLBACK_EXPIRY_SECONDS) * 1000;
    let delayMs = interval * 1000;
    while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        const status = await pollPairStatus(machine, flow.device_code, interval);
        if (status.status === 'authorized') return status;
        delayMs = status.retryAfterMs ?? interval * 1000;
    }
    throw new Error('GitHub device authorization expired');
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

function assertPrimaryMachineHasAccountId(status: PairStatusResponse): void {
    const machines = status.machines ?? [];
    if (machines.length !== 1) throw new Error(`Pairing response must contain exactly one machine, got ${machines.length}`);
    const payload = parseTunnelClaimPayload(machines[0].tunnelClaim);
    if (payload.accountId === undefined) {
        throw new PairingClaimMissingAccountId();
    }
}
