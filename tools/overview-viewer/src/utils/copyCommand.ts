import { buildCopyPreamble, parseTaskScope } from '../data/copyPreambles'

export function buildCopyCommandText(raw: string, scope: string | undefined): string {
    const preamble = buildCopyPreamble(parseTaskScope(scope))
    return preamble ? raw.replace(/(^\s*\/plan-with-ralph\s+")/, `$1${preamble}`) : raw
}
