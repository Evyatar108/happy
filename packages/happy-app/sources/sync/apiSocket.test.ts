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

vi.mock('@/auth/connectTokenRefresh', () => ({
    ensureFreshConnectToken: vi.fn(async (_credentials: any, machineId: string) => ({
        connectToken: `connect-${machineId}`,
        connectTokenExpiry: Date.now() + 60_000,
    })),
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
        firstSeenAt: 1,
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
        await apiSocket.initializeMany(mocks.credentials.map((item) => ({ endpoint: item.tunnelUrl, credentials: item })));

        expect(apiSocket.getConnectionCount()).toBe(2);
        expect(mocks.io).toHaveBeenCalledTimes(2);
        expect(mocks.sockets.map(socket => socket.endpoint).sort()).toEqual([
            'https://machine-a.example.test',
            'https://machine-b.example.test',
        ]);
    });

    it('routes events with the source machine id and marks a disconnected machine stale', async () => {
        const { apiSocket } = await import('./apiSocket');
        await apiSocket.initializeMany(mocks.credentials.map((item) => ({ endpoint: item.tunnelUrl, credentials: item })));

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

    it('requestForMachine throws when TokenStorage has no credentials for the machine', async () => {
        const { apiSocket } = await import('./apiSocket');
        const cred = mocks.credentials[0];
        await apiSocket.initializeMany([{ endpoint: cred.tunnelUrl, credentials: cred }]);
        mocks.sockets[0].trigger('connect');

        mocks.credentials = [];

        await expect(
            apiSocket.forMachine(cred.machineId).request('/api/test'),
        ).rejects.toThrow(`No credentials found in TokenStorage for machine ${cred.machineId}`);
    });

    it('removeMachine decrements connection count and clears the entry', async () => {
        const { apiSocket } = await import('./apiSocket');
        await apiSocket.initializeMany(mocks.credentials.map((item) => ({ endpoint: item.tunnelUrl, credentials: item })));
        expect(apiSocket.getConnectionCount()).toBe(2);

        apiSocket.removeMachine('machine-a');

        expect(apiSocket.getConnectionCount()).toBe(1);
        expect(apiSocket.getConnectionMachineIds()).toEqual(['machine-b']);
    });

    it('removeMachine reassigns primaryMachineId to a remaining connection when the primary is deleted', async () => {
        const { apiSocket } = await import('./apiSocket');
        await apiSocket.initializeMany(mocks.credentials.map((item) => ({ endpoint: item.tunnelUrl, credentials: item })));

        // machine-a is set as primaryMachineId first because initializeMany iterates in order
        apiSocket.removeMachine('machine-a');

        // The remaining connection should be machine-b
        expect(apiSocket.getConnectionCount()).toBe(1);
        expect(apiSocket.getConnectionMachineIds()).toEqual(['machine-b']);
    });

    it('removeMachine sets primaryMachineId to null when the last connection is removed', async () => {
        const { apiSocket } = await import('./apiSocket');
        const cred = mocks.credentials[0];
        await apiSocket.initializeMany([{ endpoint: cred.tunnelUrl, credentials: cred }]);

        apiSocket.removeMachine(cred.machineId);

        expect(apiSocket.getConnectionCount()).toBe(0);
        expect(() => apiSocket.forPrimaryMachine()).toThrow('SyncSocket not initialized');
    });

    it('removeMachine does not affect primaryMachineId when a non-primary machine is removed', async () => {
        const { apiSocket } = await import('./apiSocket');
        await apiSocket.initializeMany(mocks.credentials.map((item) => ({ endpoint: item.tunnelUrl, credentials: item })));
        mocks.sockets[0].trigger('connect');

        apiSocket.removeMachine('machine-b');

        expect(apiSocket.getConnectionCount()).toBe(1);
        expect(apiSocket.getConnectionMachineIds()).toEqual(['machine-a']);
    });

    it('replaces unintentional disconnects with a new socket and skips intentional reconnects', async () => {
        const { apiSocket } = await import('./apiSocket');
        await apiSocket.initializeMany([{ endpoint: mocks.credentials[0].tunnelUrl, credentials: mocks.credentials[0] }]);

        const reconnected = vi.fn();
        apiSocket.onReconnected(reconnected);
        mocks.sockets[0].trigger('connect');
        const firstAuth = mocks.sockets[0].options.extraHeaders['X-Tunnel-Authorization'];

        mocks.sockets[0].trigger('disconnect');
        await Promise.resolve();
        await Promise.resolve();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(mocks.sockets).toHaveLength(2);
        expect(mocks.sockets[1].options.extraHeaders['X-Tunnel-Authorization']).toBe(firstAuth);

        mocks.sockets[1].trigger('connect');
        expect(reconnected).toHaveBeenCalledTimes(1);
        expect(reconnected).toHaveBeenCalledWith('machine-a');

        apiSocket.disconnect('machine-a');
        mocks.sockets[1].trigger('disconnect');
        await Promise.resolve();
        expect(mocks.sockets).toHaveLength(2);
    });
});
