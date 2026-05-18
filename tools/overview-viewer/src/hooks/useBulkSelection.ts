import { useCallback, useMemo, useState } from 'react'

import { buildCopyCommandText } from '../utils/copyCommand'
import type { OverviewTask } from '../types'

export function buildBulkCopyText(tasks: OverviewTask[], selectedTaskIds: Set<string>): string {
    return tasks
        .filter((task) => selectedTaskIds.has(task.id) && task.command?.planPrompt !== null && task.command?.planPrompt !== undefined)
        .map((task) => `# === ${task.id} ===\n${buildCopyCommandText(task.command?.planPrompt ?? '', task.scope)}`)
        .join('\n\n')
}

export function useBulkSelection(tasks: OverviewTask[]) {
    const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(() => new Set())
    const toggleTask = useCallback((taskId: string, selected: boolean) => {
        setSelectedTaskIds((current) => {
            const next = new Set(current)
            if (selected) next.add(taskId)
            else next.delete(taskId)
            return next
        })
    }, [])
    const copyText = useMemo(() => buildBulkCopyText(tasks, selectedTaskIds), [selectedTaskIds, tasks])
    return { copyText, selectedTaskIds, toggleTask }
}
