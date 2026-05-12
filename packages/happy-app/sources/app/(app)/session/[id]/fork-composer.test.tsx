import * as React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Machine, Session } from '@/sync/storageTypes';

type TestRendererInstance = ReturnType<typeof TestRenderer.create>;
type TestRoot = TestRendererInstance['root'];
type RenderNode = { props: Record<string, any>; findAllByType: (type: string) => RenderNode[] };

const reactActEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const shared = vi.hoisted(() => ({
    routerBackMock: vi.fn(),
    navigateToSessionMock: vi.fn(),
    machineForkSessionMock: vi.fn(),
    refreshSessionsMock: vi.fn(),
    createWorktreeMock: vi.fn(),
    listWorktreesMock: vi.fn(),
    modalAlertMock: vi.fn(),
    forkAvailabilityMock: vi.fn((_session: unknown, _machine: unknown) => true),
    session: null as Session | null,
    machine: null as Machine | null,
    routeId: 'machine-1:parent-session',
    calls: [] as string[],
}));

const theme = {
    colors: {
        header: { background: '#ffffff', tint: '#111111' },
        input: { background: '#f4f4f4' },
        divider: '#dddddd',
        text: '#111111',
        textSecondary: '#666666',
        button: {
            primary: {
                background: '#111111',
                disabled: '#cccccc',
                tint: '#ffffff',
            },
        },
    },
};

