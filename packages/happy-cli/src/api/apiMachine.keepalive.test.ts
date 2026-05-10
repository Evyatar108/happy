import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiMachineClient } from './apiMachine';
import type { Machine, MachineMetadata } from './types';

const { mockDetectCLIAvailability, mockDetectResumeSupport } = vi.hoisted(() => ({
    mockDetectCLIAvailability: vi.fn(),
    mockDetectResumeSupport: vi.fn(),
}));

vi.mock('@/utils/detectCLI', () => ({
    detectCLIAvailability: mockDetectCLIAvailability,
}));

vi.mock('@/resume/localHappyAgentAuth', async () => {
    const actual = await vi.importActual<typeof import('@/resume/localHappyAgentAuth')>('@/resume/localHappyAgentAuth');
    return {
        ...actual,
        detectResumeSupport: mockDetectResumeSupport,
    };
});

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
        debugLargeJson: vi.fn(),
    },
}));

function createMachine(metadata: MachineMetadata): Machine {
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

describe('ApiMachineClient keepalive metadata refresh', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        mockDetectCLIAvailability.mockReturnValue({
            claude: true,
            codex: true,
            gemini: false,
            openclaw: false,
            detectedAt: 100,
        });
        mockDetectResumeSupport.mockReturnValue({
            rpcAvailable: false,
            forkRpcAvailable: false,
            requiresSameMachine: true,
            requiresHappyAgentAuth: true,
            happyAgentAuthenticated: true,
            detectedAt: 100,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('preserves forkRpcAvailable after one keepalive metadata refresh', async () => {
        const machine = createMachine({
            host: 'localhost',
            platform: 'win32',
            happyCliVersion: '1.0.0',
            homeDir: 'C:/Users/test',
            happyHomeDir: 'C:/Users/test/.happy',
            happyLibDir: 'C:/happy',
            resumeSupport: {
                rpcAvailable: true,
                forkRpcAvailable: true,
                requiresSameMachine: true,
                requiresHappyAgentAuth: true,
                happyAgentAuthenticated: true,
                detectedAt: 1,
            },
        });
        const client = new ApiMachineClient('token', machine);
        const updatedMetadata: MachineMetadata[] = [];

        (client as any).socket = { emit: vi.fn(), close: vi.fn() };
        client.setRPCHandlers({
            spawnSession: vi.fn(),
            resumeSession: vi.fn(),
            stopSession: vi.fn(),
            requestShutdown: vi.fn(),
        });
        vi.spyOn(client, 'updateMachineMetadata').mockImplementation(async (handler) => {
            const updated = handler(machine.metadata);
            updatedMetadata.push(updated);
            machine.metadata = updated;
        });

        (client as any).startKeepAlive();
        await vi.advanceTimersByTimeAsync(20_000);
        client.shutdown();

        expect(updatedMetadata).toHaveLength(1);
        expect(updatedMetadata[0].resumeSupport?.forkRpcAvailable).toBe(true);
        expect(updatedMetadata[0].resumeSupport?.rpcAvailable).toBe(true);
    });
});
