import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from './config';

describe('config', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        delete process.env.HAPPY_SERVER_URL;
        delete process.env.HAPPY_PAIRING_URL;
        delete process.env.HAPPY_AGENT_HOME_DIR;
        delete process.env.HAPPY_HOME_DIR;
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        process.env = { ...originalEnv };
        vi.restoreAllMocks();
    });

    describe('defaults', () => {
        it('uses default legacy server and pairing URLs', () => {
            const config = loadConfig();
            expect(config.legacyServerUrl).toBe('https://api.cluster-fluster.com');
            expect(config.pairingBaseUrl).toBe('https://api.cluster-fluster.com');
        });

        it('uses default agent home directory', () => {
            const config = loadConfig();
            expect(config.homeDir).toBe(join(homedir(), '.happy-agent'));
        });

        it('derives credential path from agent home directory', () => {
            const config = loadConfig();
            expect(config.credentialPath).toBe(join(homedir(), '.happy-agent', 'credentials.json'));
        });
    });

    describe('env var overrides', () => {
        it('maps HAPPY_SERVER_URL to legacyServerUrl', () => {
            process.env.HAPPY_SERVER_URL = 'https://custom-server.example.com/';
            const config = loadConfig();
            expect(config.legacyServerUrl).toBe('https://custom-server.example.com');
            expect(config.pairingBaseUrl).toBe('https://custom-server.example.com');
        });

        it('maps HAPPY_PAIRING_URL to pairingBaseUrl', () => {
            process.env.HAPPY_SERVER_URL = 'https://legacy.example.com';
            process.env.HAPPY_PAIRING_URL = 'https://pairing.example.com/';
            const config = loadConfig();
            expect(config.legacyServerUrl).toBe('https://legacy.example.com');
            expect(config.pairingBaseUrl).toBe('https://pairing.example.com');
        });

        it('maps HAPPY_AGENT_HOME_DIR to the new credentials root', () => {
            process.env.HAPPY_AGENT_HOME_DIR = '/tmp/custom-happy-agent';
            const config = loadConfig();
            expect(config.homeDir).toBe('/tmp/custom-happy-agent');
            expect(config.credentialPath).toBe(join('/tmp/custom-happy-agent', 'credentials.json'));
        });

        it('does not use HAPPY_HOME_DIR for the new credentials path', () => {
            process.env.HAPPY_HOME_DIR = '/tmp/legacy-happy';
            const config = loadConfig();
            expect(config.homeDir).toBe(join(homedir(), '.happy-agent'));
            expect(config.credentialPath).toBe(join(homedir(), '.happy-agent', 'credentials.json'));
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('HAPPY_HOME_DIR is deprecated'));
        });
    });
});
