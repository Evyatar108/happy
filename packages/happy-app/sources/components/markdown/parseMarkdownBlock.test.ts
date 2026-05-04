import { describe, it, expect } from 'vitest';
import { parseMarkdown, type MarkdownSpan } from './parseMarkdown';
import { parseMarkdownBlock } from './parseMarkdownBlock';
import type { TaskNotificationData } from './processClaudeMetaTags';

// Helper to build the span shape the parser emits for plain, unstyled text
// cells. Production now returns MarkdownSpan[] for every table cell (to
// support inline markdown / links inside cells), so the tests assert the
// structured representation rather than the raw strings.
function plainCell(text: string): MarkdownSpan[] {
    if (text === '') return [];
    return [{ styles: [], text, url: null }];
}

describe('parseMarkdownBlock - table parsing', () => {

    it('parses a standard table without blank lines', () => {
        const md = [
            '| A | B |',
            '|---|---|',
            '| 1 | 2 |',
        ].join('\n');

        const blocks = parseMarkdown(md);
        expect(blocks).toHaveLength(1);
        expect(blocks[0]).toEqual({
            type: 'table',
            headers: [plainCell('A'), plainCell('B')],
            rows: [[plainCell('1'), plainCell('2')]],
        });
    });

    it('parses a table with blank lines between rows (LLM output)', () => {
        const md = [
            '| A | B |',
            '',
            '|---|---|',
            '',
            '| 1 | 2 |',
            '',
            '| 3 | 4 |',
        ].join('\n');

        const blocks = parseMarkdown(md);
        // Should be recognized as a single table, not 4 separate text blocks
        const tableBlocks = blocks.filter(b => b.type === 'table');
        expect(tableBlocks).toHaveLength(1);
        expect(tableBlocks[0]).toEqual({
            type: 'table',
            headers: [plainCell('A'), plainCell('B')],
            rows: [
                [plainCell('1'), plainCell('2')],
                [plainCell('3'), plainCell('4')],
            ],
        });
    });

    it('preserves empty interior cells (e.g. row header column)', () => {
        const md = [
            '| | Header1 | Header2 |',
            '|---|---|---|',
            '| Row1 | a | b |',
        ].join('\n');

        const blocks = parseMarkdown(md);
        expect(blocks).toHaveLength(1);
        expect(blocks[0]).toEqual({
            type: 'table',
            headers: [plainCell(''), plainCell('Header1'), plainCell('Header2')],
            rows: [[plainCell('Row1'), plainCell('a'), plainCell('b')]],
        });
    });

    it('handles blank lines and empty first cell combined', () => {
        const md = [
            '### Comparison',
            '',
            '| | Plan A | Plan B |',
            '',
            '|--|----|----|',
            '',
            '| Price | $10/mo | $20/mo |',
            '',
            '| Storage | 5 GB | 50 GB |',
            '',
            '| Support | Email only | 24/7 chat |',
        ].join('\n');

        const blocks = parseMarkdown(md);
        const tableBlocks = blocks.filter(b => b.type === 'table');
        expect(tableBlocks).toHaveLength(1);

        const table = tableBlocks[0];
        if (table.type !== 'table') throw new Error('not a table');

        // Empty first cell should be preserved (as an empty span list)
        expect(table.headers).toHaveLength(3);
        expect(table.headers[0]).toEqual([]);

        expect(table.rows).toHaveLength(3);
        // First cell of first data row should contain a single "Price" span
        expect(table.rows[0][0]).toEqual(plainCell('Price'));
    });

    it('stops table collection at non-blank, non-pipe lines', () => {
        const md = [
            '| A | B |',
            '|---|---|',
            '| 1 | 2 |',
            '',
            'Some text after the table',
        ].join('\n');

        const blocks = parseMarkdown(md);
        const tableBlocks = blocks.filter(b => b.type === 'table');
        const textBlocks = blocks.filter(b => b.type === 'text');

        expect(tableBlocks).toHaveLength(1);
        expect(textBlocks).toHaveLength(1);
    });
});

describe('parseMarkdownBlock - task notification sentinel parsing', () => {
    it('emits a task-notification block when the sentinel index resolves', () => {
        const taskNotification: TaskNotificationData = {
            taskId: 'task-123',
            toolUseId: 'toolu_456',
            taskType: 'review',
            outputFile: '/tmp/task-123.output',
            status: 'completed',
            summary: 'Task finished successfully.',
        };

        expect(parseMarkdownBlock('__HAPPY_TASK_NOTIFICATION_0__', [taskNotification])).toEqual([
            {
                type: 'task-notification',
                data: taskNotification,
            },
        ]);
    });

    it('falls back to a text block when the sentinel index cannot resolve', () => {
        expect(parseMarkdownBlock('__HAPPY_TASK_NOTIFICATION_0__')).toEqual([
            {
                type: 'text',
                content: plainCell('__HAPPY_TASK_NOTIFICATION_0__'),
            },
        ]);
    });
});
