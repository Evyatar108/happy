import * as React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

(
    globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
        requestAnimationFrame: (callback: FrameRequestCallback) => number;
    }
).IS_REACT_ACT_ENVIRONMENT = true;

(globalThis as typeof globalThis & { requestAnimationFrame: (callback: FrameRequestCallback) => number }).requestAnimationFrame = (callback) => {
    callback(0);
    return 0;
};

const routeParams = vi.fn<() => Record<string, string>>();
const sessionReadFile = vi.fn();
const sessionBash = vi.fn();

const shared = {
    cache: null as null | { content: string | null; diff: string | null; isBinary: boolean },
    sessions: {
        'session-1': {
            metadata: {
                path: '/repo',
                os: 'linux',
            },
        },
    } as Record<string, { metadata: { path: string; os?: string } }>,
    applyFileCache: vi.fn(),
};

vi.mock('expo-router', () => ({
    useLocalSearchParams: () => routeParams(),
}));

vi.mock('react-native', () => ({
    ActivityIndicator: 'ActivityIndicator',
    Platform: {
        OS: 'web',
        select: (values: Record<string, unknown>) => values.web ?? values.default,
    },
    Pressable: 'Pressable',
    ScrollView: 'ScrollView',
    View: 'View',
}));

vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        create: (factory: (theme: unknown) => Record<string, unknown>) => factory({}),
    },
    useUnistyles: () => ({
        theme: {
            colors: new Proxy({}, { get: () => '#000' }),
        },
    }),
}));

vi.mock('@/components/StyledText', () => ({
    Text: 'Text',
}));

vi.mock('@/components/SimpleSyntaxHighlighter', () => ({
    SimpleSyntaxHighlighter: 'SimpleSyntaxHighlighter',
}));

vi.mock('@/components/layout', () => ({
    layout: {
        maxWidth: 800,
    },
}));

vi.mock('@/constants/Typography', () => ({
    Typography: {
        default: () => ({}),
        mono: () => ({}),
    },
}));

vi.mock('@/sync/ops', () => ({
    sessionReadFile: (...args: unknown[]) => sessionReadFile(...args),
    sessionBash: (...args: unknown[]) => sessionBash(...args),
}));

vi.mock('@/sync/storage', () => ({
    storage: {
        getState: () => ({
            sessions: shared.sessions,
            applyFileCache: shared.applyFileCache,
        }),
    },
    useSessionFileCache: () => shared.cache,
}));

vi.mock('@/modal', () => ({
    Modal: {
        alert: vi.fn(),
    },
}));

vi.mock('@/text', () => ({
    t: (key: string, params?: Record<string, string>) => params?.fileName ? `${key}:${params.fileName}` : key,
}));

vi.mock('@/components/FileIcon', () => ({
    FileIcon: 'FileIcon',
}));

const { default: FileScreen } = await import('./file');
const { encodeBase64Url } = await import('@/utils/base64url');

function encode(value: string): string {
    return btoa(value);
}

function readFileResponse(text: string) {
    return Promise.resolve({ success: true, content: btoa(text) });
}

function deferredReadFileResponse(text: string) {
    let resolve!: (value: { success: true; content: string }) => void;
    const promise = new Promise<{ success: true; content: string }>((innerResolve) => {
        resolve = innerResolve;
    });
    return {
        promise,
        resolve: () => resolve({ success: true, content: btoa(text) }),
    };
}

describe('FileScreen', () => {
    beforeEach(() => {
        shared.cache = null;
        shared.sessions['session-1'] = { metadata: { path: '/repo', os: 'linux' } };
        shared.applyFileCache.mockReset();
        sessionReadFile.mockReset();
        sessionBash.mockReset();
        routeParams.mockReturnValue({
            id: 'session-1',
            path: encode('/repo/src/file.ts'),
        });
    });

    it('does not paint cached content while refresh=1 waits for a fresh read', async () => {
        shared.cache = { content: 'cached content', diff: null, isBinary: false };
        routeParams.mockReturnValue({
            id: 'session-1',
            path: encode('/repo/src/file.ts'),
            refresh: '1',
            view: 'file',
        });
        const pending = deferredReadFileResponse('fresh content');
        sessionReadFile.mockReturnValue(pending.promise);

        let renderer!: ReturnType<typeof TestRenderer.create>;
        await act(async () => {
            renderer = TestRenderer.create(<FileScreen />);
        });

        expect(JSON.stringify(renderer!.toJSON())).not.toContain('cached content');
        expect(JSON.stringify(renderer!.toJSON())).toContain('files.loadingFile:file.ts');

        await act(async () => {
            pending.resolve();
            await pending.promise;
        });

        expect(JSON.stringify(renderer!.toJSON())).toContain('fresh content');
    });

    it('skips git diff RPCs when view=file is requested', async () => {
        routeParams.mockReturnValue({
            id: 'session-1',
            path: encode('/repo/src/file.ts'),
            view: 'file',
        });
        sessionReadFile.mockReturnValue(readFileResponse('file content'));

        await act(async () => {
            TestRenderer.create(<FileScreen />);
        });

        expect(sessionBash).not.toHaveBeenCalled();
    });

    it('fetches git diff with OS-aware quoting when view=diff is requested', async () => {
        shared.sessions['session-1'] = { metadata: { path: '/repo', os: 'win32' } };
        routeParams.mockReturnValue({
            id: 'session-1',
            path: encode('/repo/src/a&b.ts'),
            view: 'diff',
        });
        sessionBash.mockResolvedValue({ success: true, stdout: 'diff --git a/src/a&b.ts b/src/a&b.ts\n', stderr: '', exitCode: 0 });
        sessionReadFile.mockReturnValue(readFileResponse('file content'));

        await act(async () => {
            TestRenderer.create(<FileScreen />);
        });

        expect(sessionBash).toHaveBeenCalledWith('session-1', expect.objectContaining({
            command: 'git diff --no-ext-diff -- "src/a^&b.ts"',
            cwd: '/repo',
        }));
    });

    it('decodes base64url route paths that would contain slash in standard base64', async () => {
        const filePath = `/repo/${String.fromCodePoint(0x083e)}.txt`;
        routeParams.mockReturnValue({
            id: 'session-1',
            path: encodeBase64Url(filePath),
            view: 'file',
        });
        sessionReadFile.mockReturnValue(readFileResponse('file content'));

        await act(async () => {
            TestRenderer.create(<FileScreen />);
        });

        expect(sessionReadFile).toHaveBeenCalledWith('session-1', filePath);
    });
});
