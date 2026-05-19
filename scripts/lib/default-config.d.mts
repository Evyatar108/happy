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
    }
    lockFile: string
    watcher: {
        ignored: string[]
    }
}

export const codexuDefaultConfig: Readonly<RalphOverviewConfig>

