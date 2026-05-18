import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { CommandList } from '../components/CommandList'
import { linkBlockedOnHtml } from '../utils/warnings'
import { loadOverviewData } from './testData'

describe('CommandList', () => {
    it('renders one command row per task', () => {
        const data = loadOverviewData()
        const html = renderToStaticMarkup(<CommandList data={data} />)
        const rows = html.match(/<details class="cmd"/g) ?? []

        expect(rows).toHaveLength(data.tasks?.length ?? 0)
    })

    it('renders workstream, cadence, size, warning links, and spawn relationships', () => {
        const data = loadOverviewData()
        const html = renderToStaticMarkup(<CommandList data={data} />)

        expect(html).toContain('data-workstream="perf"')
        expect(html).toContain('data-size-bucket="small"')
        expect(html).toContain('data-cadence="periodic"')
        expect(html).toContain('class="cadence-chip')
        expect(html).toContain('class="pill-spawned-from"')
        expect(html).toContain('class="spawned-children"')

        const warningTask = data.tasks?.find((task) => task.command?.warnings?.length)
        const warning = warningTask?.command?.warnings?.[0]
        expect(warning).toBeDefined()
        expect(linkBlockedOnHtml(warning?.html ?? '', data.tasks?.map((task) => task.id) ?? [])).toContain('href="#cmd-mcp-discovery"')
    })
})
