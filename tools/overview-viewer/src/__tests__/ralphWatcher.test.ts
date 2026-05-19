import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { WatchHandle } from '../../../../scripts/lib/watch-ralph-state.mjs'
import type { OverviewRalphState } from '../types'

const fixtureRoots: string[] = []
const openHandles: WatchHandle[] = []
let watchMock: ReturnType<typeof vi.fn>
let lastWatcher: MockWatcher | undefined

class MockWatcher {
    readonly handlers = new Map<string, Array<(...args: unknown[]) => void>>()
    closed = false

    on(eventName: string, handler: (...args: unknown[]) => void): this {
        this.handlers.set(eventName, [...(this.handlers.get(eventName) ?? []), handler])
        return this
    }

    async close(): Promise<void> {
        this.closed = true
    }

    emit(eventName: string, ...args: unknown[]): void {
        for (const handler of this.handlers.get(eventName) ?? []) {
            handler(...args)
        }
    }
}

afterEach(async () => {
    for (const handle of openHandles.splice(0)) {
        await handle.stop()
    }
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.doUnmock('chokidar')
    vi.resetModules()
    lastWatcher = undefined
    for (const fixtureRoot of fixtureRoots.splice(0)) {
        rmSync(fixtureRoot, { recursive: true, force: true })
    }
})

