import type { OverviewData, OverviewRalphState } from '../../tools/overview-viewer/src/types'
import type { RalphOverviewConfig } from './default-config.mjs'
import type { PrdCarrier } from './load-prds-by-task-id.mjs'

export interface EmitDerivedArtifactsOptions {
    repoRoot: string
    config: RalphOverviewConfig
    state: OverviewRalphState
    overviewData: OverviewData
    prdsByTaskId?: Record<string, PrdCarrier>
    generatedFromCommit?: string
}

export function emitDerivedArtifacts(options?: EmitDerivedArtifactsOptions): Promise<{ runDurations: Record<string, number> }>
