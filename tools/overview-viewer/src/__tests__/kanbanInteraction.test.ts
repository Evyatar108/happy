import { describe, expect, it, vi } from 'vitest'

import { navigateToCommand } from '../utils/commandNavigation'
import { parseInlineStyle } from '../utils/inlineStyleParser'

describe('kanban interaction helpers', () => {
    it('sets the command hash, expands the row, and requests a scroll', () => {
        const expandTask = vi.fn()
        const scrollIntoView = vi.fn()
        const win = {
            location: { hash: '' },
            document: {
                getElementById: vi.fn(() => ({ scrollIntoView })),
            },
        }

        navigateToCommand('perf-WS3', expandTask, win)

        expect(expandTask).toHaveBeenCalledWith('perf-WS3', true)
        expect(win.location.hash).toBe('cmd-perf-WS3')
        expect(win.document.getElementById).toHaveBeenCalledWith('cmd-perf-WS3')
        expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' })
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
