import { parseTaskScope } from '../data/copyPreambles'
import type { OverviewData, OverviewTask } from '../types'
import { filterBucketForTask } from './taskClassification'

export type FilterAxis = 'status' | 'workstream' | 'cadence' | 'size' | 'scope'
export type ActiveFilters = Record<FilterAxis, Set<string>>

export function createEmptyFilters(): ActiveFilters {
    return {
        status: new Set(),
        workstream: new Set(),
        cadence: new Set(),
        size: new Set(),
        scope: new Set(),
    }
}

export function cloneFilters(filters: ActiveFilters): ActiveFilters {
    return {
        status: new Set(filters.status),
        workstream: new Set(filters.workstream),
        cadence: new Set(filters.cadence),
        size: new Set(filters.size),
        scope: new Set(filters.scope),
    }
}

export function toggleFilter(filters: ActiveFilters, axis: FilterAxis, value: string): ActiveFilters {
    const next = cloneFilters(filters)
    const values = next[axis]
    if (values.has(value)) values.delete(value)
    else values.add(value)
    return next
}

export function matchesTaskFilter(task: OverviewTask, data: OverviewData, filters: ActiveFilters, query: string, taskIdFilter: Set<string> | null): boolean {
    const taskId = task.id
    const q = query.trim().toLowerCase()
    const status = filterBucketForTask(task)
    const workstream = data.workstream?.[taskId] ?? ''
    const size = data.sizeBucket?.[taskId] ?? ''
    const cadence = data.cadence?.[taskId] ?? 'one-shot'
    const scopes = parseTaskScope(task.scope)
    const statusOk = filters.status.size === 0 || filters.status.has(status)
    const workstreamOk = filters.workstream.size === 0 || filters.workstream.has(workstream)
    const sizeOk = filters.size.size === 0 || filters.size.has(size)
    const cadenceOk = filters.cadence.size === 0 || filters.cadence.has(cadence)
    const scopeOk = filters.scope.size === 0 || scopes.some((scope) => filters.scope.has(scope))
    const idOk = !taskIdFilter || taskIdFilter.has(taskId)
    const haystack = [task.id, task.command?.name, task.command?.descriptionHtml, task.command?.planPrompt]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
    const textOk = !q || haystack.includes(q)
    return statusOk && workstreamOk && sizeOk && cadenceOk && scopeOk && idOk && textOk
}

export function matchesKanbanFilter(task: OverviewTask, data: OverviewData, filters: ActiveFilters, query: string): boolean {
    const q = query.trim().toLowerCase()
    const workstream = data.workstream?.[task.id] ?? ''
    const workstreamOk = filters.workstream.size === 0 || filters.workstream.has(workstream)
    const text = [task.id, ...(task.kanbanCards ?? []).map((card) => card.html)].join(' ').toLowerCase()
    const textOk = !q || text.includes(q)
    return workstreamOk && textOk
}
