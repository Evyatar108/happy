export const codexuDefaultConfig = deepFreeze({
    dataFile: 'plans/overview-data.js',
    ralphRoot: '.ralph',
    crewsRoot: '.crews',
    ralphSubdirs: {
        jobs: 'jobs',
        jobGroups: 'job-groups',
        brainstorms: 'brainstorms',
    },
    outputs: {
        sidecarJs: 'plans/overview-ralph-state.js',
        sidecarJson: 'plans/overview-ralph-state.json',
        snapshot: 'plans/overview-snapshot.json',
        activity: 'plans/overview-activity.jsonl',
        activityBackup: 'plans/overview-activity.1.jsonl',
        dataJson: 'plans/overview-data.json',
        snapshotSchema: 'plans/overview-snapshot.schema.json',
        tasksIndex: 'tasks/INDEX.md',
        recommendationsJson: 'plans/overview-recommendations.json',
        dependencyGraphJson: 'plans/overview-dependency-graph.json',
        activityMaxLines: 1000,
    },
    recommendations: {
        weights: {
            stageUrgency: 40,
            dependencyState: 30,
            freshness: 20,
            priority: 10,
        },
        topN: 20,
    },
    lockFile: '.ralph/overview-sync.lock',
    watcher: {
        ignored: [
            '.worktrees/**',
            '**/.git/**',
            '.ralph/jobs/*/worktree/**',
            '.ralph/jobs/.staging/**',
            '.ralph/telemetry/**',
            '.crews/logs/**',
            '.crews/spawn-launchers/**',
            '.crews/crews/*/members/*/mailbox.json',
            '.crews/crews/*/members/*/outbox.jsonl',
            '.crews/crews/*/leads/*/mailbox.json',
            '.crews/crews/*/leads/*/outbox.jsonl',
            '.crews/crews/*/inbox-history.jsonl',
        ],
    },
})

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
        return value
    }

    for (const child of Object.values(value)) {
        deepFreeze(child)
    }
    return Object.freeze(value)
}

