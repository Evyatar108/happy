import { describe, expect, it, vi } from 'vitest'

import { COMMAND_FLASH_DURATION_MS, navigateToCommand } from '../utils/commandNavigation'
import { parseInlineStyle } from '../utils/inlineStyleParser'

describe('kanban interaction helpers', () => {
    it('sets the command hash, expands the row, and requests a scroll', () => {
        const expandTask = vi.fn()
        const scrollIntoView = vi.fn()
        const classList = { add: vi.fn(), remove: vi.fn() }
        const win = {
            location: { hash: '' },
            document: {
                getElementById: vi.fn(() => ({ classList, scrollIntoView })),
            },
            setTimeout: vi.fn(() => 1),
            clearTimeout: vi.fn(),
        }

        navigateToCommand('perf-WS3', expandTask, win)

        expect(expandTask).toHaveBeenCalledWith('perf-WS3', true)
        expect(win.location.hash).toBe('cmd-perf-WS3')
        expect(win.document.getElementById).toHaveBeenCalledWith('cmd-perf-WS3')
        expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
        expect(classList.add).toHaveBeenCalledWith('cmd-flash')
    })

    it('removes the command flash class after the pulse duration', () => {
        vi.useFakeTimers()
        const expandTask = vi.fn()
        const classList = { add: vi.fn(), remove: vi.fn() }
        const win = {
            location: { hash: '' },
            document: {
                getElementById: vi.fn(() => ({ classList })),
            },
            setTimeout: (handler: () => void, timeout: number) => globalThis.setTimeout(handler, timeout) as unknown as number,
            clearTimeout: (timer: number) => globalThis.clearTimeout(timer),
        }

        navigateToCommand('perf-WS3', expandTask, win)
        vi.advanceTimersByTime(COMMAND_FLASH_DURATION_MS)

        expect(classList.remove).toHaveBeenCalledWith('cmd-flash')
        vi.useRealTimers()
    })

    it('parses inline CSS declarations into a React-compatible style object', () => {
        expect(parseInlineStyle('border-color: var(--ok); opacity: 0.8; -webkit-line-clamp: 2; --accent-card: var(--ok);')).toEqual({
            borderColor: 'var(--ok)',
            opacity: '0.8',
            WebkitLineClamp: '2',
            '--accent-card': 'var(--ok)',
        })
    })
})
