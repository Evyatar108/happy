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

    constructor(private readonly options: WsTransportOptions) {}

    async open(): Promise<void> {
        const timeoutMs = this.options.handshakeTimeoutMs ?? 5_000;
        const ws = new WebSocket(this.options.url);
        this.ws = ws;

        await new Promise<void>((resolve, reject) => {
            let settled = false;
            let removeChildExitHandler: (() => void) | undefined;
            let timeout: ReturnType<typeof setTimeout>;
            const handleOpen = () => {
                finish(resolve);
            };
            const handleError = (error: Error) => {
                this.errorHandler?.(error instanceof Error ? error : new Error(String(error)));
                finish(() => reject(error instanceof Error ? error : new Error(String(error))));
            };
            const cleanup = () => {
                clearTimeout(timeout);
                removeChildExitHandler?.();
                ws.off('open', handleOpen);
                ws.off('error', handleError);
            };
            const finish = (fn: () => void) => {
                if (settled) return;
                settled = true;
                cleanup();
                fn();
            };
            timeout = setTimeout(() => {
                finish(() => reject(new Error(`Timed out opening Codex app-server ws transport after ${timeoutMs}ms`)));
            }, timeoutMs);

            removeChildExitHandler = this.options.onChildExit?.(() => {
                finish(() => reject(new Error('Codex app-server exited during ws handshake')));
            });

            ws.once('open', handleOpen);
            ws.once('error', handleError);
        });

        ws.on('message', (data: WebSocket.RawData) => {
            let msg: JsonRpcMessage;
            try {
                msg = JSON.parse(data.toString()) as JsonRpcMessage;
            } catch (error) {
                this.errorHandler?.(error instanceof Error ? error : new Error(String(error)));
                return;
            }
            this.messageHandler?.(msg);
        });

        ws.on('error', (error) => {
            this.errorHandler?.(error instanceof Error ? error : new Error(String(error)));
        });

        ws.on('close', (code) => {
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

    async close(): Promise<void> {
        const ws = this.ws;
        this.ws = null;
        if (!ws || ws.readyState === WebSocket.CLOSED) return;

        await new Promise<void>((resolve) => {
            const done = () => resolve();
            ws.once('close', done);
            ws.close();
            if (ws.readyState === WebSocket.CLOSED) {
                resolve();
            }
        });
    }
}

export function createWsTransport(options: WsTransportOptions): JsonRpcConnection {
    return new WsTransport(options);
}
