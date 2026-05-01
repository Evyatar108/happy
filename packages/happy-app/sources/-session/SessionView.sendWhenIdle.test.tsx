import * as React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Session } from '@/sync/storageTypes';

(
    globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
    }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', () => ({
    ActivityIndicator: 'ActivityIndicator',
    Platform: {
        OS: 'web',
        select: (options: Record<string, unknown>) => options.web ?? options.default,
    },
    Pressable: 'Pressable',
    Text: 'Text',
    View: 'View',
}));

vi.mock('react-native-unistyles', () => {
    const colors = new Proxy({
        button: {
            primary: { background: '#000', tint: '#fff' },
            secondary: { tint: '#111' },
        },
    }, { get: (target, prop) => prop in target ? target[prop as keyof typeof target] : '#222' });
    const theme = { colors };

    return {
        StyleSheet: {
            create: (factory: (themeArg: typeof theme) => Record<string, unknown>) => factory(theme),
        },
        useUnistyles: () => ({ theme }),
    };
});

vi.mock('@expo/vector-icons', () => ({
    Ionicons: 'Ionicons',
}));

vi.mock('expo-router', () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn() }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
vi.mock('@/text', () => ({ t: (key: string) => key }));
vi.mock('@/modal', () => ({ Modal: { alert: vi.fn() } }));
vi.mock('@/components/AgentContentView', () => ({
    AgentContentView: ({ input }: { input?: React.ReactNode }) => <>{input}</>,
}));
vi.mock('@/components/AgentInput', () => ({ AgentInput: 'AgentInput' }));
vi.mock('@/components/modelModeOptions', () => ({
    getAvailableModels: () => [],
    getAvailablePermissionModes: () => [],
    getDefaultEffortKeyForModel: () => 'default',
    getDefaultModelKey: () => 'default',
    getEffortLevelsForModel: () => [],
    resolveCurrentOption: () => null,
    resolvePermissionModeForPicker: () => null,
}));
vi.mock('@/components/autocomplete/suggestions', () => ({ getSuggestions: vi.fn() }));
vi.mock('@/components/ChatHeaderView', () => ({ ChatHeaderView: 'ChatHeaderView' }));
vi.mock('@/components/ChatList', () => ({ ChatList: 'ChatList' }));
vi.mock('@/components/Deferred', () => ({ Deferred: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/EmptyMessages', () => ({ EmptyMessages: 'EmptyMessages' }));
vi.mock('@/components/SessionActionsPopover', () => ({ SessionActionsPopover: 'SessionActionsPopover' }));
vi.mock('@/components/SidebarContext', () => ({ useSidebar: () => ({ isExpanded: false }) }));
vi.mock('@/components/VoiceAssistantStatusBar', () => ({ VoiceAssistantStatusBar: 'VoiceAssistantStatusBar' }));
vi.mock('@/hooks/useChatWidth', () => ({ useChatWidth: () => ({ body: 640 }) }));
const mockClearDraft = vi.fn();
vi.mock('@/hooks/useDraft', () => ({ useDraft: () => ({ clearDraft: mockClearDraft }) }));
vi.mock('@/hooks/usePreSendCommand', () => ({ usePreSendCommand: () => () => ({ intercepted: false, execute: vi.fn() }) }));
vi.mock('@/realtime/hooks/voiceHooks', () => ({ voiceHooks: { onVoiceStarted: vi.fn(), onVoiceStopped: vi.fn() } }));
vi.mock('@/realtime/RealtimeSession', () => ({
    getCurrentVoiceConversationId: vi.fn(),
    getCurrentVoiceSessionDurationSeconds: vi.fn(),
    startRealtimeSession: vi.fn(),
    stopRealtimeSession: vi.fn(),
}));
vi.mock('./composeBoundaryAdvisory', () => ({
    shouldShowBoundaryAdvisory: () => false,
    updateComposeStartAt: (_current: number | null, _previous: string, next: string, now: number) => next ? now : null,
}));
vi.mock('@/sync/gitStatusSync', () => ({ gitStatusSync: { getSync: vi.fn() } }));
vi.mock('@/sync/ops', () => ({
    cancelPendingSwitch: vi.fn(),
    requestSwitch: vi.fn(),
    sessionAbort: vi.fn(),
}));
const mockUseSession = vi.fn<(id: string) => Session | null>(() => null);

vi.mock('@/sync/storage', () => ({
    storage: { getState: () => ({ applyLocalSettings: vi.fn() }) },
    useIsDataReady: () => true,
    useLatestBoundary: () => null,
    useLocalSetting: () => ({}),
    useRealtimeStatus: () => 'disconnected',
    useSession: (id: string) => mockUseSession(id),
    useSessionMessages: () => ({ messages: [], isLoaded: true }),
    useSessionUsage: () => null,
    useSetting: () => false,
}));
const mockSendMessage = vi.fn<() => Promise<void>>();
vi.mock('@/sync/sync', () => ({ sync: { onSessionVisible: vi.fn(), onActiveSessionChanged: vi.fn(), reportRenderWindow: vi.fn(), sendMessage: (..._args: unknown[]) => mockSendMessage() } }));
vi.mock('@/track', () => ({ tracking: { capture: vi.fn() } }));
vi.mock('@/sync/persistence', () => ({ getVoiceMessageCount: () => 0, getVoiceOnboardingPromptLoadCount: () => 0 }));
vi.mock('@/utils/platform', () => ({ isRunningOnMac: () => false }));
vi.mock('@/utils/responsive', () => ({
    useDeviceType: () => 'desktop',
    useHeaderHeight: () => 48,
    useIsLandscape: () => false,
    useIsTablet: () => false,
}));
vi.mock('@/utils/sessionUtils', () => ({
    formatPathRelativeToHome: (path: string) => path,
    getResumeCommandBlock: () => null,
    getSessionAvatarId: () => 'avatar',
    getSessionMode: (session: Session) => session.agentState?.controlledByUser === true ? 'local' : 'remote',
    getSessionName: () => 'Session',
    useSessionStatus: () => ({
        isConnected: true,
        state: 'idle',
        statusText: 'connected',
        statusColor: '#000',
        statusDotColor: '#000',
        isPulsing: false,
    }),
}));
vi.mock('@/utils/versionUtils', () => ({ MINIMUM_CLI_VERSION: '0.0.0', isVersionSupported: () => true }));

const { PendingSwitchBanner, getCanSendWhenIdle, SessionView } = await import('./SessionView');

function makeSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: { flavor: 'claude', path: '', host: '' },
        metadataVersion: 1,
        agentState: { controlledByUser: true, turnActive: true },
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 0,
        presence: 'online',
        permissionModeUserChosen: false,
        ...overrides,
    };
}

type Renderer = ReturnType<typeof TestRenderer.create>;

function treeText(renderer: Renderer) {
    return JSON.stringify(renderer.toJSON());
}

describe('SessionView when-idle onSend optimistic-clear contract', () => {
    beforeEach(() => {
        mockSendMessage.mockReset();
        mockClearDraft.mockReset();
        mockUseSession.mockReset();
    });

    function makeLocalClaudeSession(): Session {
        return {
            id: 'session-1',
            seq: 1,
            createdAt: 1,
            updatedAt: 1,
            active: true,
            activeAt: 1,
            metadata: { flavor: 'claude', path: '', host: '' },
            metadataVersion: 1,
            agentState: { controlledByUser: true, turnActive: true },
            agentStateVersion: 1,
            thinking: false,
            thinkingAt: 0,
            presence: 'online',
            permissionModeUserChosen: false,
        };
    }

    it('clears the composer synchronously before awaiting sendMessage on when-idle send', async () => {
        mockUseSession.mockReturnValue(makeLocalClaudeSession());
        let resolveSend!: () => void;
        mockSendMessage.mockReturnValue(new Promise<void>((resolve) => { resolveSend = resolve; }));

        let renderer!: Renderer;
        act(() => {
            renderer = TestRenderer.create(<SessionView id="session-1" />);
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
const agentInput = renderer.root.findAllByType('AgentInput' as any)[0];

        // Prime the message state so onSend has a non-empty trimmed message to send
        act(() => {
            agentInput.props.onChangeText('hello world');
        });

        let sendPromise!: Promise<void>;
        act(() => {
            sendPromise = agentInput.props.onSend('when-idle');
        });

        // Optimistic clear: draft must be cleared and sendMessage called before the promise resolves
        expect(mockClearDraft).toHaveBeenCalledOnce();
        expect(mockSendMessage).toHaveBeenCalledOnce();
        // Composer value must already be empty while the send is still in-flight
        expect(agentInput.props.value).toBe('');

        // Resolve the send and verify no further state change
        act(() => { resolveSend(); });
        await sendPromise;
        expect(agentInput.props.value).toBe('');
    });

    it('restores the composer text when sendMessage rejects on when-idle send', async () => {
        mockUseSession.mockReturnValue(makeLocalClaudeSession());
        let rejectSend!: (e: Error) => void;
        mockSendMessage.mockReturnValue(new Promise<void>((_, reject) => { rejectSend = reject; }));

        let renderer!: Renderer;
        act(() => {
            renderer = TestRenderer.create(<SessionView id="session-1" />);
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
const agentInput = renderer.root.findAllByType('AgentInput' as any)[0];

        // Prime the message state
        act(() => {
            agentInput.props.onChangeText('hello world');
        });

        let sendPromise!: Promise<void>;
        act(() => {
            sendPromise = agentInput.props.onSend('when-idle');
        });

        // Composer must be cleared optimistically before the rejection
        expect(agentInput.props.value).toBe('');
        expect(mockClearDraft).toHaveBeenCalledOnce();

        // Reject the send — composer text must be restored to the snapshot
        await act(async () => {
            rejectSend(new Error('rpc failed'));
            await sendPromise;
        });

        expect(agentInput.props.value).toBe('hello world');
    });

    it('does NOT restore the snapshot when user has typed new text during in-flight send rejection', async () => {
        mockUseSession.mockReturnValue(makeLocalClaudeSession());
        let rejectSend!: (e: Error) => void;
        mockSendMessage.mockReturnValue(new Promise<void>((_, reject) => { rejectSend = reject; }));

        let renderer!: Renderer;
        act(() => {
            renderer = TestRenderer.create(<SessionView id="session-1" />);
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
const agentInput = renderer.root.findAllByType('AgentInput' as any)[0];

        // Prime the message state
        act(() => {
            agentInput.props.onChangeText('hello world');
        });

        let sendPromise!: Promise<void>;
        act(() => {
            sendPromise = agentInput.props.onSend('when-idle');
        });

        // Composer cleared optimistically
        expect(agentInput.props.value).toBe('');

        // User types new text while the RPC is in flight
        act(() => {
            agentInput.props.onChangeText('new draft typed while in flight');
        });
        expect(agentInput.props.value).toBe('new draft typed while in flight');

        // Reject the send — new draft must NOT be overwritten by the old snapshot
        await act(async () => {
            rejectSend(new Error('rpc failed'));
            await sendPromise;
        });

        expect(agentInput.props.value).toBe('new draft typed while in flight');
    });
});

describe('SessionView send-when-idle controls', () => {
    it('renders the pending switch banner and wires both actions', () => {
        const onTakeOverNow = vi.fn();
        const onCancel = vi.fn();
        let renderer!: Renderer;
        act(() => {
            renderer = TestRenderer.create(
                <PendingSwitchBanner
                    messagePreview="queued message"
                    onCancel={onCancel}
                    onTakeOverNow={onTakeOverNow}
                />
            );
        });

        expect(treeText(renderer)).toContain('pendingSwitch.banner');
        expect(treeText(renderer)).toContain('cancelPendingSwitch.note');
        expect(treeText(renderer)).toContain('queued message');

        const buttons = renderer.root.findAllByType('Pressable');
        act(() => buttons.find((button: { props: { accessibilityLabel?: string } }) => button.props.accessibilityLabel === 'requestSwitch.now')!.props.onPress());
        act(() => buttons.find((button: { props: { accessibilityLabel?: string } }) => button.props.accessibilityLabel === 'cancelPendingSwitch.label')!.props.onPress());

        expect(onTakeOverNow).toHaveBeenCalledOnce();
        expect(onCancel).toHaveBeenCalledOnce();
    });

    it('allows send when idle only for local Claude sessions in an active turn without pending switch', () => {
        expect(getCanSendWhenIdle(makeSession())).toBe(true);
        expect(getCanSendWhenIdle(makeSession({ agentState: { controlledByUser: false, turnActive: true } }))).toBe(false);
        expect(getCanSendWhenIdle(makeSession({ agentState: { controlledByUser: true, turnActive: false } }))).toBe(false);
        expect(getCanSendWhenIdle(makeSession({ agentState: { controlledByUser: true, turnActive: true, pendingSwitch: { requestedAt: 1 } } }))).toBe(false);
    });

    it.each(['codex', 'gemini', 'openclaw', 'opencode', 'acp', undefined])(
        'hides send when idle for %s sessions',
        (flavor) => {
            expect(getCanSendWhenIdle(makeSession({ metadata: flavor === undefined ? null : { flavor, path: '', host: '' } }))).toBe(false);
        },
    );
});
