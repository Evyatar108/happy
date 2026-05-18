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
    kanbanCards?: KanbanCardData[]
    command?: OverviewCommand
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
