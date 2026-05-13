import axios, { AxiosError } from 'axios';
import type { SessionMessage as WireSessionMessage } from '@slopus/happy-wire';
import type { Config } from './config';
import { updateMachineConnectToken, type Credentials, type PersistedMachineCredentials } from './credentials';
import { DevTunnelsClientProvider } from './tunnel/clientProvider';
import { CONNECT_TOKEN_TTL_MS, CONNECT_TOKEN_REFRESH_SKEW_MS } from './auth';
import {
    decodeBase64,
    encodeBase64,
    decryptBoxBundle,
    decryptWithDataKey,
    decryptLegacy,
    encryptWithDataKey,
    libsodiumEncryptForPublicKey,
    getRandomBytes,
} from './encryption';

// --- Types ---

export type EncryptionVariant = 'legacy' | 'dataKey';

export type RecordEncryption = {
    key: Uint8Array;
    variant: EncryptionVariant;
};

export type SessionEncryption = RecordEncryption;

export type RawSession = {
    id: string;
    seq: number;
    createdAt: number;
    updatedAt: number;
    active: boolean;
    activeAt: number;
    metadata: string;
    metadataVersion: number;
    agentState: string | null;
    agentStateVersion: number;
    dataEncryptionKey: string | null;
};

export type DecryptedSession = {
    id: string;
    seq: number;
    createdAt: number;
    updatedAt: number;
    active: boolean;
    activeAt: number;
    metadata: unknown;
    agentState: unknown | null;
    dataEncryptionKey: string | null;
    encryption: RecordEncryption;
};

export type MachineTunnel = {
    machineId: string;
    tunnelUrl: string;
};

export type MachineSummary = MachineTunnel & {
    id: string;
    hostname?: string;
    tunnelPort?: number;
    loopbackPort?: number;
    lastSeenAt?: number | string;
    owner?: string;
};

type MachineSelfState = {
    machineId: string;
    hostname: string;
    tunnelPort: number;
    loopbackPort: number;
    tunnelUrl: string;
    lastSeenAt: number | string;
    owner: string;
};

export type RefreshedMachineTunnel = {
    tunnelUrl: string;
    connectToken: string;
};

const connectTokenRefreshes = new Map<string, Promise<{ connectToken: string; connectTokenExpiry: number }>>();

export type RawMessage = WireSessionMessage;

export type DecryptedMessage = {
    id: string;
    seq: number;
    content: unknown;
    localId: string | null;
    createdAt: number;
    updatedAt: number;
};

// --- Session encryption key resolution ---

function resolveRecordEncryption(
    record: { id: string; dataEncryptionKey: string | null },
    creds: Credentials,
    recordLabel: string,
): RecordEncryption {
    if (record.dataEncryptionKey) {
        const encrypted = decodeBase64(record.dataEncryptionKey);
        // Strip version byte (first byte)
        const bundle = encrypted.slice(1);
        const sessionKey = decryptBoxBundle(bundle, creds.contentKeyPair.secretKey);
        if (!sessionKey) {
            throw new Error(`Failed to decrypt ${recordLabel} key for ${recordLabel} ${record.id}`);
        }
        return { key: sessionKey, variant: 'dataKey' };
    }
    // Legacy: use account secret directly
    return { key: creds.secret, variant: 'legacy' };
}

export function resolveSessionEncryption(
    session: RawSession,
    creds: Credentials,
): SessionEncryption {
    return resolveRecordEncryption(session, creds, 'session');
}

// --- Decrypt helpers ---

function decryptField(
    encrypted: string | null,
    encryption: RecordEncryption,
): unknown | null {
    if (!encrypted) return null;
    const data = decodeBase64(encrypted);
    if (encryption.variant === 'dataKey') {
        return decryptWithDataKey(data, encryption.key);
    }
    return decryptLegacy(data, encryption.key);
}

function decryptSession(raw: RawSession, creds: Credentials): DecryptedSession {
    const encryption = resolveSessionEncryption(raw, creds);
    return {
        id: raw.id,
        seq: raw.seq,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
        active: raw.active,
        activeAt: raw.activeAt,
        metadata: decryptField(raw.metadata, encryption),
        agentState: decryptField(raw.agentState, encryption),
        dataEncryptionKey: raw.dataEncryptionKey,
        encryption,
    };
}

// --- Error handling ---

export class MachineNotKnownError extends Error {
    constructor(machineId: string) {
        super(`Machine ${machineId} is not known. Run 'happy-agent auth login' to refresh machine credentials.`);
        this.name = 'MachineNotKnownError';
    }
}

