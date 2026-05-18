import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { OverviewData } from '../types'

export function loadOverviewData(): OverviewData {
    const script = readRepoFile('plans/overview-data.js')
    const windowValue = {} as { OVERVIEW_DATA?: OverviewData }
    new Function('window', script)(windowValue)
    return windowValue.OVERVIEW_DATA ?? {}
}

export function readRepoFile(path: string): string {
    return readFileSync(resolve(process.cwd(), '../..', path), 'utf8')
}
