import fs from 'node:fs'
import path from 'node:path'

import { atomicWriteFile } from './atomic-write.mjs'
import { deriveDependencyGraph } from './derive-dependency-graph.mjs'
import { loadPrdsByTaskId } from './load-prds-by-task-id.mjs'
import { scoreRecommendations } from './score-recommendations.mjs'

/**
 * Emits Plan 04 derived artifacts without mutating the Ralph sidecar state.
 * Inputs are the repo/config, current sidecar state, parsed overview data, and
 * commit id. The returned runDurations map is threaded into buildSnapshot by
 * writeSidecar instead of being written onto state.
 */
export async function emitDerivedArtifacts({ repoRoot, config, state, overviewData, prdsByTaskId, generatedFromCommit } = {}) {
    if (!repoRoot || !config || !state || !overviewData) {
        throw new Error('emitDerivedArtifacts requires repoRoot, config, state, and overviewData')
    }

    const absoluteRepoRoot = path.resolve(repoRoot)
    const prdCarriers =
        prdsByTaskId ??
        loadPrdsByTaskId({
            repoRoot: absoluteRepoRoot,
            config,
            overviewData,
        })
    const recommendations = scoreRecommendations({
        byTaskId: state.byTaskId ?? {},
        overviewData,
        prdsByTaskId: prdCarriers,
        weights: config.recommendations?.weights,
        topN: config.recommendations?.topN,
    })
    const dependencyGraph = deriveDependencyGraph({
        byTaskId: state.byTaskId ?? {},
        overviewData,
        prdsByTaskId: prdCarriers,
        generatedFromCommit,
    })
    const runDurations = computeRunDurations({ repoRoot: absoluteRepoRoot, state, overviewData })
    const generatedAt = new Date().toISOString()
    const outputs = config.outputs ?? {}

    await atomicWriteFile(
        resolveMaybeAbsolute(absoluteRepoRoot, outputs.recommendationsJson),
        `${JSON.stringify({ recommendations, generatedAt, generatedFromCommit }, null, 2)}\n`,
    )
    await atomicWriteFile(resolveMaybeAbsolute(absoluteRepoRoot, outputs.dependencyGraphJson), `${JSON.stringify(dependencyGraph, null, 2)}\n`)

    return { runDurations }
}

function computeRunDurations({ repoRoot, state, overviewData }) {
    const durations = {}
    for (const run of overviewData.runs ?? []) {
        if (typeof run?.id !== 'string' || typeof run?.taskId !== 'string') {
            continue
        }
        const jobState = readJobStateForTask(repoRoot, state.byTaskId?.[run.taskId])
        const hours = completedHours(jobState)
        if (hours !== undefined) {
            durations[run.id] = hours
        }
    }
    return Object.fromEntries(Object.entries(durations).sort(([a], [b]) => a.localeCompare(b)))
}

function readJobStateForTask(repoRoot, taskState) {
    const artifactDir = taskState?.artifacts?.jobDir ?? taskState?.artifacts?.groupDir
    if (typeof artifactDir !== 'string') {
        return undefined
    }
    const jobStatePath = path.join(resolveMaybeAbsolute(repoRoot, artifactDir), 'job-state.json')
    if (!fs.existsSync(jobStatePath)) {
        return undefined
    }
    try {
        return JSON.parse(fs.readFileSync(jobStatePath, 'utf8'))
    } catch {
        return undefined
    }
}

function completedHours(jobState) {
    const createdMs = Date.parse(jobState?.createdAt)
    const completedMs = Date.parse(jobState?.completedAt)
    if (Number.isNaN(createdMs) || Number.isNaN(completedMs) || completedMs < createdMs) {
        return undefined
    }
    return Math.round(((completedMs - createdMs) / 36e5) * 10) / 10
}

function resolveMaybeAbsolute(base, value) {
    return path.isAbsolute(value) ? path.normalize(value) : path.resolve(base, value)
}
