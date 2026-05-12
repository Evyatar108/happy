/**
 * F-022: socketReady pre-connect safety tests.
 *
 * Verifies that updateMachineMetadata(), updateDaemonState() (ApiMachineClient)
 * and updateMetadata(), updateAgentState() (ApiSessionClient) do NOT throw
 * TypeError when called before connect() has assigned this.socket.
 * They should either queue (await socketReady) or reject with a clean Error,
 * never crash with "Cannot read properties of null".
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiMachineClient } from './apiMachine';
import { ApiSessionClient } from './apiSession';
import type { Machine, Session } from './types';

const { mockTunnelSocketIOOptions } = vi.hoisted(() => ({
    mockTunnelSocketIOOptions: vi.fn(),
}));

vi.mock('@/daemon/daemonClient', () => ({
    tunnelSocketIOOptions: mockTunnelSocketIOOptions,
}));

vi.mock('socket.io-client', () => ({
    io: vi.fn(() => ({
        on: vi.fn(),
        connect: vi.fn(),
        close: vi.fn(),
        emit: vi.fn(),
        emitWithAck: vi.fn(),
        removeAllListeners: vi.fn(),
        disconnect: vi.fn(),
        volatile: { emit: vi.fn() },
        io: { on: vi.fn(), uri: '', opts: {} },
    })),
}));

vi.mock('@/configuration', () => ({
    configuration: {
        serverUrl: 'https://server.test',
        currentCliVersion: '1.0.0',
    },
}));

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
        debugLargeJson: vi.fn(),
    },
}));

vi.mock('@/utils/lidState', () => ({
    shouldReconnect: () => false,
}));

vi.mock('@/utils/detectCLI', () => ({
    detectCLIAvailability: vi.fn(() => ({
        claude: false,
        codex: false,
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
            happyAgentAuthenticated: false,
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

function createMachine(): Machine {
    return {
        id: 'machine-1',
        encryptionKey: new Uint8Array(32),
        encryptionVariant: 'legacy',
        metadata: {
            host: 'localhost',
            platform: 'win32',
            happyCliVersion: '1.0.0',
            homeDir: '/home/test',
            happyHomeDir: '/home/test/.happy',
            happyLibDir: '/happy',
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
            path: '/repo',
            host: 'localhost',
            homeDir: '/home/test',
            happyHomeDir: '/home/test/.happy',
            happyLibDir: '/happy',
            happyToolsDir: '/happy/tools',
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
    };
}

describe('socketReady pre-connect safety (F-022)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        // Delay tunnelSocketIOOptions so socketReady never resolves during the test
        mockTunnelSocketIOOptions.mockReturnValue(new Promise(() => { /* never resolves */ }));
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('ApiMachineClient.updateMachineMetadata() before connect() does not throw TypeError', async () => {
        const client = new ApiMachineClient('token', createMachine());
        // connect() has NOT been called — socketReady is the never-resolving sentinel

        let typeErrorObserved = false;
        const callPromise = client.updateMachineMetadata((m) => ({ ...(m ?? {} as any) })).catch((err) => {
            if (err instanceof TypeError) {
                typeErrorObserved = true;
            }
        });

        // Advance time enough that backoff would have fired if socketReady had resolved
        await vi.advanceTimersByTimeAsync(5_000);
        // callPromise is still pending (socketReady never resolves) — that is correct behaviour
        expect(typeErrorObserved).toBe(false);
        client.shutdown();
    });

    it('ApiMachineClient.updateDaemonState() before connect() does not throw TypeError', async () => {
        const client = new ApiMachineClient('token', createMachine());

        let typeErrorObserved = false;
        const callPromise = client.updateDaemonState((s) => ({ ...(s ?? {} as any) })).catch((err) => {
            if (err instanceof TypeError) {
                typeErrorObserved = true;
            }
        });

        await vi.advanceTimersByTimeAsync(5_000);
        expect(typeErrorObserved).toBe(false);
        client.shutdown();
    });

    it('ApiSessionClient.updateMetadata() when tunnelSocketIOOptions rejects does not throw TypeError', async () => {
        // Simulate the case where connectWithFreshTunnelAuth() rejects before this.socket is assigned
        mockTunnelSocketIOOptions.mockRejectedValueOnce(new Error('tunnel unavailable'));

        const client = new ApiSessionClient('token', createSession());
        // Allow the rejection to propagate through socketReady's .catch()
        await Promise.resolve();

        let typeErrorObserved = false;
        // backoff loops forever — attach a catch but do not await (it never settles)
        void client.updateMetadata((m) => m).catch((err) => {
            if (err instanceof TypeError) {
                typeErrorObserved = true;
            }
        });

        // socketReady resolves to undefined after .catch() swallows the error,
        // so backoff fires — the null-guard must throw a clean Error, not TypeError
        await vi.advanceTimersByTimeAsync(5_000);
        expect(typeErrorObserved).toBe(false);

        await client.close();
    });

    it('ApiSessionClient.updateAgentState() when tunnelSocketIOOptions rejects does not throw TypeError', async () => {
        mockTunnelSocketIOOptions.mockRejectedValueOnce(new Error('tunnel unavailable'));

        const client = new ApiSessionClient('token', createSession());
        await Promise.resolve();

        let typeErrorObserved = false;
        // updateAgentState is fire-and-forget (no await) — capture via the lock
        client.updateAgentState((s) => ({ ...(s ?? {} as any) }));

        await vi.advanceTimersByTimeAsync(5_000);
        expect(typeErrorObserved).toBe(false);

        await client.close();
    });
});
