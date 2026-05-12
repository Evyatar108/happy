import { connectTestTunnelSocket } from './socket';

export type TriggerTestRpcResult = {
    ok: boolean;
    result?: unknown;
    error?: string;
};

export async function triggerTestRpc(method: string, params: unknown): Promise<TriggerTestRpcResult> {
    const socket = await connectTestTunnelSocket();

    try {
        return await socket.emitWithAck('rpc-call', { method, params });
    } finally {
        socket.close();
    }
}
