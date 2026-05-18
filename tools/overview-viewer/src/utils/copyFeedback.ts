import type { ShowToast } from '../hooks/useToast'
import { writeClipboard } from './clipboard'

function byteLength(text: string): number {
    return new TextEncoder().encode(text).length
}

export function formatCopiedToast(label: string, copiedText: string): string {
    const kb = Math.max(0.1, Math.round((byteLength(copiedText) / 1024) * 10) / 10)
    const formattedKb = Number.isInteger(kb) ? kb.toFixed(0) : kb.toFixed(1)
    return `Copied \`${label}\` (${formattedKb} KB)`
}

export async function copyTextWithToast({
    label,
    showToast,
    text,
    write = writeClipboard,
}: {
    label: string
    showToast?: ShowToast
    text: string
    write?: (text: string) => Promise<boolean>
}): Promise<boolean> {
    const copied = await write(text)
    if (!copied) return false
    showToast?.(formatCopiedToast(label, text))
    return true
}

