import * as React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveLegacyBrutalistAvatar } from '@/utils/avatarTopic';

type TestRendererInstance = ReturnType<typeof TestRenderer.create>;
type RenderNode = { props: Record<string, unknown> };

const reactActEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const shared = vi.hoisted(() => ({
    resolveTopicBrutalistAvatarMock: vi.fn(),
}));

vi.mock('react-native', () => ({
    View: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('View', props, children),
}));

vi.mock('expo-image', () => ({
    Image: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('Image', props, children),
}));

vi.mock('@/components/avatarBrutalistAssets', () => {
    function hashCode(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash);
    }

    return {
        allImages: Array.from({ length: 420 }, (_, index) => `image-${index}`),
        colorPairs: Array.from({ length: 6 }, (_, index) => ({
            tint: `tint-${index}`,
            background: `background-${index}`,
        })),
        hashCode,
    };
});

vi.mock('@/utils/avatarTopic', async (importActual) => {
    const actual = await importActual<typeof import('@/utils/avatarTopic')>();
    return {
        ...actual,
        resolveTopicBrutalistAvatar: shared.resolveTopicBrutalistAvatarMock.mockImplementation(actual.resolveTopicBrutalistAvatar),
    };
});

const { AvatarTopicBrutalist } = await import('./AvatarTopicBrutalist');
const { resolveTopicBrutalistAvatar } = await import('@/utils/avatarTopic');

function findByType(renderer: TestRendererInstance, type: string): RenderNode {
    return renderer.root.findByType(type) as RenderNode;
}

function imageSource(renderer: TestRendererInstance) {
    return findByType(renderer, 'Image').props.source;
}

function viewStyle(renderer: TestRendererInstance) {
    return findByType(renderer, 'View').props.style as Record<string, unknown>;
}

function imageStyle(renderer: TestRendererInstance) {
    return findByType(renderer, 'Image').props.style as Record<string, unknown>;
}

describe('AvatarTopicBrutalist', () => {
    beforeEach(() => {
        reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
        shared.resolveTopicBrutalistAvatarMock.mockClear();
    });

    it('falls back to the legacy brutalist tuple when topic props are undefined', () => {
        const expected = resolveLegacyBrutalistAvatar('session-alpha');
        let renderer: TestRendererInstance;

        act(() => {
            renderer = TestRenderer.create(<AvatarTopicBrutalist id="session-alpha" size={40} />);
        });

        expect(imageSource(renderer!)).toBe(`image-${expected.imageIndex}`);
        expect(viewStyle(renderer!).backgroundColor).toBe(`background-${expected.colorIndex}`);
        expect(resolveTopicBrutalistAvatar).toHaveBeenCalledWith({
            id: 'session-alpha',
            summaryText: undefined,
            name: undefined,
            flavor: undefined,
            pinned: null,
        });
    });

    it('updates for populated topic data once and keeps the same icon for identical metadata', () => {
        let renderer: TestRendererInstance;
        act(() => {
            renderer = TestRenderer.create(<AvatarTopicBrutalist id="topic-session" size={40} />);
        });
        const firstSource = imageSource(renderer!);
        const firstCallCount = shared.resolveTopicBrutalistAvatarMock.mock.calls.length;

        act(() => {
            renderer!.update(
                <AvatarTopicBrutalist
                    id="topic-session"
                    summaryText="Debug Metro reload on BOOX tablet"
                    metadataName="Tablet reload"
                    flavor="codex"
                    size={40}
                />
            );
        });
        const topicSource = imageSource(renderer!);
        const secondCallCount = shared.resolveTopicBrutalistAvatarMock.mock.calls.length;

        act(() => {
            renderer!.update(
                <AvatarTopicBrutalist
                    id="topic-session"
                    summaryText="Debug Metro reload on BOOX tablet"
                    metadataName="Tablet reload"
                    flavor="codex"
                    size={40}
                />
            );
        });

        const finalSource = imageSource(renderer!);

        expect(secondCallCount).toBe(firstCallCount + 1);
        expect(shared.resolveTopicBrutalistAvatarMock).toHaveBeenCalledTimes(secondCallCount);
        expect(new Set([firstSource, topicSource, finalSource]).size).toBeLessThanOrEqual(2);
        expect(finalSource).toBe(topicSource);
    });

    it('uses pinned tuple values ahead of topic input', () => {
        let renderer: TestRendererInstance;
        act(() => {
            renderer = TestRenderer.create(
                <AvatarTopicBrutalist
                    id="pin-source"
                    summaryText="This would otherwise hash differently"
                    metadataName="Ignored topic"
                    flavor="claude"
                    pinnedAvatarImageIndex={17}
                    pinnedAvatarColorIndex={3}
                />
            );
        });

        expect(imageSource(renderer!)).toBe('image-17');
        expect(viewStyle(renderer!).backgroundColor).toBe('background-3');
        expect(resolveTopicBrutalistAvatar).toHaveBeenCalledWith(expect.objectContaining({
            pinned: { imageIndex: 17, colorIndex: 3 },
        }));
    });

    it('renders the same monochrome path as AvatarBrutalist', () => {
        let renderer: TestRendererInstance;
        act(() => {
            renderer = TestRenderer.create(
                <AvatarTopicBrutalist id="mono" size={50} square={false} monochrome={true} />
            );
        });

        expect(viewStyle(renderer!).backgroundColor).toBe('#F0F0F0');
        expect(findByType(renderer!, 'Image').props.tintColor).toBe('#999999');
        expect(imageStyle(renderer!).width).toBe(40);
        expect(imageStyle(renderer!).height).toBe(40);
        expect(viewStyle(renderer!).borderRadius).toBe(25);
        expect(imageStyle(renderer!).borderRadius).toBe(25);
    });
});
