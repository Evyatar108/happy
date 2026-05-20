import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, test, vi } from 'vitest'

import { codexuDefaultConfig } from './lib/default-config.mjs'

const fixtureRoots = []

afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.doUnmock('./lib/append-journal.mjs')
    vi.doUnmock('./lib/emit-activity.mjs')
    vi.doUnmock('./lib/path-utils.mjs')
    vi.doUnmock('./lib/sync-core.mjs')
    vi.doUnmock('./lib/sync-lock.mjs')
    vi.resetModules()
    for (const fixtureRoot of fixtureRoots.splice(0)) {
        fs.rmSync(fixtureRoot, { recursive: true, force: true })
    }
})

describe('sync-ralph-state one-shot journal events', () => {
    test('appends one journal entry per stage-changed activity event before releasing the lock', async () => {
        const order = []
        const appendJournalEntry = vi.fn(() => {
            order.push('journal')
        })
        const appendActivity = vi.fn((_repoRoot, event) => {
            order.push(`activity:${event.ts}`)
        })
        const activityEvents = [
            {
                ts: '2026-05-20T11:00:00.000Z',
                slug: 'task-a',
                kind: 'job',
                taskId: 'task-a',
                prevStage: 'planning',
                newStage: 'implementing',
                changedFields: ['stage'],
                reason: 'sync',
            },
            {
                ts: '2026-05-20T11:00:01.000Z',
                slug: 'task-a',
                kind: 'job',
                taskId: 'task-a',
                prevStage: 'implementing',
                newStage: 'implementing',
                changedFields: ['storyCompletion'],
                reason: 'sync',
            },
        ]
        vi.doMock('./lib/append-journal.mjs', () => ({ appendJournalEntry }))
        vi.doMock('./lib/emit-activity.mjs', () => ({ appendActivity }))
        vi.doMock('./lib/path-utils.mjs', () => ({
            resolveHeadShortSha: vi.fn(() => 'abc1234'),
        }))
        vi.doMock('./lib/sync-core.mjs', () => ({
            deriveActivityEvents: vi.fn(() => activityEvents),
            walkRalphState: vi.fn(async () => ({
                generatedAt: '2026-05-20T11:00:00.000Z',
                byTaskId: { 'task-a': { stage: 'implementing' } },
                unmatched: [],
                unmatchedSummary: {},
            })),
            writeSidecar: vi.fn(async () => {}),
        }))
        vi.doMock('./lib/sync-lock.mjs', () => ({
            acquireLock: vi.fn(async () => ({ lockPath: 'lock' })),
            releaseLock: vi.fn(async () => {
                order.push('release')
            }),
        }))
        const { runOneShot } = await import('./sync-ralph-state.mjs')

        await runOneShot({
            repoRoot: '/repo',
            config: {
                lockFile: '/repo/.ralph/overview-sync.lock',
                outputs: {
                    activity: '/repo/plans/overview-activity.jsonl',
                    activityBackup: '/repo/plans/overview-activity.previous.jsonl',
                    activityMaxLines: 1000,
                    sidecarJson: '/repo/plans/overview-ralph-state.json',
                },
            },
        })

        expect(appendActivity).toHaveBeenCalledTimes(2)
        expect(appendJournalEntry).toHaveBeenCalledTimes(1)
        expect(appendJournalEntry).toHaveBeenCalledWith({
            repoRoot: '/repo',
            taskId: 'task-a',
            ts: '2026-05-20T11:00:00.000Z',
            prevStage: 'planning',
            newStage: 'implementing',
            slug: 'task-a',
        })
        expect(order).toEqual(['activity:2026-05-20T11:00:00.000Z', 'journal', 'activity:2026-05-20T11:00:01.000Z', 'release'])
    })
})

