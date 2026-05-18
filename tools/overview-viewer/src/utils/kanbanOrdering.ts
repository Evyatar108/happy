import type { KanbanCardData, KanbanColumnName, OverviewTask } from '../types'

export interface OrderedKanbanCard {
    task: OverviewTask
    card: KanbanCardData
}

const COLUMNS = new Set<KanbanColumnName>(['ready', 'soon', 'blocked'])

function isKanbanColumn(column: string): column is KanbanColumnName {
    return COLUMNS.has(column as KanbanColumnName)
}

function appendCard(column: OrderedKanbanCard[], item: OrderedKanbanCard): void {
    if (item.card.insertBeforeTaskId) {
        const anchorIndex = column.findIndex((existing) => existing.task.id === item.card.insertBeforeTaskId)
        if (anchorIndex >= 0) {
            column.splice(anchorIndex, 0, item)
            return
        }
    }
    column.push(item)
}

export function orderedKanbanCardsByColumn(tasks: OverviewTask[]): Record<KanbanColumnName, OrderedKanbanCard[]> {
    const columns: Record<KanbanColumnName, OrderedKanbanCard[]> = {
        ready: [],
        soon: [],
        blocked: [],
    }
    const kanbanCards: OrderedKanbanCard[] = []

    tasks.forEach((task) => {
        const cards = task.kanbanCards ?? []
        cards.forEach((card) => {
            kanbanCards.push({ task, card })
        })
    })

    kanbanCards
        .sort((a, b) => {
            const ao = typeof a.card.order === 'number' ? a.card.order : Number.MAX_SAFE_INTEGER
            const bo = typeof b.card.order === 'number' ? b.card.order : Number.MAX_SAFE_INTEGER
            return ao - bo
        })
        .forEach((item) => {
            if (!isKanbanColumn(item.card.column)) return
            if (typeof item.card.order === 'number') columns[item.card.column].push(item)
            else appendCard(columns[item.card.column], item)
        })

    return columns
}

export function countKanbanCards(tasks: OverviewTask[]): number {
    return tasks.reduce((count, task) => count + (task.kanbanCards?.length ?? 0), 0)
}