export class InvalidTunnelUrlError extends Error {
    constructor(tunnelUrl: string) {
        super(`Invalid tunnel URL: ${tunnelUrl}`);
        this.name = 'InvalidTunnelUrlError';
    }
}

export class RefreshFailedError extends Error {
    constructor(message = "Failed to refresh machine tunnel. Run 'happy-agent auth login'") {
        super(message);
        this.name = 'RefreshFailedError';
    }
}

function handleApiError(err: unknown, context: string): never {
    if (err instanceof AxiosError) {
        const status = err.response?.status;
        if (status === 401) {
            throw new Error('Authentication expired. Run `happy-agent auth login` to re-authenticate.');
        }
        if (status === 403) {
            throw new Error(`Forbidden: ${context}. Check your account permissions.`);
        }
        if (status === 404) {
            throw new Error(`Not found: ${context}`);
        }
        if (status && status >= 400 && status < 500) {
            const detail = err.response?.data ? `: ${JSON.stringify(err.response.data)}` : '';
            throw new Error(`Request failed (${status})${detail}`);
        }
        if (status && status >= 500) {
            throw new Error(`Server error (${status}): ${context}`);
        }
        throw new Error(`Request failed: ${err.message}`);
    }
    throw err;
}

function authHeaders(creds: Credentials): Record<string, string> {
    return {
        Authorization: `Bearer ${creds.token}`,
        'X-Happy-Client': 'cli-control-plane/0.1.0',
    };
}

// --- API functions ---

export function discoverMachineTunnels(creds: Credentials): MachineTunnel[] {
    return creds.machines.map(machine => ({
        machineId: machine.machineId,
        tunnelUrl: machine.tunnelUrl,
    }));
}

function hasFreshConnectToken(machine: PersistedMachineCredentials): machine is PersistedMachineCredentials & Required<Pick<PersistedMachineCredentials, 'connectToken' | 'connectTokenExpiry'>> {
    return Boolean(machine.connectToken) && typeof machine.connectTokenExpiry === 'number' && machine.connectTokenExpiry - Date.now() > CONNECT_TOKEN_REFRESH_SKEW_MS;
}

async function ensureMachineConnectToken(config: Config, creds: Credentials, machine: PersistedMachineCredentials): Promise<string> {
    if (hasFreshConnectToken(machine)) {
        return machine.connectToken;
    }
    const existing = connectTokenRefreshes.get(machine.machineId);
    if (existing) {
        return (await existing).connectToken;
    }
    const next = (async () => {
        if (!machine.tunnelId) {
            throw new Error(`Machine ${machine.machineId} is missing tunnelId. Run 'happy-agent auth login' to refresh credentials.`);
        }
        const provider = new DevTunnelsClientProvider({
            credentials: {
                getDevTunnelsToken: async () => creds.devTunnelsAccess ?? process.env.HAPPY_DEVTUNNELS_TOKEN ?? null,
                setDevTunnelsToken: async () => undefined,
            },
        });
        const connectToken = await provider.getConnectToken(machine.tunnelId);
        const connectTokenExpiry = Date.now() + CONNECT_TOKEN_TTL_MS;
        await updateMachineConnectToken(config, machine.machineId, { connectToken, connectTokenExpiry });
        return { connectToken, connectTokenExpiry };
    })().finally(() => {
        if (connectTokenRefreshes.get(machine.machineId) === next) {
            connectTokenRefreshes.delete(machine.machineId);
        }
    });
    connectTokenRefreshes.set(machine.machineId, next);
    return (await next).connectToken;
}

export async function listKnownMachines(
    config: Config,
    creds: Credentials,
): Promise<MachineSummary[]> {
    return Promise.all(creds.machines.map(async machine => {
        const base: MachineSummary = {
            id: machine.machineId,
            machineId: machine.machineId,
            tunnelUrl: machine.tunnelUrl,
        };
        try {
            const connectToken = await ensureMachineConnectToken(config, creds, machine);
            const resp = await axios.get(`${machine.tunnelUrl}/v2/me/machine`, {
                headers: {
                    'X-Tunnel-Authorization': `tunnel ${connectToken}`,
                    'X-Happy-Client': 'cli-control-plane/0.1.0',
                },
                timeout: 10_000,
            });
            const state = resp.data as MachineSelfState;
            if (state.machineId !== machine.machineId) {
                return base;
            }
            return {
                ...base,
                tunnelUrl: state.tunnelUrl || machine.tunnelUrl,
                hostname: state.hostname,
                tunnelPort: state.tunnelPort,
                loopbackPort: state.loopbackPort,
                lastSeenAt: state.lastSeenAt,
                owner: state.owner,
            };
        } catch {
            return base;
        }
    }));
}

