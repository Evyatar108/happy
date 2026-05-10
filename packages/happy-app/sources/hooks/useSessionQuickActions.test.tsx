import * as React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionQuickActions } from './useSessionQuickActions';
import type { Machine, Session } from '@/sync/storageTypes';

const reactActEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const shared = vi.hoisted(() => ({
    machineResumeSessionMock: vi.fn(),
    refreshSessionsMock: vi.fn(),
    routerPushMock: vi.fn(),
    updateSessionPermissionModeMock: vi.fn(),
    updateSessionModelModeMock: vi.fn(),
    navigateToSessionMock: vi.fn(),
    latestResumeSession: null as null | (() => void),
    latestResumeSessionInline: null as null | (() => Promise<unknown>),
    latestActionItems: [] as Array<{ id: string; onPress: () => void }>,
    latestActionPromise: null as Promise<void> | null,
    machine: null as Machine | null,
    storageState: {
        sessions: {} as Record<string, unknown>,
        updateSessionPermissionMode: vi.fn(),
        updateSessionModelMode: vi.fn(),
    },
}));

vi.mock('expo-router', () => ({
    useRouter: () => ({ push: shared.routerPushMock }),
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
    useMachine: () => shared.machine,
    useSession: vi.fn(),
}));

vi.mock('@/utils/machineUtils', () => ({
    isMachineOnline: (machine: Machine) => machine.active,
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

function createMachine(overrides: Partial<Machine> = {}): Machine {
    return {
        id: 'machine-1',
        seq: 1,
        createdAt: 100,
        updatedAt: 100,
        active: true,
        activeAt: 100,
        metadata: {
            host: 'devbox',
            platform: 'linux',
            homeDir: '/workspace',
            happyHomeDir: '/workspace/.happy',
            happyCliVersion: '1.0.0',
            resumeSupport: {
                rpcAvailable: true,
                forkRpcAvailable: true,
                requiresSameMachine: true,
                requiresHappyAgentAuth: true,
                happyAgentAuthenticated: true,
                detectedAt: 100,
            },
        },
        metadataVersion: 1,
        daemonState: null,
        daemonStateVersion: 1,
        ...overrides,
    };
}

function createCodexSession(overrides: Partial<Session> = {}): Session {
    const session = createSession(false);
    return {
        ...session,
        metadata: {
            ...session.metadata,
            host: session.metadata?.host ?? 'devbox',
            path: session.metadata?.path ?? '/workspace/project',
            flavor: 'codex',
        },
        ...overrides,
    };
}

function Harness({ session }: { session: Session }) {
    const actions = useSessionQuickActions(session);
    shared.latestResumeSession = actions.resumeSession;
    shared.latestResumeSessionInline = actions.resumeSessionInline;
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
        shared.routerPushMock.mockReset();
        shared.updateSessionPermissionModeMock.mockReset();
        shared.updateSessionModelModeMock.mockReset();
        shared.navigateToSessionMock.mockReset();
        shared.latestResumeSession = null;
        shared.latestResumeSessionInline = null;
        shared.latestActionItems = [];
        shared.latestActionPromise = null;
        shared.machine = createMachine();
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

    it('shows the fork action under capable Codex conditions and navigates to the fork composer', async () => {
        await act(async () => {
            TestRenderer.create(<Harness session={createCodexSession()} />);
        });

        const forkAction = shared.latestActionItems.find((item) => item.id === 'fork');

        expect(forkAction).toBeDefined();
        act(() => {
            forkAction!.onPress();
        });
        expect(shared.routerPushMock).toHaveBeenCalledWith('/session/source-session/fork-composer');
    });

    it('omits the fork action for non-Codex sessions', async () => {
        await act(async () => {
            TestRenderer.create(<Harness session={createSession(false)} />);
        });

        expect(shared.latestActionItems.some((item) => item.id === 'fork')).toBe(false);
    });

    it('omits the fork action when the machine lacks the fork RPC capability', async () => {
        shared.machine = createMachine({
            metadata: {
                host: 'devbox',
                platform: 'linux',
                homeDir: '/workspace',
                happyHomeDir: '/workspace/.happy',
                happyCliVersion: '1.0.0',
                resumeSupport: {
                    rpcAvailable: true,
                    forkRpcAvailable: false,
                    requiresSameMachine: true,
                    requiresHappyAgentAuth: true,
                    happyAgentAuthenticated: true,
                    detectedAt: 100,
                },
            },
        });

        await act(async () => {
            TestRenderer.create(<Harness session={createCodexSession()} />);
        });

        expect(shared.latestActionItems.some((item) => item.id === 'fork')).toBe(false);
    });
});
