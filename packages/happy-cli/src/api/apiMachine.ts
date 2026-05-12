/**
 * WebSocket client for machine/daemon communication with Happy server
 * Similar to ApiSessionClient but for machine-scoped connections
 */

import { io, Socket } from 'socket.io-client';
import { logger } from '@/ui/logger';
import { configuration } from '@/configuration';
import * as daemonClient from '@/daemon/daemonClient';
import { MachineMetadata, DaemonState, Machine, Update, UpdateMachineBody } from './types';
import { isSupportedAgent, registerCommonHandlers, SpawnInWorktreeOptions, SpawnSessionOptions, SpawnSessionResult } from '../modules/common/registerCommonHandlers';
import { encodeBase64, decodeBase64, encrypt, decrypt } from './encryption';
import { backoff } from '@/utils/time';
import { RpcHandlerManager } from './rpc/RpcHandlerManager';
import { detectCLIAvailability, CLIAvailability } from '@/utils/detectCLI';
import { detectResumeSupport, type ResumeSupport } from '@/resume/localHappyAgentAuth';
import { shouldReconnect } from '@/utils/lidState';
import { isValidCodexEffortLevel, isValidCodexRemotePermissionMode } from '@/codex/cliArgs';
import { validateStopSessionId } from '@/daemon/stopTrackedSession';

interface ServerToDaemonEvents {
    update: (data: Update) => void;
    'rpc-request': (data: { method: string, params: unknown }, callback: (response: unknown) => void) => void;
    'rpc-registered': (data: { method: string }) => void;
    'rpc-unregistered': (data: { method: string }) => void;
    'rpc-error': (data: { type: string, error: string }) => void;
    auth: (data: { success: boolean, user: string }) => void;
    error: (data: { message: string }) => void;
}

interface DaemonToServerEvents {
    'machine-alive': (data: {
        machineId: string;
        time: number;
    }) => void;

    'machine-update-metadata': (data: {
        machineId: string;
        metadata: string; // Encrypted MachineMetadata
        expectedVersion: number
    }, cb: (answer: {
        result: 'error'
    } | {
        result: 'version-mismatch'
        version: number,
        metadata: string
    } | {
        result: 'success',
        version: number,
        metadata: string
    }) => void) => void;

    'machine-update-state': (data: {
        machineId: string;
        daemonState: string; // Encrypted DaemonState
        expectedVersion: number
    }, cb: (answer: {
        result: 'error'
    } | {
        result: 'version-mismatch'
        version: number,
        daemonState: string
    } | {
        result: 'success',
        version: number,
        daemonState: string
    }) => void) => void;

    'rpc-register': (data: { method: string }) => void;
    'rpc-unregister': (data: { method: string }) => void;
    'rpc-call': (data: { method: string, params: any }, callback: (response: {
        ok: boolean
        result?: any
        error?: string
    }) => void) => void;
}

type MachineRpcHandlers = {
    spawnSession: (options: SpawnSessionOptions) => Promise<SpawnSessionResult>;
    spawnInWorktree?: (options: SpawnInWorktreeOptions) => Promise<SpawnSessionResult>;
    resumeSession?: (sessionId: string, options?: { model?: string; permissionMode?: string }) => Promise<SpawnSessionResult>;
    forkSession?: (options: ForkSessionOptions) => Promise<SpawnSessionResult>;
    stopSession: (sessionId: string) => boolean | Promise<boolean>;
    requestShutdown: () => void;
}

export type ForkSessionOptions = {
    parentSessionId: string;
    worktreePath: string;
    model?: string;
    permissionMode?: string;
    effortLevel?: string;
};

const PARENT_SESSION_ID_MAX_LENGTH = 128;
const PARENT_SESSION_ID_SHAPE = /^[A-Za-z0-9_-]+$/;

export class ApiMachineClient {
    private socket: Socket<ServerToDaemonEvents, DaemonToServerEvents> | null = null;
    private socketReady: Promise<void> = Promise.resolve();
    private keepAliveInterval: NodeJS.Timeout | null = null;
    private lastKnownCLIAvailability: CLIAvailability | null = null;
    private lastKnownResumeSupport: ResumeSupport | null = null;
    private rpcHandlerManager: RpcHandlerManager;
    private resumeSessionHandler: ((sessionId: string, options?: { model?: string; permissionMode?: string }) => Promise<SpawnSessionResult>) | null = null;
    private forkSessionHandler: ((options: ForkSessionOptions) => Promise<SpawnSessionResult>) | null = null;
    private reconnectInterval: NodeJS.Timeout | null = null;

