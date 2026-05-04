import WebSocket from 'ws';
import type { JsonRpcConnection, JsonRpcMessage } from './JsonRpcConnection';

type WsTransportOptions = {
    url: string;
    handshakeTimeoutMs?: number;
    onChildExit?: (handler: () => void) => () => void;
};

export class WsTransport implements JsonRpcConnection {
    private ws: WebSocket | null = null;
    private messageHandler: ((msg: JsonRpcMessage) => void) | null = null;
    private errorHandler: ((error: Error) => void) | null = null;
    private closeHandler: ((code: number | null, signal: NodeJS.Signals | null) => void) | null = null;
    private closeEmitted = false;
    private openPromise: Promise<void> | null = null;

    constructor(private readonly options: WsTransportOptions) {}

    open(): Promise<void> {
        if (this.openPromise) return this.openPromise;
        this.openPromise = this._open();
        return this.openPromise;
    }

    private async _open(): Promise<void> {
        const timeoutMs = this.options.handshakeTimeoutMs ?? 5_000;
        const retryDelayMs = 100;
        let openedWs: WebSocket | undefined;

        await new Promise<void>((resolve, reject) => {
            let settled = false;
            let activeWs: WebSocket | null = null;
            let removeChildExitHandler: (() => void) | undefined;
            let retryTimer: ReturnType<typeof setTimeout> | undefined;
            let timeout: ReturnType<typeof setTimeout>;
            const cleanupWs = (target: WebSocket, handleOpen: () => void, handleError: (error: Error) => void, handleClose: () => void) => {
                target.off('open', handleOpen);
                target.off('error', handleError);
                target.off('close', handleClose);
            };
            const cleanup = (opened = false) => {
                clearTimeout(timeout);
                if (retryTimer) clearTimeout(retryTimer);
                removeChildExitHandler?.();
                if (!opened && activeWs && activeWs.readyState !== WebSocket.CLOSED) {
                    try { activeWs.terminate(); } catch { /* ignore */ }
                }
            };
            const finish = (fn: () => void, opened = false) => {
                if (settled) return;
                settled = true;
                cleanup(opened);
                fn();
            };
            const attempt = () => {
                if (settled) return;
                const candidate = new WebSocket(this.options.url);
                activeWs = candidate;
                this.ws = candidate;

                const handleOpen = () => {
                    openedWs = candidate;
                    cleanupWs(candidate, handleOpen, handleError, handleClose);
                    finish(resolve, true);
                };
                const handleError = (error: Error) => {
                    cleanupWs(candidate, handleOpen, handleError, handleClose);
                    if ((error as NodeJS.ErrnoException).code === 'ECONNREFUSED' && Date.now() < deadline) {
                        retryTimer = setTimeout(attempt, retryDelayMs);
                        return;
                    }
                    this.errorHandler?.(error instanceof Error ? error : new Error(String(error)));
                    finish(() => reject(error instanceof Error ? error : new Error(String(error))));
                };
                const handleClose = () => {
                    cleanupWs(candidate, handleOpen, handleError, handleClose);
                    if (Date.now() < deadline) {
                        retryTimer = setTimeout(attempt, retryDelayMs);
                        return;
                    }
                    finish(() => reject(new Error(`Timed out opening Codex app-server ws transport after ${timeoutMs}ms`)));
                };

                candidate.once('open', handleOpen);
                candidate.once('error', handleError);
                candidate.once('close', handleClose);
            };
            const deadline = Date.now() + timeoutMs;
            timeout = setTimeout(() => {
                finish(() => reject(new Error(`Timed out opening Codex app-server ws transport after ${timeoutMs}ms`)));
            }, timeoutMs);

            removeChildExitHandler = this.options.onChildExit?.(() => {
                finish(() => reject(new Error('Codex app-server exited during ws handshake')));
            });

            attempt();
        });

        const socket = openedWs as WebSocket | undefined;
        if (!socket) {
            throw new Error(`Timed out opening Codex app-server ws transport after ${timeoutMs}ms`);
        }

        socket.on('message', (data: WebSocket.RawData) => {
            let msg: JsonRpcMessage;
            try {
                msg = JSON.parse(data.toString()) as JsonRpcMessage;
            } catch (error) {
                this.errorHandler?.(error instanceof Error ? error : new Error(String(error)));
                return;
            }
            this.messageHandler?.(msg);
        });

        socket.on('error', (error: Error) => {
            this.errorHandler?.(error instanceof Error ? error : new Error(String(error)));
        });

        socket.on('close', (code: number) => {
            if (this.closeEmitted) return;
            this.closeEmitted = true;
            this.closeHandler?.(code, null);
        });
    }

    async send(msg: JsonRpcMessage): Promise<void> {
        const ws = this.ws;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            throw new Error('Cannot send message: websocket not open');
        }

        await new Promise<void>((resolve, reject) => {
            ws.send(JSON.stringify(msg), (error) => {
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

    async close(timeoutMs = 2_000): Promise<void> {
        const ws = this.ws;
        this.ws = null;
        if (!ws || ws.readyState === WebSocket.CLOSED) return;

        await new Promise<void>((resolve) => {
            let settled = false;
            let timer: ReturnType<typeof setTimeout> | undefined;
            const done = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                ws.off('close', done);
                ws.off('error', done);
                resolve();
            };
            timer = setTimeout(done, timeoutMs);
            ws.once('close', done);
            ws.once('error', done);
            try {
                if (ws.readyState === WebSocket.CONNECTING) {
                    ws.terminate();
                } else {
                    ws.close();
                }
            } catch {
                done();
            }
            if (ws.readyState === WebSocket.CLOSED) {
                done();
            }
        });
    }
}

export function createWsTransport(options: WsTransportOptions): JsonRpcConnection {
    return new WsTransport(options);
}
