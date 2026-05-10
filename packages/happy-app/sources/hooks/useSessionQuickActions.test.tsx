import * as React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionQuickActions } from './useSessionQuickActions';
import type { Session } from '@/sync/storageTypes';

const reactActEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const shared = vi.hoisted(() => ({
    machineResumeSessionMock: vi.fn(),
    refreshSessionsMock: vi.fn(),
    updateSessionPermissionModeMock: vi.fn(),
    updateSessionModelModeMock: vi.fn(),
    navigateToSessionMock: vi.fn(),
    confirmMock: vi.fn(),
    sessionArchiveMock: vi.fn(),
    sessionKillMock: vi.fn(),
    latestResumeSession: null as null | (() => void),
    latestResumeSessionInline: null as null | (() => Promise<unknown>),
    latestArchiveSession: null as null | (() => Promise<void>),
    latestActionItems: [] as Array<{ id: string; label: string }>,
    latestActionPromise: null as Promise<void> | null,
    storageState: {
        sessions: {} as Record<string, unknown>,
        updateSessionPermissionMode: vi.fn(),
        updateSessionModelMode: vi.fn(),
    },
}));

vi.mock('expo-router', () => ({
    useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/useNavigateToSession', () => ({
    useNavigateToSession: () => shared.navigateToSessionMock,
}));

vi.mock('@/hooks/useHappyAction', () => ({
    useHappyAction: (action: () => Promise<void>) => {
        return [false, () => {
            shared.latestActionPromise = action();
        }] as const;
    },
}));

vi.mock('@/hooks/useWorktreeCleanup', () => ({
    maybeCleanupWorktree: vi.fn(async () => undefined),
}));

vi.mock('@/modal', () => ({
    Modal: { alert: vi.fn(), confirm: shared.confirmMock },
}));

vi.mock('@/sync/ops', () => ({
    machineResumeSession: shared.machineResumeSessionMock,
    sessionArchive: shared.sessionArchiveMock,
    sessionKill: shared.sessionKillMock,
}));

vi.mock('@/sync/sync', () => ({
    sync: {
        refreshSessions: shared.refreshSessionsMock,
    },
}));

vi.mock('@/sync/storage', () => ({
    storage: {
        getState: () => shared.storageState,
    },
    useLocalSetting: () => false,
    useMachine: () => ({
        id: 'machine-1',
        metadata: {
            resumeSupport: { rpcAvailable: true },
        },
    }),
    useSession: vi.fn(),
}));

vi.mock('@/utils/machineUtils', () => ({
    isMachineOnline: () => true,
}));

vi.mock('@/utils/sessionUtils', () => ({
    useSessionStatus: () => ({ isConnected: false }),
}));

vi.mock('@/text', () => ({
    t: (key: string) => `translated:${key}`,
}));

vi.mock('@/utils/copySessionMetadataToClipboard', () => ({
    copySessionMetadataToClipboard: vi.fn(),
    copySessionMetadataAndLogsToClipboard: vi.fn(),
}));

