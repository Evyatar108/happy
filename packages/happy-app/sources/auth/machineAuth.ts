import { AuthCredentials, TokenStorage } from './tokenStorage';

export function getTunnelAuthorization(credentials: AuthCredentials): string {
    // Prefer real Dev Tunnels connect JWT; fall back to server-generated Ed25519 claim
    const token = (credentials.connectToken && credentials.connectTokenExpiry && credentials.connectTokenExpiry > Date.now())
        ? credentials.connectToken
        : credentials.tunnelClaim;
    return `tunnel ${token}`;
}

/**
 * fetch() wrapper that injects X-Tunnel-Authorization and retries once on 401
 * by force-refreshing the connect token. Drop-in replacement for fetch() at
 * tunnel call sites — pass extra headers separately, not inside getMachineAuthHeaders.
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

    const response = await fetch(url, { ...init, headers: makeHeaders(credentials) });
    if (response.status !== 401) return response;

    // Force refresh (zero expiry so refreshConnectTokenIfNeeded always refreshes)
    const refreshed = await refreshConnectTokenIfNeeded({ ...credentials, connectTokenExpiry: 0 });
    if (refreshed.connectToken !== credentials.connectToken) {
        await TokenStorage.setCredentials(refreshed);
    }
    return fetch(url, { ...init, headers: makeHeaders(refreshed) });
}

export async function refreshConnectTokenIfNeeded(credentials: AuthCredentials): Promise<AuthCredentials> {
    if (!credentials.connectToken || !credentials.connectTokenExpiry || !credentials.githubToken || !credentials.tunnelId) {
        return credentials;
    }
    const REFRESH_BEFORE_MS = 5 * 60 * 1000; // refresh 5 min before expiry
    if (credentials.connectTokenExpiry - Date.now() > REFRESH_BEFORE_MS) {
        return credentials;
    }
    try {
        const { fetchTunnelConnectToken } = await import('@/auth/pairing');
        const { connectToken, connectTokenExpiry } = await fetchTunnelConnectToken(credentials.tunnelId, credentials.githubToken);
        return { ...credentials, connectToken, connectTokenExpiry };
    } catch {
        return credentials;
    }
}

export function getMachineAuthHeaders(credentials: AuthCredentials): Record<string, string> {
    return {
        'X-Tunnel-Authorization': getTunnelAuthorization(credentials),
    };
}
