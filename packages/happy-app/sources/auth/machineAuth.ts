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

type DeviceCodeExpiredHandler = (machineId: string) => void;
const deviceCodeExpiredHandlers = new Set<DeviceCodeExpiredHandler>();

export function registerDeviceCodeExpiredHandler(handler: DeviceCodeExpiredHandler): () => void {
    deviceCodeExpiredHandlers.add(handler);
    return () => deviceCodeExpiredHandlers.delete(handler);
}

/**
 * fetch() wrapper that injects X-Tunnel-Authorization. Drop-in replacement for
 * fetch() at tunnel call sites; pass extra headers separately.
 *
 * When the server signals DeviceCodeExpired or a ClaimExpired is thrown,
 * all registered handlers are invoked before re-throwing so every call site
 * benefits from the centralized disconnect-and-notify contract without
 * duplicating catch blocks.
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

    try {
        const response = await fetch(url, { ...init, headers: await makeHeaders(credentials) });
        if (response.status === 401) {
            const body = await response.clone().json().catch(() => null) as { error?: unknown } | null;
            if (body?.error === 'tunnel_claim_expired') {
                throw new ClaimExpired(credentials.machineId);
            }
        }
        return response;
    } catch (error) {
        if (error instanceof DeviceCodeExpired || error instanceof ClaimExpired) {
            deviceCodeExpiredHandlers.forEach(handler => handler(credentials.machineId));
        }
        throw error;
    }
}

export async function getMachineAuthHeaders(credentials: AuthCredentials, machineId = credentials.machineId): Promise<Record<string, string>> {
    const freshClaim = await refreshTunnelClaim(credentials, machineId);
    return {
        'X-Tunnel-Authorization': `tunnel ${freshClaim}`,
    };
}
