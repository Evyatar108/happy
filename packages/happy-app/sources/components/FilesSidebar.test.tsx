import * as React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitStatusFiles } from '@/sync/gitStatusFiles';
import type { GitStatus } from '@/sync/storageTypes';

type TestRendererInstance = ReturnType<typeof TestRenderer.create>;
type RenderNode = {
    props: { children?: unknown; onPress?: unknown } & Record<string, unknown>;
    findAllByType: (type: string) => RenderNode[];
};

(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const routerPush = vi.fn();
const invalidate = vi.fn();
const getGitStatusFiles = vi.fn<() => Promise<GitStatusFiles | null>>();

let currentFiles: GitStatusFiles | null = null;
let currentGitStatus: GitStatus | null = null;

const themeValue = new Proxy({}, {
    get: () => themeValue,
    apply: () => '#000',
}) as unknown as string;

vi.mock('expo-router', () => ({
    useRouter: () => ({ push: routerPush }),
}));

vi.mock('react-native', () => ({
    Platform: { OS: 'web', select: (values: Record<string, unknown>) => values.web ?? values.default },
    Pressable: 'Pressable',
    ScrollView: 'ScrollView',
    Text: 'Text',
    TextInput: 'TextInput',
    View: 'View',
}));

vi.mock('react-native-reanimated', () => ({
    default: { View: 'AnimatedView' },
    Easing: { out: () => undefined, cubic: 'cubic' },
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useSharedValue: (value: unknown) => ({ value }),
    withTiming: (value: unknown) => value,
}));

vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        hairlineWidth: 1,
        create: (factory: (theme: unknown) => Record<string, unknown>) => factory({ colors: themeValue }),
    },
    useUnistyles: () => ({ theme: { colors: themeValue } }),
}));

vi.mock('@expo/vector-icons', () => ({
    Octicons: 'Octicons',
}));

vi.mock('@/components/FileIcon', () => ({
    FileIcon: 'FileIcon',
}));

vi.mock('@/constants/Typography', () => ({
    Typography: { default: () => ({}) },
}));

vi.mock('@/sync/gitStatusSync', () => ({
    gitStatusSync: { invalidate },
}));

vi.mock('@/sync/gitStatusFiles', () => ({
    getGitStatusFiles,
}));

vi.mock('@/sync/storage', () => ({
    storage: {
        getState: () => ({
            applyGitStatusFiles: (_sessionId: string, files: GitStatusFiles | null) => {
                currentFiles = files;
            },
        }),
    },
    useSessionGitStatus: () => currentGitStatus,
    useSessionGitStatusFiles: () => currentFiles,
}));

vi.mock('@/text', () => ({
    t: (key: string) => ({
        'files.changes': 'Changes',
        'files.refreshChanges': 'Refresh changes',
        'files.refreshChangesHint': 'Fetch the latest changed files',
        'files.searchPlaceholder': 'Search files...',
        'files.noChangesTitle': 'No changes',
        'files.noChangesSubtitle': 'Working tree is clean',
        'files.noFilesFound': 'No files found',
    }[key] ?? key),
}));

const { FilesSidebar } = await import('./FilesSidebar');
const { encodeBase64Url } = await import('@/utils/base64url');

function gitFiles(paths: string[], status: 'modified' | 'deleted' = 'modified'): GitStatusFiles {
    const unstagedFiles = paths.map((fullPath) => {
        const parts = fullPath.split('/');
        return {
            fileName: parts[parts.length - 1] ?? fullPath,
            filePath: parts.slice(0, -1).join('/'),
            fullPath,
            status,
            isStaged: false,
            linesAdded: 1,
            linesRemoved: 0,
        };
    });

    return {
        stagedFiles: [],
        unstagedFiles,
        branch: 'main',
        totalStaged: 0,
        totalUnstaged: unstagedFiles.length,
    };
}

function gitStatus(lastUpdatedAt: number): GitStatus {
    return {
        branch: 'main',
        isDirty: true,
        modifiedCount: 1,
        untrackedCount: 0,
        stagedCount: 0,
        stagedLinesAdded: 0,
        stagedLinesRemoved: 0,
        unstagedLinesAdded: 1,
        unstagedLinesRemoved: 0,
        linesAdded: 1,
        linesRemoved: 0,
        linesChanged: 1,
        lastUpdatedAt,
    };
}

function treeText(root: TestRendererInstance) {
    return root.root.findAllByType('Text')
        .flatMap((node: RenderNode) => node.props.children)
        .filter((child: unknown) => typeof child === 'string' || typeof child === 'number')
        .join(' ');
}

describe('FilesSidebar', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        currentFiles = gitFiles(['src/old.ts']);
        currentGitStatus = gitStatus(1);
        getGitStatusFiles.mockResolvedValue(currentFiles);
    });

    it('invalidates git status from the header refresh button and refetches when lastUpdatedAt changes', async () => {
        let renderer!: TestRendererInstance;
        await act(async () => {
            renderer = TestRenderer.create(<FilesSidebar sessionId="session-1" />);
        });

        expect(treeText(renderer)).toContain('old.ts');

        const refreshButton = renderer.root.findByProps({ accessibilityLabel: 'Refresh changes' });
        await act(async () => {
            refreshButton.props.onPress();
        });

        expect(invalidate).toHaveBeenCalledWith('session-1');

        getGitStatusFiles.mockResolvedValueOnce(gitFiles(['src/new.ts']));
        currentGitStatus = gitStatus(2);
        await act(async () => {
            renderer.update(<FilesSidebar sessionId="session-1" selectedPath="force-rerender" />);
        });
        await act(async () => {
            renderer.update(<FilesSidebar sessionId="session-1" selectedPath="force-rerender-2" />);
        });

        expect(getGitStatusFiles).toHaveBeenLastCalledWith('session-1');
        expect(treeText(renderer)).toContain('new.ts');
    });

    it('navigates sidebar file clicks to the refreshed diff file route', async () => {
        let renderer!: TestRendererInstance;
        await act(async () => {
            renderer = TestRenderer.create(<FilesSidebar sessionId="session-1" />);
        });

        const fileRows = renderer.root.findAllByType('Pressable')
            .filter((node: RenderNode) => typeof node.props.onPress === 'function' && node.findAllByType('FileIcon').length > 0);
        await act(async () => {
            fileRows[0].props.onPress();
        });

        expect(routerPush).toHaveBeenCalledWith(`/session/session-1/file?path=${encodeBase64Url('src/old.ts')}&refresh=1&view=diff`);
    });

    it('navigates deleted file taps to the diff route instead of blocking', async () => {
        currentFiles = gitFiles(['src/removed.ts'], 'deleted');
        getGitStatusFiles.mockResolvedValue(currentFiles);

        let renderer!: TestRendererInstance;
        await act(async () => {
            renderer = TestRenderer.create(<FilesSidebar sessionId="session-1" />);
        });

        const fileRows = renderer.root.findAllByType('Pressable')
            .filter((node: RenderNode) => typeof node.props.onPress === 'function' && node.findAllByType('FileIcon').length > 0);
        expect(fileRows.length).toBeGreaterThan(0);

        await act(async () => {
            fileRows[0].props.onPress();
        });

        expect(routerPush).toHaveBeenCalledWith(`/session/session-1/file?path=${encodeBase64Url('src/removed.ts')}&refresh=1&view=diff`);
    });
});
