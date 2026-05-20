import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { PipelineOverview } from '../components/PipelineOverview'
import type { OverviewRalphState, RalphStage } from '../types'
import { createEmptyFilters } from '../utils/filters'
import { RALPH_STAGE_ORDER } from '../utils/ralphStages'

const VALID_STAGES: readonly RalphStage[] = [
    'brainstorming',
    'brainstorm-ready',
    'planning',
    'plan-ready',
    'implementing',
    'reviewing',
    'review-fix',
    'replan-pending',
    'shipped',
    'blocked',
]

function renderPipeline(ralphState: OverviewRalphState) {
    return renderToStaticMarkup(
        <PipelineOverview
            ralphState={ralphState}
            filters={createEmptyFilters()}
            setFilters={() => undefined}
        />,
    )
}

describe('PipelineOverview', () => {
    it('exports the canonical frozen Ralph stage order', () => {
        expect(RALPH_STAGE_ORDER).toHaveLength(10)
        expect(Object.isFrozen(RALPH_STAGE_ORDER)).toBe(true)
        expect(RALPH_STAGE_ORDER.every((stage) => VALID_STAGES.includes(stage))).toBe(true)
        expect(RALPH_STAGE_ORDER).toEqual(VALID_STAGES)
    })

    it('renders ten stage chips with counts from Ralph state', () => {
        const html = renderPipeline({
            generatedAt: '2026-05-19T12:00:00Z',
            generatedFromCommit: 'test',
            byTaskId: {
                alpha: { stage: 'implementing' },
                beta: { stage: 'implementing' },
                gamma: { stage: 'review-fix' },
            },
        })

        expect(html.match(/pipeline-overview-chip/g)).toHaveLength(10)
        expect(html).toContain('aria-label="Ralph pipeline overview"')
        expect(html).toContain('implementing · 2')
        expect(html).toContain('review-fix · 1')
        expect(html).toContain('blocked · 0')
    })

    it('renders the empty state when no Ralph state is tracked', () => {
        const html = renderPipeline({ generatedAt: '', generatedFromCommit: '', byTaskId: {} })

        expect(html).toContain('No Ralph state tracked yet')
        expect(html).toContain('class="pipeline-overview-empty"')
    })
})

