export interface RalphOverviewConfig {
    dataFile: string
    ralphRoot: string
    ralphSubdirs: {
        jobs: string
        jobGroups: string
        brainstorms: string
    }
    outputs: {
        sidecarJs: string
        sidecarJson: string
        snapshot: string
        activity: string
        activityBackup: string
        dataJson: string
        snapshotSchema: string
        tasksIndex: string
        activityMaxLines: number
    }
    lockFile: string
    watcher: {
        ignored: string[]
    }
}

export const codexuDefaultConfig: Readonly<RalphOverviewConfig>

