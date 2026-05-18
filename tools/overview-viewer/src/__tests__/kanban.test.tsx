import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Kanban } from '../components/Kanban'
import { countKanbanCards } from '../utils/kanbanOrdering'
import { loadOverviewData } from './testData'

describe('Kanban', () => {
    it('renders the shipped kanban cards with metadata enrichments', () => {
        const data = loadOverviewData()
        const html = renderToStaticMarkup(<Kanban data={data} onJumpToCommand={() => undefined} />)

        expect(countKanbanCards(data.tasks ?? [])).toBe(33)
        expect(html.match(/data-rendered-task="true"/g)).toHaveLength(data.tasks?.flatMap((task) => task.kanbanCards ?? []).length ?? 0)
        expect(html).toContain('id="kanban-ready"')
        expect(html).toContain('id="kanban-soon"')
        expect(html).toContain('id="kanban-blocked"')
        expect(html).toContain('class="cmd-badge b-')
        expect(html).toContain('kanban-phase-pill')
        expect(html).toContain('class="xref-link"')
        expect(html).toContain('href="#cmd-')
        expect(html).toContain('data-workstream="perf"')
        expect(html).toContain('style="border-color:var(--ok);opacity:0.8"')
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
