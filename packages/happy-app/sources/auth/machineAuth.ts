import { AuthCredentials } from './tokenStorage';

export function getTunnelAuthorization(credentials: AuthCredentials): string {
    return `tunnel ${credentials.tunnelClaim}`;
}

export function getMachineAuthHeaders(credentials: AuthCredentials): Record<string, string> {
    return {
        'X-Tunnel-Authorization': getTunnelAuthorization(credentials),
    };
}
