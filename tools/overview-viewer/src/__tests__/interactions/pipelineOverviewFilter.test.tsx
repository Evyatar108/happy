import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PipelineOverview } from '../../components/PipelineOverview'
import type { OverviewRalphState } from '../../types'
import { createEmptyFilters, type ActiveFilters } from '../../utils/filters'

const ralphState: OverviewRalphState = {
    generatedAt: '2026-05-19T12:00:00Z',
    generatedFromCommit: 'test',
    byTaskId: {
        alpha: { stage: 'implementing' },
        beta: { stage: 'shipped' },
    },
}

function applyFilterCallback(callback: unknown, current: ActiveFilters): ActiveFilters {
    expect(callback).toBeTypeOf('function')
    return (callback as (filters: ActiveFilters) => ActiveFilters)(current)
}

describe('PipelineOverview filter interactions', () => {
    afterEach(() => cleanup())

    it('selects one stage when a chip is clicked', async () => {
        const user = userEvent.setup()
        const setFilters = vi.fn()
        const current = createEmptyFilters()
        render(<PipelineOverview ralphState={ralphState} filters={current} setFilters={setFilters} />)

        await user.click(screen.getByRole('button', { name: 'implementing · 1' }))

        const next = applyFilterCallback(setFilters.mock.calls[0][0], current)
        expect([...next.ralphStage]).toEqual(['implementing'])
    })

    it('clears the filter when the active chip is clicked again', async () => {
        const user = userEvent.setup()
        const setFilters = vi.fn()
        const current = createEmptyFilters()
        current.ralphStage = new Set(['implementing'])
        render(<PipelineOverview ralphState={ralphState} filters={current} setFilters={setFilters} />)

        await user.click(screen.getByRole('button', { name: 'implementing · 1' }))

        const next = applyFilterCallback(setFilters.mock.calls[0][0], current)
        expect([...next.ralphStage]).toEqual([])
    })

    it('replaces the active stage instead of adding another one', async () => {
        const user = userEvent.setup()
        const setFilters = vi.fn()
        const current = createEmptyFilters()
        current.ralphStage = new Set(['implementing'])
        render(<PipelineOverview ralphState={ralphState} filters={current} setFilters={setFilters} />)

        await user.click(screen.getByRole('button', { name: 'shipped · 1' }))

        const next = applyFilterCallback(setFilters.mock.calls[0][0], current)
        expect([...next.ralphStage]).toEqual(['shipped'])
    })
})

