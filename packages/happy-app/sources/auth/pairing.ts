import * as WebBrowser from 'expo-web-browser';

import { AuthCredentials } from './tokenStorage';
import { decodeBase64 } from '@/encryption/base64';
import { getServerUrl } from '@/sync/serverConfig';
import { createX25519KeyPair, deriveX25519SessionKey } from '@/sync/tunnelTransport';

export type PairStartResponse = {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete?: string;
    expires_in: number;
    interval: number;
};

export type PairMachine = {
    machineId: string;
    tunnelUrl: string;
    ed25519PublicKey: string;
    x25519PublicKey: string;
    ed25519Fingerprint?: string;
    tunnelJwt: string;
};

export type PairStatusResponse = {
    status: 'pending' | 'authorized';
    machines?: PairMachine[];
};

export async function startPairing(): Promise<PairStartResponse> {
    const response = await fetch(`${getServerUrl()}/pair/start`);
    if (!response.ok) {
        throw new Error(`Failed to start pairing: ${response.status}`);
    }
    return await response.json() as PairStartResponse;
}

export async function pollPairing(deviceCode: string): Promise<PairStatusResponse> {
    const response = await fetch(`${getServerUrl()}/pair/status?device_code=${encodeURIComponent(deviceCode)}`);
    if (!response.ok) {
        throw new Error(`Failed to poll pairing: ${response.status}`);
    }
    return await response.json() as PairStatusResponse;
}

export async function openGitHubDeviceFlow(pairing: PairStartResponse): Promise<void> {
    await WebBrowser.openBrowserAsync(pairing.verification_uri_complete ?? pairing.verification_uri);
}

export function credentialsFromPairMachine(machine: PairMachine): AuthCredentials {
    const localKeyPair = createX25519KeyPair();
    const sessionKey = deriveX25519SessionKey(localKeyPair.secretKey, decodeBase64(machine.x25519PublicKey, 'base64'));
    return {
        machineId: machine.machineId,
        tunnelUrl: machine.tunnelUrl,
        tunnelJwt: machine.tunnelJwt,
        pinnedPubkey: machine.ed25519PublicKey,
        sessionKey,
        firstSeenAt: Date.now(),
    };
}
