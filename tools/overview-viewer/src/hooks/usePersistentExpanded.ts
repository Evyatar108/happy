import { useCallback, useMemo, useState } from 'react'

export const DETAILS_STORAGE_KEY = 'codexu-overview-details-state-v2'

export type ExpandedState = Record<string, boolean>

export function readExpandedState(storage: Pick<Storage, 'getItem'> | undefined): ExpandedState {
    if (!storage) return {}
    try {
        const parsed = JSON.parse(storage.getItem(DETAILS_STORAGE_KEY) || '{}')
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        return {}
    }
}

export function writeExpandedState(storage: Pick<Storage, 'setItem'> | undefined, state: ExpandedState): void {
    if (!storage) return
    try {
        storage.setItem(DETAILS_STORAGE_KEY, JSON.stringify(state))
    } catch {
        // localStorage can be unavailable under privacy settings; expansion still works for this render.
    }
}

function getLocalStorage(): Storage | undefined {
    return typeof window === 'undefined' ? undefined : window.localStorage
}

function detailsKey(id: string): string {
    return id.startsWith('cmd-') ? id : `cmd-${id}`
}

export function usePersistentExpanded() {
    const [expanded, setExpanded] = useState<ExpandedState>(() => readExpandedState(getLocalStorage()))

    const setTaskExpanded = useCallback((id: string, open: boolean) => {
        setExpanded((current) => {
            const next = { ...current, [detailsKey(id)]: open }
            writeExpandedState(getLocalStorage(), next)
            return next
        })
    }, [])

    const setAllExpanded = useCallback((ids: string[], open: boolean) => {
        setExpanded((current) => {
            const next = { ...current }
            ids.forEach((id) => {
                next[detailsKey(id)] = open
            })
            writeExpandedState(getLocalStorage(), next)
            return next
        })
    }, [])

    return useMemo(
        () => ({
            expanded,
            isExpanded: (id: string) => expanded[detailsKey(id)] === true,
            setAllExpanded,
            setTaskExpanded,
        }),
        [expanded, setAllExpanded, setTaskExpanded],
    )
}
