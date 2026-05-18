import { describe, expect, it } from 'vitest'

import { parseTaskScope } from '../data/copyPreambles'
import { buildCopyCommandText } from '../utils/copyCommand'
import { loadOverviewData, readBaselineRepoFile } from './testData'

function readLegacyString(name: string): string {
    const html = readBaselineRepoFile('plans/overview.html')
    const match = html.match(new RegExp(String.raw`var ${name} =\s*([\s\S]*?);\r?\n\s*(?:var|function)`))
    if (!match) throw new Error(`Missing legacy string ${name}`)
    return new Function(`return ${match[1]}`)() as string
}

function legacyBuildCopyPreamble(scopes: string[]): string {
    const hasBookkeeping = scopes.indexOf('bookkeeping') >= 0
    const hasCodexu = scopes.indexOf('codexu') >= 0
    const hasCodex = scopes.indexOf('codex') >= 0
    const parts = []
    if (!hasBookkeeping) parts.push(readLegacyString('BOOKKEEPING_PREAMBLE'))
    if (hasCodex && hasCodexu) parts.push(readLegacyString('WORKTREE_PREAMBLE_BOTH'))
    else if (hasCodex) parts.push(readLegacyString('WORKTREE_PREAMBLE_CODEX'))
    else if (hasCodexu) parts.push(readLegacyString('WORKTREE_PREAMBLE_CODEXU'))
    if (parts.length === 0) return ''
    parts.push(readLegacyString('ORIGINAL_TASK_SEPARATOR'))
    return parts.join('')
}

function legacyCopyCommand(raw: string, scope: string | undefined): string {
    const scopes = parseTaskScope(scope)
    const preamble = legacyBuildCopyPreamble(scopes)
    return preamble ? raw.replace(/(^\s*\/plan-with-ralph\s+")/, `$1${preamble}`) : raw
}

describe('copy preamble parity', () => {
    it('builds the same command text as the legacy copyCommand path', () => {
        const data = loadOverviewData()
        const cases = data.tasks?.filter((task) => task.command?.planPrompt).slice(0, 8) ?? []

        expect(cases.length).toBeGreaterThan(0)
        cases.forEach((task) => {
            const raw = task.command?.planPrompt ?? ''
            expect(buildCopyCommandText(raw, task.scope)).toBe(legacyCopyCommand(raw, task.scope))
        })
    })

    it('snapshots representative scope combinations byte-for-byte', () => {
        const raw = '/plan-with-ralph "Do the thing"'
        expect({
            codexu: buildCopyCommandText(raw, 'codexu'),
            codex: buildCopyCommandText(raw, 'codex'),
            both: buildCopyCommandText(raw, 'codexu|codex'),
            bookkeeping: buildCopyCommandText(raw, 'bookkeeping'),
        }).toMatchSnapshot()
    })
})
