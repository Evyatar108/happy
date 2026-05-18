import { describe, expect, it } from 'vitest'

import { highlightMatches } from '../utils/searchHighlighting'

describe('highlightMatches', () => {
    it('escapes regex metacharacters before matching', () => {
        expect(highlightMatches('run foo.bar? then fooXbar', 'foo.bar?')).toBe('run <mark class="search-match">foo.bar?</mark> then fooXbar')
    })

    it('does not rewrite inside tags or attributes', () => {
        const html = '<span data-label="perf">ship perf work</span>'

        expect(highlightMatches(html, 'perf')).toBe('<span data-label="perf">ship <mark class="search-match">perf</mark> work</span>')
    })

    it('skips code blocks', () => {
        const html = 'perf outside <code>perf inside</code> perf after'

        expect(highlightMatches(html, 'perf')).toBe('<mark class="search-match">perf</mark> outside <code>perf inside</code> <mark class="search-match">perf</mark> after')
    })

    it('matches case-insensitively', () => {
        expect(highlightMatches('Perf perf PERF', 'perf')).toBe('<mark class="search-match">Perf</mark> <mark class="search-match">perf</mark> <mark class="search-match">PERF</mark>')
    })

    it('returns html unchanged for an empty query', () => {
        const html = '<strong>perf</strong>'

        expect(highlightMatches(html, '   ')).toBe(html)
    })
})
