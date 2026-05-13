import { connectTestTunnelSocket } from './socket';

export type TriggerTestRpcResult = {
    ok: boolean;
    result?: unknown;
    error?: string;
};

export async function triggerTestRpc(sessionId: string, method: string, params: unknown): Promise<TriggerTestRpcResult> {
    const socket = await connectTestTunnelSocket();

    try {
        return await socket.emitWithAck('rpc-call', { method: `${sessionId}:${method}`, params });
    } finally {
        socket.close();
    }
}
