import * as WebBrowser from 'expo-web-browser';

import { AuthCredentials } from './tokenStorage';
import { decodeBase64, encodeBase64 } from '@/encryption/base64';
import { getServerUrl } from '@/sync/serverConfig';
import { createX25519KeyPair, deriveX25519SessionKey } from '@/sync/tunnelTransport';

export { createX25519KeyPair };

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
    tunnelClaim: string;
};

export type DiscoveredMachine = {
    tunnelId: string;
    tunnelUrl: string;
    displayName: string;
    isOnline: boolean;
};

export type PairStatusResponse = {
    status: 'pending' | 'authorized';
    githubLogin?: string;
    githubToken?: string;
    machines?: PairMachine[];
    discoveredMachines?: DiscoveredMachine[];
};

export async function startPairing(): Promise<PairStartResponse> {
    const response = await fetch(`${getServerUrl()}/pair/start`);
    if (!response.ok) {
        throw new Error(`Failed to start pairing: ${response.status}`);
    }
    return await response.json() as PairStartResponse;
}

export async function pollPairing(deviceCode: string, localKeyPair?: ReturnType<typeof createX25519KeyPair>): Promise<PairStatusResponse> {
    const mobileEcdhPublicKey = localKeyPair ? encodeBase64(localKeyPair.publicKey, 'base64') : undefined;
    const response = await fetch(`${getServerUrl()}/pair/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_code: deviceCode, mobileEcdhPublicKey }),
    });
    if (!response.ok) {
        throw new Error(`Failed to poll pairing: ${response.status}`);
    }
    return await response.json() as PairStatusResponse;
}

export async function openGitHubDeviceFlow(pairing: PairStartResponse): Promise<void> {
    await WebBrowser.openBrowserAsync(pairing.verification_uri_complete ?? pairing.verification_uri);
}

export async function connectMachine(
    tunnelUrl: string,
    githubToken: string,
    localKeyPair?: ReturnType<typeof createX25519KeyPair>,
): Promise<PairMachine> {
    const mobileEcdhPublicKey = localKeyPair ? encodeBase64(localKeyPair.publicKey, 'base64') : undefined;
    const response = await fetch(`${tunnelUrl}/pair/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ githubToken, mobileEcdhPublicKey }),
    });
    if (!response.ok) {
        throw new Error(`Failed to connect to machine: ${response.status}`);
    }
    return await response.json() as PairMachine;
}

export function credentialsFromPairMachine(machine: PairMachine, localKeyPair: ReturnType<typeof createX25519KeyPair>): AuthCredentials {
    const sessionKey = deriveX25519SessionKey(localKeyPair.secretKey, decodeBase64(machine.x25519PublicKey, 'base64'));
    return {
        machineId: machine.machineId,
        tunnelUrl: machine.tunnelUrl,
        tunnelClaim: machine.tunnelClaim,
        pinnedPubkey: machine.ed25519PublicKey,
        sessionKey,
        firstSeenAt: Date.now(),
    };
}
