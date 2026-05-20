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
        recommendationsJson: string
        dependencyGraphJson: string
        activityMaxLines: number
    }
    recommendations: {
        weights: {
            stageUrgency: number
            dependencyState: number
            freshness: number
            priority: number
        }
        topN: number
    }
    lockFile: string
    watcher: {
        ignored: string[]
    }
}

export const codexuDefaultConfig: Readonly<RalphOverviewConfig>

