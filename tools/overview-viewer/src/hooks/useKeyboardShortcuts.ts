import { useEffect } from 'react'

export interface KeyboardShortcutHandlers {
    clearSearch: () => void
    closeHelp: () => void
    collapseAll: () => void
    expandAll: () => void
    focusSearch: () => void
    isHelpOpen: () => boolean
    toggleHelp: () => void
}

export function handleKeyboardShortcut(event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'preventDefault' | 'target'>, handlers: KeyboardShortcutHandlers): boolean {
    if (event.ctrlKey || event.altKey || event.metaKey) return false
    const target = event.target as { tagName?: string; isContentEditable?: boolean } | null
    const tagName = target?.tagName
    const inField = tagName === 'INPUT' || tagName === 'TEXTAREA' || target?.isContentEditable === true

    if (event.key === '/' && !inField) {
        event.preventDefault()
        handlers.focusSearch()
        return true
    }

    if (event.key === 'Escape') {
        if (handlers.isHelpOpen()) {
            handlers.closeHelp()
            return true
        }
        if (inField) {
            handlers.clearSearch()
            return true
        }
    }

    if (inField) return false
    if (event.key === 'e') {
        handlers.expandAll()
        return true
    }
    if (event.key === 'c') {
        handlers.collapseAll()
        return true
    }
    if (event.key === '?') {
        handlers.toggleHelp()
        return true
    }
    return false
}

export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers) {
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            handleKeyboardShortcut(event, handlers)
        }
        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
    }, [handlers])
}
