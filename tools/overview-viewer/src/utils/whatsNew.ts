import type { OverviewData } from '../types'

export const LAST_VISIT_STORAGE_KEY = 'codexu-overview-last-visit-v1'

export interface ChangedTask {
    id: string
    touchedAt: string
}

export function computeSeenTimestamp(lastTouched: Record<string, string> | undefined, nowMs = Date.now()): string {
    let maxDataMs = 0
    Object.values(lastTouched ?? {}).forEach((timestamp) => {
        const ms = Date.parse(timestamp)
        if (ms && ms > maxDataMs) maxDataMs = ms
    })
    return new Date(Math.max(nowMs, maxDataMs)).toISOString()
}

export function changedTasksSinceLastVisit(data: OverviewData, lastVisit: string | null): ChangedTask[] {
    if (!lastVisit || !data.lastTouched) return []
    const lastVisitMs = Date.parse(lastVisit)
    return Object.entries(data.lastTouched)
        .filter(([, timestamp]) => timestamp && Date.parse(timestamp) > lastVisitMs)
        .map(([id, touchedAt]) => ({ id, touchedAt }))
}

export function lastVisitLabel(lastVisit: string, nowMs = Date.now()): string {
    const hoursAgo = Math.round((nowMs - Date.parse(lastVisit)) / 36e5)
    return hoursAgo < 24 ? `${hoursAgo} h ago` : `${Math.round(hoursAgo / 24)} d ago`
}
