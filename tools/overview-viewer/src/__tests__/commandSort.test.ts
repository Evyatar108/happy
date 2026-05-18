import { describe, expect, it } from 'vitest'

import { sortTasksByLastTouchedAsc } from '../components/CommandList'
import type { OverviewTask } from '../types'

function makeTask(id: string, lastTouchedAt: string | undefined): OverviewTask {
    return {
        id,
        scope: 'codexu',
        phase: 'plan-ready',
        status: 'ok',
        lastTouchedAt,
    } as OverviewTask
}

describe('sortTasksByLastTouchedAsc', () => {
    it('sorts oldest lastTouchedAt first (ISO 8601 lexical order)', () => {
        const input = [
            makeTask('c', '2026-03-15T10:00:00Z'),
            makeTask('a', '2025-12-01T00:00:00Z'),
            makeTask('b', '2026-01-20T00:00:00Z'),
        ]
        const result = sortTasksByLastTouchedAsc(input)
        expect(result.map((t) => t.id)).toEqual(['a', 'b', 'c'])
    })

    it('places tasks with missing lastTouchedAt at the tail', () => {
        const input = [
            makeTask('missing-1', undefined),
            makeTask('old', '2025-01-01T00:00:00Z'),
            makeTask('missing-2', undefined),
            makeTask('new', '2026-05-01T00:00:00Z'),
        ]
        const result = sortTasksByLastTouchedAsc(input)
        expect(result.map((t) => t.id)).toEqual(['old', 'new', 'missing-1', 'missing-2'])
    })

    it('preserves manual order for tasks with equal/missing timestamps (stable sort)', () => {
        const input = [
            makeTask('first-missing', undefined),
            makeTask('second-missing', undefined),
            makeTask('third-missing', undefined),
        ]
        const result = sortTasksByLastTouchedAsc(input)
        expect(result.map((t) => t.id)).toEqual(['first-missing', 'second-missing', 'third-missing'])
    })

    it('does not mutate the input array', () => {
        const input = [
            makeTask('b', '2026-02-01T00:00:00Z'),
            makeTask('a', '2025-01-01T00:00:00Z'),
        ]
        const originalOrder = input.map((t) => t.id)
        sortTasksByLastTouchedAsc(input)
        expect(input.map((t) => t.id)).toEqual(originalOrder)
    })

    it('returns empty array for empty input', () => {
        expect(sortTasksByLastTouchedAsc([])).toEqual([])
    })
})
