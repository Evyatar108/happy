import type { OverviewData } from './types'

declare global {
    interface Window {
        OVERVIEW_DATA?: OverviewData
    }
}

export {}
