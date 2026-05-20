export interface PrdStoryCarrier {
    id: string
    dependencies?: string[]
    passes?: boolean | string
}

export interface PrdCarrier {
    userStories: PrdStoryCarrier[]
    dependencies?: string[]
}

export function loadPrdsByTaskId(options: {
    repoRoot: string
    config: {
        dataFile: string
        ralphRoot: string
        ralphSubdirs: {
            jobs: string
            jobGroups: string
        }
    }
    overviewData?: {
        tasks?: Array<{ id?: string }>
        ralphOverrides?: Record<string, string>
    }
}): Record<string, PrdCarrier>
