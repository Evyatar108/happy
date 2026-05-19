import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { WatchHandle } from '../../../../scripts/lib/watch-ralph-state.mjs'
import type { Plugin, ViteDevServer } from 'vite'
import { ralphStateWatcherPlugin } from '../../vite.config'
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

    it('rejects standalone startup when the vite-plugin watcher lock is fresh', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-05-19T10:00:00Z'))
        const fixture = makeRepoFixture({ tasks: ['task'] })
        writeLock(path.join(fixture.repoRoot, '.ralph/overview-sync.lock'), {
            pid: process.pid,
            process: 'vite-plugin',
            startedAt: '2026-05-19T09:59:59.000Z',
        })

        await expect(importWatcher().then(({ start }) => start({ repoRoot: fixture.repoRoot, processLabel: 'standalone' }))).rejects.toThrow(
            `another sync in progress (pid ${process.pid}, process vite-plugin, started 2026-05-19T09:59:59.000Z)`,
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

        writeJobState(fixture.repoRoot, '.ralph/jobs/broken', { orchestrator: { phase: '3', terminal: false } })
        lastWatcher?.emit('all', 'change', path.join(fixture.repoRoot, '.ralph/jobs/broken/job-state.json'))
        await vi.advanceTimersByTimeAsync(10)

        await vi.waitFor(() => expect(onWrite).toHaveBeenCalledTimes(1))
        expect(readSidecar(fixture.repoRoot).byTaskId.broken.stage).toBe('implementing')
        expect(handle.status.consecutiveFailures['job:broken']).toBeUndefined()
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

    it('removes a task when all bundle files for the deleted job disappear', async () => {
        vi.useFakeTimers()
        const fixture = makeRepoFixture({ tasks: ['obsolete'] })
        writeJobState(fixture.repoRoot, '.ralph/jobs/obsolete', { orchestrator: { phase: '3', terminal: false } })
        const onWrite = vi.fn()
        await startWatcher({ repoRoot: fixture.repoRoot, debounceMs: 10, onWrite })
        rmSync(path.join(fixture.repoRoot, '.ralph/jobs/obsolete'), { recursive: true, force: true })

        lastWatcher?.emit('all', 'unlinkDir', path.join(fixture.repoRoot, '.ralph/jobs/obsolete'))
        await vi.advanceTimersByTimeAsync(10)

        await vi.waitFor(() => expect(onWrite).toHaveBeenCalledWith(expect.objectContaining({ changedTaskIds: ['obsolete'] })))
        expect(readSidecar(fixture.repoRoot).byTaskId.obsolete).toBeUndefined()
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
        const deriveAffectedTaskUpdate = vi.fn()
        vi.doMock('../../../../scripts/lib/sync-core.mjs', async (importOriginal) => {
            const actual = await importOriginal<typeof import('../../../../scripts/lib/sync-core.mjs')>()
            deriveAffectedTaskUpdate.mockImplementation(actual.deriveAffectedTaskUpdate)
            return { ...actual, deriveAffectedTaskUpdate }
        })
        const handle = await startWatcher({ repoRoot: fixture.repoRoot, debounceMs: 10, onWrite })

        lastWatcher?.emit('all', 'change', path.join(fixture.repoRoot, '.ralph/brainstorms/idea/selected-direction.md'))
        await vi.advanceTimersByTimeAsync(10)
        await flushPromises()

        expect(handle.status.pendingChanges).toEqual([])
        expect(deriveAffectedTaskUpdate).not.toHaveBeenCalled()
        expect(onWrite).not.toHaveBeenCalled()
    })

    it('vite-plugin auto-start fires overview-ralph-state:update on debounced write', async () => {
        vi.useFakeTimers()
        const fixture = makeRepoFixture({ tasks: ['task'] })
        writeJobState(fixture.repoRoot, '.ralph/jobs/task', { orchestrator: { phase: '1', terminal: false } })
        const server = makeViteServer()
        const plugin = ralphStateWatcherPlugin({ repoRoot: fixture.repoRoot, importWatcher })

        await configureServer(plugin, server)
        writeJobState(fixture.repoRoot, '.ralph/jobs/task', { orchestrator: { phase: '5a', terminal: false } })
        lastWatcher?.emit('all', 'change', path.join(fixture.repoRoot, '.ralph/jobs/task/job-state.json'))
        await vi.advanceTimersByTimeAsync(2_000)

        await vi.waitFor(() => expect(server.ws.send).toHaveBeenCalledTimes(1))
        expect(server.ws.send).toHaveBeenCalledWith({ type: 'custom', event: 'overview-ralph-state:update' })
        server.close()
        await flushPromises()
        expect(lastWatcher?.closed).toBe(true)
    })

    it('refreshes sidecar unmatched on malformed JSON retain (F-001/F-013 regression)', async () => {
        vi.useFakeTimers()
        const fixture = makeRepoFixture({ tasks: ['flaky'] })
        writeJobState(fixture.repoRoot, '.ralph/jobs/flaky', { orchestrator: { phase: '3', terminal: false } })
        const onWrite = vi.fn()
        await startWatcher({ repoRoot: fixture.repoRoot, debounceMs: 10, onWrite })

        // Cold-start: byTaskId.flaky is implementing, unmatched has no entries for flaky.
        const beforeSidecar = readSidecar(fixture.repoRoot)
        expect(beforeSidecar.byTaskId.flaky.stage).toBe('implementing')
        expect((beforeSidecar.unmatched ?? []).filter((entry) => entry.slug === 'flaky')).toHaveLength(0)
        const priorEntry = beforeSidecar.byTaskId.flaky

        // Corrupt the job-state.json so deriveAffectedTaskUpdate returns a retain action.
        writeFileSync(path.join(fixture.repoRoot, '.ralph/jobs/flaky/job-state.json'), '{ malformed json')
        const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

        lastWatcher?.emit('all', 'change', path.join(fixture.repoRoot, '.ralph/jobs/flaky/job-state.json'))
        await vi.advanceTimersByTimeAsync(10)
        await flushPromises()
        await flushPromises()

        const afterSidecar = readSidecar(fixture.repoRoot)
        // F-001/F-013: unmatched slice MUST now contain the parse-error entry for the touched (kind, slug).
        const parseErrorEntries = (afterSidecar.unmatched ?? []).filter(
            (entry) => entry.kind === 'job' && entry.slug === 'flaky' && entry.reason === 'parse-error',
        )
        expect(parseErrorEntries).toHaveLength(1)
        // unmatchedSummary mirrors unmatched count.
        expect((afterSidecar.unmatchedSummary ?? {})['parse-error']).toBeGreaterThanOrEqual(1)
        // byTaskId entry is preserved (retain semantics: no mutation on parse-error).
        expect(afterSidecar.byTaskId.flaky).toEqual(priorEntry)
        // onWrite is NOT called for a retain-only flush (no taskIds changed).
        expect(onWrite).not.toHaveBeenCalled()
        // Retain warning is emitted on stderr.
        expect(stderr).toHaveBeenCalledWith(expect.stringContaining('watcher: retained job/flaky'))
    })

    it('removes a brainstorm-derived task when the slug directory is unlinked (F-003/F-014 regression)', async () => {
        vi.useFakeTimers()
        const fixture = makeRepoFixture({ tasks: ['idea'] })
        writeJson(path.join(fixture.repoRoot, '.ralph/brainstorms/idea/brainstorm.json'), { recommendedDirection: 'plan' })
        const onWrite = vi.fn()
        await startWatcher({ repoRoot: fixture.repoRoot, debounceMs: 10, onWrite })

        // Cold-start: brainstorm-derived entry should exist.
        const beforeSidecar = readSidecar(fixture.repoRoot)
        expect(beforeSidecar.byTaskId.idea).toBeDefined()
        expect(beforeSidecar.byTaskId.idea.entryPath).toBe('brainstorm-first')

        // Delete the brainstorm slug directory and emit a directory-level unlinkDir event.
        rmSync(path.join(fixture.repoRoot, '.ralph/brainstorms/idea'), { recursive: true, force: true })
        lastWatcher?.emit('all', 'unlinkDir', path.join(fixture.repoRoot, '.ralph/brainstorms/idea'))
        await vi.advanceTimersByTimeAsync(10)

        await vi.waitFor(() => expect(onWrite).toHaveBeenCalledWith(expect.objectContaining({ changedTaskIds: ['idea'] })))
        // F-003/F-014: the affected task entry MUST be removed from byTaskId after the debounce.
        expect(readSidecar(fixture.repoRoot).byTaskId.idea).toBeUndefined()
    })

    it('buffers chokidar events that race the cold-start walk (F-004 regression)', async () => {
        vi.useFakeTimers()
        const fixture = makeRepoFixture({ tasks: ['racy'] })
        writeJobState(fixture.repoRoot, '.ralph/jobs/racy', { orchestrator: { phase: '1', terminal: false } })
        const onWrite = vi.fn()
        const onError = vi.fn()

        // Override watchMock so the 'ready' event resolves immediately but we also synthesize
        // an 'all' event in the SAME microtask flush — this models the cold-start race where
        // a chokidar event fires before currentState is assigned. With F-004, the event MUST
        // be buffered (not lost, not throw on undefined currentState).
        watchMock = vi.fn((paths, options) => {
            void paths
            void options
            lastWatcher = new MockWatcher()
            queueMicrotask(() => {
                lastWatcher?.emit('ready')
                // Fire an 'all' event in the same microtask as 'ready' — this races the
                // cold-start walkRalphState/writeSidecar in the watcher's start() body.
                lastWatcher?.emit('all', 'change', path.join(fixture.repoRoot, '.ralph/jobs/racy/job-state.json'))
            })
            return lastWatcher
        })
        vi.doMock('chokidar', () => ({ watch: watchMock }))
        const { start } = await import('../../../../scripts/lib/watch-ralph-state.mjs')
        // Update the job-state BEFORE start completes its cold-start so the buffered event
        // triggers a re-derivation with the new phase.
        writeJobState(fixture.repoRoot, '.ralph/jobs/racy', { orchestrator: { phase: '5a', terminal: false } })
        const handle = await start({ repoRoot: fixture.repoRoot, debounceMs: 10, processLabel: 'unit-test', onWrite, onError })
        openHandles.push(handle)

        // Drain the debounce; the buffered event should produce a sidecar write WITHOUT
        // a 'mergeAndWrite requires currentState' error being routed to onError.
        await vi.advanceTimersByTimeAsync(10)
        await flushPromises()
        await flushPromises()

        expect(onError).not.toHaveBeenCalled()
        // Phase 5a corresponds to the 'reviewing' stage.
        expect(readSidecar(fixture.repoRoot).byTaskId.racy.stage).toBe('reviewing')
    })

    it('drops a change after MAX_FLUSH_RETRIES persistent flush failures (F-010 regression)', async () => {
        vi.useFakeTimers()
        const fixture = makeRepoFixture({ tasks: ['noisy'] })
        writeJobState(fixture.repoRoot, '.ralph/jobs/noisy', { orchestrator: { phase: '1', terminal: false } })
        const onWrite = vi.fn()
        const onError = vi.fn()

        // Stub mergeAndWrite to throw a persistent EBUSY-like error on every call.
        const mergeError = new Error('EBUSY: resource busy or locked')
        vi.doMock('../../../../scripts/lib/sync-core.mjs', async (importOriginal) => {
            const actual = await importOriginal<typeof import('../../../../scripts/lib/sync-core.mjs')>()
            return {
                ...actual,
                mergeAndWrite: vi.fn(async () => {
                    throw mergeError
                }),
            }
        })
        const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
        const handle = await startWatcher({ repoRoot: fixture.repoRoot, debounceMs: 10, onWrite, onError })

        // Emit a single change; the watcher's catch should re-enqueue + schedule a new flush.
        lastWatcher?.emit('all', 'change', path.join(fixture.repoRoot, '.ralph/jobs/noisy/job-state.json'))

        // Drive the retry loop. After 3 failures the change should be dropped with a stderr warning.
        for (let attempt = 0; attempt < 5; attempt += 1) {
            await vi.advanceTimersByTimeAsync(10)
            await flushPromises()
            await flushPromises()
        }

        // F-010: 4 onError calls — attempts 1, 2, 3 re-enqueue under the cap, attempt 4
        // exceeds MAX_FLUSH_RETRIES=3 and drops. mergeAndWrite throws on all four attempts.
        expect(onError).toHaveBeenCalledTimes(4)
        // Stderr drop warning is emitted on the 4th attempt (retries > MAX_FLUSH_RETRIES).
        expect(stderr).toHaveBeenCalledWith(expect.stringContaining('dropping job/noisy after 3 failed flush attempts'))
        // After drop, the pending queue is empty (no more retries scheduled for this slug).
        expect(handle.status.pendingChanges).toEqual([])
        expect(onWrite).not.toHaveBeenCalled()
    })

    it('does not drop changes when a transient flush failure clears (F-010 bonus)', async () => {
        vi.useFakeTimers()
        const fixture = makeRepoFixture({ tasks: ['blinky'] })
        writeJobState(fixture.repoRoot, '.ralph/jobs/blinky', { orchestrator: { phase: '1', terminal: false } })
        const onWrite = vi.fn()
        const onError = vi.fn()

        // Stub mergeAndWrite: fail on call 1, succeed on call 2 (delegates to the real impl).
        let calls = 0
        vi.doMock('../../../../scripts/lib/sync-core.mjs', async (importOriginal) => {
            const actual = await importOriginal<typeof import('../../../../scripts/lib/sync-core.mjs')>()
            return {
                ...actual,
                mergeAndWrite: vi.fn(async (args) => {
                    calls += 1
                    if (calls === 1) {
                        throw new Error('EBUSY: transient')
                    }
                    return actual.mergeAndWrite(args)
                }),
            }
        })
        const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
        await startWatcher({ repoRoot: fixture.repoRoot, debounceMs: 10, onWrite, onError })

        lastWatcher?.emit('all', 'change', path.join(fixture.repoRoot, '.ralph/jobs/blinky/job-state.json'))
        // First debounce — fails and re-enqueues.
        await vi.advanceTimersByTimeAsync(10)
        await flushPromises()
        await flushPromises()
        // Second debounce — succeeds.
        await vi.advanceTimersByTimeAsync(10)
        await flushPromises()
        await flushPromises()

        expect(onError).toHaveBeenCalledTimes(1)
        await vi.waitFor(() => expect(onWrite).toHaveBeenCalledTimes(1))
        // No drop warning emitted (we recovered before MAX_FLUSH_RETRIES).
        const dropCalls = stderr.mock.calls.filter(([msg]) => String(msg).includes('after 3 failed flush attempts'))
        expect(dropCalls).toHaveLength(0)
    })

    it('vite-plugin tolerates lock contention', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-05-19T10:00:00Z'))
        const fixture = makeRepoFixture({ tasks: ['task'] })
        writeLock(path.join(fixture.repoRoot, '.ralph/overview-sync.lock'), {
            pid: process.pid,
            process: 'standalone',
            startedAt: '2026-05-19T09:59:59.000Z',
        })
        const server = makeViteServer()
        const plugin = ralphStateWatcherPlugin({ repoRoot: fixture.repoRoot, importWatcher })

        await expect(configureServer(plugin, server)).resolves.toBeUndefined()

        expect(server.config.logger.warn).toHaveBeenCalledTimes(1)
        expect(server.config.logger.warn).toHaveBeenCalledWith(
            expect.stringContaining(
                `another watcher holds lock: another sync in progress (pid ${process.pid}, process standalone, started 2026-05-19T09:59:59.000Z)`,
            ),
        )
        expect(server.ws.send).not.toHaveBeenCalled()
    })
})

interface MockViteServer {
    ws: { send: ReturnType<typeof vi.fn> }
    config: { logger: { warn: ReturnType<typeof vi.fn> } }
    httpServer: EventEmitter
    close: () => void
}

function makeViteServer(): MockViteServer {
    const httpServer = new EventEmitter()
    return {
        ws: { send: vi.fn() },
        config: { logger: { warn: vi.fn() } },
        httpServer,
        close() {
            httpServer.emit('close')
        },
    }
}

async function configureServer(plugin: Plugin, server: MockViteServer): Promise<void> {
    const hook = plugin.configureServer
    if (typeof hook !== 'function') {
        throw new Error('expected plugin.configureServer function')
    }
    await hook.call({} as ThisParameterType<typeof hook>, server as unknown as ViteDevServer)
}

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
