import type { OverviewData, OverviewRalphState } from './types'

declare global {
    interface Window {
        OVERVIEW_DATA?: OverviewData
        OVERVIEW_RALPH_STATE?: OverviewRalphState
    }
}

export {}
