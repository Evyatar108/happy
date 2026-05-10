import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeTool, renderTree, treeText } from './toolViewTestUtils';

const { TaskOutputView } = await import('./TaskOutputView');

function renderTaskOutput(overrides: Parameters<typeof makeTool>[0]) {
    return treeText(renderTree(<TaskOutputView tool={makeTool({ name: 'TaskOutput', input: { task_id: 'task-1' }, ...overrides })} metadata={null} messages={[]} />));
}

describe('TaskOutputView', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders the running branch', () => {
        const output = renderTaskOutput({ state: 'running', input: { task_id: 'task-1', block: true, timeout: 30 } });

        expect(output).toContain('Waiting for task output');
        expect(output).toContain('Task task-1');
        expect(output).toContain('Blocking');
        expect(output).toContain('Timeout 30');
    });

    it('renders the schema-match branch', () => {
        const output = renderTaskOutput({
            result: {
                retrieval_status: 'success',
                task: { task_id: 'task-2', status: 'completed', output: 'Found two failing assertions' },
            },
        });

        expect(output).toContain('Task task-2');
        expect(output).toContain('completed');
        expect(output).toContain('Found two failing assertions');
    });

    it('renders the string branch', () => {
        const output = renderTaskOutput({ result: 'Plain string task output excerpt' });

        expect(output).toContain('Plain string task output excerpt');
    });

    it('renders the object-mismatch JSON fallback and warns', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const output = renderTaskOutput({ result: { unexpected: true } });

        expect(output).toContain('unexpected');
        expect(output).toContain('true');
        expect(warn).toHaveBeenCalledWith('TaskOutput unknown result shape', { unexpected: true });
    });

    it('renders the null-result parse-error branch and warns', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const output = renderTaskOutput({ result: null });

        expect(output).toContain('ToolError:Task output result could not be parsed');
        expect(warn).toHaveBeenCalledWith('TaskOutput missing result', null);
    });
});
