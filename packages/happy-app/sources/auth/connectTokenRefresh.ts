import { AuthCredentials, TokenStorage } from '@/auth/tokenStorage';
import { DevTunnelsClientProvider } from '@/sync/tunnelProvider';

const CONNECT_TOKEN_REFRESH_SKEW_MS = 60_000;
const CONNECT_TOKEN_TTL_MS = 55 * 60_000;

export type FreshConnectToken = {
    connectToken: string;
    connectTokenExpiry: number;
};

const refreshes = new Map<string, Promise<FreshConnectToken>>();

export function deriveConnectTokenExpiry(now = Date.now()): number {
    return now + CONNECT_TOKEN_TTL_MS;
}

function isFresh(credentials: AuthCredentials): credentials is AuthCredentials & Required<Pick<AuthCredentials, 'connectToken' | 'connectTokenExpiry'>> {
    return Boolean(credentials.connectToken) && typeof credentials.connectTokenExpiry === 'number' && credentials.connectTokenExpiry - Date.now() > CONNECT_TOKEN_REFRESH_SKEW_MS;
}

async function refreshOnce(credentials: AuthCredentials, machineId: string): Promise<FreshConnectToken> {
    if (isFresh(credentials)) {
        return {
            connectToken: credentials.connectToken,
            connectTokenExpiry: credentials.connectTokenExpiry,
        };
    }
    if (!credentials.tunnelId) {
        throw new Error(`Machine ${machineId} is missing tunnelId; re-pair the machine to enable private tunnel access.`);
    }
    const provider = new DevTunnelsClientProvider({ credentials: TokenStorage });
    const connectToken = await provider.getConnectToken(credentials.tunnelId);
    const connectTokenExpiry = deriveConnectTokenExpiry();
    await TokenStorage.updateMachineCredentials(machineId, { connectToken, connectTokenExpiry });
    return { connectToken, connectTokenExpiry };
}

export function ensureFreshConnectToken(credentials: AuthCredentials, machineId = credentials.machineId): Promise<FreshConnectToken> {
    if (isFresh(credentials)) {
        return Promise.resolve({
            connectToken: credentials.connectToken,
            connectTokenExpiry: credentials.connectTokenExpiry,
        });
    }
    const existing = refreshes.get(machineId);
    if (existing) {
        return existing;
    }
    const next = refreshOnce(credentials, machineId).finally(() => {
        if (refreshes.get(machineId) === next) {
            refreshes.delete(machineId);
        }
    });
    refreshes.set(machineId, next);
    return next;
}
