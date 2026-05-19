import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { _resetUnknownPhaseWarnings, walkRalphState } from './sync-core.mjs'
import { IMPLEMENTING_PHASES, REVIEW_PHASES } from './derive-ralph-stage.mjs'

const KNOWN_PHASES = [...REVIEW_PHASES, ...IMPLEMENTING_PHASES]

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'sync-core-test-'))
}

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(value))
}

function buildConfig(repoRoot) {
    return {
        dataFile: path.join(repoRoot, 'overview-data.js'),
        ralphRoot: path.join(repoRoot, '.ralph'),
        ralphSubdirs: {
            jobs: path.join(repoRoot, '.ralph', 'jobs'),
            jobGroups: path.join(repoRoot, '.ralph', 'job-groups'),
            brainstorms: path.join(repoRoot, '.ralph', 'brainstorms'),
        },
        watcher: { ignored: [] },
    }
}

function writeOverviewData(repoRoot, slugs) {
    const tasks = slugs.map((id) => ({ id }))
    const dataFile = path.join(repoRoot, 'overview-data.js')
    fs.mkdirSync(path.dirname(dataFile), { recursive: true })
    fs.writeFileSync(dataFile, `window.OVERVIEW_DATA = ${JSON.stringify({ tasks })};`)
}

function writeJobState(repoRoot, slug, jobState) {
    const jobDir = path.join(repoRoot, '.ralph', 'jobs', slug)
    fs.mkdirSync(jobDir, { recursive: true })
    writeJson(path.join(jobDir, 'job-state.json'), jobState)
}

function writeGroupState(repoRoot, slug, groupJson) {
    const groupDir = path.join(repoRoot, '.ralph', 'job-groups', slug)
    fs.mkdirSync(groupDir, { recursive: true })
    writeJson(path.join(groupDir, 'group.json'), groupJson)
    writeJson(path.join(groupDir, 'job-state.json'), {})
}

let tempRoot
let stderrLines

beforeEach(() => {
    tempRoot = makeTempDir()
    stderrLines = []
    _resetUnknownPhaseWarnings()
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
        stderrLines.push(String(chunk))
        return true
    })
})

afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(tempRoot, { recursive: true, force: true })
})

describe('sync-core group isParallel derivation', () => {
    test('serial group (concurrency 1) has isParallel === false', async () => {
        const slug = 'serial-group'
        writeOverviewData(tempRoot, [slug])
        writeGroupState(tempRoot, slug, {
            schemaVersion: 2,
            name: slug,
            concurrency: 1,
            jobs: [{ name: 'step-a', phase: 1, dependsOn: [] }, { name: 'step-b', phase: 2, dependsOn: ['step-a'] }],
        })

        const config = buildConfig(tempRoot)
        const state = await walkRalphState({ repoRoot: tempRoot, config, generatedFromCommit: 'abc1234' })

        expect(state.byTaskId[slug]?.isParallel).toBe(false)
    })

    test('parallel group (concurrency > 1) has isParallel === true', async () => {
        const slug = 'parallel-group'
        writeOverviewData(tempRoot, [slug])
        writeGroupState(tempRoot, slug, {
            schemaVersion: 2,
            name: slug,
            concurrency: 4,
            jobs: [
                { name: 'job-a', phase: 2, dependsOn: ['job-base'] },
                { name: 'job-b', phase: 2, dependsOn: ['job-base'] },
            ],
        })

        const config = buildConfig(tempRoot)
        const state = await walkRalphState({ repoRoot: tempRoot, config, generatedFromCommit: 'abc1234' })

        expect(state.byTaskId[slug]?.isParallel).toBe(true)
    })

    test('group without concurrency but with shared phases has isParallel === true', async () => {
        const slug = 'implicit-parallel-group'
        writeOverviewData(tempRoot, [slug])
        writeGroupState(tempRoot, slug, {
            schemaVersion: 2,
            name: slug,
            jobs: [
                { name: 'job-a', phase: 2, dependsOn: [] },
                { name: 'job-b', phase: 2, dependsOn: [] },
            ],
        })

        const config = buildConfig(tempRoot)
        const state = await walkRalphState({ repoRoot: tempRoot, config, generatedFromCommit: 'abc1234' })

        expect(state.byTaskId[slug]?.isParallel).toBe(true)
    })

    test('group without concurrency and all distinct phases has isParallel === false', async () => {
        const slug = 'implicit-serial-group'
        writeOverviewData(tempRoot, [slug])
        writeGroupState(tempRoot, slug, {
            schemaVersion: 2,
            name: slug,
            jobs: [
                { name: 'job-a', phase: 1, dependsOn: [] },
                { name: 'job-b', phase: 2, dependsOn: ['job-a'] },
            ],
        })

        const config = buildConfig(tempRoot)
        const state = await walkRalphState({ repoRoot: tempRoot, config, generatedFromCommit: 'abc1234' })

        expect(state.byTaskId[slug]?.isParallel).toBe(false)
    })
})

