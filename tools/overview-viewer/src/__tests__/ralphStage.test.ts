import { describe, expect, it } from 'vitest'

import {
    IMPLEMENTING_PHASES,
    deriveRalphStage,
} from '../../../../scripts/lib/derive-ralph-stage.mjs'
import type { RalphStage } from '../types'

describe('deriveRalphStage', () => {
    it.each([
        [
            'shipped',
            { jobState: { orchestrator: { terminal: true, terminalReason: 'complete' } } },
        ],
        ['blocked', { jobState: { status: 'BLOCKED' } }],
        [
            'replan-pending',
            { jobState: { orchestrator: { terminal: true, terminalReason: 'replan' } } },
        ],
        [
            'review-fix',
            { jobState: { orchestrator: { phase: '5a', terminal: false } }, reviewOpenCount: { code: 1 } },
        ],
        [
            'reviewing',
            { jobState: { orchestrator: { phase: '5b', terminal: false } }, reviewOpenCount: { code: 0, docs: 0 } },
        ],
        ['implementing', { jobState: { orchestrator: { phase: '3', terminal: false } } }],
        ['plan-ready', { prd: { userStories: [] } }],
        ['planning', { jobDirMarker: true as const }],
        ['brainstorm-ready', { brainstormJson: { recommendedDirection: 'plan this' } }],
        ['brainstorming', { brainstormJson: {} }],
    ] satisfies Array<[RalphStage, Record<string, unknown>]>)('maps a %s bundle to its stage', (stage, bundle) => {
        expect(deriveRalphStage(bundle)).toBe(stage)
    })

    it('keeps missing review findings as reviewing, not review-fix', () => {
        expect(deriveRalphStage({ jobState: { orchestrator: { phase: '6', terminal: false } } })).toBe(
            'reviewing',
        )
    })

    it.each(IMPLEMENTING_PHASES)('maps implementing phase %s to implementing', (phase) => {
        expect(deriveRalphStage({ jobState: { orchestrator: { phase, terminal: false } } })).toBe(
            'implementing',
        )
    })

    it.each(['4.5', '7'])('maps unknown phase %s to implementing', (phase) => {
        expect(deriveRalphStage({ jobState: { orchestrator: { phase, terminal: false } } })).toBe(
            'implementing',
        )
    })

    it('maps a directory marker without prd or job state to planning', () => {
        expect(deriveRalphStage({ jobDirMarker: true })).toBe('planning')
    })
})
