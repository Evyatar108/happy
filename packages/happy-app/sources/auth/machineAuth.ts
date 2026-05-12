import { AuthCredentials } from './tokenStorage';

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
    const makeHeaders = (creds: AuthCredentials): Record<string, string> => ({
        ...(init?.headers ?? {}),
        ...getMachineAuthHeaders(creds),
    });

    return fetch(url, { ...init, headers: makeHeaders(credentials) });
}

export function getMachineAuthHeaders(credentials: AuthCredentials): Record<string, string> {
    return {
        'X-Tunnel-Authorization': getTunnelAuthorization(credentials),
    };
}
