import * as React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const reactActEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
};

type TestRendererInstance = ReturnType<typeof TestRenderer.create>;

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
        React.useImperativeHandle(ref, () => ({ setTextAndSelection: vi.fn(), focus: vi.fn(), blur: vi.fn() }));
        return React.createElement('MultiTextInput', props);
    }),
}));
vi.mock('./AgentInputAutocomplete', () => ({
    AgentInputAutocomplete: (props: Record<string, unknown>) => React.createElement('AgentInputAutocomplete', props),
}));
vi.mock('./autocomplete/useActiveWord', () => ({ useActiveWord: () => null }));
vi.mock('./autocomplete/useActiveSuggestions', () => ({
    useActiveSuggestions: () => [[], -1, vi.fn(), vi.fn()],
}));
vi.mock('./autocomplete/applySuggestion', () => ({ applySuggestion: vi.fn() }));
vi.mock('./GitStatusBadge', () => ({
    GitStatusBadge: (props: Record<string, unknown>) => React.createElement('GitStatusBadge', props),
    useHasMeaningfulGitStatus: () => false,
}));

const {
    AgentInput,
    initialAgentInputKeyboardState,
    reduceAgentInputKeyboardState,
} = await import('./AgentInput');

function baseProps() {
    return {
        value: '',
        placeholder: 'Message',
        onChangeText: vi.fn(),
        onSend: vi.fn(),
        autocompletePrefixes: ['@', '/'],
        autocompleteSuggestions: vi.fn(async () => []),
        onPermissionModeChange: vi.fn(),
        availableModes: [
            { key: 'default', name: 'Default', description: '' },
            { key: 'acceptEdits', name: 'Accept edits', description: '' },
        ],
    };
}

describe('AgentInput keyboard interactions', () => {
    beforeEach(() => {
        reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    });

    it('keeps deterministic keyboard transition state for overlay and autocomplete keys', () => {
        const focused = reduceAgentInputKeyboardState(initialAgentInputKeyboardState, { type: 'tabFromTextarea' });
        expect(focused.focusTarget).toBe('firstOverlayControl');
        expect(focused.overlayOpen).toBe(true);

        const pickerOpen = reduceAgentInputKeyboardState(focused, { type: 'enterOnOverlayControl' });
        expect(pickerOpen.pickerOpen).toBe(true);

        const closed = reduceAgentInputKeyboardState(pickerOpen, { type: 'escape' });
        expect(closed.overlayOpen).toBe(false);
        expect(closed.pickerOpen).toBe(false);

        const autocompleteOpen = reduceAgentInputKeyboardState(closed, { type: 'toggleAutocomplete' });
        expect(autocompleteOpen.autocompleteOpen).toBe(true);
        expect(reduceAgentInputKeyboardState(autocompleteOpen, { type: 'toggleAutocomplete' }).autocompleteOpen).toBe(false);
    });

    it('scripts textarea Tab, overlay Enter, Esc, and Ctrl+/ through AgentInput', () => {
        let renderer: TestRendererInstance;
        act(() => {
            renderer = TestRenderer.create(<AgentInput {...baseProps()} />);
        });

        const input = () => renderer!.root.findByType('MultiTextInput');
        expect(renderer!.root.findAllByType('FloatingOverlay')).toHaveLength(0);

        act(() => {
            expect(input().props.onKeyPress({ key: 'Tab', shiftKey: false })).toBe(true);
        });
        expect(renderer!.root.findAllByType('FloatingOverlay')).toHaveLength(0);

        act(() => {
            expect(input().props.onKeyPress({ key: 'Enter', shiftKey: false })).toBe(true);
        });
        expect(renderer!.root.findAllByType('FloatingOverlay')).toHaveLength(1);

        act(() => {
            expect(input().props.onKeyPress({ key: 'Escape', shiftKey: false })).toBe(true);
        });
        expect(renderer!.root.findAllByType('FloatingOverlay')).toHaveLength(0);

        let autocompleteState = reduceAgentInputKeyboardState(initialAgentInputKeyboardState, { type: 'toggleAutocomplete' });
        expect(autocompleteState.autocompleteOpen).toBe(true);
        act(() => {
            expect(input().props.onKeyPress({ key: '/', shiftKey: false, ctrlKey: true })).toBe(true);
        });
        autocompleteState = reduceAgentInputKeyboardState(autocompleteState, { type: 'toggleAutocomplete' });
        expect(autocompleteState.autocompleteOpen).toBe(false);
    });
});
