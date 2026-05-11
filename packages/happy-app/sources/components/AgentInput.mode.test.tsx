import * as React from 'react';
import { readFileSync } from 'node:fs';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const reactActEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
};

type TestRendererInstance = ReturnType<typeof TestRenderer.create>;
type TestRoot = TestRendererInstance['root'];

const shared = vi.hoisted(() => ({
    suggestions: [] as { key: string; text: string; component: React.ElementType }[],
}));

const theme = {
    colors: {
        input: { background: '#f4f4f4' },
        divider: '#dddddd',
        text: '#111111',
        textSecondary: '#666666',
        textDestructive: '#cc0000',
        surfacePressed: '#eeeeee',
        surfaceHigh: '#fafafa',
        success: '#008000',
        warning: '#aa7700',
        warningCritical: '#aa0000',
        button: {
            primary: { background: '#111111', tint: '#ffffff', disabled: '#999999' },
            secondary: { tint: '#444444' },
        },
        radio: { active: '#111111', inactive: '#777777', dot: '#111111' },
        permission: {
            acceptEdits: '#008000',
            bypass: '#aa0000',
            plan: '#0000aa',
            readOnly: '#666666',
            safeYolo: '#008888',
            yolo: '#aa00aa',
        },
        gitAddedText: '#008000',
        gitRemovedText: '#aa0000',
    },
};

vi.mock('react-native', () => ({
    ActivityIndicator: (props: Record<string, unknown>) => React.createElement('ActivityIndicator', props),
    Platform: { OS: 'web', select: (values: Record<string, unknown>) => values.web ?? values.default },
    Pressable: ({ children, style, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('Pressable', { ...props, style: typeof style === 'function' ? style({ pressed: false }) : style }, children),
    Text: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('Text', props, children),
    TouchableWithoutFeedback: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('TouchableWithoutFeedback', props, children),
    useWindowDimensions: () => ({ width: 390, height: 844 }),
    View: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('View', props, children),
}));

vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        create: (factory: (themeArg: typeof theme) => Record<string, unknown>) => factory(theme),
    },
    useUnistyles: () => ({ theme }),
}));

vi.mock('@expo/vector-icons', () => ({
    Ionicons: (props: Record<string, unknown>) => React.createElement('Ionicon', props),
    Octicons: (props: Record<string, unknown>) => React.createElement('Octicon', props),
}));

vi.mock('expo-image', () => ({
    Image: (props: Record<string, unknown>) => React.createElement('Image', props),
}));

vi.mock('@/assets/images/icon-voice-white.png', () => ({ default: 'voice-icon' }));
vi.mock('@/constants/Typography', () => ({ Typography: { default: () => ({}) } }));
vi.mock('@/text', () => ({ t: (key: string) => `translated:${key}` }));
vi.mock('@/sync/storage', () => ({
    useSetting: () => false,
    useLocalSettingMutable: () => [1, vi.fn()],
}));
vi.mock('@/sync/modeHacks', () => ({
    hackMode: (mode: unknown) => mode,
    hackModes: (modes: unknown[]) => modes,
}));
vi.mock('@/hooks/useChatWidth', () => ({
    CHAT_WIDTH_MARGIN_OPTIONS: [0, 20],
    useChatWidth: () => ({ body: 640 }),
}));
vi.mock('@/utils/responsive', () => ({ useIsTablet: () => false }));
vi.mock('./haptics', () => ({ hapticsLight: vi.fn(), hapticsError: vi.fn() }));
vi.mock('./Shaker', () => ({
    Shaker: React.forwardRef(({ children }: React.PropsWithChildren, ref) => {
        React.useImperativeHandle(ref, () => ({ shake: vi.fn() }));
        return React.createElement('Shaker', null, children);
    }),
}));
vi.mock('./StatusDot', () => ({ StatusDot: (props: Record<string, unknown>) => React.createElement('StatusDot', props) }));
vi.mock('./FloatingOverlay', () => ({
    FloatingOverlay: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => React.createElement('FloatingOverlay', props, children),
}));
vi.mock('./MultiTextInput', () => ({
    MultiTextInput: React.forwardRef((props: Record<string, unknown>, ref) => {
        React.useImperativeHandle(ref, () => ({ setTextAndSelection: vi.fn() }));
        return React.createElement('MultiTextInput', props);
    }),
}));
vi.mock('./AgentInputAutocomplete', () => ({
    AgentInputAutocomplete: (props: Record<string, unknown>) => React.createElement('AgentInputAutocomplete', props),
}));
vi.mock('./autocomplete/useActiveWord', () => ({ useActiveWord: () => null }));
vi.mock('./autocomplete/useActiveSuggestions', () => ({
    useActiveSuggestions: () => [shared.suggestions, -1, vi.fn(), vi.fn()],
}));
vi.mock('./autocomplete/applySuggestion', () => ({ applySuggestion: vi.fn() }));
vi.mock('./GitStatusBadge', () => ({
    GitStatusBadge: (props: Record<string, unknown>) => React.createElement('GitStatusBadge', props),
    useHasMeaningfulGitStatus: () => false,
}));

