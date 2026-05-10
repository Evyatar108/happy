import * as React from 'react';
import { createRequire } from 'node:module';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const nodeRequire = createRequire(import.meta.url);
const nodeModule = nodeRequire('module') as { _load: (request: string, parent?: unknown, isMain?: boolean) => unknown };
const originalModuleLoad = nodeModule._load;
nodeModule._load = function loadMockedAsset(request: string, parent?: unknown, isMain?: boolean) {
    if (request.startsWith('@/assets/images/') && request.endsWith('.png')) {
        return request;
    }

    return originalModuleLoad.call(this, request, parent, isMain);
};

type MockFile = { name: string; size: number; type?: string };
type MockAttachment = {
    id: string;
    name: string;
    originalName: string;
    size: number;
    mimeType?: string;
    base64: string;
};

const themeValue = new Proxy({}, {
    get: () => themeValue,
    apply: () => '#000',
}) as unknown as string;

const order: string[] = [];
const routerBack = vi.fn();
const navigateToSession = vi.fn();
const machineSpawnNewSession = vi.fn();
const refreshSessions = vi.fn();
const sendMessage = vi.fn();
const sessionWriteFile = vi.fn();
const generateLocalMessageId = vi.fn();
const modalAlert = vi.fn();
const updateSessionPermissionMode = vi.fn();
const updateSessionModelMode = vi.fn();
let attachmentClearCount = 0;

let draftInput = 'please start';
const setDraftInput = vi.fn((value: string) => {
    draftInput = value;
});

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

vi.mock('react-native', () => ({
    ActivityIndicator: 'ActivityIndicator',
    Animated: {
        Value: vi.fn(() => ({ setValue: vi.fn() })),
        timing: vi.fn(() => ({ start: vi.fn() })),
        parallel: vi.fn(() => ({ start: vi.fn() })),
        spring: vi.fn(() => ({ start: vi.fn() })),
        View: 'AnimatedView',
    },
    Image: 'Image',
    LayoutAnimation: { configureNext: vi.fn(), Presets: { easeInEaseOut: 'easeInEaseOut' } },
    Modal: 'Modal',
    Platform: { OS: 'web', select: (values: Record<string, unknown>) => values.web ?? values.default },
    Pressable: 'Pressable',
    Text: 'Text',
    TouchableWithoutFeedback: 'TouchableWithoutFeedback',
    View: 'View',
}));

