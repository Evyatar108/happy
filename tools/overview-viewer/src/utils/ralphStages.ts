import type { RalphStage } from '../types'

export const RALPH_STAGE_ORDER = Object.freeze([
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
] as const satisfies readonly RalphStage[])

