import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { emitDerivedArtifacts } from './emit-derived-artifacts.mjs'

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'emit-derived-artifacts-test-'))
}

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(value))
}

function buildConfig(repoRoot) {
    return {
        outputs: {
            recommendationsJson: path.join(repoRoot, 'plans', 'recommendations.json'),
            dependencyGraphJson: path.join(repoRoot, 'plans', 'dependency-graph.json'),
        },
        recommendations: { weights: { stageUrgency: 1, dependencyState: 0, freshness: 0, priority: 0 }, topN: 10 },
    }
}

function buildState(byTaskId) {
    return { generatedAt: '2026-05-19T00:00:00.000Z', generatedFromCommit: 'abc1234', byTaskId, unmatched: [] }
}

let tempRoot

beforeEach(() => {
    tempRoot = makeTempDir()
})

afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true })
})

describe('computeRunDurations', () => {
    test('emits a duration only for the most-recent run when a taskId has multiple runs', async () => {
        const jobDir = path.join(tempRoot, '.ralph', 'jobs', 'my-task')
        writeJson(path.join(jobDir, 'job-state.json'), {
            createdAt: '2026-05-01T10:00:00Z',
            completedAt: '2026-05-01T12:00:00Z',
        })

        const state = buildState({
            'my-task': { stage: 'shipped', artifacts: { jobDir: path.join('.ralph', 'jobs', 'my-task') } },
        })
        const overviewData = {
            tasks: [{ id: 'my-task' }],
            runs: [
                { id: 'my-task/2026-05-01', taskId: 'my-task', ranAt: '2026-05-01T12:00:00Z', outcome: 'completed' },
                { id: 'my-task/2026-04-01', taskId: 'my-task', ranAt: '2026-04-01T08:00:00Z', outcome: 'completed' },
            ],
        }

        const { runDurations } = await emitDerivedArtifacts({
            repoRoot: tempRoot,
            config: buildConfig(tempRoot),
            state,
            overviewData,
            prdsByTaskId: {},
        })

        expect(Object.keys(runDurations)).toEqual(['my-task/2026-05-01'])
        expect(runDurations['my-task/2026-05-01']).toBe(2)
        expect(runDurations['my-task/2026-04-01']).toBeUndefined()
    })

    test('selects the run with the highest ranAt regardless of array order', async () => {
        const jobDir = path.join(tempRoot, '.ralph', 'jobs', 'order-task')
        writeJson(path.join(jobDir, 'job-state.json'), {
            createdAt: '2026-05-10T00:00:00Z',
            completedAt: '2026-05-10T01:00:00Z',
        })

        const state = buildState({
            'order-task': { stage: 'shipped', artifacts: { jobDir: path.join('.ralph', 'jobs', 'order-task') } },
        })
        const overviewData = {
            tasks: [{ id: 'order-task' }],
            runs: [
                { id: 'order-task/2026-05-10', taskId: 'order-task', ranAt: '2026-05-10T01:00:00Z', outcome: 'completed' },
                { id: 'order-task/2026-03-01', taskId: 'order-task', ranAt: '2026-03-01T00:00:00Z', outcome: 'completed' },
                { id: 'order-task/2026-05-09', taskId: 'order-task', ranAt: '2026-05-09T00:00:00Z', outcome: 'completed' },
            ],
        }

        const { runDurations } = await emitDerivedArtifacts({
            repoRoot: tempRoot,
            config: buildConfig(tempRoot),
            state,
            overviewData,
            prdsByTaskId: {},
        })

        expect(Object.keys(runDurations)).toEqual(['order-task/2026-05-10'])
    })

    test('emits durations for independent tasks separately', async () => {
        for (const slug of ['task-a', 'task-b']) {
            writeJson(path.join(tempRoot, '.ralph', 'jobs', slug, 'job-state.json'), {
                createdAt: '2026-05-01T10:00:00Z',
                completedAt: '2026-05-01T11:30:00Z',
            })
        }

        const state = buildState({
            'task-a': { stage: 'shipped', artifacts: { jobDir: '.ralph/jobs/task-a' } },
            'task-b': { stage: 'shipped', artifacts: { jobDir: '.ralph/jobs/task-b' } },
        })
        const overviewData = {
            tasks: [{ id: 'task-a' }, { id: 'task-b' }],
            runs: [
                { id: 'task-a/2026-05-01', taskId: 'task-a', ranAt: '2026-05-01T11:30:00Z', outcome: 'completed' },
                { id: 'task-b/2026-05-01', taskId: 'task-b', ranAt: '2026-05-01T11:30:00Z', outcome: 'completed' },
            ],
        }

        const { runDurations } = await emitDerivedArtifacts({
            repoRoot: tempRoot,
            config: buildConfig(tempRoot),
            state,
            overviewData,
            prdsByTaskId: {},
        })

        expect(Object.keys(runDurations).sort()).toEqual(['task-a/2026-05-01', 'task-b/2026-05-01'])
    })
})
