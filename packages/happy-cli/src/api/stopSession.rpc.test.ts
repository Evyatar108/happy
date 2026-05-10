import { describe, expect, it, vi } from 'vitest';

import { ApiMachineClient } from './apiMachine';
import type { Machine, MachineMetadata } from './types';

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
        debugLargeJson: vi.fn(),
    },
}));

function createMachine(): Machine {
    const metadata: MachineMetadata = {
        host: 'localhost',
        platform: 'win32',
        happyCliVersion: '1.0.0',
        homeDir: 'C:/Users/test',
        happyHomeDir: 'C:/Users/test/.happy',
        happyLibDir: 'C:/happy',
    };

    return {
        id: 'machine-1',
        encryptionKey: new Uint8Array(32),
        encryptionVariant: 'legacy',
        metadata,
        metadataVersion: 1,
        daemonState: null,
        daemonStateVersion: 1,
    };
}

function getStopRpcHandler(client: ApiMachineClient): (params: any) => Promise<any> {
    const manager = (client as any).rpcHandlerManager;
    return (manager as any).handlers.get('machine-1:stop-session');
}

describe('stop-session machine RPC', () => {
    it('forwards a well-formed sessionId to stopSession', async () => {
        const stopSession = vi.fn().mockResolvedValue(true);
        const client = new ApiMachineClient('token', createMachine());

        client.setRPCHandlers({
            spawnSession: vi.fn(),
            resumeSession: vi.fn(),
            forkSession: vi.fn(),
            stopSession,
            requestShutdown: vi.fn(),
        });

        const result = await getStopRpcHandler(client)({ sessionId: 'happy-session-abc' });
        expect(result).toMatchObject({ message: 'Session stopped' });
        expect(stopSession).toHaveBeenCalledWith('happy-session-abc');
    });

    it('forwards a well-formed PID- sessionId to stopSession', async () => {
        const stopSession = vi.fn().mockResolvedValue(true);
        const client = new ApiMachineClient('token', createMachine());

        client.setRPCHandlers({
            spawnSession: vi.fn(),
            resumeSession: vi.fn(),
            forkSession: vi.fn(),
            stopSession,
            requestShutdown: vi.fn(),
        });

        await getStopRpcHandler(client)({ sessionId: 'PID-1234' });
        expect(stopSession).toHaveBeenCalledWith('PID-1234');
    });

    it('rejects malformed sessionId at the RPC boundary without invoking stopSession', async () => {
        const stopSession = vi.fn();
        const client = new ApiMachineClient('token', createMachine());

        client.setRPCHandlers({
            spawnSession: vi.fn(),
            resumeSession: vi.fn(),
            forkSession: vi.fn(),
            stopSession,
            requestShutdown: vi.fn(),
        });

        const handler = getStopRpcHandler(client);
        const tooLong = 'a'.repeat(257);
        const malformedCases: unknown[] = [
            undefined,
            null,
            '',
            123,
            tooLong,
            'PID-',
            'PID-NaN',
            'PID-abc',
            'PID-1e9',
            'PID--1',
            'PID-12345678901',
        ];

        for (const sessionId of malformedCases) {
            await expect(handler({ sessionId })).rejects.toThrow();
        }

        expect(stopSession).not.toHaveBeenCalled();
    });

    it('throws when stopSession returns false for an unknown but well-formed sessionId', async () => {
        const stopSession = vi.fn().mockResolvedValue(false);
        const client = new ApiMachineClient('token', createMachine());

        client.setRPCHandlers({
            spawnSession: vi.fn(),
            resumeSession: vi.fn(),
            forkSession: vi.fn(),
            stopSession,
            requestShutdown: vi.fn(),
        });

        const handler = getStopRpcHandler(client);
        await expect(handler({ sessionId: 'PID-9999' })).rejects.toThrow(/not found|failed to stop/i);
        expect(stopSession).toHaveBeenCalledWith('PID-9999');
    });
});
