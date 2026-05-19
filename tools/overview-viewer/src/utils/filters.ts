import { parseTaskScope } from '../data/copyPreambles'
import type { OverviewData, OverviewRalphState, OverviewTask } from '../types'
import { filterBucketForTask } from './taskClassification'

const NO_RALPH_STAGE = '__no_ralph__'

export type FilterAxis = 'status' | 'workstream' | 'cadence' | 'size' | 'scope' | 'ralphStage'
export type ActiveFilters = Record<FilterAxis, Set<string>>

export function createEmptyFilters(): ActiveFilters {
    return {
        status: new Set(),
        workstream: new Set(),
        cadence: new Set(),
        size: new Set(),
        scope: new Set(),
        ralphStage: new Set(),
    }
}

export function cloneFilters(filters: ActiveFilters): ActiveFilters {
    return {
        status: new Set(filters.status),
        workstream: new Set(filters.workstream),
        cadence: new Set(filters.cadence),
        size: new Set(filters.size),
        scope: new Set(filters.scope),
        ralphStage: new Set(filters.ralphStage),
    }
}

export function toggleFilter(filters: ActiveFilters, axis: FilterAxis, value: string): ActiveFilters {
    const next = cloneFilters(filters)
    const values = next[axis]
    if (values.has(value)) values.delete(value)
    else values.add(value)
    return next
}

// Build the command-row search haystack. Mirrors the legacy renderer's
// `cmd.textContent.toLowerCase()` from plans/overview.html:2156 — the search
// must hit anything rendered in the row, not just name/description/prompt.
// That includes scope/phase/status/mergeCommit labels, workstream/size/cadence
// labels from data lookups, the warning HTML, the spawned-from parent ID, and
// the IDs of any spawned children that render as chips on this row.
export function getTaskSearchHaystack(task: OverviewTask, data: OverviewData, ralphState: OverviewRalphState): string {
    const taskId = task.id
    const ralph = ralphState.byTaskId[taskId]
    const parts: (string | undefined | null)[] = [
        taskId,
        task.scope,
        task.phase,
        task.status,
        task.mergeCommit,
        task.command?.name,
        task.command?.descriptionHtml,
        task.command?.planPrompt,
        data.workstream?.[taskId],
        data.sizeBucket?.[taskId],
        data.cadence?.[taskId],
        data.spawnedFrom?.[taskId],
        ralph?.stage,
        ralph?.jobSlug,
        ralph?.groupSlug,
    ]
    task.command?.warnings?.forEach((warning) => parts.push(warning.html))
    if (data.spawnedFrom) {
        for (const [childId, parentId] of Object.entries(data.spawnedFrom)) {
            if (parentId === taskId) parts.push(childId)
        }
    }
    return parts.filter(Boolean).join(' ').toLowerCase()
}

export function matchesTaskFilter(task: OverviewTask, data: OverviewData, filters: ActiveFilters, query: string, taskIdFilter: Set<string> | null, ralphState: OverviewRalphState): boolean {
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
    const ralphStageOk = filters.ralphStage.size === 0 || filters.ralphStage.has(ralphState.byTaskId[taskId]?.stage ?? NO_RALPH_STAGE)
    const idOk = !taskIdFilter || taskIdFilter.has(taskId)
    const textOk = !q || getTaskSearchHaystack(task, data, ralphState).includes(q)
    return statusOk && workstreamOk && sizeOk && cadenceOk && scopeOk && ralphStageOk && idOk && textOk
}

export function matchesKanbanFilter(task: OverviewTask, data: OverviewData, filters: ActiveFilters, query: string, ralphState: OverviewRalphState): boolean {
    const q = query.trim().toLowerCase()
    const workstream = data.workstream?.[task.id] ?? ''
    const workstreamOk = filters.workstream.size === 0 || filters.workstream.has(workstream)
    const ralphStageOk = filters.ralphStage.size === 0 || filters.ralphStage.has(ralphState.byTaskId[task.id]?.stage ?? NO_RALPH_STAGE)
    const text = [task.id, ...(task.kanbanCards ?? []).map((card) => card.html)].join(' ').toLowerCase()
    const textOk = !q || text.includes(q)
    return workstreamOk && ralphStageOk && textOk
}
