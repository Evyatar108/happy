import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { RalphStageChip } from '../../components/RalphStageChip'
import type { OverviewRalphState } from '../../types'

const ralphState: OverviewRalphState = {
    generatedAt: '2026-05-19T00:00:00Z',
    generatedFromCommit: 'abc1234',
    byTaskId: {
        'task-1': {
            stage: 'implementing',
            jobSlug: 'pipeline-chip-job',
            groupSlug: 'pipeline-chip-group',
            lastUpdatedAt: '2026-05-19T01:02:03Z',
        },
    },
}

describe('RalphStageChip tooltip', () => {
    afterEach(() => cleanup())

    it('shows stage and slug when keyboard focus lands on the chip', async () => {
        const user = userEvent.setup()
        render(<RalphStageChip taskId="task-1" ralphState={ralphState} />)

        await user.tab()

        const chip = screen.getByLabelText('Ralph stage: implementing')
        expect(document.activeElement).toBe(chip)
        await waitFor(() => expect(screen.getByRole('tooltip').textContent).toContain('implementing'))
        expect(screen.getByRole('tooltip').textContent).toContain('pipeline-chip-job')
    })

    it('renders tooltip extras below the stage details', async () => {
        const user = userEvent.setup()
        render(
            <RalphStageChip
                taskId="task-1"
                ralphState={ralphState}
                tooltipExtras={<span data-testid="chip-extra">2/3 stories passed</span>}
            />,
        )

        await user.tab()

        await waitFor(() => expect(screen.getAllByTestId('chip-extra')[0]?.textContent).toBe('2/3 stories passed'))
    })
})
