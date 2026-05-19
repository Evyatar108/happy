export function buildSnapshot({
    ralphState,
    overviewData,
    recommendations = [],
    dependencyGraph = { nodes: [], edges: [] },
    runDurations = {},
    generatedFromCommit,
}) {
    if (!ralphState || !overviewData) {
        throw new Error('buildSnapshot requires ralphState and overviewData')
    }

    const byTaskId = ralphState.byTaskId ?? {}
    const tasks = (overviewData.tasks ?? []).map((task) => {
        const ralph = byTaskId[task.id]
        return ralph ? { ...task, ralph } : { ...task }
    })

    return {
        generatedAt: ralphState.generatedAt,
        generatedFromCommit: generatedFromCommit ?? ralphState.generatedFromCommit ?? overviewData.generatedFromCommit ?? '',
        schemaVersion: 1,
        tasks,
        runs: overviewData.runs ?? [],
        recommendations,
        dependencyGraph,
        runDurations,
        unmatched: ralphState.unmatched ?? [],
        unmatchedSummary: ralphState.unmatchedSummary ?? {},
    }
}
