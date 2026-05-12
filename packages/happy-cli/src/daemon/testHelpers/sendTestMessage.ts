import { connectTestTunnelSocket } from './socket';

export async function sendTestMessage(sessionId: string, message: string): Promise<void> {
    const socket = await connectTestTunnelSocket({
        clientType: 'session-scoped',
        sessionId,
    });

    try {
        socket.emit('message', { sid: sessionId, message });
    } finally {
        socket.close();
    }
}