function createSession(permissionModeUserChosen: boolean): Session {
    return {
        id: 'source-session',
        seq: 1,
        createdAt: 100,
        updatedAt: 100,
        active: false,
        activeAt: 100,
        metadata: {
            path: '/workspace/project',
            host: 'devbox',
            machineId: 'machine-1',
            claudeSessionId: 'claude-session-1',
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 0,
        presence: 100,
        permissionMode: 'bypassPermissions',
        permissionModeUserChosen,
    };
}

function Harness({ session }: { session: Session }) {
    const actions = useSessionQuickActions(session);
    shared.latestResumeSession = actions.resumeSession;
    shared.latestResumeSessionInline = actions.resumeSessionInline;
    shared.latestArchiveSession = actions.archiveSession;
    shared.latestActionItems = actions.actionItems;
    return null;
}

async function renderAndResume(session: Session) {
    await act(async () => {
        TestRenderer.create(<Harness session={session} />);
    });

    act(() => {
        shared.latestResumeSession?.();
    });

    await shared.latestActionPromise;
}

describe('useSessionQuickActions resume permission mode copy', () => {
    beforeEach(() => {
        reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
        shared.machineResumeSessionMock.mockReset();
        shared.refreshSessionsMock.mockReset();
        shared.updateSessionPermissionModeMock.mockReset();
        shared.updateSessionModelModeMock.mockReset();
        shared.navigateToSessionMock.mockReset();
        shared.confirmMock.mockReset();
        shared.sessionArchiveMock.mockReset();
        shared.sessionKillMock.mockReset();
        shared.latestResumeSession = null;
        shared.latestResumeSessionInline = null;
        shared.latestArchiveSession = null;
        shared.latestActionItems = [];
        shared.latestActionPromise = null;
        shared.storageState = {
            sessions: { 'resumed-session': { id: 'resumed-session' } },
            updateSessionPermissionMode: shared.updateSessionPermissionModeMock,
            updateSessionModelMode: shared.updateSessionModelModeMock,
        };
        shared.machineResumeSessionMock.mockResolvedValue({ type: 'success', sessionId: 'resumed-session' });
        shared.refreshSessionsMock.mockResolvedValue(undefined);
        shared.confirmMock.mockResolvedValue(false);
        shared.sessionKillMock.mockResolvedValue({ success: true });
        shared.sessionArchiveMock.mockResolvedValue({ success: true });
    });

    it('preserves userChosen=false when copying permission mode after resume', async () => {
        await renderAndResume(createSession(false));

        expect(shared.updateSessionPermissionModeMock).toHaveBeenCalledWith('resumed-session', 'bypassPermissions', false);
        expect(shared.navigateToSessionMock).toHaveBeenCalledWith('resumed-session');
    });

    it('preserves userChosen=true when copying permission mode after resume', async () => {
        await renderAndResume(createSession(true));

        expect(shared.updateSessionPermissionModeMock).toHaveBeenCalledWith('resumed-session', 'bypassPermissions', true);
        expect(shared.machineResumeSessionMock).toHaveBeenCalledWith({
            machineId: 'machine-1',
            sessionId: 'source-session',
            model: undefined,
            permissionMode: 'bypassPermissions',
        });
    });

    it('returns the resume result from the inline callback without the modal action pathway', async () => {
        await act(async () => {
            TestRenderer.create(<Harness session={createSession(true)} />);
        });

        const result = await shared.latestResumeSessionInline?.();

        expect(result).toEqual({ type: 'success', sessionId: 'resumed-session' });
        expect(shared.latestActionPromise).toBeNull();
        expect(shared.updateSessionPermissionModeMock).toHaveBeenCalledWith('resumed-session', 'bypassPermissions', true);
        expect(shared.navigateToSessionMock).toHaveBeenCalledWith('resumed-session');
    });

    it('returns inline resume errors directly without throwing', async () => {
        shared.machineResumeSessionMock.mockResolvedValue({ type: 'error', errorMessage: 'resume failed' });
        await act(async () => {
            TestRenderer.create(<Harness session={createSession(true)} />);
        });

        const result = await shared.latestResumeSessionInline?.();

        expect(result).toEqual({ type: 'error', errorMessage: 'resume failed' });
        expect(shared.latestActionPromise).toBeNull();
        expect(shared.navigateToSessionMock).not.toHaveBeenCalled();
    });
});

describe('useSessionQuickActions archive confirmation', () => {
    beforeEach(() => {
        reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
        shared.confirmMock.mockReset();
        shared.sessionArchiveMock.mockReset();
        shared.sessionKillMock.mockReset();
        shared.latestArchiveSession = null;
        shared.latestActionItems = [];
        shared.latestActionPromise = null;
        shared.confirmMock.mockResolvedValue(false);
        shared.sessionKillMock.mockResolvedValue({ success: true });
        shared.sessionArchiveMock.mockResolvedValue({ success: true });
    });

    it('does not archive when the confirmation is cancelled', async () => {
        await act(async () => {
            TestRenderer.create(<Harness session={createSession(true)} />);
        });

        await act(async () => {
            await shared.latestArchiveSession?.();
        });

        expect(shared.confirmMock).toHaveBeenCalledWith(
            'translated:sessionInfo.archiveSession',
            'translated:sessionInfo.archiveSessionConfirm',
            {
                cancelText: 'translated:common.cancel',
                confirmText: 'translated:common.archive',
                destructive: true,
            },
        );
        expect(shared.latestActionPromise).toBeNull();
        expect(shared.sessionKillMock).not.toHaveBeenCalled();
        expect(shared.sessionArchiveMock).not.toHaveBeenCalled();
    });

    it('archives when the confirmation is accepted', async () => {
        shared.confirmMock.mockResolvedValue(true);
        await act(async () => {
            TestRenderer.create(<Harness session={createSession(true)} />);
        });

        await act(async () => {
            await shared.latestArchiveSession?.();
        });
        await shared.latestActionPromise;

        expect(shared.sessionKillMock).toHaveBeenCalledWith('source-session');
        expect(shared.sessionArchiveMock).not.toHaveBeenCalled();
    });

    it('uses the translated archive label for the action item', async () => {
        await act(async () => {
            TestRenderer.create(<Harness session={createSession(true)} />);
        });

        expect(shared.latestActionItems.find(item => item.id === 'archive')?.label).toBe('translated:sessionInfo.archiveSession');
    });
});
