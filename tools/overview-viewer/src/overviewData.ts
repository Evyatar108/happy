export interface OverviewData {
    tasks?: unknown[]
}

declare global {
    interface Window {
        OVERVIEW_DATA?: OverviewData
    }
}

export {}