const { AgentInput } = await import('./AgentInput');

function baseProps() {
    return {
        value: 'hello',
        placeholder: 'Message',
        onChangeText: vi.fn(),
        onSend: vi.fn(),
        autocompletePrefixes: ['@', '/'],
        autocompleteSuggestions: vi.fn(async () => []),
    };
}

function countByTestId(root: TestRoot, testID: string) {
    return root.findAllByProps({ testID }).length;
}

describe('AgentInput mode rendering', () => {
    beforeEach(() => {
        reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
        shared.suggestions = [];
    });

    it('keeps new-session slots out of active mode and active context out of new mode', () => {
        const slots = {
            machineChip: React.createElement('Text', { testID: 'new-machine-chip' }, 'Machine'),
            pathChip: React.createElement('Text', { testID: 'new-path-chip' }, 'Path'),
            worktreeSelector: React.createElement('Text', { testID: 'new-worktree-selector' }, 'Worktree'),
            agentPicker: React.createElement('Text', { testID: 'new-agent-picker' }, 'Agent'),
        };

        let activeRenderer: TestRendererInstance;
        act(() => {
            activeRenderer = TestRenderer.create(
                <AgentInput
                    {...baseProps()}
                    newSessionSlots={slots}
                    machineName="Devbox"
                    currentPath="/repo"
                    onMachineClick={() => {}}
                    onPathClick={() => {}}
                    projectPathHeader="/repo"
                />,
            );
        });

        expect(countByTestId(activeRenderer!.root, 'agent-input-new-session-slots')).toBe(0);
        expect(countByTestId(activeRenderer!.root, 'new-machine-chip')).toBe(0);
        expect(countByTestId(activeRenderer!.root, 'agent-input-active-context-row')).toBeGreaterThan(0);
        expect(countByTestId(activeRenderer!.root, 'agent-input-project-path-header')).toBeGreaterThan(0);

        let newRenderer: TestRendererInstance;
        act(() => {
            newRenderer = TestRenderer.create(
                <AgentInput
                    {...baseProps()}
                    mode="new"
                    newSessionSlots={slots}
                    machineName="Devbox"
                    currentPath="/repo"
                    onMachineClick={() => {}}
                    onPathClick={() => {}}
                    projectPathHeader="/repo"
                />,
            );
        });

        expect(countByTestId(newRenderer!.root, 'agent-input-new-session-slots')).toBeGreaterThan(0);
        expect(countByTestId(newRenderer!.root, 'new-machine-chip')).toBeGreaterThan(0);
        expect(countByTestId(newRenderer!.root, 'new-path-chip')).toBeGreaterThan(0);
        expect(countByTestId(newRenderer!.root, 'new-worktree-selector')).toBeGreaterThan(0);
        expect(countByTestId(newRenderer!.root, 'new-agent-picker')).toBeGreaterThan(0);
        expect(countByTestId(newRenderer!.root, 'agent-input-active-context-row')).toBe(0);
        expect(countByTestId(newRenderer!.root, 'agent-input-project-path-header')).toBe(0);
    });

    it('keeps mode decisions centralized in the render config selector', () => {
        const source = readFileSync(new URL('./AgentInput.tsx', import.meta.url), 'utf8');
        const directModeComparisons = source.match(/mode\s*[!=]={2}/g) ?? [];
        const selectorCallSites = source.match(/selectAgentInputRenderConfig\(mode\)/g) ?? [];

        expect(directModeComparisons.length).toBeLessThanOrEqual(3);
        expect(selectorCallSites).toHaveLength(1);
    });

    it('renders the new-session attachment button and invokes its picker callback', () => {
        const onAttachmentPress = vi.fn();

        let renderer: TestRendererInstance;
        act(() => {
            renderer = TestRenderer.create(
                <AgentInput
                    {...baseProps()}
                    mode="new"
                    onAttachmentPress={onAttachmentPress}
                />,
            );
        });

        const attachmentButton = renderer!.root.findByProps({ testID: 'agent-input-attachment-button' });
        act(() => {
            attachmentButton.props.onPress();
        });

        expect(onAttachmentPress).toHaveBeenCalledOnce();
    });
});
