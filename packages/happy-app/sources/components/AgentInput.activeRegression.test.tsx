import * as React from 'react';
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
vi.mock('expo-image', () => ({ Image: (props: Record<string, unknown>) => React.createElement('Image', props) }));
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
vi.mock('./autocomplete/useActiveWord', () => ({ useActiveWord: () => 'he' }));
vi.mock('./autocomplete/useActiveSuggestions', () => ({
    useActiveSuggestions: () => [shared.suggestions, 0, vi.fn(), vi.fn()],
}));
vi.mock('./autocomplete/applySuggestion', () => ({ applySuggestion: vi.fn() }));
vi.mock('./GitStatusBadge', () => ({
    GitStatusBadge: (props: Record<string, unknown>) => React.createElement('GitStatusBadge', props),
    useHasMeaningfulGitStatus: () => false,
}));

const { AgentInput } = await import('./AgentInput');

function Suggestion() {
    return React.createElement('Text', null, 'suggestion');
}

function activeAffordanceProps() {
    return {
        value: '',
        placeholder: 'Message',
        onChangeText: vi.fn(),
        onSend: vi.fn(),
        sessionId: 'session-1',
        onMicPress: vi.fn(),
        isMicActive: false,
        sendIcon: React.createElement('Text', null, 'send'),
        onAbort: vi.fn(),
        onFileViewerPress: vi.fn(),
        machineName: 'devbox',
        onMachineClick: vi.fn(),
        currentPath: 'D:/harness-efforts/codexu',
        onPathClick: vi.fn(),
        canSendWhenIdle: true,
        connectionStatus: {
            text: 'connected',
            color: '#008000',
            dotColor: '#008000',
        },
        autocompletePrefixes: ['@', '/'],
        autocompleteSuggestions: vi.fn(async () => []),
    };
}

function countByTestId(root: TestRoot, testID: string) {
    return root.findAllByProps({ testID }).length;
}

function countByAccessibilityLabel(root: TestRoot, accessibilityLabel: string) {
    return root.findAllByProps({ accessibilityLabel }).length;
}

describe('AgentInput active-mode regression affordances', () => {
    beforeEach(() => {
        reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
        shared.suggestions = [{ key: 'one', text: 'one', component: Suggestion }];
    });

    it('renders active-chat affordances only in active mode', () => {
        let activeRenderer: TestRendererInstance;
        act(() => {
            activeRenderer = TestRenderer.create(<AgentInput {...activeAffordanceProps()} />);
        });

        expect(countByTestId(activeRenderer!.root, 'agent-input-active-context-row')).toBeGreaterThan(0);
        expect(countByTestId(activeRenderer!.root, 'agent-input-git-status-button')).toBeGreaterThan(0);
        expect(countByTestId(activeRenderer!.root, 'agent-input-abort-button')).toBeGreaterThan(0);
        expect(countByAccessibilityLabel(activeRenderer!.root, 'translated:requestSwitch.whenIdle')).toBeGreaterThan(0);
        expect(countByTestId(activeRenderer!.root, 'agent-input-deferred-switch-button')).toBeGreaterThan(0);
        expect(countByTestId(activeRenderer!.root, 'agent-input-connection-status-row')).toBeGreaterThan(0);

        let newRenderer: TestRendererInstance;
        act(() => {
            newRenderer = TestRenderer.create(<AgentInput {...activeAffordanceProps()} mode="new" />);
        });

        expect(countByTestId(newRenderer!.root, 'agent-input-active-context-row')).toBe(0);
        expect(countByTestId(newRenderer!.root, 'agent-input-git-status-button')).toBe(0);
        expect(countByTestId(newRenderer!.root, 'agent-input-abort-button')).toBe(0);
        expect(countByAccessibilityLabel(newRenderer!.root, 'translated:requestSwitch.whenIdle')).toBe(0);
        expect(countByTestId(newRenderer!.root, 'agent-input-deferred-switch-button')).toBe(0);
        expect(countByTestId(newRenderer!.root, 'agent-input-connection-status-row')).toBe(0);
    });
});
