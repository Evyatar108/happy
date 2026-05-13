import { io, Socket } from 'socket.io-client';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { AuthCredentials, TokenStorage } from '@/auth/tokenStorage';
import { storage } from './storage';
import { tunnelFetch } from '@/auth/machineAuth';
import { buildTunnelSocketOptions } from './socketOptions';
import { localizeSessionPath, parseCompositeSessionId, MachineSessionRef } from './machineSessionId';
import {
    SessionMessageRangeRequestSchema,
    SessionMessageRangeResponseSchema,
    type SessionMessageRangeRequest,
    type SessionMessageRangeResponse,
} from '@slopus/happy-wire';

export function getHappyClientId(): string {
    let platform: string = Platform.OS;
    if (platform === 'web' && typeof window !== 'undefined' && '__TAURI__' in window) {
        platform = 'desktop';
    }
    const version = Constants.expoConfig?.version || '0.0.0';
    return `${platform}/${version}`;
}

export interface SyncSocketConfig {
    endpoint: string;
    credentials: AuthCredentials;
}

export interface SyncSocketState {
    isConnected: boolean;
    connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
    lastError: Error | null;
}

export type SyncSocketStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export type SyncSocketListener = (state: SyncSocketState) => void;

interface MachineConnection {
    socket: Socket | null;
    config: SyncSocketConfig;
    status: SyncSocketStatus;
    intentionalDisconnect: boolean;
    hasConnected: boolean;
    firstConnectWaiters: Array<() => void>;
}

type MessageHandler = (data: any, machineId: string) => void;

/**
 * Routing scope for socket / HTTP operations scoped to a specific session.
 *
 * The scope parses the (possibly composite) session id once at construction time
 * and exposes the parsed {@link MachineSessionRef} via `ref`. Every method routes
 * to `ref.machineId`. Callers writing paths or payloads that need the bare local
 * session id MUST read it from `this.ref.localSessionId` rather than re-using
 * the caller-side composite id — that is the invariant that prevents the
 * composite-id-in-payload bug class.
 */
export class SessionScope {
    constructor(
        private readonly api: ApiSocket,
        readonly ref: MachineSessionRef,
    ) {}

    /**
     * HTTP request to the session's machine. The path may contain either the
     * bare local id or the composite id; `localizeSessionPath` rewrites
     * `/sessions/<machineId>:` segments into `/sessions/` so the server sees
     * the bare id regardless.
     */
    async request(path: string, opts?: RequestInit): Promise<Response> {
        return this.api._requestForMachine(this.ref.machineId, localizeSessionPath(path, this.ref.machineId), opts);
    }

    /**
     * Session-scoped RPC: server routes by `${localSessionId}:${method}`.
     */
    async rpc<R, A = unknown>(method: string, params: A): Promise<R> {
        return this.api._dispatchSessionRpc(this.ref, method, params);
    }

    /**
     * Machine-scoped RPC delivered to the session's machine. The server routes
     * by `${machineId}:${method}`. Use this for commands that are machine-scoped
     * on the daemon (`resume-happy-session`, `fork-into-worktree`, ...) but whose
     * routing target is determined by which machine owns a particular session.
     * Caller-supplied params that reference the session MUST use
     * `this.ref.localSessionId`.
     */
    async machineRpc<R, A = unknown>(method: string, params: A): Promise<R> {
        return this.api._dispatchMachineRpc(this.ref.machineId, method, params);
    }

    async emitWithAck<T = any>(event: string, data: unknown): Promise<T> {
        return this.api._emitWithAck(this.ref.machineId, event, data);
    }

    send(event: string, data: unknown): boolean {
        return this.api._send(this.ref.machineId, event, data);
    }
}

/**
 * Routing scope for socket / HTTP operations targeting a specific machine.
 * Used for machine-level commands and for operations targeting the primary
 * machine when no other routing hint is available.
 */
export class MachineScope {
    constructor(
        private readonly api: ApiSocket,
        readonly machineId: string,
    ) {}

    async request(path: string, opts?: RequestInit): Promise<Response> {
        return this.api._requestForMachine(this.machineId, path, opts);
    }

