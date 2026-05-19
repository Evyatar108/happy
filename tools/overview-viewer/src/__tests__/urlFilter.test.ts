import { describe, expect, it } from 'vitest'

import { createEmptyFilters, matchesTaskFilter, toggleFilter } from '../utils/filters'
import { filterBucketForTask } from '../utils/taskClassification'
import { clearTasksParam, parseTaskIdFilter } from '../utils/urlFilter'
import { loadOverviewData, NO_RALPH_STATE } from './testData'

describe('URL and multi-axis filters', () => {
    it('parses comma-separated ?tasks ids and clears the query key', () => {
        expect(Array.from(parseTaskIdFilter('?tasks=foo,bar%20,baz') ?? [])).toEqual(['foo', 'bar', 'baz'])
        expect(parseTaskIdFilter('?tasks=')).toBeNull()
        expect(clearTasksParam('https://example.test/overview.html?tasks=a,b&x=1')).toBe('https://example.test/overview.html?x=1')
    })

    it('composes search, status, workstream, cadence, size, scope, and URL task filters', () => {
        const data = loadOverviewData()
        const task = data.tasks?.find((candidate) => data.workstream?.[candidate.id] && candidate.scope?.includes('codexu'))
        expect(task).toBeDefined()
        if (!task) return

        let filters = createEmptyFilters()
        filters = toggleFilter(filters, 'workstream', data.workstream?.[task.id] ?? '')
        filters = toggleFilter(filters, 'scope', 'codexu')
        filters = toggleFilter(filters, 'cadence', data.cadence?.[task.id] ?? 'one-shot')
        filters = toggleFilter(filters, 'size', data.sizeBucket?.[task.id] ?? '')
        filters = toggleFilter(filters, 'status', filterBucketForTask(task))

        expect(matchesTaskFilter(task, data, filters, task.id.slice(0, 4), new Set([task.id]), NO_RALPH_STATE)).toBe(true)
        expect(matchesTaskFilter(task, data, filters, task.id, new Set(['other-task']), NO_RALPH_STATE)).toBe(false)
    })
})
