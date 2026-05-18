import { useState } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { KeyboardHelp } from '../../components/TopLevelSurfaces'

function KeyboardHelpHarness() {
    const [open, setOpen] = useState(false)
    return (
        <>
            <button type="button">Before</button>
            <KeyboardHelp open={open} onOpenChange={setOpen} />
            <button type="button">After</button>
        </>
    )
}

describe('KeyboardHelp dialog', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        cleanup()
    })

    it('opens from the ? trigger, traps focus, closes on Escape, and restores focus', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const user = userEvent.setup()
        render(<KeyboardHelpHarness />)

        const trigger = screen.getByRole('button', { name: 'Keyboard shortcuts' })
        const afterButton = screen.getByRole('button', { name: 'After' })
        await user.click(trigger)

        expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Close keyboard shortcuts' })).toBe(document.activeElement)

        await user.tab()
        expect(document.activeElement).not.toBe(afterButton)

        await user.keyboard('{Escape}')

        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).toBeNull())
        expect(document.activeElement).toBe(trigger)
        expect(consoleError).not.toHaveBeenCalled()
    })
})
