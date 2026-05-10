import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { makeTool, pathMetadata, renderTree, treeText } from './toolViewTestUtils';

const { CodexPatchView } = await import('./CodexPatchView');

type TestFileChange = {
    diff: string;
    kind: { type: string };
};

function renderCodexPatchInput(input: Record<string, unknown>) {
    return treeText(renderTree(
        <CodexPatchView
            tool={makeTool({ name: 'CodexPatch', input })}
            metadata={pathMetadata}
        />
    ));
}

function renderCodexPatch(changes: Record<string, unknown>) {
    return renderCodexPatchInput({ changes });
}

describe('CodexPatchView', () => {
    it('renders a flat update FileChange with unified_diff', () => {
        const output = renderCodexPatch({
            '/Users/steve/project/src/Header.tsx': {
                type: 'update',
                unified_diff: '@@ -1 +1 @@\n-old header\n+new header',
            },
        });

        expect(output).toContain('src/Header.tsx');
        expect(output).toContain('edit');
        expect(output).toContain('patch:@@ -1 +1 @@\\n-old header\\n+new header');
    });

    it('renders a flat update FileChange with a move target', () => {
        const output = renderCodexPatch({
            '/Users/steve/project/src/Header.tsx': {
                type: 'update',
                move_path: '/Users/steve/project/src/AppHeader.tsx',
                unified_diff: '@@ -1 +1 @@\n-export const Header = 1\n+export const AppHeader = 1',
            },
        });

        expect(output).toContain('src/Header.tsx');
        expect(output).toContain('move');
        expect(output).toContain('src/AppHeader.tsx');
        expect(output).toContain('patch:@@ -1 +1 @@');
    });

    it('renders a flat add FileChange with content as an empty-to-content diff', () => {
        const output = renderCodexPatch({
            '/Users/steve/project/src/Footer.tsx': {
                type: 'add',
                content: 'export function Footer() {\n  return null;\n}',
            },
        });

        expect(output).toContain('src/Footer.tsx');
        expect(output).toContain('new');
        expect(output).toContain('old: new:export function Footer()');
    });

    it('renders a flat delete FileChange with content as a content-to-empty diff', () => {
        const output = renderCodexPatch({
            '/Users/steve/project/src/OldHeader.tsx': {
                type: 'delete',
                content: 'export function OldHeader() {\n  return null;\n}',
            },
        });

        expect(output).toContain('src/OldHeader.tsx');
        expect(output).toContain('delete');
        expect(output).toContain('old:export function OldHeader()');
        expect(output).toContain('new:');
    });

    it('preserves legacy wrapper FileChange rendering', () => {
        const output = renderCodexPatch({
            '/Users/steve/project/src/format.ts': {
                kind: { type: 'update' },
                modify: {
                    old_content: 'export const format = () => "old";',
                    new_content: 'export const format = () => "new";',
                },
            },
        });

        expect(output).toContain('src/format.ts');
        expect(output).toContain('edit');
        expect(output).toContain('old:export const format = () =>');
        expect(output).toContain('new:export const format = () =>');
    });

    it('renders from request payload fileChanges without depending on later source-map mutations', () => {
        const sourceChanges: Record<string, TestFileChange> = {
            '/Users/steve/project/src/approval.ts': {
                diff: '@@ -1 +1 @@\n-old approval\n+new approval',
                kind: { type: 'update' },
            },
        };
        const renderer = renderTree(
            <CodexPatchView
                tool={makeTool({ name: 'CodexPatch', input: { fileChanges: sourceChanges } })}
                metadata={pathMetadata}
            />
        );

        const beforeMutation = treeText(renderer);
        sourceChanges['/Users/steve/project/src/approval.ts']!.diff = '@@ -1 +1 @@\n-mutated\n+mutated';
        sourceChanges['/Users/steve/project/src/late.ts'] = {
            diff: '@@ -0,0 +1 @@\n+export const late = true;',
            kind: { type: 'add' },
        };

        expect(treeText(renderer)).toBe(beforeMutation);
        expect(beforeMutation).toContain('src/approval.ts');
        expect(beforeMutation).toContain('old approval');
        expect(beforeMutation).not.toContain('src/late.ts');
        expect(beforeMutation).not.toContain('mutated');
    });
});
