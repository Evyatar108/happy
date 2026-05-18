function toReactStyleName(property: string): string {
    if (property.startsWith('--')) return property

    const lower = property.trim().toLowerCase()
    if (lower.startsWith('-ms-')) {
        return `ms${lower.slice(3).replace(/-([a-z])/g, (_, char: string) => char.toUpperCase())}`
    }
    if (lower.startsWith('-webkit-') || lower.startsWith('-moz-') || lower.startsWith('-o-')) {
        const withoutDash = lower.slice(1)
        return withoutDash.charAt(0).toUpperCase() + withoutDash.slice(1).replace(/-([a-z])/g, (_, char: string) => char.toUpperCase())
    }

    return lower.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase())
}

export function parseInlineStyle(style: string | null | undefined): Record<string, string> | undefined {
    if (!style) return undefined

    const parsed: Record<string, string> = {}
    style.split(';').forEach((declaration) => {
        const separator = declaration.indexOf(':')
        if (separator < 0) return

        const property = declaration.slice(0, separator).trim()
        const value = declaration.slice(separator + 1).trim()
        if (!property || !value) return
        parsed[toReactStyleName(property)] = value
    })

    return Object.keys(parsed).length > 0 ? parsed : undefined
}
