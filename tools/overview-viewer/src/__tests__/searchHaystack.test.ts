import { describe, expect, it } from 'vitest'

import { createEmptyFilters, matchesTaskFilter } from '../utils/filters'
import type { OverviewData, OverviewTask } from '../types'

function makeTask(overrides: Partial<OverviewTask> = {}): OverviewTask {
    return {
        id: 't1',
        scope: 'codexu',
        phase: 'plan-ready',
        status: 'ok',
        command: { name: 'taskname', descriptionHtml: 'a description' },
        ...overrides,
    }
}

function makeData(overrides: Partial<OverviewData> = {}): OverviewData {
    return {
        tasks: [],
        ...overrides,
    } as OverviewData
}

const NO_TASK_ID_FILTER = null

describe('matchesTaskFilter — search haystack parity (F-011 regression)', () => {
    it('matches against workstream label (data.workstream lookup)', () => {
        const task = makeTask({ id: 't1' })
        const data = makeData({ workstream: { t1: 'observability' } })
        expect(matchesTaskFilter(task, data, createEmptyFilters(), 'observability', NO_TASK_ID_FILTER)).toBe(true)
    })

    it('matches against scope keyword', () => {
        const task = makeTask({ scope: 'bookkeeping' })
        expect(matchesTaskFilter(task, makeData(), createEmptyFilters(), 'bookkeeping', NO_TASK_ID_FILTER)).toBe(true)
    })

    it('matches against cadence label (data.cadence lookup)', () => {
        const task = makeTask({ id: 't1' })
        const data = makeData({ cadence: { t1: 'weekly' } })
        expect(matchesTaskFilter(task, data, createEmptyFilters(), 'weekly', NO_TASK_ID_FILTER)).toBe(true)
    })

    it('matches against size bucket (data.sizeBucket lookup)', () => {
        const task = makeTask({ id: 't1' })
        const data = makeData({ sizeBucket: { t1: 'epic' } })
        expect(matchesTaskFilter(task, data, createEmptyFilters(), 'epic', NO_TASK_ID_FILTER)).toBe(true)
    })

    it('matches against warning html (rendered in row)', () => {
        const task = makeTask({
            command: {
                name: 'n',
                descriptionHtml: 'd',
                warnings: [{ html: 'blocked on upstream-foo deliverable' }],
            },
        })
        expect(matchesTaskFilter(task, makeData(), createEmptyFilters(), 'upstream-foo', NO_TASK_ID_FILTER)).toBe(true)
    })

    it('matches against spawned-from parent id', () => {
        const task = makeTask({ id: 'child-1' })
        const data = makeData({ spawnedFrom: { 'child-1': 'parent-investigation' } })
        expect(matchesTaskFilter(task, data, createEmptyFilters(), 'parent-investigation', NO_TASK_ID_FILTER)).toBe(true)
    })

    it('matches against spawned-children ids (reverse lookup of data.spawnedFrom)', () => {
        const task = makeTask({ id: 'parent-1' })
        const data = makeData({ spawnedFrom: { 'child-alpha': 'parent-1', 'child-beta': 'parent-1' } })
        expect(matchesTaskFilter(task, data, createEmptyFilters(), 'child-alpha', NO_TASK_ID_FILTER)).toBe(true)
        expect(matchesTaskFilter(task, data, createEmptyFilters(), 'child-beta', NO_TASK_ID_FILTER)).toBe(true)
    })

    it('matches against mergeCommit short SHA', () => {
        const task = makeTask({ mergeCommit: 'abc1234' })
        expect(matchesTaskFilter(task, makeData(), createEmptyFilters(), 'abc1234', NO_TASK_ID_FILTER)).toBe(true)
    })

    it('matches against phase label', () => {
        const task = makeTask({ phase: 'impl-in-progress' })
        expect(matchesTaskFilter(task, makeData(), createEmptyFilters(), 'impl-in-progress', NO_TASK_ID_FILTER)).toBe(true)
    })

    it('still matches against task.command.planPrompt', () => {
        const task = makeTask({
            command: { name: 'n', descriptionHtml: 'd', planPrompt: 'this is the prompt body' },
        })
        expect(matchesTaskFilter(task, makeData(), createEmptyFilters(), 'prompt body', NO_TASK_ID_FILTER)).toBe(true)
    })

    it('returns false when query matches nothing', () => {
        const task = makeTask({ id: 't1' })
        const data = makeData({ workstream: { t1: 'observability' } })
        expect(matchesTaskFilter(task, data, createEmptyFilters(), 'nonexistent', NO_TASK_ID_FILTER)).toBe(false)
    })

    it('is case-insensitive', () => {
        const task = makeTask({ scope: 'codexu' })
        expect(matchesTaskFilter(task, makeData(), createEmptyFilters(), 'CoDeXu', NO_TASK_ID_FILTER)).toBe(true)
    })
})
