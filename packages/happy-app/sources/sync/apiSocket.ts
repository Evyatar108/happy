import { io, Socket } from 'socket.io-client';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { AuthCredentials, TokenStorage } from '@/auth/tokenStorage';
import { Encryption } from './encryption/encryption';
import { storage } from './storage';
import { tunnelFetch } from '@/auth/machineAuth';
import { buildTunnelSocketOptions } from './tunnelTransport';
import { localizeSessionPath, parseCompositeSessionId } from './machineSessionId';
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
    encryption: Encryption;
    status: SyncSocketStatus;
}

type MessageHandler = (data: any, machineId: string) => void;

class ApiSocket {
    private connections: Map<string, MachineConnection> = new Map();
    private primaryMachineId: string | null = null;
    private messageHandlers: Map<string, MessageHandler> = new Map();
    private reconnectedListeners: Set<(machineId: string) => void> = new Set();
    private statusListeners: Set<(status: SyncSocketStatus) => void> = new Set();
    private machineDisconnectListeners: Set<(machineId: string, lastSeenAt: number) => void> = new Set();
    private currentStatus: SyncSocketStatus = 'disconnected';

    initialize(config: SyncSocketConfig, encryption: Encryption) {
        this.initializeMany([{ config, encryption }]);
    }

    initializeMany(items: Array<{ config: SyncSocketConfig; encryption: Encryption }>) {
        for (const item of items) {
            const machineId = item.config.credentials.machineId;
            const existing = this.connections.get(machineId);
            if (existing) {
                existing.config = item.config;
                existing.encryption = item.encryption;
                continue;
            }
            this.connections.set(machineId, {
                socket: null,
                config: item.config,
                encryption: item.encryption,
                status: 'disconnected',
            });
            if (!this.primaryMachineId) {
                this.primaryMachineId = machineId;
            }
        }
        this.connect();
    }

    connect(machineId?: string) {
        const targets = machineId
            ? [this.getConnection(machineId)]
            : Array.from(this.connections.values());

        for (const connection of targets) {
            if (!connection || connection.socket) {
                continue;
            }
            this.updateMachineStatus(connection.config.credentials.machineId, 'connecting');
            connection.socket = io(connection.config.endpoint, buildTunnelSocketOptions(connection.config.credentials));
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
            if (connection.socket) {
                connection.socket.disconnect();
                connection.socket = null;
            }
            this.updateMachineStatus(connection.config.credentials.machineId, 'disconnected');
        }
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

    onMessage(event: string, handler: MessageHandler) {
        this.messageHandlers.set(event, handler);
        return () => this.messageHandlers.delete(event);
    }

    offMessage(event: string) {
        this.messageHandlers.delete(event);
    }

    async sessionRPC<R, A>(sessionId: string, method: string, params: A): Promise<R> {
        const ref = this.resolveSessionRef(sessionId);
        const connection = this.requireConnection(ref.machineId);
        const sessionEncryption = connection.encryption.getSessionEncryption(sessionId);
        if (!sessionEncryption) {
            throw new Error(`Session encryption not found for ${sessionId}`);
        }

        const result = await connection.socket!.emitWithAck('rpc-call', {
            method: `${ref.localSessionId}:${method}`,
            params: await sessionEncryption.encryptRaw(params)
        });

        if (result.ok) {
            return await sessionEncryption.decryptRaw(result.result) as R;
        }
        throw new Error('RPC call failed');
    }

    async machineRPC<R, A>(machineId: string, method: string, params: A): Promise<R> {
        const connection = this.requireConnection(machineId);
        const machineEncryption = connection.encryption.getMachineEncryption(machineId);
        if (!machineEncryption) {
            throw new Error(`Machine encryption not found for ${machineId}`);
        }

        const result = await connection.socket!.emitWithAck('rpc-call', {
            method: `${machineId}:${method}`,
            params: await machineEncryption.encryptRaw(params)
        });

        if (result.ok) {
            return await machineEncryption.decryptRaw(result.result) as R;
        }
        throw new Error(result.error || 'RPC call failed');
    }

    send(event: string, data: any, machineId?: string) {
        const connection = this.requireConnection(machineId ?? this.requirePrimaryMachineId());
        connection.socket!.emit(event, data);
        return true;
    }

    async emitWithAck<T = any>(event: string, data: any, machineId?: string): Promise<T> {
        const connection = this.requireConnection(machineId ?? this.requirePrimaryMachineId());
        return await connection.socket!.emitWithAck(event, data);
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

    async request(path: string, options?: RequestInit): Promise<Response> {
        return this.requestForMachine(this.requirePrimaryMachineId(), path, options);
    }

    async requestForSession(sessionId: string, path: string, options?: RequestInit): Promise<Response> {
        const ref = this.resolveSessionRef(sessionId);
        return this.requestForMachine(ref.machineId, localizeSessionPath(path, ref.machineId), options);
    }

    async requestForMachine(machineId: string, path: string, options?: RequestInit): Promise<Response> {
        const connection = this.requireConnection(machineId);
        const credentials = (await TokenStorage.getCredentialsList()).find(item => item.machineId === machineId)
            ?? connection.config.credentials;
        const url = `${connection.config.endpoint}${path}`;
        const headers: Record<string, string> = {
            'X-Happy-Client': getHappyClientId(),
            ...(options?.headers as Record<string, string> | undefined),
        };

        return tunnelFetch(url, credentials, {
            ...options,
            headers
        });
    }

    reconnectWithCurrentCredentials() {
        this.disconnect();
        this.connect();
    }

    private resolveSessionRef(sessionId: string) {
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
            if (!socket.recovered) {
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

export const apiSocket = new ApiSocket();
