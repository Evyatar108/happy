import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiMachineClient } from './apiMachine';
import { ApiSessionClient } from './apiSession';
import type { Machine, Session } from './types';

const {
    mockIo,
    mockTunnelSocketIOOptions,
    mockLoggerDebug,
} = vi.hoisted(() => ({
    mockIo: vi.fn(),
    mockTunnelSocketIOOptions: vi.fn(),
    mockLoggerDebug: vi.fn(),
}));

vi.mock('socket.io-client', () => ({
    io: mockIo,
}));

vi.mock('@/daemon/daemonClient', () => ({
    tunnelSocketIOOptions: mockTunnelSocketIOOptions,
}));

vi.mock('@/configuration', () => ({
    configuration: {
        serverUrl: 'https://server.test',
        currentCliVersion: '1.2.3',
    },
}));

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: mockLoggerDebug,
        debugLargeJson: vi.fn(),
    },
}));

vi.mock('@/utils/lidState', () => ({
    shouldReconnect: () => true,
}));

vi.mock('@/utils/detectCLI', () => ({
    detectCLIAvailability: vi.fn(() => ({
        claude: true,
        codex: true,
        gemini: false,
        openclaw: false,
        detectedAt: 1,
    })),
}));

vi.mock('@/resume/localHappyAgentAuth', async () => {
    const actual = await vi.importActual<typeof import('@/resume/localHappyAgentAuth')>('@/resume/localHappyAgentAuth');
    return {
        ...actual,
        detectResumeSupport: vi.fn(() => ({
            rpcAvailable: false,
            forkRpcAvailable: false,
            requiresSameMachine: true,
            requiresHappyAgentAuth: true,
            happyAgentAuthenticated: true,
            detectedAt: 1,
        })),
    };
});

vi.mock('@/api/rpc/RpcHandlerManager', () => ({
    RpcHandlerManager: class {
        onSocketConnect = vi.fn();
        onSocketDisconnect = vi.fn();
        handleRequest = vi.fn(async () => '');
        registerHandler = vi.fn();
        unregisterHandler = vi.fn();
        hasHandler = vi.fn(() => false);
    },
}));

vi.mock('@/modules/common/registerCommonHandlers', () => ({
    registerCommonHandlers: vi.fn(),
    isSupportedAgent: vi.fn(() => true),
}));

type Handler = (...args: any[]) => void;

function makeSocket() {
    const handlers = new Map<string, Handler[]>();
    const managerHandlers = new Map<string, Handler[]>();
    const socket = {
        auth: {},
        connected: false,
        io: {
            uri: '',
            opts: {},
            on: vi.fn((event: string, handler: Handler) => {
                managerHandlers.set(event, [...(managerHandlers.get(event) ?? []), handler]);
            }),
        },
        on: vi.fn((event: string, handler: Handler) => {
            handlers.set(event, [...(handlers.get(event) ?? []), handler]);
        }),
        connect: vi.fn(),
        disconnect: vi.fn(),
        removeAllListeners: vi.fn(),
        close: vi.fn(),
        emit: vi.fn(),
        emitWithAck: vi.fn(),
        volatile: { emit: vi.fn() },
        trigger(event: string, ...args: any[]) {
            for (const handler of handlers.get(event) ?? []) {
                handler(...args);
            }
        },
    };
    return socket;
}

function createMachine(): Machine {
    return {
        id: 'machine-1',
        encryptionKey: new Uint8Array(32),
        encryptionVariant: 'legacy',
        metadata: {
            host: 'localhost',
            platform: 'win32',
            happyCliVersion: '1.2.3',
            homeDir: 'C:/Users/test',
            happyHomeDir: 'C:/Users/test/.happy',
            happyLibDir: 'C:/happy',
        },
        metadataVersion: 1,
        daemonState: null,
        daemonStateVersion: 1,
    };
}

function createSession(): Session {
    return {
        id: 'session-1',
        seq: 0,
        encryptionKey: new Uint8Array(32),
        encryptionVariant: 'legacy',
        metadata: {
            path: 'C:/repo',
            host: 'localhost',
            homeDir: 'C:/Users/test',
            happyHomeDir: 'C:/Users/test/.happy',
            happyLibDir: 'C:/happy',
            happyToolsDir: 'C:/happy/tools',
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
    };
}

async function waitFor(check: () => void): Promise<void> {
    let lastError: unknown;
    for (let i = 0; i < 40; i += 1) {
        try {
            check();
            return;
        } catch (error) {
            lastError = error;
            await Promise.resolve();
        }
    }
    throw lastError;
}

describe('Socket.IO tunnel listener reconnect', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        mockTunnelSocketIOOptions
            .mockResolvedValueOnce({ url: 'http://127.0.0.1:7010', auth: {} })
            .mockResolvedValueOnce({ url: 'http://127.0.0.1:7010', auth: {} });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('retargets the machine socket to the tunnel listener without Happy claim auth', async () => {
        const socket = makeSocket();
        mockIo.mockImplementation((url: string, options: any) => {
            socket.io.uri = url;
            socket.io.opts = options;
            socket.auth = options.auth;
            return socket;
        });
        const client = new ApiMachineClient('token', createMachine());

        client.connect();

        await waitFor(() => {
            expect(mockIo).toHaveBeenCalledWith('http://127.0.0.1:7010', expect.objectContaining({
                auth: expect.objectContaining({
                    clientType: 'machine-scoped',
                    machineId: 'machine-1',
                }),
                path: '/v1/updates',
                reconnection: false,
            }));
            expect(socket.connect).toHaveBeenCalledTimes(1);
        });
        expect((mockIo.mock.calls[0][1] as any).auth).not.toHaveProperty('tunnelAuthorization');
        expect((mockIo.mock.calls[0][1] as any).auth).not.toHaveProperty('codexuAuthorization');

        socket.trigger('connect_error', new Error('Unauthorized'));
        await vi.advanceTimersByTimeAsync(1_000);

        await waitFor(() => {
            expect(socket.connect).toHaveBeenCalledTimes(2);
        });
        expect((socket.auth as any).tunnelAuthorization).toBeUndefined();
        expect((socket.auth as any).codexuAuthorization).toBeUndefined();

        client.shutdown();
    });

    it('retargets the session socket before initial connect without Happy claim auth', async () => {
        const socket = makeSocket();
        mockIo.mockImplementation((url: string, options: any) => {
            socket.io.uri = url;
            socket.io.opts = options;
            socket.auth = options.auth;
            return socket;
        });
        const client = new ApiSessionClient('token', createSession());

        await waitFor(() => {
            expect(socket.connect).toHaveBeenCalledTimes(1);
            expect(socket.io.uri).toBe('http://127.0.0.1:7010');
            expect(socket.auth).toMatchObject({
                clientType: 'session-scoped',
                sessionId: 'session-1',
            });
            expect((socket.io as any).opts.auth).toMatchObject({
                clientType: 'session-scoped',
                sessionId: 'session-1',
            });
        });
        expect((socket.auth as any).tunnelAuthorization).toBeUndefined();
        expect((socket.auth as any).codexuAuthorization).toBeUndefined();

        socket.trigger('connect_error', new Error('Unauthorized'));
        await vi.advanceTimersByTimeAsync(1_000);

        await waitFor(() => {
            expect(socket.connect).toHaveBeenCalledTimes(2);
        });
        expect((socket.auth as any).tunnelAuthorization).toBeUndefined();
        expect((socket.auth as any).codexuAuthorization).toBeUndefined();

        await client.close();
    });
});
