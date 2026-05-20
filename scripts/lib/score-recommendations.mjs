const STAGE_URGENCY = Object.freeze({
    'review-fix': 1,
    'replan-pending': 0.95,
    'plan-ready': 0.9,
    reviewing: 0.7,
    implementing: 0.6,
    blocked: 0.5,
    planning: 0.4,
    'brainstorm-ready': 0.3,
    brainstorming: 0.2,
    shipped: 0,
})

const DEFAULT_WEIGHTS = Object.freeze({
    stageUrgency: 40,
    dependencyState: 30,
    freshness: 20,
    priority: 10,
})

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const FRESHNESS_DECAY_DAYS = 13

const _warnedUnknownStages = new Set()

export function _resetUnknownStageWarnings() {
    _warnedUnknownStages.clear()
}

function warnUnknownStage(stage) {
    if (_warnedUnknownStages.has(stage)) {
        return
    }
    _warnedUnknownStages.add(stage)
    process.stderr.write(
        `[score-recommendations] unknown stage="${stage}" — urgency defaulting to 0 (schema drift?)\n`,
    )
}

export function scoreRecommendations({ byTaskId = {}, overviewData = {}, prdsByTaskId = {}, weights, topN, now } = {}) {
    const mergedWeights = { ...DEFAULT_WEIGHTS, ...(weights ?? {}) }
    const timestamp = now instanceof Date ? now.getTime() : typeof now === 'number' ? now : Date.now()
    const tasksById = new Map((overviewData.tasks ?? []).filter((task) => task?.id).map((task) => [task.id, task]))
    const limit = Number.isInteger(topN) && topN >= 0 ? topN : 20

    return Object.entries(byTaskId)
        .map(([taskId, ralph]) => {
            const stage = ralph?.stage ?? 'blocked'
            const components = [
                buildStageComponent(stage, mergedWeights.stageUrgency),
                buildDependencyComponent(taskId, prdsByTaskId, mergedWeights.dependencyState),
                buildFreshnessComponent(ralph?.lastUpdatedAt, timestamp, mergedWeights.freshness),
                buildPriorityComponent(tasksById.get(taskId)?.priority, mergedWeights.priority),
            ]
            const weightTotal = components.reduce((total, component) => total + component.weight, 0)
            const score = weightTotal > 0 ? components.reduce((total, component) => total + component.weight * component.value, 0) / weightTotal : 0

            return {
                taskId,
                score: clamp01(score),
                stage,
                reasons: topReasons(components),
            }
        })
        .filter((entry) => entry.stage !== 'shipped')
        .sort((a, b) => b.score - a.score || a.taskId.localeCompare(b.taskId))
        .slice(0, limit)
}

function buildStageComponent(stage, weight) {
    if (!(stage in STAGE_URGENCY)) {
        warnUnknownStage(stage)
    }
    return {
        key: 'stageUrgency',
        weight: positiveWeight(weight),
        value: STAGE_URGENCY[stage] ?? 0,
        reason: `${stage} stage`,
    }
}

function buildDependencyComponent(taskId, prdsByTaskId, weight) {
    const dependencies = collectStoryDependencies(taskId, prdsByTaskId)
    if (dependencies.length === 0) {
        return { key: 'dependencyState', weight: positiveWeight(weight), value: 1, reason: 'unblocked' }
    }

    const passed = dependencies.filter((dependency) => dependencyPassed(dependency, taskId, prdsByTaskId)).length
    const value = passed === dependencies.length ? 1 : passed > 0 ? 0.5 : 0
    const reason = value === 1 ? 'unblocked' : value === 0.5 ? 'partially blocked' : 'fully blocked'
    return { key: 'dependencyState', weight: positiveWeight(weight), value, reason }
}

function collectStoryDependencies(taskId, prdsByTaskId) {
    return (prdsByTaskId[taskId]?.userStories ?? []).flatMap((story) =>
        Array.isArray(story?.dependencies) ? story.dependencies.filter((dependency) => typeof dependency === 'string') : [],
    )
}

function dependencyPassed(dependency, owningTaskId, prdsByTaskId) {
    const { taskId, storyId } = splitDependency(dependency, owningTaskId)
    const story = (prdsByTaskId[taskId]?.userStories ?? []).find((candidate) => candidate?.id === storyId)
    return story?.passes === true || story?.passes === 'true'
}

function splitDependency(dependency, fallbackTaskId) {
    const separator = dependency.indexOf(':')
    if (separator === -1) {
        return { taskId: fallbackTaskId, storyId: dependency }
    }
    return { taskId: dependency.slice(0, separator), storyId: dependency.slice(separator + 1) }
}

function buildFreshnessComponent(lastUpdatedAt, nowMs, weight) {
    if (!lastUpdatedAt) {
        return { key: 'freshness', weight: positiveWeight(weight), value: 0.5, reason: 'missing update timestamp' }
    }
    const updatedMs = Date.parse(lastUpdatedAt)
    if (Number.isNaN(updatedMs)) {
        return { key: 'freshness', weight: positiveWeight(weight), value: 0.5, reason: 'invalid update timestamp' }
    }

    const ageDays = Math.max(0, (nowMs - updatedMs) / ONE_DAY_MS)
    const value = ageDays <= 1 ? 1 : ageDays >= 14 ? 0 : 1 - (ageDays - 1) / FRESHNESS_DECAY_DAYS
    return { key: 'freshness', weight: positiveWeight(weight), value, reason: freshnessReason(ageDays) }
}

function freshnessReason(ageDays) {
    if (ageDays < 1) {
        return 'updated today'
    }
    const rounded = Math.round(ageDays)
    return `not touched in ${rounded} ${rounded === 1 ? 'day' : 'days'}`
}

function buildPriorityComponent(priority, weight) {
    if (typeof priority !== 'number' || !Number.isFinite(priority)) {
        return { key: 'priority', weight: positiveWeight(weight), value: 0.5, reason: 'default priority' }
    }
    const value = clamp01(priority)
    return { key: 'priority', weight: positiveWeight(weight), value, reason: `priority ${formatPercent(value)}` }
}

function topReasons(components) {
    return components
        .filter((component) => component.weight > 0)
        .map((component, index) => ({ ...component, contribution: component.weight * component.value, index }))
        .sort((a, b) => b.contribution - a.contribution || a.index - b.index)
        .slice(0, 3)
        .map((component) => component.reason)
}

function positiveWeight(weight) {
    return typeof weight === 'number' && Number.isFinite(weight) && weight > 0 ? weight : 0
}

function clamp01(value) {
    return Math.max(0, Math.min(1, value))
}

function formatPercent(value) {
    return `${Math.round(value * 100)}%`
}
