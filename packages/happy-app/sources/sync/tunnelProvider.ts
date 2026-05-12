import Constants from 'expo-constants';
import { MachineTunnelSchema, type MachineTunnel } from '@slopus/happy-wire';

export type { MachineTunnel };

export type DevTunnelsCredentials = {
    getDevTunnelsToken(): Promise<string | null>;
    setDevTunnelsToken(token: string): Promise<void>;
};

export interface ClientTunnelProvider {
    listMachineTunnels(): Promise<MachineTunnel[]>;
    getConnectToken(tunnelId: string): Promise<string>;
    deleteTunnel(tunnelId: string): Promise<void>;
    isLoggedIn(): Promise<boolean>;
    loginInteractive(): Promise<void>;
}

export type DevTunnelsClientProviderOptions = {
    credentials: DevTunnelsCredentials;
    apiBaseUrl?: string;
    fetchImpl?: typeof fetch;
    loginInteractive?: () => Promise<string>;
};

const API_VERSION = '2023-09-27-preview';
const DEFAULT_API_BASE_URL = 'https://global.rel.tunnels.api.visualstudio.com';

type RawTunnel = Record<string, unknown>;

export class DevTunnelsTokenExpired extends Error {
    constructor() {
        super('Dev Tunnels token expired or was revoked. Sign in again.');
        this.name = 'DevTunnelsTokenExpired';
    }
}

function authHeaders(token: string): Record<string, string> {
    const version = Constants.expoConfig?.version ?? '0.1.0';
    return {
        Authorization: `github ${token}`,
        'X-Tunnel-User-Agent': `happy-agent/${version}`,
    };
}

function apiUrl(baseUrl: string, path: string, params: Record<string, string>): string {
    const url = new URL(`${baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }
    return url.toString();
}

function responseTunnels(data: unknown): RawTunnel[] {
    const root = data as { value?: unknown };
    if (!Array.isArray(root.value)) return [];

    const tunnels: RawTunnel[] = [];
    for (const item of root.value) {
        const group = item as { value?: unknown };
        if (Array.isArray(group.value)) {
            tunnels.push(...group.value.filter((entry): entry is RawTunnel => typeof entry === 'object' && entry !== null));
        } else if (typeof item === 'object' && item !== null) {
            tunnels.push(item as RawTunnel);
        }
    }
    return tunnels;
}

function stringValue(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function labelsFor(tunnel: RawTunnel): string[] {
    const raw = Array.isArray(tunnel.labels) ? tunnel.labels : Array.isArray(tunnel.tags) ? tunnel.tags : [];
    return raw.filter((label): label is string => typeof label === 'string' && label.length > 0);
}

function portUrl(tunnel: RawTunnel): string | null {
    const ports = Array.isArray(tunnel.ports) ? tunnel.ports : [];
    for (const port of ports) {
        if (typeof port !== 'object' || port === null) continue;
        const values = port as RawTunnel;
        const url = stringValue(values.portForwardingUri) ?? stringValue(values.webForwardingUri) ?? stringValue(values.url);
        if (url) return url;
    }
    return null;
}

function machineIdFor(tunnel: RawTunnel, labels: string[], tunnelId: string): string {
    const custom = tunnel.customProperties;
    if (typeof custom === 'object' && custom !== null) {
        const machineId = stringValue((custom as RawTunnel).machineId);
        if (machineId) return machineId;
    }
    for (const label of labels) {
        if (label.startsWith('machineId:')) return label.slice('machineId:'.length);
        if (label.startsWith('machineId=')) return label.slice('machineId='.length);
    }
    return tunnelId;
}

function ownerFor(tunnel: RawTunnel): string {
    const owner = tunnel.owner;
    if (typeof owner === 'object' && owner !== null) {
        const login = stringValue((owner as RawTunnel).login) ?? stringValue((owner as RawTunnel).name) ?? stringValue((owner as RawTunnel).id);
        if (login) return login;
    }
    return stringValue(tunnel.ownerId) ?? stringValue(tunnel.userId) ?? '';
}

function mapTunnel(tunnel: RawTunnel): MachineTunnel {
    const tunnelId = stringValue(tunnel.tunnelId) ?? stringValue(tunnel.id) ?? stringValue(tunnel.name);
    if (!tunnelId) throw new Error('Dev Tunnels response did not include a tunnel id');
    const labels = labelsFor(tunnel);
    return MachineTunnelSchema.parse({
        machineId: machineIdFor(tunnel, labels, tunnelId),
        tunnelId,
        url: stringValue(tunnel.tunnelUri)
            ?? stringValue(tunnel.webForwardingUri)
            ?? stringValue(tunnel.connectUrl)
            ?? stringValue(tunnel.url)
            ?? portUrl(tunnel)
            ?? `https://${tunnelId}.devtunnels.ms`,
        tags: labels,
        lastSeenAt: stringValue(tunnel.lastHostConnectionTime) ?? stringValue(tunnel.updatedAt) ?? Date.now(),
        owner: ownerFor(tunnel),
    });
}