export async function refreshMachineTunnel(
    config: Config,
    creds: Credentials,
    machineId: string,
): Promise<RefreshedMachineTunnel> {
    if (Math.floor(Date.now() / 1000) >= creds.deviceCodeExpiresAt) {
        throw new RefreshFailedError("Device code expired. Run 'happy-agent auth login'");
    }

    const target = creds.machines.find(machine => machine.machineId === machineId);
    if (!target) {
        throw new MachineNotKnownError(machineId);
    }

    try {
        new URL(target.tunnelUrl);
    } catch {
        throw new InvalidTunnelUrlError(target.tunnelUrl);
    }

    const connectToken = await ensureMachineConnectToken(config, creds, target);
    return {
        tunnelUrl: target.tunnelUrl,
        connectToken,
    };
}

export async function listSessions(
    config: Config,
    creds: Credentials,
): Promise<DecryptedSession[]> {
    let data: { sessions: RawSession[] };
    try {
        const resp = await axios.get(`${config.legacyServerUrl}/v1/sessions`, {
            headers: authHeaders(creds),
        });
        data = resp.data as { sessions: RawSession[] };
    } catch (err) {
        handleApiError(err, 'listing sessions');
    }

    return data.sessions.map(raw => decryptSession(raw, creds));
}

export async function listActiveSessions(
    config: Config,
    creds: Credentials,
): Promise<DecryptedSession[]> {
    let data: { sessions: RawSession[] };
    try {
        const resp = await axios.get(`${config.legacyServerUrl}/v2/sessions/active`, {
            headers: authHeaders(creds),
        });
        data = resp.data as { sessions: RawSession[] };
    } catch (err) {
        handleApiError(err, 'listing active sessions');
    }

    return data.sessions.map(raw => decryptSession(raw, creds));
}

export async function createSession(
    config: Config,
    creds: Credentials,
    opts: { tag: string; metadata: unknown },
): Promise<DecryptedSession & { sessionKey: Uint8Array }> {
    // Generate random 32-byte per-session AES key
    const sessionKey = getRandomBytes(32);

    // Encrypt session key with content public key, prepend version byte
    const encryptedKey = libsodiumEncryptForPublicKey(sessionKey, creds.contentKeyPair.publicKey);
    const withVersion = new Uint8Array(1 + encryptedKey.length);
    withVersion[0] = 0x00; // version byte
    withVersion.set(encryptedKey, 1);
    const dataEncryptionKeyBase64 = encodeBase64(withVersion);

    // Encrypt metadata with the session key
    const encryptedMetadata = encryptWithDataKey(opts.metadata, sessionKey);
    const metadataBase64 = encodeBase64(encryptedMetadata);

    let data: { session: RawSession };
    try {
        const resp = await axios.post(
            `${config.legacyServerUrl}/v1/sessions`,
            {
                tag: opts.tag,
                metadata: metadataBase64,
                dataEncryptionKey: dataEncryptionKeyBase64,
            },
            { headers: authHeaders(creds) },
        );
        data = resp.data as { session: RawSession };
    } catch (err) {
        handleApiError(err, 'creating session');
    }

    const decrypted = decryptSession(data.session, creds);
    return { ...decrypted, sessionKey: decrypted.encryption.key };
}

export async function deleteSession(
    config: Config,
    creds: Credentials,
    sessionId: string,
): Promise<void> {
    try {
        await axios.delete(`${config.legacyServerUrl}/v1/sessions/${encodeURIComponent(sessionId)}`, {
            headers: authHeaders(creds),
        });
    } catch (err) {
        handleApiError(err, `deleting session ${sessionId}`);
    }
}

export async function getSessionMessages(
    config: Config,
    creds: Credentials,
    sessionId: string,
    encryption: SessionEncryption,
): Promise<DecryptedMessage[]> {
    let data: { messages: RawMessage[] };
    try {
        const resp = await axios.get(
            `${config.legacyServerUrl}/v1/sessions/${encodeURIComponent(sessionId)}/messages`,
            { headers: authHeaders(creds) },
        );
        data = resp.data as { messages: RawMessage[] };
    } catch (err) {
        handleApiError(err, `session ${sessionId} messages`);
    }

    return data.messages.map(msg => ({
        id: msg.id,
        seq: msg.seq,
        content: decryptField(msg.content.c, encryption),
        localId: msg.localId ?? null,
        createdAt: msg.createdAt,
        updatedAt: msg.updatedAt,
    }));
}
