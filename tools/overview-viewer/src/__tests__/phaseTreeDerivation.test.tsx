import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { derivePhaseTreeStateClass, PhaseTree, PhaseTreeNode } from '../components/PhaseTree'
import type { OverviewTask, PhaseTreeTaskRefNode } from '../types'
import { loadOverviewData } from './testData'

describe('PhaseTree', () => {
    it('renders one phase block per shipped phaseTree entry with task-ref children', () => {
        const data = loadOverviewData()
        const html = renderToStaticMarkup(<PhaseTree data={data} />)
        const taskRefCount = data.phaseTree?.flatMap((phase) => phase.nodes ?? []).filter((node) => node.kind === 'task-ref').length ?? 0

        expect(html.match(/class="phase"/g)).toHaveLength(data.phaseTree?.length ?? 0)
        expect(taskRefCount).toBe(5)
        expect(html).toContain('data-phase-id="phase-1"')
        expect(html).toContain('Phase 1 — Foundations')
        expect(html).toContain('<span class="item-name open">1a Codex fork strategy commit</span>')
        expect(html).toContain('1b.3 Multi-device discoverability hint')
        expect(html).toContain('<span class="item-name donefade">Realtime sync perf WS1 / WS2 / WS3</span>')
        expect(html).toContain('Realtime sync perf WS1 / WS2 / WS3')
        expect(html).toContain('href="realtime-sync-perf.md"')
        expect(html).toContain('class="phase-subdetails"')
        expect(html).toContain('13 sub-items (all blocked) — click to expand')
    })

    it('derives task-ref state from task phase and status, ignoring legacy node state', () => {
        const cases: Array<[OverviewTask, string]> = [
            [{ id: 'shipped', phase: 'shipped', status: 'ok' }, 'donefade'],
            [{ id: 'closed', phase: 'closed', status: 'ok' }, 'closed'],
            [{ id: 'blocked', phase: 'plan-ready', status: 'blocked' }, 'deferred'],
            [{ id: 'paused', phase: 'impl-ready', status: 'paused' }, 'deferred'],
            [{ id: 'open', phase: 'plan-ready', status: 'ok' }, 'open'],
        ]

        for (const [task, expected] of cases) {
            expect(derivePhaseTreeStateClass(task)).toBe(expected)
        }

        const task = { id: 'blocked-task', phase: 'plan-ready', status: 'blocked' }
        const node: PhaseTreeTaskRefNode = {
            kind: 'task-ref',
            taskId: task.id,
            visibleText: 'Blocked task',
            state: 'open',
            trailingHtml: ' — <a href="blocked.md">blocked note</a>',
        }
        const html = renderToStaticMarkup(<PhaseTreeNode node={node} taskById={new Map([[task.id, task]])} />)

        expect(html).toContain('class="item-name deferred"')
        expect(html).not.toContain('class="item-name open"')
        expect(html).toContain('href="blocked.md"')
    })
})
