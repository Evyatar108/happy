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
        const mergeAndWrite = vi.fn(async (args) => ({
            state: args.currentState,
            writtenAt: '2026-05-19T10:00:03.000Z',
            changedTaskIds: ['task'],
            activityEvents,
        }))
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
        expect(mergeAndWrite).toHaveBeenCalledTimes(1)
        expect(handle.status.pendingChanges).toEqual([])
        await vi.waitFor(() => expect(onWrite).toHaveBeenCalledWith(expect.objectContaining({ changedTaskIds: ['task'] })))
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
