import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { CommandList } from './components/CommandList'
import { Kanban } from './components/Kanban'
import { PhaseTree } from './components/PhaseTree'
import { DependenciesSection, Footnote, ParallelismSection } from './components/StaticSections'
import { FreshnessHint, KeyboardHelp, Layout, UrlFilterBanner, WhatsNewBanner } from './components/TopLevelSurfaces'
import { TodayPanel } from './components/TodayPanel'
import { Toolbar } from './components/Toolbar'
import { useBulkSelection } from './hooks/useBulkSelection'
import { useHashNav } from './hooks/useHashNav'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useMultiAxisFilter } from './hooks/useMultiAxisFilter'
import { usePersistentExpanded } from './hooks/usePersistentExpanded'
import { useUrlFilter } from './hooks/useUrlFilter'
import { useWhatsNewSinceLastVisit } from './hooks/useWhatsNewSinceLastVisit'
import type { OverviewData } from './types'
import { navigateToCommand } from './utils/commandNavigation'

function getOverviewData(): OverviewData {
    return window.OVERVIEW_DATA ?? {}
}

async function reloadOverviewData(): Promise<void> {
    const response = await fetch(`./overview-data.js?t=${Date.now()}`)
    const text = await response.text()
    new Function(text)()
}

export function App() {
    const [data, setData] = useState(getOverviewData)
    const [helpOpen, setHelpOpen] = useState(false)
    const searchRef = useRef<HTMLInputElement>(null)
    const expandedControls = usePersistentExpanded()
    const taskIdFilter = useUrlFilter()
    const filter = useMultiAxisFilter(data, taskIdFilter)
    const bulkSelection = useBulkSelection(data.tasks ?? [])
    const whatsNew = useWhatsNewSinceLastVisit(data)
    useHashNav(expandedControls.setTaskExpanded)

    useEffect(() => {
        if (!import.meta.hot) {
            return
        }

        const updateCount = async () => {
            await reloadOverviewData()
            setData(getOverviewData())
        }

        import.meta.hot.on('overview-data:update', updateCount)
        return () => {
            import.meta.hot?.off('overview-data:update', updateCount)
        }
    }, [])

    const taskIds = useMemo(() => (data.tasks ?? []).map((task) => task.id), [data.tasks])
    const setAllDetails = useCallback(
        (open: boolean) => {
            expandedControls.setAllExpanded(taskIds, open)
            if (typeof document !== 'undefined') document.querySelectorAll('details').forEach((details) => { details.open = open })
        },
        [expandedControls, taskIds],
    )

    useKeyboardShortcuts({
        clearSearch: () => filter.setQuery(''),
        closeHelp: () => setHelpOpen(false),
        collapseAll: () => setAllDetails(false),
        expandAll: () => setAllDetails(true),
        focusSearch: () => {
            searchRef.current?.focus()
            searchRef.current?.select()
        },
        isHelpOpen: () => helpOpen,
        toggleHelp: () => setHelpOpen((open) => !open),
    })

    return (
        <Layout>
            <h1>codexu — plan overview</h1>
            <FreshnessHint data={data} />
            <TodayPanel data={data} />
            <WhatsNewBanner changedTasks={whatsNew.changedTasks} lastVisit={whatsNew.lastVisit} markAllSeen={whatsNew.markAllSeen} />
            <Toolbar
                activeFilters={filter.activeFilters}
                copyText={bulkSelection.copyText}
                query={filter.query}
                searchRef={searchRef}
                selectedCount={bulkSelection.selectedTaskIds.size}
                setQuery={filter.setQuery}
                toggleFilter={filter.toggleFilter}
            />
            <KeyboardHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
            <p className="mental-model">
                <strong>Kanban</strong> to choose · <strong>Ralph commands</strong> to execute · <strong>Phase tree</strong> to orient
            </p>
            <Kanban data={data} visibleTaskIds={filter.visibleKanbanTaskIds} onJumpToCommand={(taskId) => navigateToCommand(taskId, expandedControls.setTaskExpanded)} />
            <details className="section sec-cmds">
                <summary className="section-head">Ralph commands — click to expand, button to copy <span className="section-counts" id="counts-cmds">({data.tasks?.length ?? 0} commands)</span></summary>
                <div className="sub" style={{ marginBottom: 12 }}>
                    Self-contained <code>/plan-with-ralph</code> prompts mirrored from <code>plans/parallel-assignments.md</code>. Click a row to reveal the full command and copy with one click. Status badge reflects current state.
                </div>
                <UrlFilterBanner taskIdFilter={taskIdFilter} />
                <CommandList
                    changedTaskIds={whatsNew.changedTaskIds}
                    data={data}
                    expandedControls={expandedControls}
                    onSelectTask={bulkSelection.toggleTask}
                    selectedTaskIds={bulkSelection.selectedTaskIds}
                    visibleTaskIds={filter.visibleTaskIds}
                />
            </details>
            <PhaseTree data={data} />
            <ParallelismSection />
            <DependenciesSection />
            <Footnote />
        </Layout>
    )
}
