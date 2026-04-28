import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from './storageTypes';

vi.mock('@/realtime/RealtimeSession', () => ({
    getCurrentRealtimeSessionId: () => null,
    getVoiceSession: () => null,
}));

vi.mock('@/utils/sessionUtils', () => ({
    getSessionName: () => 'Test Session',
    getSessionSubtitle: () => 'Test Project',
    getSessionAvatarId: () => 'test-avatar',
}));

vi.mock('@/components/tools/knownTools', () => ({
    isMutableTool: () => true,
}));

vi.mock('./projectManager', () => ({
    projectManager: {
        updateSessions: vi.fn(),
        updateSessionProjectGitStatus: vi.fn(),
        getProjects: () => [],
        getProject: () => null,
        getProjectForSession: () => null,
        getProjectSessions: () => [],
        getProjectGitStatus: () => null,
        getSessionProjectGitStatus: () => null,
    },
}));

vi.mock('./sync', () => ({
    sync: {
        assumeUsers: vi.fn(async () => undefined),
        applySettings: vi.fn(),
    },
}));

vi.mock('expo-modules-core', () => ({
    requireOptionalNativeModule: () => null,
}));

type TestSession = Omit<Session, 'presence' | 'permissionModeUserChosen'> & {
    permissionModeUserChosen?: boolean;
};

function createSession(id: string, overrides: Partial<TestSession> = {}): TestSession {
    return {
        id,
        seq: 1,
        createdAt: 100,
        updatedAt: 100,
        active: true,
        activeAt: 100,
        metadata: {
            path: '/tmp/project',
            host: 'local-machine',
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 0,
        ...overrides,
    };
}

async function importFreshStorage() {
    const module = await import('./storage');
    return module.storage;
}

describe('storage.applySessions — renderWindow / activePrefetch field preservation', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('preserves renderWindow and activePrefetch when an advanced agentStateVersion triggers reducer re-merge', async () => {
        const storage = await importFreshStorage();
        const sessionId = 'session-preserve';

        // Seed a baseline session at agentStateVersion 1.
        storage.getState().applySessions([createSession(sessionId, {
            agentState: { requests: {}, completedRequests: {} } as Session['agentState'],
            agentStateVersion: 1,
        })]);

        // Initialize SessionMessages so the reducer-merge branch fires on the next applySessions call.
        storage.getState().applyMessagesLoaded(sessionId);

        // Establish concrete renderWindow and activePrefetch.
        storage.getState().setRenderWindow(sessionId, { firstSeq: 100, lastSeq: 200 });
        storage.getState().setActivePrefetch(sessionId, {
            requestId: 'req-survives',
            generation: 3,
            direction: 'older',
            targetSeq: 50,
            issuedAt: 1234,
        });

        // Sanity check.
        expect(storage.getState().sessionMessages[sessionId].renderWindow).toEqual({ firstSeq: 100, lastSeq: 200 });
        expect(storage.getState().sessionMessages[sessionId].activePrefetch?.requestId).toBe('req-survives');

        // Re-apply the session list with an advanced agentStateVersion.
        storage.getState().applySessions([createSession(sessionId, {
            agentState: { requests: {}, completedRequests: {} } as Session['agentState'],
            agentStateVersion: 2,
        })]);

        const after = storage.getState().sessionMessages[sessionId];
        expect(after.renderWindow).toEqual({ firstSeq: 100, lastSeq: 200 });
        expect(after.activePrefetch?.requestId).toBe('req-survives');
        expect(after.activePrefetch?.generation).toBe(3);
    });
});
