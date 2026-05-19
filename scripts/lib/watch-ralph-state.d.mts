import type { OverviewRalphState } from '../../tools/overview-viewer/src/types'

export interface WatchWriteEvent {
    writtenAt: string
    changedTaskIds: string[]
}

export interface WatchStatus {
    /** Plan-AC shape: { running, pendingSlugs, queueDepth, lastTickAt? } */
    readonly running: boolean
    readonly pendingSlugs: string[]
    readonly queueDepth: number
    readonly lastTickAt?: string
    /** Legacy fields retained for debug callers and existing tests. */
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
