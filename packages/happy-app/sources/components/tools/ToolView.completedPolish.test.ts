import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('completed tool view polish', () => {
    const toolView = readFileSync(new URL('./ToolView.tsx', import.meta.url), 'utf8');
    const permissionFooter = readFileSync(new URL('./PermissionFooter.tsx', import.meta.url), 'utf8');

    it('removes high-surface backgrounds from completed tool cards', () => {
        expect(toolView).toContain("const isCompleted = tool.state === 'completed';");
        expect(toolView).toContain('style={[styles.container, isCompleted && styles.containerCompleted]}');
        expect(toolView).toContain('style={[styles.header, isCompleted && styles.headerCompleted]}');
        expect(toolView).toContain('containerCompleted: {');
        expect(toolView).toContain("backgroundColor: 'transparent',");
        expect(toolView).toContain('headerCompleted: {');
        expect(toolView).toContain('borderBottomWidth: 2,');
        expect(toolView).toContain('borderBottomColor: theme.colors.textSecondary,');
    });

    it('passes tool state into the permission footer', () => {
        expect(toolView).toContain('toolState={tool.state}');
        expect(permissionFooter).toContain("toolState: ToolCall['state'];");
    });

    it('keeps running permission actions vertical and groups completed actions horizontally', () => {
        expect(permissionFooter).toContain("const isRunningTool = toolState === 'running';");
        expect(permissionFooter).toContain("flexDirection: isRunningTool ? 'column' : 'row',");
        expect(permissionFooter).toContain('gap: isRunningTool ? 4 : 8,');
        expect(permissionFooter).toContain("flexWrap: isRunningTool ? 'nowrap' : 'wrap',");
        expect(permissionFooter).toContain("alignSelf: isRunningTool ? 'stretch' : 'flex-start',");
    });
});
