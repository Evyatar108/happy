import { useCallback, useEffect, useRef, useState } from 'react'

export const COPY_TOAST_DURATION_MS = 1200

export type ShowToast = (text: string) => void

interface ToastDispatcher {
    clear: () => void
    showToast: ShowToast
}

export function createToastDispatcher(setCurrentToast: (text: string | null) => void): ToastDispatcher {
    let dismissTimer: ReturnType<typeof setTimeout> | null = null

    return {
        clear: () => {
            if (dismissTimer !== null) clearTimeout(dismissTimer)
            dismissTimer = null
        },
        showToast: (text: string) => {
            setCurrentToast(text)
            if (dismissTimer !== null) clearTimeout(dismissTimer)
            dismissTimer = setTimeout(() => {
                setCurrentToast(null)
                dismissTimer = null
            }, COPY_TOAST_DURATION_MS)
        },
    }
}

export function useToast(): { currentToast: string | null; showToast: ShowToast } {
    const [currentToast, setCurrentToast] = useState<string | null>(null)
    const dispatcherRef = useRef<ToastDispatcher | null>(null)
    if (dispatcherRef.current === null) dispatcherRef.current = createToastDispatcher(setCurrentToast)

    const showToast = useCallback((text: string) => {
        dispatcherRef.current?.showToast(text)
    }, [])

    useEffect(() => () => {
        dispatcherRef.current?.clear()
    }, [])

    return { currentToast, showToast }
}
