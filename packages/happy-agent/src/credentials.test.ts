import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { deleteCredentials, loadCredentials, saveCredentials, updateMachineConnectToken, CredentialsNotFoundError, LegacyCredentialsRequired, type PersistedCredentials } from './credentials';
import { getRandomBytes, deriveContentKeyPair, encodeBase64 } from './encryption';
import type { Config } from './config';

function makeTestConfig(): Config {
    const homeDir = mkdtempSync(join(tmpdir(), 'happy-agent-test-'));
    return {
        legacyServerUrl: 'https://api.cluster-fluster.com',
        pairingBaseUrl: 'https://api.cluster-fluster.com',
        homeDir,
        credentialPath: join(homeDir, 'credentials.json'),
    };
}

function makePersisted(secret = getRandomBytes(32)): PersistedCredentials {
    return {
        githubLogin: 'octocat',
        deviceCode: 'device-code',
        deviceCodeExpiresAt: Math.floor(Date.now() / 1000) + 900,
        pairingBaseUrl: 'https://api.cluster-fluster.com',
        machines: [{
            machineId: 'machine-1',
            tunnelId: 'tunnel-1',
            tunnelUrl: 'https://machine-1.devtunnels.ms',
            connectToken: 'connect-jwt',
            connectTokenExpiry: 123456,
            ed25519PublicKey: 'ed',
            x25519PublicKey: 'x',
        }],
        legacyToken: 'test-token',
        legacySecret: encodeBase64(secret),
    };
}

describe('credentials', () => {
    let config: Config;

    beforeEach(() => {
        config = makeTestConfig();
    });

    afterEach(() => {
        rmSync(config.homeDir, { recursive: true, force: true });
    });

    it('saves and loads persisted credentials', async () => {
        const persisted = makePersisted();

        await saveCredentials(config, persisted);
        const creds = loadCredentials(config);

        expect(creds.githubLogin).toBe('octocat');
        expect(creds.machines).toHaveLength(1);
        expect(creds.token).toBe('test-token');
        expect(creds.secret).toEqual(new Uint8Array(Buffer.from(persisted.legacySecret!, 'base64')));
    });

    it('derives contentKeyPair from legacySecret', async () => {
        const secret = getRandomBytes(32);
        await saveCredentials(config, makePersisted(secret));

        const creds = loadCredentials(config);
        const expectedKeyPair = deriveContentKeyPair(secret);

        expect(creds.contentKeyPair.publicKey).toEqual(expectedKeyPair.publicKey);
        expect(creds.contentKeyPair.secretKey).toEqual(expectedKeyPair.secretKey);
    });

    it('stores credentials as raw persisted JSON', async () => {
        const persisted = makePersisted();
        await saveCredentials(config, persisted);

        const raw = JSON.parse(readFileSync(config.credentialPath, 'utf-8'));
        expect(raw).toEqual(persisted);
    });

    it('loads legacy machine JSON without optional connect-token fields', async () => {
        const persisted = makePersisted();
        delete persisted.machines[0].tunnelId;
        delete persisted.machines[0].connectToken;
        delete persisted.machines[0].connectTokenExpiry;
        await saveCredentials(config, persisted);

        const creds = loadCredentials(config);

        expect(creds.machines[0].tunnelId).toBeUndefined();
        expect(creds.machines[0].connectToken).toBeUndefined();
    });

    it('updates one machine connect token through the atomic credential path', async () => {
        const persisted = makePersisted();
        persisted.machines.push({
            ...persisted.machines[0],
            machineId: 'machine-2',
            tunnelId: 'tunnel-2',
            tunnelUrl: 'https://machine-2.devtunnels.ms',
            connectToken: 'old-2',
            connectTokenExpiry: 1,
        });
        await saveCredentials(config, persisted);

        await expect(updateMachineConnectToken(config, 'machine-2', { connectToken: 'new-2', connectTokenExpiry: 999 })).resolves.toBe(true);

        const updated = loadCredentials(config);
        expect(updated.machines[0]).toEqual(persisted.machines[0]);
        expect(updated.machines[1]).toMatchObject({ connectToken: 'new-2', connectTokenExpiry: 999 });
    });

    it('returns false when updating a missing machine connect token', async () => {
        const persisted = makePersisted();
        await saveCredentials(config, persisted);

        await expect(updateMachineConnectToken(config, 'missing', { connectToken: 'new', connectTokenExpiry: 999 })).resolves.toBe(false);

        expect(loadCredentials(config).machines).toEqual(persisted.machines);
    });

    it('creates parent directory if missing', async () => {
        const deepConfig: Config = {
            ...config,
            credentialPath: join(config.homeDir, 'nested', 'dir', 'credentials.json'),
        };

        await saveCredentials(deepConfig, makePersisted());
        expect(existsSync(deepConfig.credentialPath)).toBe(true);
    });

    it('uses 0600 mode on POSIX', async () => {
        await saveCredentials(config, makePersisted());
        if (process.platform !== 'win32') {
            expect(statSync(config.credentialPath).mode & 0o777).toBe(0o600);
        }
    });

    it('throws a typed error when the credential file is missing', () => {
        expect(() => loadCredentials(config)).toThrow(CredentialsNotFoundError);
    });

    it('deletes credentials idempotently', async () => {
        await saveCredentials(config, makePersisted());
        expect(existsSync(config.credentialPath)).toBe(true);

        await deleteCredentials(config);
        await deleteCredentials(config);

        expect(existsSync(config.credentialPath)).toBe(false);
    });

    it('throws LegacyCredentialsRequired when legacy fields are absent', async () => {
        const persisted = makePersisted();
        delete persisted.legacyToken;
        delete persisted.legacySecret;
        await saveCredentials(config, persisted);

        const creds = loadCredentials(config);
        expect(() => creds.token).toThrow(LegacyCredentialsRequired);
        expect(() => creds.secret).toThrow(LegacyCredentialsRequired);
        expect(() => creds.contentKeyPair).toThrow(LegacyCredentialsRequired);
    });
});