    /**
     * Machine-scoped RPC: server routes by `${machineId}:${method}`.
     */
    async rpc<R, A = unknown>(method: string, params: A): Promise<R> {
        return this.api._dispatchMachineRpc(this.machineId, method, params);
    }

    async emitWithAck<T = any>(event: string, data: unknown): Promise<T> {
        return this.api._emitWithAck(this.machineId, event, data);
    }

    send(event: string, data: unknown): boolean {
        return this.api._send(this.machineId, event, data);
    }
}

class ApiSocket {
    private connections: Map<string, MachineConnection> = new Map();
    private primaryMachineId: string | null = null;
    private messageHandlers: Map<string, MessageHandler> = new Map();
    private reconnectedListeners: Set<(machineId: string) => void> = new Set();
    private statusListeners: Set<(status: SyncSocketStatus) => void> = new Set();
    private machineDisconnectListeners: Set<(machineId: string, lastSeenAt: number) => void> = new Set();
    private deviceCodeExpiredListeners: Set<(machineId: string) => void> = new Set();
    private currentStatus: SyncSocketStatus = 'disconnected';

    async initialize(config: SyncSocketConfig) {
        await this.initializeMany([config]);
    }

    async initializeMany(items: SyncSocketConfig[]) {
        for (const config of items) {
            const machineId = config.credentials.machineId;
            const existing = this.connections.get(machineId);
            if (existing) {
                existing.config = config;
                continue;
            }
            this.connections.set(machineId, {
                socket: null,
                config,
                status: 'disconnected',
                intentionalDisconnect: false,
                hasConnected: false,
                firstConnectWaiters: [],
            });
            if (!this.primaryMachineId) {
                this.primaryMachineId = machineId;
            }
        }
        await this.connect();
    }

