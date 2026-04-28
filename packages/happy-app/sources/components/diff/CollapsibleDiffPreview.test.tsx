import * as React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiffHunk, DiffLine } from '@/components/diff/calculateDiff';

(
    globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
    }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', () => ({
    Pressable: 'Pressable',
    ScrollView: 'ScrollView',
    StyleSheet: {
        flatten: (style: unknown) => style,
    },
    Text: 'Text',
    View: 'View',
}));

const diffColors = new Proxy({}, { get: () => '#111111' }) as Record<string, string>;
const theme = {
    colors: new Proxy({ diff: diffColors }, {
        get: (target, prop) => prop in target ? target[prop as keyof typeof target] : '#111111',
    }) as Record<string, string> & { diff: Record<string, string> },
};

vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        create: (factory: (themeArg: typeof theme, runtime: unknown) => Record<string, unknown>) => factory(theme, {}),
    },
    useUnistyles: () => ({ theme }),
}));

vi.mock('react-native-reanimated', () => ({
    useAnimatedStyle: () => ({}),
}));

vi.mock('@/sync/storage', () => ({
    useSetting: () => false,
}));

vi.mock('@/text', () => ({
    t: (key: string, params?: { count?: number }) => params?.count === undefined ? key : `${key}:${params.count}`,
}));

vi.mock('@/components/StyledText', () => ({
    AnimatedText: 'AnimatedText',
    Text: 'Text',
}));

vi.mock('@/constants/Typography', () => ({
    Typography: {
        default: () => ({}),
        mono: () => ({}),
    },
}));

vi.mock('@/hooks/useChatFontScale', () => ({
    useChatScaleAnimatedTextStyle: () => null,
    useChatScaledStyles: (styles: unknown) => styles,
}));

vi.mock('@/components/diff/calculateDiff', async () => {
    const actual = await vi.importActual<typeof import('@/components/diff/calculateDiff')>('@/components/diff/calculateDiff');

    return {
        ...actual,
        calculateUnifiedDiff: vi.fn(actual.calculateUnifiedDiff),
    };
});

const calculateDiffModule = await import('@/components/diff/calculateDiff');
const { CollapsibleDiffPreview } = await import('./CollapsibleDiffPreview');
const { DiffView } = await import('./DiffView');
const { ToolDiffView } = await import('@/components/tools/ToolDiffView');

const calculateUnifiedDiffMock = vi.mocked(calculateDiffModule.calculateUnifiedDiff);
const actualCalculateUnifiedDiff = calculateUnifiedDiffMock.getMockImplementation()!;
type Renderer = ReturnType<typeof TestRenderer.create>;

function numberedLines(count: number) {
    return Array.from({ length: count }, (_, index) => `visible-${String(index + 1).padStart(2, '0')}`).join('\n');
}

function renderWithDiffView(oldText: string, newText: string) {
    return TestRenderer.create(
        <CollapsibleDiffPreview
            oldText={oldText}
            newText={newText}
            collapsedLines={10}
            renderDiff={({ hunks, maxVisibleLines }) => (
                <DiffView
                    oldText={oldText}
                    newText={newText}
                    hunks={hunks}
                    maxVisibleLines={maxVisibleLines}
                    showLineNumbers={false}
                    showPlusMinusSymbols={false}
                />
            )}
        />
    );
}

function pressToggle(renderer: Renderer) {
    act(() => {
        renderer.root.findByType('Pressable').props.onPress({ stopPropagation: vi.fn() });
    });
}

function treeText(renderer: Renderer) {
    return JSON.stringify(renderer.toJSON());
}

function makeNormalLine(content: string, lineNumber: number): DiffLine {
    return {
        type: 'normal',
        content,
        oldLineNumber: lineNumber,
        newLineNumber: lineNumber,
    };
}

function makeHunk(start: number, contents: string[]): DiffHunk {
    return {
        oldStart: start,
        oldLines: contents.length,
        newStart: start,
        newLines: contents.length,
        lines: contents.map((content, index) => makeNormalLine(content, start + index)),
    };
}

