import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { DependenciesSection, Footnote, ParallelismSection } from '../components/StaticSections'
import { FreshnessHint, KeyboardHelp, UrlFilterBanner, WhatsNewBanner } from '../components/TopLevelSurfaces'
import { TodayPanel } from '../components/TodayPanel'
import { buildBulkCopyText } from '../hooks/useBulkSelection'
import { handleKeyboardShortcut } from '../hooks/useKeyboardShortcuts'
import { changedTasksSinceLastVisit, computeSeenTimestamp, LAST_VISIT_STORAGE_KEY } from '../utils/whatsNew'
import { loadOverviewData } from './testData'

describe('top-level overview surfaces', () => {
    it('renders TodayPanel, freshness, static sections, URL banner, and keyboard help structure', () => {
        const data = loadOverviewData()
        const html = renderToStaticMarkup(
            <>
                <FreshnessHint data={data} />
                <TodayPanel data={data} nowMs={Date.parse('2026-05-14T22:00:00Z')} />
                <UrlFilterBanner taskIdFilter={new Set(['perf-WS3', 'polish-Fs'])} />
                <KeyboardHelp open={true} onOpenChange={() => undefined} />
                <ParallelismSection />
                <DependenciesSection />
                <Footnote />
            </>,
        )

        expect(html).toContain('id="gen-sha"')
        expect(html).toContain('d279d49d')
        expect(html).toContain('today-running')
        expect(html).toContain('Recently shipped (7d):')
        expect(html).toContain('URL filter active')
        expect(html).toContain('Keyboard shortcuts')
        expect(html).toContain('Parallelism — what can run together')
        expect(html).toContain('Dependencies — order gotchas')
        expect(html).toContain('Sync contract:')
    })

    it('computes what changed since last visit and max-of-data seen timestamp', () => {
        const data = loadOverviewData()
        const changed = changedTasksSinceLastVisit(data, '2026-05-13T00:00:00Z')
        expect(changed.length).toBeGreaterThan(0)
        expect(computeSeenTimestamp(data.lastTouched, Date.parse('2026-05-01T00:00:00Z'))).toBe('2026-05-14T20:00:00.000Z')

        const html = renderToStaticMarkup(
            <WhatsNewBanner changedTasks={changed.slice(0, 2)} lastVisit="2026-05-13T00:00:00Z" markAllSeen={() => undefined} />,
        )
        expect(html).toContain('whatsnew-banner')
        expect(html).toContain('Mark all seen')
        expect(LAST_VISIT_STORAGE_KEY).toBe('codexu-overview-last-visit-v1')
    })

    it('builds bulk-copy text in task order', () => {
        const data = loadOverviewData()
        const ids = new Set([data.tasks?.[2]?.id ?? '', data.tasks?.[0]?.id ?? ''])
        const text = buildBulkCopyText(data.tasks ?? [], ids)
        expect(text.indexOf(`# === ${data.tasks?.[0]?.id} ===`)).toBeLessThan(text.indexOf(`# === ${data.tasks?.[2]?.id} ===`))
    })

    it('handles keyboard shortcuts without duplicate subscription state', () => {
        const handlers = {
            clearSearch: vi.fn(),
            closeHelp: vi.fn(),
            collapseAll: vi.fn(),
            expandAll: vi.fn(),
            focusSearch: vi.fn(),
            isHelpOpen: () => true,
            toggleHelp: vi.fn(),
        }

        expect(handleKeyboardShortcut({ altKey: false, ctrlKey: false, key: '?', metaKey: false, preventDefault: vi.fn(), target: null }, { ...handlers, isHelpOpen: () => false })).toBe(true)
        expect(handleKeyboardShortcut({ altKey: false, ctrlKey: false, key: 'Escape', metaKey: false, preventDefault: vi.fn(), target: null }, handlers)).toBe(true)
        expect(handlers.closeHelp).toHaveBeenCalledTimes(1)
        expect(handleKeyboardShortcut({ altKey: false, ctrlKey: false, key: 'e', metaKey: false, preventDefault: vi.fn(), target: null }, handlers)).toBe(true)
        expect(handlers.expandAll).toHaveBeenCalledTimes(1)
    })
})
