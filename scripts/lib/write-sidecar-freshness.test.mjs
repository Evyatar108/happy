import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'

import { codexuDefaultConfig } from './default-config.mjs'
import { writeSidecar } from './sync-core.mjs'

let tempRoot

afterEach(() => {
    if (tempRoot) {
        fs.rmSync(tempRoot, { recursive: true, force: true })
        tempRoot = undefined
    }
})

describe('writeSidecar derived artifact freshness', () => {
    test('embeds the recommendations and dependency graph written in the same sidecar pass', async () => {
        tempRoot = makeRepoFixture()
        const config = buildConfig()
        const state = buildState()

        await writeSidecar({ repoRoot: tempRoot, config, state })

        const snapshot = readJson(path.join(tempRoot, config.outputs.snapshot))
        const recommendations = readJson(path.join(tempRoot, config.outputs.recommendationsJson))
        const graph = readJson(path.join(tempRoot, config.outputs.dependencyGraphJson))
        const sidecar = readJson(path.join(tempRoot, config.outputs.sidecarJson))

        expect(snapshot.recommendations).toEqual(recommendations.recommendations)
        expect(snapshot.dependencyGraph).toEqual(graph)
        expect(snapshot.runDurations).toEqual({ 'run-alpha': 3.5 })
        expect(recommendations.generatedFromCommit).toBe('commit-123')
        expect(sidecar).not.toHaveProperty('runDurations')
        expect(state).not.toHaveProperty('runDurations')
    })

    test('uses overridden derived artifact paths for both writing and snapshot embedding', async () => {
        tempRoot = makeRepoFixture()
        const config = buildConfig({ recommendationsJson: 'tmp/custom-rec.json', dependencyGraphJson: 'tmp/custom-dep.json' })
        const state = buildState()

        await writeSidecar({ repoRoot: tempRoot, config, state })

        const snapshot = readJson(path.join(tempRoot, config.outputs.snapshot))
        const recommendations = readJson(path.join(tempRoot, 'tmp/custom-rec.json'))
        const graph = readJson(path.join(tempRoot, 'tmp/custom-dep.json'))

        expect(fs.existsSync(path.join(tempRoot, 'tmp/custom-rec.json'))).toBe(true)
        expect(fs.existsSync(path.join(tempRoot, 'tmp/custom-dep.json'))).toBe(true)
        expect(snapshot.recommendations).toEqual(recommendations.recommendations)
        expect(snapshot.dependencyGraph).toEqual(graph)
        expect(readJson(path.join(tempRoot, config.outputs.sidecarJson))).not.toHaveProperty('runDurations')
    })
})

function makeRepoFixture() {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'write-sidecar-freshness-'))
    writeOverviewData(repoRoot)
    writeJson(path.join(repoRoot, '.ralph/jobs/alpha/prd.json'), {
        userStories: [
            { id: 'US-001', passes: true },
            { id: 'US-002', dependencies: ['US-001'], passes: false },
        ],
    })
    writeJson(path.join(repoRoot, '.ralph/jobs/beta/prd.json'), {
        userStories: [{ id: 'US-001', passes: true }],
    })
    writeJson(path.join(repoRoot, '.ralph/jobs/alpha/job-state.json'), {
        createdAt: '2026-05-19T00:00:00Z',
        completedAt: '2026-05-19T03:30:00Z',
    })
    writeJson(path.join(repoRoot, '.ralph/jobs/beta/job-state.json'), {
        createdAt: '2026-05-19T00:00:00Z',
    })
    fs.mkdirSync(path.join(repoRoot, '.ralph/job-groups'), { recursive: true })
    fs.mkdirSync(path.join(repoRoot, '.ralph/brainstorms'), { recursive: true })
    return repoRoot
}

function writeOverviewData(repoRoot) {
    const overviewData = {
        tasks: [
            { id: 'alpha', priority: 0.9, blocks: ['beta'] },
            { id: 'beta', priority: 0.2 },
            { id: 'gamma', priority: 0.5 },
        ],
        runs: [
            { id: 'run-alpha', taskId: 'alpha', outcome: 'pass' },
            { id: 'run-beta', taskId: 'beta', outcome: 'pass' },
        ],
        spawnedFrom: { gamma: 'alpha' },
    }
    fs.mkdirSync(path.join(repoRoot, 'plans'), { recursive: true })
    fs.writeFileSync(path.join(repoRoot, 'plans/overview-data.js'), `window.OVERVIEW_DATA = ${JSON.stringify(overviewData, null, 2)};\n`)
}

function buildConfig(outputOverrides = {}) {
    return {
        ...codexuDefaultConfig,
        outputs: { ...codexuDefaultConfig.outputs, ...outputOverrides },
    }
}

function buildState() {
    return {
        generatedAt: '2026-05-19T04:00:00.000Z',
        generatedFromCommit: 'commit-123',
        byTaskId: {
            alpha: {
                stage: 'review-fix',
                jobSlug: 'alpha',
                artifacts: { jobDir: '.ralph/jobs/alpha' },
                lastUpdatedAt: '2026-05-10T00:00:00Z',
            },
            beta: {
                stage: 'implementing',
                jobSlug: 'beta',
                artifacts: { jobDir: '.ralph/jobs/beta' },
                lastUpdatedAt: '2026-05-18T00:00:00Z',
            },
        },
        unmatched: [],
        unmatchedSummary: {},
    }
}

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}
