import axios, { AxiosError } from 'axios';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { saveCredentials, deleteCredentials, legacyCredentialsToPersisted, type PersistedCredentials, type PersistedDiscoveredMachine, type PersistedMachineCredentials } from './credentials';
import { encodeBase64 } from './encryption';
import { DevTunnelsClientProvider } from './tunnel/clientProvider';
import type { Config } from './config';

const DEFAULT_POLL_INTERVAL_SECONDS = 5;
const MAX_POLL_INTERVAL_SECONDS = 30;
const TARGET_DISCOVERY_TIMEOUT_MS = 10_000;
const DEVTUNNEL_GITHUB_CLIENT_ID = 'Iv1.e7b89e013f801f03';
export const CONNECT_TOKEN_TTL_MS = 55 * 60_000;
export const CONNECT_TOKEN_REFRESH_SKEW_MS = 60_000;

type PairStartResponse = {
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval?: number;
};

type PairStatusResponse = {
    status: 'pending' | 'slow_down' | 'authorized' | 'expired';
    githubLogin?: string;
    machines?: PairStatusMachine[];
    discoveredMachines?: PersistedDiscoveredMachine[];
};

type PairStatusMachine = PersistedMachineCredentials;

type TunnelClaimPayload = {
    accountId?: unknown;
    iat?: unknown;
    exp?: unknown;
    jti?: unknown;
};

export async function authLogin(config: Config): Promise<void> {
    const start = await startPairing(config);
    const expiresAt = Math.floor(Date.now() / 1000) + start.expires_in;

    console.log('## Authentication');
    console.log(`- Open: ${start.verification_uri}`);
    console.log(`- Code: ${start.user_code}`);

    let intervalSeconds = start.interval ?? DEFAULT_POLL_INTERVAL_SECONDS;
    while (Math.floor(Date.now() / 1000) < expiresAt) {
        await sleep(intervalSeconds * 1000);
        let status: PairStatusResponse;
        try {
            status = await postPairStatus(config.pairingBaseUrl, start.device_code);
            intervalSeconds = start.interval ?? DEFAULT_POLL_INTERVAL_SECONDS;
        } catch (error) {
            if (isAxiosStatus(error, 429)) {
                intervalSeconds = Math.min(intervalSeconds * 2, MAX_POLL_INTERVAL_SECONDS);
                continue;
            }
            throw new Error(`Auth polling failed: ${error instanceof Error ? error.message : String(error)}`);
        }

        if (status.status === 'pending' || status.status === 'slow_down') {
            continue;
        }
        if (status.status === 'expired') {
            throw new Error("Device code expired. Run 'happy-agent auth login'");
        }
        if (status.status === 'authorized') {
            const devTunnelsAccess = await resolveDevTunnelsAccess(status, intervalSeconds);
            const machines = await discoverAuthorizedMachines(status, start.device_code, intervalSeconds, devTunnelsAccess);
            const auditedMachines = auditMachines(machines);
            const legacy = readLegacyCredentials();
            const persisted: PersistedCredentials = {
                githubLogin: requireString(status.githubLogin, 'githubLogin'),
                devTunnelsAccess,
                deviceCode: start.device_code,
                deviceCodeExpiresAt: expiresAt,
                pairingBaseUrl: config.pairingBaseUrl,
                machines: auditedMachines,
                discoveredMachines: status.discoveredMachines,
                ...legacy,
            };
            await saveCredentials(config, persisted);
            console.log('- Status: Authenticated');
            console.log(`- GitHub: ${persisted.githubLogin}`);
            console.log(`- Machines: ${persisted.machines.length}`);
            return;
        }
    }

    throw new Error('Authentication timed out. Please try again.');
}

export async function authLogout(config: Config): Promise<void> {
    await deleteCredentials(config);
    console.log('## Authentication');
    console.log('- Status: Logged out');
    console.log('- Credentials: Cleared');
}