    private socketAuthBase() {
        return {
            token: this.token,
            clientType: 'machine-scoped' as const,
            machineId: this.machine.id,
            happyClient: `cli-daemon/${configuration.currentCliVersion}`
        };
    }

    constructor(
        private token: string,
        private machine: Machine
    ) {
        // Initialize RPC handler manager
        this.rpcHandlerManager = new RpcHandlerManager({
            scopePrefix: this.machine.id,
            logger: (msg, data) => logger.debug(msg, data)
        });

        registerCommonHandlers(this.rpcHandlerManager, process.cwd());
    }

    private detectEffectiveResumeSupport(): ResumeSupport {
        return {
            ...detectResumeSupport(),
            rpcAvailable: !!this.resumeSessionHandler,
            forkRpcAvailable: !!this.forkSessionHandler,
        };
    }

    setRPCHandlers({
        spawnSession,
        spawnInWorktree,
        resumeSession,
        forkSession,
        stopSession,
        requestShutdown
    }: MachineRpcHandlers) {
        this.resumeSessionHandler = resumeSession ?? null;
        this.forkSessionHandler = forkSession ?? null;

        // Register spawn session handler
        this.rpcHandlerManager.registerHandler('spawn-happy-session', async (params: any) => {
            const { directory, sessionId, machineId, approvedNewDirectoryCreation, agent, environmentVariables, token } = params || {};
            logger.debug(`[API MACHINE] Spawning session with params: ${JSON.stringify(params)}`);

            if (!directory) {
                throw new Error('Directory is required');
            }

            const result = await spawnSession({ directory, sessionId, machineId, approvedNewDirectoryCreation, agent, environmentVariables, token });

            switch (result.type) {
                case 'success':
                    logger.debug(`[API MACHINE] Spawned session ${result.sessionId}`);
                    return { type: 'success', sessionId: result.sessionId };

                case 'requestToApproveDirectoryCreation':
                    logger.debug(`[API MACHINE] Requesting directory creation approval for: ${result.directory}`);
                    return { type: 'requestToApproveDirectoryCreation', directory: result.directory };

                case 'error':
                    throw new Error(result.errorMessage);
            }
        });

        this.syncResumeSessionRpcRegistration();

        this.rpcHandlerManager.registerHandler('spawn-in-worktree', async (params: any) => {
            const { repoPath, worktreePath, runId, agent, token } = params || {};

            if (!isSupportedAgent(agent)) {
                return { type: 'error', errorMessage: 'agent must be one of: claude, codex, gemini, openclaw' };
            }
            if (!repoPath || typeof repoPath !== 'string') {
                return { type: 'error', errorMessage: 'repoPath is required' };
            }
            if (worktreePath !== undefined && worktreePath !== null && typeof worktreePath !== 'string') {
                return { type: 'error', errorMessage: 'worktreePath must be a string when provided' };
            }
            if (runId !== undefined && runId !== null && typeof runId !== 'string') {
                return { type: 'error', errorMessage: 'runId must be a string when provided' };
            }
            if (!spawnInWorktree) {
                return { type: 'error', errorMessage: 'Spawn-in-worktree handler not available' };
            }

            return spawnInWorktree({
                machineId: this.machine.id,
                repoPath,
                worktreePath: worktreePath ?? undefined,
                runId: runId ?? undefined,
                agent,
                token,
            });
        });

        this.rpcHandlerManager.registerHandler('fork-into-worktree', async (params: any) => {
            const { parentSessionId, worktreePath, model, permissionMode, effortLevel } = params || {};

            if (!parentSessionId || typeof parentSessionId !== 'string') {
                return { type: 'error', errorMessage: 'Parent session ID is required' };
            }
            if (parentSessionId.length > PARENT_SESSION_ID_MAX_LENGTH || !PARENT_SESSION_ID_SHAPE.test(parentSessionId)) {
                return { type: 'error', errorMessage: 'parentSessionId must be 1-128 characters of [A-Za-z0-9_-]' };
            }
            if (!worktreePath || typeof worktreePath !== 'string') {
                return { type: 'error', errorMessage: 'Worktree path is required' };
            }
            if (model !== undefined && model !== null && (typeof model !== 'string' || model.length === 0)) {
                return { type: 'error', errorMessage: 'model must be a non-empty string when provided' };
            }
            if (permissionMode !== undefined && permissionMode !== null && !isValidCodexRemotePermissionMode(permissionMode)) {
                return { type: 'error', errorMessage: 'permissionMode must be one of: default, read-only, safe-yolo, yolo' };
            }
            if (effortLevel !== undefined && effortLevel !== null && !isValidCodexEffortLevel(effortLevel)) {
                return { type: 'error', errorMessage: 'effortLevel must be one of: none, minimal, low, medium, high, xhigh' };
            }

            const handler = this.forkSessionHandler;
            if (!handler) {
                return { type: 'error', errorMessage: 'Fork session handler not available' };
            }

            return handler({
                parentSessionId,
                worktreePath,
                model: model ?? undefined,
                permissionMode: permissionMode ?? undefined,
                effortLevel: effortLevel ?? undefined,
            });
        });

        // Register stop session handler
        this.rpcHandlerManager.registerHandler('stop-session', async (params: any) => {
            const { sessionId } = params || {};

            const validation = validateStopSessionId(sessionId);
            if (!validation.ok) {
                throw new Error(validation.error);
            }

            const success = await stopSession(validation.sessionId);
            if (!success) {
                throw new Error('Session not found or failed to stop');
            }

            logger.debug(`[API MACHINE] Stopped session ${validation.sessionId}`);
            return { message: 'Session stopped' };
        });

        // Register stop daemon handler
        this.rpcHandlerManager.registerHandler('stop-daemon', () => {
            logger.debug('[API MACHINE] Received stop-daemon RPC request');

            // Trigger shutdown callback after a delay
            setTimeout(() => {
                logger.debug('[API MACHINE] Initiating daemon shutdown from RPC');
                requestShutdown();
            }, 100);

            return { message: 'Daemon stop request acknowledged, starting shutdown sequence...' };
        });
    }

