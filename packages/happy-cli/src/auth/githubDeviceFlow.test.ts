import { afterEach, describe, expect, it, vi } from 'vitest';

import { pollForToken, requestDeviceCode } from './githubDeviceFlow';

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('githubDeviceFlow', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        delete process.env.HAPPY_GITHUB_CLIENT_ID;
    });

    it('requests a device code with the bundled client id by default', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
            device_code: 'device-code',
            user_code: 'ABCD-EFGH',
            verification_uri: 'https://github.com/login/device',
            expires_in: 900,
            interval: 5,
        }));

        await expect(requestDeviceCode()).resolves.toMatchObject({ device_code: 'device-code' });

        expect(fetchMock).toHaveBeenCalledWith('https://github.com/login/device/code', expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('client_id=Iv1.e7b89e013f801f03'),
        }));
    });

    it('polls until the happy path returns an access token', async () => {
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse({ error: 'authorization_pending' }))
            .mockResolvedValueOnce(jsonResponse({ access_token: 'ghu_token' }));
        const delays: number[] = [];

        await expect(pollForToken('device-code', 2, 60, { delayMs: async ms => { delays.push(ms); } })).resolves.toBe('ghu_token');

        expect(delays).toEqual([2000]);
    });

    it('throws when the user denies authorization', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'access_denied' }));

        await expect(pollForToken('device-code', 1, 60, { delayMs: async () => {} })).rejects.toThrow('denied');
    });

    it('throws on expiry timeout', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'authorization_pending' }));

        await expect(pollForToken('device-code', 1, 0, { delayMs: async () => {} })).rejects.toThrow('expired');
    });

    it('backs off by five seconds on slow_down', async () => {
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse({ error: 'slow_down' }))
            .mockResolvedValueOnce(jsonResponse({ access_token: 'ghu_token' }));
        const delays: number[] = [];

        await expect(pollForToken('device-code', 1, 60, { delayMs: async ms => { delays.push(ms); } })).resolves.toBe('ghu_token');

        expect(delays).toEqual([6000]);
    });

    it('retries transient network errors (TypeError from fetch)', async () => {
        vi.spyOn(globalThis, 'fetch')
            .mockRejectedValueOnce(new TypeError('fetch failed'))
            .mockResolvedValueOnce(jsonResponse({ access_token: 'ghu_token' }));

        await expect(pollForToken('device-code', 1, 60, { delayMs: async () => {} })).resolves.toBe('ghu_token');
    });

    it('surfaces non-200 HTTP errors immediately instead of looping to expiry', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, 500));

        await expect(pollForToken('device-code', 1, 60, { delayMs: async () => {} })).rejects.toThrow('500');
    });

    it('surfaces unrecognized GitHub error codes immediately', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            jsonResponse({ error: 'incomprehensible_request', error_description: 'bad client id' }),
        );

        await expect(pollForToken('device-code', 1, 60, { delayMs: async () => {} })).rejects.toThrow('bad client id');
    });

    it('throws on malformed device code response body', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ unexpected: true }));

        await expect(requestDeviceCode()).rejects.toThrow();
    });
});
