import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    requestDeviceCode: vi.fn(),
    pollForToken: vi.fn(),
    openBrowser: vi.fn(),
    readCredentials: vi.fn(),
    writeCredentialsLegacy: vi.fn(),
    writeCredentialsDataKey: vi.fn(),
    updateSettings: vi.fn(),
    writeJsonAtomically: vi.fn(),
    loggerWarn: vi.fn(),
}));

vi.mock('@/auth/githubDeviceFlow', () => ({
    requestDeviceCode: mocks.requestDeviceCode,
    pollForToken: mocks.pollForToken,
}));

vi.mock('@/utils/browser', () => ({ openBrowser: mocks.openBrowser }));

vi.mock('@/persistence', () => ({
    readCredentials: mocks.readCredentials,
    writeCredentialsLegacy: mocks.writeCredentialsLegacy,
    writeCredentialsDataKey: mocks.writeCredentialsDataKey,
    updateSettings: mocks.updateSettings,
}));

vi.mock('@slopus/happy-wire/node', () => ({ writeJsonAtomically: mocks.writeJsonAtomically }));

vi.mock('@/configuration', () => ({
    configuration: { happyHomeDir: '/tmp/happy-test' },
}));

vi.mock('./logger', () => ({
    logger: { debug: vi.fn(), warn: mocks.loggerWarn },
}));

import { doAuth } from './auth';

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('doAuth', () => {
    afterEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });

    it('persists new installs as token plus local encryption material and writes profile.json', async () => {
        vi.spyOn(console, 'clear').mockImplementation(() => undefined);
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
            id: 123,
            login: 'octocat',
            name: 'The Octocat',
            avatar_url: 'https://avatars.githubusercontent.com/u/123',
            updated_at: '2026-05-12T00:00:00Z',
        }));
        mocks.readCredentials.mockResolvedValue(null);
        mocks.requestDeviceCode.mockResolvedValue({
            device_code: 'device-code',
            user_code: 'ABCD-EFGH',
            verification_uri: 'https://github.com/login/device',
            verification_uri_complete: 'https://github.com/login/device?user_code=ABCD-EFGH',
            expires_in: 900,
            interval: 1,
        });
        mocks.pollForToken.mockResolvedValue('ghu_token');

        const credentials = await doAuth();

        expect(credentials?.encryption.type).toBe('dataKey');
        expect(mocks.writeCredentialsDataKey).toHaveBeenCalledWith(expect.objectContaining({
            token: 'ghu_token',
            publicKey: expect.any(Uint8Array),
            machineKey: expect.any(Uint8Array),
        }));
        expect(mocks.writeCredentialsDataKey.mock.calls[0][0].publicKey).toHaveLength(32);
        expect(mocks.writeCredentialsDataKey.mock.calls[0][0].machineKey).toHaveLength(32);
        expect(mocks.writeCredentialsLegacy).not.toHaveBeenCalled();
        expect(mocks.writeJsonAtomically.mock.calls[0][0]).toMatch(/[\\/]tmp[\\/]happy-test[\\/]profile\.json$/);
        expect(mocks.writeJsonAtomically.mock.calls[0][1]).toEqual({
            githubUserId: 123,
            githubLogin: 'octocat',
            name: 'The Octocat',
            avatarUrl: 'https://avatars.githubusercontent.com/u/123',
            updatedAt: '2026-05-12T00:00:00Z',
        });
    });

    it('rotates legacy token while preserving secret and does not block when profile fetch fails', async () => {
        vi.spyOn(console, 'clear').mockImplementation(() => undefined);
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'bad_gateway' }, 502));
        const secret = new Uint8Array(32).fill(7);
        mocks.readCredentials.mockResolvedValue({ token: 'old-token', encryption: { type: 'legacy', secret } });
        mocks.requestDeviceCode.mockResolvedValue({
            device_code: 'device-code',
            user_code: 'ABCD-EFGH',
            verification_uri: 'https://github.com/login/device',
            expires_in: 900,
            interval: 1,
        });
        mocks.pollForToken.mockResolvedValue('new-token');

        await expect(doAuth()).resolves.toMatchObject({ token: 'new-token', encryption: { type: 'legacy', secret } });

        expect(mocks.writeCredentialsLegacy).toHaveBeenCalledWith({ secret, token: 'new-token' });
        expect(mocks.writeCredentialsDataKey).not.toHaveBeenCalled();
        expect(mocks.writeJsonAtomically).not.toHaveBeenCalled();
        expect(mocks.loggerWarn).toHaveBeenCalledWith(expect.stringContaining('continuing auth without profile.json'));
    });
});
