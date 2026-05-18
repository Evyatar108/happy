import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { WorkstreamPill } from '../../components/TaskCommand'
import type { OverviewData, OverviewTask } from '../../types'

const task: OverviewTask = {
    id: 'perf-WS2',
    scope: 'codexu',
    phase: 'plan-ready',
    status: 'ok',
    lastTouchedAt: '2026-05-01T00:00:00Z',
    kanbanCards: [],
    command: {
        name: 'perf-WS2',
        descriptionHtml: 'Performance workstream fixture',
        warnings: [],
        planPrompt: 'echo perf',
    },
}

const data: OverviewData = {
    generatedAt: '2026-05-01T00:00:00Z',
    tasks: [task],
    workstream: { 'perf-WS2': 'perf' },
    sizeBucket: { 'perf-WS2': 'small' },
}

describe('WorkstreamPill tooltip', () => {
    afterEach(() => cleanup())

    it('shows the full workstream label on hover within the Phase C jsdom harness', async () => {
        const user = userEvent.setup()
        render(<WorkstreamPill task={task} data={data} />)

        await user.hover(screen.getByRole('link', { name: 'Filter to Performance workstream (size: small)' }))

        expect((await screen.findByRole('tooltip')).textContent).toBe('Filter to Performance workstream (size: small)')
    })

    it('shows the full workstream label when keyboard focus lands on the pill', async () => {
        const user = userEvent.setup()
        render(<WorkstreamPill task={task} data={data} />)

        await user.tab()

        expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Filter to Performance workstream (size: small)' }))
        await waitFor(() => expect(screen.getByRole('tooltip').textContent).toBe('Filter to Performance workstream (size: small)'))
    })
})
