import { useCallback, useEffect, useState } from 'react'

import type { ActivityEvent } from '../types'

const activityUrl = './overview-activity.jsonl'
const activityUpdateEvent = 'overview-ralph-state:update'

export function parseActivityJsonl(text: string): ActivityEvent[] {
    const lines = text.split(/\r?\n/)
    const events: ActivityEvent[] = []
    let lastContentIndex = -1

    for (let index = lines.length - 1; index >= 0; index -= 1) {
        if (lines[index]?.trim()) {
            lastContentIndex = index
            break
        }
    }

    lines.forEach((line, index) => {
        const trimmed = line.trim()
        if (!trimmed) {
            return
        }

        try {
            events.push(JSON.parse(trimmed) as ActivityEvent)
        } catch (error) {
            if (index === lastContentIndex) {
                return
            }
            console.warn('[activity-events] skipped malformed JSONL line', error)
        }
    })

    return events.reverse()
}

export function useActivityEvents(): ActivityEvent[] {
    const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([])

    const refetch = useCallback(async () => {
        try {
            const response = await fetch(`${activityUrl}?t=${Date.now()}`)
            if (!response.ok) {
                setActivityEvents([])
                return
            }
            setActivityEvents(parseActivityJsonl(await response.text()))
        } catch {
            setActivityEvents([])
        }
    }, [])

    useEffect(() => {
        void refetch()

        if (!import.meta.hot) {
            return
        }

        import.meta.hot.on(activityUpdateEvent, refetch)
        return () => {
            import.meta.hot?.off?.(activityUpdateEvent, refetch)
        }
    }, [refetch])

    return activityEvents
}
