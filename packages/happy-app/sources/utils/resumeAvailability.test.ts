import { describe, expect, it, vi } from 'vitest';
import { getResumeAvailability } from './resumeAvailability';
import type { Machine, Session } from '@/sync/storageTypes';

vi.mock('@/text', () => ({
    t: (key: string) => `translated:${key}`,
}));

function createSession(metadata: Partial<NonNullable<Session['metadata']>> | null): Session {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: false,
        activeAt: 1,
        metadata: metadata ? {
            path: '/workspace/project',
            host: 'devbox',
            ...metadata,
        } : null,
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 0,
        presence: 1,
        permissionModeUserChosen: false,
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
        },
        metadataVersion: 1,
        daemonState: null,
        daemonStateVersion: 1,
        ...overrides,
    };
}

describe('getResumeAvailability', () => {
    it('hides resume controls for connected sessions', () => {
        expect(getResumeAvailability(createSession({ machineId: 'machine-1', claudeSessionId: 'claude-1' }), createMachine(), true)).toEqual({
            canResume: false,
            canShowResume: false,
            subtitle: '',
            message: '',
        });
    });

    it('reports missing machine metadata', () => {
        const message = 'translated:sessionInfo.resumeSessionMissingMachine';

        expect(getResumeAvailability(createSession({ claudeSessionId: 'claude-1' }), null, false)).toEqual({
            canResume: false,
            canShowResume: true,
            subtitle: message,
            message,
        });
    });

    it('reports missing backend resume ids for Claude and Codex', () => {
        const message = 'translated:sessionInfo.resumeSessionMissingBackendId';

        expect(getResumeAvailability(createSession({ machineId: 'machine-1' }), createMachine(), false)).toEqual({
            canResume: false,
            canShowResume: true,
            subtitle: message,
            message,
        });
    });

    it('reports same-machine-only when the source machine is unavailable locally', () => {
        const message = 'translated:sessionInfo.resumeSessionSameMachineOnly';

        expect(getResumeAvailability(createSession({ machineId: 'machine-1', codexThreadId: 'thread-1' }), null, false)).toEqual({
            canResume: false,
            canShowResume: true,
            subtitle: message,
            message,
        });
    });

    it('reports machine offline before allowing RPC resume', () => {
        const message = 'translated:sessionInfo.resumeSessionMachineOffline';

        expect(getResumeAvailability(
            createSession({ machineId: 'machine-1', claudeSessionId: 'claude-1' }),
            createMachine({ active: false }),
            false,
        )).toEqual({
            canResume: false,
            canShowResume: true,
            subtitle: message,
            message,
        });
    });

    it('reports the copy-command fallback when resume RPC is unsupported', () => {
        const message = 'translated:sessionInfo.resumeSessionNeedsHappyAgent';

        expect(getResumeAvailability(
            createSession({ machineId: 'machine-1', claudeSessionId: 'claude-1' }),
            createMachine({
                metadata: {
                    host: 'devbox',
                    platform: 'win32',
                    happyCliVersion: '1.0.0',
                    happyHomeDir: '/home/user/.happy',
                    homeDir: '/home/user',
                    resumeSupport: {
                        rpcAvailable: false,
                        requiresSameMachine: true,
                        requiresHappyAgentAuth: false,
                        happyAgentAuthenticated: true,
                        detectedAt: 1,
                    },
                },
            }),
            false,
        )).toEqual({
            canResume: false,
            canShowResume: true,
            subtitle: message,
            message,
        });
    });

    it('allows resume when disconnected, ids exist, machine is online, and RPC is available', () => {
        const message = 'translated:sessionInfo.resumeSessionSubtitle';

        expect(getResumeAvailability(
            createSession({ machineId: 'machine-1', codexThreadId: 'thread-1' }),
            createMachine({
                metadata: {
                    host: 'devbox',
                    platform: 'win32',
                    happyCliVersion: '1.0.0',
                    happyHomeDir: '/home/user/.happy',
                    homeDir: '/home/user',
                    resumeSupport: {
                        rpcAvailable: true,
                        requiresSameMachine: true,
                        requiresHappyAgentAuth: false,
                        happyAgentAuthenticated: true,
                        detectedAt: 1,
                    },
                },
            }),
            false,
        )).toEqual({
            canResume: true,
            canShowResume: true,
            subtitle: message,
            message,
        });
    });
});
