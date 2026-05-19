import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { acquireLock, releaseLock, touchLock } from '../../../../scripts/lib/sync-lock.mjs'

const fixtureRoots: string[] = []

afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    for (const fixtureRoot of fixtureRoots.splice(0)) {
        rmSync(fixtureRoot, { recursive: true, force: true })
    }
})

describe('sync-lock', () => {
    it('acquires a missing lock with process metadata and releases it', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-05-19T10:00:00Z'))
        const lockPath = makeLockPath()

        const handle = await acquireLock({ lockPath, processLabel: 'unit-test', staleAfterMs: 60_000 })

        expect(handle.lockPath).toBe(path.resolve(lockPath))
        expect(handle.metadata).toEqual({ pid: process.pid, process: 'unit-test', startedAt: '2026-05-19T10:00:00.000Z' })
        expect(JSON.parse(readFileSync(lockPath, 'utf8'))).toEqual(handle.metadata)

        await releaseLock(handle)
        expect(existsSync(lockPath)).toBe(false)
    })

    it('fast-fails on a fresh lock with the canonical diagnostic', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-05-19T10:00:00Z'))
        const lockPath = makeLockPath()
        writeLock(lockPath, { pid: 4321, process: 'watcher', startedAt: '2026-05-19T09:59:30.000Z' }, new Date())

        await expect(acquireLock({ lockPath, processLabel: 'one-shot', staleAfterMs: 60_000 })).rejects.toThrow(
            'another sync in progress (pid 4321, process watcher, started 2026-05-19T09:59:30.000Z)',
        )
    })

    it('overwrites a stale lock when the recorded pid is gone', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-05-19T10:00:00Z'))
        const lockPath = makeLockPath()
        writeLock(lockPath, { pid: 9876, process: 'watcher', startedAt: '2026-05-19T09:00:00.000Z' }, new Date('2026-05-19T09:58:00Z'))
        const kill = vi.spyOn(process, 'kill').mockImplementation((() => {
            throw Object.assign(new Error('not found'), { code: 'ESRCH' })
        }) as typeof process.kill)
        const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

        const handle = await acquireLock({ lockPath, processLabel: 'replacement', staleAfterMs: 60_000 })

        expect(kill).toHaveBeenCalledWith(9876, 0)
        expect(stderr).toHaveBeenCalledWith(expect.stringContaining('stale lock removed (mtime 120000 ms, pid 9876 not alive)'))
        expect(JSON.parse(readFileSync(lockPath, 'utf8'))).toEqual(handle.metadata)
        expect(handle.metadata.process).toBe('replacement')
    })

    it('treats EPERM from the pid liveness probe as an active lock', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-05-19T10:00:00Z'))
        const lockPath = makeLockPath()
        writeLock(lockPath, { pid: 2468, process: 'watcher', startedAt: '2026-05-19T09:00:00.000Z' }, new Date('2026-05-19T09:58:00Z'))
        vi.spyOn(process, 'kill').mockImplementation((() => {
            throw Object.assign(new Error('permission denied'), { code: 'EPERM' })
        }) as typeof process.kill)

        await expect(acquireLock({ lockPath, processLabel: 'replacement', staleAfterMs: 60_000 })).rejects.toThrow(
            'another sync in progress (pid 2468, process watcher, started 2026-05-19T09:00:00.000Z)',
        )
    })

    it('overwrites stale unparseable JSON and reports unknown metadata', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-05-19T10:00:00Z'))
        const lockPath = makeLockPath()
        mkdirSync(path.dirname(lockPath), { recursive: true })
        writeFileSync(lockPath, '{ bad json')
        utimesSync(lockPath, new Date('2026-05-19T09:58:00Z'), new Date('2026-05-19T09:58:00Z'))
        const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

        const handle = await acquireLock({ lockPath, processLabel: 'replacement', staleAfterMs: 60_000 })

        expect(stderr).toHaveBeenCalledWith(expect.stringContaining('stale lock removed (mtime 120000 ms, pid unknown not alive)'))
        expect(JSON.parse(readFileSync(lockPath, 'utf8'))).toEqual(handle.metadata)
    })

    it('touch refreshes mtime and tolerates a missing lock file', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-05-19T10:00:00Z'))
        const lockPath = makeLockPath()
        const handle = await acquireLock({ lockPath, processLabel: 'unit-test', staleAfterMs: 60_000 })
        const originalMtime = statSync(lockPath).mtimeMs
        vi.setSystemTime(new Date('2026-05-19T10:00:10Z'))

        await touchLock(handle)

        expect(statSync(lockPath).mtimeMs).toBeGreaterThan(originalMtime)

        rmSync(lockPath, { force: true })
        await expect(touchLock(handle)).resolves.toBeUndefined()
    })

    it('release tolerates a missing lock file', async () => {
        const lockPath = makeLockPath()
        const handle = await acquireLock({ lockPath, processLabel: 'unit-test', staleAfterMs: 60_000 })
        rmSync(lockPath, { force: true })

        await expect(releaseLock(handle)).resolves.toBeUndefined()
    })
})

function makeLockPath(): string {
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'codexu-sync-lock-'))
    fixtureRoots.push(fixtureRoot)
    return path.join(fixtureRoot, '.ralph/overview-sync.lock')
}

function writeLock(lockPath: string, metadata: unknown, mtime: Date): void {
    mkdirSync(path.dirname(lockPath), { recursive: true })
    writeFileSync(lockPath, `${JSON.stringify(metadata)}\n`)
    utimesSync(lockPath, mtime, mtime)
}

