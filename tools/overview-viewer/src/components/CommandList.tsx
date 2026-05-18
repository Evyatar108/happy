import { useMemo } from 'react'

import type { usePersistentExpanded } from '../hooks/usePersistentExpanded'
import type { OverviewData, OverviewTask } from '../types'
import { TaskCommand } from './TaskCommand'

function buildChildrenByParent(spawnedFrom: Record<string, string> | undefined): Record<string, string[]> {
    const childrenByParent: Record<string, string[]> = {}
    Object.entries(spawnedFrom ?? {}).forEach(([childId, parentId]) => {
        if (childId.startsWith('_') || !parentId || parentId.startsWith('_')) return
        childrenByParent[parentId] = childrenByParent[parentId] ?? []
        childrenByParent[parentId].push(childId)
    })
    return childrenByParent
}

// Tasks without lastTouchedAt sort to the bottom; "9999-12-31..." beats any
// real ISO-8601 timestamp lexically.
const NEVER_TOUCHED_SENTINEL = '9999-12-31T23:59:59Z'

// Sort ascending by lastTouchedAt — oldest (most-neglected) tasks surface
// at the top of each phase bucket. CSS `order` on data-cmd-status still
// drives bucket separation; within a bucket, DOM order applies, which is
// now the lastTouchedAt-asc order produced here. Stable sort preserves
// manual order in plans/overview-data.js for tasks with equal/missing
// timestamps. Deliberate UX deviation from the 9f81c1f8 baseline.
export function sortTasksByLastTouchedAsc(tasks: OverviewTask[]): OverviewTask[] {
    return [...tasks].sort((a, b) => {
        const aTime = a.lastTouchedAt || NEVER_TOUCHED_SENTINEL
        const bTime = b.lastTouchedAt || NEVER_TOUCHED_SENTINEL
        return aTime.localeCompare(bTime)
    })
}

type ExpandedControls = ReturnType<typeof usePersistentExpanded>

export function CommandList({
    changedTaskIds = new Set(),
    data,
    expandedControls,
    onActivateWorkstream,
    onSelectTask,
    query = '',
    selectedTaskIds = new Set(),
    visibleTaskIds,
}: {
    changedTaskIds?: Set<string>
    data: OverviewData
    expandedControls: ExpandedControls
    onActivateWorkstream?: (workstream: string) => void
    onSelectTask?: (taskId: string, selected: boolean) => void
    query?: string
    selectedTaskIds?: Set<string>
    visibleTaskIds?: Set<string>
}) {
    const tasks = useMemo(() => sortTasksByLastTouchedAsc(data.tasks ?? []), [data.tasks])
    const taskIds = useMemo(() => tasks.map((task) => task.id), [tasks])
    const childrenByParent = useMemo(() => buildChildrenByParent(data.spawnedFrom), [data.spawnedFrom])
    const { isExpanded, setTaskExpanded } = expandedControls

    return (
        <section className="cmd-list" aria-label="Ralph commands">
            <div id="cmd-list">
                {tasks.map((task) => (
                    <TaskCommand
                        key={task.id}
                        task={task}
                        data={data}
                        taskIds={taskIds}
                        childrenByParent={childrenByParent}
                        changed={changedTaskIds.has(task.id)}
                        hidden={visibleTaskIds ? !visibleTaskIds.has(task.id) : false}
                        selected={selectedTaskIds.has(task.id)}
                        open={isExpanded(task.id)}
                        onActivateWorkstream={onActivateWorkstream}
                        onOpenChange={setTaskExpanded}
                        onSelectTask={onSelectTask}
                        query={query}
                    />
                ))}
            </div>
        </section>
    )
}
