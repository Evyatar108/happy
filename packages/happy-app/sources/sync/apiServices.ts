import { AuthCredentials } from '@/auth/tokenStorage';
import { tunnelFetch } from '@/auth/machineAuth';
import { backoff } from '@/utils/time';
import { getHappyClientId } from './apiSocket';

/**
 * Connect a service to the user's account
 */
export async function connectService(
    credentials: AuthCredentials,
    service: string,
    token: any
): Promise<void> {
    const API_ENDPOINT = credentials.tunnelUrl;

    return await backoff(async () => {
        const response = await tunnelFetch(`${API_ENDPOINT}/v1/connect/${service}/register`, credentials, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Happy-Client': getHappyClientId(),
            },
            body: JSON.stringify({ token: JSON.stringify(token) })
        });

        if (!response.ok) {
            throw new Error(`Failed to connect ${service}: ${response.status}`);
        }

        const data = await response.json() as { success: true };
        if (!data.success) {
            throw new Error(`Failed to connect ${service} account`);
        }
    });
}

/**
 * Disconnect a connected service from the user's account
 */
export async function disconnectService(credentials: AuthCredentials, service: string): Promise<void> {
    const API_ENDPOINT = credentials.tunnelUrl;

    return await backoff(async () => {
        const response = await tunnelFetch(`${API_ENDPOINT}/v1/connect/${service}`, credentials, {
            method: 'DELETE',
            headers: {
                'X-Happy-Client': getHappyClientId(),
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                const error = await response.json();
                throw new Error(error.error || `${service} account not connected`);
            }
            throw new Error(`Failed to disconnect ${service}: ${response.status}`);
        }

        const data = await response.json() as { success: true };
        if (!data.success) {
            throw new Error(`Failed to disconnect ${service} account`);
        }
    });
}