vi.mock('@expo/vector-icons', () => ({
    Ionicons: 'Ionicons',
    MaterialCommunityIcons: 'MaterialCommunityIcons',
    Octicons: 'Octicons',
}));
vi.mock('expo-constants', () => ({ default: { statusBarHeight: 0 } }));
vi.mock('expo-router', () => ({ useRouter: () => ({ back: routerBack }) }));
vi.mock('react-native-keyboard-controller', () => ({ KeyboardAvoidingView: 'KeyboardAvoidingView' }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock('react-native-unistyles', () => ({
    StyleSheet: { create: (factory: (theme: unknown) => Record<string, unknown>) => factory({ colors: themeValue }) },
    useUnistyles: () => ({ theme: { colors: themeValue } }),
}));

vi.mock('@/components/MultiTextInput', () => ({
    MULTI_TEXT_INPUT_LINE_HEIGHT: 20,
    MultiTextInput: React.forwardRef((props: unknown, ref: React.Ref<unknown>) => {
        React.useImperativeHandle(ref, () => ({ focus: vi.fn() }));
        return React.createElement('MultiTextInput', props as Record<string, unknown>);
    }),
}));
vi.mock('@/components/layout', () => ({ layout: { maxWidth: 900 } }));
vi.mock('@/components/modelModeOptions', () => ({
    getDefaultEffortKeyForModel: () => 'default',
    getDefaultModelKey: () => 'default',
    getDefaultPermissionModeKey: () => 'default',
    getEffortLevelsForModel: () => [],
    getHardcodedModelModes: () => [{ key: 'default', name: 'Default' }],
    getHardcodedPermissionModes: () => [{ key: 'default', name: 'Default' }],
    getSupportsWorktree: () => false,
}));
vi.mock('@/components/pickers', () => ({
    PathPickerContent: 'PathPickerContent',
    PickerContent: 'PickerContent',
}));
vi.mock('@/constants/Typography', () => ({ Typography: { default: () => ({}) } }));
vi.mock('@/hooks/useNavigateToSession', () => ({ useNavigateToSession: () => navigateToSession }));
vi.mock('@/hooks/useNewSessionDraft', () => ({
    useNewSessionDraft: () => ({
        agentType: 'codex',
        input: draftInput,
        modelMode: null,
        permissionMode: null,
        selectedMachineId: 'machine-1',
        selectedPath: '/repo',
        sessionType: 'simple',
        setAgentType: vi.fn(),
        setInput: setDraftInput,
        setMachineId: vi.fn(),
        setModelMode: vi.fn(),
        setPath: vi.fn(),
        setPermissionMode: vi.fn(),
        setSessionType: vi.fn(),
        setWorktreeKey: vi.fn(),
        worktreeKey: null,
    }),
}));
vi.mock('@/hooks/usePreSendCommand', () => ({ usePreSendCommand: () => () => ({ intercepted: false, execute: vi.fn() }) }));
vi.mock('@/modal', () => ({ Modal: { alert: modalAlert, confirm: vi.fn() } }));
vi.mock('@/sync/storage', () => ({
    storage: { getState: () => ({ updateSessionPermissionMode, updateSessionModelMode }) },
    useAllMachines: () => [{ id: 'machine-1', activeAt: Date.now(), metadata: { homeDir: '/Users/test', displayName: 'Test machine' } }],
    useSessions: () => [],
    useSetting: () => false,
}));
vi.mock('@/sync/ops', () => ({
    machineSpawnNewSession,
    sessionWriteFile,
}));
vi.mock('@/sync/sync', () => ({
    generateLocalMessageId,
    sync: {
        applySettings: vi.fn(),
        refreshSessions,
        sendMessage,
    },
}));
vi.mock('@/text', () => ({ t: (key: string, params?: { name?: string }) => params?.name ? `${key}:${params.name}` : key }));
vi.mock('@/utils/attachmentName', async () => await import('../../../utils/attachmentName'));
vi.mock('@/utils/machineUtils', () => ({ isMachineOnline: () => true }));
vi.mock('@/utils/pathUtils', () => ({ resolveAbsolutePath: (path: string) => path }));
vi.mock('@/utils/platform', () => ({ isRunningOnMac: () => false }));
vi.mock('@/utils/responsive', () => ({ useHeaderHeight: () => 0 }));
vi.mock('@/utils/sessionUtils', () => ({
    formatLastSeen: () => 'now',
    formatPathRelativeToHome: (path: string) => path,
}));
vi.mock('@/utils/worktree', () => ({ createWorktree: vi.fn(), listWorktrees: vi.fn(async () => []) }));

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
                clear: () => {
                    attachmentClearCount += 1;
                    setAttachments([]);
                },
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

const NewSessionScreen = (await import('./index')).default;

function renderScreen() {
    let renderer!: ReturnType<typeof TestRenderer.create>;
    act(() => {
        renderer = TestRenderer.create(<NewSessionScreen />);
    });
    return renderer;
}

function addThreeAttachments(renderer: ReturnType<typeof TestRenderer.create>) {
    const root = renderer.root.findByProps({ testID: 'new-session-attachment-root' });
    const preventDropDefault = vi.fn();
    act(() => {
        root.props.onDrop({
            preventDefault: preventDropDefault,
            dataTransfer: { items: [{ kind: 'file', getAsFile: () => ({ name: 'drop.txt', size: 4 }) }] },
        });
    });
    expect(preventDropDefault).toHaveBeenCalledOnce();

    const preventPasteDefault = vi.fn();
    act(() => {
        root.props.onPaste({
            preventDefault: preventPasteDefault,
            clipboardData: { items: [{ kind: 'file', getAsFile: () => ({ name: '../paste.txt', size: 5 }) }] },
        });
    });
    expect(preventPasteDefault).toHaveBeenCalledOnce();

    act(() => {
        renderer.root.findByProps({ testID: 'attachment-open-picker' }).props.onPress();
    });
}

describe('NewSessionScreen attachments', () => {
    beforeEach(() => {
        order.length = 0;
        attachmentClearCount = 0;
        draftInput = 'please start';
        vi.clearAllMocks();
        generateLocalMessageId.mockReturnValue('local-new-id');
        machineSpawnNewSession.mockImplementation(async () => {
            order.push('spawn');
            return { type: 'success', sessionId: 'session-new' };
        });
        refreshSessions.mockImplementation(async () => {
            order.push('refresh');
        });
        sessionWriteFile.mockImplementation(async () => {
            order.push('write');
            return { success: true };
        });
        sendMessage.mockImplementation(async () => {
            order.push('send');
        });
    });

    it('populates attachment chips and uploads them after refresh before the initial send', async () => {
        const renderer = renderScreen();
        addThreeAttachments(renderer);

        const chipTexts = renderer.root.findAllByType('Text').map((node: { children: unknown[] }) => node.children.join(''));
        expect(chipTexts).toContain('drop.txt');
        expect(chipTexts).toContain('../paste.txt');
        expect(chipTexts).toContain('picked.txt');
        expect(renderer.root.findAllByProps({ testID: 'attachment-chip' })).toHaveLength(3);

        await renderer.root.findByProps({ testID: 'new-session-send' }).props.onPress();

        expect(order).toEqual(['spawn', 'refresh', 'write', 'write', 'write', 'send']);
        expect(generateLocalMessageId).toHaveBeenCalledOnce();
        expect(sessionWriteFile).toHaveBeenNthCalledWith(1, 'session-new', '.happy/attachments/local-new-id/drop.txt', 'base64:drop.txt', { createParents: true });
        expect(sessionWriteFile).toHaveBeenNthCalledWith(2, 'session-new', '.happy/attachments/local-new-id/paste.txt', 'base64:../paste.txt', { createParents: true });
        expect(sessionWriteFile).toHaveBeenNthCalledWith(3, 'session-new', '.happy/attachments/local-new-id/picked.txt', 'base64:picked.txt', { createParents: true });
        for (const call of sessionWriteFile.mock.calls) {
            expect(call[1]).toMatch(/^\.happy\/attachments\/[^/]+\/[^/]+$/);
        }
        expect(sendMessage).toHaveBeenCalledWith('session-new', 'please start\n\nAttachments:\n- .happy/attachments/local-new-id/drop.txt\n- .happy/attachments/local-new-id/paste.txt\n- .happy/attachments/local-new-id/picked.txt', {
            source: 'new_session',
            localId: 'local-new-id',
            attachmentRefs: [
                { remotePath: '.happy/attachments/local-new-id/drop.txt', name: 'drop.txt', size: 4 },
                { remotePath: '.happy/attachments/local-new-id/paste.txt', name: 'paste.txt', size: 5 },
                { remotePath: '.happy/attachments/local-new-id/picked.txt', name: 'picked.txt', size: 12 },
            ],
            displayText: 'please start',
        });
        expect(attachmentClearCount).toBe(1);
    });

    it('does not upload when spawn fails', async () => {
        machineSpawnNewSession.mockResolvedValue({ type: 'error', errorMessage: 'spawn failed' });
        const renderer = renderScreen();
        addThreeAttachments(renderer);

        await renderer.root.findByProps({ testID: 'new-session-send' }).props.onPress();

        expect(sessionWriteFile).not.toHaveBeenCalled();
        expect(sendMessage).not.toHaveBeenCalled();
        expect(modalAlert).toHaveBeenCalledWith('common.error', 'spawn failed');
    });

    it('does not upload or send when refreshSessions fails', async () => {
        refreshSessions.mockImplementation(async () => {
            order.push('refresh');
            throw new Error('refresh failed');
        });
        const renderer = renderScreen();
        addThreeAttachments(renderer);

        await renderer.root.findByProps({ testID: 'new-session-send' }).props.onPress();

        expect(order).toEqual(['spawn', 'refresh']);
        expect(sessionWriteFile).not.toHaveBeenCalled();
        expect(sendMessage).not.toHaveBeenCalled();
        expect(modalAlert).toHaveBeenCalledWith('common.error', 'refresh failed');
    });

    it('does not send when an upload fails', async () => {
        sessionWriteFile.mockImplementationOnce(async () => {
            order.push('write');
            return { success: false, error: 'write failed' };
        });
        const renderer = renderScreen();
        addThreeAttachments(renderer);

        await renderer.root.findByProps({ testID: 'new-session-send' }).props.onPress();

        expect(order).toEqual(['spawn', 'refresh', 'write']);
        expect(sendMessage).not.toHaveBeenCalled();
        expect(modalAlert).toHaveBeenCalledWith('common.error', 'write failed', [{ text: 'common.ok' }]);
    });
});
