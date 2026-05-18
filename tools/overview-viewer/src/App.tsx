import { useEffect, useState } from 'react'

import { CommandList } from './components/CommandList'
import type { OverviewData } from './types'

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
            <CommandList data={data} />
        </main>
    )
}
