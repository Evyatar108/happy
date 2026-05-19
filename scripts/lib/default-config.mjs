export const codexuDefaultConfig = deepFreeze({
    dataFile: 'plans/overview-data.js',
    ralphRoot: '.ralph',
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
        activityMaxLines: 1000,
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

