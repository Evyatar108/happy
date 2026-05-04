import type { ChildProcess } from 'node:child_process';
import { createInterface, type Interface as ReadlineInterface } from 'node:readline';
import { spawn as crossSpawn } from 'cross-spawn';
import { logger } from '@/ui/logger';
import type { JsonRpcConnection, JsonRpcMessage } from './JsonRpcConnection';

type StdioTransportOptions = {
    command: string;
    args: string[];
    env: Record<string, string>;
};

export class StdioTransport implements JsonRpcConnection {
    private proc: ChildProcess | null = null;
    private readline: ReadlineInterface | null = null;
    private messageHandler: ((msg: JsonRpcMessage) => void) | null = null;
    private errorHandler: ((error: Error) => void) | null = null;
    private closeHandler: ((code: number | null, signal: NodeJS.Signals | null) => void) | null = null;
    private openPromise: Promise<void> | null = null;

    constructor(private readonly options: StdioTransportOptions) {}

    open(): Promise<void> {
        if (this.openPromise) return this.openPromise;
        this.openPromise = this._open();
        return this.openPromise;
    }

    private async _open(): Promise<void> {
        const proc = crossSpawn(this.options.command, this.options.args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: this.options.env,
            windowsHide: true,
        });
        this.proc = proc;

        proc.on('error', (err) => {
            this.errorHandler?.(err instanceof Error ? err : new Error(String(err)));
        });

        proc.on('exit', (code, signal) => {
            this.closeHandler?.(code, signal);
        });

        proc.stderr?.on('data', (chunk: Buffer) => {
            const text = chunk.toString().trim();
            if (text) logger.debug(`[CodexAppServer:stderr] ${text}`);
        });

        this.readline = createInterface({ input: proc.stdout! });
        this.readline.on('line', (line) => {
            if (!line.trim()) return;
            let msg: JsonRpcMessage;
            try {
                msg = JSON.parse(line) as JsonRpcMessage;
            } catch {
                logger.debug('[CodexAppServer] Non-JSON line:', line.substring(0, 200));
                return;
            }
            this.messageHandler?.(msg);
        });

        await Promise.resolve();
    }

    async send(msg: JsonRpcMessage): Promise<void> {
        const stdin = this.proc?.stdin;
        if (!stdin?.writable) {
            throw new Error('Cannot send message: stdin not writable');
        }
        await new Promise<void>((resolve, reject) => {
            stdin.write(JSON.stringify(msg) + '\n', (error) => {
                if (error) reject(error);
                else resolve();
            });
        });
    }

    onMessage(handler: (msg: JsonRpcMessage) => void): void {
        this.messageHandler = handler;
    }

    onError(handler: (error: Error) => void): void {
        this.errorHandler = handler;
    }

    onClose(handler: (code: number | null, signal: NodeJS.Signals | null) => void): void {
        this.closeHandler = handler;
    }

    async close(): Promise<void> {
        const proc = this.proc;
        const pid = proc?.pid;

        this.readline?.close();
        this.readline = null;

        try {
            proc?.stdin?.end();
            proc?.kill('SIGTERM');
        } catch { /* ignore */ }

        if (pid) {
            const killTimer = setTimeout(() => {
                try {
                    process.kill(pid, 0);
                    process.kill(pid, 'SIGKILL');
                } catch { /* already dead */ }
            }, 2000);
            killTimer.unref();
        }

        this.proc = null;
    }
}

export function createStdioTransport(options: StdioTransportOptions): JsonRpcConnection {
    return new StdioTransport(options);
}