    private syncResumeSessionRpcRegistration(): void {
        const method = 'resume-happy-session';

        if (this.resumeSessionHandler) {
            if (!this.rpcHandlerManager.hasHandler(method)) {
                this.rpcHandlerManager.registerHandler(method, async (params: any) => {
                    const { sessionId, model, permissionMode } = params || {};

                    if (!sessionId || typeof sessionId !== 'string') {
                        throw new Error('Session ID is required');
                    }

                    const handler = this.resumeSessionHandler;
                    if (!handler) {
                        throw new Error('Resume session handler not available');
                    }

                    const result = await handler(sessionId, { model, permissionMode });
                    switch (result.type) {
                        case 'success':
                            return { type: 'success', sessionId: result.sessionId };
                        case 'requestToApproveDirectoryCreation':
                            return result;
                        case 'error':
                            throw new Error(result.errorMessage);
                    }
                });
            }
            return;
        }

        if (this.rpcHandlerManager.hasHandler(method)) {
            this.rpcHandlerManager.unregisterHandler(method);
        }
    }

    /**
     * Update machine metadata
     * Currently unused, changes from the mobile client are more likely
     * for example to set a custom name.
     */
    async updateMachineMetadata(handler: (metadata: MachineMetadata | null) => MachineMetadata): Promise<void> {
        await this.socketReady;
        await backoff(async () => {
            const socket = this.socket!;
            const updated = handler(this.machine.metadata);

            const answer = await socket.emitWithAck('machine-update-metadata', {
                machineId: this.machine.id,
                metadata: encodeBase64(encrypt(this.machine.encryptionKey, this.machine.encryptionVariant, updated)),
                expectedVersion: this.machine.metadataVersion
            });

            if (answer.result === 'success') {
                this.machine.metadata = decrypt(this.machine.encryptionKey, this.machine.encryptionVariant, decodeBase64(answer.metadata));
                this.machine.metadataVersion = answer.version;
                logger.debug('[API MACHINE] Metadata updated successfully');
            } else if (answer.result === 'version-mismatch') {
                if (answer.version > this.machine.metadataVersion) {
                    this.machine.metadataVersion = answer.version;
                    this.machine.metadata = decrypt(this.machine.encryptionKey, this.machine.encryptionVariant, decodeBase64(answer.metadata));
                }
                throw new Error('Metadata version mismatch'); // Triggers retry
            }
        });
    }

