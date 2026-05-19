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

