import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, test, vi } from 'vitest'

const fixtureRoots = []
const openHandles = []
let watchMock
let lastWatcher

class MockWatcher extends EventEmitter {
    closed = false

    async close() {
        this.closed = true
    }
}

afterEach(async () => {
    for (const handle of openHandles.splice(0)) {
        await handle.stop()
    }
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.doUnmock('chokidar')
    vi.doUnmock('./append-journal.mjs')
    vi.doUnmock('./emit-activity.mjs')
    vi.doUnmock('./sync-core.mjs')
    vi.resetModules()
    lastWatcher = undefined
    for (const fixtureRoot of fixtureRoots.splice(0)) {
        fs.rmSync(fixtureRoot, { recursive: true, force: true })
    }
})

describe('watch-ralph-state activity events', () => {
    test('iterates activityEvents returned by mergeAndWrite', async () => {
        vi.useFakeTimers()
        const fixture = makeRepoFixture({ tasks: ['task'] })
        writeJson(path.join(fixture.repoRoot, '.ralph/jobs/task/job-state.json'), { orchestrator: { phase: '1', terminal: false } })
        const activityEvents = [
            {
                ts: '2026-05-19T10:00:01.000Z',
                slug: 'task',
                taskId: 'task',
                prevStage: 'plan-ready',
                newStage: 'implementing',
                changedFields: ['stage'],
                reason: 'watch-event',
            },
            {
                ts: '2026-05-19T10:00:02.000Z',
                slug: 'task',
                taskId: 'task',
                prevStage: 'implementing',
                newStage: 'reviewing',
                changedFields: ['storyCompletion'],
                reason: 'watch-event',
            },
        ]
        const appendActivity = vi.fn()
        const appendJournalEntry = vi.fn()
        const mergeAndWrite = vi.fn(async (args) => ({
            state: args.currentState,
            writtenAt: '2026-05-19T10:00:03.000Z',
            changedTaskIds: ['task'],
            activityEvents,
        }))
        vi.doMock('./append-journal.mjs', () => ({ appendJournalEntry }))
        vi.doMock('./emit-activity.mjs', () => ({ appendActivity, rotateActivity: vi.fn() }))
        vi.doMock('./sync-core.mjs', async (importOriginal) => {
            const actual = await importOriginal()
            return { ...actual, mergeAndWrite }
        })
        const { start } = await import('./watch-ralph-state.mjs')
        const onWrite = vi.fn()
        const handle = await start({ repoRoot: fixture.repoRoot, debounceMs: 10, processLabel: 'unit-test', onWrite })
        openHandles.push(handle)

        lastWatcher.emit('all', 'change', path.join(fixture.repoRoot, '.ralph/jobs/task/job-state.json'))
        expect(handle.status.pendingChanges).toEqual([{ kind: 'job', slug: 'task' }])

        await vi.advanceTimersByTimeAsync(10)
        await vi.waitFor(() => expect(appendActivity).toHaveBeenCalledTimes(2))

        expect(appendActivity).toHaveBeenNthCalledWith(
            1,
            fixture.repoRoot,
            activityEvents[0],
            expect.objectContaining({ maxLines: 1000 }),
        )
        expect(appendActivity).toHaveBeenNthCalledWith(
            2,
            fixture.repoRoot,
            activityEvents[1],
            expect.objectContaining({ maxLines: 1000 }),
        )
        expect(appendJournalEntry).toHaveBeenCalledTimes(1)
        expect(appendJournalEntry).toHaveBeenCalledWith({
            repoRoot: fixture.repoRoot,
            taskId: 'task',
            ts: '2026-05-19T10:00:01.000Z',
            prevStage: 'plan-ready',
            newStage: 'implementing',
            slug: 'task',
        })
        expect(mergeAndWrite).toHaveBeenCalledTimes(1)
        expect(handle.status.pendingChanges).toEqual([])
        await vi.waitFor(() => expect(onWrite).toHaveBeenCalledWith(expect.objectContaining({ changedTaskIds: ['task'] })))
    })

    test('appends activityEvents before touching and releasing the lock', async () => {
        vi.useFakeTimers()
        const order = []
        const fixture = makeRepoFixture({ tasks: ['task'] })
        writeJson(path.join(fixture.repoRoot, '.ralph/jobs/task/job-state.json'), { orchestrator: { phase: '1', terminal: false } })
        const activityEvents = [
            {
                ts: '2026-05-19T10:00:01.000Z',
                slug: 'task',
                taskId: 'task',
                prevStage: 'plan-ready',
                newStage: 'implementing',
                changedFields: ['stage'],
                reason: 'watch-event',
            },
            {
                ts: '2026-05-19T10:00:02.000Z',
                slug: 'task',
                taskId: 'task',
                prevStage: 'implementing',
                newStage: 'reviewing',
                changedFields: ['storyCompletion'],
                reason: 'watch-event',
            },
        ]
        const appendActivity = vi.fn((_repoRoot, event) => {
            order.push(`append:${event.ts}`)
        })
        const appendJournalEntry = vi.fn((_entry) => {
            order.push('journal')
        })
        const mergeAndWrite = vi.fn(async (args) => {
            order.push('mergeAndWrite')
            return {
                state: args.currentState,
                writtenAt: '2026-05-19T10:00:03.000Z',
                changedTaskIds: ['task'],
                activityEvents,
            }
        })
        mockLock(order)
        vi.doMock('./append-journal.mjs', () => ({ appendJournalEntry }))
        vi.doMock('./emit-activity.mjs', () => ({ appendActivity, rotateActivity: vi.fn() }))
        vi.doMock('./sync-core.mjs', async (importOriginal) => {
            const actual = await importOriginal()
            return { ...actual, mergeAndWrite }
        })
        const { start } = await import('./watch-ralph-state.mjs')
        const handle = await start({ repoRoot: fixture.repoRoot, debounceMs: 10, processLabel: 'unit-test' })
        openHandles.push(handle)
        order.length = 0

        lastWatcher.emit('all', 'change', path.join(fixture.repoRoot, '.ralph/jobs/task/job-state.json'))
        await vi.advanceTimersByTimeAsync(10)
        await vi.waitFor(() => expect(appendActivity).toHaveBeenCalledTimes(2))

        expect(order).toEqual([
            'mergeAndWrite',
            'append:2026-05-19T10:00:01.000Z',
            'journal',
            'append:2026-05-19T10:00:02.000Z',
            'touch',
        ])

        await handle.stop()
        expect(order).toEqual([
            'mergeAndWrite',
            'append:2026-05-19T10:00:01.000Z',
            'journal',
            'append:2026-05-19T10:00:02.000Z',
            'touch',
            'release',
        ])
    })

    test('does not append activityEvents when mergeAndWrite throws', async () => {
        vi.useFakeTimers()
        const fixture = makeRepoFixture({ tasks: ['task'] })
        writeJson(path.join(fixture.repoRoot, '.ralph/jobs/task/job-state.json'), { orchestrator: { phase: '1', terminal: false } })
        const appendActivity = vi.fn()
        const mergeAndWrite = vi.fn(async () => {
            throw new Error('merge failed')
        })
        vi.doMock('./emit-activity.mjs', () => ({ appendActivity, rotateActivity: vi.fn() }))
        vi.doMock('./sync-core.mjs', async (importOriginal) => {
            const actual = await importOriginal()
            return { ...actual, mergeAndWrite }
        })
        const { start } = await import('./watch-ralph-state.mjs')
        const onError = vi.fn()
        const handle = await start({ repoRoot: fixture.repoRoot, debounceMs: 10, processLabel: 'unit-test', onError })
        openHandles.push(handle)

        lastWatcher.emit('all', 'change', path.join(fixture.repoRoot, '.ralph/jobs/task/job-state.json'))
        await vi.advanceTimersByTimeAsync(10)
        await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'merge failed' })))

        expect(mergeAndWrite).toHaveBeenCalled()
        expect(appendActivity).not.toHaveBeenCalled()
    })
})

