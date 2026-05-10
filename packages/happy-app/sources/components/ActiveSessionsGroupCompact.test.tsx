import * as React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const theme = {
    colors: {
        groupped: { background: '#f0f0f0', sectionTitle: '#000' },
        surface: '#fff',
        surfaceSelected: '#e0e0e0',
        textSecondary: '#8E8E93',
        text: '#000',
        divider: '#ccc',
        gitAddedText: '#34C759',
        gitRemovedText: '#FF3B30',
        status: { error: '#FF3B30' },
        shadow: { color: '#000', opacity: 0.1 },
    },
};

vi.mock('react-native', () => ({
    View: 'View',
    Pressable: 'Pressable',
    Platform: { OS: 'web', select: (s: any) => s.default ?? s.ios },
    StyleSheet: { hairlineWidth: 1 },
}));

vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        create: (factory: (t: typeof theme) => Record<string, unknown>) => factory(theme),
        hairlineWidth: 1,
    },
    useUnistyles: () => ({ theme }),
}));

vi.mock('react-native-gesture-handler', () => ({
    Swipeable: 'Swipeable',
}));

vi.mock('@expo/vector-icons', () => ({
    Ionicons: 'Ionicons',
    MaterialCommunityIcons: 'MaterialCommunityIcons',
}));

vi.mock('@/components/StyledText', () => ({
    Text: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('Text', props, children),
}));

vi.mock('@/components/Avatar', () => ({
    Avatar: 'Avatar',
}));

vi.mock('./StatusDot', () => ({
    StatusDot: 'StatusDot',
}));

vi.mock('@/sync/storage', () => ({
    useAllMachines: () => [],
    useSession: () => null,
    useSessionProjectGitStatus: () => null,
    useSessionGitStatus: () => ({
        branch: 'main',
        lastUpdatedAt: 1000,
        unstagedLinesAdded: 0,
        unstagedLinesRemoved: 0,
    }),
    useSettingMutable: () => [[], () => {}],
}));

vi.mock('@/utils/sessionUtils', () => ({
    formatPathRelativeToHome: (p: string) => p,
    vibingMessages: [],
    formatLastSeen: () => '',
}));

vi.mock('@/utils/worktree', () => ({
    isWorktreePath: () => false,
    getRepoPath: (p: string) => p,
    getWorktreeName: () => null,
}));

vi.mock('@/utils/pathUtils', () => ({
    resolvePath: (p: string) => p,
}));

vi.mock('@/hooks/useNavigateToSession', () => ({
    useNavigateToSession: () => () => {},
}));

vi.mock('./SessionActionsPopover', () => ({
    SessionActionsPopover: 'SessionActionsPopover',
}));

vi.mock('@/hooks/useSessionQuickActions', () => ({
    useSessionActionAlert: () => () => {},
    useSessionQuickActions: () => ({ archiveSession: () => {}, archivingSession: false }),
}));

vi.mock('@/hooks/useNewSessionDraft', () => ({
    useNewSessionDraft: () => ({
        setMachineId: () => {},
        setPath: () => {},
        setSessionType: () => {},
        setWorktreeKey: () => {},
    }),
}));

vi.mock('expo-router', () => ({
    useRouter: () => ({ navigate: () => {}, push: () => {} }),
}));

vi.mock('@/constants/Typography', () => ({
    Typography: { default: () => ({}) },
}));

vi.mock('@/text', () => ({
    t: (key: string) => key,
}));

const { ActiveSessionsGroupCompact } = await import('./ActiveSessionsGroupCompact');

type TestNode = { props: Record<string, unknown> };

const baseSession = {
    id: 'session-1',
    machineId: 'machine-1',
    path: '/home/user/project',
    homeDir: '/home/user',
    name: 'Test session',
    subtitle: '',
    flavor: null,
    active: true,
    machineName: null,
    state: 'waiting' as const,
    hasDraft: false,
    avatarId: 'avatar-1',
    createdAt: 1000,
    completedTodosCount: 0,
    totalTodosCount: 0,
};

function render(sessions = [baseSession]) {
    let renderer: ReturnType<typeof TestRenderer.create> | null = null;
    act(() => {
        renderer = TestRenderer.create(
            React.createElement(ActiveSessionsGroupCompact, { sessions })
        );
    });
    return renderer as ReturnType<typeof TestRenderer.create>;
}

describe('ActiveSessionsGroupCompact header layout', () => {
    it('keeps long paths constrained before the branch and git stats row', () => {
        const tree = render();
        const allViews = tree.root.findAllByType('View') as TestNode[];

        const pathContainer = allViews.find(node => {
            const s = node.props.style as Record<string, unknown> | undefined;
            return s?.flex === 1 && s?.minWidth === 0;
        });
        expect(pathContainer?.props.style).toMatchObject({ flex: 1, minWidth: 0 });

        const branchRow = allViews.find(node => {
            const s = node.props.style as Record<string, unknown> | undefined;
            return s?.marginLeft === 8 && s?.flexShrink === 0;
        });
        expect(branchRow?.props.style).toMatchObject({ marginLeft: 8, flexShrink: 0 });
    });

    it('does not render a CompactGitStatus element in the section header', () => {
        const tree = render();
        const found = tree.root.findAll(
            (node: { type: unknown }) => typeof node.type === 'string' && (node.type as string).includes('CompactGitStatus')
        );
        expect(found).toHaveLength(0);
    });
});
