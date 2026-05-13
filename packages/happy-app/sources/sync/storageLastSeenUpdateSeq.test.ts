import { beforeEach, describe, expect, it, vi } from 'vitest';

const saveLastSeenUpdateSeqByMachineIdSpy = vi.hoisted(() => vi.fn());

vi.mock('./persistence', async () => {
    const actual = await vi.importActual<typeof import('./persistence')>('./persistence');
    return {
        ...actual,
        saveLastSeenUpdateSeqByMachineId: (map: Record<string, number>) => {
            saveLastSeenUpdateSeqByMachineIdSpy(map);
            actual.saveLastSeenUpdateSeqByMachineId(map);
        },
    };
});

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

async function importFreshStorage() {
    const module = await import('./storage');
    return module.storage;
}

describe('storage lastSeenUpdateSeqByMachineId persistence', () => {
    beforeEach(async () => {
        vi.resetModules();
        saveLastSeenUpdateSeqByMachineIdSpy.mockClear();
        const persistence = await import('./persistence');
        persistence.clearPersistence();
    });

    it('writes advancing update seq values through to MMKV and hydrates them on reload', async () => {
        let storage = await importFreshStorage();

        storage.getState().setLastSeenUpdateSeq('mA', 10);

        let persistence = await import('./persistence');
        expect(persistence.loadLastSeenUpdateSeqByMachineId()).toEqual({ mA: 10 });
        expect(storage.getState().lastSeenUpdateSeqByMachineId).toEqual({ mA: 10 });
        expect(saveLastSeenUpdateSeqByMachineIdSpy).toHaveBeenCalledTimes(1);

        vi.resetModules();
        persistence = await import('./persistence');
        storage = await importFreshStorage();

        expect(persistence.loadLastSeenUpdateSeqByMachineId()).toEqual({ mA: 10 });
        expect(storage.getState().lastSeenUpdateSeqByMachineId).toEqual({ mA: 10 });
    });

    it('keeps lastSeenUpdateSeqByMachineId monotonic and skips persistence for regressing values', async () => {
        const storage = await importFreshStorage();
        const stateListener = vi.fn();
        const unsubscribe = storage.subscribe(stateListener);

        storage.getState().setLastSeenUpdateSeq('mA', 10);
        stateListener.mockClear();
        storage.getState().setLastSeenUpdateSeq('mA', 6);

        expect(storage.getState().lastSeenUpdateSeqByMachineId['mA']).toBe(10);
        expect(saveLastSeenUpdateSeqByMachineIdSpy).toHaveBeenCalledTimes(1);
        expect(stateListener).not.toHaveBeenCalled();

        storage.getState().setLastSeenUpdateSeq('mA', 11);

        expect(storage.getState().lastSeenUpdateSeqByMachineId['mA']).toBe(11);
        expect(saveLastSeenUpdateSeqByMachineIdSpy).toHaveBeenCalledTimes(2);
        expect(stateListener).toHaveBeenCalledTimes(1);
        unsubscribe();
    });

    it('resetLastSeenUpdateSeq writes a lower seq bypassing the monotonic guard', async () => {
        const storage = await importFreshStorage();
        const stateListener = vi.fn();
        const unsubscribe = storage.subscribe(stateListener);

        storage.getState().setLastSeenUpdateSeq('mA', 500);
        stateListener.mockClear();
        saveLastSeenUpdateSeqByMachineIdSpy.mockClear();

        storage.getState().resetLastSeenUpdateSeq('mA', 7);

        expect(storage.getState().lastSeenUpdateSeqByMachineId['mA']).toBe(7);
        expect(saveLastSeenUpdateSeqByMachineIdSpy).toHaveBeenCalledTimes(1);
        expect(saveLastSeenUpdateSeqByMachineIdSpy).toHaveBeenCalledWith({ mA: 7 });
        expect(stateListener).toHaveBeenCalledTimes(1);
        unsubscribe();
    });

    it('resetLastSeenUpdateSeq no-ops when seq is already equal to stored value', async () => {
        const storage = await importFreshStorage();
        const stateListener = vi.fn();
        const unsubscribe = storage.subscribe(stateListener);

        storage.getState().setLastSeenUpdateSeq('mA', 42);
        stateListener.mockClear();
        saveLastSeenUpdateSeqByMachineIdSpy.mockClear();

        storage.getState().resetLastSeenUpdateSeq('mA', 42);

        expect(storage.getState().lastSeenUpdateSeqByMachineId['mA']).toBe(42);
        expect(saveLastSeenUpdateSeqByMachineIdSpy).not.toHaveBeenCalled();
        expect(stateListener).not.toHaveBeenCalled();
        unsubscribe();
    });
});
