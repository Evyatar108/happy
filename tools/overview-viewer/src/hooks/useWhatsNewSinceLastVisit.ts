import { useCallback, useEffect, useMemo, useState } from 'react'

import type { OverviewData } from '../types'
import { changedTasksSinceLastVisit, computeSeenTimestamp, LAST_VISIT_STORAGE_KEY, type ChangedTask } from '../utils/whatsNew'

function getLocalStorage(): Storage | undefined {
    return typeof window === 'undefined' ? undefined : window.localStorage
}

export function useWhatsNewSinceLastVisit(data: OverviewData) {
    const [changedTasks, setChangedTasks] = useState<ChangedTask[]>([])
    const [lastVisit, setLastVisit] = useState<string | null>(null)

    useEffect(() => {
        const storage = getLocalStorage()
        if (!storage || !data.lastTouched) return
        const stored = storage.getItem(LAST_VISIT_STORAGE_KEY)
        if (!stored) {
            storage.setItem(LAST_VISIT_STORAGE_KEY, computeSeenTimestamp(data.lastTouched))
            setChangedTasks([])
            setLastVisit(null)
            return
        }
        const changed = changedTasksSinceLastVisit(data, stored)
        if (changed.length === 0) storage.setItem(LAST_VISIT_STORAGE_KEY, computeSeenTimestamp(data.lastTouched))
        setLastVisit(stored)
        setChangedTasks(changed)
    }, [data])

    const changedTaskIds = useMemo(() => new Set(changedTasks.map((task) => task.id)), [changedTasks])

    const markAllSeen = useCallback(() => {
        getLocalStorage()?.setItem(LAST_VISIT_STORAGE_KEY, computeSeenTimestamp(data.lastTouched))
        setChangedTasks([])
    }, [data.lastTouched])

    return { changedTaskIds, changedTasks, lastVisit, markAllSeen }
}
