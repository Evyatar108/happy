import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { codexuDefaultConfig } from './default-config.mjs'
import { IMPLEMENTING_PHASES, REVIEW_PHASES } from './derive-ralph-stage.mjs'
import { _resetUnknownPhaseWarnings, mergeAndWrite, walkRalphState, writeSidecar } from './sync-core.mjs'

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
        outputs: {
            ...codexuDefaultConfig.outputs,
            sidecarJson: path.join(repoRoot, 'plans', 'overview-ralph-state.json'),
            sidecarJs: path.join(repoRoot, 'plans', 'overview-ralph-state.js'),
        },
    }
}

function writeOverviewDataFile(repoRoot, overviewData) {
    const dataFile = path.join(repoRoot, 'overview-data.js')
    fs.mkdirSync(path.dirname(dataFile), { recursive: true })
    fs.writeFileSync(dataFile, `window.OVERVIEW_DATA = ${JSON.stringify(overviewData)};`)
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

describe('mergeAndWrite activityEvents', () => {
    test('emits a stage change event', async () => {
        const config = buildConfig(tempRoot)
        const currentState = buildState({
            TASK: { stage: 'planning', jobSlug: 'TASK', artifacts: { jobDir: '.ralph/jobs/TASK' } },
        })

        const result = await mergeAndWrite({
            repoRoot: tempRoot,
            config,
            currentState,
            updates: [buildUpsert('TASK', { stage: 'implementing', jobSlug: 'TASK', artifacts: { jobDir: '.ralph/jobs/TASK' } })],
            generatedFromCommit: 'def5678',
        })

        expect(result.activityEvents).toEqual([
            {
                ts: result.writtenAt,
                slug: 'TASK',
                taskId: 'TASK',
                prevStage: 'planning',
                newStage: 'implementing',
                changedFields: ['stage'],
                reason: 'sync',
            },
        ])
    })

    test('emits a storyCompletion change event', async () => {
        const config = buildConfig(tempRoot)
        const currentState = buildState({
            TASK: {
                stage: 'implementing',
                jobSlug: 'TASK',
                storyCompletion: { total: 3, passed: 1, blocked: 0, remaining: 2 },
            },
        })

        const result = await mergeAndWrite({
            repoRoot: tempRoot,
            config,
            currentState,
            updates: [
                buildUpsert('TASK', {
                    stage: 'implementing',
                    jobSlug: 'TASK',
                    storyCompletion: { total: 3, passed: 2, blocked: 0, remaining: 1 },
                }),
            ],
        })

        expect(result.activityEvents).toMatchObject([
            {
                slug: 'TASK',
                taskId: 'TASK',
                prevStage: 'implementing',
                newStage: 'implementing',
                changedFields: ['storyCompletion'],
                reason: 'sync',
            },
        ])
    })

    test('emits a removal event with newStage null', async () => {
        const config = buildConfig(tempRoot)
        const currentState = buildState({
            TASK: { stage: 'reviewing', jobSlug: 'TASK', artifacts: { jobDir: '.ralph/jobs/TASK' } },
        })

        const result = await mergeAndWrite({
            repoRoot: tempRoot,
            config,
            currentState,
            updates: [{ action: 'remove', taskId: 'TASK', kind: 'job', slug: 'TASK', touched: [], unmatchedFragment: [] }],
        })

        expect(result.activityEvents).toMatchObject([
            {
                slug: 'TASK',
                taskId: 'TASK',
                prevStage: 'reviewing',
                newStage: null,
                changedFields: ['stage'],
                reason: 'sync',
            },
        ])
    })

    test('emits a first-observation event with prevStage null', async () => {
        const config = buildConfig(tempRoot)

        const result = await mergeAndWrite({
            repoRoot: tempRoot,
            config,
            currentState: buildState({}),
            updates: [buildUpsert('TASK', { stage: 'planning', jobSlug: 'TASK', artifacts: { jobDir: '.ralph/jobs/TASK' } })],
        })

        expect(result.activityEvents).toMatchObject([
            {
                slug: 'TASK',
                taskId: 'TASK',
                prevStage: null,
                newStage: 'planning',
                changedFields: ['stage'],
                reason: 'sync',
            },
        ])
    })

    test('emits zero events for retain updates with no byTaskId diff', async () => {
        const config = buildConfig(tempRoot)
        const currentState = buildState({
            TASK: { stage: 'implementing', jobSlug: 'TASK', artifacts: { jobDir: '.ralph/jobs/TASK' } },
        })

        const result = await mergeAndWrite({
            repoRoot: tempRoot,
            config,
            currentState,
            updates: [{ action: 'retain', taskId: 'TASK', kind: 'job', slug: 'TASK', touched: [], unmatchedFragment: [], error: 'parse failed' }],
        })

        expect(result.activityEvents).toEqual([])
    })
})

describe('writeSidecar', () => {
    test('emits durable agent artifacts once in schema snapshot data-twin tasks-index order', async () => {
        const config = buildConfig(tempRoot)
        const overviewData = { tasks: [{ id: 'TASK', scope: 'pipeline' }], runs: [{ id: 'run-1', taskId: 'TASK', outcome: 'pass' }] }
        const state = buildState({
            TASK: { stage: 'implementing', jobSlug: 'TASK', artifacts: { jobDir: '.ralph/jobs/TASK' }, lastUpdatedAt: '2026-05-19T00:00:00Z' },
        })
        writeOverviewDataFile(tempRoot, overviewData)

        const targets = [
            path.resolve(tempRoot, config.outputs.snapshotSchema),
            path.resolve(tempRoot, config.outputs.snapshot),
            path.resolve(tempRoot, config.outputs.dataJson),
            path.resolve(tempRoot, config.outputs.tasksIndex),
        ]
        const agentRenameTargets = []
        const originalRenameSync = fs.renameSync.bind(fs)
        vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
            const finalPath = path.resolve(to)
            if (targets.includes(finalPath)) {
                agentRenameTargets.push(finalPath)
            }
            return originalRenameSync(from, to)
        })

        await writeSidecar({ repoRoot: tempRoot, config, state })

        expect(agentRenameTargets).toEqual(targets)
        expect(new Set(agentRenameTargets).size).toBe(4)
        for (const target of targets) {
            expect(fs.existsSync(target)).toBe(true)
        }
        const activityPath = path.resolve(tempRoot, config.outputs.activity)
        expect(fs.existsSync(activityPath)).toBe(true)
        expect(fs.statSync(activityPath).size).toBe(0)
        expect(JSON.parse(fs.readFileSync(path.resolve(tempRoot, config.outputs.snapshot), 'utf8')).tasks[0]).toMatchObject({
            id: 'TASK',
            ralph: { stage: 'implementing' },
        })
        expect(JSON.parse(fs.readFileSync(path.resolve(tempRoot, config.outputs.dataJson), 'utf8'))).toEqual(overviewData)
        expect(fs.readFileSync(path.resolve(tempRoot, config.outputs.tasksIndex), 'utf8')).toContain('## TASK')
    })
})

function buildState(byTaskId) {
    return {
        generatedAt: '2026-05-19T00:00:00.000Z',
        generatedFromCommit: 'abc1234',
        byTaskId,
        unmatched: [],
        unmatchedSummary: {},
    }
}

function buildUpsert(taskId, pipelineState) {
    return {
        action: 'upsert',
        taskId,
        kind: 'job',
        slug: taskId,
        touched: [],
        byTaskId: { [taskId]: pipelineState },
        newPipelineState: pipelineState,
        unmatchedFragment: [],
    }
}
