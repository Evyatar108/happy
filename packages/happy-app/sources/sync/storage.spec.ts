import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from './storageTypes';

const mmkvStore = vi.hoisted(() => new Map<string, string>());

vi.mock('react-native-mmkv', () => ({
    MMKV: vi.fn(() => ({
        getString: (key: string) => mmkvStore.get(key),
        set: (key: string, value: string) => {
            mmkvStore.set(key, value);
        },
        delete: (key: string) => {
            mmkvStore.delete(key);
        },
    })),
}));

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

describe('storage pinned avatars', () => {
    beforeEach(() => {
        vi.resetModules();
        mmkvStore.clear();
    });

    it('persists pinned avatars, hydrates them on reload, clears them, and removes them on delete', async () => {
        let storage = await importFreshStorage();
        const sessionId = 'session-pin';

        storage.getState().applySessions([createSession(sessionId, {
            metadata: {
                path: '/tmp/topic-project',
                host: 'local-machine',
                summary: { text: 'topic avatar persistence', updatedAt: 123 },
                name: 'Topic Drawer',
                flavor: 'codex',
            },
        })]);

        storage.getState().sessionSetPinnedAvatar(sessionId, { imageIndex: 12, colorIndex: 3 });

        expect(JSON.parse(mmkvStore.get('session-pinned-avatars') ?? '{}')).toEqual({
            [sessionId]: { imageIndex: 12, colorIndex: 3 },
        });
        expect(storage.getState().sessions[sessionId]).toMatchObject({
            pinnedAvatarImageIndex: 12,
            pinnedAvatarColorIndex: 3,
        });

        vi.resetModules();
        storage = await importFreshStorage();
        storage.getState().applySessions([createSession(sessionId)]);

        expect(storage.getState().sessions[sessionId]).toMatchObject({
            pinnedAvatarImageIndex: 12,
            pinnedAvatarColorIndex: 3,
        });

        storage.getState().sessionClearPinnedAvatar(sessionId);

        expect(JSON.parse(mmkvStore.get('session-pinned-avatars') ?? '{}')).toEqual({});
        expect(storage.getState().sessions[sessionId].pinnedAvatarImageIndex).toBeUndefined();
        expect(storage.getState().sessions[sessionId].pinnedAvatarColorIndex).toBeUndefined();

        storage.getState().sessionSetPinnedAvatar(sessionId, { imageIndex: 44, colorIndex: 5 });
        storage.getState().deleteSession(sessionId);

        expect(JSON.parse(mmkvStore.get('session-pinned-avatars') ?? '{}')).toEqual({});
        expect(storage.getState().sessions[sessionId]).toBeUndefined();
    });

    it('rebuilds session row data immediately after pin and clear changes', async () => {
        const storage = await importFreshStorage();
        const sessionId = 'session-row-pin';

        storage.getState().applySessions([createSession(sessionId, {
            createdAt: 200,
            activeAt: 200,
            metadata: { path: '/tmp/project', host: 'local-machine', machineId: 'machine-1' },
        })]);

        storage.getState().sessionSetPinnedAvatar(sessionId, { imageIndex: 19, colorIndex: 4 });

        const afterPin = storage.getState().sessionListViewData?.find((item) => item.type === 'active-sessions');
        expect(afterPin).toMatchObject({
            sessions: [
                expect.objectContaining({
                    id: sessionId,
                    pinnedAvatarImageIndex: 19,
                    pinnedAvatarColorIndex: 4,
                }),
            ],
        });

        storage.getState().sessionClearPinnedAvatar(sessionId);

        const afterClear = storage.getState().sessionListViewData?.find((item) => item.type === 'active-sessions');
        expect(afterClear).toMatchObject({
            sessions: [expect.objectContaining({ id: sessionId })],
        });
        expect(afterClear?.sessions[0]?.pinnedAvatarImageIndex).toBeUndefined();
        expect(afterClear?.sessions[0]?.pinnedAvatarColorIndex).toBeUndefined();
    });
});
