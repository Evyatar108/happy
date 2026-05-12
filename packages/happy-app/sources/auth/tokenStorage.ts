import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const AUTH_KEY = 'machine_credentials';

export interface AuthCredentials {
    machineId: string;
    tunnelUrl: string;
    tunnelClaim?: string;
    pinnedPubkey: string;
    sessionKey: string;
    firstSeenAt: number;
    login?: string;
    avatarUrl?: string;
    deviceCode?: string;
    deviceCodeExpiresAt?: number;
    // Real Dev Tunnels connect JWT (preferred over tunnelClaim for tunnel-level auth)
    connectToken?: string;
    connectTokenExpiry?: number;   // unix ms
    // GitHub token for connect token refresh (stored securely)
    githubToken: string;
    // Tunnel ID for connect token refresh
    tunnelId?: string;
}

interface StoredMachineCredentials {
    primaryMachineId: string | null;
    machines: AuthCredentials[];
    devTunnelsAccess: string | null;
}

function isStoredMachineCredentials(value: unknown): value is StoredMachineCredentials {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const candidate = value as Partial<StoredMachineCredentials>;
    return (candidate.primaryMachineId === null || typeof candidate.primaryMachineId === 'string') && Array.isArray(candidate.machines);
}

export function isOldShape(credentials: AuthCredentials): boolean {
    return Boolean(credentials.pinnedPubkey) || Boolean(credentials.sessionKey) || !credentials.tunnelClaim;
}

function parseStoredCredentials(stored: string | null): StoredMachineCredentials | null {
    if (!stored) {
        return null;
    }
    let parsed: AuthCredentials | StoredMachineCredentials;
    try {
        parsed = JSON.parse(stored) as AuthCredentials | StoredMachineCredentials;
    } catch {
        return null;
    }
    if (isStoredMachineCredentials(parsed)) {
        return {
            primaryMachineId: parsed.primaryMachineId,
            machines: parsed.machines,
            devTunnelsAccess: parsed.devTunnelsAccess ?? null,
        };
    }
    const legacy = parsed as AuthCredentials;
    if (!legacy.machineId) {
        return null;
    }
    return {
        primaryMachineId: legacy.machineId,
        machines: [legacy],
        devTunnelsAccess: null,
    };
}

function serializeCredentials(credentials: StoredMachineCredentials): string {
    return JSON.stringify(credentials);
}

export const TokenStorage = {
    async getCredentials(): Promise<AuthCredentials | null> {
        const stored = await this.getStoredCredentials();
        if (!stored) {
            return null;
        }
        return stored.machines.find(machine => machine.machineId === stored.primaryMachineId) ?? stored.machines[0] ?? null;
    },

    async getCredentialsList(): Promise<AuthCredentials[]> {
        const stored = await this.getStoredCredentials();
        return stored?.machines ?? [];
    },

    async getStoredCredentials(): Promise<StoredMachineCredentials | null> {
        if (Platform.OS === 'web') {
            const stored = localStorage.getItem(AUTH_KEY);
            return parseStoredCredentials(stored);
        }
        try {
            const stored = await SecureStore.getItemAsync(AUTH_KEY);
            return parseStoredCredentials(stored);
        } catch (error) {
            console.error('Error getting credentials:', error);
            return null;
        }
    },

    async setCredentials(credentials: AuthCredentials): Promise<boolean> {
        const existing = await this.getStoredCredentials();
        const machines = existing?.machines.filter(machine => machine.machineId !== credentials.machineId) ?? [];
        machines.push(credentials);
        const next: StoredMachineCredentials = {
            primaryMachineId: credentials.machineId,
            machines,
            devTunnelsAccess: existing?.devTunnelsAccess ?? null,
        };
        return await this.writeStoredCredentials(next);
    },

    async removeMachineCredentials(machineId: string): Promise<boolean> {
        const existing = await this.getStoredCredentials();
        if (!existing) {
            return true;
        }
        const machines = existing.machines.filter(machine => machine.machineId !== machineId);
        const primaryMachineId = existing.primaryMachineId === machineId
            ? machines[0]?.machineId ?? null
            : existing.primaryMachineId;
        return await this.writeStoredCredentials({
            primaryMachineId,
            machines,
            devTunnelsAccess: existing.devTunnelsAccess,
        });
    },

    async setDevTunnelsToken(token: string): Promise<void> {
        const existing = await this.getStoredCredentials();
        await this.writeStoredCredentials({
            primaryMachineId: existing?.primaryMachineId ?? null,
            machines: existing?.machines ?? [],
            devTunnelsAccess: token,
        });
    },

    async getDevTunnelsToken(): Promise<string | null> {
        const existing = await this.getStoredCredentials();
        return existing?.devTunnelsAccess ?? null;
    },

    async writeStoredCredentials(credentials: StoredMachineCredentials): Promise<boolean> {
        if (Platform.OS === 'web') {
            localStorage.setItem(AUTH_KEY, serializeCredentials(credentials));
            return true;
        }
        try {
            await SecureStore.setItemAsync(AUTH_KEY, serializeCredentials(credentials));
            return true;
        } catch (error) {
            console.error('Error setting credentials:', error);
            return false;
        }
    },

    async removeCredentials(): Promise<boolean> {
        if (Platform.OS === 'web') {
            localStorage.removeItem(AUTH_KEY);
            return true;
        }
        try {
            await SecureStore.deleteItemAsync(AUTH_KEY);
            return true;
        } catch (error) {
            console.error('Error removing credentials:', error);
            return false;
        }
    },
};
