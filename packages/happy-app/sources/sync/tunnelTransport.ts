import { type ManagerOptions, type SocketOptions } from 'socket.io-client';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import nacl from 'tweetnacl';

import { encodeBase64 } from '@/encryption/base64';
import { AuthCredentials } from '@/auth/tokenStorage';
import { getTunnelAuthorization } from '@/auth/machineAuth';

export type TunnelSocketOptions = Partial<ManagerOptions & SocketOptions>;

function getTunnelHappyClientId(): string {
    let platform: string = Platform.OS;
    if (platform === 'web' && typeof window !== 'undefined' && '__TAURI__' in window) {
        platform = 'desktop';
    }
    const version = Constants.expoConfig?.version || '0.0.0';
    return `${platform}/${version}`;
}

export function buildTunnelSocketOptions(credentials: AuthCredentials): TunnelSocketOptions {
    const happyClient = getTunnelHappyClientId();
    const headers = {
        'X-Tunnel-Authorization': getTunnelAuthorization(credentials),
        'X-Happy-Client': happyClient,
    };

    return {
        path: '/v1/updates',
        auth: {
            clientType: 'user-scoped' as const,
            happyClient,
            machineId: credentials.machineId,
        },
        extraHeaders: headers,
        transportOptions: {
            websocket: {
                extraHeaders: headers,
            },
        },
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity,
    };
}

export function deriveX25519SessionKey(localPrivateKey: Uint8Array, remotePublicKey: Uint8Array): string {
    return encodeBase64(nacl.box.before(remotePublicKey, localPrivateKey), 'base64url');
}

export function createX25519KeyPair(): nacl.BoxKeyPair {
    return nacl.box.keyPair();
}
