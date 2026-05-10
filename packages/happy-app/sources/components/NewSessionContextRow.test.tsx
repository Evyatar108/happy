import * as React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Machine, Session } from '@/sync/storageTypes';

type TestRendererInstance = ReturnType<typeof TestRenderer.create>;
type TestRoot = TestRendererInstance['root'];
type RenderNode = { props: Record<string, any>; findAllByType: (type: string) => RenderNode[] };

const reactActEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const shared = vi.hoisted(() => ({
    draft: {
        input: '',
        selectedMachineId: 'machine-1' as string | null,
        selectedPath: '/home/u/repo' as string | null,
        agentType: 'claude' as const,
        permissionMode: 'default' as const,
        modelMode: 'default',
        sessionType: 'simple' as const,
        worktreeKey: null as string | null,
        setInput: vi.fn(),
        setMachineId: vi.fn(),
        setPath: vi.fn(),
        setAgentType: vi.fn(),
        setPermissionMode: vi.fn(),
        setModelMode: vi.fn(),
        setSessionType: vi.fn(),
        setWorktreeKey: vi.fn(),
    },
    listWorktreesMock: vi.fn(),
    getRepoPathMock: vi.fn((path: string) => {
        const marker = '/.dev/worktree/';
        const index = path.indexOf(marker);
        return index === -1 ? path : path.slice(0, index);
    }),
    onOpenPickerMock: vi.fn(),
    onClosePickerMock: vi.fn(),
}));

const theme = {
    colors: {
        header: { background: '#ffffff', tint: '#111111' },
        input: { background: '#f4f4f4' },
        divider: '#dddddd',
        text: '#111111',
        textSecondary: '#666666',
        status: { disconnected: '#cc0000' },
        button: { primary: { background: '#111111', disabled: '#cccccc', tint: '#ffffff' } },
    },
};

