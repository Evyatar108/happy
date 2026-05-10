import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeTool, pathMetadata, renderTree, treeText } from './toolViewTestUtils';

const { EditView } = await import('./EditView');

describe('EditView', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders a well-formed edit diff with the resolved path label', () => {
        const renderer = renderTree(
            <EditView
                tool={makeTool({
                    name: 'Edit',
                    input: {
                        file_path: '/Users/steve/project/src/components/Header.tsx',
                        old_string: 'old title',
                        new_string: 'new title',
                    },
                })}
                metadata={pathMetadata}
                messages={[]}
            />
        );

        const output = treeText(renderer);
        expect(output).toContain('ToolDiffView file:src/components/Header.tsx');
        expect(output).toContain('old:old title');
        expect(output).toContain('new:new title');
    });

    it('renders a parse-error block and warns for malformed input', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const renderer = renderTree(
            <EditView
                tool={makeTool({
                    name: 'Edit',
                    input: {
                        file_path: 42,
                    },
                })}
                metadata={pathMetadata}
                messages={[]}
            />
        );

        const output = treeText(renderer);
        expect(output).toContain('ToolError:Edit input could not be parsed');
        expect(output).not.toContain('ToolDiffView');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('[Edit] Zod parse failed:'));
    });
});