describe('sync-core unknown phase warning', () => {
    test('emits a stderr warning for an unknown orchestrator.phase', async () => {
        const slug = 'my-test-job'
        const unknownPhase = '7'

        writeOverviewData(tempRoot, [slug])
        writeJobState(tempRoot, slug, {
            orchestrator: { phase: unknownPhase, terminal: false },
        })

        const config = buildConfig(tempRoot)
        await walkRalphState({ repoRoot: tempRoot, config, generatedFromCommit: 'abc1234' })

        const warnings = stderrLines.filter((line) => line.includes('[sync-ralph-state] unknown orchestrator.phase'))
        expect(warnings).toHaveLength(1)
        expect(warnings[0]).toContain(`unknown orchestrator.phase="${unknownPhase}"`)
        expect(warnings[0]).toContain(`for job ${slug}`)
        expect(warnings[0]).toContain('schema drift?')
    })

    test('emits the warning only once per (slug, phase) pair even when walkRalphState is called twice', async () => {
        const slug = 'my-test-job'
        const unknownPhase = '4.5'

        writeOverviewData(tempRoot, [slug])
        writeJobState(tempRoot, slug, {
            orchestrator: { phase: unknownPhase, terminal: false },
        })

        const config = buildConfig(tempRoot)
        await walkRalphState({ repoRoot: tempRoot, config, generatedFromCommit: 'abc1234' })
        await walkRalphState({ repoRoot: tempRoot, config, generatedFromCommit: 'abc1234' })

        const warnings = stderrLines.filter((line) => line.includes('[sync-ralph-state] unknown orchestrator.phase'))
        expect(warnings).toHaveLength(1)
    })

    test('does not emit a warning for known phases', async () => {
        for (const phase of KNOWN_PHASES) {
            const slug = `job-phase-${phase.replace('.', '-')}`
            writeOverviewData(tempRoot, [slug])
            writeJobState(tempRoot, slug, {
                orchestrator: { phase, terminal: false },
            })
        }

        const config = buildConfig(tempRoot)
        await walkRalphState({ repoRoot: tempRoot, config, generatedFromCommit: 'abc1234' })

        const warnings = stderrLines.filter((line) => line.includes('[sync-ralph-state] unknown orchestrator.phase'))
        expect(warnings).toHaveLength(0)
    })

    test('derived stage is still implementing for unknown phase', async () => {
        const slug = 'future-phase-job'
        const unknownPhase = '99'

        writeOverviewData(tempRoot, [slug])
        writeJobState(tempRoot, slug, {
            orchestrator: { phase: unknownPhase, terminal: false },
        })

        const config = buildConfig(tempRoot)
        const state = await walkRalphState({ repoRoot: tempRoot, config, generatedFromCommit: 'abc1234' })

        expect(state.byTaskId[slug]?.stage).toBe('implementing')
    })
})

describe('sync-core hasPrdWorthy derivation', () => {
    test('hasPrdWorthy is true when orchestrator.hasPrdWorthy is true', async () => {
        const slug = 'prd-worthy-job'

        writeOverviewData(tempRoot, [slug])
        writeJobState(tempRoot, slug, {
            orchestrator: { phase: '5a', hasPrdWorthy: true },
        })

        const config = buildConfig(tempRoot)
        const state = await walkRalphState({ repoRoot: tempRoot, config, generatedFromCommit: 'abc1234' })

        expect(state.byTaskId[slug]?.hasPrdWorthy).toBe(true)
    })

    test('hasPrdWorthy is absent when orchestrator.hasPrdWorthy is absent', async () => {
        const slug = 'no-prd-worthy-job'

        writeOverviewData(tempRoot, [slug])
        writeJobState(tempRoot, slug, {
            orchestrator: { phase: '5a' },
        })

        const config = buildConfig(tempRoot)
        const state = await walkRalphState({ repoRoot: tempRoot, config, generatedFromCommit: 'abc1234' })

        expect(Object.prototype.hasOwnProperty.call(state.byTaskId[slug] ?? {}, 'hasPrdWorthy')).toBe(false)
    })
})
