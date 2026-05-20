import { describe, expect, test, vi } from 'vitest'

import { scoreRecommendations } from './score-recommendations.mjs'

const NOW = Date.parse('2026-05-20T00:00:00Z')
const ONLY_STAGE = { stageUrgency: 1, dependencyState: 0, freshness: 0, priority: 0 }
const ONLY_DEPENDENCY = { stageUrgency: 0, dependencyState: 1, freshness: 0, priority: 0 }
const ONLY_FRESHNESS = { stageUrgency: 0, dependencyState: 0, freshness: 1, priority: 0 }
const ONLY_PRIORITY = { stageUrgency: 0, dependencyState: 0, freshness: 0, priority: 1 }

describe('scoreRecommendations', () => {
    test('scores stage urgency using the Plan 04 rubric', () => {
        const recommendations = scoreRecommendations({
            byTaskId: {
                fix: { stage: 'review-fix' },
                ready: { stage: 'plan-ready' },
                shipped: { stage: 'shipped' },
            },
            weights: ONLY_STAGE,
            now: NOW,
        })

        expect(recommendations.map((item) => [item.taskId, item.score])).toEqual([
            ['fix', 1],
            ['ready', 0.9],
            ['shipped', 0],
        ])
        expect(recommendations[0]).toMatchObject({ taskId: 'fix', stage: 'review-fix' })
        expect(recommendations[0].reasons).toContain('review-fix stage')
    })

    test('derives dependency state from referenced story passes', () => {
        const recommendations = scoreRecommendations({
            byTaskId: {
                unblocked: { stage: 'planning' },
                partial: { stage: 'planning' },
                blocked: { stage: 'planning' },
                cross: { stage: 'planning' },
            },
            prdsByTaskId: {
                unblocked: { userStories: [{ id: 'US-001', passes: true }, { id: 'US-002', dependencies: ['US-001'] }] },
                partial: {
                    userStories: [
                        { id: 'US-001', passes: true },
                        { id: 'US-002', passes: false },
                        { id: 'US-003', dependencies: ['US-001', 'US-002'] },
                    ],
                },
                blocked: { userStories: [{ id: 'US-001', passes: false }, { id: 'US-002', dependencies: ['US-001'] }] },
                cross: { userStories: [{ id: 'US-002', dependencies: ['unblocked:US-001'] }] },
            },
            weights: ONLY_DEPENDENCY,
            now: NOW,
        })

        expect(scoreByTask(recommendations)).toEqual({ blocked: 0, cross: 1, partial: 0.5, unblocked: 1 })
        expect(recommendations.find((item) => item.taskId === 'partial')?.reasons).toContain('partially blocked')
        expect(recommendations.find((item) => item.taskId === 'blocked')?.reasons).toContain('fully blocked')
    })

    test('applies linear freshness decay and timestamp fallbacks', () => {
        const recommendations = scoreRecommendations({
            byTaskId: {
                fresh: { stage: 'planning', lastUpdatedAt: '2026-05-19T00:00:00Z' },
                middle: { stage: 'planning', lastUpdatedAt: '2026-05-12T12:00:00Z' },
                stale: { stage: 'planning', lastUpdatedAt: '2026-05-01T00:00:00Z' },
                missing: { stage: 'planning' },
            },
            weights: ONLY_FRESHNESS,
            now: NOW,
        })

        expect(scoreByTask(recommendations).fresh).toBe(1)
        expect(scoreByTask(recommendations).middle).toBeCloseTo(0.5, 5)
        expect(scoreByTask(recommendations).stale).toBe(0)
        expect(scoreByTask(recommendations).missing).toBe(0.5)
    })

    test('reads task priority with normalized numeric and missing-data fallbacks', () => {
        const recommendations = scoreRecommendations({
            byTaskId: {
                high: { stage: 'planning' },
                low: { stage: 'planning' },
                clamped: { stage: 'planning' },
                missing: { stage: 'planning' },
            },
            overviewData: {
                tasks: [{ id: 'high', priority: 0.8 }, { id: 'low', priority: 0.2 }, { id: 'clamped', priority: 3 }],
            },
            weights: ONLY_PRIORITY,
            now: NOW,
        })

        expect(scoreByTask(recommendations)).toEqual({ clamped: 1, high: 0.8, low: 0.2, missing: 0.5 })
        expect(recommendations.find((item) => item.taskId === 'missing')?.reasons).toContain('default priority')
    })

    test('weight overrides can shift ordering', () => {
        const input = {
            byTaskId: {
                urgent: { stage: 'review-fix', lastUpdatedAt: '2026-05-19T00:00:00Z' },
                important: { stage: 'planning', lastUpdatedAt: '2026-05-19T00:00:00Z' },
            },
            overviewData: { tasks: [{ id: 'urgent', priority: 0 }, { id: 'important', priority: 1 }] },
            now: NOW,
        }

        expect(scoreRecommendations({ ...input }).map((item) => item.taskId)).toEqual(['urgent', 'important'])
        expect(scoreRecommendations({ ...input, weights: { stageUrgency: 1, dependencyState: 0, freshness: 0, priority: 50 } })[0].taskId).toBe(
            'important',
        )
    })

    test('caps topN and tie-breaks deterministically by taskId', () => {
        const recommendations = scoreRecommendations({
            byTaskId: {
                beta: { stage: 'planning' },
                alpha: { stage: 'planning' },
                gamma: { stage: 'brainstorming' },
            },
            weights: ONLY_STAGE,
            topN: 2,
            now: NOW,
        })

        expect(recommendations.map((item) => item.taskId)).toEqual(['alpha', 'beta'])
    })

    test('handles no PRD case and stays side-effect free', () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

        expect(
            scoreRecommendations({
                byTaskId: { task: { stage: 'planning' } },
                prdsByTaskId: {},
                weights: ONLY_DEPENDENCY,
                now: NOW,
            }),
        ).toEqual([{ taskId: 'task', score: 1, stage: 'planning', reasons: ['unblocked'] }])
        expect(consoleSpy).not.toHaveBeenCalled()

        consoleSpy.mockRestore()
    })
})

function scoreByTask(recommendations) {
    return Object.fromEntries(recommendations.map((item) => [item.taskId, item.score]).sort(([a], [b]) => a.localeCompare(b)))
}
