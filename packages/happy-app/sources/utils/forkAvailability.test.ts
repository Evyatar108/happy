import { describe, expect, it } from 'vitest';
import { forkAvailability } from './forkAvailability';
import type { Machine, Session } from '@/sync/storageTypes';

function createSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: {
            path: '/workspace/project',
            host: 'devbox',
            flavor: 'codex',
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 0,
        presence: 'online',
        permissionModeUserChosen: false,
        ...overrides,
    };
}

function createMachine(overrides: Partial<Machine> = {}): Machine {
    return {
        id: 'machine-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: {
            host: 'devbox',
            platform: 'win32',
            happyCliVersion: '1.0.0',
            happyHomeDir: '/home/user/.happy',
            homeDir: '/home/user',
            resumeSupport: {
                rpcAvailable: true,
                forkRpcAvailable: true,
                requiresSameMachine: true,
                requiresHappyAgentAuth: true,
                happyAgentAuthenticated: true,
                detectedAt: 1,
            },
        },
        metadataVersion: 1,
        daemonState: null,
        daemonStateVersion: 1,
        ...overrides,
    };
}

describe('forkAvailability', () => {
    it('returns false when the machine is offline', () => {
        expect(forkAvailability(createSession(), createMachine({ active: false }))).toBe(false);
    });

    it('returns false when happy-agent is not authenticated', () => {
        expect(forkAvailability(createSession(), createMachine({
            metadata: {
                ...createMachine().metadata!,
                resumeSupport: {
                    ...createMachine().metadata!.resumeSupport!,
                    happyAgentAuthenticated: false,
                },
            },
        }))).toBe(false);
    });

    it('returns false when fork RPC capability is absent or false', () => {
        expect(forkAvailability(createSession(), createMachine({
            metadata: {
                ...createMachine().metadata!,
                resumeSupport: {
                    ...createMachine().metadata!.resumeSupport!,
                    forkRpcAvailable: false,
                },
            },
        }))).toBe(false);

        const { forkRpcAvailable: _forkRpcAvailable, ...resumeSupportWithoutFork } = createMachine().metadata!.resumeSupport!;
        expect(forkAvailability(createSession(), createMachine({
            metadata: {
                ...createMachine().metadata!,
                resumeSupport: resumeSupportWithoutFork,
            },
        }))).toBe(false);
    });

    it('returns false for non-Codex sessions', () => {
        expect(forkAvailability(createSession({
            metadata: {
                path: '/workspace/project',
                host: 'devbox',
                flavor: 'claude',
            },
        }), createMachine())).toBe(false);
    });

    it('returns true for capable Codex sessions, including active parents', () => {
        expect(forkAvailability(createSession({ active: true, thinking: true, presence: 'online' }), createMachine())).toBe(true);
    });
});
