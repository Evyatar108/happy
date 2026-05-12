import { AuthCredentials } from './tokenStorage';
import { refreshTunnelClaim, DeviceCodeExpired } from '@/sync/refreshClaim';

export { DeviceCodeExpired };

export class ClaimExpired extends Error {
    readonly machineId: string;

    constructor(machineId: string) {
        super(`Tunnel claim expired for machine ${machineId}.`);
        this.name = 'ClaimExpired';
        this.machineId = machineId;
    }
}

export function getTunnelAuthorization(credentials: AuthCredentials): string {
    return `tunnel ${credentials.tunnelClaim}`;
}

/**
 * fetch() wrapper that injects X-Tunnel-Authorization. Drop-in replacement for
 * fetch() at tunnel call sites; pass extra headers separately.
 */
export async function tunnelFetch(
    url: string,
    credentials: AuthCredentials,
    init?: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> },
): Promise<Response> {
    const makeHeaders = async (creds: AuthCredentials): Promise<Record<string, string>> => ({
        ...(init?.headers ?? {}),
        ...await getMachineAuthHeaders(creds),
    });

    const response = await fetch(url, { ...init, headers: await makeHeaders(credentials) });
    if (response.status === 401) {
        const body = await response.clone().json().catch(() => null) as { error?: unknown } | null;
        if (body?.error === 'tunnel_claim_expired') {
            throw new ClaimExpired(credentials.machineId);
        }
    }
    return response;
}

export async function getMachineAuthHeaders(credentials: AuthCredentials, machineId = credentials.machineId): Promise<Record<string, string>> {
    const freshClaim = await refreshTunnelClaim(credentials, machineId);
    return {
        'X-Tunnel-Authorization': `tunnel ${freshClaim}`,
    };
}
