import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { encodeBase64, getRandomBytes } from './encryption';
import { loadCredentials, saveCredentials, type PersistedCredentials } from './credentials';
import type { Config } from './config';

vi.mock('axios', () => {
    const fn = { get: vi.fn(), post: vi.fn() };
    return {
        default: fn,
        AxiosError: class AxiosError extends Error {
            response?: { status: number };
            constructor(message: string, opts?: { response?: { status: number } }) {
                super(message);
                this.name = 'AxiosError';
                this.response = opts?.response;
            }
        },
    };
});

import axios from 'axios';
import { authLogin, authLogout, authStatus } from './auth';

const mockedAxios = axios as unknown as {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
};

function makeTestConfig(): Config {
    const homeDir = mkdtempSync(join(tmpdir(), 'happy-agent-auth-test-'));
    return {
        legacyServerUrl: 'https://legacy.example.com',
        pairingBaseUrl: 'https://pairing.example.com',
        homeDir,
        credentialPath: join(homeDir, 'credentials.json'),
    };
}

function machine(overrides: Partial<PersistedCredentials['machines'][number]> = {}): PersistedCredentials['machines'][number] {
    return {
        machineId: 'machine-1',
        tunnelUrl: 'https://machine-1.devtunnels.ms',
        ed25519PublicKey: 'ed',
        x25519PublicKey: 'x',
        ...overrides,
    };
}

