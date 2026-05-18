export function shortSha(sha: string | undefined): string {
    return sha ? sha.slice(0, 8) : '...'
}

export function relativeSnapshotAge(generatedAt: string | undefined, nowMs = Date.now()): string {
    if (!generatedAt) return ''
    const generatedMs = Date.parse(generatedAt)
    if (Number.isNaN(generatedMs)) return ''
    const hoursAgo = (nowMs - generatedMs) / 36e5
    const ago = hoursAgo < 1 ? '< 1 h ago' : hoursAgo < 24 ? `${Math.round(hoursAgo)} h ago` : `${Math.round(hoursAgo / 24)} d ago`
    return `(snapshot ${ago})`
}
