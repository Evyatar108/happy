import type { DependencyGraph, OverviewData, OverviewRalphState } from '../../tools/overview-viewer/src/types'
import type { PrdCarrier } from './load-prds-by-task-id.mjs'

export interface DeriveDependencyGraphOptions {
    byTaskId?: OverviewRalphState['byTaskId']
    overviewData?: OverviewData
    prdsByTaskId?: Record<string, PrdCarrier>
    generatedFromCommit?: string
}

export function deriveDependencyGraph(options?: DeriveDependencyGraphOptions): DependencyGraph
