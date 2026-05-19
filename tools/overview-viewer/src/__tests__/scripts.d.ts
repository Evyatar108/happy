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
            snapshot: string
            activity: string
            activityBackup: string
            dataJson: string
            snapshotSchema: string
            tasksIndex: string
            activityMaxLines: number
        }
        lockFile: string
        watcher: {
            ignored: string[]
        }
    }

    export const codexuDefaultConfig: Readonly<RalphOverviewConfig>
}

declare module '../../../../scripts/lib/emit-snapshot.mjs' {
    import type { DependencyGraph, OverviewData, OverviewRalphState, Recommendation, Snapshot } from '../types'

    export interface BuildSnapshotOptions {
        ralphState: OverviewRalphState
        overviewData: OverviewData
        recommendations?: Recommendation[]
        dependencyGraph?: DependencyGraph
        runDurations?: Record<string, number>
        generatedFromCommit?: string
    }

    export function buildSnapshot(options: BuildSnapshotOptions): Snapshot
}

declare module '../../../../scripts/lib/emit-activity.mjs' {
    import type { ActivityEvent } from '../types'

    export interface AppendActivityOptions {
        activityPath: string
        activityBackupPath: string
        maxLines?: number
    }

    export function appendActivity(repoRoot: string, event: ActivityEvent, options: AppendActivityOptions): void
    export function rotateActivity(activityPath: string, activityBackupPath: string): void
}

declare module '../../../../scripts/lib/emit-tasks-index.mjs' {
    import type { Snapshot } from '../types'

    export function buildTasksIndex(snapshot: Snapshot): string
}

declare module '../../../../scripts/lib/emit-snapshot-schema.mjs' {
    export type JsonSchema = Record<string, unknown>

    export const SNAPSHOT_SCHEMA: JsonSchema
    export function writeSnapshotSchema(schemaPath: string): void
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
    import type { OverviewData, OverviewRalphState, RalphPipelineState } from '../types'
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

declare module '../../../../scripts/lib/sync-lock.mjs' {
    export interface SyncLockMetadata {
        pid: number
        process: string
        startedAt: string
    }

    export interface LockHandle {
        lockPath: string
        metadata: SyncLockMetadata
        release(): Promise<void>
        touch(): Promise<void>
    }

    export function acquireLock(options: {
        lockPath: string
        processLabel: string
        staleAfterMs?: number
    }): Promise<LockHandle>

    export function releaseLock(handle: LockHandle): Promise<void>
    export function touchLock(handle: LockHandle): Promise<void>
}

declare module '../../../../scripts/lib/watch-ralph-state.mjs' {
    import type { OverviewRalphState } from '../types'

    export interface WatchWriteEvent {
        writtenAt: string
        changedTaskIds: string[]
    }

    export interface WatchStatus {
        readonly currentState: OverviewRalphState | undefined
        readonly pendingChanges: Array<{ kind: 'job' | 'group' | 'brainstorm'; slug: string }>
        readonly consecutiveFailures: Record<string, number>
        readonly stopped: boolean
    }

    export interface WatchHandle {
        stop(): Promise<void>
        readonly status: WatchStatus
    }

    export function start(options: {
        repoRoot: string
        configPath?: string
        debounceMs?: number
        processLabel?: string
        onWrite?: (event: WatchWriteEvent) => void
        onError?: (error: unknown) => void
    }): Promise<WatchHandle>
}

declare module '../../../../scripts/sync-ralph-state.mjs' {
    import type { RalphOverviewConfig } from '../../../../scripts/lib/default-config.mjs'

    export function main(): Promise<void>
    export function parseArgs(argv: string[]): {
        repo?: string
        config?: string
        watch: boolean
        debounceMs?: number
    }
    export function parseDebounceMs(value: string): number
    export function runOneShot(options: { repoRoot: string; config: RalphOverviewConfig }): Promise<void>
    export function runWatchMode(options: { repoRoot: string; configPath?: string; debounceMs?: number }): Promise<void>
}
