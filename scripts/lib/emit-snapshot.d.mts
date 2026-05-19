import type {
    DependencyGraph,
    OverviewData,
    OverviewRalphState,
    Recommendation,
    Snapshot,
} from '../../tools/overview-viewer/src/types'

export interface BuildSnapshotOptions {
    ralphState: OverviewRalphState
    overviewData: OverviewData
    recommendations?: Recommendation[]
    dependencyGraph?: DependencyGraph
    runDurations?: Record<string, number>
    generatedFromCommit?: string
}

export function buildSnapshot(options: BuildSnapshotOptions): Snapshot
