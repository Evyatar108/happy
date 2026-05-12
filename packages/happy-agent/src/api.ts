import axios, { AxiosError } from 'axios';
import type { SessionMessage as WireSessionMessage } from '@slopus/happy-wire';
import type { Config } from './config';
import type { Credentials } from './credentials';
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

export type RawMachine = {
    id: string;
    seq: number;
    createdAt: number;
    updatedAt: number;
    active: boolean;
    activeAt: number;
    metadata: string | null;
    metadataVersion: number;
    daemonState: string | null;
    daemonStateVersion: number;
    dataEncryptionKey: string | null;
};

export type DecryptedMachine = {
    id: string;
    seq: number;
    createdAt: number;
    updatedAt: number;
    active: boolean;
    activeAt: number;
    metadata: unknown | null;
    metadataVersion: number;
    daemonState: unknown | null;
    daemonStateVersion: number;
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

export type RefreshedTunnelClaim = {
    tunnelUrl: string;
    tunnelClaim: string;
    accountId: number;
};

type PairStatusResponse = {
    status: 'pending' | 'slow_down' | 'authorized' | 'expired';
    machines?: Array<{
        machineId: string;
        tunnelUrl: string;
        tunnelClaim: string;
        accountId?: number;
    }>;
};

type TunnelClaimPayload = {
    accountId?: unknown;
    iat?: unknown;
    exp?: unknown;
    jti?: unknown;
};

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

export function resolveMachineEncryption(
    machine: RawMachine,
    creds: Credentials,
): RecordEncryption {
    return resolveRecordEncryption(machine, creds, 'machine');
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

function decryptMachine(raw: RawMachine, creds: Credentials): DecryptedMachine {
    const encryption = resolveMachineEncryption(raw, creds);
    return {
        id: raw.id,
        seq: raw.seq,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
        active: raw.active,
        activeAt: raw.activeAt,
        metadata: decryptField(raw.metadata, encryption),
        metadataVersion: raw.metadataVersion,
        daemonState: decryptField(raw.daemonState, encryption),
        daemonStateVersion: raw.daemonStateVersion,
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
    constructor(message = "Failed to refresh tunnel claim. Run 'happy-agent auth login'") {
        super(message);
        this.name = 'RefreshFailedError';
    }
}

export class RateLimitedError extends Error {
    constructor() {
        super('Tunnel claim refresh was rate limited. Retry in 60s.');
        this.name = 'RateLimitedError';
    }
}

export class NetworkError extends Error {
    constructor(message: string) {
        super(`Network error refreshing tunnel claim: ${message}`);
        this.name = 'NetworkError';
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

function decodeTunnelClaimPayload(tunnelClaim: string): TunnelClaimPayload {
    const envelope = JSON.parse(Buffer.from(tunnelClaim, 'base64url').toString('utf-8')) as { p?: unknown; s?: unknown };
    if (typeof envelope.p !== 'string' || typeof envelope.s !== 'string') {
        throw new Error('invalid envelope');
    }
    return JSON.parse(Buffer.from(envelope.p, 'base64url').toString('utf-8')) as TunnelClaimPayload;
}

function accountIdFromTunnelClaim(tunnelClaim: string): number {
    const payload = decodeTunnelClaimPayload(tunnelClaim);
    if (typeof payload.accountId !== 'number') throw new Error('accountId missing');
    if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number' || payload.exp - payload.iat > 3600) throw new Error('invalid lifetime');
    if (payload.exp <= Math.floor(Date.now() / 1000)) throw new Error('claim expired');
    if (typeof payload.jti !== 'string' || payload.jti.length === 0) throw new Error('jti missing');
    return payload.accountId;
}

// --- API functions ---

export function discoverMachineTunnels(creds: Credentials): MachineTunnel[] {
    return creds.machines.map(machine => ({
        machineId: machine.machineId,
        tunnelUrl: machine.tunnelUrl,
    }));
}

export async function listKnownMachines(
    config: Config,
    creds: Credentials,
): Promise<MachineSummary[]> {
    void config;
    return Promise.all(creds.machines.map(async machine => {
        const base: MachineSummary = {
            id: machine.machineId,
            machineId: machine.machineId,
            tunnelUrl: machine.tunnelUrl,
        };
        try {
            const resp = await axios.get(`${machine.tunnelUrl}/v2/me/machine`, {
                headers: {
                    'X-Tunnel-Authorization': `tunnel ${machine.tunnelClaim}`,
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

export async function refreshTunnelClaim(
    config: Config,
    creds: Credentials,
    machineId: string,
): Promise<RefreshedTunnelClaim> {
    void config;
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

    let response: PairStatusResponse;
    try {
        const resp = await axios.post(`${target.tunnelUrl}/pair/status`, {
            device_code: creds.deviceCode,
        }, {
            headers: { 'X-Happy-Client': 'cli-control-plane/0.1.0' },
            timeout: 30_000,
        });
        response = resp.data as PairStatusResponse;
    } catch (error) {
        if (error instanceof AxiosError) {
            if (error.response?.status === 401) throw new RefreshFailedError();
            if (error.response?.status === 429) throw new RateLimitedError();
            throw new NetworkError(error.message);
        }
        throw new NetworkError(error instanceof Error ? error.message : String(error));
    }

    if (response.status === 'expired') {
        throw new RefreshFailedError("Device code expired. Run 'happy-agent auth login'");
    }
    if (response.status !== 'authorized' || !response.machines?.[0]) {
        throw new RefreshFailedError(`Unexpected tunnel refresh status: ${response.status}`);
    }

    const refreshed = response.machines[0];
    if (refreshed.machineId !== machineId) {
        throw new RefreshFailedError(`Pair status returned machine ${refreshed.machineId}, expected ${machineId}`);
    }
    try {
        new URL(refreshed.tunnelUrl);
    } catch {
        throw new InvalidTunnelUrlError(refreshed.tunnelUrl);
    }
    return {
        tunnelUrl: refreshed.tunnelUrl,
        tunnelClaim: refreshed.tunnelClaim,
        accountId: accountIdFromTunnelClaim(refreshed.tunnelClaim),
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
