import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { parseActivityJsonl, useActivityEvents } from '../../hooks/useActivityEvents'
import type { ActivityEvent } from '../../types'

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(1_762_000_000_000)
})

describe('useActivityEvents', () => {
    it('fetches cache-busted JSONL and returns events newest-first', async () => {
        const events = [event('old', '2026-05-20T01:00:00.000Z'), event('new', '2026-05-20T01:01:00.000Z')]
        const fetchMock = mockFetch(jsonl(events))

        const { result } = renderHook(() => useActivityEvents())

        await waitFor(() => expect(result.current.map((item) => item.taskId)).toEqual(['new', 'old']))
        expect(fetchMock).toHaveBeenCalledWith('./overview-activity.jsonl?t=1762000000000')
    })

    it('skips a torn final JSONL line silently', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

        expect(parseActivityJsonl(`${JSON.stringify(event('task', '2026-05-20T01:00:00.000Z'))}\n{"ts"\n`)).toEqual([
            event('task', '2026-05-20T01:00:00.000Z'),
        ])
        expect(warn).not.toHaveBeenCalled()
    })

    it('warns and skips malformed interior JSONL lines', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const fetchMock = mockFetch(`${JSON.stringify(event('old', '2026-05-20T01:00:00.000Z'))}\n{bad}\n${JSON.stringify(event('new', '2026-05-20T01:01:00.000Z'))}`)

        const { result } = renderHook(() => useActivityEvents())

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
        await waitFor(() => expect(result.current.map((item) => item.taskId)).toEqual(['new', 'old']))
        expect(warn).toHaveBeenCalledWith('[activity-events] skipped malformed JSONL line', expect.any(SyntaxError))
    })

    it('returns an empty array when the activity file is missing', async () => {
        const fetchMock = mockFetch('', { ok: false })

        const { result } = renderHook(() => useActivityEvents())

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
        expect(result.current).toEqual([])
    })

    it('returns an empty array when fetch throws', async () => {
        const fetchMock = vi.fn<Window['fetch']>().mockRejectedValue(new TypeError('fetch failed'))
        vi.stubGlobal('fetch', fetchMock)

        const { result } = renderHook(() => useActivityEvents())

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
        expect(result.current).toEqual([])
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

function mockFetch(body: string, { ok = true }: { ok?: boolean } = {}): ReturnType<typeof vi.fn<Window['fetch']>> {
    const fetchMock = vi.fn<Window['fetch']>().mockResolvedValue({
        ok,
        text: async () => body,
    } as Response)
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
}
