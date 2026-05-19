export {}

declare module '../../../../scripts/lib/default-config.mjs' {
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
}

declare module '../../../../scripts/lib/resolve-config.mjs' {
    import type { RalphOverviewConfig } from '../../../../scripts/lib/default-config.mjs'

    export function loadConfig(options: { repoRoot: string; configPath?: string }): Readonly<RalphOverviewConfig>
}

declare module '../../../../scripts/lib/derive-ralph-stage.mjs' {
    import type { RalphStage } from '../types'

    export const REVIEW_PHASES: readonly ['5a', '5b', '5.5', '6']
    export const IMPLEMENTING_PHASES: readonly ['1', '2', '3', '4', '5c']

    export function deriveRalphStage(bundle: {
        jobState?: unknown
        prd?: unknown
        brainstormJson?: unknown
        reviewOpenCount?: Record<string, number | undefined>
        jobDirMarker?: true
    }): RalphStage
}

declare module '../../../../scripts/lib/sync-core.mjs' {
    import type { OverviewRalphState, RalphPipelineState } from '../types'
    import type { RalphOverviewConfig } from '../../../../scripts/lib/default-config.mjs'

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
    }): Promise<{ state: OverviewRalphState; writtenAt: string; changedTaskIds: string[] }>

    export function writeSidecar(options: {
        repoRoot: string
        config: RalphOverviewConfig
        state: OverviewRalphState
    }): Promise<void>

    export function resolveCrossKindPrecedence(
        bundles: RalphArtifactBundle[],
    ): { winner: RalphArtifactBundle; shadowed: RalphArtifactBundle[] }
    export function pickMostRecentByMtime(candidates: RalphArtifactBundle[]): RalphArtifactBundle
}