describe('auth', () => {
    let config: Config;
    let legacyHome: string;
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
    const originalEnv = { ...process.env };

    beforeEach(() => {
        config = makeTestConfig();
        legacyHome = mkdtempSync(join(tmpdir(), 'happy-agent-legacy-'));
        process.env.HAPPY_HOME_DIR = legacyHome;
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        mockedAxios.get.mockReset();
        mockedAxios.post.mockReset();
        mockedAxios.get.mockResolvedValue({ data: { accessTokens: { connect: 'connect-jwt' } } });
        process.env.HAPPY_DEVTUNNELS_TOKEN = 'ghu-devtunnels';
        vi.useFakeTimers({ now: new Date('2026-05-11T12:00:00.000Z') });
    });

    afterEach(() => {
        vi.useRealTimers();
        rmSync(config.homeDir, { recursive: true, force: true });
        rmSync(legacyHome, { recursive: true, force: true });
        process.env = { ...originalEnv };
        consoleLogSpy.mockRestore();
        consoleWarnSpy.mockRestore();
    });

    describe('authLogin', () => {
        it('uses GitHub device flow and saves audited machine credentials', async () => {
            mkdirSync(legacyHome, { recursive: true });
            const legacySecret = getRandomBytes(32);
            writeFileSync(join(legacyHome, 'agent.key'), JSON.stringify({ token: 'legacy-token', secret: encodeBase64(legacySecret) }));
            mockedAxios.get.mockResolvedValueOnce({
                data: { device_code: 'device-code', user_code: 'ABCD-EFGH', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 1 },
            });
            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    status: 'authorized',
                    githubLogin: 'octocat',
                    machines: [machine()],
                    discoveredMachines: [],
                },
            });

            const promise = authLogin(config);
            await vi.advanceTimersByTimeAsync(1000);
            await promise;

            const creds = loadCredentials(config);
            expect(mockedAxios.get).toHaveBeenCalledWith('https://pairing.example.com/pair/start', expect.any(Object));
            expect(mockedAxios.post).toHaveBeenCalledWith('https://pairing.example.com/pair/status', { device_code: 'device-code' }, expect.any(Object));
            expect(creds.githubLogin).toBe('octocat');
            expect(creds.machines).toHaveLength(1);
            expect(creds.legacyToken).toBe('legacy-token');
            expect(creds.secret).toEqual(legacySecret);
        });

        it('saves credentials without legacy fields when no legacy agent key exists', async () => {
            mockedAxios.get.mockResolvedValueOnce({
                data: { device_code: 'device-code', user_code: 'ABCD-EFGH', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 1 },
            });
            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    status: 'authorized',
                    githubLogin: 'octocat',
                    machines: [machine()],
                    discoveredMachines: [],
                },
            });

            const promise = authLogin(config);
            await vi.advanceTimersByTimeAsync(1000);
            await promise;

            const raw = JSON.parse(readFileSync(config.credentialPath, 'utf-8')) as PersistedCredentials;
            expect(raw.legacyToken).toBeUndefined();
            expect(raw.legacySecret).toBeUndefined();
        });

        it('aborts without writing new credentials when the legacy agent key is malformed', async () => {
            mkdirSync(legacyHome, { recursive: true });
            writeFileSync(join(legacyHome, 'agent.key'), JSON.stringify({ token: 'legacy-token' }));
            mockedAxios.get.mockResolvedValueOnce({
                data: { device_code: 'device-code', user_code: 'ABCD-EFGH', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 1 },
            });
            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    status: 'authorized',
                    githubLogin: 'octocat',
                    machines: [machine()],
                    discoveredMachines: [],
                },
            });

            const assertion = expect(authLogin(config)).rejects.toThrow(`Legacy credentials file ${join(legacyHome, 'agent.key')} is malformed`);
            await vi.advanceTimersByTimeAsync(1000);

            await assertion;
            expect(existsSync(config.credentialPath)).toBe(false);
        });

        it('aborts without writing new credentials when the legacy secret is not valid base64', async () => {
            mkdirSync(legacyHome, { recursive: true });
            writeFileSync(join(legacyHome, 'agent.key'), JSON.stringify({ token: 'legacy-token', secret: 'not-real-base64!!' }));
            mockedAxios.get.mockResolvedValueOnce({
                data: { device_code: 'device-code', user_code: 'ABCD-EFGH', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 1 },
            });
            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    status: 'authorized',
                    githubLogin: 'octocat',
                    machines: [machine()],
                    discoveredMachines: [],
                },
            });

            const assertion = expect(authLogin(config)).rejects.toThrow(`Legacy credentials file ${join(legacyHome, 'agent.key')} is malformed`);
            await vi.advanceTimersByTimeAsync(1000);

            await assertion;
            expect(existsSync(config.credentialPath)).toBe(false);
        });

        it('backs off on polling 429 and resets to the configured interval after a 200 response', async () => {
            const { AxiosError } = await import('axios');
            const rateLimit = new AxiosError('rate limited') as any;
            rateLimit.response = { status: 429 };
            mockedAxios.get.mockResolvedValueOnce({ data: { device_code: 'device-code', user_code: 'CODE', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 1 } });
            mockedAxios.post
                .mockRejectedValueOnce(rateLimit)
                .mockResolvedValueOnce({ data: { status: 'pending' } })
                .mockResolvedValueOnce({ data: { status: 'authorized', githubLogin: 'octocat', machines: [machine()], discoveredMachines: [] } });

            const promise = authLogin(config);
            await vi.advanceTimersByTimeAsync(1000);
            expect(mockedAxios.post).toHaveBeenCalledTimes(1);
            await vi.advanceTimersByTimeAsync(2000);
            expect(mockedAxios.post).toHaveBeenCalledTimes(2);
            await vi.advanceTimersByTimeAsync(1000);
            await promise;

            expect(mockedAxios.post).toHaveBeenCalledTimes(3);
            expect(loadCredentials(config).machines).toHaveLength(1);
        });

        it('skips offline targets before issuing per-target HTTP calls', async () => {
            mockedAxios.get.mockResolvedValueOnce({ data: { device_code: 'device-code', user_code: 'CODE', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 1 } });
            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    status: 'authorized',
                    githubLogin: 'octocat',
                    machines: [],
                    discoveredMachines: [{ tunnelId: 'offline', tunnelUrl: 'https://offline.devtunnels.ms', displayName: 'offline', isOnline: false }],
                },
            });

            const promise = authLogin(config);
            await vi.advanceTimersByTimeAsync(1000);
            await promise;

            expect(mockedAxios.post).toHaveBeenCalledTimes(1);
            expect(consoleWarnSpy).toHaveBeenCalledWith('Skipping offline tunnel: offline');
        });

        it('retries a per-target 429 once and omits the target after a second 429', async () => {
            const { AxiosError } = await import('axios');
            const firstRateLimit = new AxiosError('rate limited') as any;
            firstRateLimit.response = { status: 429 };
            const secondRateLimit = new AxiosError('rate limited') as any;
            secondRateLimit.response = { status: 429 };
            mockedAxios.get.mockResolvedValueOnce({ data: { device_code: 'device-code', user_code: 'CODE', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 1 } });
            mockedAxios.post
                .mockResolvedValueOnce({ data: { status: 'authorized', githubLogin: 'octocat', machines: [], discoveredMachines: [{ tunnelId: 't1', tunnelUrl: 'https://t1.devtunnels.ms', displayName: 't1', isOnline: true }] } })
                .mockRejectedValueOnce(firstRateLimit)
                .mockRejectedValueOnce(secondRateLimit);

            const promise = authLogin(config);
            await vi.advanceTimersByTimeAsync(1000);
            await vi.advanceTimersByTimeAsync(2000);
            await promise;

            expect(consoleWarnSpy).toHaveBeenCalledWith('Skipping rate-limited tunnel https://t1.devtunnels.ms after retry');
            expect(loadCredentials(config).machines).toHaveLength(0);
        });

        it('keeps a per-target tunnel when its one-shot 429 retry succeeds', async () => {
            const { AxiosError } = await import('axios');
            const rateLimit = new AxiosError('rate limited') as any;
            rateLimit.response = { status: 429 };
            mockedAxios.get.mockResolvedValueOnce({ data: { device_code: 'device-code', user_code: 'CODE', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 1 } });
            mockedAxios.post
                .mockResolvedValueOnce({ data: { status: 'authorized', githubLogin: 'octocat', machines: [], discoveredMachines: [{ tunnelId: 't1', tunnelUrl: 'https://t1.devtunnels.ms', displayName: 't1', isOnline: true }] } })
                .mockRejectedValueOnce(rateLimit)
                .mockResolvedValueOnce({ data: { status: 'authorized', githubLogin: 'octocat', machines: [machine({ machineId: 'machine-2' })], discoveredMachines: [] } });

            const promise = authLogin(config);
            await vi.advanceTimersByTimeAsync(1000);
            await vi.advanceTimersByTimeAsync(2000);
            await promise;

            expect(loadCredentials(config).machines.map(item => item.machineId)).toEqual(['machine-2']);
            expect(loadCredentials(config).machines[0]).toMatchObject({
                tunnelId: 't1',
                connectToken: 'connect-jwt',
            });
        });

        it('omits unreachable per-target tunnels with a warning', async () => {
            mockedAxios.get.mockResolvedValueOnce({ data: { device_code: 'device-code', user_code: 'CODE', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 1 } });
            mockedAxios.post
                .mockResolvedValueOnce({ data: { status: 'authorized', githubLogin: 'octocat', machines: [], discoveredMachines: [{ tunnelId: 't1', tunnelUrl: 'https://t1.devtunnels.ms', displayName: 't1', isOnline: true }] } })
                .mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND'));

            const promise = authLogin(config);
            await vi.advanceTimersByTimeAsync(1000);
            await promise;

            expect(loadCredentials(config).machines).toHaveLength(0);
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping unreachable tunnel https://t1.devtunnels.ms: getaddrinfo ENOTFOUND'));
        });

        it('enriches primary machine with tunnelId and connectToken on primary-only login', async () => {
            mockedAxios.get.mockResolvedValueOnce({
                data: { device_code: 'device-code', user_code: 'ABCD-EFGH', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 1 },
            });
            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    status: 'authorized',
                    githubLogin: 'octocat',
                    machines: [machine({ tunnelUrl: 'https://primary-tunnel.devtunnels.ms' })],
                    discoveredMachines: [],
                },
            });

            const promise = authLogin(config);
            await vi.advanceTimersByTimeAsync(1000);
            await promise;

            const creds = loadCredentials(config);
            expect(creds.machines).toHaveLength(1);
            expect(creds.machines[0].tunnelId).toBe('primary-tunnel');
            expect(creds.machines[0].connectToken).toBe('connect-jwt');
            expect(typeof creds.machines[0].connectTokenExpiry).toBe('number');
        });
    });

    describe('authLogout', () => {
        it('deletes new credentials and preserves legacy agent.key', async () => {
            mkdirSync(legacyHome, { recursive: true });
            const legacyPath = join(legacyHome, 'agent.key');
            writeFileSync(legacyPath, JSON.stringify({ token: 'legacy-token', secret: encodeBase64(getRandomBytes(32)) }));
            await saveCredentials(config, { githubLogin: 'octocat', deviceCode: 'device-code', deviceCodeExpiresAt: 1, pairingBaseUrl: config.pairingBaseUrl, machines: [] });

            await authLogout(config);

            expect(existsSync(config.credentialPath)).toBe(false);
            expect(existsSync(legacyPath)).toBe(true);
        });

        it('does not throw when no credentials exist', async () => {
            await expect(authLogout(config)).resolves.toBeUndefined();
        });
    });

    describe('authStatus', () => {
        it('shows persisted device-flow status without adapter getters', async () => {
            await saveCredentials(config, {
                githubLogin: 'octocat',
                deviceCode: 'device-code',
                deviceCodeExpiresAt: Math.floor(Date.now() / 1000) + 60,
                pairingBaseUrl: config.pairingBaseUrl,
                machines: [machine()],
            });

            await authStatus(config);

            const calls = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0]));
            expect(calls).toContain('- GitHub: octocat');
            expect(calls).toContain('- Machines: 1');
            expect(calls).toContain('- Device Code Expires In: 60s');
            expect(calls).toContain('- Has Legacy Credentials: no');
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Legacy credentials were not found'));
        });

        it('shows not authenticated when no credentials exist', async () => {
            await authStatus(config);

            const calls = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0]));
            expect(calls).toContain('- Status: Not authenticated');
        });

        it('prints no QR output', async () => {
            await authStatus(config);
            const joined = consoleLogSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
            expect(joined).not.toContain('QR');
        });
    });
});
