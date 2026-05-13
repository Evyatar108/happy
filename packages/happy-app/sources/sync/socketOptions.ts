import { type ManagerOptions, type SocketOptions } from 'socket.io-client';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { AuthCredentials } from '@/auth/tokenStorage';
import { getMachineAuthHeaders } from '@/auth/machineAuth';

export type TunnelSocketOptions = Partial<ManagerOptions & SocketOptions>;

function getTunnelHappyClientId(): string {
    let platform: string = Platform.OS;
    if (platform === 'web' && typeof window !== 'undefined' && '__TAURI__' in window) {
        platform = 'desktop';
    }
    const version = Constants.expoConfig?.version || '0.0.0';
    return `${platform}/${version}`;
}

export async function buildTunnelSocketOptions(credentials: AuthCredentials, machineId = credentials.machineId): Promise<TunnelSocketOptions> {
    const happyClient = getTunnelHappyClientId();
    const tunnelHeaders = await getMachineAuthHeaders(credentials, machineId);
    const headers = {
        ...tunnelHeaders,
        'X-Happy-Client': happyClient,
    };

    return {
        path: '/v1/updates',
        auth: {
            clientType: 'user-scoped' as const,
            happyClient,
            machineId,
        },
        extraHeaders: headers,
        transportOptions: {
            websocket: {
                extraHeaders: headers,
            },
        },
        transports: ['websocket'],
        reconnection: false,
    };
}
