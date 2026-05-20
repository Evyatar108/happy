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

    it('renders crew session rows for the current stage with transcript links', async () => {
        renderTask({
            stage: 'implementing',
            crewSessions: {
                ...emptyCrewSessions(),
                implementing: [
                    {
                        crewName: 'frontend',
                        memberName: 'alice',
                        startedAt: '2026-05-20T10:00:00.000Z',
                        endedAt: '2026-05-20T10:25:00.000Z',
                        outcome: 'completed',
                        transcriptPath: 'D:\\sessions\\alice run.jsonl',
                    },
                ],
                reviewing: [
                    {
                        crewName: 'frontend',
                        memberName: 'bob',
                        startedAt: '2026-05-20T11:00:00.000Z',
                    },
                ],
            },
        })
        await openTooltip()

        const tooltip = visibleTooltip()
        expect(tooltip.textContent).toContain('alice')
        expect(tooltip.textContent).toContain('2026-05-20T10:00:00.000Z -> 2026-05-20T10:25:00.000Z')
        expect(tooltip.textContent).toContain('completed')
        expect(tooltip.textContent).toContain('transcript ↗')
        expect(tooltip.textContent).not.toContain('bob')
        expect(tooltip.querySelectorAll('.tooltip-extras-row')).toHaveLength(1)
        expect(tooltip.querySelector('a')?.getAttribute('href')).toBe('file:///D:/sessions/alice%20run.jsonl')
    })

    it('URL-encodes transcript paths with spaces and hash characters', async () => {
        renderTask({
            stage: 'implementing',
            crewSessions: {
                ...emptyCrewSessions(),
                implementing: [
                    {
                        crewName: 'frontend',
                        memberName: 'alice',
                        startedAt: '2026-05-20T10:00:00.000Z',
                        transcriptPath: 'C:\\Users\\evmitran\\.claude\\projects\\with#hash\\session file.jsonl',
                    },
                ],
            },
        })
        await openTooltip()

        const link = visibleTooltip().querySelector<HTMLAnchorElement>('a[href^="file://"]')
        expect(link?.getAttribute('href')).toBe('file:///C:/Users/evmitran/.claude/projects/with%23hash/session%20file.jsonl')
    })

    it('renders no crew rows when the current stage bucket is empty', async () => {
        renderTask({
            stage: 'implementing',
            crewSessions: {
                ...emptyCrewSessions(),
                implementing: [],
                reviewing: [
                    {
                        crewName: 'frontend',
                        memberName: 'bob',
                        startedAt: '2026-05-20T11:00:00.000Z',
                    },
                ],
            },
        })
        await openTooltip()

        const tooltip = visibleTooltip()
        expect(tooltip.querySelectorAll('.tooltip-extras-row')).toHaveLength(0)
        expect(tooltip.textContent).not.toContain('bob')
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

function emptyCrewSessions(): NonNullable<RalphPipelineState['crewSessions']> {
    return {
        brainstorming: [],
        'brainstorm-ready': [],
        planning: [],
        'plan-ready': [],
        implementing: [],
        reviewing: [],
        'review-fix': [],
        'replan-pending': [],
        shipped: [],
        blocked: [],
    }
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
