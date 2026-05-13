import { AuthCredentials } from './tokenStorage';
import { ensureFreshConnectToken } from './connectTokenRefresh';

/**
 * fetch() wrapper that injects X-Tunnel-Authorization. Drop-in replacement for
 * fetch() at tunnel call sites; pass extra headers separately.
 */
export async function tunnelFetch(
    url: string,
    credentials: AuthCredentials,
    init?: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> },
): Promise<Response> {
    const headers: Record<string, string> = {
        ...(init?.headers ?? {}),
        ...await getMachineAuthHeaders(credentials),
    };
    return fetch(url, { ...init, headers });
}

export async function getMachineAuthHeaders(credentials: AuthCredentials, machineId = credentials.machineId): Promise<Record<string, string>> {
    const { connectToken } = await ensureFreshConnectToken(credentials, machineId);
    return {
        'X-Tunnel-Authorization': `tunnel ${connectToken}`,
    };
}
