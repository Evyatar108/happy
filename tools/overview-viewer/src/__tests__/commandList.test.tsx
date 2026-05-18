import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { CommandList, countVisibleTasksByOrderBucket } from '../components/CommandList'
import { orderBucketForTask } from '../utils/taskClassification'
import { linkBlockedOnHtml } from '../utils/warnings'
import { loadOverviewData } from './testData'

const expandedControls = {
    expanded: {},
    isExpanded: () => false,
    setAllExpanded: () => undefined,
    setTaskExpanded: () => undefined,
}

describe('CommandList', () => {
    it('renders one command row per task', () => {
        const data = loadOverviewData()
        const html = renderToStaticMarkup(<CommandList data={data} expandedControls={expandedControls} />)
        const rows = html.match(/<details class="cmd"/g) ?? []
        const bodies = html.match(/<div class="cmd-body"><div class="cmd-body-inner">/g) ?? []

        expect(rows).toHaveLength(data.tasks?.length ?? 0)
        expect(bodies).toHaveLength(data.tasks?.length ?? 0)
        expect(html).toContain('id="counts-cmds"')
    })

    it('renders phase-bucket count chips from the visible task set', () => {
        const data = loadOverviewData()
        const visibleTasks = (data.tasks ?? []).filter((task) => orderBucketForTask(task) === 'ready').slice(0, 3)
        const visibleTaskIds = new Set(visibleTasks.map((task) => task.id))
        const counts = countVisibleTasksByOrderBucket(data.tasks ?? [], visibleTaskIds)
        const html = renderToStaticMarkup(<CommandList data={data} expandedControls={expandedControls} visibleTaskIds={visibleTaskIds} />)

        expect(counts.ready).toBe(3)
        expect(counts.brainstorm).toBe(0)
        expect(counts.inprogress).toBe(0)
        expect(counts.shipped).toBe(0)
        expect(counts.closed).toBe(0)
        expect(html).toContain('(3 commands)')
        expect(html).toContain('<span class="sc sc-ready">brainstorm 0</span>')
        expect(html).toContain('<span class="sc sc-inprogress">in progress 0</span>')
        expect(html).toContain('<span class="sc sc-ready">ready 3</span>')
        expect(html).toContain('<span class="sc sc-closed">shipped 0</span>')
        expect(html).toContain('<span class="sc sc-closed">closed 0</span>')
    })

    it('renders workstream, cadence, size, warning links, and spawn relationships', () => {
        const data = loadOverviewData()
        const html = renderToStaticMarkup(<CommandList data={data} expandedControls={expandedControls} />)

        expect(html).toContain('data-workstream="perf"')
        expect(html).toContain('data-size-bucket="small"')
        expect(html).toContain('data-cadence="periodic"')
        expect(html).toContain('class="cadence-chip')
        expect(html).toContain('class="pill-spawned-from"')
        expect(html).toContain('class="spawned-children"')
        expect(html).toContain('class="run-history"')

        const warningTask = data.tasks?.find((task) => task.command?.warnings?.length)
        const warning = warningTask?.command?.warnings?.[0]
        expect(warning).toBeDefined()
        expect(linkBlockedOnHtml(warning?.html ?? '', data.tasks?.map((task) => task.id) ?? [])).toContain('href="#cmd-mcp-discovery"')
    })

    it('highlights active search matches in command names and descriptions', () => {
        const data = loadOverviewData()
        const html = renderToStaticMarkup(<CommandList data={data} expandedControls={expandedControls} query="perf" />)

        expect(html).toContain('<span class="cmd-name"><mark class="search-match">perf</mark>')
        expect(html).toContain('<span class="cmd-desc">Realtime <mark class="search-match">perf</mark>')
    })

    it('removes search match markup when the query is cleared', () => {
        const data = loadOverviewData()
        const html = renderToStaticMarkup(<CommandList data={data} expandedControls={expandedControls} query="" />)

        expect(html).not.toContain('class="search-match"')
    })
})
