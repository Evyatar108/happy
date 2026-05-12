import { io, type Socket } from 'socket.io-client';

import { configuration } from '@/configuration';
import { tunnelSocketIOOptions } from '@/daemon/daemonClient';

export async function connectTestTunnelSocket(auth: Record<string, unknown> = {}): Promise<Socket> {
    const options = await tunnelSocketIOOptions();
    const socket = io(options.url, {
        path: '/v1/updates',
        transports: ['websocket'],
        reconnection: false,
        auth: {
            ...auth,
            ...options.auth,
            happyClient: `cli-test/${configuration.currentCliVersion}`,
        },
    });

    await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
    });

    return socket;
}