export async function authStatus(config: Config): Promise<void> {
    console.log('## Authentication');
    if (!existsSync(config.credentialPath)) {
        console.log('- Status: Not authenticated');
        console.log('- Action: Run `happy-agent auth login` to authenticate.');
        return;
    }

    const persisted = JSON.parse(readFileSync(config.credentialPath, 'utf-8')) as PersistedCredentials;
    const remainingSeconds = Math.max(0, persisted.deviceCodeExpiresAt - Math.floor(Date.now() / 1000));
    const hasLegacy = Boolean(persisted.legacyToken && persisted.legacySecret);
    console.log('- Status: Authenticated');
    console.log(`- GitHub: ${persisted.githubLogin}`);
    console.log(`- Machines: ${persisted.machines.length}`);
    console.log(`- Device Code Expires In: ${remainingSeconds}s`);
    console.log(`- Has Legacy Credentials: ${hasLegacy ? 'yes' : 'no'}`);
    if (!hasLegacy) {
        console.warn('Legacy credentials were not found; REST/session commands require a legacy agent.key until Sprint E migration completes.');
    }
}

async function startPairing(config: Config): Promise<PairStartResponse> {
    try {
        const resp = await axios.get(`${config.pairingBaseUrl}/pair/start`, {
            headers: { 'X-Happy-Client': 'cli-control-plane/0.1.0' },
        });
        return resp.data as PairStartResponse;
    } catch (error) {
        if (error instanceof AxiosError) {
            throw new Error(`Failed to initiate auth: ${error.message}`);
        }
        throw error;
    }
}

async function postPairStatus(baseUrl: string, deviceCode: string, timeout?: number, connectToken?: string): Promise<PairStatusResponse> {
    const resp = await axios.post(`${baseUrl}/pair/status`, {
        device_code: deviceCode,
    }, {
        headers: {
            'X-Happy-Client': 'cli-control-plane/0.1.0',
            ...(connectToken ? { 'X-Tunnel-Connect': connectToken } : {}),
        },
        ...(timeout ? { timeout } : {}),
    });
    return resp.data as PairStatusResponse;
}

async function discoverAuthorizedMachines(status: PairStatusResponse, deviceCode: string, intervalSeconds: number, devTunnelsAccess: string | undefined): Promise<PairStatusMachine[]> {
    const machines = [...(status.machines ?? [])];
    const provider = new DevTunnelsClientProvider({
        credentials: {
            getDevTunnelsToken: async () => devTunnelsAccess ?? null,
            setDevTunnelsToken: async () => undefined,
        },
    });
    for (const discovered of status.discoveredMachines ?? []) {
        if (discovered.isOnline === false) {
            console.warn(`Skipping offline tunnel: ${discovered.displayName ?? discovered.tunnelUrl}`);
            continue;
        }

        try {
            new URL(discovered.tunnelUrl);
        } catch {
            console.warn(`Skipping tunnel with invalid URL: ${discovered.displayName ?? discovered.tunnelUrl}`);
            continue;
        }

        const retryAfterMs = Math.min(intervalSeconds * 2, MAX_POLL_INTERVAL_SECONDS) * 1000;
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const connectToken = await provider.getConnectToken(discovered.tunnelId);
                const connectTokenExpiry = deriveConnectTokenExpiry();
                const target = await postPairStatus(discovered.tunnelUrl, deviceCode, TARGET_DISCOVERY_TIMEOUT_MS, connectToken);
                if (target.status === 'authorized' && target.machines?.[0]) {
                    machines.push({ ...target.machines[0], tunnelId: discovered.tunnelId, connectToken, connectTokenExpiry });
                }
                break;
            } catch (error) {
                if (isAxiosStatus(error, 429)) {
                    if (attempt === 1) {
                        console.warn(`Tunnel ${discovered.tunnelUrl} rate-limited; retrying once after ${retryAfterMs}ms`);
                        await sleep(retryAfterMs);
                        continue;
                    }
                    console.warn(`Skipping rate-limited tunnel ${discovered.tunnelUrl} after retry`);
                    break;
                }
                if (error instanceof AxiosError && error.response?.status) {
                    console.warn(`Skipping tunnel ${discovered.tunnelUrl}: ${error.response.status}`);
                } else {
                    console.warn(`Skipping unreachable tunnel ${discovered.tunnelUrl}: ${error instanceof Error ? error.message : String(error)}`);
                }
                break;
            }
        }
    }
    return machines;
}

