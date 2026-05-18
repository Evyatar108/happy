import type { OverviewTask } from '../types'

export const PHASE_TO_BADGE_TEXT: Record<string, string> = {
    'brainstorm-ready': '💡 brainstorm ready',
    'brainstorm-in-progress': '💡 brainstorm in progress',
    'brainstorm-review': '💡 brainstorm review',
    'plan-ready': '📋 plan ready',
    'plan-in-progress': '📋 plan in progress',
    'plan-review': '📋 plan review',
    'impl-ready': '🟦 impl ready',
    'impl-in-progress': '🟡 impl in progress',
    shipped: '✅ shipped',
    closed: '🚫 closed',
}

export const PHASE_TO_ORDER_BUCKET: Record<string, string> = {
    'brainstorm-ready': 'brainstorm',
    'brainstorm-in-progress': 'brainstorm',
    'brainstorm-review': 'brainstorm',
    'plan-ready': 'ready',
    'plan-in-progress': 'inprogress',
    'plan-review': 'inprogress',
    'impl-ready': 'ready',
    'impl-in-progress': 'inprogress',
    shipped: 'shipped',
    closed: 'closed',
}

export const PHASE_TO_FILTER_BUCKET: Record<string, string> = {
    'brainstorm-ready': 'brainstorm',
    'brainstorm-in-progress': 'brainstorm',
    'brainstorm-review': 'brainstorm',
    'plan-ready': 'ready',
    'plan-in-progress': 'inprogress',
    'plan-review': 'inprogress',
    'impl-ready': 'ready',
    'impl-in-progress': 'inprogress',
    shipped: 'closed',
    closed: 'closed',
}

export function orderBucketForTask(task: OverviewTask): string | undefined {
    return task.phase ? PHASE_TO_ORDER_BUCKET[task.phase] : undefined
}

export function filterBucketForTask(task: OverviewTask): string {
    if (task.status === 'blocked' || task.status === 'paused') return task.status
    return (task.phase && PHASE_TO_FILTER_BUCKET[task.phase]) || 'unknown'
}
