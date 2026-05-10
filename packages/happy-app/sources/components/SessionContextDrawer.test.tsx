import * as React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelMode } from './PermissionModeSelector';
import type { Machine, Session } from '@/sync/storageTypes';

type TestRendererInstance = ReturnType<typeof TestRenderer.create>;
type TestRoot = TestRendererInstance['root'];
type RenderNode = { props: Record<string, unknown>; findAllByType: (type: string) => RenderNode[] };

const reactActEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const shared = vi.hoisted(() => ({
    resumeSessionInlineMock: vi.fn(),
    onForkPressMock: vi.fn(),
    latestPatchModel: null as null | ((model: { key: string; name: string; description?: string | null }) => void),
}));

const theme = {
    colors: {
        input: { background: '#f4f4f4' },
        divider: '#dddddd',
        text: '#111111',
        textSecondary: '#666666',
        surface: '#ffffff',
        surfacePressed: '#eeeeee',
        surfaceHigh: '#fafafa',
        shadow: { color: '#000000', opacity: 0.15 },
        button: { primary: { background: '#111111', tint: '#ffffff' } },
        status: { error: '#FF3B30' },
    },
};

vi.mock('react-native', () => ({
    ActivityIndicator: (props: Record<string, unknown>) => React.createElement('ActivityIndicator', props),
    Platform: { OS: 'web' },
    Pressable: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('Pressable', props, children),
    ScrollView: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('ScrollView', props, children),
    Text: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('Text', props, children),
    useWindowDimensions: () => ({ width: 390, height: 844 }),
    View: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('View', props, children),
}));

vi.mock('react-native-reanimated', () => ({
    default: {
        View: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
            React.createElement('Animated.View', props, children),
    },
    Easing: {
        cubic: 'cubic',
        out: (value: unknown) => ({ type: 'out', value }),
    },
    useAnimatedStyle: (factory: () => Record<string, unknown>) => factory(),
    useSharedValue: (value: number) => ({ value }),
    withTiming: (value: number) => value,
}));

vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        create: (factory: (themeArg: typeof theme) => Record<string, unknown>) => factory(theme),
    },
    useUnistyles: () => ({ theme }),
}));

vi.mock('@expo/vector-icons', () => ({
    Ionicons: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('Ionicon', props, children),
}));

vi.mock('expo-clipboard', () => ({
    setStringAsync: vi.fn(async () => undefined),
}));

vi.mock('@/text', () => ({
    t: (key: string) => `translated:${key}`,
}));

const { SessionContextDrawer } = await import('./SessionContextDrawer');

function option(key: string, name: string) {
    return { key, name, description: null };
}