describe('ralph watcher', () => {
    it('runs one cold-start write after the chokidar subscription is ready', async () => {
        const fixture = makeRepoFixture({ tasks: ['task'], config: { ralphRoot: '.custom-ralph', jobs: 'queued', jobGroups: 'teams', brainstorms: 'ideas' } })
        writeJobState(fixture.repoRoot, '.custom-ralph/queued/task', { orchestrator: { phase: '3', terminal: false } })
        const onWrite = vi.fn()

        const handle = await startWatcher({ repoRoot: fixture.repoRoot, configPath: fixture.configPath, onWrite })

        expect(watchMock).toHaveBeenCalledWith(
            [
                path.join(fixture.repoRoot, '.custom-ralph/queued'),
                path.join(fixture.repoRoot, '.custom-ralph/teams'),
                path.join(fixture.repoRoot, '.custom-ralph/ideas'),
            ],
            expect.objectContaining({
                awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
                ignoreInitial: true,
            }),
        )
        expect(readSidecar(fixture.repoRoot).byTaskId.task.stage).toBe('implementing')
        expect(handle.status.currentState?.byTaskId.task.stage).toBe('implementing')
        expect(onWrite).not.toHaveBeenCalled()
    })

    it('coalesces duplicate slug changes into one debounced merge write', async () => {
        vi.useFakeTimers()
        const fixture = makeRepoFixture({ tasks: ['task'] })
        writeJobState(fixture.repoRoot, '.ralph/jobs/task', { orchestrator: { phase: '1', terminal: false } })
        const onWrite = vi.fn()
        const handle = await startWatcher({ repoRoot: fixture.repoRoot, debounceMs: 25, onWrite })
        writeJobState(fixture.repoRoot, '.ralph/jobs/task', { orchestrator: { phase: '5a', terminal: false } })

        lastWatcher?.emit('all', 'change', toPosix(path.join(fixture.repoRoot, '.ralph/jobs/task/job-state.json')))
        lastWatcher?.emit('all', 'change', path.join(fixture.repoRoot, '.ralph/jobs/task/prd.json'))
        expect(handle.status.pendingChanges).toEqual([{ kind: 'job', slug: 'task' }])

        await vi.advanceTimersByTimeAsync(25)

        await vi.waitFor(() => expect(onWrite).toHaveBeenCalledTimes(1))
        expect(onWrite).toHaveBeenCalledWith(expect.objectContaining({ changedTaskIds: ['task'] }))
        expect(readSidecar(fixture.repoRoot).byTaskId.task.stage).toBe('reviewing')
    })

    it('rejects startup when the shared sync lock is already fresh', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-05-19T10:00:00Z'))
        const fixture = makeRepoFixture({ tasks: ['task'] })
        writeLock(path.join(fixture.repoRoot, '.ralph/overview-sync.lock'), {
            pid: process.pid,
            process: 'other-watcher',
            startedAt: '2026-05-19T09:59:59.000Z',
        })

        await expect(importWatcher().then(({ start }) => start({ repoRoot: fixture.repoRoot, processLabel: 'unit-test' }))).rejects.toThrow(
            `another sync in progress (pid ${process.pid}, process other-watcher, started 2026-05-19T09:59:59.000Z)`,
        )
    })

    it('touches the lock on a 30 second heartbeat and releases it on stop', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-05-19T10:00:00Z'))
        const fixture = makeRepoFixture({ tasks: ['task'] })
        const lockPath = path.join(fixture.repoRoot, '.ralph/overview-sync.lock')
        const handle = await startWatcher({ repoRoot: fixture.repoRoot })
        const originalMtime = statSync(lockPath).mtimeMs
        vi.setSystemTime(new Date('2026-05-19T10:00:30Z'))

        await vi.advanceTimersByTimeAsync(30_000)
        await vi.waitFor(() => expect(statSync(lockPath).mtimeMs).toBeGreaterThan(originalMtime))
        await handle.stop()

        expect(lastWatcher?.closed).toBe(true)
        expect(existsSync(lockPath)).toBe(false)
        expect(handle.status.stopped).toBe(true)
    })

    it('retains malformed JSON changes and warns once after repeated failures', async () => {
        vi.useFakeTimers()
        const fixture = makeRepoFixture({ tasks: ['broken'] })
        mkdirSync(path.join(fixture.repoRoot, '.ralph/jobs/broken'), { recursive: true })
        writeFileSync(path.join(fixture.repoRoot, '.ralph/jobs/broken/job-state.json'), '{ bad json')
        const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
        const onWrite = vi.fn()
        const handle = await startWatcher({ repoRoot: fixture.repoRoot, debounceMs: 10, onWrite })

        for (let index = 0; index < 10; index += 1) {
            lastWatcher?.emit('all', 'change', path.join(fixture.repoRoot, '.ralph/jobs/broken/job-state.json'))
            await vi.advanceTimersByTimeAsync(10)
            await flushPromises()
        }

        expect(onWrite).not.toHaveBeenCalled()
        expect(handle.status.consecutiveFailures['job:broken']).toBe(10)
        expect(stderr).toHaveBeenCalledWith(expect.stringContaining('watcher: broken failing repeatedly'))
        expect(stderr.mock.calls.filter(([message]) => String(message).includes('failing repeatedly'))).toHaveLength(1)
    })

    it('re-derives a job as plan-ready when only job-state.json is deleted', async () => {
        vi.useFakeTimers()
        const fixture = makeRepoFixture({ tasks: ['planned'] })
        writeJobState(fixture.repoRoot, '.ralph/jobs/planned', { orchestrator: { phase: '3', terminal: false } })
        writeJson(path.join(fixture.repoRoot, '.ralph/jobs/planned/prd.json'), { userStories: [] })
        const onWrite = vi.fn()
        await startWatcher({ repoRoot: fixture.repoRoot, debounceMs: 10, onWrite })
        rmSync(path.join(fixture.repoRoot, '.ralph/jobs/planned/job-state.json'))

        lastWatcher?.emit('all', 'unlink', path.join(fixture.repoRoot, '.ralph/jobs/planned/job-state.json'))
        await vi.advanceTimersByTimeAsync(10)

        await vi.waitFor(() => expect(onWrite).toHaveBeenCalledTimes(1))
        expect(readSidecar(fixture.repoRoot).byTaskId.planned.stage).toBe('plan-ready')
    })

    it('promotes a brainstorm when the shadowing job is deleted', async () => {
        vi.useFakeTimers()
        const fixture = makeRepoFixture({ tasks: ['same'] })
        writeJobState(fixture.repoRoot, '.ralph/jobs/same', { orchestrator: { phase: '3', terminal: false } })
        writeJson(path.join(fixture.repoRoot, '.ralph/brainstorms/same/brainstorm.json'), { recommendedDirection: 'plan' })
        const onWrite = vi.fn()
        await startWatcher({ repoRoot: fixture.repoRoot, debounceMs: 10, onWrite })
        rmSync(path.join(fixture.repoRoot, '.ralph/jobs/same'), { recursive: true, force: true })

        lastWatcher?.emit('all', 'unlinkDir', path.join(fixture.repoRoot, '.ralph/jobs/same'))
        await vi.advanceTimersByTimeAsync(10)
        await vi.waitFor(() => expect(onWrite).toHaveBeenCalledWith(expect.objectContaining({ changedTaskIds: ['same'] })))

        expect(readSidecar(fixture.repoRoot).byTaskId.same.stage).toBe('brainstorm-ready')
        expect(readSidecar(fixture.repoRoot).byTaskId.same.entryPath).toBe('brainstorm-first')
    })

    it('keeps worktree paths ignored through the chokidar ignored matcher', async () => {
        const fixture = makeRepoFixture({ tasks: ['task'] })

        await startWatcher({ repoRoot: fixture.repoRoot })

        const options = watchMock.mock.calls[0][1]
        expect(options.ignored(path.join(fixture.repoRoot, '.ralph/jobs/task/worktree/prd.json'))).toBe(true)
        expect(options.ignored(path.join(fixture.repoRoot, '.ralph/jobs/task/job-state.json'))).toBe(false)
    })

    it('drops selected-direction.md brainstorm touches without scheduling a write', async () => {
        vi.useFakeTimers()
        const fixture = makeRepoFixture({ tasks: ['idea'] })
        writeJson(path.join(fixture.repoRoot, '.ralph/brainstorms/idea/brainstorm.json'), { recommendedDirection: 'plan' })
        const onWrite = vi.fn()
        const handle = await startWatcher({ repoRoot: fixture.repoRoot, debounceMs: 10, onWrite })

        lastWatcher?.emit('all', 'change', path.join(fixture.repoRoot, '.ralph/brainstorms/idea/selected-direction.md'))
        await vi.advanceTimersByTimeAsync(10)
        await flushPromises()

        expect(handle.status.pendingChanges).toEqual([])
        expect(onWrite).not.toHaveBeenCalled()
    })
})