async function resolveDevTunnelsAccess(status: PairStatusResponse, intervalSeconds: number): Promise<string | undefined> {
    if ((status.discoveredMachines ?? []).every(machine => machine.isOnline === false)) {
        return process.env.HAPPY_DEVTUNNELS_TOKEN;
    }
    if (process.env.HAPPY_DEVTUNNELS_TOKEN) {
        return process.env.HAPPY_DEVTUNNELS_TOKEN;
    }
    if ((status.discoveredMachines ?? []).length === 0) {
        return undefined;
    }
    const start = await startDevTunnelsDeviceFlow();
    console.log('- Dev Tunnels OAuth: additional owner token required');
    console.log(`- Dev Tunnels Code: ${start.user_code}`);
    const deadline = Date.now() + start.expires_in * 1000;
    let pollInterval = Math.max(start.interval ?? intervalSeconds, 1) * 1000;
    while (Date.now() < deadline) {
        await sleep(pollInterval);
        const token = await pollDevTunnelsDeviceFlow(start.device_code);
        if (token) {
            return token;
        }
    }
    throw new Error('Dev Tunnels GitHub device authorization expired');
}

async function startDevTunnelsDeviceFlow(): Promise<{ device_code: string; user_code: string; expires_in: number; interval?: number }> {
    const body = new URLSearchParams({ client_id: DEVTUNNEL_GITHUB_CLIENT_ID, scope: 'read:user' });
    const response = await axios.post('https://github.com/login/device/code', body.toString(), {
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return response.data as { device_code: string; user_code: string; expires_in: number; interval?: number };
}

async function pollDevTunnelsDeviceFlow(deviceCode: string): Promise<string | null> {
    const body = new URLSearchParams({
        client_id: DEVTUNNEL_GITHUB_CLIENT_ID,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });
    const response = await axios.post('https://github.com/login/oauth/access_token', body.toString(), {
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const data = response.data as { access_token?: string; error?: string };
    if (data.error === 'authorization_pending' || data.error === 'slow_down') return null;
    if (data.error) throw new Error(data.error);
    return data.access_token ?? null;
}

function deriveConnectTokenExpiry(now = Date.now()): number {
    return now + CONNECT_TOKEN_TTL_MS;
}

function auditMachines(machines: PairStatusMachine[]): PersistedMachineCredentials[] {
    const audited: PersistedMachineCredentials[] = [];
    for (const machine of machines) {
        try {
            const payload = decodeTunnelClaimPayload(machine.tunnelClaim);
            if (typeof payload.accountId !== 'number') throw new Error('accountId missing');
            if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number' || payload.exp - payload.iat > 3600) throw new Error('invalid lifetime');
            if (payload.exp <= Math.floor(Date.now() / 1000)) throw new Error('claim expired');
            if (typeof payload.jti !== 'string' || payload.jti.length === 0) throw new Error('jti missing');
            audited.push({ ...machine, accountId: payload.accountId });
        } catch (error) {
            console.warn(`Skipping machine ${machine.machineId} with invalid tunnel claim: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    return audited;
}

function decodeTunnelClaimPayload(tunnelClaim: string): TunnelClaimPayload {
    const envelope = JSON.parse(Buffer.from(tunnelClaim, 'base64url').toString('utf-8')) as { p?: unknown; s?: unknown };
    if (typeof envelope.p !== 'string' || typeof envelope.s !== 'string') {
        throw new Error('invalid envelope');
    }
    return JSON.parse(Buffer.from(envelope.p, 'base64url').toString('utf-8')) as TunnelClaimPayload;
}

function readLegacyCredentials(): Pick<PersistedCredentials, 'legacyToken' | 'legacySecret'> {
    const legacyPath = join(process.env.HAPPY_HOME_DIR ?? join(homedir(), '.happy'), 'agent.key');
    if (!existsSync(legacyPath)) return {};
    const parsed = JSON.parse(readFileSync(legacyPath, 'utf-8')) as { token?: unknown; secret?: unknown };
    if (typeof parsed.token !== 'string' || typeof parsed.secret !== 'string') {
        throw new Error(`Legacy credentials file ${legacyPath} is malformed`);
    }
    const secretBytes = Buffer.from(parsed.secret, 'base64');
    if (secretBytes.length !== 32 || encodeBase64(secretBytes) !== parsed.secret) {
        throw new Error(`Legacy credentials file ${legacyPath} is malformed`);
    }
    return legacyCredentialsToPersisted(parsed.token, secretBytes);
}

function requireString(value: unknown, label: string): string {
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`Pairing response missing ${label}`);
    }
    return value;
}

function isAxiosStatus(error: unknown, status: number): boolean {
    return error instanceof AxiosError && error.response?.status === status;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