function createSession(flavor: string | undefined = 'claude'): Session {
    return {
        id: 'source-session',
        seq: 1,
        createdAt: 100,
        updatedAt: 100,
        active: true,
        activeAt: 100,
        metadata: {
            host: 'devbox',
            machineId: 'machine-1',
            path: '/home/user/my-project',
            flavor,
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 0,
        presence: 100,
        permissionMode: null,
        permissionModeUserChosen: false,
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
            homeDir: '/home/user',
            happyHomeDir: '/home/user/.happy',
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

function baseProps() {
    const sonnet = option('sonnet', 'Sonnet');
    const plan = option('plan', 'Plan');

    return {
        machineName: 'Devbox',
        workdirPath: '/home/user/my-project',
        modelMode: sonnet,
        permissionMode: plan,
        canResume: false,
        resumeAvailability: {
            canResume: false,
            canShowResume: false,
            subtitle: '',
            message: '',
        },
        resumeCommandBlock: null,
        session: createSession(),
        machine: createMachine(),
        onForkPress: shared.onForkPressMock,
        resumeSessionInline: shared.resumeSessionInlineMock,
    };
}

function textValues(root: TestRoot): string[] {
    return root.findAllByType('Text')
        .map((node: RenderNode) => node.props.children)
        .filter((value: unknown): value is string => typeof value === 'string');
}

function findToggle(root: TestRoot) {
    return root.findAllByType('Pressable').find((node: RenderNode) =>
        node.props.accessibilityState && typeof node.props.accessibilityState === 'object' && 'expanded' in node.props.accessibilityState,
    )!;
}

function expand(root: TestRoot) {
    act(() => {
        findToggle(root).props.onPress();
    });
}

function EchoHarness() {
    const [modelMode, setModelMode] = React.useState<ModelMode>(option('sonnet', 'Sonnet'));
    shared.latestPatchModel = setModelMode;
    return <SessionContextDrawer {...baseProps()} modelMode={modelMode} />;
}

describe('SessionContextDrawer', () => {
    beforeEach(() => {
        reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
        shared.resumeSessionInlineMock.mockReset();
        shared.onForkPressMock.mockReset();
        shared.latestPatchModel = null;
    });

    it('renders the collapsed bar with machine, path basename, model, and permission chips from session metadata props', () => {
        let renderer: TestRendererInstance;
        act(() => {
            renderer = TestRenderer.create(<SessionContextDrawer {...baseProps()} />);
        });

        expect(textValues(renderer!.root)).toEqual(expect.arrayContaining(['Devbox', 'my-project', 'Sonnet', 'Plan']));
    });

    it('omits the path chip when workdirPath is not provided', () => {
        let renderer: TestRendererInstance;
        act(() => {
            renderer = TestRenderer.create(<SessionContextDrawer {...baseProps()} workdirPath={null} />);
        });

        const texts = textValues(renderer!.root);
        expect(texts).not.toContain('my-project');
        expect(texts).toEqual(expect.arrayContaining(['Devbox', 'Sonnet', 'Plan']));
    });

    it('toggles expanded state from the chevron control', () => {
        let renderer: TestRendererInstance;
        act(() => {
            renderer = TestRenderer.create(<SessionContextDrawer {...baseProps()} />);
        });

        expect(findToggle(renderer!.root).props.accessibilityState).toMatchObject({ expanded: false });

        expand(renderer!.root);

        expect(findToggle(renderer!.root).props.accessibilityState).toMatchObject({ expanded: true });
        expect(renderer!.root.findByType('Animated.View').props.pointerEvents).toBe('auto');
    });

    it('does not render duplicate model, permission, or effort pickers in the expanded body', () => {
        let renderer: TestRendererInstance;
        act(() => {
            renderer = TestRenderer.create(<SessionContextDrawer {...baseProps()} />);
        });
        expand(renderer!.root);

        expect(renderer!.root.findAllByType('PickerContent')).toHaveLength(0);
    });

    it('updates confirmatory chips only when the metadata-echo props change', () => {
        let renderer: TestRendererInstance;
        act(() => {
            renderer = TestRenderer.create(<EchoHarness />);
        });

        expect(textValues(renderer!.root)).toContain('Sonnet');

        act(() => {
            shared.latestPatchModel?.(option('opus', 'Opus'));
        });

        expect(textValues(renderer!.root)).toContain('Opus');
    });

    it('renders the fork placeholder disabled with no press handler when unavailable', () => {
        let renderer: TestRendererInstance;
        act(() => {
            renderer = TestRenderer.create(<SessionContextDrawer {...baseProps()} />);
        });
        expand(renderer!.root);

        const forkButton = renderer!.root.findAllByType('Pressable').find((node: RenderNode) =>
            node.props.disabled === true && textValues(node).includes('translated:drawer.fork.comingSoon'),
        );

        expect(forkButton?.props.disabled).toBe(true);
        expect(forkButton?.props.onPress).toBeUndefined();
    });

    it('enables the fork action when capable and pressing fires the callback', () => {
        let renderer: TestRendererInstance;
        act(() => {
            renderer = TestRenderer.create(
                <SessionContextDrawer
                    {...baseProps()}
                    session={createSession('codex')}
                    machine={createMachine()}
                />,
            );
        });
        expand(renderer!.root);

        const forkButton = renderer!.root.findAllByType('Pressable').find((node: RenderNode) =>
            node.props.disabled === false && textValues(node).includes('translated:drawer.fork.action'),
        );

        expect(forkButton?.props.accessibilityState).toMatchObject({ disabled: false });
        act(() => {
            forkButton!.props.onPress();
        });

        expect(shared.onForkPressMock).toHaveBeenCalledTimes(1);
    });
});
