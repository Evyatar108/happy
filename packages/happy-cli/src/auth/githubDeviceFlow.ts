import { z } from 'zod';

import { delay } from '@/utils/time';

const DEFAULT_GITHUB_CLIENT_ID = 'Iv1.e7b89e013f801f03';
const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';

const GitHubDeviceCodeSchema = z.object({
    device_code: z.string(),
    user_code: z.string(),
    verification_uri: z.string(),
    verification_uri_complete: z.string().optional(),
    expires_in: z.number(),
    interval: z.number(),
});

export type GitHubDeviceCodeResponse = z.infer<typeof GitHubDeviceCodeSchema>;

const GitHubAccessTokenSchema = z.object({
    access_token: z.string().optional(),
    error: z.string().optional(),
    error_description: z.string().optional(),
});

type GitHubAccessTokenResponse = z.infer<typeof GitHubAccessTokenSchema>;

interface PollForTokenOptions {
    delayMs?: (ms: number) => Promise<void>;
    now?: () => number;
}

function githubClientId(): string {
    return process.env.HAPPY_GITHUB_CLIENT_ID || DEFAULT_GITHUB_CLIENT_ID;
}

async function readGitHubJson<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
    if (!response.ok) {
        throw new Error(`GitHub device flow request failed: ${response.status}`);
    }
    return schema.parse(await response.json());
}

export async function requestDeviceCode(): Promise<GitHubDeviceCodeResponse> {
    const body = new URLSearchParams({
        client_id: githubClientId(),
        scope: 'read:user',
    });
    const response = await fetch(DEVICE_CODE_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });
    return await readGitHubJson(response, GitHubDeviceCodeSchema);
}

export async function pollForToken(
    deviceCode: string,
    interval: number,
    expiresIn: number,
    options: PollForTokenOptions = {},
): Promise<string> {
    const sleep = options.delayMs ?? delay;
    const now = options.now ?? Date.now;
    const deadline = now() + expiresIn * 1000;
    let pollIntervalSeconds = interval;

    while (now() <= deadline) {
        let tokenData: GitHubAccessTokenResponse;
        try {
            const body = new URLSearchParams({
                client_id: githubClientId(),
                device_code: deviceCode,
                grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            });
            const response = await fetch(ACCESS_TOKEN_URL, {
                method: 'POST',
                headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString(),
            });
            tokenData = await readGitHubJson(response, GitHubAccessTokenSchema);
        } catch (error) {
            if (error instanceof TypeError) {
                if (now() + pollIntervalSeconds * 1000 > deadline) {
                    break;
                }
                await sleep(pollIntervalSeconds * 1000);
                continue;
            }
            throw error;
        }

        if (tokenData.access_token) {
            return tokenData.access_token;
        }
        if (tokenData.error === 'slow_down') {
            pollIntervalSeconds += 5;
        } else if (tokenData.error === 'access_denied') {
            throw new Error('GitHub device authorization denied');
        } else if (tokenData.error === 'expired_token') {
            throw new Error('GitHub device authorization expired');
        } else if (tokenData.error && tokenData.error !== 'authorization_pending') {
            throw new Error(tokenData.error_description ?? tokenData.error);
        }

        if (now() + pollIntervalSeconds * 1000 > deadline) {
            break;
        }
        await sleep(pollIntervalSeconds * 1000);
    }

    throw new Error('GitHub device authorization expired');
}

export const bundledGitHubClientId = DEFAULT_GITHUB_CLIENT_ID;
