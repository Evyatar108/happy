import type { OverviewData, OverviewRalphState, Recommendation } from '../../tools/overview-viewer/src/types'

export interface RecommendationWeights {
    stageUrgency?: number
    dependencyState?: number
    freshness?: number
    priority?: number
}

export interface PrdStoryCarrier {
    id: string
    dependencies?: string[]
    passes?: boolean | string
}

export interface PrdCarrier {
    userStories: PrdStoryCarrier[]
    dependencies?: string[]
}

export interface ScoreRecommendationsOptions {
    byTaskId?: OverviewRalphState['byTaskId']
    overviewData?: OverviewData
    prdsByTaskId?: Record<string, PrdCarrier>
    weights?: RecommendationWeights
    topN?: number
    now?: number | Date
}

export function scoreRecommendations(options?: ScoreRecommendationsOptions): Recommendation[]
