import { useEffect } from 'react'

import { navigateToCommand } from '../utils/commandNavigation'

export function useHashNav(expandTask: (taskId: string, open: boolean) => void) {
    useEffect(() => {
        const focusHash = () => {
            const hash = window.location.hash
            if (!hash.startsWith('#cmd-')) return
            navigateToCommand(hash.slice('#cmd-'.length), expandTask)
        }
        window.addEventListener('hashchange', focusHash)
        focusHash()
        return () => window.removeEventListener('hashchange', focusHash)
    }, [expandTask])
}
