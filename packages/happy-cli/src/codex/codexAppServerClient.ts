/**
 * Codex App Server Client — drives Codex via the v2 JSON-RPC protocol
 * (`codex app-server`), replacing the legacy MCP-based CodexMcpClient.
 *
 * Protocol: JSON-RPC 2.0 over stdio (newline-delimited JSON).
 * Reference: codex-rs/app-server/README.md in the openai/codex repo.
 *
 * WARNING: @openai/codex-sdk (v0.118.0) exists but only wraps `codex exec`
 * (non-interactive, fire-and-forget). It has NO support for `app-server`,
 * interactive approvals, or bidirectional JSON-RPC. We need app-server for
 * mobile approval routing (exec:request, patch:request, mcp:call), which is
 * why this client is hand-rolled. Re-evaluate if the SDK ever adds an
 * app-server wrapper or approval callbacks. See docs/plans/codex-app-server-migration.md.
 */

import { execSync, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { closeSync, openSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn as crossSpawn } from 'cross-spawn';
import { logger } from '@/ui/logger';
import type {
    InitializeParams,
    NewConversationParams,
    NewConversationResponse,
    ResumeConversationParams,
    ResumeConversationResponse,
    InterruptConversationParams,
    ReviewDecision,
    EventMsg,
    JsonRpcRequest,
    JsonRpcResponse,
    ApprovalPolicy,
    SandboxMode,
    InputItem,
    ReasoningEffort,
    McpServerElicitationRequestResponse,
} from './codexAppServerTypes';
import type { SandboxConfig } from '@/persistence';
import { initializeSandbox, wrapForMcpTransport } from '@/sandbox/manager';
import packageJson from '../../package.json';
import { pickFreeLoopbackPort } from '@/utils/pickFreeLoopbackPort';
import type { JsonRpcConnection, JsonRpcMessage } from './transport/JsonRpcConnection';
import { createStdioTransport } from './transport/stdioTransport';
import { createWsTransport } from './transport/wsTransport';
import {
    acquireDiscoveryLock,
    deleteDiscoveryIfMatches,
    DISCOVERY_FILE_VERSION,
    discoveryFilePath,
    type DiscoveryLock,
    isPidAlive,
    lockFilePath,
    readDiscoveryRecord,
    type CodexDiscoveryRecord,
    writeDiscoveryRecord,
} from './codexAppServerDiscovery';

type PendingRequest = {
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
    method: string;
    epoch: number;
};

type LegacyPatchChanges = Record<string, Record<string, unknown>>;

export type CodexAppServerTransport = 'stdio' | 'ws';
export type CodexAppServerTransportSource = 'explicit' | 'default';

export type CodexAppServerClientOptions = {
    transport?: CodexAppServerTransport;
    transportSource?: CodexAppServerTransportSource;
    logFilePath?: string;
};

type ConnectOptions = {
    skipDiscovery?: boolean;
    heldLock?: DiscoveryLock;
};

type ReconnectOptions = {
    terminateAppServer?: boolean;
    skipDiscovery?: boolean;
};

export type ApprovalHandler = (params: {
    type: 'exec' | 'patch' | 'mcp';
    callId: string;
    command?: string[];
    cwd?: string;
    fileChanges?: Record<string, unknown>;
    reason?: string | null;
    toolName?: string;
    input?: unknown;
    serverName?: string;
    message?: string;
}) => Promise<ReviewDecision>;

/**
 * Check that `codex app-server` is available.
 */
function isAppServerAvailable(): boolean {
    try {
        const version = execSync('codex --version', { encoding: 'utf8', windowsHide: true }).trim();
        const match = version.match(/codex-cli\s+(\d+\.\d+\.\d+)/);
        if (!match) return false;
        const [, ver] = match;
        const [major, minor] = ver.split('.').map(Number);
        // app-server available in recent versions
        return major > 0 || minor >= 100;
    } catch {
        return false;
    }
}

function isWsAuthAvailable(): boolean {
    try {
        const helpOutput = execSync('codex app-server --help', {
            encoding: 'utf8',
            windowsHide: true,
            timeout: 3000,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        return helpOutput.includes('--ws-auth');
    } catch {
        return false;
    }
}

function sha256hex(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

function normalizeRawFileChangeList(changes: unknown): LegacyPatchChanges | undefined {
    if (!Array.isArray(changes)) {
        return undefined;
    }

    const normalized: LegacyPatchChanges = {};
    for (const change of changes) {
        if (!change || typeof change !== 'object' || Array.isArray(change)) {
            continue;
        }

        const path = typeof change.path === 'string' ? change.path : null;
        if (!path) {
            continue;
        }

        const entry: Record<string, unknown> = {};
        if (typeof change.diff === 'string') {
            entry.diff = change.diff;
        }
        if (change.kind && typeof change.kind === 'object' && !Array.isArray(change.kind)) {
            entry.kind = change.kind;
        }

        normalized[path] = entry;
    }

    return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export class CodexAppServerClient {
    private connection: JsonRpcConnection | null = null;
    private nextId = 1;
    private pending = new Map<number, PendingRequest>();
    private processEpoch = 0;
    private wsAppServerOwner: 'attached' | 'spawned' | null = null;
    private currentDiscovery: CodexDiscoveryRecord | null = null;
    private intentionalClose = false;
    private connected = false;
    private sandboxConfig?: SandboxConfig;
    private sandboxCleanup: (() => Promise<void>) | null = null;
    public sandboxEnabled = false;

    // Session state
    private _threadId: string | null = null;
    private _turnId: string | null = null;
    private threadDefaults: {
        model?: string;
        cwd?: string;
        approvalPolicy?: ApprovalPolicy;
        sandbox?: SandboxMode;
        mcpServers?: Record<string, unknown>;
    } | null = null;

    // Turn completion tracking for the currently active sendTurnAndWait call.
    // A completion event only resolves once we have seen task_started for this turn.
    private pendingTurnCompletion: {
        resolve: (aborted: boolean) => void;
        turnId: string | null;
        ignoredTurnIds: Set<string>;
    } | null = null;

    // Tracks in-flight interruptTurn() RPCs so sendTurnAndWait can wait for them
    // before starting a new turn (prevents stale turn/interrupt from aborting the next turn).
    private pendingInterrupt: Promise<void> | null = null;
    private notificationProtocol: 'unknown' | 'legacy' | 'raw' = 'unknown';
    private completedTurnIds = new Set<string>();
    private rawFileChangesByItemId = new Map<string, LegacyPatchChanges>();

    // Handlers set by the consumer (runCodex.ts)
    private eventHandler: ((msg: EventMsg) => void) | null = null;
    private approvalHandler: ApprovalHandler | null = null;
    private transport: CodexAppServerTransport;
    private transportSource: CodexAppServerTransportSource;
    private logFilePath?: string;
    private wsChild: ChildProcess | null = null;
    private wsChildExited = false;
    private wsLogFd: number | null = null;
    private wsChildExitHandlers = new Set<() => void>();
    private wsAuthProbeResult: boolean | null = null;
    private wsAuthFallbackWarned = false;

    constructor(sandboxConfig?: SandboxConfig, options: CodexAppServerClientOptions = {}) {
        this.sandboxConfig = sandboxConfig;
        this.transport = options.transport ?? 'ws';
        this.transportSource = options.transportSource ?? (options.transport ? 'explicit' : 'default');
        this.logFilePath = options.logFilePath;
    }

    private resolveEffectiveTransport(): 'stdio' | 'ws' {
        // MUST stay in sync with connect():742-760 transport-resolution rules
        if (this.sandboxConfig?.enabled && process.platform !== 'win32' && this.transport === 'ws') {
            return 'stdio';
        }

        if (this.transport === 'ws' && !this.getWsAuthAvailability() && this.transportSource !== 'explicit') {
            return 'stdio';
        }

        return this.transport;
    }

    get threadId(): string | null {
        return this._threadId;
    }

    get turnId(): string | null {
        return this._turnId;
    }

    setEventHandler(handler: (msg: EventMsg) => void): void {
        this.eventHandler = handler;
    }

    setApprovalHandler(handler: ApprovalHandler): void {
        this.approvalHandler = handler;
    }

    private extractTurnId(params: any): string | null {
        const turnId = params?.turn?.id ?? params?.turnId ?? params?.turn_id ?? null;
        return typeof turnId === 'string' && turnId.length > 0 ? turnId : null;
    }

    private extractTurnStatus(params: any): string | null {
        const status = params?.turn?.status ?? params?.status ?? null;
        return typeof status === 'string' && status.length > 0 ? status : null;
    }

    private shouldHandleRawNotification(method: string): boolean {
        const isRawNotification = method === 'thread/started'
            || method === 'turn/started'
            || method === 'turn/completed'
            || method === 'thread/status/changed'
            || method === 'thread/tokenUsage/updated'
            || method.startsWith('item/');

        if (!isRawNotification) {
            return false;
        }

        if (this.notificationProtocol === 'legacy') {
            return false;
        }

        if (this.notificationProtocol === 'unknown') {
            this.notificationProtocol = 'raw';
        }

        return true;
    }

    private emitRawTurnCompletion(
        turnId: string | null,
        status: string | null,
        error: unknown,
        source: string,
    ): void {
        const aborted = status === 'cancelled' || status === 'canceled' || status === 'aborted' || status === 'interrupted';

        this.tryResolvePendingTurn(aborted, turnId, source);
        this._turnId = null;

        if (turnId && this.completedTurnIds.has(turnId)) {
            return;
        }
        if (turnId) {
            this.completedTurnIds.add(turnId);
        }

        if (aborted) {
            this.eventHandler?.({
                type: 'turn_aborted',
                ...(turnId ? { turn_id: turnId } : {}),
                ...(status ? { status } : {}),
                ...(error !== undefined && error !== null ? { error } : {}),
            });
            return;
        }

        this.eventHandler?.({
            type: 'task_complete',
            ...(turnId ? { turn_id: turnId } : {}),
            ...(status ? { status } : {}),
            ...(error !== undefined && error !== null ? { error } : {}),
        });
    }

    private handleRawNotification(method: string, params: any): boolean {
        if (!this.shouldHandleRawNotification(method)) {
            return false;
        }

        if (method === 'turn/started') {
            const turnId = this.extractTurnId(params);
            if (turnId) {
                this._turnId = turnId;
            }
            this.markPendingTurnStarted(turnId);
            this.eventHandler?.({
                type: 'task_started',
                ...(turnId ? { turn_id: turnId } : {}),
            });
            return true;
        }

        if (method === 'turn/completed') {
            this.emitRawTurnCompletion(
                this.extractTurnId(params),
                this.extractTurnStatus(params),
                params?.turn?.error ?? params?.error,
                method,
            );
            return true;
        }

        if (method === 'thread/status/changed') {
            const statusType = params?.status?.type;
            if (statusType === 'idle' && this.pendingTurnCompletion) {
                this.emitRawTurnCompletion(this._turnId, 'completed', null, method);
            }
            return true;
        }

        if (method === 'thread/tokenUsage/updated') {
            const tokenUsage = params?.tokenUsage;
            if (tokenUsage && typeof tokenUsage === 'object') {
                this.eventHandler?.({
                    type: 'token_count',
                    ...tokenUsage,
                });
            }
            return true;
        }

        const item = params?.item;
        if (!item || typeof item !== 'object') {
            return method.startsWith('item/');
        }

        if (method === 'item/started' && item.type === 'commandExecution') {
            const callId = typeof item.id === 'string' ? item.id : '';
            this.eventHandler?.({
                type: 'exec_command_begin',
                call_id: callId,
                callId,
                command: item.command,
                cwd: item.cwd,
                description: item.command,
            });
            return true;
        }

        if (method === 'item/completed' && item.type === 'commandExecution') {
            const callId = typeof item.id === 'string' ? item.id : '';
            this.eventHandler?.({
                type: 'exec_command_end',
                call_id: callId,
                callId,
                output: item.aggregatedOutput ?? '',
                exit_code: item.exitCode ?? null,
                duration_ms: item.durationMs ?? null,
                status: item.status,
                cwd: item.cwd,
                command: item.command,
            });
            return true;
        }

        if (item.type === 'fileChange') {
            const callId = typeof item.id === 'string' ? item.id : '';
            const changes = normalizeRawFileChangeList(item.changes);

            if (callId && changes) {
                this.rawFileChangesByItemId.set(callId, changes);
            }

            if (method === 'item/started') {
                this.eventHandler?.({
                    type: 'patch_apply_begin',
                    call_id: callId,
                    callId,
                    changes: changes ?? {},
                });
                return true;
            }

            if (method === 'item/completed') {
                this.eventHandler?.({
                    type: 'patch_apply_end',
                    call_id: callId,
                    callId,
                    status: item.status,
                });

                if (callId && (item.status === 'completed' || item.status === 'failed' || item.status === 'declined')) {
                    this.rawFileChangesByItemId.delete(callId);
                }
                return true;
            }
        }

        if (method === 'item/completed' && item.type === 'agentMessage') {
            const text = typeof item.text === 'string' ? item.text : '';
            if (text.length > 0) {
                this.eventHandler?.({
                    type: 'agent_message',
                    message: text,
                    item_id: item.id,
                    phase: item.phase,
                });
            }

            if (item.phase === 'final_answer' && this.pendingTurnCompletion) {
                this.emitRawTurnCompletion(
                    this.extractTurnId(params),
                    'completed',
                    null,
                    `${method}:final_answer`,
                );
            }
            return true;
        }

        return method.startsWith('item/');
    }

    // ─── Lifecycle ──────────────────────────────────────────────

    private registerWsChildExitHandler(handler: () => void): () => void {
        if (this.wsChildExited) {
            queueMicrotask(handler);
            return () => undefined;
        }
        this.wsChildExitHandlers.add(handler);
        return () => {
            this.wsChildExitHandlers.delete(handler);
        };
    }

    private closeWsLogFd(): void {
        const fd = this.wsLogFd;
        this.wsLogFd = null;
        if (fd === null) return;
        try { closeSync(fd); } catch { /* ignore */ }
    }

    private clearWsChildState(): void {
        this.wsChild?.removeAllListeners();
        this.wsChildExitHandlers.clear();
        this.wsChild = null;
        this.wsChildExited = true;
        this.closeWsLogFd();
    }

    private waitForWsChildExit(timeoutMs: number): Promise<boolean> {
        if (!this.wsChild || this.wsChildExited) {
            return Promise.resolve(true);
        }

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                cleanup();
                resolve(false);
            }, timeoutMs);
            const cleanup = this.registerWsChildExitHandler(() => {
                clearTimeout(timeout);
                cleanup();
                resolve(true);
            });
        });
    }

    private async waitForPidExit(pid: number, timeoutMs: number): Promise<boolean> {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            try {
                process.kill(pid, 0);
            } catch (error) {
                const code = (error as NodeJS.ErrnoException).code;
                if (code === 'ESRCH' || code === 'EINVAL') {
                    return true;
                }
                throw error;
            }
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return false;
    }

    private terminateWindowsProcessTree(pid: number): void {
        if (process.platform !== 'win32') return;
        try {
            execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore', windowsHide: true });
        } catch {
            // The wrapper may have already exited; fall back to the normal kill path.
        }
    }

    private async terminateAttachedAppServer(record: CodexDiscoveryRecord): Promise<void> {
        this.terminateWindowsProcessTree(record.pid);
        try { process.kill(record.pid, 'SIGTERM'); } catch { /* ignore */ }
        const exitedAfterTerm = await this.waitForPidExit(record.pid, 2_000);
        if (!exitedAfterTerm) {
            try { process.kill(record.pid, 'SIGKILL'); } catch { /* ignore */ }
            const exitedAfterKill = await this.waitForPidExit(record.pid, 1_000).catch(() => false);
            if (!exitedAfterKill) {
                logger.warn(`[CodexAppServer] Failed to confirm PID ${record.pid} dead after SIGKILL grace; preserving discovery for probe-and-reclaim`);
                throw new Error(`terminateAttachedAppServer: PID ${record.pid} did not exit after SIGKILL grace`);
            }
        }
        deleteDiscoveryIfMatches(discoveryFilePath(), { pid: record.pid, startedAt: record.startedAt });
    }

    private async closeWsChild(): Promise<void> {
        const child = this.wsChild;
        if (!child) {
            this.closeWsLogFd();
            return;
        }

        if (!this.wsChildExited) {
            if (typeof child.pid === 'number') {
                this.terminateWindowsProcessTree(child.pid);
            }
            try { child.kill('SIGTERM'); } catch { /* ignore */ }
            const exitedAfterTerm = await this.waitForWsChildExit(2_000);
            if (!exitedAfterTerm && !this.wsChildExited) {
                try { child.kill('SIGKILL'); } catch { /* ignore */ }
                const exitedAfterKill = await this.waitForWsChildExit(1_000);
                if (!exitedAfterKill && !this.wsChildExited) {
                    const pidLabel = typeof child.pid === 'number' ? child.pid : 'unknown';
                    logger.warn(`[CodexAppServer] Failed to confirm spawned ws child PID ${pidLabel} dead after SIGKILL grace; preserving discovery for probe-and-reclaim`);
                    throw new Error(`closeWsChild: spawned PID ${pidLabel} did not exit after SIGKILL grace`);
                }
            }
        }

        this.wsChild = null;
        this.closeWsLogFd();
    }

    private createWsConnection(command: string, args: string[], env: Record<string, string>, logFilePath: string, listenUrl: string, authToken: string): JsonRpcConnection {
        this.logFilePath = logFilePath;
        const logFd = openSync(logFilePath, 'a', 0o600);
        this.wsLogFd = logFd;
        this.wsChildExited = false;

        const child = crossSpawn(command, args, {
            detached: true,
            stdio: ['ignore', logFd, logFd],
            env,
            windowsHide: true,
        });
        child.unref?.();
        this.wsChild = child;

        child.once('error', (error) => {
            logger.debug('[CodexAppServer] WS process error:', error);
        });
        child.once('exit', () => {
            this.wsChildExited = true;
            for (const handler of [...this.wsChildExitHandlers]) {
                handler();
            }
            this.wsChildExitHandlers.clear();
            this.closeWsLogFd();
        });

        return createWsTransport({
            url: listenUrl,
            authToken,
            onChildExit: (handler) => this.registerWsChildExitHandler(handler),
        });
    }

    private isWsBindError(): boolean {
        const path = this.logFilePath;
        if (!path) return false;
        let s: string;
        try {
            s = readFileSync(path, 'utf8').slice(-65_536).toLowerCase();
        } catch {
            return false;
        }
        return s.includes('eaddrinuse') || s.includes('address already in use') || s.includes('bind failed');
    }

    private wireWsConnection(candidate: JsonRpcConnection, epoch: number): void {
        candidate.onError((err) => {
            logger.debug('[CodexAppServer] Process error:', err);
        });

        candidate.onClose((code, signal) => {
            logger.debug(`[CodexAppServer] Process exited: code=${code} signal=${signal}`);
            if (this.connection !== candidate || this.processEpoch !== epoch) {
                logger.debug('[CodexAppServer] Ignoring stale process exit');
                return;
            }
            if (this.intentionalClose) {
                return;
            }
            this.connected = false;
            for (const [id, req] of this.pending) {
                if (req.epoch !== epoch) continue;
                req.reject(new Error(`Codex process exited (code=${code}) while waiting for ${req.method}`));
                this.pending.delete(id);
            }
            this.resolvePendingTurn(true);
            this.wsAppServerOwner = null;
            this.currentDiscovery = null;
            void this.closeWsChild().catch((err) => {
                logger.warn('[CodexAppServer] closeWsChild failed in onClose:', err);
                this.clearWsChildState();
            });
        });

        candidate.onMessage((msg) => {
            if (this.connection !== candidate || this.processEpoch !== epoch) return;
            this.handleMessage(msg, epoch);
        });
    }

    private rejectPendingForEpoch(epoch: number, method: string, error: Error): void {
        for (const [id, req] of this.pending) {
            if (req.epoch !== epoch || req.method !== method) continue;
            req.reject(error);
            this.pending.delete(id);
        }
    }

    private getWsAuthAvailability(): boolean {
        if (this.wsAuthProbeResult === null) {
            this.wsAuthProbeResult = isWsAuthAvailable();
        }
        return this.wsAuthProbeResult;
    }

    private createAttachedWsConnection(record: CodexDiscoveryRecord): JsonRpcConnection {
        return createWsTransport({
            url: `ws://127.0.0.1:${record.port}`,
            authToken: record.capabilityToken,
            handshakeTimeoutMs: 500,
        });
    }

    private async tryReattach(initParams: InitializeParams): Promise<boolean> {
        const record = readDiscoveryRecord(discoveryFilePath());
        if (!record) return false;

        const deleteStaleRecord = () => {
            deleteDiscoveryIfMatches(discoveryFilePath(), { pid: record.pid, startedAt: record.startedAt });
        };

        if (!isPidAlive(record.pid)) {
            deleteStaleRecord();
            return false;
        }

        if (record.happyCliVersion !== packageJson.version) {
            const probe = this.createAttachedWsConnection(record);
            try {
                await probe.open();
                await probe.close().catch(() => undefined);
            } catch {
                await probe.close().catch(() => undefined);
                deleteStaleRecord();
                return false;
            }
            await this.terminateAttachedAppServer(record);
            return false;
        }

        const candidate = this.createAttachedWsConnection(record);
        try {
            await candidate.open();
        } catch {
            await candidate.close().catch(() => undefined);
            deleteStaleRecord();
            this.connection = null;
            this.wsAppServerOwner = null;
            this.currentDiscovery = null;
            return false;
        }

        const epoch = ++this.processEpoch;
        this.connection = candidate;
        this.wsAppServerOwner = 'attached';
        this.currentDiscovery = record;
        this.wireWsConnection(candidate, epoch);

        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
            await Promise.race([
                this.request('initialize', initParams),
                new Promise<never>((_, reject) => {
                    timeout = setTimeout(() => reject(new Error('reattach initialize timed out after 1500ms')), 1_500);
                }),
            ]);
            if (timeout) clearTimeout(timeout);
            this.notify('initialized');
            this.connected = true;
            logger.debug('[CodexAppServer] Reattached and initialized');
            return true;
        } catch (error) {
            if (timeout) clearTimeout(timeout);
            const killTarget = { pid: record.pid, startedAt: record.startedAt };
            this.intentionalClose = true;
            try {
                try {
                    this.rejectPendingForEpoch(epoch, 'initialize', error instanceof Error ? error : new Error(String(error)));
                    await candidate.close().catch(() => undefined);
                    await this.terminateAttachedAppServer(record);
                    deleteDiscoveryIfMatches(discoveryFilePath(), killTarget);
                } finally {
                    this.connection = null;
                    this.wsAppServerOwner = null;
                    this.currentDiscovery = null;
                    this.connected = false;
                }
            } finally {
                this.intentionalClose = false;
            }
            return false;
        }
    }

    async connect(opts?: ConnectOptions): Promise<void> {
        const skipDiscovery = opts?.skipDiscovery ?? false;
        if (opts?.heldLock && !skipDiscovery) {
            throw new Error('connect({ heldLock }) requires skipDiscovery: true');
        }
        if (this.connected) return;

        if (!isAppServerAvailable()) {
            throw new Error(
                'Codex CLI is not installed\n\n' +
                'Please install Codex CLI using one of these methods:\n\n' +
                'Option 1 - npm (recommended):\n  npm install -g @openai/codex\n\n' +
                'Option 2 - Homebrew (macOS):\n  brew install --cask codex\n\n' +
                'Alternatively, use Claude Code:\n  happy claude',
            );
        }

        let transport = this.transport;
        if (this.sandboxConfig?.enabled && process.platform !== 'win32' && transport === 'ws') {
            logger.warn('[CodexAppServer] Sandbox enabled on non-Windows; forcing stdio transport instead of ws');
            transport = 'stdio';
        }

        if (transport === 'ws' && !this.getWsAuthAvailability()) {
            if (this.transportSource === 'explicit') {
                throw new Error(
                    'Installed codex lacks --ws-auth support required by --codex-transport=ws. ' +
                    'Please upgrade codex, or omit --codex-transport=ws to use the stdio fallback.',
                );
            }
            if (!this.wsAuthFallbackWarned) {
                logger.warn('[CodexAppServer] Installed codex lacks --ws-auth; falling back to stdio transport. Upgrade codex to enable ws transport.');
                this.wsAuthFallbackWarned = true;
            }
            transport = 'stdio';
        }

        let command = 'codex';
        let args = ['app-server', '--listen', 'stdio://'];
        this.sandboxEnabled = false;

        if (this.sandboxConfig?.enabled && process.platform !== 'win32') {
            try {
                this.sandboxCleanup = await initializeSandbox(this.sandboxConfig, process.cwd());
                const wrapped = await wrapForMcpTransport('codex', ['app-server', '--listen', 'stdio://']);
                command = wrapped.command;
                args = wrapped.args;
                this.sandboxEnabled = true;
                logger.info(`[CodexAppServer] Sandbox enabled`);
            } catch (error) {
                logger.warn('[CodexAppServer] Failed to initialize sandbox; continuing without.', error);
                this.sandboxCleanup = null;
            }
        }

        // Build env — same filtering as the old MCP client
        const env: Record<string, string> = {};
        for (const [key, value] of Object.entries(process.env)) {
            if (typeof value === 'string') env[key] = value;
        }
        // Mute noisy rollout list logging
        const filter = 'codex_core::rollout::list=off';
        if (!env.RUST_LOG) {
            env.RUST_LOG = filter;
        } else if (!env.RUST_LOG.includes('codex_core::rollout::list=')) {
            env.RUST_LOG += `,${filter}`;
        }
        if (this.sandboxEnabled) {
            env.CODEX_SANDBOX = 'seatbelt';
        }
        if (process.platform === 'win32') {
            env.MSYS_NO_PATHCONV = '1';
        }

        const initParams: InitializeParams = {
            clientInfo: {
                name: 'happy-codex',
                title: 'Happy Codex Client',
                version: packageJson.version,
            },
            capabilities: {
                experimentalApi: true,
            },
        };

        const WS_SPAWN_MAX_RETRIES = 2;
        let spawnedDiscoveryRecord: CodexDiscoveryRecord | null = null;
        const ownsDiscoveryLock = transport === 'ws' && !opts?.heldLock;
        const discoveryLock = transport === 'ws'
            ? opts?.heldLock ?? await acquireDiscoveryLock(lockFilePath())
            : null;
        let failureAlreadyCleanedUp = false;
        try {
            if (transport === 'ws') {
                if (!skipDiscovery && await this.tryReattach(initParams)) {
                    return;
                }

                const logFilePath = this.logFilePath ?? join(tmpdir(), `codex-app-server-${randomUUID()}.log`);
                for (let attempt = 1; attempt <= WS_SPAWN_MAX_RETRIES; attempt += 1) {
                    const port = await pickFreeLoopbackPort();
                    const listenUrl = `ws://127.0.0.1:${port}`;
                    const wsAuthToken = randomBytes(32).toString('base64url');
                    const wsTokenSha256 = sha256hex(wsAuthToken);
                    args = ['app-server', '--listen', listenUrl, '--ws-auth', 'capability-token', '--ws-token-sha256', wsTokenSha256];
                    logger.debug(`[CodexAppServer] Spawning (attempt ${attempt}): ${command} ${args.join(' ')}`);
                    const candidate = this.createWsConnection(command, args, env, logFilePath, listenUrl, wsAuthToken);
                    const epoch = ++this.processEpoch;
                    this.connection = candidate;
                    this.wireWsConnection(candidate, epoch);

                    try {
                        await candidate.open();
                        const pid = this.wsChild?.pid;
                        if (typeof pid !== 'number') {
                            throw new Error('Codex app-server ws child did not expose a PID');
                        }
                        spawnedDiscoveryRecord = {
                            version: DISCOVERY_FILE_VERSION,
                            pid,
                            port,
                            startedAt: new Date().toISOString(),
                            happyCliVersion: packageJson.version,
                            cwd: realpathSync(process.cwd()),
                            capabilityToken: wsAuthToken,
                            capabilityTokenSha256: wsTokenSha256,
                            transport: 'ws',
                        };
                        break;
                    } catch (error) {
                        await candidate.close().catch(() => undefined);
                        try {
                            await this.closeWsChild();
                        } catch (killError) {
                            this.clearWsChildState();
                            this.wsAppServerOwner = null;
                            this.connection = null;
                            throw killError;
                        }
                        this.wsAppServerOwner = null;
                        this.connection = null;
                        if (attempt < WS_SPAWN_MAX_RETRIES && this.isWsBindError()) {
                            logger.warn(`[CodexAppServer] Bind error on port ${port}; retrying with a new port`);
                            continue;
                        }
                        throw error;
                    }
                }
            } else {
                logger.debug(`[CodexAppServer] Spawning: ${command} ${args.join(' ')}`);
                const stdioConn = createStdioTransport({ command, args, env });

                const epoch = ++this.processEpoch;
                this.connection = stdioConn;

                stdioConn.onError((err) => {
                    logger.debug('[CodexAppServer] Process error:', err);
                });

                stdioConn.onClose((code, signal) => {
                    logger.debug(`[CodexAppServer] Process exited: code=${code} signal=${signal}`);
                    if (this.connection !== stdioConn || this.processEpoch !== epoch) {
                        logger.debug('[CodexAppServer] Ignoring stale process exit');
                        return;
                    }
                    if (this.intentionalClose) {
                        return;
                    }
                    this.connected = false;
                    this.wsAppServerOwner = null;
                    this.currentDiscovery = null;
                    // Reject all pending requests
                    for (const [id, req] of this.pending) {
                        if (req.epoch !== epoch) continue;
                        req.reject(new Error(`Codex process exited (code=${code}) while waiting for ${req.method}`));
                        this.pending.delete(id);
                    }
                    // Resolve pending turn completion (treat as abort)
                    this.resolvePendingTurn(true);
                });

                stdioConn.onMessage((msg) => {
                    if (this.connection !== stdioConn || this.processEpoch !== epoch) return;
                    this.handleMessage(msg, epoch);
                });

                try {
                    await stdioConn.open();
                } catch (error) {
                    this.connection = null;
                    throw error;
                }
            }

            // Perform initialize handshake
            try {
                await this.request('initialize', initParams);
                if (spawnedDiscoveryRecord) {
                    // notify() is fire-and-forget per notify():1436; this invariant is invocation-ordering, not delivery-confirmation.
                    this.notify('initialized');
                    try {
                        await writeDiscoveryRecord(discoveryFilePath(), spawnedDiscoveryRecord);
                        this.wsAppServerOwner = 'spawned';
                        this.currentDiscovery = spawnedDiscoveryRecord;
                    } catch (writeError) {
                        failureAlreadyCleanedUp = true;
                        this.intentionalClose = true;
                        const connection = this.connection;
                        this.connection = null;
                        let killError: Error | null = null;
                        try {
                            await this.closeWsChild();
                        } catch (err) {
                            killError = err as Error;
                            logger.warn('[CodexAppServer] writeDiscoveryRecord failed AND closeWsChild kill-fail; spawned ws child PID likely orphaned', { writeError, killError });
                            this.clearWsChildState();
                        }
                        await connection?.close().catch(() => undefined);
                        this.wsAppServerOwner = null;
                        this.currentDiscovery = null;
                        this.connected = false;
                        this.intentionalClose = false;
                        throw killError ?? writeError;
                    }
                } else {
                    this.notify('initialized');
                }
            } catch (error) {
                if (!failureAlreadyCleanedUp) {
                    await this.connection?.close().catch(() => undefined);
                    try {
                        await this.closeWsChild();
                    } catch (killError) {
                        this.clearWsChildState();
                        this.wsAppServerOwner = null;
                        this.currentDiscovery = null;
                        this.connection = null;
                        throw killError;
                    }
                    this.wsAppServerOwner = null;
                    this.currentDiscovery = null;
                    this.connection = null;
                }
                throw error;
            }
            this.connected = true;
            logger.debug('[CodexAppServer] Connected and initialized');
        } finally {
            if (ownsDiscoveryLock) {
                await discoveryLock?.release();
            }
        }
    }

    private async disconnectInternal(opts?: { preserveThreadState?: boolean; terminateAppServer?: boolean }): Promise<void> {
        if (!this.connected && !this.connection) return;

        const connection = this.connection;
        const epoch = this.processEpoch;
        const terminateAppServer = opts?.terminateAppServer ?? false;
        const owner = this.wsAppServerOwner;
        const discovery = this.currentDiscovery;
        const child = this.wsChild;
        logger.debug('[CodexAppServer] Disconnecting');

        this.intentionalClose = true;
        try {
            try {
                await connection?.close();
            } catch { /* ignore */ }

            if (terminateAppServer) {
                if (owner === 'attached' && discovery) {
                    await this.terminateAttachedAppServer(discovery);
                } else {
                    await this.closeWsChild();
                    if (discovery) {
                        deleteDiscoveryIfMatches(discoveryFilePath(), { pid: discovery.pid, startedAt: discovery.startedAt });
                    }
                }
            } else {
                child?.removeAllListeners();
                this.wsChildExitHandlers.clear();
                this.wsChild = null;
                this.closeWsLogFd();
            }
        } finally {
            this.intentionalClose = false;
            this.connection = null;
            this.wsAppServerOwner = null;
            this.currentDiscovery = null;
            this.connected = false;
            this._turnId = null;
            this.notificationProtocol = 'unknown';
            this.completedTurnIds.clear();
            if (!opts?.preserveThreadState) {
                this._threadId = null;
                this.threadDefaults = null;
            }

            this.clearWsChildState();

            for (const [id, req] of this.pending) {
                if (req.epoch !== epoch) continue;
                req.reject(new Error(`Codex process disconnected while waiting for ${req.method}`));
                this.pending.delete(id);
            }

            this.resolvePendingTurn(true);

            if (this.sandboxCleanup) {
                try { await this.sandboxCleanup(); } catch { /* ignore */ }
                this.sandboxCleanup = null;
            }
            this.sandboxEnabled = false;
        }

        logger.debug('[CodexAppServer] Disconnected');
    }

    /**
     * May reject if terminateAppServer: true and the OS PID cannot be confirmed dead within SIGKILL grace; the discovery file is preserved for the next invocation to probe-and-reclaim. In-memory state is fully cleared regardless.
     */
    async disconnect(opts?: { terminateAppServer?: boolean }): Promise<void> {
        await this.disconnectInternal(opts);
    }

    private buildThreadConfig(mcpServers?: Record<string, unknown>): Record<string, unknown> | null {
        return mcpServers ? { mcp_servers: mcpServers } : null;
    }

    private rememberThreadDefaults(opts: {
        model?: string;
        cwd?: string;
        approvalPolicy?: ApprovalPolicy;
        sandbox?: SandboxMode;
        mcpServers?: Record<string, unknown>;
    }): void {
        this.threadDefaults = {
            model: opts.model,
            cwd: opts.cwd,
            approvalPolicy: opts.approvalPolicy,
            sandbox: opts.sandbox,
            mcpServers: opts.mcpServers,
        };
    }

    // ─── Thread management ──────────────────────────────────────

    async startThread(opts: {
        model?: string;
        cwd?: string;
        approvalPolicy?: ApprovalPolicy;
        sandbox?: SandboxMode;
        mcpServers?: Record<string, unknown>;
    }): Promise<{ threadId: string; model: string }> {
        const params: NewConversationParams = {
            model: opts.model ?? null,
            modelProvider: null,
            profile: null,
            cwd: opts.cwd ?? process.cwd(),
            approvalPolicy: opts.approvalPolicy ?? null,
            sandbox: opts.sandbox ?? null,
            config: this.buildThreadConfig(opts.mcpServers),
            baseInstructions: null,
            developerInstructions: null,
            compactPrompt: null,
            includeApplyPatchTool: null,
            experimentalRawEvents: false,
            persistExtendedHistory: true,
        };

        const result = await this.request('thread/start', params) as NewConversationResponse;
        this._threadId = result.thread.id;
        this._turnId = null;
        this.rememberThreadDefaults(opts);
        logger.debug('[CodexAppServer] Thread started:', this._threadId);
        return { threadId: result.thread.id, model: result.model };
    }

    async resumeThread(opts?: {
        threadId?: string;
        model?: string;
        cwd?: string;
        approvalPolicy?: ApprovalPolicy;
        sandbox?: SandboxMode;
        mcpServers?: Record<string, unknown>;
    }): Promise<{ threadId: string; model: string }> {
        const threadId = opts?.threadId ?? this._threadId;
        if (!threadId) {
            throw new Error('No thread available to resume.');
        }

        const defaults = this.threadDefaults ?? {};
        const params: ResumeConversationParams = {
            threadId,
            model: opts?.model ?? defaults.model ?? null,
            modelProvider: null,
            cwd: opts?.cwd ?? defaults.cwd ?? process.cwd(),
            approvalPolicy: opts?.approvalPolicy ?? defaults.approvalPolicy ?? null,
            sandbox: opts?.sandbox ?? defaults.sandbox ?? null,
            config: this.buildThreadConfig(opts?.mcpServers ?? defaults.mcpServers),
            baseInstructions: null,
            developerInstructions: null,
            persistExtendedHistory: true,
        };

        const result = await this.request('thread/resume', params) as ResumeConversationResponse;
        this._threadId = result.thread.id;
        this._turnId = null;
        this.rememberThreadDefaults({
            model: opts?.model ?? defaults.model,
            cwd: opts?.cwd ?? defaults.cwd,
            approvalPolicy: opts?.approvalPolicy ?? defaults.approvalPolicy,
            sandbox: opts?.sandbox ?? defaults.sandbox,
            mcpServers: opts?.mcpServers ?? defaults.mcpServers,
        });
        logger.debug('[CodexAppServer] Thread resumed:', this._threadId);
        return { threadId: result.thread.id, model: result.model };
    }

    async reconnectAndResumeThread(opts?: ReconnectOptions): Promise<boolean> {
        const threadId = this._threadId;
        const terminateAppServer = opts?.terminateAppServer ?? false;
        const skipDiscovery = opts?.skipDiscovery ?? false;
        const lock = this.resolveEffectiveTransport() === 'ws' && skipDiscovery ? await acquireDiscoveryLock(lockFilePath()) : null;
        try {
            await this.disconnectInternal({ preserveThreadState: !!threadId, terminateAppServer });
            await this.connect(lock ? { skipDiscovery, heldLock: lock } : { skipDiscovery });
        } finally {
            await lock?.release();
        }

        if (!threadId) {
            return false;
        }

        try {
            await this.resumeThread({ threadId });
            return true;
        } catch (error) {
            logger.warn('[CodexAppServer] Failed to resume thread after reconnect', error);
            this._threadId = null;
            this.threadDefaults = null;
            return false;
        }
    }

    // ─── Turn management ────────────────────────────────────────

    /** Default grace period after interrupt before forcing a restart (ms). */
    private static readonly ABORT_GRACE_MS = 3_000;

    private hasPendingTurnCompletion(): boolean {
        return this.pendingTurnCompletion !== null;
    }

    private resolvePendingTurn(aborted: boolean): void {
        if (!this.pendingTurnCompletion) return;
        this.pendingTurnCompletion.resolve(aborted);
        this.pendingTurnCompletion = null;
    }

    private markPendingTurnStarted(turnId?: string | null): void {
        if (!this.pendingTurnCompletion) return;
        if (turnId) {
            this.pendingTurnCompletion.turnId = turnId;
        }
    }

    private tryResolvePendingTurn(aborted: boolean, turnId: string | null, source: string): void {
        const pending = this.pendingTurnCompletion;
        if (!pending) return;

        if (turnId && pending.ignoredTurnIds.has(turnId)) {
            logger.debug(
                `[CodexAppServer] Ignoring ${source} for stale turn ${turnId}`,
            );
            return;
        }

        // Guard against stale completion notifications from a *different* turn.
        // We use turn ID matching instead of the `started` flag because Codex
        // can skip the turn/started notification entirely for fast turns,
        // which would cause us to discard a valid turn/completed and hang forever.
        if (pending.turnId && turnId && pending.turnId !== turnId) {
            logger.debug(
                `[CodexAppServer] Ignoring ${source} for turn ${turnId}; awaiting ${pending.turnId}`,
            );
            return;
        }

        this.resolvePendingTurn(aborted);
    }

    private async waitForTurnCompletion(timeoutMs: number): Promise<boolean> {
        if (!this.hasPendingTurnCompletion()) {
            return true;
        }

        const deadline = Date.now() + Math.max(0, timeoutMs);
        while (this.hasPendingTurnCompletion()) {
            if (Date.now() >= deadline) {
                return false;
            }
            await new Promise((resolve) => setTimeout(resolve, 25));
        }
        return true;
    }

    /**
     * Request turn interruption and optionally force-restart the app-server if
     * the turn does not settle within a short grace period.
     */
    async abortTurnWithFallback(opts?: {
        gracePeriodMs?: number;
        forceRestartOnTimeout?: boolean;
    }): Promise<{ hadActiveTurn: boolean; aborted: boolean; forcedRestart: boolean; resumedThread: boolean }> {
        const hadActiveTurn = this.hasPendingTurnCompletion();

        // No active turn pending in this client call-site.
        if (!hadActiveTurn) {
            return { hadActiveTurn: false, aborted: false, forcedRestart: false, resumedThread: false };
        }

        // Best-effort interrupt request first.
        await this.interruptTurn();

        const gracePeriodMs = opts?.gracePeriodMs ?? CodexAppServerClient.ABORT_GRACE_MS;
        const settled = await this.waitForTurnCompletion(gracePeriodMs);
        if (settled) {
            return { hadActiveTurn: true, aborted: true, forcedRestart: false, resumedThread: false };
        }

        const shouldForceRestart = opts?.forceRestartOnTimeout ?? true;
        if (!shouldForceRestart) {
            return { hadActiveTurn: true, aborted: false, forcedRestart: false, resumedThread: false };
        }

        logger.warn(`[CodexAppServer] interrupt did not settle turn in ${gracePeriodMs}ms; force-restarting app-server`);
        const pendingTurnId = this.pendingTurnCompletion?.turnId ?? this._turnId;
        if (this.pendingTurnCompletion) {
            this.eventHandler?.({
                type: 'turn_aborted',
                reason: 'interrupted',
                ...(pendingTurnId ? { turn_id: pendingTurnId } : {}),
                forced_restart: true,
            });
        }
        const resumedThread = await this.reconnectAndResumeThread({ terminateAppServer: true, skipDiscovery: true });
        return { hadActiveTurn: true, aborted: true, forcedRestart: true, resumedThread };
    }

    /**
     * Send a user turn and wait for it to complete.
     * Returns when task_complete or turn_aborted is received.
     */
    async sendTurn(prompt: string, opts?: {
        model?: string;
        cwd?: string;
        approvalPolicy?: ApprovalPolicy;
        sandbox?: SandboxMode;
        effort?: ReasoningEffort;
    }): Promise<void> {
        if (!this._threadId) {
            throw new Error('No active thread. Call startThread first.');
        }

        const input: InputItem[] = [
            { type: 'text', text: prompt },
        ];

        // Build params — only include optional fields when set (server uses thread defaults otherwise)
        const params: Record<string, unknown> = {
            threadId: this._threadId,
            input,
        };
        if (opts?.cwd) params.cwd = opts.cwd;
        if (opts?.approvalPolicy) params.approvalPolicy = opts.approvalPolicy;
        if (opts?.model) params.model = opts.model;
        if (opts?.effort) params.effort = opts.effort;

        // Map sandbox mode to the camelCase policy format the server expects
        if (opts?.sandbox) {
            switch (opts.sandbox) {
                case 'workspace-write':
                    params.sandboxPolicy = { type: 'workspaceWrite' };
                    break;
                case 'danger-full-access':
                    params.sandboxPolicy = { type: 'dangerFullAccess' };
                    break;
                case 'read-only':
                    params.sandboxPolicy = { type: 'readOnly' };
                    break;
            }
        }

        // turn/start returns immediately; turn completes via events.
        // We don't await completion here — the caller's event handler
        // tracks task_complete / turn_aborted.
        const result = await this.request('turn/start', params) as { turn?: { id?: string | null } };
        const turnId = result?.turn?.id;
        if (typeof turnId === 'string' && turnId.length > 0) {
            this._turnId = turnId;
            if (this.pendingTurnCompletion) {
                this.pendingTurnCompletion.turnId = turnId;
            }
        }
    }

    /** Default timeout for waiting on turn completion (ms). 10 minutes. */
    private static readonly TURN_TIMEOUT_MS = 10 * 60 * 1000;

    /**
     * Send a user turn and wait for it to complete (task_complete or turn_aborted).
     * Returns { aborted: true } if the turn was aborted (user cancel, permission reject, etc.).
     */
    async sendTurnAndWait(prompt: string, opts?: {
        model?: string;
        cwd?: string;
        approvalPolicy?: ApprovalPolicy;
        sandbox?: SandboxMode;
        effort?: ReasoningEffort;
        turnTimeoutMs?: number;
    }): Promise<{ aborted: boolean }> {
        const ignoredTurnId = this._turnId;
        // Wait for any in-flight interruptTurn() to complete before starting a new
        // turn. Otherwise the stale turn/interrupt RPC can reach Codex after our
        // turn/start and abort the wrong turn.
        if (this.pendingInterrupt) {
            await this.pendingInterrupt;
            // Yield to the event loop so any stale turn_aborted/task_complete
            // notifications queued by the interrupted turn are processed now
            // (harmlessly, since pendingTurnCompletion is null at this point).
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        const timeoutMs = opts?.turnTimeoutMs ?? CodexAppServerClient.TURN_TIMEOUT_MS;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const completion = new Promise<boolean>((resolve) => {
            this.pendingTurnCompletion = {
                resolve,
                turnId: null,
                ignoredTurnIds: ignoredTurnId ? new Set([ignoredTurnId]) : new Set(),
            };

            timer = setTimeout(() => {
                if (this.pendingTurnCompletion) {
                    logger.warn(`[CodexAppServer] Turn timed out after ${timeoutMs}ms — treating as abort`);
                    this.resolvePendingTurn(true);
                }
            }, timeoutMs);
        });

        try {
            await this.sendTurn(prompt, opts);
        } catch (err) {
            if (timer) clearTimeout(timer);
            this.pendingTurnCompletion = null;
            throw err;
        }

        const aborted = await completion;
        if (timer) clearTimeout(timer);
        return { aborted };
    }

    async interruptTurn(): Promise<void> {
        if (!this._threadId) return;
        if (!this._turnId) {
            logger.debug('[CodexAppServer] interruptTurn: no active turnId, skipping');
            return;
        }
        const params: InterruptConversationParams = {
            threadId: this._threadId,
            turnId: this._turnId,
        };
        const doInterrupt = async () => {
            try {
                await this.request('turn/interrupt', params);
            } catch (err) {
                // Ignore if no turn is active
                logger.debug('[CodexAppServer] interruptTurn error (may be expected):', err);
            } finally {
                this.pendingInterrupt = null;
            }
        };
        this.pendingInterrupt = doInterrupt();
        return this.pendingInterrupt;
    }

    // ─── State queries ──────────────────────────────────────────

    hasActiveThread(): boolean {
        return this._threadId !== null;
    }

    // ─── JSON-RPC transport ─────────────────────────────────────

    /** Default timeout for RPC requests (ms). */
    private static readonly REQUEST_TIMEOUT_MS = 30_000;

    private async request(method: string, params?: unknown, timeoutMs?: number): Promise<unknown> {
        const timeout = timeoutMs ?? CodexAppServerClient.REQUEST_TIMEOUT_MS;
        if (!this.connection) {
            throw new Error(`Cannot send ${method}: transport not connected`);
        }

        const id = this.nextId++;
        let timer: ReturnType<typeof setTimeout>;
        const response = new Promise<unknown>((resolve, reject) => {
            timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`${method} timed out after ${timeout}ms (id=${id})`));
            }, timeout);

            this.pending.set(id, {
                resolve: (result) => { clearTimeout(timer); resolve(result); },
                reject: (err) => { clearTimeout(timer); reject(err); },
                method,
                epoch: this.processEpoch,
            });
        });

        const msg: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
        logger.debug(`[CodexAppServer] → ${method} (id=${id})`);
        try {
            await this.connection.send(msg);
        } catch (error) {
            const pending = this.pending.get(id);
            this.pending.delete(id);
            pending?.reject(error instanceof Error ? error : new Error(String(error)));
        }

        return response;
    }

    private notify(method: string, params?: unknown): void {
        if (!this.connection) return;
        const msg: JsonRpcRequest = { jsonrpc: '2.0', method, params };
        this.connection.send(msg).catch((err) => {
            logger.debug(`[CodexAppServer] Failed to send ${method} notification:`, err);
        });
        logger.debug(`[CodexAppServer] → ${method} (notification)`);
    }

    private respond(id: number, result: unknown): void {
        if (!this.connection) return;
        const msg: JsonRpcResponse = { jsonrpc: '2.0', id, result };
        this.connection.send(msg).catch((err) => {
            logger.debug(`[CodexAppServer] Failed to send response (id=${id}):`, err);
        });
        logger.debug(`[CodexAppServer] → response (id=${id})`);
    }

    private handleMessage(msg: JsonRpcMessage, sourceEpoch: number = this.processEpoch): void {
        if (sourceEpoch !== this.processEpoch) {
            return;
        }
        // Response to our request
        if (msg.id != null && (msg.result !== undefined || msg.error !== undefined)) {
            const pending = this.pending.get(msg.id);
            if (pending) {
                if (pending.epoch !== sourceEpoch) {
                    logger.debug(`[CodexAppServer] Ignoring response from stale epoch for id=${msg.id}`);
                    return;
                }
                this.pending.delete(msg.id);
                if (msg.error) {
                    pending.reject(new Error(`${pending.method}: ${msg.error.message} (code=${msg.error.code})`));
                } else {
                    pending.resolve(msg.result);
                }
            }
            return;
        }

        // Server → client request (approvals)
        if (msg.id != null && msg.method) {
            this.handleServerRequest(msg.id, msg.method, msg.params).catch((err) => {
                logger.debug('[CodexAppServer] Error handling server request:', err);
            });
            return;
        }

        // Notification (no id)
        if (msg.method) {
            this.handleNotification(msg.method, msg.params);
            return;
        }

        logger.debug('[CodexAppServer] Unhandled message:', JSON.stringify(msg).substring(0, 300));
    }

    /**
     * Map our internal ReviewDecision to the wire format codex expects.
     * v2 methods (item/*) use: accept/acceptForSession/decline/cancel
     * Legacy methods (execCommandApproval/applyPatchApproval) use: approved/approved_for_session/denied/abort
     */
    private mapDecisionToWire(decision: ReviewDecision, legacy: boolean): string | Record<string, unknown> {
        if (typeof decision === 'string') {
            if (legacy) {
                // Legacy wire format — pass through as-is (approved/denied/abort)
                return decision;
            }
            // v2 wire format
            switch (decision) {
                case 'approved': return 'accept';
                case 'approved_for_session': return 'acceptForSession';
                case 'denied': return 'decline';
                case 'abort': return 'cancel';
                default: return 'decline';
            }
        }
        // Object variant: approved_execpolicy_amendment → pass through as-is
        if ('approved_execpolicy_amendment' in decision) {
            return decision;
        }
        return legacy ? 'denied' : 'decline';
    }

    private parseToolNameFromElicitationMessage(message: unknown): string | null {
        if (typeof message !== 'string') {
            return null;
        }
        const match = message.match(/tool "([^"]+)"/i);
        return match?.[1] ?? null;
    }

    private mapDecisionToMcpElicitationResponse(
        decision: ReviewDecision,
        params: any,
    ): McpServerElicitationRequestResponse {
        if (typeof decision === 'string') {
            switch (decision) {
                case 'approved':
                case 'approved_for_session':
                    return {
                        action: 'accept',
                        content: params?.mode === 'form' ? {} : null,
                        _meta: null,
                    };
                case 'abort':
                    return {
                        action: 'cancel',
                        content: null,
                        _meta: null,
                    };
                case 'denied':
                default:
                    return {
                        action: 'decline',
                        content: null,
                        _meta: null,
                    };
            }
        }

        return {
            action: 'decline',
            content: null,
            _meta: null,
        };
    }

    private async handleServerRequest(id: number, method: string, params: any): Promise<void> {
        if (method === 'mcpServer/elicitation/request') {
            const toolName = this.parseToolNameFromElicitationMessage(params?.message) ?? params?.serverName ?? 'McpTool';
            const decision = await this.handleApproval({
                type: 'mcp',
                callId: `${params?.serverName ?? 'mcp'}:${id}`,
                toolName,
                input: params?._meta?.tool_params ?? {},
                serverName: params?.serverName,
                message: params?.message,
            });
            this.respond(id, this.mapDecisionToMcpElicitationResponse(decision, params));
            return;
        }

        // Command execution approval
        if (method === 'item/commandExecution/requestApproval' || method === 'execCommandApproval') {
            const legacy = method === 'execCommandApproval';
            const callId = params.itemId ?? params.callId ?? String(id);
            const decision = await this.handleApproval({
                type: 'exec',
                callId,
                command: params.command != null ? [params.command] : [],
                cwd: params.cwd,
                reason: params.reason,
            });
            this.respond(id, { decision: this.mapDecisionToWire(decision, legacy) });
            return;
        }

        // File change / patch approval
        if (method === 'item/fileChange/requestApproval' || method === 'applyPatchApproval') {
            const legacy = method === 'applyPatchApproval';
            const callId = params.itemId ?? params.callId ?? String(id);
            const decision = await this.handleApproval({
                type: 'patch',
                callId,
                fileChanges: params.fileChanges ?? (typeof callId === 'string'
                    ? this.rawFileChangesByItemId.get(callId)
                    : undefined),
                reason: params.reason,
            });
            this.respond(id, { decision: this.mapDecisionToWire(decision, legacy) });
            return;
        }

        // Unknown server request — respond so server doesn't hang
        logger.debug(`[CodexAppServer] Unknown server request: ${method}`);
        this.respond(id, {});
    }

    private async handleApproval(params: Parameters<ApprovalHandler>[0]): Promise<ReviewDecision> {
        if (this.approvalHandler) {
            try {
                return await this.approvalHandler(params);
            } catch (err) {
                logger.debug('[CodexAppServer] Approval handler error:', err);
                return 'denied';
            }
        }
        return 'denied'; // default: deny if no handler
    }

    private handleNotification(method: string, params: any): void {
        // codex/event notifications: either `codex/event` or `codex/event/<type>`
        if (method === 'codex/event' || method.startsWith('codex/event/')) {
            this.notificationProtocol = 'legacy';
            const msg = params?.msg;
            if (msg) {
                // Extract turn_id from task_started events
                if (msg.type === 'task_started' && msg.turn_id) {
                    this._turnId = msg.turn_id;
                }
                if (msg.type === 'task_started') {
                    this.markPendingTurnStarted(msg.turn_id ?? msg.turnId ?? null);
                }
                // Fire event handler first (so consumer processes the event)
                this.eventHandler?.(msg);
                // Then resolve turn completion promise
                if (msg.type === 'task_complete' || msg.type === 'turn_aborted') {
                    const turnId = msg.turn_id ?? msg.turnId ?? null;
                    // Mark as completed so v2 turn/completed doesn't duplicate
                    if (turnId) {
                        this.completedTurnIds.add(turnId);
                    }
                    this.tryResolvePendingTurn(
                        msg.type === 'turn_aborted',
                        turnId,
                        `codex/event/${msg.type}`,
                    );
                    this._turnId = null;
                }
            }
            return;
        }

        if (this.handleRawNotification(method, params)) {
            logger.debug(`[CodexAppServer] Raw notification: ${method}`);
            return;
        }

        // v2 lifecycle notifications
        if (method === 'thread/started' || method === 'turn/started' ||
            method === 'turn/completed' || method === 'thread/status/changed') {
            logger.debug(`[CodexAppServer] Lifecycle notification: ${method}`);
            // Mark the turn as started so the completion guard lets it through.
            if (method === 'turn/started') {
                const turnId = this.extractTurnId(params);
                if (turnId) {
                    this._turnId = turnId;
                }
                this.markPendingTurnStarted(turnId);
            }
            // turn/completed is a fallback signal — for mid-inference interrupts,
            // Codex may only signal completion here (not via codex/event turn_aborted).
            // emitRawTurnCompletion deduplicates via completedTurnIds if legacy already handled it.
            if (method === 'turn/completed') {
                this.emitRawTurnCompletion(
                    this.extractTurnId(params),
                    this.extractTurnStatus(params),
                    params?.turn?.error ?? params?.error,
                    method,
                );
            }
            return;
        }

        // MCP server lifecycle: log payload so we can diagnose failed launches
        // (e.g. happy-mcp bridge failing on Windows due to shebang execution).
        if (method === 'mcpServer/startupStatus/updated') {
            logger.debug(`[CodexAppServer] mcpServer startup status:`, params);
            return;
        }

        logger.debug(`[CodexAppServer] Notification: ${method}`);
    }
}
