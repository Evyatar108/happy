export function resolveTaskMatch({ slug, ralphOverrides, taskIds }) {
    const overrideTaskId = ralphOverrides[slug]
    if (overrideTaskId) {
        return { taskId: overrideTaskId, matchSource: 'override' }
    }
    if (taskIds.has(slug)) {
        return { taskId: slug, matchSource: 'slug-default' }
    }
    return null
}
