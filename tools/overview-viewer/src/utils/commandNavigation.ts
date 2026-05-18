interface CommandNavigationWindow {
    location: Pick<Location, 'hash'>
    document?: {
        getElementById(id: string): { scrollIntoView?: (options?: ScrollIntoViewOptions) => void } | null
    }
}

export function navigateToCommand(taskId: string, expandTask: (taskId: string, open: boolean) => void, win: CommandNavigationWindow | undefined = typeof window === 'undefined' ? undefined : window): void {
    expandTask(taskId, true)
    if (!win) return

    win.location.hash = `cmd-${taskId}`
    const target = win.document?.getElementById(`cmd-${taskId}`)
    target?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
}
