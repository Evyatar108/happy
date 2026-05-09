import * as React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelMode } from './PermissionModeSelector';

type TestRendererInstance = ReturnType<typeof TestRenderer.create>;
type TestRoot = TestRendererInstance['root'];
type RenderNode = { props: Record<string, unknown>; findAllByType: (type: string) => RenderNode[] };

const reactActEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const shared = vi.hoisted(() => ({
    sessionEmitAgentConfigurationMock: vi.fn(),
    resumeSessionInlineMock: vi.fn(),
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

vi.mock('./pickers', () => ({
    PickerContent: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('PickerContent', props, children),
}));

const { SessionContextDrawer } = await import('./SessionContextDrawer');

function option(key: string, name: string) {
    return { key, name, description: null };
}

function baseProps() {
    const sonnet = option('sonnet', 'Sonnet');
    const plan = option('plan', 'Plan');
    const high = option('high', 'High');

    return {
        machineName: 'Devbox',
        modelMode: sonnet,
        availableModels: [sonnet, option('opus', 'Opus')],
        permissionMode: plan,
        availableModes: [plan, option('bypassPermissions', 'Bypass')],
        effortLevel: high,
        availableEffortLevels: [high, option('xhigh', 'Extra high')],
        canResume: false,
        resumeAvailability: {
            canResume: false,
            canShowResume: false,
            subtitle: '',
            message: '',
        },
        resumeCommandBlock: null,
        updatePermissionMode: vi.fn(),
        updateModelMode: vi.fn(),
        updateEffortLevel: vi.fn(),
        resumeSessionInline: shared.resumeSessionInlineMock,
        sessionEmitAgentConfiguration: shared.sessionEmitAgentConfigurationMock,
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
        shared.sessionEmitAgentConfigurationMock.mockReset();
        shared.resumeSessionInlineMock.mockReset();
        shared.latestPatchModel = null;
    });

    it('renders the collapsed bar with machine, model, and permission chips from session metadata props', () => {
        let renderer: TestRendererInstance;
        act(() => {
            renderer = TestRenderer.create(<SessionContextDrawer {...baseProps()} />);
        });

        expect(textValues(renderer!.root)).toEqual(expect.arrayContaining(['Devbox', 'Sonnet', 'Plan']));
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

    it('emits agent configuration metadata updates from picker selections', () => {
        let renderer: TestRendererInstance;
        act(() => {
            renderer = TestRenderer.create(<SessionContextDrawer {...baseProps()} />);
        });
        expand(renderer!.root);

        const pickers = renderer!.root.findAllByType('PickerContent');
        act(() => {
            pickers[0]!.props.onSelect('opus');
            pickers[1]!.props.onSelect('bypassPermissions');
            pickers[2]!.props.onSelect('xhigh');
        });

        expect(shared.sessionEmitAgentConfigurationMock).toHaveBeenCalledWith({ model: 'opus' });
        expect(shared.sessionEmitAgentConfigurationMock).toHaveBeenCalledWith({ permissionMode: 'bypassPermissions' });
        expect(shared.sessionEmitAgentConfigurationMock).toHaveBeenCalledWith({ thinkingLevel: 'xhigh' });
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

    it('renders the fork placeholder disabled with no press handler', () => {
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
});
