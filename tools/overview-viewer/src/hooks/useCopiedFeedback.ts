import { useCallback, useEffect, useRef, useState } from 'react'

import { COPY_TOAST_DURATION_MS } from './useToast'

export function useCopiedFeedback(): [boolean, () => void] {
    const [copied, setCopied] = useState(false)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const markCopied = useCallback(() => {
        setCopied(true)
        if (timerRef.current !== null) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => {
            setCopied(false)
            timerRef.current = null
        }, COPY_TOAST_DURATION_MS)
    }, [])

    useEffect(() => () => {
        if (timerRef.current !== null) clearTimeout(timerRef.current)
    }, [])

    return [copied, markCopied]
}

