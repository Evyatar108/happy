import type { RalphStage } from '../../tools/overview-viewer/src/types'

export const REVIEW_PHASES: readonly ['5a', '5b', '5.5', '6']
export const IMPLEMENTING_PHASES: readonly ['1', '2', '3', '4', '5c']

export function deriveRalphStage(bundle: {
    jobState?: unknown
    prd?: unknown
    brainstormJson?: unknown
    reviewOpenCount?: Record<string, number | undefined>
    jobDirMarker?: true
}): RalphStage
