import { useEffect } from 'react'

import { flashCommandElement } from '../utils/commandNavigation'

export function useHashNav(expandTask: (taskId: string, open: boolean) => void) {
    useEffect(() => {
        const focusHash = () => {
            const hash = window.location.hash
            if (!hash.startsWith('#cmd-')) return
            const taskId = hash.slice('#cmd-'.length)
            expandTask(taskId, true)
            const element = document.getElementById(`cmd-${taskId}`)
            element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            if (element) flashCommandElement(element)
        }
        window.addEventListener('hashchange', focusHash)
        focusHash()
        return () => window.removeEventListener('hashchange', focusHash)
    }, [expandTask])
}
