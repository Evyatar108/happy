import { existsSync, mkdirSync, openSync, readFileSync, unlinkSync, closeSync, fsyncSync, renameSync, chmodSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { deriveContentKeyPair, decodeBase64, encodeBase64 } from './encryption';
import type { Config } from './config';

export class LegacyCredentialsRequired extends Error {
    constructor() {
        super('Legacy credentials are required for this command. Run `happy-agent auth login` from an existing legacy install first.');
        this.name = 'LegacyCredentialsRequired';
    }
}

export class CredentialsNotFoundError extends Error {
    constructor() {
        super('Not authenticated. Run `happy-agent auth login` first.');
        this.name = 'CredentialsNotFoundError';
    }
}

export type PersistedMachineCredentials = {
    machineId: string;
    tunnelId?: string;
    tunnelUrl: string;
    tunnelClaim: string;
    connectToken?: string;
    connectTokenExpiry?: number;
    accountId: number;
    ed25519PublicKey: string;
    x25519PublicKey: string;
    ed25519Fingerprint?: string;
};

export type PersistedDiscoveredMachine = {
    tunnelId: string;
    tunnelUrl: string;
    displayName?: string;
    isOnline?: boolean;
};

export type PersistedCredentials = {
    githubLogin: string;
    devTunnelsAccess?: string;
    deviceCode: string;
    deviceCodeExpiresAt: number;
    pairingBaseUrl: string;
    machines: PersistedMachineCredentials[];
    discoveredMachines?: PersistedDiscoveredMachine[];
    legacyToken?: string;
    legacySecret?: string;
};

export type Credentials = PersistedCredentials & {
    readonly token: string;
    readonly secret: Uint8Array;
    readonly contentKeyPair: {
        publicKey: Uint8Array;
        secretKey: Uint8Array;
    };
};

function toCredentials(persisted: PersistedCredentials): Credentials {
    const adapter = { ...persisted } as Credentials;
    Object.defineProperties(adapter, {
        token: {
            enumerable: false,
            get() {
                if (!persisted.legacyToken) throw new LegacyCredentialsRequired();
                return persisted.legacyToken;
            },
        },
        secret: {
            enumerable: false,
            get() {
                if (!persisted.legacySecret) throw new LegacyCredentialsRequired();
                return decodeBase64(persisted.legacySecret);
            },
        },
        contentKeyPair: {
            enumerable: false,
            get() {
                if (!persisted.legacySecret) throw new LegacyCredentialsRequired();
                return deriveContentKeyPair(decodeBase64(persisted.legacySecret));
            },
        },
    });
    return adapter;
}

export function loadCredentials(config: Config): Credentials {
    if (!existsSync(config.credentialPath)) {
        throw new CredentialsNotFoundError();
    }
    const persisted = JSON.parse(readFileSync(config.credentialPath, 'utf-8')) as PersistedCredentials;
    return toCredentials(persisted);
}

export async function saveCredentials(config: Config, persisted: PersistedCredentials): Promise<void> {
    mkdirSync(dirname(config.credentialPath), { recursive: true, mode: 0o700 });
    const tmpPath = `${config.credentialPath}.${process.pid}.${Date.now()}.tmp`;
    const data = `${JSON.stringify(persisted, null, 2)}\n`;

    writeFileSync(tmpPath, data, { flag: 'wx', mode: 0o600 });

    const fd = openSync(tmpPath, 'r');
    try {
        fsyncBestEffort(fd);
    } finally {
        closeSync(fd);
    }

    if (process.platform !== 'win32') {
        chmodSync(tmpPath, 0o600);
    }

    for (let attempt = 1; ; attempt++) {
        try {
            renameSync(tmpPath, config.credentialPath);
            break;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EBUSY' || attempt >= 3 || process.platform !== 'win32') {
                throw error;
            }
            await sleep(50 * attempt);
        }
    }

    try {
        const dirFd = openSync(dirname(config.credentialPath), 'r');
        try {
            fsyncBestEffort(dirFd);
        } finally {
            closeSync(dirFd);
        }
    } catch {
        // Directory fsync is best-effort on platforms/filesystems that support it.
    }
}

function fsyncBestEffort(fd: number): void {
    try {
        fsyncSync(fd);
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (process.platform !== 'win32' || (code !== 'EINVAL' && code !== 'EPERM')) {
            throw error;
        }
    }
}

export async function deleteCredentials(config: Config): Promise<void> {
    try {
        unlinkSync(config.credentialPath);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
}

export function legacyCredentialsToPersisted(token: string, secret: Uint8Array): Pick<PersistedCredentials, 'legacyToken' | 'legacySecret'> {
    return { legacyToken: token, legacySecret: encodeBase64(secret) };
}

export async function updateMachineConnectToken(config: Config, machineId: string, patch: { connectToken: string; connectTokenExpiry: number }): Promise<boolean> {
    const credentials = loadCredentials(config);
    let found = false;
    const machines = credentials.machines.map(machine => {
        if (machine.machineId !== machineId) {
            return machine;
        }
        found = true;
        return { ...machine, ...patch };
    });
    if (!found) {
        return false;
    }
    await saveCredentials(config, { ...credentials, machines });
    return true;
}
