import type { ActivityEvent, OverviewData, OverviewRalphState, RalphPipelineState } from '../../tools/overview-viewer/src/types'
import type { RalphOverviewConfig } from './default-config.mjs'

export interface RalphArtifactBundle {
    kind: 'job' | 'group' | 'brainstorm'
    slug: string
    taskId?: string
    jobState?: unknown
    prd?: unknown
    notepadText?: string
    brainstormJson?: unknown
    reviewOpenCount?: Record<string, number | undefined>
    jobDirMarker?: true
    dirMtimeMs?: number
    parseError?: boolean
    parseErrorFile?: string
    parseErrorMessage?: string
}

export interface TouchedRalphEntry {
    kind: 'job' | 'group' | 'brainstorm'
    slug: string
}

export type TaskUpdate =
    | {
          action: 'upsert'
          taskId?: string
          kind: 'job' | 'group' | 'brainstorm'
          slug: string
          touched: TouchedRalphEntry[]
          byTaskId: Record<string, RalphPipelineState>
          newPipelineState?: RalphPipelineState
          unmatchedFragment: NonNullable<OverviewRalphState['unmatched']>
      }
    | {
          action: 'remove'
          taskId?: string
          kind: 'job' | 'group' | 'brainstorm'
          slug: string
          touched: TouchedRalphEntry[]
          unmatchedFragment: NonNullable<OverviewRalphState['unmatched']>
      }
    | {
          action: 'retain'
          taskId?: string
          kind: 'job' | 'group' | 'brainstorm'
          slug: string
          touched: TouchedRalphEntry[]
          unmatchedFragment: NonNullable<OverviewRalphState['unmatched']>
          error: string
      }

export function walkRalphState(options: {
    repoRoot: string
    config: RalphOverviewConfig
    generatedFromCommit: string
}): Promise<OverviewRalphState>

export function readBundleForSlug(options: {
    repoRoot: string
    config: RalphOverviewConfig
    kind: 'job' | 'group' | 'brainstorm'
    slug: string
}): RalphArtifactBundle | undefined

export function assembleStateFromBundles(options: {
    bundles: RalphArtifactBundle[]
    repoRoot: string
    config: RalphOverviewConfig
    generatedFromCommit?: string
}): OverviewRalphState

export function loadOverviewData(dataFile: string): OverviewData

export function deriveAffectedTaskUpdate(options: {
    repoRoot: string
    config: RalphOverviewConfig
    kind: 'job' | 'group' | 'brainstorm'
    slug: string
    currentState?: OverviewRalphState
    generatedFromCommit?: string
}): TaskUpdate

export function mergeAndWrite(options: {
    repoRoot: string
    config: RalphOverviewConfig
    currentState: OverviewRalphState
    updates: TaskUpdate[]
    generatedFromCommit?: string
}): Promise<{ state: OverviewRalphState; writtenAt: string; changedTaskIds: string[]; activityEvents: ActivityEvent[] }>

export function writeSidecar(options: {
    repoRoot: string
    config: RalphOverviewConfig
    state: OverviewRalphState
}): Promise<void>

export function atomicWriteFile(finalPath: string, contents: string): Promise<void>

export function resolveTaskMatch(options: {
    slug: string
    ralphOverrides: Record<string, string>
    taskIds: Set<string>
}): { taskId: string; matchSource: 'override' | 'slug-default' } | null

export function resolveCrossKindPrecedence(
    bundles: RalphArtifactBundle[],
): { winner: RalphArtifactBundle; shadowed: RalphArtifactBundle[] }

export function pickMostRecentByMtime(candidates: RalphArtifactBundle[]): RalphArtifactBundle
