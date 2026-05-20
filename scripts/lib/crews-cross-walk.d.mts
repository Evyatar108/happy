import type { CrewSessionRef, OverviewData, OverviewRalphState, RalphStage } from '../../tools/overview-viewer/src/types'

export interface DiscoverCrewSessionsOptions {
    repoRoot: string
    ralphState: OverviewRalphState
    overviewData: OverviewData
    crewsRoot: string
    now?: Date | string
    logger?: { warn?: (message: string) => void }
}

export function discoverCrewSessions(options: DiscoverCrewSessionsOptions): Map<string, Partial<Record<RalphStage, CrewSessionRef[]>>>
