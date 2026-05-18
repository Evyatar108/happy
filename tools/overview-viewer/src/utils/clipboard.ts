export async function writeClipboard(text: string): Promise<boolean> {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        return true
    }

    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    try {
        return document.execCommand('copy')
    } finally {
        document.body.removeChild(textarea)
    }
}