    /**
     * Update daemon state (runtime info) - similar to session updateAgentState
     * Simplified without lock - relies on backoff for retry
     */
    async updateDaemonState(handler: (state: DaemonState | null) => DaemonState): Promise<void> {
        await this.socketReady;
        await backoff(async () => {
            const socket = this.socket!;
            const updated = handler(this.machine.daemonState);

            const answer = await socket.emitWithAck('machine-update-state', {
                machineId: this.machine.id,
                daemonState: encodeBase64(encrypt(this.machine.encryptionKey, this.machine.encryptionVariant, updated)),
                expectedVersion: this.machine.daemonStateVersion
            });

            if (answer.result === 'success') {
                this.machine.daemonState = decrypt(this.machine.encryptionKey, this.machine.encryptionVariant, decodeBase64(answer.daemonState));
                this.machine.daemonStateVersion = answer.version;
                logger.debug('[API MACHINE] Daemon state updated successfully');
            } else if (answer.result === 'version-mismatch') {
                if (answer.version > this.machine.daemonStateVersion) {
                    this.machine.daemonStateVersion = answer.version;
                    this.machine.daemonState = decrypt(this.machine.encryptionKey, this.machine.encryptionVariant, decodeBase64(answer.daemonState));
                }
                throw new Error('Daemon state version mismatch'); // Triggers retry
            }
        });
    }

    connect() {
        this.socketReady = this.connectToTunnelListener().catch((error) => {
            logger.debug('[API MACHINE] Failed to connect to tunnel listener:', error);
        });
    }

    private buildSocket(url: string, auth: object): Socket<ServerToDaemonEvents, DaemonToServerEvents> {
        const socket = io(url, {
            transports: ['websocket'],
            auth,
            path: '/v1/updates',
            reconnection: false,
            autoConnect: false,
        });

        socket.on('connect', () => {
            logger.debug('[API MACHINE] Connected to server');

            if (this.reconnectInterval) {
                clearInterval(this.reconnectInterval);
                this.reconnectInterval = null;
            }

            this.updateDaemonState((state) => ({
                ...state,
                status: 'running',
                pid: process.pid,
                httpPort: this.machine.daemonState?.httpPort,
                startedAt: Date.now()
            }));

            this.rpcHandlerManager.onSocketConnect(socket);
            this.syncResumeSessionRpcRegistration();
            this.startKeepAlive();
        });

        socket.on('disconnect', (reason) => {
            logger.debug(`[API MACHINE] Disconnected from server — reason: ${reason}`);
            this.rpcHandlerManager.onSocketDisconnect();
            this.stopKeepAlive();
            this.startSmartReconnect();
        });

        socket.on('rpc-request', async (data: { method: string, params: unknown }, callback: (response: unknown) => void) => {
            logger.debugLargeJson(`[API MACHINE] Received RPC request:`, data);
            callback(await this.rpcHandlerManager.handleRequest(data));
        });

        socket.on('update', (data: Update) => {
            if (data.body.t === 'update-machine' && (data.body as UpdateMachineBody).machineId === this.machine.id) {
                const update = data.body as UpdateMachineBody;

                if (update.metadata) {
                    logger.debug('[API MACHINE] Received external metadata update');
                    this.machine.metadata = decrypt(this.machine.encryptionKey, this.machine.encryptionVariant, decodeBase64(update.metadata.value));
                    this.machine.metadataVersion = update.metadata.version;
                }

                if (update.daemonState) {
                    logger.debug('[API MACHINE] Received external daemon state update');
                    this.machine.daemonState = decrypt(this.machine.encryptionKey, this.machine.encryptionVariant, decodeBase64(update.daemonState.value));
                    this.machine.daemonStateVersion = update.daemonState.version;
                }
            } else {
                logger.debug(`[API MACHINE] Received unknown update type: ${(data.body as any).t}`);
            }
        });

        socket.on('connect_error', (error) => {
            logger.debug(`[API MACHINE] Connection error: ${error.message}`);
            this.startSmartReconnect();
        });

        socket.io.on('error', (error: any) => {
            logger.debug('[API MACHINE] Socket error:', error);
        });

        return socket;
    }

