import { useMemo } from 'react'

import type { usePersistentExpanded } from '../hooks/usePersistentExpanded'
import type { useUrlFilter } from '../hooks/useUrlFilter'
import type { OverviewData, OverviewTask } from '../types'
import { orderBucketForTask } from '../utils/taskClassification'
import { TaskCommand } from './TaskCommand'
import { UrlFilterBanner } from './TopLevelSurfaces'

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
type TaskIdFilter = ReturnType<typeof useUrlFilter>

const ORDER_BUCKETS = ['brainstorm', 'inprogress', 'ready', 'shipped', 'closed'] as const

type OrderBucket = (typeof ORDER_BUCKETS)[number]

export function countVisibleTasksByOrderBucket(tasks: OverviewTask[], visibleTaskIds?: Set<string>): Record<OrderBucket, number> {
    const counts: Record<OrderBucket, number> = {
        brainstorm: 0,
        inprogress: 0,
        ready: 0,
        shipped: 0,
        closed: 0,
    }

    tasks.forEach((task) => {
        if (visibleTaskIds && !visibleTaskIds.has(task.id)) return
        const bucket = orderBucketForTask(task)
        if (bucket && bucket in counts) counts[bucket as OrderBucket] += 1
    })

    return counts
}

export function CommandList({
    changedTaskIds = new Set(),
    data,
    expandedControls,
    onActivateWorkstream,
    onSelectTask,
    query = '',
    selectedTaskIds = new Set(),
    taskIdFilter,
    visibleTaskIds,
}: {
    changedTaskIds?: Set<string>
    data: OverviewData
    expandedControls: ExpandedControls
    onActivateWorkstream?: (workstream: string) => void
    onSelectTask?: (taskId: string, selected: boolean) => void
    query?: string
    selectedTaskIds?: Set<string>
    taskIdFilter?: TaskIdFilter
    visibleTaskIds?: Set<string>
}) {
    const tasks = useMemo(() => sortTasksByLastTouchedAsc(data.tasks ?? []), [data.tasks])
    const taskIds = useMemo(() => tasks.map((task) => task.id), [tasks])
    const childrenByParent = useMemo(() => buildChildrenByParent(data.spawnedFrom), [data.spawnedFrom])
    const counts = useMemo(() => countVisibleTasksByOrderBucket(tasks, visibleTaskIds), [tasks, visibleTaskIds])
    const visibleCount = useMemo(() => tasks.filter((task) => !visibleTaskIds || visibleTaskIds.has(task.id)).length, [tasks, visibleTaskIds])
    const { isExpanded, setTaskExpanded } = expandedControls

    return (
        <details className="section sec-cmds">
            <summary className="section-head">Ralph commands — click to expand, button to copy <span className="section-counts" id="counts-cmds">({visibleCount} commands)<span className="sc sc-ready">brainstorm {counts.brainstorm}</span><span className="sc sc-inprogress">in progress {counts.inprogress}</span><span className="sc sc-ready">ready {counts.ready}</span><span className="sc sc-closed">shipped {counts.shipped}</span><span className="sc sc-closed">closed {counts.closed}</span></span></summary>
            <div className="sub" style={{ marginBottom: 12 }}>
                Self-contained <code>/plan-with-ralph</code> prompts mirrored from <code>plans/parallel-assignments.md</code>. Click a row to reveal the full command and copy with one click. Status badge reflects current state.
            </div>
            {taskIdFilter ? <UrlFilterBanner taskIdFilter={taskIdFilter} /> : null}
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
        </details>
    )
}