describe('sync-ralph-state crew session subcommands', () => {
    test('serialized update and finalize invocations write explicit crew sessions in place', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-05-20T12:00:00.000Z'))
        const repoRoot = makeTempRepo()
        const config = buildConfig(repoRoot)
        writeOverviewData(repoRoot, ['TASK-123'])
        writeJson(config.outputs.sidecarJson, buildState({ 'TASK-123': { stage: 'implementing', jobSlug: 'TASK-123' } }))
        const { runFinalizeCrewSession, runUpdateCrewSession } = await import('./sync-ralph-state.mjs')

        await runUpdateCrewSession({
            repoRoot,
            config,
            taskId: 'TASK-123',
            stage: 'implementing',
            refJson: JSON.stringify({ crewName: 'crew-a', memberName: 'alice', startedAt: '2026-05-20T10:00:00.000Z' }),
        })
        await runUpdateCrewSession({
            repoRoot,
            config,
            taskId: 'TASK-123',
            stage: 'implementing',
            refJson: JSON.stringify({
                crewName: 'crew-a',
                memberName: 'alice',
                startedAt: '2026-05-20T10:00:00.000Z',
                sessionId: 'session-a',
                transcriptPath: 'C:\\Users\\evmitran\\session-a.jsonl',
            }),
        })

        let entries = readJson(config.outputs.sidecarJson).byTaskId['TASK-123'].crewSessions.implementing
        expect(entries).toHaveLength(1)
        expect(entries[0]).toMatchObject({
            crewName: 'crew-a',
            memberName: 'alice',
            sessionId: 'session-a',
            transcriptPath: 'C:\\Users\\evmitran\\session-a.jsonl',
            _isExplicit: true,
        })

        await runFinalizeCrewSession({
            repoRoot,
            config,
            taskId: 'TASK-123',
            stage: 'implementing',
            memberName: 'alice',
            crewName: 'crew-a',
            outcome: 'completed',
            summary: 'done',
        })

        entries = readJson(config.outputs.sidecarJson).byTaskId['TASK-123'].crewSessions.implementing
        expect(entries).toHaveLength(1)
        expect(entries[0]).toMatchObject({
            sessionId: 'session-a',
            endedAt: '2026-05-20T12:00:00.000Z',
            outcome: 'completed',
            summary: 'done',
            _isExplicit: true,
        })
    })

    test('watcher-held lock fails fast before mutating the sidecar', async () => {
        const repoRoot = makeTempRepo()
        const config = buildConfig(repoRoot)
        writeOverviewData(repoRoot, ['TASK-123'])
        const initialState = buildState({ 'TASK-123': { stage: 'implementing', jobSlug: 'TASK-123' } })
        writeJson(config.outputs.sidecarJson, initialState)
        writeJson(config.lockFile, { pid: process.pid, process: 'watcher', startedAt: '2026-05-20T11:59:59.000Z' })
        const { runUpdateCrewSession } = await import('./sync-ralph-state.mjs')

        await expect(
            runUpdateCrewSession({
                repoRoot,
                config,
                taskId: 'TASK-123',
                stage: 'implementing',
                refJson: JSON.stringify({ crewName: 'crew-a', memberName: 'alice', startedAt: '2026-05-20T10:00:00.000Z' }),
            }),
        ).rejects.toThrow(`another sync in progress (pid ${process.pid}, process watcher, started 2026-05-20T11:59:59.000Z)`)
        expect(readJson(config.outputs.sidecarJson)).toEqual(initialState)
    })

    test('rejects invalid stage and outcome with clear diagnostics', async () => {
        const repoRoot = makeTempRepo()
        const config = buildConfig(repoRoot)
        const { runFinalizeCrewSession, runUpdateCrewSession } = await import('./sync-ralph-state.mjs')

        await expect(
            runUpdateCrewSession({
                repoRoot,
                config,
                taskId: 'TASK-123',
                stage: 'not-a-stage',
                refJson: JSON.stringify({ crewName: 'crew-a', memberName: 'alice', startedAt: '2026-05-20T10:00:00.000Z' }),
            }),
        ).rejects.toThrow('invalid Ralph stage: not-a-stage')
        await expect(
            runFinalizeCrewSession({
                repoRoot,
                config,
                taskId: 'TASK-123',
                stage: 'implementing',
                memberName: 'alice',
                outcome: 'paused',
            }),
        ).rejects.toThrow('invalid crew session outcome: paused')
    })

    test('parses crew session subcommand arguments', async () => {
        const { parseArgs } = await import('./sync-ralph-state.mjs')

        expect(parseArgs(['--update-crew-session', 'TASK-123', 'implementing', '--json', '{"crewName":"crew-a"}'])).toMatchObject({
            command: 'updateCrewSession',
            taskId: 'TASK-123',
            stage: 'implementing',
            refJson: '{"crewName":"crew-a"}',
        })
        expect(
            parseArgs(['--finalize-crew-session', 'TASK-123', 'implementing', '--member', 'alice', '--outcome', 'handed-off', '--summary', 'done']),
        ).toMatchObject({
            command: 'finalizeCrewSession',
            taskId: 'TASK-123',
            stage: 'implementing',
            memberName: 'alice',
            outcome: 'handed-off',
            summary: 'done',
        })
    })
})

function makeTempRepo() {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-ralph-state-crew-'))
    fixtureRoots.push(repoRoot)
    for (const dir of ['plans', 'tasks', '.ralph/jobs', '.ralph/job-groups', '.ralph/brainstorms', '.crews']) {
        fs.mkdirSync(path.join(repoRoot, dir), { recursive: true })
    }
    return repoRoot
}

function buildConfig(repoRoot) {
    return {
        ...codexuDefaultConfig,
        dataFile: path.join(repoRoot, 'plans', 'overview-data.js'),
        ralphRoot: path.join(repoRoot, '.ralph'),
        crewsRoot: path.join(repoRoot, '.crews'),
        ralphSubdirs: {
            jobs: path.join(repoRoot, '.ralph', 'jobs'),
            jobGroups: path.join(repoRoot, '.ralph', 'job-groups'),
            brainstorms: path.join(repoRoot, '.ralph', 'brainstorms'),
        },
        outputs: Object.fromEntries(
            Object.entries(codexuDefaultConfig.outputs).map(([key, value]) => [
                key,
                key === 'activityMaxLines' ? value : path.join(repoRoot, value),
            ]),
        ),
        lockFile: path.join(repoRoot, '.ralph', 'overview-sync.lock'),
    }
}

function writeOverviewData(repoRoot, taskIds) {
    fs.writeFileSync(
        path.join(repoRoot, 'plans', 'overview-data.js'),
        `window.OVERVIEW_DATA = ${JSON.stringify({ tasks: taskIds.map((id) => ({ id })) })};`,
    )
}

function buildState(byTaskId) {
    return { generatedAt: '2026-05-20T10:00:00.000Z', generatedFromCommit: 'abc1234', byTaskId }
}

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(value))
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}
