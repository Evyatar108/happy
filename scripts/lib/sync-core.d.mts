import type { OverviewRalphState } from '../../tools/overview-viewer/src/types'
import type { RalphOverviewConfig } from './default-config.mjs'

export interface RalphArtifactBundle {
    kind: 'job' | 'group' | 'brainstorm'
    slug: string
    taskId?: string
    jobState?: unknown
    prd?: unknown
    brainstormJson?: unknown
    reviewOpenCount?: Record<string, number | undefined>
    jobDirMarker?: true
    dirMtimeMs?: number
}

export function walkRalphState(options: {
    repoRoot: string
    config: RalphOverviewConfig
    generatedFromCommit: string
}): Promise<OverviewRalphState>

export function writeSidecar(options: {
    repoRoot: string
    config: RalphOverviewConfig
    state: OverviewRalphState
}): Promise<void>

export function resolveCrossKindPrecedence(
    bundles: RalphArtifactBundle[],
): { winner: RalphArtifactBundle; shadowed: RalphArtifactBundle[] }

export function pickMostRecentByMtime(candidates: RalphArtifactBundle[]): RalphArtifactBundle
