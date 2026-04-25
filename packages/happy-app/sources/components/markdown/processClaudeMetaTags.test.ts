import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/text', () => ({
    t: (key: string) => {
        if (key === 'chat.commandOutput.stderrLabel') {
            return 'stderr';
        }

        return key;
    },
}));

import { parseMarkdownBlock } from './parseMarkdownBlock';
import processClaudeMetaTags, { _setLogger, warnedTagNames } from './processClaudeMetaTags';

describe('processClaudeMetaTags', () => {
    beforeEach(() => {
        warnedTagNames.clear();
        _setLogger(null);
    });

    afterEach(() => {
        _setLogger(null);
    });

    it('transforms command-name tags into inline code pills', () => {
        expect(processClaudeMetaTags('Hello <command-name>/exit</command-name>')).toBe('Hello `/exit`');
    });

    it('collapses adjacent command-name and command-args tags into one inline command', () => {
        expect(
            processClaudeMetaTags('<command-name>/run</command-name><command-args>--fast</command-args>')
        ).toBe('`/run --fast`');
    });

    it('drops command-message when it duplicates command-name', () => {
        expect(
            processClaudeMetaTags('<command-name>/run</command-name><command-message>/run</command-message>')
        ).toBe('`/run`');
    });

    it('drops duplicate command-message but keeps command-args', () => {
        expect(
            processClaudeMetaTags(
                '<command-name>/run</command-name><command-message>/run</command-message><command-args>--fast</command-args>'
            )
        ).toBe('`/run --fast`');
    });

    it('renders standalone command-message as an inline code pill', () => {
        expect(processClaudeMetaTags('<command-message>/exit</command-message>')).toBe('`/exit`');
    });

    it('renders stdout tags as fenced code blocks', () => {
        expect(processClaudeMetaTags('<local-command-stdout>line1\nline2</local-command-stdout>')).toBe(
            '```\nline1\nline2\n```'
        );
    });

    it('renders stderr tags as fenced code blocks prefixed with the translated stderr label', () => {
        const output = processClaudeMetaTags('<local-command-stderr>oops</local-command-stderr>');

        expect(output).toBe('```\n# stderr\noops\n```');
        expect(output.split('\n').slice(1, 3)).toEqual(['# stderr', 'oops']);
    });

    it('strips local-command-caveat content entirely', () => {
        const output = processClaudeMetaTags('Before <local-command-caveat>hidden</local-command-caveat> after');

        expect(output).toBe('Before  after');
        expect(output).not.toContain('hidden');
    });

    it('does not leave a blank paragraph when caveat sits on its own line', () => {
        const input = 'First paragraph\n\n<local-command-caveat>note</local-command-caveat>\n\nSecond paragraph';
        const output = processClaudeMetaTags(input);

        expect(output).not.toContain('hidden');
        expect(output).not.toMatch(/\n{3,}/);
        expect(output.trim()).toBe('First paragraph\n\nSecond paragraph');
    });

    it('round-trips options blocks byte-for-byte', () => {
        const input = '<options><option>A</option><option>B</option></options>';

        expect(processClaudeMetaTags(input)).toBe(input);
    });

    it('escapes inner triple-backticks and still re-parses as a single code block', () => {
        const output = processClaudeMetaTags('<local-command-stdout>line1\n```\nline2</local-command-stdout>');

        expect(output).toBe('```\nline1\n``\u200B`\nline2\n```');

        const blocks = parseMarkdownBlock(output);

        expect(blocks).toEqual([
            {
                type: 'code-block',
                language: null,
                content: 'line1\n``\u200B`\nline2',
            },
        ]);
    });

    it('captures multiple stdout blocks independently', () => {
        expect(
            processClaudeMetaTags(
                'A<local-command-stdout>one</local-command-stdout>B<local-command-stdout>two</local-command-stdout>C'
            )
        ).toBe('A```\none\n```B```\ntwo\n```C');
    });

    it('warns about an unknown tag only once per tag-name across invocations', () => {
        const logger = vi.fn();
        _setLogger(logger);

        processClaudeMetaTags('<mystery>first</mystery>');
        processClaudeMetaTags('<mystery>second</mystery>');
        processClaudeMetaTags('<different>third</different>');

        expect(logger).toHaveBeenCalledTimes(2);
        expect(logger).toHaveBeenNthCalledWith(1, '[MarkdownView] unknown tag <mystery>');
        expect(logger).toHaveBeenNthCalledWith(2, '[MarkdownView] unknown tag <different>');
    });

    it('does not crash on malformed or nested tags', () => {
        const inputs = [
            '<command-name>/run<command-args>--fast</command-args>',
            '<local-command-stdout><command-name>/nested</command-name>',
            '<local-command-stderr>oops<local-command-caveat>hidden',
        ];

        for (const input of inputs) {
            let output = '';

            expect(() => {
                output = processClaudeMetaTags(input);
            }).not.toThrow();
            expect(typeof output).toBe('string');
        }
    });
});
