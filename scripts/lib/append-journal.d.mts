export interface AppendJournalEntryOptions {
    repoRoot: string
    taskId: string
    ts: string
    prevStage: string
    newStage: string
    slug: string
}

export interface AppendJournalNoteOptions {
    repoRoot: string
    taskId: string
    ts: string
    note: string
}

export interface FormatJournalLineOptions {
    ts: string
    prevStage: string
    newStage: string
    slug: string
}

export function appendJournalEntry(options: AppendJournalEntryOptions): void

export function appendJournalNote(options: AppendJournalNoteOptions): void

export function formatJournalLine(options: FormatJournalLineOptions): string

export function assertSafeTaskId(taskId: string): void
