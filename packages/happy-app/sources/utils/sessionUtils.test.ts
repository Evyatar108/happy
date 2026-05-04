import { describe, expect, it, vi } from 'vitest';
import { AgentStateSchema, type Session } from '@/sync/storageTypes';
import { getSessionMode } from './sessionUtils';

vi.mock('@/text', () => ({
    t: (key: string) => key,
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