describe('watch-ralph-state crew events', () => {
    test('ignores crew mailbox files through the chokidar ignored matcher', async () => {
        const fixture = makeRepoFixture({ tasks: ['task'] })
        const { start } = await import('./watch-ralph-state.mjs')

        const handle = await start({ repoRoot: fixture.repoRoot, processLabel: 'unit-test' })
        openHandles.push(handle)

        const options = watchMock.mock.calls[0][1]
        expect(options.ignored(path.join(fixture.repoRoot, '.crews/crews/alpha/members/bob/mailbox.json'))).toBe(true)
        expect(options.ignored(path.join(fixture.repoRoot, '.crews/crews/alpha/members/bob/manifest.json'))).toBe(false)
    })

    test('routes manifest changes to a crew-only flush without Ralph derivation', async () => {
        vi.useFakeTimers()
        const fixture = makeRepoFixture({ tasks: ['task'] })
        writeJson(path.join(fixture.repoRoot, '.ralph/jobs/task/job-state.json'), { orchestrator: { phase: '3', terminal: false } })
        const onWrite = vi.fn()
        const deriveAffectedTaskUpdate = vi.fn()
        const rescanCrewSessionsAndWrite = vi.fn(async ({ currentState }) => ({
            state: { ...currentState, generatedAt: '2026-05-20T13:00:00.000Z' },
            writtenAt: '2026-05-20T13:00:00.000Z',
        }))
        vi.doMock('./sync-core.mjs', async (importOriginal) => {
            const actual = await importOriginal()
            return { ...actual, deriveAffectedTaskUpdate, rescanCrewSessionsAndWrite }
        })
        const { start } = await import('./watch-ralph-state.mjs')
        const handle = await start({ repoRoot: fixture.repoRoot, debounceMs: 10, processLabel: 'unit-test', onWrite })
        openHandles.push(handle)

        lastWatcher.emit('all', 'change', path.join(fixture.repoRoot, '.crews/crews/alpha/members/bob/manifest.json'))
        expect(handle.status.pendingChanges).toEqual([{ kind: 'crews' }])
        await vi.advanceTimersByTimeAsync(10)

        await vi.waitFor(() => expect(rescanCrewSessionsAndWrite).toHaveBeenCalledTimes(1))
        expect(deriveAffectedTaskUpdate).not.toHaveBeenCalled()
        expect(rescanCrewSessionsAndWrite).toHaveBeenCalledWith(
            expect.objectContaining({ currentState: expect.objectContaining({ byTaskId: expect.any(Object) }) }),
        )
        expect(onWrite).toHaveBeenCalledWith({ writtenAt: '2026-05-20T13:00:00.000Z', changedTaskIds: [] })
    })

    test('debounces multiple crew events into one crew rescan', async () => {
        vi.useFakeTimers()
        const fixture = makeRepoFixture({ tasks: ['task'] })
        const rescanCrewSessionsAndWrite = vi.fn(async ({ currentState }) => ({ state: currentState, writtenAt: '2026-05-20T13:00:00.000Z' }))
        vi.doMock('./sync-core.mjs', async (importOriginal) => {
            const actual = await importOriginal()
            return { ...actual, rescanCrewSessionsAndWrite }
        })
        const { start } = await import('./watch-ralph-state.mjs')
        const handle = await start({ repoRoot: fixture.repoRoot, debounceMs: 10, processLabel: 'unit-test' })
        openHandles.push(handle)

        lastWatcher.emit('all', 'change', path.join(fixture.repoRoot, '.crews/crews/alpha/members/bob/manifest.json'))
        lastWatcher.emit('all', 'change', path.join(fixture.repoRoot, '.crews/sessions-configs/alpha.json'))
        expect(handle.status.pendingChanges).toEqual([{ kind: 'crews' }])
        await vi.advanceTimersByTimeAsync(10)

        await vi.waitFor(() => expect(rescanCrewSessionsAndWrite).toHaveBeenCalledTimes(1))
    })

    test('applies Ralph merge before crew rescan for mixed batches', async () => {
        vi.useFakeTimers()
        const order = []
        const fixture = makeRepoFixture({ tasks: ['task'] })
        writeJson(path.join(fixture.repoRoot, '.ralph/jobs/task/job-state.json'), { orchestrator: { phase: '1', terminal: false } })
        const deriveAffectedTaskUpdate = vi.fn(() => ({
            action: 'upsert',
            kind: 'job',
            slug: 'task',
            taskId: 'task',
            touched: [{ kind: 'job', slug: 'task' }],
            byTaskId: { task: { stage: 'reviewing' } },
            unmatchedFragment: [],
        }))
        const mergeAndWrite = vi.fn(async (args) => {
            order.push('merge')
            return {
                state: { ...args.currentState, generatedAt: '2026-05-20T13:00:00.000Z', byTaskId: { task: { stage: 'reviewing' } } },
                writtenAt: '2026-05-20T13:00:00.000Z',
                changedTaskIds: ['task'],
                activityEvents: [],
            }
        })
        const rescanCrewSessionsAndWrite = vi.fn(async ({ currentState }) => {
            order.push('rescan')
            expect(currentState.byTaskId.task.stage).toBe('reviewing')
            return { state: { ...currentState, generatedAt: '2026-05-20T13:00:01.000Z' }, writtenAt: '2026-05-20T13:00:01.000Z' }
        })
        vi.doMock('./sync-core.mjs', async (importOriginal) => {
            const actual = await importOriginal()
            return { ...actual, deriveAffectedTaskUpdate, mergeAndWrite, rescanCrewSessionsAndWrite }
        })
        const { start } = await import('./watch-ralph-state.mjs')
        const handle = await start({ repoRoot: fixture.repoRoot, debounceMs: 10, processLabel: 'unit-test' })
        openHandles.push(handle)

        lastWatcher.emit('all', 'change', path.join(fixture.repoRoot, '.ralph/jobs/task/job-state.json'))
        lastWatcher.emit('all', 'change', path.join(fixture.repoRoot, '.crews/crews/alpha/members/bob/manifest.json'))
        await vi.advanceTimersByTimeAsync(10)

        await vi.waitFor(() => expect(rescanCrewSessionsAndWrite).toHaveBeenCalledTimes(1))
        expect(order).toEqual(['merge', 'rescan'])
    })
})

