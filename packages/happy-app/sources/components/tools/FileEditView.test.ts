import { readFileSync } from 'node:fs';
import * as React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', () => ({
    View: 'View',
    Text: 'Text',
    StyleSheet: { flatten: (s: unknown) => s, hairlineWidth: 1, create: (s: unknown) => s },
    Platform: { OS: 'web', select: (s: any) => s.default ?? s.ios ?? s.web ?? Object.values(s)[0] },
}));

vi.mock('react-native-unistyles', () => {
    function dp(): any { return new Proxy({}, { get: () => dp() }); }
    const t = dp();
    return {
        StyleSheet: { create: (f: any) => f(t, {}) },
        useUnistyles: () => ({ theme: t }),
    };
});

vi.mock('react-native-reanimated', () => ({
    useAnimatedStyle: () => ({}),
}));

vi.mock('@/sync/storage', () => ({
    useSetting: () => false,
}));

vi.mock('@/components/StyledText', () => ({
    AnimatedText: 'AnimatedText',
    Text: 'Text',
}));

vi.mock('@/constants/Typography', () => ({
    Typography: { default: () => ({}), mono: () => ({}) },
}));

vi.mock('@/hooks/useChatFontScale', () => ({
    useChatScaleAnimatedTextStyle: () => null,
    useChatScaledStyles: (s: unknown) => s,
}));

vi.mock('@/components/diff/PierreDiffView', () => ({
    PierreDiffView: (props: Record<string, unknown>) =>
        React.createElement('PierreDiffViewMock', {
            patch: props.patch,
            oldFile: props.oldFile,
            newFile: props.newFile,
        }),
}));

vi.mock('@/components/diff/calculateDiff', () => ({
    calculateUnifiedDiff: () => ({ hunks: [], stats: { additions: 0, deletions: 0 } }),
}));

vi.mock('@/text', () => ({
    t: (key: string) => key,
}));

vi.mock('@/utils/trimIdent', () => ({
    trimIdent: (s: string) => s,
}));

vi.mock('@/utils/pathUtils', () => ({
    resolvePath: (p: string) => p,
}));

vi.mock('@expo/vector-icons', () => ({
    Octicons: 'Octicons',
    Ionicons: 'Ionicons',
    MaterialCommunityIcons: 'MaterialCommunityIcons',
}));

// Mock unrelated views imported by _all.tsx to avoid deep import-chain issues.
vi.mock('./views/EditView', () => ({ EditView: 'EditView' }));
vi.mock('./views/BashView', () => ({ BashView: 'BashView' }));
vi.mock('./views/WriteView', () => ({ WriteView: 'WriteView' }));
vi.mock('./views/TodoView', () => ({ TodoView: 'TodoView' }));
vi.mock('./views/ExitPlanToolView', () => ({ ExitPlanToolView: 'ExitPlanToolView' }));
vi.mock('./views/MultiEditView', () => ({ MultiEditView: 'MultiEditView' }));
vi.mock('./views/TaskView', () => ({ TaskView: 'TaskView' }));
vi.mock('./views/BashViewFull', () => ({ BashViewFull: 'BashViewFull' }));
vi.mock('./views/EditViewFull', () => ({ EditViewFull: 'EditViewFull' }));
vi.mock('./views/MultiEditViewFull', () => ({ MultiEditViewFull: 'MultiEditViewFull' }));
vi.mock('./views/CodexBashView', () => ({ CodexBashView: 'CodexBashView' }));
vi.mock('./views/CodexPatchView', () => ({ CodexPatchView: 'CodexPatchView' }));
vi.mock('./views/CodexDiffView', () => ({ CodexDiffView: 'CodexDiffView' }));
vi.mock('./views/AskUserQuestionView', () => ({ AskUserQuestionView: 'AskUserQuestionView' }));
vi.mock('./views/GeminiEditView', () => ({ GeminiEditView: 'GeminiEditView' }));
vi.mock('./views/GeminiExecuteView', () => ({ GeminiExecuteView: 'GeminiExecuteView' }));

const { knownTools } = await import('./knownTools');
const { toolViewRegistry, FileEditView } = await import('./views/_all');

function makeTool(input: Record<string, unknown>) {
    return {
        name: 'file-edit',
        state: 'completed' as const,
        input,
        createdAt: 1,
        startedAt: 1,
        completedAt: 2,
        description: null,
    };
}

