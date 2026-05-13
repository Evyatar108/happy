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

describe('storage parent/children helpers', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('resolves parent and children in spawnedChildren order', async () => {
        const { storage, getSessionParent, getSessionChildren } = await importFreshStorage();
        storage.getState().applySessions([
            createSession('m1:parent', {
                metadata: {
                    path: '/tmp/project',
                    host: 'local-machine',
                    spawnedChildren: ['m1:child-b', 'm1:child-a'],
                },
            }),
            createSession('m1:child-a', {
                metadata: { path: '/tmp/project', host: 'local-machine', parentSessionId: 'm1:parent' },
            }),
            createSession('m1:child-b', {
                metadata: { path: '/tmp/project', host: 'local-machine', parentSessionId: 'm1:parent' },
            }),
        ]);

        expect(getSessionParent('m1:child-a')?.id).toBe('m1:parent');
        expect(getSessionChildren('m1:parent').map((session) => session.id)).toEqual(['m1:child-b', 'm1:child-a']);
    });

    it('returns null when parentSessionId is missing, null, undefined, or unresolved', async () => {
        const { storage, getSessionParent } = await importFreshStorage();
        storage.getState().applySessions([
            createSession('m1:no-parent'),
            createSession('m1:null-parent', {
                metadata: { path: '/tmp/project', host: 'local-machine', parentSessionId: null },
            }),
            createSession('m1:undefined-parent', {
                metadata: { path: '/tmp/project', host: 'local-machine', parentSessionId: undefined },
            }),
            createSession('m1:missing-parent', {
                metadata: { path: '/tmp/project', host: 'local-machine', parentSessionId: 'm1:not-in-store' },
            }),
        ]);

        expect(getSessionParent('m1:no-parent')).toBeNull();
        expect(getSessionParent('m1:null-parent')).toBeNull();
        expect(getSessionParent('m1:undefined-parent')).toBeNull();
        expect(getSessionParent('m1:missing-parent')).toBeNull();
        expect(getSessionParent('m1:unknown-session')).toBeNull();
    });

    it('filters missing children and returns an empty array when spawnedChildren is missing or empty', async () => {
        const { storage, getSessionChildren } = await importFreshStorage();
        storage.getState().applySessions([
            createSession('m1:parent', {
                metadata: {
                    path: '/tmp/project',
                    host: 'local-machine',
                    spawnedChildren: ['m1:child-a', 'm1:missing-child', 'm1:child-b'],
                },
            }),
            createSession('m1:child-a'),
            createSession('m1:child-b'),
            createSession('m1:no-children'),
            createSession('m1:empty-children', {
                metadata: { path: '/tmp/project', host: 'local-machine', spawnedChildren: [] },
            }),
        ]);

        expect(getSessionChildren('m1:parent').map((session) => session.id)).toEqual(['m1:child-a', 'm1:child-b']);
        expect(getSessionChildren('m1:no-children')).toEqual([]);
        expect(getSessionChildren('m1:empty-children')).toEqual([]);
        expect(getSessionChildren('m1:unknown-session')).toEqual([]);
    });

    it('reads from storage state without mutating it', async () => {
        const { storage, getSessionParent, getSessionChildren } = await importFreshStorage();
        storage.getState().applySessions([
            createSession('m1:parent', {
                metadata: { path: '/tmp/project', host: 'local-machine', spawnedChildren: ['m1:child'] },
            }),
            createSession('m1:child', {
                metadata: { path: '/tmp/project', host: 'local-machine', parentSessionId: 'm1:parent' },
            }),
        ]);

        const before = storage.getState();
        expect(getSessionParent('m1:child')?.id).toBe('m1:parent');
        expect(getSessionChildren('m1:parent').map((session) => session.id)).toEqual(['m1:child']);
        expect(storage.getState()).toBe(before);
    });
});
