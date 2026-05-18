import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

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

export function readBaselineRepoFile(path: string): string {
    return execFileSync('git', ['show', `9f81c1f8:${path}`], {
        cwd: resolve(process.cwd(), '../..'),
        encoding: 'utf8',
    })
}
