import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { countVisibleKanbanCardsByColumn, Kanban } from '../components/Kanban'
import { countKanbanCards, orderedKanbanCardsByColumn } from '../utils/kanbanOrdering'
import { loadOverviewData } from './testData'

describe('Kanban', () => {
    it('renders the shipped kanban cards with metadata enrichments', () => {
        const data = loadOverviewData()
        const html = renderToStaticMarkup(<Kanban data={data} onJumpToCommand={() => undefined} />)
        const firstTaskWithCard = data.tasks?.find((task) => (task.kanbanCards?.length ?? 0) > 0)

        expect(countKanbanCards(data.tasks ?? [])).toBe(33)
        expect(html.match(/data-rendered-task="true"/g)).toHaveLength(data.tasks?.flatMap((task) => task.kanbanCards ?? []).length ?? 0)
        expect(html).toContain('id="kanban-ready"')
        expect(html).toContain('id="kanban-soon"')
        expect(html).toContain('id="kanban-blocked"')
        expect(html).toContain(`id="kanban-card-${firstTaskWithCard?.id}-0"`)
        expect(html).toContain('class="cmd-badge b-')
        expect(html).toContain('kanban-phase-pill')
        expect(html).toContain('class="xref-link"')
        expect(html).toContain('href="#cmd-')
        expect(html).toContain('data-workstream="perf"')
        expect(html).toContain('style="border-color:var(--ok);opacity:0.8"')
    })

    it('renders per-column count chips from the visible kanban cards', () => {
        const data = loadOverviewData()
        const columns = orderedKanbanCardsByColumn(data.tasks ?? [])
        const nonReadyTaskIds = new Set([...columns.soon, ...columns.blocked].map((item) => item.task.id))
        const readyOnlyTaskIds = columns.ready.map((item) => item.task.id).filter((taskId) => !nonReadyTaskIds.has(taskId))
        const visibleTaskIds = new Set(readyOnlyTaskIds.slice(0, 2))
        const counts = countVisibleKanbanCardsByColumn(columns, visibleTaskIds)
        const html = renderToStaticMarkup(<Kanban data={data} visibleTaskIds={visibleTaskIds} onJumpToCommand={() => undefined} />)

        expect(counts.ready).toBe(2)
        expect(counts.soon).toBe(0)
        expect(counts.blocked).toBe(0)
        expect(html).toContain(`(${counts.ready + counts.soon + counts.blocked} cards)`)
        expect(html).toContain('<span class="sc sc-ready">ready 2</span>')
        expect(html).toContain('<span class="sc sc-inprogress">soon 0</span>')
        expect(html).toContain('<span class="sc sc-blocked">blocked 0</span>')
    })

    it('preserves trusted card HTML fragments', () => {
        const data = loadOverviewData()
        const card = data.tasks?.flatMap((task) => task.kanbanCards ?? []).find((item) => item.html.includes('Realtime sync perf'))
        const html = renderToStaticMarkup(<Kanban data={data} onJumpToCommand={() => undefined} />)

        expect(card).toBeDefined()
        expect(html).toContain('Realtime sync perf')
        expect(html).toContain('plan §WS3')
    })
})
