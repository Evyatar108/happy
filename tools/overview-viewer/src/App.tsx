import { useEffect, useState } from 'react'

import { CommandList } from './components/CommandList'
import { Kanban } from './components/Kanban'
import { usePersistentExpanded } from './hooks/usePersistentExpanded'
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
    const expandedControls = usePersistentExpanded()

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

    const count = data.tasks?.length ?? 0

    return (
        <main>
            <h1>{count} tasks</h1>
            <p className="mental-model">
                <strong>Kanban</strong> to choose · <strong>Ralph commands</strong> to execute · <strong>Phase tree</strong> to orient
            </p>
            <Kanban data={data} onJumpToCommand={(taskId) => navigateToCommand(taskId, expandedControls.setTaskExpanded)} />
            <CommandList data={data} expandedControls={expandedControls} />
        </main>
    )
}
