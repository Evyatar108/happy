import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from './storageTypes';

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
    return {
        storage: module.storage,
        getSessionParent: module.getSessionParent,
        getSessionChildren: module.getSessionChildren,
    };
}

describe('storage.applySessions — renderWindow / activePrefetch field preservation', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('preserves renderWindow and activePrefetch when an advanced agentStateVersion triggers reducer re-merge', async () => {
        const { storage } = await importFreshStorage();
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

    it('keeps composite machine session ids and marks disconnected machine sessions stale', async () => {
        const { storage } = await importFreshStorage();
        storage.getState().applySessions([
            createSession('machine-a:session-1', {
                updatedAt: 300,
                activeAt: 300,
                metadata: { path: '/a', host: 'host-a', machineId: 'machine-a' },
            }),
            createSession('machine-b:session-1', {
                updatedAt: 400,
                activeAt: 400,
                metadata: { path: '/b', host: 'host-b', machineId: 'machine-b' },
            }),
        ]);

        expect(Object.keys(storage.getState().sessions).sort()).toEqual([
            'machine-a:session-1',
            'machine-b:session-1',
        ]);
        expect(storage.getState().sessionListViewData?.[0]).toMatchObject({
            type: 'active-sessions',
            sessions: [
                { id: 'machine-b:session-1', machineId: 'machine-b' },
                { id: 'machine-a:session-1', machineId: 'machine-a' },
            ],
        });

        storage.getState().markMachineDisconnected('machine-a', 999);

        expect(storage.getState().sessions['machine-a:session-1']).toMatchObject({
            active: false,
            presence: 999,
            activeAt: 999,
        });
        expect(storage.getState().sessions['machine-b:session-1']).toMatchObject({
            active: true,
            presence: 'online',
        });
    });

    it('persists incoming parent and child metadata without preserving omitted spawnedChildren', async () => {
        const { storage } = await importFreshStorage();
        const sessionId = 'm1:session-1';

        storage.getState().applySessions([createSession(sessionId, {
            metadata: {
                path: '/tmp/project',
                host: 'local-machine',
                parentSessionId: 'm1:parent',
                spawnedChildren: ['m1:child-a', 'm1:child-b'],
            },
        })]);

        expect(storage.getState().sessions[sessionId].metadata).toEqual(expect.objectContaining({
            parentSessionId: 'm1:parent',
            spawnedChildren: ['m1:child-a', 'm1:child-b'],
        }));

        storage.getState().applySessions([createSession(sessionId, {
            metadata: {
                path: '/tmp/project',
                host: 'local-machine',
            },
            metadataVersion: 2,
        })]);

        expect(storage.getState().sessions[sessionId].metadata?.spawnedChildren).toBeUndefined();
        expect(storage.getState().sessions[sessionId].metadata).not.toHaveProperty('spawnedChildren');

        storage.getState().applySessions([createSession(sessionId, {
            metadata: {
                path: '/tmp/project',
                host: 'local-machine',
                parentSessionId: null,
            },
            metadataVersion: 3,
        })]);

        expect(storage.getState().sessions[sessionId].metadata?.parentSessionId).toBeNull();
    });

    it('round-trips parent and child refs through repeated applySessions calls and helper reads', async () => {
        const { storage, getSessionParent, getSessionChildren } = await importFreshStorage();
        const sessionId = 'm1:session-1';

        storage.getState().applySessions([
            createSession('m1:abc'),
            createSession(sessionId, {
                metadata: {
                    path: '/tmp/project',
                    host: 'local-machine',
                    parentSessionId: 'm1:abc',
                    spawnedChildren: ['m1:def', 'm1:ghi'],
                },
            }),
            createSession('m1:def', {
                metadata: { path: '/tmp/project', host: 'local-machine', parentSessionId: sessionId },
            }),
            createSession('m1:ghi', {
                metadata: { path: '/tmp/project', host: 'local-machine', parentSessionId: sessionId },
            }),
        ]);

        const storedMetadata = storage.getState().sessions[sessionId].metadata;
        expect(storedMetadata).toEqual(expect.objectContaining({
            parentSessionId: 'm1:abc',
            spawnedChildren: ['m1:def', 'm1:ghi'],
        }));
        expect(getSessionParent(sessionId)?.id).toBe('m1:abc');
        expect(getSessionChildren(sessionId).map(session => session.id)).toEqual(['m1:def', 'm1:ghi']);

        storage.getState().applySessions([createSession(sessionId, {
            metadata: storedMetadata,
            metadataVersion: 2,
        })]);

        expect(storage.getState().sessions[sessionId].metadata).toEqual(storedMetadata);
        expect(getSessionParent(sessionId)?.id).toBe('m1:abc');
        expect(getSessionChildren(sessionId).map(session => session.id)).toEqual(['m1:def', 'm1:ghi']);
    });
});
