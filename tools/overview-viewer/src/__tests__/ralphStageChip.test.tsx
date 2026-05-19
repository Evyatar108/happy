import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { RalphStageChip } from '../components/RalphStageChip'
import type { OverviewRalphState, RalphStage } from '../types'
import { NO_RALPH_STATE } from './testData'

const stages: RalphStage[] = [
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

function stateFor(stage: RalphStage, overrides: Partial<OverviewRalphState['byTaskId'][string]> = {}): OverviewRalphState {
    return {
        generatedAt: '2026-05-19T00:00:00Z',
        generatedFromCommit: 'abc1234',
        byTaskId: {
            'task-1': {
                stage,
                jobSlug: 'job-alpha',
                groupSlug: 'group-alpha',
                lastUpdatedAt: '2026-05-19T01:02:03Z',
                ...overrides,
            },
        },
    }
}

describe('RalphStageChip', () => {
    it('renders nothing when the task has no Ralph state', () => {
        expect(renderToStaticMarkup(<RalphStageChip taskId="missing" ralphState={NO_RALPH_STATE} />)).toBe('')
    })

    it.each(stages)('renders the stage-%s class', (stage) => {
        const html = renderToStaticMarkup(<RalphStageChip taskId="task-1" ralphState={stateFor(stage)} />)

        expect(html).toContain(`ralph-stage-chip stage-${stage}`)
        expect(html).toContain(`aria-label="Ralph stage: ${stage}"`)
        expect(html).not.toContain('role="button"')
    })

    it('adds match-slug-default when the state came from the slug default', () => {
        const html = renderToStaticMarkup(
            <RalphStageChip taskId="task-1" ralphState={stateFor('implementing', { matchSource: 'slug-default' })} />,
        )

        expect(html).toContain('match-slug-default')
    })

    it('does not render literal undefined when optional tooltip rows are absent', () => {
        const html = renderToStaticMarkup(
            <RalphStageChip
                taskId="task-1"
                ralphState={stateFor('planning', { jobSlug: undefined, groupSlug: undefined, lastUpdatedAt: undefined })}
            />,
        )

        expect(html).not.toContain('undefined')
    })
})
