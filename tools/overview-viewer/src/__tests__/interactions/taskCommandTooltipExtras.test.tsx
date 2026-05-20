import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TaskCommand } from '../../components/TaskCommand'
import type { OverviewData, OverviewRalphState, RalphPipelineState } from '../../types'

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

describe('TaskCommand Ralph tooltip extras', () => {
    it('renders no extra rows when deferred questions, branch, and PR fields are absent', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

        renderTask({ stage: 'implementing', jobSlug: 'job-none' })
        await openTooltip()

        const tooltip = visibleTooltip()
        expect(tooltip.textContent).toContain('implementing')
        expect(tooltip.querySelectorAll('.tooltip-extras-row')).toHaveLength(0)
        expect(tooltip.textContent).not.toContain('undefined')
        expect(tooltip.textContent).not.toContain('null')
        expect(warn).not.toHaveBeenCalled()
    })

    it('renders one open-question row with a truncated preview subline', async () => {
        renderTask({
            stage: 'implementing',
            deferredQuestionsCount: 1,
            deferredQuestionsPreview: 'Which branch should receive the generated overview artifact?',
        })
        await openTooltip()

        const tooltip = visibleTooltip()
        expect(tooltip.textContent).toContain('📝 1 open questions')
        expect(tooltip.querySelector('.tooltip-extras-subline')?.textContent).toBe('Which branch should receive the generated overview artifact?')
        expect(tooltip.querySelectorAll('.tooltip-extras-row')).toHaveLength(1)
    })

    it('renders branch and PR rows together without broken markup', async () => {
        renderTask({
            stage: 'reviewing',
            branchName: 'ralph/overview-data-split/integration',
            prUrl: 'https://github.com/Evyatar108/happy/pull/77',
        })
        await openTooltip()

        const tooltip = visibleTooltip()
        expect(tooltip.textContent).toContain('ralph/overview-data-split/integration')
        expect(tooltip.querySelector('a')?.getAttribute('href')).toBe('https://github.com/Evyatar108/happy/pull/77')
        expect(tooltip.querySelectorAll('.tooltip-extras-row')).toHaveLength(2)
        expect(tooltip.textContent).not.toContain('undefined')
    })

    it('renders all three extras and copies the exact branch checkout command', async () => {
        const user = userEvent.setup()
        if (!navigator.clipboard) {
            Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => undefined } })
        }
        const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
        const showToast = vi.fn()

        renderTask(
            {
                stage: 'reviewing',
                deferredQuestionsCount: 2,
                deferredQuestionsPreview: 'Confirm whether the PR backlink should use fork or upstream origin.',
                branchName: 'ralph/overview-data-split/integration',
                prUrl: 'https://github.com/Evyatar108/happy/pull/77',
            },
            showToast,
        )
        await openTooltip()

        const tooltip = visibleTooltip()
        expect(tooltip.textContent).toContain('📝 2 open questions')
        expect(tooltip.textContent).toContain('ralph/overview-data-split/integration')
        expect(tooltip.querySelector('a')?.textContent).toBe('PR ↗')

        const copyButton = tooltip.querySelector<HTMLButtonElement>('button[aria-label="Copy checkout command for ralph/overview-data-split/integration"]')
        expect(copyButton).toBeTruthy()
        await user.click(copyButton as HTMLButtonElement)

        await waitFor(() => expect(writeText).toHaveBeenCalledWith('git checkout ralph/overview-data-split/integration'))
        expect(showToast).toHaveBeenCalledWith('Copied `ralph/overview-data-split/integration` (0.1 KB)')
    })
})

async function openTooltip() {
    const user = userEvent.setup()
    const chip = screen.queryByLabelText('Ralph stage: implementing') ?? screen.getByLabelText('Ralph stage: reviewing')
    await user.hover(chip)
    await waitFor(() => expect(screen.getByRole('tooltip')).toBeTruthy())
}

function visibleTooltip(): HTMLElement {
    const tooltip = document.querySelector<HTMLElement>('.tooltip-content > .ralph-stage-tooltip')
    expect(tooltip).toBeTruthy()
    return tooltip as HTMLElement
}

function renderTask(ralph: RalphPipelineState, showToast?: (text: string) => void) {
    const data: OverviewData = {
        generatedAt: '2026-05-20T00:00:00.000Z',
        generatedFromCommit: 'abc1234',
        tasks: [],
        runs: [],
    }
    const ralphState: OverviewRalphState = {
        generatedAt: '2026-05-20T00:00:00.000Z',
        generatedFromCommit: 'abc1234',
        byTaskId: {
            'tooltip-task': {
                jobSlug: 'tooltip-job',
                ...ralph,
            },
        },
    }

    return render(
        <TaskCommand
            task={{
                id: 'tooltip-task',
                scope: 'bookkeeping',
                phase: 'ready',
                status: 'active',
                command: { name: 'Tooltip task', descriptionHtml: 'Task with Ralph metadata', planPrompt: 'pnpm test' },
            }}
            data={data}
            taskIds={['tooltip-task']}
            childrenByParent={{}}
            open={false}
            onOpenChange={() => undefined}
            ralphState={ralphState}
            showToast={showToast}
        />,
    )
}