async function importWatcher(): Promise<typeof import('../../../../scripts/lib/watch-ralph-state.mjs')> {
    watchMock = vi.fn((paths, options) => {
        lastWatcher = new MockWatcher()
        queueMicrotask(() => lastWatcher?.emit('ready'))
        return lastWatcher
    })
    vi.doMock('chokidar', () => ({ watch: watchMock }))
    return import('../../../../scripts/lib/watch-ralph-state.mjs')
}

async function startWatcher(options: Parameters<(typeof import('../../../../scripts/lib/watch-ralph-state.mjs'))['start']>[0]): Promise<WatchHandle> {
    const { start } = await importWatcher()
    const handle = await start({ processLabel: 'unit-test', ...options })
    openHandles.push(handle)
    return handle
}

function makeRepoFixture({
    tasks,
    config,
}: {
    tasks: string[]
    config?: { ralphRoot: string; jobs: string; jobGroups: string; brainstorms: string }
}): { repoRoot: string; configPath?: string } {
    const repoRoot = mkdtempSync(path.join(tmpdir(), 'codexu-ralph-watcher-'))
    fixtureRoots.push(repoRoot)
    const ralphRoot = config?.ralphRoot ?? '.ralph'
    const jobs = config?.jobs ?? 'jobs'
    const jobGroups = config?.jobGroups ?? 'job-groups'
    const brainstorms = config?.brainstorms ?? 'brainstorms'
    for (const dir of ['plans', path.join(ralphRoot, jobs), path.join(ralphRoot, jobGroups), path.join(ralphRoot, brainstorms)]) {
        mkdirSync(path.join(repoRoot, dir), { recursive: true })
    }
    writeFileSync(
        path.join(repoRoot, 'plans/overview-data.js'),
        `window.OVERVIEW_DATA = ${JSON.stringify({ tasks: tasks.map((id) => ({ id })) }, null, 2)};\n`,
    )
    if (config) {
        const configPath = path.join(repoRoot, ralphRoot, 'overview-config.json')
        writeJson(configPath, {
            ralphRoot,
            ralphSubdirs: { jobs, jobGroups, brainstorms },
        })
        return { repoRoot, configPath }
    }
    return { repoRoot }
}

function writeJobState(repoRoot: string, dir: string, value: unknown): void {
    writeJson(path.join(repoRoot, dir, 'job-state.json'), value)
}

function writeJson(filePath: string, value: unknown): void {
    mkdirSync(path.dirname(filePath), { recursive: true })
    writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function readSidecar(repoRoot: string): OverviewRalphState {
    return JSON.parse(readFileSync(path.join(repoRoot, 'plans/overview-ralph-state.json'), 'utf8'))
}

function writeLock(lockPath: string, metadata: unknown): void {
    mkdirSync(path.dirname(lockPath), { recursive: true })
    writeFileSync(lockPath, `${JSON.stringify(metadata)}\n`)
    const now = new Date()
    utimesSync(lockPath, now, now)
}

function toPosix(value: string): string {
    return value.replace(/\\/g, '/')
}

async function flushPromises(): Promise<void> {
    await Promise.resolve()
    await Promise.resolve()
}
