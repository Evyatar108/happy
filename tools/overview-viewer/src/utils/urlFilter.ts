export function parseTaskIdFilter(search: string): Set<string> | null {
    try {
        const raw = new URLSearchParams(search).get('tasks')
        if (!raw) return null
        const ids = raw
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean)
        return ids.length > 0 ? new Set(ids) : null
    } catch {
        return null
    }
}

export function clearTasksParam(href: string): string {
    const url = new URL(href)
    url.searchParams.delete('tasks')
    return url.toString()
}
