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
    latestResumeSession: null as null | (() => void),
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
    Modal: { alert: vi.fn() },
}));

vi.mock('@/sync/ops', () => ({
    machineResumeSession: shared.machineResumeSessionMock,
    sessionArchive: vi.fn(),
    sessionKill: vi.fn(),
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
    useSetting: (key: string) => key === 'expResumeSession',
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
        shared.latestResumeSession = null;
        shared.latestActionPromise = null;
        shared.storageState = {
            sessions: { 'resumed-session': { id: 'resumed-session' } },
            updateSessionPermissionMode: shared.updateSessionPermissionModeMock,
            updateSessionModelMode: shared.updateSessionModelModeMock,
        };
        shared.machineResumeSessionMock.mockResolvedValue({ type: 'success', sessionId: 'resumed-session' });
        shared.refreshSessionsMock.mockResolvedValue(undefined);
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
});
