import * as React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitFileStatus } from '@/sync/gitStatusFiles';

(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const routerPush = vi.fn();
let sidebarProps: { onFilePress?: (file: GitFileStatus) => void; selectedPath?: string | null } | null = null;

const session = {
    id: 'session-1',
    active: true,
    activeAt: Date.now(),
    presence: 'online',
    metadata: {
        path: '/repo',
        flavor: 'codex',
        machineId: 'machine-1',
    },
    agentState: null,
    permissionModeUserChosen: false,
    permissionMode: null,
    modelMode: null,
    effortLevel: null,
    latestUsage: null,
};

const themeValue = new Proxy({}, {
    get: () => themeValue,
    apply: () => '#000',
}) as unknown as string;

vi.mock('expo-router', () => ({
    useRouter: () => ({ push: routerPush, back: vi.fn(), replace: vi.fn() }),
}));

vi.mock('react-native', () => ({
    ActivityIndicator: 'ActivityIndicator',
    Platform: { OS: 'web', select: (values: Record<string, unknown>) => values.web ?? values.default },
    Pressable: 'Pressable',
    Text: 'Text',
    View: 'View',
    useWindowDimensions: () => ({ width: 1200, height: 800 }),
}));

vi.mock('react-native-reanimated', () => ({
    default: { View: 'AnimatedView' },
    Easing: { out: () => undefined, cubic: 'cubic' },
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useSharedValue: (value: unknown) => ({ value }),
    withTiming: (value: unknown) => value,
}));

vi.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        hairlineWidth: 1,
        create: (factory: (theme: unknown) => Record<string, unknown>) => factory({
            colors: themeValue,
        }),
    },
    useUnistyles: () => ({ theme: { colors: themeValue } }),
}));

vi.mock('@expo/vector-icons', () => ({
    Ionicons: 'Ionicons',
}));

vi.mock('@/components/FilesSidebar', () => ({
    FilesSidebar: (props: typeof sidebarProps) => {
        sidebarProps = props;
        return React.createElement('FilesSidebar');
    },
}));

