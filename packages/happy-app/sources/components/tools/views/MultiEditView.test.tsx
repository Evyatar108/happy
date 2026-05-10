import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeTool, pathMetadata, renderTree, treeText } from './toolViewTestUtils';

const { MultiEditView } = await import('./MultiEditView');

describe('MultiEditView', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders well-formed edits under one resolved path heading', () => {
        const renderer = renderTree(
            <MultiEditView
                tool={makeTool({
                    name: 'MultiEdit',
                    input: {
                        file_path: '/Users/steve/project/src/components/Header.tsx',
                        edits: [
                            { old_string: 'alpha', new_string: 'beta' },
                            { old_string: 'gamma', new_string: 'delta', replace_all: true },
                        ],
                    },
                })}
                metadata={pathMetadata}
                messages={[]}
            />
        );

        const output = treeText(renderer);
        expect(output).toContain('src/components/Header.tsx');
        expect(output).toContain('Edit 1 of 2');
        expect(output).toContain('Edit 2 of 2');
        expect(output).toContain('Replace All');
        expect(output.match(/ToolDiffView file:src\/components\/Header\.tsx/g)).toHaveLength(2);
        expect(output).toContain('old:alpha');
        expect(output).toContain('new:delta');
    });

    it('renders a parse-error block and warns for malformed input', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const renderer = renderTree(
            <MultiEditView
                tool={makeTool({
                    name: 'MultiEdit',
                    input: {
                        file_path: '/Users/steve/project/src/components/Header.tsx',
                        edits: [{ old_string: 1, new_string: 'beta' }],
                    },
                })}
                metadata={pathMetadata}
                messages={[]}
            />
        );

        const output = treeText(renderer);
        expect(output).toContain('ToolError:MultiEdit input could not be parsed');
        expect(output).not.toContain('ToolDiffView');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('[MultiEdit] Zod parse failed:'));
    });
});
