import { useMemo, useState } from 'react'

import type { OverviewData } from '../types'
import { createEmptyFilters, matchesKanbanFilter, matchesTaskFilter, toggleFilter, type ActiveFilters, type FilterAxis } from '../utils/filters'

export function useMultiAxisFilter(data: OverviewData, taskIdFilter: Set<string> | null) {
    const [query, setQuery] = useState('')
    const [activeFilters, setActiveFilters] = useState<ActiveFilters>(() => createEmptyFilters())

    const visibleTaskIds = useMemo(() => {
        const ids = new Set<string>()
        ;(data.tasks ?? []).forEach((task) => {
            if (matchesTaskFilter(task, data, activeFilters, query, taskIdFilter)) ids.add(task.id)
        })
        return ids
    }, [activeFilters, data, query, taskIdFilter])

    const visibleKanbanTaskIds = useMemo(() => {
        const ids = new Set<string>()
        ;(data.tasks ?? []).forEach((task) => {
            if (matchesKanbanFilter(task, data, activeFilters, query)) ids.add(task.id)
        })
        return ids
    }, [activeFilters, data, query])

    return {
        activeFilters,
        query,
        setQuery,
        toggleFilter: (axis: FilterAxis, value: string) => setActiveFilters((current) => toggleFilter(current, axis, value)),
        visibleKanbanTaskIds,
        visibleTaskIds,
    }
}
