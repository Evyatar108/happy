import { describe, expect, it } from 'vitest'

import type { OverviewData, OverviewRalphState, OverviewTask } from '../types'
import { createEmptyFilters, matchesKanbanFilter, matchesTaskFilter, toggleFilter } from '../utils/filters'

function makeTask(id: string): OverviewTask {
    return {
        id,
        scope: 'codexu',
        phase: 'plan-ready',
        status: 'ok',
        command: { name: id, descriptionHtml: `${id} command` },
        kanbanCards: [{ column: 'ready', html: `<div class="card-title">${id}</div><div class="card-meta"></div>` }],
    }
}

describe('Ralph stage filters', () => {
    it('matches populated Ralph state for command rows and kanban cards', () => {
        const implementingTask = makeTask('task-implementing')
        const shippedTask = makeTask('task-shipped')
        const data: OverviewData = { tasks: [implementingTask, shippedTask] }
        const ralphState: OverviewRalphState = {
            generatedAt: '2026-05-19T12:00:00Z',
            generatedFromCommit: 'test',
            byTaskId: {
                'task-implementing': { stage: 'implementing', jobSlug: 'stage-filter-job' },
                'task-shipped': { stage: 'shipped', jobSlug: 'stage-filter-done' },
            },
        }
        const filters = toggleFilter(createEmptyFilters(), 'ralphStage', 'implementing')

        expect(matchesTaskFilter(implementingTask, data, filters, '', null, ralphState)).toBe(true)
        expect(matchesTaskFilter(shippedTask, data, filters, '', null, ralphState)).toBe(false)
        expect(matchesKanbanFilter(implementingTask, data, filters, '', ralphState)).toBe(true)
        expect(matchesKanbanFilter(shippedTask, data, filters, '', ralphState)).toBe(false)
    })
})