function renderFileEditView(input: Record<string, unknown>) {
    let renderer: ReturnType<typeof TestRenderer.create> | null = null;
    act(() => {
        renderer = TestRenderer.create(
            React.createElement(FileEditView, {
                tool: makeTool(input),
                metadata: null,
                messages: [],
                sessionId: 'session-1',
            })
        );
    });
    return renderer as ReturnType<typeof TestRenderer.create>;
}

describe('file-edit tool registration', () => {
    it('registers the ACP file-edit input shape with file-edit metadata chrome', () => {
        const fileEditEntry = (knownTools as any)['file-edit'];
        expect(fileEditEntry).toBeDefined();

        const result = fileEditEntry.input.safeParse({
            filePath: '/src/foo.ts',
            diff: 'some-diff',
            oldContent: 'old',
            newContent: 'new',
        });
        expect(result.success).toBe(true);
        expect(result.data.filePath).toBe('/src/foo.ts');
        expect(result.data.diff).toBe('some-diff');
        expect(result.data.oldContent).toBe('old');
        expect(result.data.newContent).toBe('new');
        expect(fileEditEntry.icon).toBeTypeOf('function');
    });

    it('routes file-edit through FileEditView and file navigation', () => {
        // Source-string check for ToolView dispatch ordering — cannot be observed at render time.
        const toolView = readFileSync(new URL('./ToolView.tsx', import.meta.url), 'utf8');
        expect(toolViewRegistry['file-edit']).toBe(FileEditView);
        expect(toolViewRegistry['ExitPlanMode']).toBeDefined();
        expect(toolView).toContain("const fileEditTools = ['Edit', 'MultiEdit', 'Write', 'file-edit'];");
        expect(toolView).toContain("typeof tool.input?.filePath === 'string'");
    });

    it('delegates ACP file-edit payloads to ToolDiffView', () => {
        // Patch path: PierreDiffView receives the patch string directly.
        const treeWithDiff = renderFileEditView({
            filePath: '/src/components/FileEditPanel.tsx',
            diff: '--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new',
        });
        const diffWithPatch = treeWithDiff.root.findAll(
            (node: { type: unknown }) => typeof node.type === 'string' && node.type === 'PierreDiffViewMock'
        );
        expect(diffWithPatch.length).toBeGreaterThanOrEqual(1);
        expect(diffWithPatch[0].props.patch).toBe('--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new');

        // Old/new content path: PierreDiffView receives oldFile/newFile objects.
        const treeWithContent = renderFileEditView({
            filePath: '/src/components/FileEditPanel.tsx',
            oldContent: 'const x = 1;',
            newContent: 'const x = 2;',
        });
        const diffWithContent = treeWithContent.root.findAll(
            (node: { type: unknown }) => typeof node.type === 'string' && node.type === 'PierreDiffViewMock'
        );
        expect(diffWithContent.length).toBeGreaterThanOrEqual(1);
        const oldFile = diffWithContent[0].props.oldFile as { name: string; contents: string };
        const newFile = diffWithContent[0].props.newFile as { name: string; contents: string };
        expect(oldFile.contents).toBe('const x = 1;');
        expect(newFile.contents).toBe('const x = 2;');
        expect(oldFile.name).toBe('/src/components/FileEditPanel.tsx');
    });

    it('renders a placeholder instead of an empty diff when only filePath is present', () => {
        const tree = renderFileEditView({ filePath: '/src/components/FileEditPanel.tsx' });
        const diffMock = tree.root.findAll(
            (node: { type: unknown }) => typeof node.type === 'string' && node.type === 'PierreDiffViewMock'
        );
        expect(diffMock).toHaveLength(0);
        const json = JSON.stringify(tree.toJSON());
        expect(json).toContain('/src/components/FileEditPanel.tsx');
    });

    it('adds a messages-demo fixture with file-edit next to a single ExitPlanMode plan', () => {
        // Import wiring: fixture entries cannot be observed at render time without running the demo screen.
        const messagesDemo = readFileSync(new URL('../../app/(app)/dev/messages-demo-data.ts', import.meta.url), 'utf8');
        expect(messagesDemo).toContain("createToolCall('file-edit', 'completed'");
        expect(messagesDemo).toContain("filePath: '/src/components/FileEditPanel.tsx'");
        expect(messagesDemo).toContain("createToolCall('ExitPlanMode', 'completed'");
    });
});
