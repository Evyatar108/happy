function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function applyTextHighlight(text: string, matcher: RegExp): string {
    return text.replace(matcher, (match) => `<mark class="search-match">${match}</mark>`)
}

function getTagName(tag: string): string {
    const match = tag.match(/^<\/?\s*([a-zA-Z0-9-]+)/)
    return match?.[1]?.toLowerCase() ?? ''
}

export function highlightMatches(html: string, query: string): string {
    const trimmedQuery = query.trim()
    if (!trimmedQuery) return html

    const matcher = new RegExp(escapeRegExp(trimmedQuery), 'gi')
    let highlighted = ''
    let index = 0
    let codeDepth = 0

    while (index < html.length) {
        const tagStart = html.indexOf('<', index)
        const textEnd = tagStart === -1 ? html.length : tagStart
        const text = html.slice(index, textEnd)
        highlighted += codeDepth > 0 ? text : applyTextHighlight(text, matcher)

        if (tagStart === -1) break

        const tagEnd = html.indexOf('>', tagStart)
        if (tagEnd === -1) {
            const rest = html.slice(tagStart)
            highlighted += codeDepth > 0 ? rest : applyTextHighlight(rest, matcher)
            break
        }

        const tag = html.slice(tagStart, tagEnd + 1)
        const tagName = getTagName(tag)
        const isClosingTag = /^<\s*\//.test(tag)
        const isSelfClosingTag = /\/\s*>$/.test(tag)

        highlighted += tag
        if (tagName === 'code') {
            if (isClosingTag) codeDepth = Math.max(0, codeDepth - 1)
            else if (!isSelfClosingTag) codeDepth += 1
        }

        index = tagEnd + 1
    }

    return highlighted
}
