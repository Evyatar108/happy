import { useCallback, useEffect, useState } from 'react'

export const DENSITY_STORAGE_KEY = 'codexu-overview-density-v1'

export type Density = 'comfortable' | 'compact'

export function readDensityPreference(storage: Pick<Storage, 'getItem'> | undefined): Density {
    if (!storage) return 'comfortable'
    try {
        return storage.getItem(DENSITY_STORAGE_KEY) === 'compact' ? 'compact' : 'comfortable'
    } catch {
        return 'comfortable'
    }
}

export function writeDensityPreference(storage: Pick<Storage, 'setItem'> | undefined, density: Density): void {
    if (!storage) return
    try {
        storage.setItem(DENSITY_STORAGE_KEY, density)
    } catch {
        // localStorage can be unavailable under privacy settings; density still works for this render.
    }
}

function getLocalStorage(): Storage | undefined {
    return typeof window === 'undefined' ? undefined : window.localStorage
}

export function applyBodyDensityClass(body: { classList: Pick<DOMTokenList, 'toggle'> } | undefined, density: Density): void {
    body?.classList.toggle('compact', density === 'compact')
}

export function useDensity() {
    const [density, setDensity] = useState<Density>(() => readDensityPreference(getLocalStorage()))

    useEffect(() => {
        applyBodyDensityClass(typeof document === 'undefined' ? undefined : document.body, density)
        writeDensityPreference(getLocalStorage(), density)
    }, [density])

    const toggleDensity = useCallback(() => {
        setDensity((current) => (current === 'compact' ? 'comfortable' : 'compact'))
    }, [])

    return { density, toggleDensity }
}
