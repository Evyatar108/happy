import { AuthCredentials } from '@/auth/tokenStorage';
import { getMachineAuthHeaders } from '@/auth/machineAuth';
import { backoff } from '@/utils/time';
import { z } from 'zod';
import { getHappyClientId } from './apiSocket';

const PushTokenSchema = z.object({
    id: z.string(),
    token: z.string(),
    createdAt: z.number(),
    updatedAt: z.number(),
});

const PushTokenListResponseSchema = z.object({
    tokens: z.array(PushTokenSchema),
});

export type PushToken = z.infer<typeof PushTokenSchema>;

export async function registerPushToken(credentials: AuthCredentials, token: string): Promise<void> {
    const API_ENDPOINT = credentials.tunnelUrl;
    await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/push-tokens`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Happy-Client': getHappyClientId(),
                ...getMachineAuthHeaders(credentials),
            },
            body: JSON.stringify({ token })
        });

        if (!response.ok) {
            throw new Error(`Failed to register push token: ${response.status}`);
        }

        const data = await response.json();
        if (!data.success) {
            throw new Error('Failed to register push token');
        }
    });
}

export async function fetchPushTokens(credentials: AuthCredentials): Promise<PushToken[]> {
    const API_ENDPOINT = credentials.tunnelUrl;
    return backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/push-tokens`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-Happy-Client': getHappyClientId(),
                ...getMachineAuthHeaders(credentials),
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch push tokens: ${response.status}`);
        }

        const data = await response.json();
        return PushTokenListResponseSchema.parse(data).tokens;
    });
}

export async function unregisterPushToken(credentials: AuthCredentials, token: string): Promise<void> {
    const API_ENDPOINT = credentials.tunnelUrl;
    await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/push-tokens/${encodeURIComponent(token)}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'X-Happy-Client': getHappyClientId(),
                ...getMachineAuthHeaders(credentials),
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to unregister push token: ${response.status}`);
        }

        const data = await response.json();
        if (!data.success) {
            throw new Error('Failed to unregister push token');
        }
    });
}
