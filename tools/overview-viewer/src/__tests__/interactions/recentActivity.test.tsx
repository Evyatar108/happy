import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from '../../App'
import { activityLabel, RecentActivity } from '../../components/RecentActivity'
import type { ActivityEvent, OverviewData } from '../../types'

afterEach(() => {
    cleanup()
    localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-05-20T02:10:00.000Z'))
})

describe('RecentActivity', () => {
    it('renders activity events newest-first with relative timestamps', () => {
        render(
            <RecentActivity
                activityEvents={[event('old-task', '2026-05-20T01:05:00.000Z'), event('new-task', '2026-05-20T02:05:00.000Z')]}
                setFocusedTaskId={() => undefined}
                collapsed={false}
                onToggle={() => undefined}
            />,
        )

        expect(screen.getByText('new-task → implementing')).toBeTruthy()
        expect(screen.getByText('old-task → implementing')).toBeTruthy()
        expect(screen.getByText('5 m ago')).toBeTruthy()
        expect(screen.getByText('1 h ago')).toBeTruthy()
        expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
            'Recent activity2',
            'new-task → implementing5 m ago',
            'old-task → implementing1 h ago',
        ])
    })

    it('renders the null-newStage removal label', () => {
        expect(activityLabel({ ...event('deleted-task', '2026-05-20T02:05:00.000Z'), newStage: null })).toBe('deleted-task removed')
    })

    it('renders the empty state contract', () => {
        const { container } = render(
            <RecentActivity activityEvents={[]} setFocusedTaskId={() => undefined} collapsed={false} onToggle={() => undefined} />,
        )

        expect(container.innerHTML).toBe('<aside class="recent-activity-sidebar empty">No recent activity yet.</aside>')
    })

    it('invokes the click-through handler for an activity entry', async () => {
        const user = userEvent.setup()
        const setFocusedTaskId = vi.fn()
        render(
            <RecentActivity
                activityEvents={[event('click-task', '2026-05-20T02:05:00.000Z')]}
                setFocusedTaskId={setFocusedTaskId}
                collapsed={false}
                onToggle={() => undefined}
            />,
        )

        await user.click(screen.getByRole('button', { name: /click-task/ }))

        expect(setFocusedTaskId).toHaveBeenCalledWith('click-task')
    })

    it('hides entries when parent collapse state is true', () => {
        render(
            <RecentActivity
                activityEvents={[event('hidden-task', '2026-05-20T02:05:00.000Z')]}
                setFocusedTaskId={() => undefined}
                collapsed={true}
                onToggle={() => undefined}
            />,
        )

        expect(screen.getByRole('button', { name: /Recent activity/ }).getAttribute('aria-expanded')).toBe('false')
        expect(screen.queryByText('hidden-task → implementing')).toBeNull()
    })
})

describe('App RecentActivity integration', () => {
    it('defaults the sidebar open outside compact density mode', async () => {
        mockOverviewData()
        mockFetch(jsonl([event('open-task', '2026-05-20T02:05:00.000Z')]))

        render(<App />)

        await waitFor(() => expect(screen.getByText('open-task → implementing')).toBeTruthy())
    })

    it('defaults the sidebar collapsed in compact density mode', async () => {
        localStorage.setItem('codexu-overview-density-v1', 'compact')
        mockOverviewData()
        mockFetch(jsonl([event('compact-task', '2026-05-20T02:05:00.000Z')]))

        render(<App />)

        await waitFor(() => expect(screen.getByRole('button', { name: /Recent activity/ })).toBeTruthy())
        expect(screen.queryByText('compact-task → implementing')).toBeNull()
    })
})

function event(taskId: string, ts: string): ActivityEvent {
    return {
        ts,
        slug: taskId,
        kind: 'job',
        taskId,
        prevStage: 'planning',
        newStage: 'implementing',
        changedFields: ['stage'],
        reason: 'sync',
    }
}

function jsonl(events: ActivityEvent[]): string {
    return events.map((item) => JSON.stringify(item)).join('\n')
}

function mockFetch(body: string): void {
    vi.stubGlobal('fetch', vi.fn<Window['fetch']>().mockResolvedValue({ ok: true, text: async () => body } as Response))
}

function mockOverviewData(): void {
    window.OVERVIEW_DATA = minimalOverviewData()
    window.OVERVIEW_RALPH_STATE = { generatedAt: '', generatedFromCommit: '', byTaskId: {} }
}

function minimalOverviewData(): OverviewData {
    return {
        generatedAt: '2026-05-20T02:00:00.000Z',
        generatedFromCommit: 'abc1234',
        tasks: [],
        runs: [],
    }
}
