import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { CopyToast } from '../components/CopyToast'
import { COPY_TOAST_DURATION_MS, createToastDispatcher } from '../hooks/useToast'
import { copyTextWithToast, formatCopiedToast } from '../utils/copyFeedback'

describe('copy toast feedback', () => {
    it('renders the toast text in a status surface', () => {
        const html = renderToStaticMarkup(<CopyToast text="Copied `perf-WS3` (2 KB)" />)

        expect(html).toContain('class="copy-toast"')
        expect(html).toContain('role="status"')
        expect(html).toContain('Copied `perf-WS3` (2 KB)')
    })

    it('renders nothing when no toast is active', () => {
        expect(renderToStaticMarkup(<CopyToast text={null} />)).toBe('')
    })

    it('formats copied task feedback with a kilobyte size', () => {
        expect(formatCopiedToast('perf-WS3', 'x'.repeat(1536))).toBe('Copied `perf-WS3` (1.5 KB)')
    })

    it('auto-dismisses useToast dispatches after 1.2s', () => {
        vi.useFakeTimers()
        const setCurrentToast = vi.fn()
        const dispatcher = createToastDispatcher(setCurrentToast)

        dispatcher.showToast('Copied `perf-WS3` (0.1 KB)')
        vi.advanceTimersByTime(COPY_TOAST_DURATION_MS - 1)
        expect(setCurrentToast).toHaveBeenCalledTimes(1)
        expect(setCurrentToast).toHaveBeenLastCalledWith('Copied `perf-WS3` (0.1 KB)')

        vi.advanceTimersByTime(1)
        expect(setCurrentToast).toHaveBeenLastCalledWith(null)
        vi.useRealTimers()
    })

    it('dispatches toast text on successful clipboard writes', async () => {
        const showToast = vi.fn()
        const write = vi.fn(async () => true)

        await expect(copyTextWithToast({ label: 'perf-WS3', text: 'pnpm test', showToast, write })).resolves.toBe(true)

        expect(write).toHaveBeenCalledWith('pnpm test')
        expect(showToast).toHaveBeenCalledWith('Copied `perf-WS3` (0.1 KB)')
    })

    it('does not render a toast when clipboard writes fail', async () => {
        const showToast = vi.fn()
        const write = vi.fn(async () => false)

        await expect(copyTextWithToast({ label: 'perf-WS3', text: 'pnpm test', showToast, write })).resolves.toBe(false)

        expect(showToast).not.toHaveBeenCalled()
    })
})
