import { useEffect, useState } from 'react'

function getTaskCount(): number {
    return window.OVERVIEW_DATA?.tasks?.length ?? 0
}

async function reloadOverviewData(): Promise<void> {
    const response = await fetch(`./overview-data.js?t=${Date.now()}`)
    const text = await response.text()
    new Function(text)()
}

export function App() {
    const [count, setCount] = useState(getTaskCount)

    useEffect(() => {
        if (!import.meta.hot) {
            return
        }

        const updateCount = async () => {
            await reloadOverviewData()
            setCount(getTaskCount())
        }

        import.meta.hot.on('overview-data:update', updateCount)
        return () => {
            import.meta.hot?.off('overview-data:update', updateCount)
        }
    }, [])

    return <h1>{count} tasks</h1>
}
