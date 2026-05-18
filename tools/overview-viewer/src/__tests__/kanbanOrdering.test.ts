import { describe, expect, it } from 'vitest'

import type { OverviewTask } from '../types'
import { orderedKanbanCardsByColumn } from '../utils/kanbanOrdering'

function task(id: string, order?: number, insertBeforeTaskId?: string): OverviewTask {
    return {
        id,
        kanbanCards: [
            {
                column: 'soon',
                html: `<div class="card-title">${id}</div><div class="card-meta"></div>`,
                order,
                insertBeforeTaskId,
            },
        ],
    }
}

describe('orderedKanbanCardsByColumn', () => {
    it('sorts numeric order ascending before applying insertBeforeTaskId fallback', () => {
        const columns = orderedKanbanCardsByColumn([
            task('fallback-after'),
            task('third', 30),
            task('first', 10),
            task('fallback-before-third', undefined, 'third'),
            task('second', 20),
        ])

        expect(columns.soon.map((item) => item.task.id)).toEqual(['first', 'second', 'fallback-before-third', 'third', 'fallback-after'])
    })
})
