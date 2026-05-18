import { describe, expect, it } from 'vitest'

import { DETAILS_STORAGE_KEY, readExpandedState, writeExpandedState } from '../hooks/usePersistentExpanded'

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem'> {
    private values = new Map<string, string>()

    getItem(key: string): string | null {
        return this.values.get(key) ?? null
    }

    setItem(key: string, value: string): void {
        this.values.set(key, value)
    }
}

describe('persistent expanded state', () => {
    it('reads and writes the v2 localStorage details key', () => {
        const storage = new MemoryStorage()
        writeExpandedState(storage, { 'cmd-perf-WS3': true })

        expect(storage.getItem(DETAILS_STORAGE_KEY)).toBe('{"cmd-perf-WS3":true}')
        expect(readExpandedState(storage)).toEqual({ 'cmd-perf-WS3': true })
    })

    it('falls back to an empty state for invalid stored JSON', () => {
        const storage = new MemoryStorage()
        storage.setItem(DETAILS_STORAGE_KEY, '{nope')

        expect(readExpandedState(storage)).toEqual({})
    })
})
