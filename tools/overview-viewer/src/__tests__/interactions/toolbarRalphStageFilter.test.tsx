import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { FilterChips } from '../../components/Toolbar'
import { useMultiAxisFilter } from '../../hooks/useMultiAxisFilter'
import type { OverviewData, OverviewRalphState } from '../../types'

const data: OverviewData = {
    tasks: [
        {
            id: 'task-implementing',
            scope: 'codexu',
            phase: 'plan-ready',
            status: 'ok',
            command: { name: 'task-implementing', descriptionHtml: 'Implementing task' },
            kanbanCards: [{ column: 'ready', html: '<div class="card-title">Implementing</div><div class="card-meta"></div>' }],
        },
        {
            id: 'task-shipped',
            scope: 'codexu',
            phase: 'shipped',
            status: 'closed',
            command: { name: 'task-shipped', descriptionHtml: 'Shipped task' },
            kanbanCards: [{ column: 'ready', html: '<div class="card-title">Shipped</div><div class="card-meta"></div>' }],
        },
    ],
}

const ralphState: OverviewRalphState = {
    generatedAt: '2026-05-19T12:00:00Z',
    generatedFromCommit: 'test',
    byTaskId: {
        'task-implementing': { stage: 'implementing', jobSlug: 'stage-filter-job' },
        'task-shipped': { stage: 'shipped', jobSlug: 'stage-filter-done' },
    },
}

function FilterHarness() {
    const filter = useMultiAxisFilter(data, null, ralphState)

    return (
        <>
            <FilterChips activeFilters={filter.activeFilters} onToggle={filter.toggleFilter} />
            <div data-testid="command-visible">{Array.from(filter.visibleTaskIds).sort().join(',')}</div>
            <div data-testid="kanban-visible">{Array.from(filter.visibleKanbanTaskIds).sort().join(',')}</div>
        </>
    )
}

describe('Toolbar Ralph stage filter', () => {
    afterEach(() => cleanup())

    it('renders the ten Ralph stage chips', () => {
        const { container } = render(<FilterHarness />)

        expect(container.querySelectorAll('.filter-group[data-axis="ralphStage"] .chip')).toHaveLength(10)
    })

    it('filters command and kanban visible task ids when a stage chip is clicked', async () => {
        const user = userEvent.setup()
        render(<FilterHarness />)

        await user.click(screen.getByRole('button', { name: /implementing/ }))

        expect(screen.getByTestId('command-visible').textContent).toBe('task-implementing')
        expect(screen.getByTestId('kanban-visible').textContent).toBe('task-implementing')
    })
})
