export function resolveTaskMatch(options: {
    slug: string
    ralphOverrides: Record<string, string>
    taskIds: Set<string>
}): { taskId: string; matchSource: 'override' | 'slug-default' } | null
