import { describe, expect, it, vi } from 'vitest';
import { AgentStateSchema, type Session } from '@/sync/storageTypes';
import { getSessionMode, useSessionStatus } from './sessionUtils';

vi.mock('@/text', () => ({
    t: (key: string) => key,
}));

vi.mock('react', () => ({
    default: { useMemo: (fn: () => unknown) => fn() },
    useMemo: (fn: () => unknown) => fn(),
}));

function createSession(agentState: Session['agentState']): Pick<Session, 'agentState'> {
    return { agentState };
}

describe('getSessionMode', () => {
    it('defaults legacy sessions without controlledByUser to remote', () => {
        const legacyState = AgentStateSchema.parse({});

        expect(getSessionMode(createSession(legacyState))).toBe('remote');
    });

    it('maps new CLI controlledByUser state to local or remote', () => {
        const localState = AgentStateSchema.parse({ controlledByUser: true });
        const remoteState = AgentStateSchema.parse({ controlledByUser: false });

        expect(getSessionMode(createSession(localState))).toBe('local');
        expect(getSessionMode(createSession(remoteState))).toBe('remote');
    });
});

describe('useSessionStatus', () => {
    function makeStatusSession(overrides: Partial<Session> = {}): Session {
        return {
            id: 'session-1',
            presence: 'online',
            activeAt: 100,
            thinking: false,
            agentState: AgentStateSchema.parse({}),
            metadata: { path: '/repo', host: 'host' },
            ...overrides,
        } as Session;
    }

    it('reports waiting instead of thinking after turn-end clears session.thinking', () => {
        expect(useSessionStatus(makeStatusSession({ thinking: false })).state).toBe('waiting');
    });
});