function makeRepoFixture({ tasks }) {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-ralph-state-test-'))
    fixtureRoots.push(repoRoot)
    for (const dir of ['plans', '.ralph/jobs', '.ralph/job-groups', '.ralph/brainstorms']) {
        fs.mkdirSync(path.join(repoRoot, dir), { recursive: true })
    }
    fs.writeFileSync(
        path.join(repoRoot, 'plans/overview-data.js'),
        `window.OVERVIEW_DATA = ${JSON.stringify({ tasks: tasks.map((id) => ({ id })) }, null, 2)};\n`,
    )
    watchMock = vi.fn(() => {
        lastWatcher = new MockWatcher()
        queueMicrotask(() => lastWatcher.emit('ready'))
        return lastWatcher
    })
    vi.doMock('chokidar', () => ({ watch: watchMock }))
    return { repoRoot }
}

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function mockLock(order) {
    vi.doMock('./sync-lock.mjs', () => ({
        acquireLock: vi.fn(async ({ lockPath, processLabel }) => {
            order.push('acquire')
            return {
                lockPath,
                metadata: { process: processLabel },
                touch: vi.fn(async () => {
                    order.push('touch')
                }),
                release: vi.fn(async () => {
                    order.push('release')
                }),
            }
        }),
        releaseLock: vi.fn(async (handle) => {
            await handle?.release()
        }),
        touchLock: vi.fn(async (handle) => {
            await handle?.touch()
        }),
    }))
}
