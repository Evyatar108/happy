import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { Toolbar } from '../components/Toolbar'
import { applyBodyDensityClass, DENSITY_STORAGE_KEY, readDensityPreference, writeDensityPreference } from '../hooks/useDensity'
import { readRepoFile } from './testData'

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem'> {
    private values = new Map<string, string>()

    getItem(key: string): string | null {
        return this.values.get(key) ?? null
    }

    setItem(key: string, value: string): void {
        this.values.set(key, value)
    }
}

describe('density preference', () => {
    const activeFilters = {
        cadence: new Set<string>(),
        scope: new Set<string>(),
        size: new Set<string>(),
        status: new Set<string>(),
        workstream: new Set<string>(),
    }

    it('renders the toolbar density toggle with comfortable and compact states', () => {
        const toolbarProps = { activeFilters, copyText: '', helpOpen: false, onHelpOpenChange: () => undefined, query: '', searchRef: { current: null }, selectedCount: 0, setQuery: () => undefined, toggleDensity: () => undefined, toggleFilter: () => undefined }
        const comfortable = renderToStaticMarkup(
            createElement(Toolbar, { ...toolbarProps, density: 'comfortable' }),
        )
        const compact = renderToStaticMarkup(
            createElement(Toolbar, { ...toolbarProps, density: 'compact' }),
        )

        expect(comfortable).toContain('class="density-toggle"')
        expect(comfortable).toContain('aria-pressed="false"')
        expect(comfortable).toContain('Comfortable')
        expect(compact).toContain('aria-pressed="true"')
        expect(compact).toContain('Compact')
    })

    it('round-trips compact mode through the versioned localStorage key', () => {
        const storage = new MemoryStorage()
        writeDensityPreference(storage, 'compact')

        expect(storage.getItem(DENSITY_STORAGE_KEY)).toBe('compact')
        expect(readDensityPreference(storage)).toBe('compact')
    })

    it('defaults to comfortable when no stored value exists', () => {
        expect(readDensityPreference(new MemoryStorage())).toBe('comfortable')
        expect(readDensityPreference(undefined)).toBe('comfortable')
    })

    it('ignores older density keys and malformed values', () => {
        const storage = new MemoryStorage()
        storage.setItem('codexu-overview-density', 'compact')
        storage.setItem(DENSITY_STORAGE_KEY, 'dense')

        expect(readDensityPreference(storage)).toBe('comfortable')
    })

    it('adds and removes the compact class on the body', () => {
        const toggle = vi.fn()
        const body = { classList: { toggle } }

        applyBodyDensityClass(body, 'compact')
        applyBodyDensityClass(body, 'comfortable')

        expect(toggle).toHaveBeenNthCalledWith(1, 'compact', true)
        expect(toggle).toHaveBeenNthCalledWith(2, 'compact', false)
    })

    it('defines compact row spacing and hides summary subtext', () => {
        const styles = readRepoFile('tools/overview-viewer/src/styles.css')

        expect(styles).toContain('body.compact .cmd { padding: 4px 8px; }')
        expect(styles).toContain('body.compact .cmd-desc,')
        expect(styles).toContain('body.compact .sub { display: none; }')
    })
})
