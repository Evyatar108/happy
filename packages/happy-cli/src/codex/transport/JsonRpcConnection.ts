export type JsonRpcMessage = {
    jsonrpc?: '2.0';
    id?: number;
    method?: string;
    params?: unknown;
    result?: unknown;
    error?: { code: number; message: string; data?: unknown };
};

export interface JsonRpcConnection {
    open(): Promise<void>;
    send(msg: JsonRpcMessage): Promise<void>;
    onMessage(handler: (msg: JsonRpcMessage) => void): void;
    onError(handler: (error: Error) => void): void;
    onClose(handler: (code: number | null, signal: NodeJS.Signals | null) => void): void;
    close(): Promise<void>;
}
