export const REVIEW_PHASES = Object.freeze(['5a', '5b', '5.5', '6'])
export const IMPLEMENTING_PHASES = Object.freeze(['1', '2', '3', '4', '5c'])

/**
 * @param {{
 *   jobState?: unknown,
 *   prd?: unknown,
 *   brainstormJson?: unknown,
 *   reviewOpenCount?: Record<string, number | undefined>,
 *   jobDirMarker?: true,
 * }} bundle
 * @returns {import('../../tools/overview-viewer/src/types').RalphStage}
 */
export function deriveRalphStage(bundle = {}) {
    const jobState = asRecord(bundle.jobState)
    const orchestrator = asRecord(jobState?.orchestrator)
    const prd = asRecord(bundle.prd)
    const brainstormJson = asRecord(bundle.brainstormJson)
    const phase = typeof orchestrator?.phase === 'string' ? orchestrator.phase : undefined
    const terminalReason = orchestrator?.terminalReason

    if (orchestrator?.terminal === true && terminalReason === 'complete') {
        return 'shipped'
    }

    if (jobState?.status === 'BLOCKED' || (orchestrator?.terminal === true && terminalReason === 'blocked')) {
        return 'blocked'
    }

    if (orchestrator?.terminal === true && terminalReason === 'replan') {
        return 'replan-pending'
    }

    if (phase !== undefined && REVIEW_PHASES.includes(phase) && orchestrator?.terminal !== true) {
        if (hasOpenReviewFindings(bundle.reviewOpenCount)) {
            return 'review-fix'
        }
        return 'reviewing'
    }

    if (jobState !== undefined && orchestrator !== undefined && orchestrator.terminal !== true) {
        return 'implementing'
    }

    if (prd !== undefined && jobState === undefined) {
        return 'plan-ready'
    }

    if (bundle.jobDirMarker === true && prd === undefined && jobState === undefined) {
        return 'planning'
    }

    if (brainstormJson?.recommendedDirection) {
        return 'brainstorm-ready'
    }

    if (brainstormJson !== undefined) {
        return 'brainstorming'
    }

    return 'brainstorming'
}

function hasOpenReviewFindings(reviewOpenCount) {
    if (!reviewOpenCount) {
        return false
    }
    return Object.values(reviewOpenCount).some((count) => typeof count === 'number' && count > 0)
}

function asRecord(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value
    }
    return undefined
}
