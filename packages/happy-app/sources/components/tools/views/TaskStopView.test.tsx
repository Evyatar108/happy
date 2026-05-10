import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeTool, renderTree, treeText } from './toolViewTestUtils';

const { TaskStopView } = await import('./TaskStopView');

function renderTaskStop(overrides: Parameters<typeof makeTool>[0]) {
    return treeText(renderTree(<TaskStopView tool={makeTool({ name: 'TaskStop', input: { task_id: 'task-1' }, ...overrides })} metadata={null} messages={[]} />));
}

describe('TaskStopView', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders the running branch', () => {
        const output = renderTaskStop({ state: 'running' });

        expect(output).toContain('Stopping task...');
        expect(output).toContain('Task task-1');
    });

    it('renders the schema-match branch', () => {
        const output = renderTaskStop({ result: { stopped: true, status: 'completed' } });

        expect(output).toContain('Task task-1');
        expect(output).toContain('Stopped');
    });

    it('renders the string branch', () => {
        const output = renderTaskStop({ result: 'Error: Task task-1 is not running (status: completed)' });

        expect(output).toContain('Error: Task task-1 is not running');
    });

    it('renders the object-mismatch JSON fallback and warns', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const output = renderTaskStop({ result: { unexpected: true } });

        expect(output).toContain('unexpected');
        expect(output).toContain('true');
        expect(warn).toHaveBeenCalledWith('TaskStop unknown result shape', { unexpected: true });
    });

    it('renders the null-result parse-error branch and warns', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const output = renderTaskStop({ result: null });

        expect(output).toContain('ToolError:Task stop result could not be parsed');
        expect(warn).toHaveBeenCalledWith('TaskStop missing result', null);
    });
});