export class DevTunnelsClientProvider implements ClientTunnelProvider {
    private readonly credentials: DevTunnelsCredentials;
    private readonly apiBaseUrl: string;
    private readonly fetchImpl: typeof fetch;
    private readonly interactiveLogin?: () => Promise<string>;

    constructor(options: DevTunnelsClientProviderOptions) {
        this.credentials = options.credentials;
        this.apiBaseUrl = options.apiBaseUrl ?? DEFAULT_API_BASE_URL;
        this.fetchImpl = options.fetchImpl ?? fetch;
        this.interactiveLogin = options.loginInteractive;
    }

    async listMachineTunnels(): Promise<MachineTunnel[]> {
        const token = await this.requireToken();
        const response = await this.fetchImpl(apiUrl(this.apiBaseUrl, '/tunnels', {
            includePorts: 'true',
            global: 'true',
            labels: 'happy-machine',
            'api-version': API_VERSION,
        }), { headers: authHeaders(token) });
        if (response.status === 401) throw new DevTunnelsTokenExpired();
        if (!response.ok) throw new Error(`Failed to list Dev Tunnels machines: ${response.status}`);
        return responseTunnels(await response.json()).map(mapTunnel);
    }

    async getConnectToken(tunnelId: string): Promise<string> {
        const token = await this.requireToken();
        const response = await this.fetchImpl(apiUrl(this.apiBaseUrl, `/tunnels/${encodeURIComponent(tunnelId)}`, {
            tokenScopes: 'connect',
            'api-version': API_VERSION,
        }), { headers: authHeaders(token) });
        if (response.status === 401) throw new DevTunnelsTokenExpired();
        if (!response.ok) throw new Error(`Failed to fetch Dev Tunnel connect token: ${response.status}`);
        const data = await response.json() as { accessTokens?: { connect?: unknown }; accessToken?: unknown };
        const connectToken = stringValue(data.accessTokens?.connect) ?? stringValue(data.accessToken);
        if (!connectToken) throw new Error(`Dev Tunnel ${tunnelId} did not return a connect token`);
        return connectToken;
    }

    async deleteTunnel(tunnelId: string): Promise<void> {
        const token = await this.requireToken();
        const response = await this.fetchImpl(apiUrl(this.apiBaseUrl, `/tunnels/${encodeURIComponent(tunnelId)}`, {
            'api-version': API_VERSION,
        }), { method: 'DELETE', headers: authHeaders(token) });
        if (response.status === 401) throw new DevTunnelsTokenExpired();
        if (!response.ok) throw new Error(`Failed to delete Dev Tunnel: ${response.status}`);
    }

    async isLoggedIn(): Promise<boolean> {
        return (await this.credentials.getDevTunnelsToken()) !== null;
    }

    async loginInteractive(): Promise<void> {
        if (!this.interactiveLogin) {
            throw new Error('Dev Tunnels interactive login is not configured.');
        }
        const token = await this.interactiveLogin();
        await this.credentials.setDevTunnelsToken(token);
    }

    private async requireToken(): Promise<string> {
        const token = await this.credentials.getDevTunnelsToken();
        if (!token) throw new Error('Dev Tunnels token is missing. Sign in first.');
        return token;
    }
}
