import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { CommandList } from './components/CommandList'
import { CopyToast } from './components/CopyToast'
import { Kanban } from './components/Kanban'
import { PhaseTree } from './components/PhaseTree'
import { DependenciesSection, Footnote, ParallelismSection } from './components/StaticSections'
import { FreshnessHint, KeyboardHelp, Layout, WhatsNewBanner } from './components/TopLevelSurfaces'
import { TodayPanel } from './components/TodayPanel'
import { Toolbar } from './components/Toolbar'
import { useBulkSelection } from './hooks/useBulkSelection'
import { useDensity } from './hooks/useDensity'
import { useHashNav } from './hooks/useHashNav'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useMultiAxisFilter } from './hooks/useMultiAxisFilter'
import { usePersistentExpanded } from './hooks/usePersistentExpanded'
import { useToast } from './hooks/useToast'
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
    const density = useDensity()
    const whatsNew = useWhatsNewSinceLastVisit(data)
    const toast = useToast()
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

    const activateWorkstream = useCallback((workstream: string) => {
        filter.toggleFilter('workstream', workstream)
        const filterDetails = document.querySelector<HTMLDetailsElement>('.toolbar-filters')
        if (filterDetails) filterDetails.open = true
    }, [filter])

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
                density={density.density}
                query={filter.query}
                searchRef={searchRef}
                selectedCount={bulkSelection.selectedTaskIds.size}
                setQuery={filter.setQuery}
                showToast={toast.showToast}
                toggleDensity={density.toggleDensity}
                toggleFilter={filter.toggleFilter}
            />
            <CopyToast text={toast.currentToast} />
            <KeyboardHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
            <p className="mental-model">
                <strong>Kanban</strong> to choose · <strong>Ralph commands</strong> to execute · <strong>Phase tree</strong> to orient
            </p>
            <Kanban data={data} visibleTaskIds={filter.visibleKanbanTaskIds} onJumpToCommand={(taskId) => navigateToCommand(taskId, expandedControls.setTaskExpanded)} />
            <CommandList
                changedTaskIds={whatsNew.changedTaskIds}
                data={data}
                expandedControls={expandedControls}
                onActivateWorkstream={activateWorkstream}
                onSelectTask={bulkSelection.toggleTask}
                query={filter.query}
                selectedTaskIds={bulkSelection.selectedTaskIds}
                showToast={toast.showToast}
                taskIdFilter={taskIdFilter}
                visibleTaskIds={filter.visibleTaskIds}
            />
            <PhaseTree data={data} />
            <ParallelismSection />
            <DependenciesSection />
            <Footnote />
        </Layout>
    )
}
