/**
 * Stage -> NextCommand predicate.
 * Tested against ralph-orchestration v5.41.0. If the orchestrator's resume
 * syntax changes (e.g. --run-only canonicalization, --parallel arg shape),
 * update this table and re-test.
 *
 * @typedef {import('../../tools/overview-viewer/src/types').NextCommand} NextCommand
 * @typedef {import('../../tools/overview-viewer/src/types').OverviewTask} OverviewTask
 * @typedef {import('../../tools/overview-viewer/src/types').RalphPipelineState} RalphPipelineState
 *
 * @param {RalphPipelineState | undefined} state
 * @param {OverviewTask | undefined} task
 * @param {{ repoRoot?: string }} [options]
 * @returns {NextCommand | null}
 */
export function deriveNextCommand(state, task, options = {}) {
    void task

    if (!state || typeof state !== 'object') {
        return null
    }

    const artifacts = state.artifacts ?? {}
    switch (state.stage) {
        case 'brainstorming': {
            const brainstormDir = cleanPath(artifacts.brainstormDir)
            const brainstormSlug = trailingSegment(brainstormDir)
            if (!brainstormSlug) {
                return null
            }
            return { label: 'Resume brainstorm', command: `/brainstorm-with-ralph ${brainstormSlug}` }
        }
        case 'brainstorm-ready': {
            const brainstormDir = cleanPath(artifacts.brainstormDir)
            if (!brainstormDir) {
                return null
            }
            return { label: 'Plan from brainstorm', command: `/plan-with-ralph --from-brainstorm ${brainstormDir}` }
        }
        case 'planning': {
            const planFile = resolvePlanFile(artifacts)
            if (!planFile) {
                return null
            }
            return { label: 'Continue planning', command: `/plan-with-ralph --improve ${planFile}` }
        }
        case 'plan-ready': {
            const jobDir = cleanPath(artifacts.jobDir)
            if (!jobDir) {
                return null
            }
            let command = `/implement-with-ralph --from-plan ${joinPath(jobDir, 'plan.md')}`
            if (state.isParallel === true) {
                command += ` --parallel --suggested-decomposition ${joinPath(jobDir, 'suggested-decomposition.json')}`
            }
            return { label: 'Start implementation', command }
        }
        case 'implementing': {
            if (state.isParallel === true && state.groupSlug) {
                const groupDir = resolveGroupDir(artifacts.groupDir, options.repoRoot)
                if (!groupDir) {
                    return null
                }
                return { label: 'Resume implementation', command: `/implement-with-ralph --run-only --job ${groupDir}` }
            }
            if (!state.jobSlug) {
                return null
            }
            return { label: 'Resume implementation', command: `/implement-with-ralph resume ${state.jobSlug}` }
        }
        case 'reviewing':
        case 'review-fix': {
            if (!state.jobSlug) {
                return null
            }
            return { label: 'Continue review', command: `/implement-with-ralph resume ${state.jobSlug}` }
        }
        case 'replan-pending': {
            const jobDir = cleanPath(artifacts.jobDir)
            if (!jobDir) {
                return null
            }
            return { label: 'Replan next cycle', command: `/plan-with-ralph --improve ${joinPath(jobDir, 'plan.md')}` }
        }
        case 'blocked': {
            if (!state.jobSlug) {
                return null
            }
            return { label: 'Retry after fix', command: `/implement-with-ralph resume ${state.jobSlug}` }
        }
        case 'shipped':
        default:
            return null
    }
}

function resolvePlanFile(artifacts) {
    const planFile = cleanPath(artifacts.planFile) ?? cleanPath(artifacts.planDraftFile)
    if (planFile) {
        return planFile
    }
    const jobDir = cleanPath(artifacts.jobDir)
    return jobDir ? joinPath(jobDir, 'plan.md') : null
}

function resolveGroupDir(groupDir, repoRoot) {
    const cleanGroupDir = cleanPath(groupDir)
    if (!cleanGroupDir) {
        return null
    }
    if (isAbsolutePath(cleanGroupDir)) {
        return cleanGroupDir
    }
    const cleanRepoRoot = cleanPath(repoRoot)
    return cleanRepoRoot ? joinPath(cleanRepoRoot, cleanGroupDir) : cleanGroupDir
}

function trailingSegment(pathValue) {
    const cleanValue = cleanPath(pathValue)
    if (!cleanValue) {
        return null
    }
    const segments = cleanValue.split('/').filter(Boolean)
    return segments.at(-1) ?? null
}

function joinPath(base, child) {
    const cleanBase = cleanPath(base)
    const cleanChild = cleanPath(child)
    if (!cleanBase || !cleanChild) {
        return cleanBase ?? cleanChild ?? ''
    }
    return `${cleanBase.replace(/\/+$/, '')}/${cleanChild.replace(/^\/+/, '')}`
}

function cleanPath(pathValue) {
    if (typeof pathValue !== 'string') {
        return null
    }
    const trimmed = pathValue.trim().replace(/\\/g, '/')
    return trimmed.length > 0 ? trimmed : null
}

function isAbsolutePath(pathValue) {
    return pathValue.startsWith('/') || /^[A-Za-z]:\//.test(pathValue) || pathValue.startsWith('//')
}
