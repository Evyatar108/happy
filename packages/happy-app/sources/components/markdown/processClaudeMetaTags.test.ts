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
        expect(processClaudeMetaTags('Hello <command-name>/exit</command-name>').renderMarkdown).toBe('Hello `/exit`');
    });

    it('collapses adjacent command-name and command-args tags into one inline command', () => {
        expect(
            processClaudeMetaTags('<command-name>/run</command-name><command-args>--fast</command-args>').renderMarkdown
        ).toBe('`/run --fast`');
    });

    it('drops command-message when it duplicates command-name', () => {
        expect(
            processClaudeMetaTags('<command-name>/run</command-name><command-message>/run</command-message>').renderMarkdown
        ).toBe('`/run`');
    });

    it('drops duplicate command-message but keeps command-args', () => {
        expect(
            processClaudeMetaTags(
                '<command-name>/run</command-name><command-message>/run</command-message><command-args>--fast</command-args>'
            ).renderMarkdown
        ).toBe('`/run --fast`');
    });

    it('renders standalone command-message as an inline code pill', () => {
        expect(processClaudeMetaTags('<command-message>/exit</command-message>').renderMarkdown).toBe('`/exit`');
    });

    it('drops command-message duplicate even when it omits the leading slash', () => {
        expect(
            processClaudeMetaTags('<command-name>/exit</command-name><command-message>exit</command-message>').renderMarkdown
        ).toBe('`/exit`');
    });

    it('renders stdout tags as fenced code blocks', () => {
        expect(processClaudeMetaTags('<local-command-stdout>line1\nline2</local-command-stdout>').renderMarkdown).toBe(
            '```\nline1\nline2\n```'
        );
    });

    it('renders stderr tags as fenced code blocks prefixed with the translated stderr label', () => {
        const output = processClaudeMetaTags('<local-command-stderr>oops</local-command-stderr>').renderMarkdown;

        expect(output).toBe('```\n# stderr\noops\n```');
        expect(output.split('\n').slice(1, 3)).toEqual(['# stderr', 'oops']);
    });

    it('strips local-command-caveat content entirely', () => {
        const output = processClaudeMetaTags('Before <local-command-caveat>hidden</local-command-caveat> after').renderMarkdown;

        expect(output).toBe('Before  after');
        expect(output).not.toContain('hidden');
    });

    it('does not leave a blank paragraph when caveat sits on its own line', () => {
        const input = 'First paragraph\n\n<local-command-caveat>note</local-command-caveat>\n\nSecond paragraph';
        const output = processClaudeMetaTags(input).renderMarkdown;

        expect(output).not.toContain('hidden');
        expect(output).not.toMatch(/\n{3,}/);
        expect(output.trim()).toBe('First paragraph\n\nSecond paragraph');
    });

    it('strips system-reminder blocks from render and copy markdown', () => {
        const input = 'Before\n<system-reminder>hide me</system-reminder>\nAfter';
        const output = processClaudeMetaTags(input);

        expect(output.renderMarkdown).toBe('Before\nAfter');
        expect(output.copyMarkdown).toBe('Before\nAfter');
    });

    it('strips multiple consecutive fork-boilerplate blocks from render and copy markdown', () => {
        const input = [
            'Before',
            '<fork-boilerplate>first</fork-boilerplate>',
            '<fork-boilerplate>second</fork-boilerplate>',
            'After',
        ].join('\n');
        const output = processClaudeMetaTags(input);

        expect(output.renderMarkdown).toBe('Before\n\nAfter');
        expect(output.copyMarkdown).toBe('Before\n\nAfter');
        expect(output.renderMarkdown).not.toContain('fork-boilerplate');
        expect(output.copyMarkdown).not.toContain('fork-boilerplate');
    });

    it('preserves malformed system-reminder wrappers instead of swallowing the rest of the message', () => {
        const logger = vi.fn();
        _setLogger(logger);

        const input = 'Before\n<system-reminder>hide me\nAfter';
        const output = processClaudeMetaTags(input);

        expect(output.renderMarkdown).toBe(input);
        expect(output.copyMarkdown).toBe(input);
        expect(logger).not.toHaveBeenCalled();
    });

    it('preserves options byte-for-byte when adjacent to strip-only wrappers', () => {
        const options = '<options><option>A</option><option>B</option></options>';
        const input = `${options}\n<system-reminder>hide me</system-reminder>\n<fork-boilerplate>also hide me</fork-boilerplate>`;
        const output = processClaudeMetaTags(input);

        expect(output.renderMarkdown).toBe(options);
        expect(output.copyMarkdown).toBe(options);
    });

    it('round-trips options blocks byte-for-byte', () => {
        const input = '<options><option>A</option><option>B</option></options>';
        const output = processClaudeMetaTags(input);

        expect(output.renderMarkdown).toBe(input);
        expect(output.copyMarkdown).toBe(input);
    });

    it('extracts a well-formed task-notification block into a sentinel and summary copy text', () => {
        const input = [
            '<task-notification>',
            '<task-id>task-123</task-id>',
            '<tool-use-id>tool-456</tool-use-id>',
            '<task-type>review</task-type>',
            '<output-file>/tmp/task-123.output</output-file>',
            '<status>completed</status>',
            '<summary>Review finished successfully</summary>',
            '</task-notification>',
        ].join('\n');
        const output = processClaudeMetaTags(input);

        expect(output.renderMarkdown).toBe('__HAPPY_TASK_NOTIFICATION_0__');
        expect(output.copyMarkdown).toBe('Review finished successfully');
        expect(output.taskNotifications).toEqual([
            {
                taskId: 'task-123',
                toolUseId: 'tool-456',
                taskType: 'review',
                outputFile: '/tmp/task-123.output',
                status: 'completed',
                summary: 'Review finished successfully',
            },
        ]);
    });

    it('indexes multiple consecutive task-notification blocks correctly', () => {
        const input = [
            '<task-notification><task-id>task-1</task-id><task-type>a</task-type><output-file>/tmp/1</output-file><status>completed</status><summary>One</summary></task-notification>',
            '<task-notification><task-id>task-2</task-id><task-type>b</task-type><output-file>/tmp/2</output-file><status>failed</status><summary>Two</summary></task-notification>',
        ].join('\n');
        const output = processClaudeMetaTags(input);

        expect(output.renderMarkdown).toBe('__HAPPY_TASK_NOTIFICATION_0__\n__HAPPY_TASK_NOTIFICATION_1__');
        expect(output.copyMarkdown).toBe('One\nTwo');
        expect(output.taskNotifications.map(item => item.taskId)).toEqual(['task-1', 'task-2']);
    });

    it('falls back to plain text when summary content contains a literal closing summary tag', () => {
        const logger = vi.fn();
        _setLogger(logger);

        const input = [
            '<task-notification>',
            '<task-id>task-123</task-id>',
            '<task-type>review</task-type>',
            '<output-file>/tmp/task-123.output</output-file>',
            '<status>completed</status>',
            '<summary>bad </summary> content</summary>',
            '</task-notification>',
        ].join('\n');

        expect(() => processClaudeMetaTags(input)).not.toThrow();

        const output = processClaudeMetaTags(input);

        expect(output.renderMarkdown).toBe(input);
        expect(output.copyMarkdown).toBe(input);
        expect(output.taskNotifications).toEqual([]);
        expect(logger).not.toHaveBeenCalled();
    });

    it('falls back to plain text when a required task-notification tag is missing', () => {
        const logger = vi.fn();
        _setLogger(logger);

        const input = [
            '<task-notification>',
            '<task-id>task-123</task-id>',
            '<task-type>review</task-type>',
            '<output-file>/tmp/task-123.output</output-file>',
            '<summary>Review finished successfully</summary>',
            '</task-notification>',
        ].join('\n');
        const output = processClaudeMetaTags(input);

        expect(output.renderMarkdown).toBe(input);
        expect(output.copyMarkdown).toBe(input);
        expect(output.taskNotifications).toEqual([]);
        expect(logger).not.toHaveBeenCalled();
    });

    it('preserves options byte-for-byte when adjacent to a task-notification block', () => {
        const options = '<options><option>A</option><option>B</option></options>';
        const taskNotification = [
            '<task-notification>',
            '<task-id>task-123</task-id>',
            '<task-type>review</task-type>',
            '<output-file>/tmp/task-123.output</output-file>',
            '<status>completed</status>',
            '<summary>Review finished successfully</summary>',
            '</task-notification>',
        ].join('\n');
        const output = processClaudeMetaTags(`${options}\n${taskNotification}`);

        expect(output.renderMarkdown).toBe(`${options}\n__HAPPY_TASK_NOTIFICATION_0__`);
        expect(output.copyMarkdown).toBe(`${options}\nReview finished successfully`);
    });

    it('preserves a summary containing a literal system-reminder wrapper verbatim in copyMarkdown', () => {
        const summaryText = 'Done <system-reminder>injected</system-reminder> successfully';
        const input = [
            '<task-notification>',
            '<task-id>task-123</task-id>',
            '<task-type>review</task-type>',
            '<output-file>/tmp/task-123.output</output-file>',
            '<status>completed</status>',
            `<summary>${summaryText}</summary>`,
            '</task-notification>',
        ].join('\n');
        const output = processClaudeMetaTags(input);

        expect(output.renderMarkdown).toBe('__HAPPY_TASK_NOTIFICATION_0__');
        expect(output.copyMarkdown).toBe(summaryText);
        expect(output.taskNotifications[0]?.summary).toBe(summaryText);
    });

    it('does not warn for well-formed task-notification tags or their inner tags', () => {
        const logger = vi.fn();
        _setLogger(logger);

        processClaudeMetaTags([
            '<task-notification>',
            '<task-id>task-123</task-id>',
            '<tool-use-id>tool-456</tool-use-id>',
            '<task-type>review</task-type>',
            '<output-file>/tmp/task-123.output</output-file>',
            '<status>completed</status>',
            '<summary>Review finished successfully</summary>',
            '</task-notification>',
        ].join('\n'));

        expect(logger).not.toHaveBeenCalled();
    });

    it('does not warn for system-reminder or fork-boilerplate tags', () => {
        const logger = vi.fn();
        _setLogger(logger);

        processClaudeMetaTags([
            '<system-reminder>hide me</system-reminder>',
            '<fork-boilerplate>also hide me</fork-boilerplate>',
            '<system-reminder>missing closer',
        ].join('\n'));

        expect(logger).not.toHaveBeenCalled();
    });

    it('escapes inner triple-backticks and still re-parses as a single code block', () => {
        const output = processClaudeMetaTags('<local-command-stdout>line1\n```\nline2</local-command-stdout>').renderMarkdown;

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
            ).renderMarkdown
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
            let output = processClaudeMetaTags('');

            expect(() => {
                output = processClaudeMetaTags(input);
            }).not.toThrow();
            expect(typeof output.renderMarkdown).toBe('string');
            expect(typeof output.copyMarkdown).toBe('string');
            expect(Array.isArray(output.taskNotifications)).toBe(true);
        }
    });
});