    private async refreshTunnelAuth(): Promise<void> {
        const options = await daemonClient.tunnelSocketIOOptions();
        const auth = {
            ...this.socketAuthBase(),
            ...options.auth,
        };
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.disconnect();
        }
        this.socket = this.buildSocket(options.url, auth);
    }

    private async connectToTunnelListener(): Promise<void> {
        const options = await daemonClient.tunnelSocketIOOptions();
        logger.debug(`[API MACHINE] Connecting to ${options.url}`);

        this.socket = this.buildSocket(options.url, {
            ...this.socketAuthBase(),
            ...options.auth,
        });

        this.socket.connect();
    }

    private startKeepAlive() {
        this.stopKeepAlive();
        this.keepAliveInterval = setInterval(() => {
            if (!this.socket) return;
            const payload = {
                machineId: this.machine.id,
                time: Date.now()
            };
            if (process.env.DEBUG) {
                logger.debugLargeJson(`[API MACHINE] Emitting machine-alive`, payload);
            }
            this.socket.emit('machine-alive', payload);

            // Re-detect CLI availability and push metadata update if changed
            const newAvailability = detectCLIAvailability();
            const prev = this.lastKnownCLIAvailability;
            const newResumeSupport = this.detectEffectiveResumeSupport();
            const prevResume = this.lastKnownResumeSupport;
            const cliAvailabilityChanged = !prev || prev.claude !== newAvailability.claude || prev.codex !== newAvailability.codex || prev.gemini !== newAvailability.gemini || prev.openclaw !== newAvailability.openclaw;
            const resumeSupportChanged = !prevResume
                || prevResume.rpcAvailable !== newResumeSupport.rpcAvailable
                || prevResume.forkRpcAvailable !== newResumeSupport.forkRpcAvailable
                || prevResume.happyAgentAuthenticated !== newResumeSupport.happyAgentAuthenticated;

            if (cliAvailabilityChanged || resumeSupportChanged) {
                this.lastKnownCLIAvailability = newAvailability;
                this.lastKnownResumeSupport = newResumeSupport;
                this.updateMachineMetadata((metadata) => ({
                    ...(metadata || {} as any),
                    cliAvailability: newAvailability,
                    resumeSupport: newResumeSupport,
                })).catch((err) => {
                    logger.debug('[API MACHINE] Failed to update machine capabilities:', err);
                });
            }
        }, 20000);
        logger.debug('[API MACHINE] Keep-alive started (20s interval)');
    }

    private startSmartReconnect() {
        if (this.reconnectInterval) return;

        this.reconnectInterval = setInterval(() => {
            if (this.socket?.connected) {
                clearInterval(this.reconnectInterval!);
                this.reconnectInterval = null;
                return;
            }
            if (!shouldReconnect()) {
                logger.debug('[API MACHINE] Still not ready to reconnect');
                return;
            }
            logger.debug('[API MACHINE] Attempting reconnect');
            void this.refreshTunnelAuth().then(() => this.socket?.connect()).catch((error) => {
                logger.debug('[API MACHINE] Failed to refresh tunnel auth before reconnect:', error);
            });
        }, 3000);

        if (shouldReconnect()) {
            logger.debug('[API MACHINE] Network up + lid open — reconnecting in 1s');
            setTimeout(() => {
                if (!this.socket?.connected) {
                    void this.refreshTunnelAuth().then(() => this.socket?.connect()).catch((error) => {
                        logger.debug('[API MACHINE] Failed to refresh tunnel auth before reconnect:', error);
                    });
                }
            }, 1000);
        }
    }

    private stopKeepAlive() {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
            logger.debug('[API MACHINE] Keep-alive stopped');
        }
    }

    shutdown() {
        logger.debug('[API MACHINE] Shutting down');
        this.stopKeepAlive();
        if (this.reconnectInterval) {
            clearInterval(this.reconnectInterval);
            this.reconnectInterval = null;
        }
        if (this.socket) {
            this.socket.close();
            logger.debug('[API MACHINE] Socket closed');
        }
    }
}