vi.mock('@/components/AgentContentView', () => ({ AgentContentView: 'AgentContentView' }));
vi.mock('@/components/AgentInput', () => ({ AgentInput: 'AgentInput' }));
vi.mock('@/components/ChatHeaderView', () => ({ ChatHeaderView: 'ChatHeaderView' }));
vi.mock('@/components/ChatList', () => ({ ChatList: 'ChatList' }));
vi.mock('@/components/Deferred', () => ({ Deferred: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children) }));
vi.mock('@/components/EmptyMessages', () => ({ EmptyMessages: 'EmptyMessages' }));
vi.mock('@/components/SessionActionsPopover', () => ({ SessionActionsPopover: 'SessionActionsPopover' }));
vi.mock('@/components/SessionContextDrawer', () => ({
    ResumeCommandCopyBlock: 'ResumeCommandCopyBlock',
    SessionContextDrawer: 'SessionContextDrawer',
}));
vi.mock('@/components/VoiceAssistantStatusBar', () => ({ VoiceAssistantStatusBar: 'VoiceAssistantStatusBar' }));
vi.mock('@/components/SidebarContext', () => ({ useSidebar: () => ({ isExpanded: false }) }));
vi.mock('@/components/diff/PierreDiffView', () => ({ prefetchPierreDiff: vi.fn() }));
vi.mock('@/components/modelModeOptions', () => ({
    getAvailableModels: () => [],
    getAvailablePermissionModes: () => [],
    getDefaultModelKey: () => 'default',
    getEffortLevelsForModel: () => [],
    getDefaultEffortKeyForModel: () => 'default',
    resolveCurrentOption: () => null,
    resolvePermissionModeForPicker: () => null,
}));
vi.mock('@/components/autocomplete/suggestions', () => ({ getSuggestions: () => [] }));
vi.mock('@/hooks/useChatWidth', () => ({ useChatWidth: () => 800 }));
vi.mock('@/hooks/useDraft', () => ({ useDraft: () => ({ clearDraft: vi.fn() }) }));
vi.mock('@/hooks/usePreSendCommand', () => ({ usePreSendCommand: () => () => ({ intercepted: false, execute: vi.fn() }) }));
vi.mock('@/hooks/useSessionQuickActions', () => ({ useSessionQuickActions: () => ({ canResume: false, resumeAvailability: null, resumeSession: vi.fn(), resumeSessionInline: vi.fn(), resumingSession: false }) }));
vi.mock('@/modal', () => ({ Modal: { alert: vi.fn() } }));
vi.mock('@/realtime/hooks/voiceHooks', () => ({ voiceHooks: { onVoiceStarted: vi.fn(), onVoiceStopped: vi.fn() } }));
vi.mock('@/realtime/RealtimeSession', () => ({
    getCurrentVoiceConversationId: () => null,
    getCurrentVoiceSessionDurationSeconds: () => 0,
    startRealtimeSession: vi.fn(),
    stopRealtimeSession: vi.fn(),
}));
vi.mock('./composeBoundaryAdvisory', () => ({ shouldShowBoundaryAdvisory: () => false, updateComposeStartAt: (_current: unknown, _prev: string, next: string, now: number) => next ? now : null }));
vi.mock('@/sync/gitStatusSync', () => ({ gitStatusSync: { getSync: vi.fn(), invalidate: vi.fn() } }));
vi.mock('@/sync/ops', () => ({
    cancelPendingSwitch: vi.fn(),
    requestSwitch: vi.fn(),
    sessionAbort: vi.fn(),
    sessionEmitAgentConfiguration: vi.fn(),
}));
vi.mock('@/sync/storage', () => ({
    storage: { getState: () => ({}), applyLocalSettings: vi.fn() },
    useIsDataReady: () => true,
    useLatestBoundary: () => null,
    useLocalSetting: () => ({}),
    useLocalSettingMutable: () => [false, vi.fn()],
    useMachine: () => null,
    useRealtimeStatus: () => 'disconnected',
    useSession: () => session,
    useSessionMessages: () => ({ messages: [], isLoaded: true }),
    useSessionUsage: () => null,
    useSetting: (key: string) => key === 'fileDiffsSidebar',
}));
vi.mock('@/sync/sync', () => ({ sync: { onSessionVisible: vi.fn(), onActiveSessionChanged: vi.fn(), sendMessage: vi.fn() } }));
vi.mock('@/text', () => ({ t: (key: string) => key }));
vi.mock('@/track', () => ({ tracking: null }));
vi.mock('@/sync/persistence', () => ({ getVoiceMessageCount: () => 0, getVoiceOnboardingPromptLoadCount: () => 0 }));
vi.mock('@/utils/platform', () => ({ isRunningOnMac: () => false }));
vi.mock('@/utils/responsive', () => ({
    useDeviceType: () => 'desktop',
    useHeaderHeight: () => 0,
    useIsLandscape: () => false,
    useIsTablet: () => false,
}));
vi.mock('@/utils/sessionUtils', () => ({
    formatPathRelativeToHome: (path: string) => path,
    getResumeCommandBlock: () => null,
    getSessionAvatarId: () => 'avatar',
    getSessionMode: () => 'local',
    getSessionName: () => 'Session',
    useSessionStatus: () => ({ state: 'idle', statusText: '', statusColor: '#000', statusDotColor: '#000', isPulsing: false, isConnected: true }),
}));
vi.mock('@/utils/versionUtils', () => ({ isVersionSupported: () => true, MINIMUM_CLI_VERSION: '0.0.0' }));

const { SessionView } = await import('./SessionView');
const { encodeBase64Url } = await import('@/utils/base64url');

describe('SessionView file sidebar routing', () => {
    beforeEach(() => {
        routerPush.mockReset();
        sidebarProps = null;
    });

    it('routes sidebar file clicks to the full file viewer instead of selecting an inline overlay', async () => {
        await act(async () => {
            TestRenderer.create(<SessionView id="session-1" />);
        });

        expect(sidebarProps?.selectedPath).toBeUndefined();

        const file = {
            fullPath: 'src/a&b.ts',
            fileName: 'a&b.ts',
            filePath: 'src',
            status: 'modified',
            linesAdded: 1,
            linesRemoved: 0,
        } as GitFileStatus;

        await act(async () => {
            sidebarProps?.onFilePress?.(file);
        });

        expect(routerPush).toHaveBeenCalledWith(`/session/session-1/file?path=${encodeBase64Url(file.fullPath)}&refresh=1&view=diff`);
    });
});
