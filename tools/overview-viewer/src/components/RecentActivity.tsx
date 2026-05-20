import type { ActivityEvent } from '../types'

export interface RecentActivityProps {
    activityEvents: ActivityEvent[]
    setFocusedTaskId: (id: string) => void
    collapsed: boolean
    onToggle: () => void
}

const MAX_VISIBLE_EVENTS = 10

export function formatActivityRelativeTime(ts: string, nowMs = Date.now()): string {
    const eventMs = Date.parse(ts)
    if (Number.isNaN(eventMs)) return ''
    const minutesAgo = Math.max(0, Math.floor((nowMs - eventMs) / 60000))
    if (minutesAgo < 1) return 'just now'
    if (minutesAgo < 60) return `${minutesAgo} m ago`
    const hoursAgo = Math.floor(minutesAgo / 60)
    if (hoursAgo < 24) return `${hoursAgo} h ago`
    return `${Math.floor(hoursAgo / 24)} d ago`
}

export function activityLabel(event: ActivityEvent): string {
    const taskId = event.taskId ?? event.slug
    return event.newStage === null ? `${taskId} removed` : `${taskId} → ${event.newStage}`
}

export function RecentActivity({ activityEvents, setFocusedTaskId, collapsed, onToggle }: RecentActivityProps) {
    if (activityEvents.length === 0) {
        return <aside className="recent-activity-sidebar empty">No recent activity yet.</aside>
    }

    const visibleEvents = [...activityEvents]
        .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
        .slice(0, MAX_VISIBLE_EVENTS)

    return (
        <aside className={`recent-activity-sidebar${collapsed ? ' collapsed' : ''}`} aria-label="Recent activity">
            <button className="recent-activity-toggle" type="button" onClick={onToggle} aria-expanded={!collapsed}>
                Recent activity
                <span className="recent-activity-count">{visibleEvents.length}</span>
            </button>
            {collapsed ? null : (
                <ol className="recent-activity-list">
                    {visibleEvents.map((event, index) => {
                        const taskId = event.taskId ?? event.slug
                        return (
                            <li key={`${event.ts}-${taskId}-${index}`}>
                                <button className="recent-activity-entry" type="button" onClick={() => setFocusedTaskId(taskId)}>
                                    <span className="recent-activity-label">{activityLabel(event)}</span>
                                    <time className="recent-activity-time" dateTime={event.ts}>{formatActivityRelativeTime(event.ts)}</time>
                                </button>
                            </li>
                        )
                    })}
                </ol>
            )}
        </aside>
    )
}
