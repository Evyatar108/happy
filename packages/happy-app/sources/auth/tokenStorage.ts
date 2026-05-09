import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const AUTH_KEY = 'machine_credentials';

export interface AuthCredentials {
    machineId: string;
    tunnelUrl: string;
    tunnelClaim: string;
    pinnedPubkey: string;
    sessionKey: string;
    firstSeenAt: number;
}

interface StoredMachineCredentials {
    primaryMachineId: string;
    machines: AuthCredentials[];
}

function isStoredMachineCredentials(value: unknown): value is StoredMachineCredentials {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const candidate = value as Partial<StoredMachineCredentials>;
    return typeof candidate.primaryMachineId === 'string' && Array.isArray(candidate.machines);
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
        return parsed;
    }
    const legacy = parsed as AuthCredentials;
    if (!legacy.machineId) {
        return null;
    }
    return {
        primaryMachineId: legacy.machineId,
        machines: [legacy],
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
        };
        if (Platform.OS === 'web') {
            localStorage.setItem(AUTH_KEY, serializeCredentials(next));
            return true;
        }
        try {
            await SecureStore.setItemAsync(AUTH_KEY, serializeCredentials(next));
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
