import * as React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type MockFile = { name: string; size: number; type?: string };

const themeValue = new Proxy({}, {
    get: () => themeValue,
    apply: () => '#000',
}) as unknown as string;

function addMockAttachment(current: MockAttachment[], file: MockFile): MockAttachment[] {
    return [...current, {
        id: `${file.name}-${current.length}`,
        name: file.name,
        originalName: file.name,
        size: file.size,
        mimeType: file.type,
        base64: `base64:${file.name}`,
    }];
}

type MockAttachment = {
    id: string;
    name: string;
    originalName: string;
    size: number;
    mimeType?: string;
    base64: string;
};

vi.mock('react-native', () => ({
    ActivityIndicator: 'ActivityIndicator',
    Image: 'Image',
    Platform: { OS: 'web', select: (values: Record<string, unknown>) => values.web ?? values.default },
    Pressable: 'Pressable',
    Text: 'Text',
    TouchableWithoutFeedback: 'TouchableWithoutFeedback',
    View: 'View',
    useWindowDimensions: () => ({ width: 1200, height: 800 }),
}));

vi.mock('expo-image', () => ({ Image: 'ExpoImage' }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons', Octicons: 'Octicons' }));
vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        create: (factory: (theme: unknown, runtime: unknown) => Record<string, unknown>) => factory({ colors: themeValue }, {}),
    },
    useUnistyles: () => ({ theme: { colors: themeValue } }),
}));

vi.mock('@/hooks/useFileAttachment', async () => {
    const React = await import('react');

    return {
        useFileAttachment: () => {
            const [attachments, setAttachments] = React.useState<MockAttachment[]>([]);
            const addFile = (file: MockFile) => setAttachments(current => addMockAttachment(current, file));
            const filesFromItems = (items: Array<{ kind: string; getAsFile: () => MockFile | null }>) => (
                items.filter(item => item.kind === 'file').map(item => item.getAsFile()).filter(Boolean) as MockFile[]
            );

            return {
                attachments,
                addFiles: vi.fn(),
                removeAttachment: (id: string) => setAttachments(current => current.filter(file => file.id !== id)),
                clear: () => setAttachments([]),
                isDragActive: false,
                openFilePicker: () => addFile({ name: 'picked.txt', size: 12 }),
                inputProps: { onChange: vi.fn() },
                rootProps: {
                    onDrop: (event: { dataTransfer: { items: Array<{ kind: string; getAsFile: () => MockFile | null }> }; preventDefault: () => void }) => {
                        const files = filesFromItems(event.dataTransfer.items);
                        if (files.length > 0) {
                            event.preventDefault();
                            for (const file of files) {
                                addFile(file);
                            }
                        }
                    },
                    onPaste: (event: { clipboardData: { items: Array<{ kind: string; getAsFile: () => MockFile | null }> }; preventDefault: () => void }) => {
                        const files = filesFromItems(event.clipboardData.items);
                        if (files.length > 0) {
                            event.preventDefault();
                            for (const file of files) {
                                addFile(file);
                            }
                        }
                    },
                },
            };
        },
    };
});

