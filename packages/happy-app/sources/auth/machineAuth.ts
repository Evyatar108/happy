import { AuthCredentials } from './tokenStorage';

export function getTunnelAuthorization(credentials: AuthCredentials): string {
    // Prefer real Dev Tunnels connect JWT; fall back to server-generated Ed25519 claim
    const token = (credentials.connectToken && credentials.connectTokenExpiry && credentials.connectTokenExpiry > Date.now())
        ? credentials.connectToken
        : credentials.tunnelClaim;
    return `tunnel ${token}`;
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