vi.mock('react-native', () => ({
    ActivityIndicator: (props: Record<string, unknown>) => React.createElement('ActivityIndicator', props),
    Platform: { OS: 'web', select: (options: Record<string, unknown>) => options.web ?? options.default },
    Pressable: ({ children, style, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('Pressable', { ...props, style: typeof style === 'function' ? style({ pressed: false }) : style }, children),
    ScrollView: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('ScrollView', props, children),
    Text: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('Text', props, children),
    View: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('View', props, children),
}));

vi.mock('@expo/vector-icons', () => ({
    Ionicons: (props: Record<string, unknown>) => React.createElement('Ionicon', props),
    Octicons: (props: Record<string, unknown>) => React.createElement('Octicon', props),
}));

vi.mock('expo-router', () => ({
    useLocalSearchParams: () => ({ id: shared.routeId }),
    useRouter: () => ({ back: shared.routerBackMock }),
}));

vi.mock('react-native-unistyles', () => ({
    StyleSheet: { create: (factory: (themeArg: typeof theme) => Record<string, unknown>) => factory(theme) },
    useUnistyles: () => ({ theme }),
}));

vi.mock('@/components/layout', () => ({
    layout: { maxWidth: 800 },
}));

vi.mock('@/constants/Typography', () => ({
    Typography: { default: () => ({}) },
}));

vi.mock('@/components/pickers', () => ({
    PickerContent: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('PickerContent', props, children),
}));

vi.mock('@/hooks/useNavigateToSession', () => ({
    useNavigateToSession: () => shared.navigateToSessionMock,
}));

vi.mock('@/modal', () => ({
    Modal: { alert: shared.modalAlertMock },
}));

vi.mock('@/sync/ops', () => ({
    machineForkSession: shared.machineForkSessionMock,
}));

vi.mock('@/sync/sync', () => ({
    sync: { refreshSessions: shared.refreshSessionsMock },
}));

vi.mock('@/sync/storage', () => ({
    useAllMachines: () => shared.machine ? [shared.machine] : [],
    useSession: () => shared.session,
}));

vi.mock('@/text', () => ({
    t: (key: string) => `translated:${key}`,
}));

vi.mock('@/utils/forkAvailability', () => ({
    forkAvailability: (session: unknown, machine: unknown) => shared.forkAvailabilityMock(session, machine),
}));

vi.mock('@/utils/worktree', () => ({
    createWorktree: shared.createWorktreeMock,
    listWorktrees: shared.listWorktreesMock,
    getRepoPath: (path: string) => {
        const marker = '/.dev/worktree/';
        const idx = path.indexOf(marker);
        return idx === -1 ? path : path.slice(0, idx);
    },
}));

const { ForkComposerScreen } = await import('./fork-composer');

function createSession(): Session {
    return {
        id: 'machine-1:parent-session',
        seq: 1,
        createdAt: 100,
        updatedAt: 100,
        active: true,
        activeAt: 100,
        metadata: {
            path: '/repo/project',
            host: 'devbox',
            machineId: 'machine-1',
            flavor: 'codex',
            currentModelCode: 'gpt-5.5',
            currentPermissionModeCode: 'safe-yolo',
            currentThoughtLevelCode: 'high',
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        thinking: true,
        thinkingAt: 100,
        presence: 'online',
        permissionModeUserChosen: false,
    };
}

function createMachine(): Machine {
    return {
        id: 'machine-1',
        seq: 1,
        createdAt: 100,
        updatedAt: 100,
        active: true,
        activeAt: Date.now(),
        metadata: {
            host: 'devbox',
            displayName: 'Devbox',
            platform: 'win32',
            happyCliVersion: '1.0.0',
            happyHomeDir: '/home/user/.happy',
            homeDir: '/home/user',
        },
        metadataVersion: 1,
        daemonState: null,
        daemonStateVersion: 1,
    };
}

async function renderScreen(): Promise<TestRendererInstance> {
    let renderer: TestRendererInstance;
    await act(async () => {
        renderer = TestRenderer.create(<ForkComposerScreen />);
        await Promise.resolve();
    });
    return renderer!;
}

function textValues(root: RenderNode): string[] {
    return root.findAllByType('Text')
        .map((node: RenderNode) => node.props.children)
        .filter((value: unknown): value is string => typeof value === 'string');
}

function findPressableByText(root: TestRoot, text: string): RenderNode {
    const node = root.findAllByType('Pressable').find((candidate: RenderNode) => textValues(candidate).includes(text));
    if (!node) throw new Error(`Missing Pressable with text ${text}`);
    return node;
}

function findSubmit(root: TestRoot): RenderNode {
    const node = root.findAllByType('Pressable').find((candidate: RenderNode) => candidate.props.accessibilityLabel === 'translated:forkComposer.submit');
    if (!node) throw new Error('Missing Fork submit button');
    return node;
}

describe('ForkComposerScreen', () => {
    beforeEach(() => {
        reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
        shared.routerBackMock.mockReset();
        shared.navigateToSessionMock.mockReset();
        shared.machineForkSessionMock.mockReset();
        shared.refreshSessionsMock.mockReset();
        shared.createWorktreeMock.mockReset();
        shared.listWorktreesMock.mockReset();
        shared.modalAlertMock.mockReset();
        shared.forkAvailabilityMock.mockReset();
        shared.forkAvailabilityMock.mockReturnValue(true);
        shared.calls = [];
        shared.session = createSession();
        shared.machine = createMachine();
        shared.routeId = 'machine-1:parent-session';
        shared.listWorktreesMock.mockResolvedValue([{ path: '/repo/project/.dev/worktree/feature', branch: 'feature' }]);
        shared.machineForkSessionMock.mockImplementation(async () => {
            shared.calls.push('fork');
            return { type: 'success', sessionId: 'child-session' };
        });
        shared.refreshSessionsMock.mockImplementation(async () => {
            shared.calls.push('refresh');
        });
        shared.routerBackMock.mockImplementation(() => {
            shared.calls.push('back');
        });
        shared.navigateToSessionMock.mockImplementation(() => {
            shared.calls.push('navigate');
        });
    });

    it('refreshes sessions and navigates to the composite child session after a successful fork', async () => {
        const renderer = await renderScreen();

        await act(async () => {
            findSubmit(renderer.root).props.onPress();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(shared.machineForkSessionMock).toHaveBeenCalledWith({
            machineId: 'machine-1',
            parentSessionId: 'machine-1:parent-session',
            worktreePath: '/repo/project',
            model: 'gpt-5.5',
            permissionMode: 'safe-yolo',
            effortLevel: 'high',
        });
        expect(shared.calls).toEqual(['fork', 'refresh', 'back', 'navigate']);
        expect(shared.navigateToSessionMock).toHaveBeenCalledWith('machine-1:child-session');
    });

    it('shows an error and does not call the fork RPC when createWorktree fails', async () => {
        shared.createWorktreeMock.mockResolvedValue({ success: false, worktreePath: '', branchName: '', error: 'not a git repo' });
        const renderer = await renderScreen();

        act(() => {
            findPressableByText(renderer.root, 'translated:forkComposer.worktree').props.onPress();
        });
        act(() => {
            renderer.root.findByType('PickerContent').props.onSelect('__create_worktree__');
        });

        await act(async () => {
            findSubmit(renderer.root).props.onPress();
            await Promise.resolve();
        });

        expect(shared.createWorktreeMock).toHaveBeenCalledWith('machine-1', '/repo/project');
        expect(shared.modalAlertMock).toHaveBeenCalledWith('translated:common.error', 'not a git repo');
        expect(shared.machineForkSessionMock).not.toHaveBeenCalled();
    });

    it('shows RPC error envelopes without refreshing or navigating', async () => {
        shared.machineForkSessionMock.mockResolvedValue({ type: 'error', errorMessage: 'Codex sessions only' });
        const renderer = await renderScreen();

        await act(async () => {
            findSubmit(renderer.root).props.onPress();
            await Promise.resolve();
        });

        expect(shared.modalAlertMock).toHaveBeenCalledWith('translated:common.error', 'Codex sessions only');
        expect(shared.refreshSessionsMock).not.toHaveBeenCalled();
        expect(shared.navigateToSessionMock).not.toHaveBeenCalled();
    });

    it('shows flavorUnsupported error and does not call the fork RPC when availability drops before submit', async () => {
        shared.forkAvailabilityMock.mockReturnValue(false);
        const renderer = await renderScreen();

        await act(async () => {
            findSubmit(renderer.root).props.onPress();
            await Promise.resolve();
        });

        expect(shared.modalAlertMock).toHaveBeenCalledWith(
            'translated:common.error',
            'translated:forkComposer.errors.flavorUnsupported',
        );
        expect(shared.machineForkSessionMock).not.toHaveBeenCalled();
        expect(shared.refreshSessionsMock).not.toHaveBeenCalled();
        expect(shared.navigateToSessionMock).not.toHaveBeenCalled();
    });
});