    async appendMachine(config: SyncSocketConfig, timeoutMs = 15_000): Promise<void> {
        const machineId = config.credentials.machineId;
        const existing = this.connections.get(machineId);
        if (existing) {
            existing.config = config;
        } else {
            this.connections.set(machineId, {
                socket: null,
                config,
                status: 'disconnected',
                intentionalDisconnect: false,
                hasConnected: false,
                firstConnectWaiters: [],
            });
        }
        if (!this.primaryMachineId) {
            this.primaryMachineId = machineId;
        }

        const connection = this.connections.get(machineId)!;
        const connected = new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error(`Socket connect timed out for machine ${machineId}`)), timeoutMs);
            connection.firstConnectWaiters.push(() => {
                clearTimeout(timeout);
                resolve();
            });
        });
        await this.connect(machineId);
        await connected;
    }

    async connect(machineId?: string) {
        const targets = machineId
            ? [this.getConnection(machineId)]
            : Array.from(this.connections.values());

        for (const connection of targets) {
            if (!connection || connection.socket) {
                continue;
            }
            const mid = connection.config.credentials.machineId;
            this.updateMachineStatus(mid, 'connecting');
            connection.intentionalDisconnect = false;
            let socketOptions;
            socketOptions = await buildTunnelSocketOptions(connection.config.credentials);
            connection.socket = io(connection.config.endpoint, socketOptions);
            this.setupEventHandlers(connection);
        }
    }

    disconnect(machineId?: string) {
        const targets = machineId
            ? [this.getConnection(machineId)]
            : Array.from(this.connections.values());

        for (const connection of targets) {
            if (!connection) {
                continue;
            }
            connection.intentionalDisconnect = true;
            if (connection.socket) {
                connection.socket.disconnect();
                connection.socket = null;
            }
            this.updateMachineStatus(connection.config.credentials.machineId, 'disconnected');
        }
    }

    removeMachine(machineId: string) {
        const connection = this.getConnection(machineId);
        if (!connection) {
            return;
        }
        connection.intentionalDisconnect = true;
        if (connection.socket) {
            connection.socket.disconnect();
            connection.socket = null;
        }
        this.connections.delete(machineId);
        if (this.primaryMachineId === machineId) {
            const nextEntry = this.connections.keys().next();
            this.primaryMachineId = nextEntry.done ? null : nextEntry.value;
        }
        this.updateMachineStatus(machineId, 'disconnected');
    }

    getConnectionCount(): number {
        return this.connections.size;
    }

    getConnectionMachineIds(): string[] {
        return Array.from(this.connections.keys());
    }

    onReconnected = (listener: (machineId: string) => void) => {
        this.reconnectedListeners.add(listener);
        return () => this.reconnectedListeners.delete(listener);
    };

    onStatusChange = (listener: (status: SyncSocketStatus) => void) => {
        this.statusListeners.add(listener);
        listener(this.currentStatus);
        return () => this.statusListeners.delete(listener);
    };

    onMachineDisconnected = (listener: (machineId: string, lastSeenAt: number) => void) => {
        this.machineDisconnectListeners.add(listener);
        return () => this.machineDisconnectListeners.delete(listener);
    };

    onDeviceCodeExpired = (listener: (machineId: string) => void) => {
        this.deviceCodeExpiredListeners.add(listener);
        return () => this.deviceCodeExpiredListeners.delete(listener);
    };

    onMessage(event: string, handler: MessageHandler) {
        this.messageHandlers.set(event, handler);
        return () => this.messageHandlers.delete(event);
    }

    offMessage(event: string) {
        this.messageHandlers.delete(event);
    }

    /**
     * Routing scope for operations targeting a specific session. Parses the
     * (possibly composite) session id once and routes every subsequent call to
     * the owning machine.
     */
    forSession(sessionId: string): SessionScope {
        return new SessionScope(this, this.resolveSessionRef(sessionId));
    }

    /**
     * Routing scope for operations targeting a specific machine.
     */
    forMachine(machineId: string): MachineScope {
        return new MachineScope(this, machineId);
    }

    /**
     * Routing scope for operations that target the user's primary machine
     * (account-scoped operations, default delivery target, etc.).
     */
    forPrimaryMachine(): MachineScope {
        return new MachineScope(this, this.requirePrimaryMachineId());
    }

    async requestSessionMessageRange(req: SessionMessageRangeRequest): Promise<SessionMessageRangeResponse> {
        const ref = this.resolveSessionRef(req.sessionId);
        const connection = this.requireConnection(ref.machineId);
        const validatedRequest = SessionMessageRangeRequestSchema.parse({
            ...req,
            sessionId: ref.localSessionId,
        });
        const raw = await connection.socket!.emitWithAck('session-message-range', validatedRequest);
        const parsed = SessionMessageRangeResponseSchema.safeParse(raw);
        if (!parsed.success) {
            throw new Error(`Invalid session-message-range response: ${parsed.error.message}`);
        }
        return parsed.data;
    }

    async reconnectWithCurrentCredentials() {
        this.disconnect();
        await this.connect();
    }

    // ---------- internal helpers used by SessionScope / MachineScope ----------
    // These are public on the class only because TS lacks package-private; they
    // exist for the scope classes and `requestSessionMessageRange` to call.
    // External callers should use `forSession`, `forMachine`, or
    // `forPrimaryMachine` — never these directly.

    /** @internal */
    async _requestForMachine(machineId: string, path: string, opts?: RequestInit): Promise<Response> {
        const connection = this.requireConnection(machineId);
        const credentials = (await TokenStorage.getCredentialsList()).find(item => item.machineId === machineId);
        if (!credentials) {
            throw new Error(`No credentials found in TokenStorage for machine ${machineId}`);
        }
        const url = `${connection.config.endpoint}${path}`;
        const headers: Record<string, string> = {
            'X-Happy-Client': getHappyClientId(),
            ...(opts?.headers as Record<string, string> | undefined),
        };
        return tunnelFetch(url, credentials, { ...opts, headers });
    }

    /** @internal */
    async _dispatchSessionRpc<R, A>(ref: MachineSessionRef, method: string, params: A): Promise<R> {
        const connection = this.requireConnection(ref.machineId);
        const result = await connection.socket!.emitWithAck('rpc-call', {
            method: `${ref.localSessionId}:${method}`,
            params,
        });
        if (result.ok) {
            return result.result as R;
        }
        throw new Error('RPC call failed');
    }

    /** @internal */
    async _dispatchMachineRpc<R, A>(machineId: string, method: string, params: A): Promise<R> {
        const connection = this.requireConnection(machineId);
        const result = await connection.socket!.emitWithAck('rpc-call', {
            method: `${machineId}:${method}`,
            params,
        });
        if (result.ok) {
            return result.result as R;
        }
        throw new Error(result.error || 'RPC call failed');
    }

    /** @internal */
    async _emitWithAck<T = any>(machineId: string, event: string, data: unknown): Promise<T> {
        const connection = this.requireConnection(machineId);
        return await connection.socket!.emitWithAck(event, data);
    }

    /** @internal */
    _send(machineId: string, event: string, data: unknown): boolean {
        const connection = this.requireConnection(machineId);
        connection.socket!.emit(event, data);
        return true;
    }

    private resolveSessionRef(sessionId: string): MachineSessionRef {
        return parseCompositeSessionId(sessionId, this.requirePrimaryMachineId());
    }

    private requirePrimaryMachineId(): string {
        if (!this.primaryMachineId) {
            throw new Error('SyncSocket not initialized');
        }
        return this.primaryMachineId;
    }

    private requireConnection(machineId: string): MachineConnection {
        const connection = this.getConnection(machineId);
        if (!connection || !connection.socket) {
            throw new Error(`Socket not connected for machine ${machineId}`);
        }
        return connection;
    }

    private getConnection(machineId: string): MachineConnection | undefined {
        return this.connections.get(machineId);
    }

    private isVerboseLogging(): boolean {
        try {
            return storage.getState().localSettings.verboseLogging;
        } catch {
            return false;
        }
    }

    private updateMachineStatus(machineId: string, status: SyncSocketStatus) {
        const connection = this.connections.get(machineId);
        if (connection) {
            connection.status = status;
        }
        const nextStatus = this.computeAggregateStatus();
        if (this.currentStatus !== nextStatus) {
            this.currentStatus = nextStatus;
            this.statusListeners.forEach(listener => listener(nextStatus));
        }
    }

    private computeAggregateStatus(): SyncSocketStatus {
        const statuses = Array.from(this.connections.values()).map(connection => connection.status);
        if (statuses.length === 0) {
            return 'disconnected';
        }
        if (statuses.some(status => status === 'connected')) {
            return 'connected';
        }
        if (statuses.some(status => status === 'connecting')) {
            return 'connecting';
        }
        if (statuses.some(status => status === 'error')) {
            return 'error';
        }
        return 'disconnected';
    }

    private setupEventHandlers(connection: MachineConnection) {
        const socket = connection.socket;
        if (!socket) return;
        const machineId = connection.config.credentials.machineId;

        socket.on('connect', () => {
            if (this.isVerboseLogging()) {
                console.log('SyncSocket connected', { machineId, recovered: socket.recovered, socketId: socket.id });
            }
            this.updateMachineStatus(machineId, 'connected');
            const waiters = connection.firstConnectWaiters.splice(0);
            waiters.forEach(resolve => resolve());
            const wasConnected = connection.hasConnected;
            connection.hasConnected = true;
            if (wasConnected && !socket.recovered) {
                this.reconnectedListeners.forEach(listener => listener(machineId));
            }
        });

        socket.on('disconnect', () => {
            if (this.isVerboseLogging()) {
                console.log('SyncSocket disconnected', { machineId });
            }
            const lastSeenAt = Date.now();
            this.updateMachineStatus(machineId, 'disconnected');
            this.machineDisconnectListeners.forEach(listener => listener(machineId, lastSeenAt));
            const intentional = connection.intentionalDisconnect;
            connection.socket = null;
            if (!intentional) {
                void this.connect(machineId);
            }
        });

        socket.on('connect_error', (error) => {
            if (this.isVerboseLogging()) {
                console.error('SyncSocket connection error', { machineId, error });
            }
            this.updateMachineStatus(machineId, 'error');
            this.machineDisconnectListeners.forEach(listener => listener(machineId, Date.now()));
        });

        socket.on('error', (error) => {
            if (this.isVerboseLogging()) {
                console.error('SyncSocket error', { machineId, error });
            }
            this.updateMachineStatus(machineId, 'error');
        });

        socket.onAny((event, data) => {
            if (this.isVerboseLogging()) {
                console.log(`SyncSocket event ${event}`, { machineId });
            }
            const handler = this.messageHandlers.get(event);
            if (handler) {
                handler(data, machineId);
            }
        });
    }
}

export type { ApiSocket };
export const apiSocket = new ApiSocket();