vi.mock('react-native', () => ({
    Animated: {
        Value: class {
            setValue() {}
        },
        timing: () => ({ start: (callback?: () => void) => callback?.() }),
    },
    Image: (props: Record<string, unknown>) => React.createElement('Image', props),
    LayoutAnimation: { configureNext: vi.fn(), Presets: { easeInEaseOut: {} } },
    Platform: { OS: 'web', select: (options: Record<string, unknown>) => options.web ?? options.default },
    Pressable: ({ children, style, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('Pressable', { ...props, style: typeof style === 'function' ? style({ pressed: false }) : style }, children),
    Text: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('Text', props, children),
    View: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('View', props, children),
}));

vi.mock('@expo/vector-icons', () => ({
    Ionicons: (props: Record<string, unknown>) => React.createElement('Ionicon', props),
    MaterialCommunityIcons: (props: Record<string, unknown>) => React.createElement('MaterialCommunityIcon', props),
}));

vi.mock('react-native-unistyles', () => ({
    StyleSheet: { create: (factory: (themeArg: typeof theme) => Record<string, unknown>) => factory(theme) },
    useUnistyles: () => ({ theme }),
}));

vi.mock('./NewSessionAgentIcons', () => ({
    newSessionAgentIcons: { claude: 'claude-icon', codex: 'codex-icon', openclaw: 'openclaw-icon', gemini: 'gemini-icon' },
}));
vi.mock('@/constants/Typography', () => ({ Typography: { default: () => ({}) } }));
vi.mock('@/text', () => ({ t: (key: string) => `translated:${key}` }));
vi.mock('@/utils/platform', () => ({ isRunningOnMac: () => false }));
vi.mock('@/utils/sessionUtils', () => ({
    formatLastSeen: () => 'now',
    formatPathRelativeToHome: (path: string, homeDir?: string) => homeDir && path.startsWith(homeDir) ? `~${path.slice(homeDir.length)}` : path,
}));
vi.mock('@/utils/pathUtils', () => ({
    resolveAbsolutePath: (path: string, homeDir?: string) => path.startsWith('~') ? `${homeDir}${path.slice(1)}` : path,
}));
vi.mock('@/utils/machineUtils', () => ({ isMachineOnline: (machine: Machine) => machine.active }));
vi.mock('@/components/modelModeOptions', () => ({
    getDefaultEffortKeyForModel: () => null,
    getDefaultModelKey: () => 'default',
    getDefaultPermissionModeKey: () => 'default',
    getEffortLevelsForModel: () => [],
    getHardcodedModelModes: () => [{ key: 'default', name: 'Default' }],
    getHardcodedPermissionModes: () => [{ key: 'default', name: 'Default' }, { key: 'plan', name: 'Plan' }],
    getSupportsWorktree: () => true,
}));
vi.mock('@/components/pickers', () => ({
    PickerContent: (props: Record<string, unknown>) => React.createElement('PickerContent', props),
    PathPickerContent: (props: Record<string, unknown>) => React.createElement('PathPickerContent', props),
}));
vi.mock('@/hooks/useNewSessionDraft', () => ({ useNewSessionDraft: () => shared.draft }));
vi.mock('@/sync/storage', () => ({
    useAllMachines: () => [createMachine()],
    useSessions: () => [createSession()],
}));
vi.mock('@/utils/worktree', () => ({
    getRepoPath: shared.getRepoPathMock,
    listWorktrees: shared.listWorktreesMock,
}));

const { NewSessionContextRow, useNewSessionContextRowController } = await import('./NewSessionContextRow');

let currentRenderer: TestRendererInstance | null = null;

function createMachine(): Machine {
    return {
        id: 'machine-1',
        seq: 1,
        createdAt: 100,
        updatedAt: 100,
        active: true,
        activeAt: 100,
        metadata: {
            host: 'devbox',
            displayName: 'Devbox',
            platform: 'linux',
            happyCliVersion: '1.0.0',
            happyHomeDir: '/home/u/.happy',
            homeDir: '/home/u',
            cliAvailability: { claude: true, codex: true, openclaw: true, gemini: true, detectedAt: 100 },
        },
        metadataVersion: 1,
        daemonState: null,
        daemonStateVersion: 1,
    };
}

function createSession(): Session {
    return {
        id: 'machine-1:session-1',
        seq: 1,
        createdAt: 100,
        updatedAt: 100,
        active: true,
        activeAt: 100,
        metadata: { machineId: 'machine-1', path: '/home/u/repo', host: 'devbox', flavor: 'claude' },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 100,
        presence: 'online',
        permissionModeUserChosen: false,
    };
}

function Harness() {
    const controller = useNewSessionContextRowController({
        onOpenPicker: shared.onOpenPickerMock,
        onClosePicker: shared.onClosePickerMock,
    });
    return <NewSessionContextRow controller={controller} />;
}

function renderHarness(): TestRendererInstance {
    let renderer: TestRendererInstance;
    act(() => {
        renderer = TestRenderer.create(<Harness />);
    });
    currentRenderer = renderer!;
    return renderer!;
}

function textValues(root: RenderNode): string[] {
    return root.findAllByType('Text')
        .map((node: RenderNode) => node.props.children)
        .filter((value: unknown): value is string => typeof value === 'string');
}

function pressByTestId(root: TestRoot, testID: string) {
    act(() => {
        root.findByProps({ testID }).props.onPress();
    });
}

describe('NewSessionContextRow', () => {
    beforeEach(() => {
        reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
        vi.useFakeTimers();
        shared.draft.input = '';
        shared.draft.selectedMachineId = 'machine-1';
        shared.draft.selectedPath = '/home/u/repo';
        shared.draft.agentType = 'claude';
        shared.draft.sessionType = 'simple';
        shared.draft.worktreeKey = null;
        shared.onOpenPickerMock.mockReset();
        shared.onClosePickerMock.mockReset();
        shared.listWorktreesMock.mockReset();
        shared.getRepoPathMock.mockClear();
        shared.listWorktreesMock.mockResolvedValue([
            { path: '/home/u/repo/.dev/worktree/feat-b', branch: 'feat-b' },
            { path: '/home/u/repo/.dev/worktree/feat-a', branch: 'feat-a' },
        ]);
    });

    afterEach(() => {
        if (currentRenderer) {
            act(() => {
                currentRenderer?.unmount();
            });
            currentRenderer = null;
        }
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    it('renders the four slot nodes with stable test IDs', () => {
        const renderer = renderHarness();

        expect(renderer.root.findAllByProps({ testID: 'newSession.row.machine' }).length).toBeGreaterThan(0);
        expect(renderer.root.findAllByProps({ testID: 'newSession.row.path' }).length).toBeGreaterThan(0);
        expect(renderer.root.findAllByProps({ testID: 'newSession.row.agent' }).length).toBeGreaterThan(0);
        expect(renderer.root.findAllByProps({ testID: 'newSession.row.worktree' }).length).toBeGreaterThan(0);
    });

    it('opens pickers from slot presses and closes an already-open picker on repeat press', () => {
        const renderer = renderHarness();

        pressByTestId(renderer.root, 'newSession.row.machine');
        pressByTestId(renderer.root, 'newSession.row.path');
        pressByTestId(renderer.root, 'newSession.row.worktree');
        pressByTestId(renderer.root, 'newSession.row.worktree');

        expect(shared.onOpenPickerMock.mock.calls.map(call => call[0])).toEqual(['machine', 'path', 'worktree']);
        expect(shared.onClosePickerMock).toHaveBeenCalledTimes(1);
    });

    it('groups worktree picker output by repo path', async () => {
        const renderer = renderHarness();

        vi.advanceTimersByTime(350);
        await Promise.resolve();
        pressByTestId(renderer.root, 'newSession.row.worktree');

        const picker = renderer.root.findByType('PickerContent');
        const items = picker.props.items as { key: string; label: string; disabled?: boolean }[];
        expect(items).toEqual([
            { key: 'repo:/home/u/repo', label: '~/repo', dimmed: true, disabled: true },
            { key: '/home/u/repo/.dev/worktree/feat-a', label: 'feat-a', subtitle: '/home/u/repo/.dev/worktree/feat-a' },
            { key: '/home/u/repo/.dev/worktree/feat-b', label: 'feat-b', subtitle: '/home/u/repo/.dev/worktree/feat-b' },
        ]);
        expect(shared.getRepoPathMock.mock.calls.map(call => call[0])).toEqual([
            '/home/u/repo/.dev/worktree/feat-b',
            '/home/u/repo/.dev/worktree/feat-a',
        ]);
        expect(textValues(renderer.root as unknown as RenderNode)).toContain('~/repo');
    });
});
