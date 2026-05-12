import { AuthCredentials } from '@/auth/tokenStorage';

/**
 * Connect a service to the user's account
 */
export async function connectService(
    credentials: AuthCredentials,
    service: string,
    token: any
): Promise<void> {
    void credentials;
    void token;
    throw new Error(`Connecting ${service} accounts is not supported by the tunnel-direct API.`);
}

/**
 * Disconnect a connected service from the user's account
 */
export async function disconnectService(credentials: AuthCredentials, service: string): Promise<void> {
    void credentials;
    throw new Error(`Disconnecting ${service} accounts is not supported by the tunnel-direct API.`);
}