describe('CollapsibleDiffPreview', () => {
    beforeEach(() => {
        calculateUnifiedDiffMock.mockClear();
        calculateUnifiedDiffMock.mockImplementation(actualCalculateUnifiedDiff);
    });

    it('renders all visible lines without a toggle when the diff fits the collapsed budget', () => {
        let renderer: Renderer;

        act(() => {
            renderer = renderWithDiffView('', numberedLines(10));
        });

        const output = treeText(renderer!);
        for (let index = 1; index <= 10; index++) {
            expect(output).toContain(`visible-${String(index).padStart(2, '0')}`);
        }
        expect(output).not.toContain('tools.diff.showMore');
        expect(output).not.toContain('tools.diff.collapse');
    });

    it('collapses long diffs to the first 10 visible lines with a hidden-line count label', () => {
        let renderer: Renderer;

        act(() => {
            renderer = renderWithDiffView('', numberedLines(12));
        });

        const output = treeText(renderer!);
        for (let index = 1; index <= 10; index++) {
            expect(output).toContain(`visible-${String(index).padStart(2, '0')}`);
        }
        expect(output).not.toContain('visible-11');
        expect(output).not.toContain('visible-12');
        expect(output).toContain('tools.diff.showMore:2');
    });

    it('expands, then collapses back to the first 10 visible lines', () => {
        let renderer: Renderer;

        act(() => {
            renderer = renderWithDiffView('', numberedLines(12));
        });

        pressToggle(renderer!);
        let output = treeText(renderer!);
        expect(output).toContain('visible-11');
        expect(output).toContain('visible-12');
        expect(output).toContain('tools.diff.collapse');

        pressToggle(renderer!);
        output = treeText(renderer!);
        expect(output).not.toContain('visible-11');
        expect(output).not.toContain('visible-12');
        expect(output).toContain('tools.diff.showMore:2');
    });

    it('passes the same hunk array to renderDiff while toggling maxVisibleLines', () => {
        const renderDiff = vi.fn(({ maxVisibleLines }: { hunks: DiffHunk[]; maxVisibleLines: number | undefined }) => (
            <Text>{maxVisibleLines === undefined ? 'expanded' : 'collapsed'}</Text>
        ));
        let renderer: Renderer;

        act(() => {
            renderer = TestRenderer.create(
                <CollapsibleDiffPreview
                    oldText=""
                    newText={numberedLines(12)}
                    collapsedLines={10}
                    renderDiff={renderDiff}
                />
            );
        });

        const firstArgs = renderDiff.mock.calls[0][0];
        expect(firstArgs.maxVisibleLines).toBe(10);

        pressToggle(renderer!);
        const secondArgs = renderDiff.mock.calls.at(-1)![0];
        expect(secondArgs.maxVisibleLines).toBeUndefined();
        expect(secondArgs.hunks).toBe(firstArgs.hunks);

        pressToggle(renderer!);
        const thirdArgs = renderDiff.mock.calls.at(-1)![0];
        expect(thirdArgs.maxVisibleLines).toBe(10);
        expect(thirdArgs.hunks).toBe(firstArgs.hunks);
    });

    it('computes hunks once when renderDiff returns a real DiffView with supplied hunks', () => {
        act(() => {
            renderWithDiffView('', numberedLines(12));
        });

        expect(calculateUnifiedDiffMock).toHaveBeenCalledTimes(1);
    });

    it('computes hunks once when renderDiff returns a real ToolDiffView with supplied hunks', () => {
        const oldText = '';
        const newText = numberedLines(12);

        act(() => {
            TestRenderer.create(
                <CollapsibleDiffPreview
                    oldText={oldText}
                    newText={newText}
                    collapsedLines={10}
                    renderDiff={({ hunks, maxVisibleLines }) => (
                        <ToolDiffView
                            oldText={oldText}
                            newText={newText}
                            hunks={hunks}
                            maxVisibleLines={maxVisibleLines}
                        />
                    )}
                />
            );
        });

        expect(calculateUnifiedDiffMock).toHaveBeenCalledTimes(1);
    });

    it('hides a later hunk header when all of that hunk is beyond the visible budget', () => {
        const hunks = [
            makeHunk(1, ['hunk-1-a', 'hunk-1-b', 'hunk-1-c', 'hunk-1-d', 'hunk-1-e']),
            makeHunk(20, ['hunk-2-a', 'hunk-2-b', 'hunk-2-c', 'hunk-2-d', 'hunk-2-e']),
            makeHunk(40, ['hunk-3-a', 'hunk-3-b', 'hunk-3-c', 'hunk-3-d', 'hunk-3-e']),
        ];
        calculateUnifiedDiffMock.mockReturnValueOnce({ hunks, stats: { additions: 0, deletions: 0 } });
        let renderer: Renderer;

        act(() => {
            renderer = TestRenderer.create(
                <CollapsibleDiffPreview
                    oldText="old"
                    newText="new"
                    collapsedLines={10}
                    renderDiff={({ hunks: renderedHunks, maxVisibleLines }) => (
                        <DiffView
                            oldText="old"
                            newText="new"
                            hunks={renderedHunks}
                            maxVisibleLines={maxVisibleLines}
                            showLineNumbers={false}
                            showPlusMinusSymbols={false}
                        />
                    )}
                />
            );
        });

        const output = treeText(renderer!);
        expect(output).toContain('@@ -20,5 +20,5 @@');
        expect(output).not.toContain('@@ -40,5 +40,5 @@');
    });
});
