import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from './storageTypes';
import type { NormalizedMessage } from './typesRaw';

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

async function importPersistence() {
    return import('./persistence');
}

async function importFreshStorage() {
    const module = await import('./storage');
    return module.storage;
}

describe('session permission mode user-chosen persistence', () => {
    beforeEach(async () => {
        vi.resetModules();
        const persistence = await importPersistence();
        persistence.saveSessionPermissionModes({});
        persistence.saveSessionPermissionModeUserChosen({});
    });

    it('hydrates saved user-chosen flags and defaults missing entries to false', async () => {
        const sessionId = 'session-user-chosen';
        const falseSessionId = 'session-false';
        const missingSessionId = 'session-missing';
        const persistence = await importPersistence();
        persistence.saveSessionPermissionModeUserChosen({
            [sessionId]: true,
            [falseSessionId]: false,
        });

        const storage = await importFreshStorage();
        storage.getState().applySessions([
            createSession(sessionId),
            createSession(falseSessionId),
            createSession(missingSessionId),
        ]);

        const sessions = storage.getState().sessions;
        expect(sessions[sessionId].permissionModeUserChosen).toBe(true);
        expect(sessions[falseSessionId].permissionModeUserChosen).toBe(false);
        expect(sessions[missingSessionId].permissionModeUserChosen).toBe(false);
    });

    it('persists an explicit default pick separately from the permission mode value', async () => {
        const sessionId = 'session-explicit-default';
        let storage = await importFreshStorage();
        storage.getState().applySessions([createSession(sessionId)]);

        storage.getState().updateSessionPermissionMode(sessionId, 'default', true);

        let persistence = await importPersistence();
        expect(persistence.loadSessionPermissionModes()).toEqual({});
        expect(persistence.loadSessionPermissionModeUserChosen()[sessionId]).toBe(true);

        vi.resetModules();
        persistence = await importPersistence();
        storage = await importFreshStorage();
        storage.getState().applySessions([createSession(sessionId)]);

        expect(storage.getState().sessions[sessionId].permissionMode).toBe('default');
        expect(storage.getState().sessions[sessionId].permissionModeUserChosen).toBe(true);
    });

    it('clears user-chosen state in memory and persistence when EnterPlanMode auto-switches to plan', async () => {
        const sessionId = 'session-enter-plan-mode';
        let storage = await importFreshStorage();
        storage.getState().applySessions([createSession(sessionId, {
            permissionMode: 'bypassPermissions',
            permissionModeUserChosen: true,
        })]);
        storage.getState().updateSessionPermissionMode(sessionId, 'bypassPermissions', true);

        const enterPlanModeMessage: NormalizedMessage = {
            id: 'message-enter-plan',
            localId: null,
            createdAt: 200,
            isSidechain: false,
            role: 'agent',
            content: [{
                type: 'tool-call',
                id: 'tool-enter-plan',
                name: 'EnterPlanMode',
                input: {},
                description: null,
                uuid: 'tool-enter-plan',
                parentUUID: null,
            }],
        };

        storage.getState().applyMessages(sessionId, [enterPlanModeMessage]);

        let session = storage.getState().sessions[sessionId];
        expect(session.permissionMode).toBe('plan');
        expect(session.permissionModeUserChosen).toBe(false);

        let persistence = await importPersistence();
        expect(persistence.loadSessionPermissionModes()[sessionId]).toBe('plan');
        expect(persistence.loadSessionPermissionModeUserChosen()[sessionId]).toBe(false);

        vi.resetModules();
        persistence = await importPersistence();
        storage = await importFreshStorage();
        storage.getState().applySessions([createSession(sessionId)]);

        session = storage.getState().sessions[sessionId];
        expect(session.permissionMode).toBe('plan');
        expect(session.permissionModeUserChosen).toBe(false);
        expect(persistence.loadSessionPermissionModeUserChosen()[sessionId]).toBe(false);
    });
});
