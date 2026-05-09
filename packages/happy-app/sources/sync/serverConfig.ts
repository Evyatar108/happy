import { MMKV } from 'react-native-mmkv';

// Separate MMKV instance for server config that persists across logouts
const serverConfigStorage = new MMKV({ id: 'server-config' });

const SERVER_KEY = 'custom-server-url';
const LOG_SERVER_KEY = 'log-server-url';
const DEFAULT_SERVER_URL = 'http://127.0.0.1:3005';
const MACHINE_SERVER_PREFIX = 'machine-server-url:';

export function getServerUrl(): string {
    return serverConfigStorage.getString(SERVER_KEY) || 
           process.env.EXPO_PUBLIC_HAPPY_SERVER_URL || 
           DEFAULT_SERVER_URL;
}

export function setServerUrl(url: string | null): void {
    if (url && url.trim()) {
        serverConfigStorage.set(SERVER_KEY, url.trim());
    } else {
        serverConfigStorage.delete(SERVER_KEY);
    }
}

export function getLogServerUrl(): string | null {
    return serverConfigStorage.getString(LOG_SERVER_KEY) ||
           process.env.EXPO_PUBLIC_LOG_SERVER_URL ||
           null;
}

export function setLogServerUrl(url: string | null): void {
    if (url && url.trim()) {
        serverConfigStorage.set(LOG_SERVER_KEY, url.trim());
    } else {
        serverConfigStorage.delete(LOG_SERVER_KEY);
    }
}

export function isUsingCustomServer(): boolean {
    return getServerUrl() !== DEFAULT_SERVER_URL;
}

export function getServerInfo(): { hostname: string; port?: number; isCustom: boolean } {
    const url = getServerUrl();
    const isCustom = isUsingCustomServer();
    
    try {
        const parsed = new URL(url);
        const port = parsed.port ? parseInt(parsed.port) : undefined;
        return {
            hostname: parsed.hostname,
            port,
            isCustom
        };
    } catch {
        // Fallback if URL parsing fails
        return {
            hostname: url,
            port: undefined,
            isCustom
        };
    }
}

export function validateServerUrl(url: string): { valid: boolean; error?: string } {
    if (!url || !url.trim()) {
        return { valid: false, error: 'Server URL cannot be empty' };
    }
    
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return { valid: false, error: 'Server URL must use HTTP or HTTPS protocol' };
        }
        return { valid: true };
    } catch {
        return { valid: false, error: 'Invalid URL format' };
    }
}

export function getMachineServerUrl(machineId: string): string | null {
    return serverConfigStorage.getString(`${MACHINE_SERVER_PREFIX}${machineId}`) ?? null;
}

export function setMachineServerUrl(machineId: string, url: string | null): void {
    const key = `${MACHINE_SERVER_PREFIX}${machineId}`;
    if (url && url.trim()) {
        serverConfigStorage.set(key, url.trim());
    } else {
        serverConfigStorage.delete(key);
    }
}

export function resolveMachineServerUrl(machineId: string, fallbackUrl: string): string {
    return getMachineServerUrl(machineId) ?? fallbackUrl;
}

export function getConfiguredMachineServerUrls(machineIds: string[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (const machineId of machineIds) {
        const url = getMachineServerUrl(machineId);
        if (url) {
            result[machineId] = url;
        }
    }
    return result;
}
