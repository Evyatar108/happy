import { AuthCredentials } from '@/auth/tokenStorage';
import { ensureFreshConnectToken } from '@/auth/connectTokenRefresh';
import { decodeBase64Url } from '@/utils/base64url';

const MIN_REFRESH_INTERVAL_MS = 12_000;

const queues = new Map<string, Promise<unknown>>();
const lastRefreshAt = new Map<string, number>();

export class DeviceCodeExpired extends Error {
    readonly machineId: string;

    constructor(machineId: string) {
        super(`Device code expired for machine ${machineId}.`);
        this.name = 'DeviceCodeExpired';
        this.machineId = machineId;
    }
}

export class MachineNotInRefreshResponse extends Error {
    readonly machineId: string;

    constructor(machineId: string) {
        super(`Pair status response did not include a tunnel claim for machine ${machineId}.`);
        this.name = 'MachineNotInRefreshResponse';
        this.machineId = machineId;
    }
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function validateFreshClaim(tunnelClaim: string): void {
    const envelope = JSON.parse(decodeBase64Url(tunnelClaim)) as { p?: unknown };
    if (typeof envelope.p !== 'string') {
        throw new Error('Invalid tunnel claim envelope');
    }
    const payload = JSON.parse(decodeBase64Url(envelope.p)) as {
        accountId?: unknown;
        iat?: unknown;
        exp?: unknown;
        jti?: unknown;
    };
    if (payload.accountId !== undefined && typeof payload.accountId !== 'number') {
        throw new Error('Fresh tunnel claim has non-numeric accountId');
    }
    if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number' || payload.exp <= payload.iat || payload.exp - payload.iat > 3600 || payload.exp <= Math.floor(Date.now() / 1000) - 30) {
        throw new Error('Fresh tunnel claim has invalid lifetime');
    }
    if (typeof payload.jti !== 'string' || payload.jti.length === 0) {
        throw new Error('Fresh tunnel claim is missing jti');
    }
}

async function refreshTunnelClaimOnce(credentials: AuthCredentials, machineId: string): Promise<string> {
    if (!credentials.deviceCode || !credentials.deviceCodeExpiresAt || credentials.deviceCodeExpiresAt <= Date.now()) {
        throw new DeviceCodeExpired(machineId);
    }

    const { connectToken } = await ensureFreshConnectToken(credentials, machineId);

    const previous = lastRefreshAt.get(machineId) ?? 0;
    const waitMs = previous + MIN_REFRESH_INTERVAL_MS - Date.now();
    if (waitMs > 0) {
        await delay(waitMs);
    }

    const response = await fetch(`${credentials.tunnelUrl}/pair/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tunnel-Connect': connectToken },
        body: JSON.stringify({ device_code: credentials.deviceCode }),
    });
    lastRefreshAt.set(machineId, Date.now());

    const body = await response.json().catch(() => null) as {
        status?: string;
        error?: string;
        machines?: Array<{ machineId?: string; tunnelClaim?: string }>;
    } | null;

    if (!response.ok) {
        if (response.status >= 400 && response.status < 500 && (body?.error === 'device_code_expired' || body?.error === 'access_denied')) {
            throw new DeviceCodeExpired(machineId);
        }
        throw new Error(`Failed to refresh tunnel claim: ${response.status}`);
    }
    if (body?.error === 'device_code_expired' || body?.error === 'access_denied') {
        throw new DeviceCodeExpired(machineId);
    }

    const machines = body?.machines ?? [];
    if (machines.length !== 1) {
        throw new Error(`Pair status response must contain exactly one machine, got ${machines.length}`);
    }
    const machine = machines.find(item => item.machineId === machineId);
    if (!machine?.tunnelClaim) {
        throw new MachineNotInRefreshResponse(machineId);
    }
    validateFreshClaim(machine.tunnelClaim);
    return machine.tunnelClaim;
}

export function refreshTunnelClaim(credentials: AuthCredentials, machineId: string): Promise<string> {
    const previous = queues.get(machineId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(() => refreshTunnelClaimOnce(credentials, machineId));
    const tracked = next.catch(() => undefined).finally(() => {
        if (queues.get(machineId) === tracked) {
            queues.delete(machineId);
        }
    });
    queues.set(machineId, tracked);
    return next;
}
