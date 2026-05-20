export interface OverviewWarning {
    className?: string
    html: string
}

export interface OverviewCommand {
    name?: string
    descriptionHtml: string
    warnings?: OverviewWarning[]
    planPrompt?: string | null
}

export type KanbanColumnName = 'ready' | 'soon' | 'blocked'

export interface KanbanCardData {
    column: KanbanColumnName | string
    cardClass?: string | null
    inlineStyle?: string | null
    html: string
    insertBeforeTaskId?: string
    order?: number
}

export interface OverviewTask {
    id: string
    scope?: string
    phase?: string
    status?: string
    lastTouchedAt?: string
    planOnly?: boolean
    mergeCommit?: string
    blocks?: string[]
    priority?: number
    kanbanCards?: KanbanCardData[]
    command?: OverviewCommand
}

export type RalphStage =
    | 'brainstorming'
    | 'brainstorm-ready'
    | 'planning'
    | 'plan-ready'
    | 'implementing'
    | 'reviewing'
    | 'review-fix'
    | 'replan-pending'
    | 'shipped'
    | 'blocked'

export type RalphEntryPath = 'brainstorm-first' | 'plan-direct' | 'manual-plan'

export interface RalphArtifacts {
    brainstormDir?: string
    planDraftFile?: string
    jobDir?: string
    groupDir?: string
    planFile?: string
    prdFile?: string
}

export interface RalphPipelineState {
    stage: RalphStage
    entryPath?: RalphEntryPath
    artifacts?: RalphArtifacts
    jobSlug?: string
    groupSlug?: string
    isParallel?: boolean
    matchSource?: 'overviewTaskId' | 'override' | 'slug-default'
    storyCompletion?: { total: number; passed: number; blocked: number; remaining: number }
    reviewOpenCount?: Record<string, number | undefined>
    hasPrdWorthy?: boolean
    terminalReason?: 'complete' | 'replan' | 'blocked'
    lastUpdatedAt?: string
    // Keep per-entry timestamps out of Plan 01 so sidecar idempotency strips only the top-level generatedAt.
}

export interface OverviewRalphState {
    generatedAt: string
    generatedFromCommit: string
    byTaskId: Record<string, RalphPipelineState>
    unmatched?: Array<{ kind: 'brainstorm' | 'job' | 'group'; slug: string; reason: string }>
    unmatchedSummary?: Record<string, number>
}

export function getOverviewRalphState(): OverviewRalphState {
    const emptyState = { generatedAt: '', generatedFromCommit: '', byTaskId: {} }
    if (typeof window === 'undefined') {
        return emptyState
    }
    return window.OVERVIEW_RALPH_STATE ?? emptyState
}

export interface PeriodicMeta {
    intervalDays?: number
    lastRunId?: string | null
    nextDueAt?: string | null
}

export interface RunRecord {
    id?: string
    taskId?: string
    ranAt?: string
    outcome?: string
    summary?: string
    commits?: string[]
}

export type PhaseTreeNodeData = PhaseTreeRawNode | PhaseTreeTaskRefNode | PhaseTreeSubPhaseNode

export interface PhaseTreeRawNode {
    kind: 'raw'
    html?: string
}

export interface PhaseTreeTaskRefNode {
    kind: 'task-ref'
    taskId?: string
    visibleText?: string
    state?: string
    trailingHtml?: string
}

export interface PhaseTreeSubPhaseNode {
    kind: 'sub-phase'
    id?: string
    title?: string
    headerHtml?: string
    collapsible?: boolean
    collapsibleSummary?: string | null
    nodes?: PhaseTreeNodeData[]
}

export interface PhaseTreeEntry {
    id?: string
    title?: string
    headerHtml?: string
    collapsible?: boolean
    collapsibleSummary?: string | null
    nodes?: PhaseTreeNodeData[]
}

export interface OverviewData {
    generatedAt?: string
    generatedFromCommit?: string
    tasks?: OverviewTask[]
    ralphOverrides?: Record<string, string>
    phaseTree?: PhaseTreeEntry[]
    cadence?: Record<string, string>
    effort?: Record<string, number>
    lastTouched?: Record<string, string>
    periodic?: Record<string, PeriodicMeta>
    risk?: Record<string, string>
    runs?: RunRecord[]
    sizeBucket?: Record<string, string>
    spawnedFrom?: Record<string, string>
    workstream?: Record<string, string>
}

export interface Recommendation {
    taskId: string
    score: number
    stage: RalphStage
    reasons: string[]
}

export interface DependencyGraph {
    nodes: Array<{
        id: string
        type: 'task' | 'story'
        taskId?: string
        storyId?: string
        stage?: RalphStage
    }>
    edges: Array<{
        from: string
        to: string
        type: 'blocks' | 'depends-on-story' | 'spawn' | 'depends-on-task'
    }>
}

export interface SnapshotTask extends OverviewTask {
    ralph?: RalphPipelineState
}

export interface Snapshot {
    generatedAt: string
    generatedFromCommit: string
    schemaVersion: 1
    tasks: SnapshotTask[]
    runs: RunRecord[]
    recommendations: Recommendation[]
    dependencyGraph: DependencyGraph
    runDurations: Record<string, number>
    unmatched: Array<{ kind: string; slug: string; reason: string }>
    unmatchedSummary: Record<string, number>
}

export interface ActivityEvent {
    ts: string
    slug: string
    kind: 'job' | 'group' | 'brainstorm'
    taskId?: string
    prevStage?: RalphStage | null
    newStage?: RalphStage | null
    changedFields: string[]
    reason: 'sync' | 'watch-event' | 'manual'
}
