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
    import type { OverviewRalphState } from '../types'
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
}