vi.mock('./MultiTextInput', () => ({
    MultiTextInput: React.forwardRef((_props: unknown, ref: React.Ref<unknown>) => {
        React.useImperativeHandle(ref, () => ({ setTextAndSelection: vi.fn(), focus: vi.fn(), blur: vi.fn() }));
        return React.createElement('MultiTextInput');
    }),
}));
vi.mock('./autocomplete/useActiveWord', () => ({ useActiveWord: () => null }));
vi.mock('./autocomplete/useActiveSuggestions', () => ({ useActiveSuggestions: () => [[], -1, vi.fn(), vi.fn()] }));
vi.mock('./autocomplete/applySuggestion', () => ({ applySuggestion: vi.fn() }));
vi.mock('./AgentInputAutocomplete', () => ({ AgentInputAutocomplete: 'AgentInputAutocomplete' }));
vi.mock('./FloatingOverlay', () => ({ FloatingOverlay: ({ children }: { children: React.ReactNode }) => React.createElement('FloatingOverlay', null, children) }));
vi.mock('./GitStatusBadge', () => ({ GitStatusBadge: 'GitStatusBadge', useHasMeaningfulGitStatus: () => false }));
vi.mock('./haptics', () => ({ hapticsLight: vi.fn(), hapticsError: vi.fn() }));
vi.mock('./Shaker', () => ({
    Shaker: React.forwardRef(({ children }: { children: React.ReactNode }, ref: React.Ref<unknown>) => {
        React.useImperativeHandle(ref, () => ({ shake: vi.fn() }));
        return React.createElement(React.Fragment, null, children);
    }),
}));
vi.mock('./StatusDot', () => ({ StatusDot: 'StatusDot' }));
vi.mock('@/constants/Typography', () => ({ Typography: { default: () => ({}) } }));
vi.mock('@/sync/storage', () => ({
    useSetting: () => false,
    useLocalSettingMutable: () => [1, vi.fn()],
}));
vi.mock('@/sync/modeHacks', () => ({ hackMode: (mode: unknown) => mode, hackModes: (modes: unknown[]) => modes }));
vi.mock('@/text', () => ({
    t: (key: string, params?: { name?: string }) => params?.name ? `${key}:${params.name}` : key,
}));
vi.mock('@/hooks/useChatWidth', () => ({ CHAT_WIDTH_MARGIN_OPTIONS: [0, 1, 2], useChatWidth: () => ({ body: 800 }) }));
vi.mock('@/utils/responsive', () => ({ useIsTablet: () => false }));

const { AgentInput } = await import('./AgentInput');

function renderAgentInput(onSend = vi.fn()) {
    return TestRenderer.create(
        <AgentInput
            value=""
            placeholder="Message"
            onChangeText={vi.fn()}
            onSend={onSend}
            autocompletePrefixes={[]}
            autocompleteSuggestions={async () => []}
        />
    );
}

describe('AgentInput attachments', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('populates attachment chips from drop, paste, and attach-button paths', async () => {
        const onSend = vi.fn(() => true);
        let renderer!: ReturnType<typeof TestRenderer.create>;
        await act(async () => {
            renderer = renderAgentInput(onSend);
        });

        const root = renderer.root.findByProps({ testID: 'agent-input-attachment-root' });
        const preventDropDefault = vi.fn();
        await act(async () => {
            root.props.onDrop({
                preventDefault: preventDropDefault,
                dataTransfer: { items: [{ kind: 'file', getAsFile: () => ({ name: 'drop.txt', size: 4 }) }] },
            });
        });
        expect(preventDropDefault).toHaveBeenCalledOnce();

        const preventPasteDefault = vi.fn();
        await act(async () => {
            root.props.onPaste({
                preventDefault: preventPasteDefault,
                clipboardData: { items: [{ kind: 'file', getAsFile: () => ({ name: 'paste.txt', size: 5 }) }] },
            });
        });
        expect(preventPasteDefault).toHaveBeenCalledOnce();

        await act(async () => {
            renderer.root.findByProps({ testID: 'attachment-open-picker' }).props.onPress();
        });

        const chipTexts = renderer.root.findAllByType('Text').map((node: { children: unknown[] }) => node.children.join(''));
        expect(chipTexts).toContain('drop.txt');
        expect(chipTexts).toContain('paste.txt');
        expect(chipTexts).toContain('picked.txt');
        expect(renderer.root.findAllByProps({ testID: 'attachment-chip' })).toHaveLength(3);

        await act(async () => {
            renderer.root.findByProps({ testID: 'agent-input-send' }).props.onPress();
        });

        expect(onSend).toHaveBeenCalledWith('now', [
            expect.objectContaining({ name: 'drop.txt', base64: 'base64:drop.txt' }),
            expect.objectContaining({ name: 'paste.txt', base64: 'base64:paste.txt' }),
            expect.objectContaining({ name: 'picked.txt', base64: 'base64:picked.txt' }),
        ]);
        expect(renderer.root.findAllByProps({ testID: 'attachment-chip' })).toHaveLength(0);
    });
});
