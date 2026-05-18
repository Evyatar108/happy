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
    taskId?: string
    ranAt?: string
    summary?: string
    commits?: string[]
}

export interface OverviewData {
    generatedAt?: string
    generatedFromCommit?: string
    tasks?: OverviewTask[]
    cadence?: Record<string, string>
    periodic?: Record<string, PeriodicMeta>
    runs?: RunRecord[]
    sizeBucket?: Record<string, string>
    spawnedFrom?: Record<string, string>
    workstream?: Record<string, string>
}
