interface CommandNavigationWindow {
    location: Pick<Location, 'hash'>
    document?: {
        getElementById(id: string): CommandNavigationElement | null
    }
    setTimeout?: (handler: () => void, timeout: number) => number
    clearTimeout?: (timer: number) => void
}

interface CommandNavigationElement {
    scrollIntoView?: (options?: ScrollIntoViewOptions) => void
    classList?: Pick<DOMTokenList, 'add' | 'remove'>
}

export const COMMAND_FLASH_DURATION_MS = 1500

const flashTimers = new WeakMap<CommandNavigationElement, number>()

export function flashCommandElement(element: CommandNavigationElement, win: CommandNavigationWindow | undefined = typeof window === 'undefined' ? undefined : window): void {
    element.classList?.add('cmd-flash')

    const previousTimer = flashTimers.get(element)
    if (previousTimer !== undefined) win?.clearTimeout?.(previousTimer)

    const timer = win?.setTimeout?.(() => {
        element.classList?.remove('cmd-flash')
        flashTimers.delete(element)
    }, COMMAND_FLASH_DURATION_MS)

    if (timer !== undefined) flashTimers.set(element, timer)
}

export function navigateToCommand(taskId: string, expandTask: (taskId: string, open: boolean) => void, win: CommandNavigationWindow | undefined = typeof window === 'undefined' ? undefined : window): void {
    expandTask(taskId, true)
    if (!win) return

    win.location.hash = `cmd-${taskId}`
    const target = win.document?.getElementById(`cmd-${taskId}`)
    target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    if (target) flashCommandElement(target, win)
}
