import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('file-edit tool registration', () => {
    const knownTools = readFileSync(new URL('./knownTools.tsx', import.meta.url), 'utf8');
    const toolView = readFileSync(new URL('./ToolView.tsx', import.meta.url), 'utf8');
    const registry = readFileSync(new URL('./views/_all.tsx', import.meta.url), 'utf8');
    const fileEditView = readFileSync(new URL('./views/FileEditView.tsx', import.meta.url), 'utf8');
    const messagesDemo = readFileSync(new URL('../../app/(app)/dev/messages-demo-data.ts', import.meta.url), 'utf8');

    it('registers the ACP file-edit input shape with file-edit metadata chrome', () => {
        expect(knownTools).toContain("'file-edit': {");
        expect(knownTools).toContain('filePath: z.string().optional(),');
        expect(knownTools).toContain('diff: z.string().optional(),');
        expect(knownTools).toContain('oldContent: z.string().optional(),');
        expect(knownTools).toContain('newContent: z.string().optional(),');
        expect(knownTools).toContain('icon: ICON_EDIT,');
    });

    it('routes file-edit through FileEditView and file navigation', () => {
        expect(registry).toContain("import { FileEditView } from './FileEditView';");
        expect(registry).toContain("'file-edit': FileEditView,");
        expect(toolView).toContain("const fileEditTools = ['Edit', 'MultiEdit', 'Write', 'file-edit'];");
        expect(toolView).toContain("typeof tool.input?.filePath === 'string'");
        expect(toolView.indexOf('const SpecificToolView = getToolViewComponent(tool.name);')).toBeLessThan(
            toolView.indexOf('Fall back to default view')
        );
    });

    it('delegates ACP file-edit payloads to ToolDiffView', () => {
        expect(fileEditView).toContain("knownTools['file-edit'].input.safeParse(tool.input)");
        expect(fileEditView).toContain('const fileName = parsed.data.filePath;');
        expect(fileEditView).toContain('parsed.data.oldContent');
        expect(fileEditView).toContain('parsed.data.newContent');
        expect(fileEditView).toContain('<ToolDiffView patch={parsed.data.diff} fileName={fileName} />');
        expect(fileEditView).toContain('oldText={oldText}');
        expect(fileEditView).toContain('newText={newText}');
    });

    it('renders a placeholder instead of an empty diff when only filePath is present', () => {
        expect(fileEditView).toContain('!parsed.data.oldContent && !parsed.data.newContent');
        expect(fileEditView).toContain('<ToolSectionView title={fileName}>');
    });

    it('adds a messages-demo fixture with file-edit next to a single ExitPlanMode plan', () => {
        expect(messagesDemo).toContain("createToolCall('file-edit', 'completed'");
        expect(messagesDemo).toContain("filePath: '/src/components/FileEditPanel.tsx'");
        expect(messagesDemo).toContain("createToolCall('ExitPlanMode', 'completed'");
        expect(registry).toContain('ExitPlanMode: ExitPlanToolView,');
    });
});
