import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    sockets: [] as any[],
    io: vi.fn((endpoint: string, options: any) => {
        const handlers = new Map<string, (...args: any[]) => void>();
        const socket = {
            endpoint,
            options,
            recovered: false,
            id: endpoint,
            on: vi.fn((event: string, handler: (...args: any[]) => void) => {
                handlers.set(event, handler);
            }),
            onAny: vi.fn((handler: (...args: any[]) => void) => {
                handlers.set('*', handler);
            }),
            emit: vi.fn(),
            emitWithAck: vi.fn(async (_event: string, data: any) => ({ ok: true, result: data })),
            disconnect: vi.fn(),
            trigger: (event: string, ...args: any[]) => handlers.get(event)?.(...args),
            triggerAny: (event: string, data: any) => handlers.get('*')?.(event, data),
        };
        mocks.sockets.push(socket);
        return socket;
    }),
    credentials: [] as any[],
    markMachineDisconnected: vi.fn(),
}));

vi.mock('socket.io-client', () => ({
    io: mocks.io,
}));

vi.mock('expo-constants', () => ({
    default: { expoConfig: { version: '1.2.3' } },
}));

vi.mock('react-native', () => ({
    Platform: { OS: 'ios' },
}));

vi.mock('@/auth/tokenStorage', () => ({
    TokenStorage: {
        getCredentialsList: vi.fn(async () => mocks.credentials),
    },
}));

vi.mock('@/sync/refreshClaim', () => ({
    refreshTunnelClaim: vi.fn(async (_credentials: any, machineId: string) => `jwt-${machineId}-fresh`),
}));

vi.mock('./storage', () => ({
    storage: {
        getState: () => ({
            localSettings: { verboseLogging: false },
            markMachineDisconnected: mocks.markMachineDisconnected,
        }),
    },
}));

function credential(machineId: string) {
    return {
        machineId,
        tunnelUrl: `https://${machineId}.example.test`,
        tunnelClaim: `jwt-${machineId}`,
        pinnedPubkey: `pub-${machineId}`,
        sessionKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        firstSeenAt: 1,
        githubToken: `github-${machineId}`,
        tunnelId: `tunnel-${machineId}`,
        login: `login-${machineId}`,
        avatarUrl: `https://avatars.example.test/${machineId}.png`,
        deviceCode: `device-${machineId}`,
        deviceCodeExpiresAt: Date.now() + 60_000,
    };
}

describe('apiSocket multi-machine connections', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        mocks.sockets.length = 0;
        mocks.credentials = [credential('machine-a'), credential('machine-b')];
    });

    it('maintains one Socket.IO connection per configured machine', async () => {
        const { apiSocket } = await import('./apiSocket');
        await apiSocket.initializeMany(mocks.credentials.map((item) => ({
            config: { endpoint: item.tunnelUrl, credentials: item },
            encryption: {} as any,
        })));

        expect(apiSocket.getConnectionCount()).toBe(2);
        expect(mocks.io).toHaveBeenCalledTimes(2);
        expect(mocks.sockets.map(socket => socket.endpoint).sort()).toEqual([
            'https://machine-a.example.test',
            'https://machine-b.example.test',
        ]);
    });

    it('routes events with the source machine id and marks a disconnected machine stale', async () => {
        const { apiSocket } = await import('./apiSocket');
        await apiSocket.initializeMany(mocks.credentials.map((item) => ({
            config: { endpoint: item.tunnelUrl, credentials: item },
            encryption: {} as any,
        })));

        const handler = vi.fn();
        const stale = vi.fn();
        apiSocket.onMessage('update', handler);
        apiSocket.onMachineDisconnected(stale);

        mocks.sockets[1].triggerAny('update', { body: { t: 'new-session' } });
        mocks.sockets[1].trigger('disconnect');

        expect(handler).toHaveBeenCalledWith({ body: { t: 'new-session' } }, 'machine-b');
        expect(stale.mock.calls[0][0]).toBe('machine-b');
        expect(typeof stale.mock.calls[0][1]).toBe('number');
    });
});
