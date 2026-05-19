import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

import type { OverviewData, OverviewRalphState } from '../types'

export const NO_RALPH_STATE: OverviewRalphState = { generatedAt: '', generatedFromCommit: '', byTaskId: {} }

export function loadOverviewData(): OverviewData {
    const script = readRepoFile('plans/overview-data.js')
    const windowValue = {} as { OVERVIEW_DATA?: OverviewData }
    new Function('window', script)(windowValue)
    return windowValue.OVERVIEW_DATA ?? {}
}

export function loadRalphState(): OverviewRalphState {
    let script: string
    try {
        script = readRepoFile('plans/overview-ralph-state.js')
    } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return NO_RALPH_STATE
        throw error
    }
    const windowValue = {} as { OVERVIEW_RALPH_STATE?: OverviewRalphState }
    new Function('window', script)(windowValue)
    return windowValue.OVERVIEW_RALPH_STATE ?? NO_RALPH_STATE
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
