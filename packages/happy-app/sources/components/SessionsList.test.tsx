import * as React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import type { SessionRowData } from '@/sync/storage';

(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const theme = {
    colors: {
        groupped: { background: '#f0f0f0', sectionTitle: '#666666' },
        surface: '#ffffff',
        surfaceHighest: '#f8f8f8',
        surfaceSelected: '#eeeeee',
        text: '#111111',
        textSecondary: '#777777',
        permission: {
            acceptEdits: '#2f80ed',
            bypass: '#d92d20',
            plan: '#7a5af8',
            readOnly: '#12b76a',
            safeYolo: '#f79009',
            yolo: '#f04438',
            default: '#667085',
        },
    },
};

type TestRendererInstance = ReturnType<typeof TestRenderer.create>;
type RenderNode = {
    props: { children?: unknown } & Record<string, unknown>;
    findAllByType: (type: string) => RenderNode[];
};

vi.mock('react-native', () => ({
    View: 'View',
    Pressable: 'Pressable',
    FlatList: 'FlatList',
    Platform: { OS: 'web', select: (values: Record<string, unknown>) => values.web ?? values.default },
    StyleSheet: { hairlineWidth: 1 },
}));

vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        create: (factory: (themeArg: typeof theme) => Record<string, unknown>) => factory(theme),
        hairlineWidth: 1,
    },
    useUnistyles: () => ({ theme }),
}));

vi.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

vi.mock('react-native-reanimated', () => ({
    default: { View: 'AnimatedView', Text: 'AnimatedText' },
    Easing: { out: () => undefined, cubic: 'cubic' },
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useSharedValue: (value: unknown) => ({ value }),
    withTiming: (value: unknown) => value,
}));

vi.mock('@expo/vector-icons', () => ({
    Ionicons: 'Ionicons',
}));

vi.mock('expo-image', () => ({
    Image: 'Image',
}));

vi.mock('expo-router', () => ({
    usePathname: () => '/session/session-1',
    useRouter: () => ({ navigate: () => {}, push: () => {} }),
}));

vi.mock('expo-store-review', () => ({
    hasAction: async () => false,
    isAvailableAsync: async () => false,
    requestReview: async () => undefined,
}));

vi.mock('@/components/StyledText', () => ({
    Text: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('Text', props, children),
}));

vi.mock('./Avatar', () => ({
    Avatar: 'Avatar',
}));

vi.mock('./StatusDot', () => ({
    StatusDot: 'StatusDot',
}));

vi.mock('./UpdateBanner', () => ({
    UpdateBanner: 'UpdateBanner',
}));

vi.mock('./SessionActionsPopover', () => ({
    SessionActionsPopover: 'SessionActionsPopover',
}));

vi.mock('./ActiveSessionsGroupCompact', () => ({
    ActiveSessionsGroupCompact: 'ActiveSessionsGroupCompact',
}));

vi.mock('./NewSessionAgentIcons', () => ({
    newSessionAgentIcons: { codex: 1, claude: 2, gemini: 3, openclaw: 4 },
}));

vi.mock('@/hooks/useNavigateToSession', () => ({
    useNavigateToSession: () => () => {},
}));

vi.mock('@/hooks/useVisibleSessionListViewData', () => ({
    useVisibleSessionListViewData: () => [],
}));

vi.mock('@/hooks/useSessionQuickActions', () => ({
    useSessionActionAlert: () => () => {},
    useSessionQuickActions: () => ({ archiveSession: () => {}, archivingSession: false }),
}));

vi.mock('@/utils/responsive', () => ({
    useIsTablet: () => false,
}));

vi.mock('@/utils/requestReview', () => ({
    requestReview: () => {},
}));

vi.mock('@/utils/sessionUtils', () => ({
    formatLastSeen: () => 'just now',
    vibingMessages: ['vibing'],
}));

vi.mock('@/sync/storage', () => {
    return {
        useSettingMutable: () => [false, () => {}],
    };
});

vi.mock('@/text', () => ({
    t: (key: string, params?: Record<string, unknown>) => {
        if (key === 'status.lastSeen') {
            return `Last seen ${params?.time}`;
        }
        return {
            'status.online': 'Online',
            'status.permissionRequired': 'Permission required',
            'sidebar.showArchived': 'Show archived',
            'sidebar.hideArchived': 'Hide archived',
        }[key] ?? key;
    },
}));

vi.mock('@/constants/Typography', () => ({
    Typography: { default: () => ({}) },
}));

vi.mock('./layout', () => ({
    layout: { maxWidth: 720 },
}));

const { SessionItem, formatModelCode } = await import('./SessionsList');

const baseSession: SessionRowData = {
    id: 'session-1',
    name: 'Session One',
    subtitle: 'D:/repo',
    avatarId: 'avatar-1',
    flavor: null,
    currentModelCode: null,
    currentPermissionModeCode: null,
    state: 'waiting',
    hasDraft: false,
    active: true,
    machineId: 'machine-1',
    machineName: 'Dev Box',
    path: 'D:/repo',
    homeDir: 'D:/',
    completedTodosCount: 0,
    totalTodosCount: 0,
};

function renderSession(session: Partial<SessionRowData>): TestRendererInstance {
    let renderer!: TestRendererInstance;
    act(() => {
        renderer = TestRenderer.create(
            <SessionItem
                session={{ ...baseSession, ...session }}
                selected={false}
                isFirst
                isLast
                isSingle
            />
        );
    });
    return renderer;
}

function textContent(node: RenderNode): string {
    return node.findAllByType('Text')
        .flatMap(child => child.props.children)
        .filter((child): child is string | number => typeof child === 'string' || typeof child === 'number')
        .join('');
}

describe('SessionsList role pills', () => {
    it('formats known model families from the last dash segment', () => {
        expect(formatModelCode('gpt-5-codex')).toBe('codex');
        expect(formatModelCode('claude-opus')).toBe('opus');
        expect(formatModelCode('long-model-code-value')).toBe('long-model-…');
        expect(formatModelCode('   ')).toBeNull();
    });

    it('renders flavor, model, and permission pills for session metadata', () => {
        const renderer = renderSession({
            flavor: 'codex',
            currentModelCode: 'gpt-5-codex',
            currentPermissionModeCode: 'plan',
            state: 'waiting',
        });

        const flavorPill = renderer.root.findByProps({ testID: 'session-role-pill-flavor' });
        expect(flavorPill).toBeTruthy();
        expect(flavorPill.findAllByType('Image')).toHaveLength(1);
        expect(textContent(renderer.root.findByProps({ testID: 'session-role-pill-model' }) as RenderNode)).toBe('codex');
        expect(textContent(renderer.root.findByProps({ testID: 'session-role-pill-permission' }) as RenderNode)).toBe('plan');
        expect(renderer.toJSON()).toMatchSnapshot();
    });

    it('does not render role pills or an empty row when metadata is absent', () => {
        const renderer = renderSession({
            flavor: null,
            currentModelCode: null,
            currentPermissionModeCode: null,
            state: 'waiting',
        });

        expect(renderer.root.findAllByProps({ testID: 'session-role-pill-flavor' })).toHaveLength(0);
        expect(renderer.root.findAllByProps({ testID: 'session-role-pill-model' })).toHaveLength(0);
        expect(renderer.root.findAllByProps({ testID: 'session-role-pill-permission' })).toHaveLength(0);
        expect(renderer.root.findAllByProps({ testID: 'session-role-pill-row' })).toHaveLength(0);
    });
});
