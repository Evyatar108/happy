import { useMemo } from 'react'

import type { usePersistentExpanded } from '../hooks/usePersistentExpanded'
import type { OverviewData } from '../types'
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

type ExpandedControls = ReturnType<typeof usePersistentExpanded>

export function CommandList({
    changedTaskIds = new Set(),
    data,
    expandedControls,
    onSelectTask,
    selectedTaskIds = new Set(),
    visibleTaskIds,
}: {
    changedTaskIds?: Set<string>
    data: OverviewData
    expandedControls: ExpandedControls
    onSelectTask?: (taskId: string, selected: boolean) => void
    selectedTaskIds?: Set<string>
    visibleTaskIds?: Set<string>
}) {
    const tasks = data.tasks ?? []
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
                        onOpenChange={setTaskExpanded}
                        onSelectTask={onSelectTask}
                    />
                ))}
            </div>
        </section>
    )
}
