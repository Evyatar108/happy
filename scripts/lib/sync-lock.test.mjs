import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, test, vi } from 'vitest'

import { acquireLock, isLockHolderAlive, parseLockMetadata, readLockStatus, releaseLock } from './sync-lock.mjs'

const fixtures = []

afterEach(() => {
    vi.restoreAllMocks()
    for (const fixture of fixtures.splice(0)) {
        fs.rmSync(fixture, { recursive: true, force: true })
    }
})

function makeTempDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-lock-test-'))
    fixtures.push(dir)
    return dir
}

function writeLock(lockPath, metadata) {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true })
    fs.writeFileSync(lockPath, `${JSON.stringify(metadata)}\n`)
}

function setMtime(lockPath, timestampMs) {
    const date = new Date(timestampMs)
    fs.utimesSync(lockPath, date, date)
}

describe('sync-lock helpers', () => {
    test('parseLockMetadata returns normalized metadata for valid JSON', () => {
        expect(parseLockMetadata(Buffer.from('{"pid":123,"process":"watcher","startedAt":"2026-05-20T12:00:00.000Z"}'))).toEqual({
            pid: 123,
            process: 'watcher',
            startedAt: '2026-05-20T12:00:00.000Z',
        })
    })

    test('parseLockMetadata returns empty metadata for invalid JSON', () => {
        expect(parseLockMetadata('{not json')).toEqual({ pid: undefined, process: undefined, startedAt: undefined })
    })

    test('isLockHolderAlive returns true when zero-signal succeeds', () => {
        vi.spyOn(process, 'kill').mockImplementation(() => true)

        expect(isLockHolderAlive(123)).toBe(true)
    })

    test('isLockHolderAlive returns false for a dead PID', () => {
        vi.spyOn(process, 'kill').mockImplementation(() => {
            const error = new Error('missing')
            error.code = 'ESRCH'
            throw error
        })

        expect(isLockHolderAlive(123)).toBe(false)
    })

    test('readLockStatus returns missing when no lock file exists', async () => {
        const lockPath = path.join(makeTempDir(), 'overview-sync.lock')

        await expect(readLockStatus(lockPath)).resolves.toEqual({ state: 'missing' })
    })

    test('readLockStatus returns active for a fresh lock', async () => {
        const now = Date.UTC(2026, 4, 20, 12, 0, 0)
        const lockPath = path.join(makeTempDir(), 'overview-sync.lock')
        writeLock(lockPath, { pid: 123, process: 'watcher', startedAt: '2026-05-20T12:00:00.000Z' })
        setMtime(lockPath, now)

        const status = await readLockStatus(lockPath, {
            now: () => now + 1_000,
            isLockHolderAlive: () => false,
        })

        expect(status).toMatchObject({
            state: 'active',
            pid: 123,
            process: 'watcher',
            startedAt: '2026-05-20T12:00:00.000Z',
        })
        expect(status.mtime).toBeInstanceOf(Date)
    })

    test('readLockStatus returns stale for an old lock with a dead PID', async () => {
        const now = Date.UTC(2026, 4, 20, 12, 0, 0)
        const lockPath = path.join(makeTempDir(), 'overview-sync.lock')
        writeLock(lockPath, { pid: 123, process: 'watcher', startedAt: '2026-05-20T11:58:00.000Z' })
        setMtime(lockPath, now - 120_000)

        const status = await readLockStatus(lockPath, {
            now: () => now,
            staleAfterMs: 60_000,
            isLockHolderAlive: () => false,
        })

        expect(status).toMatchObject({ state: 'stale', pid: 123, process: 'watcher' })
        expect(status.mtime).toBeInstanceOf(Date)
    })

    test('readLockStatus trusts a live PID over stale mtime', async () => {
        const now = Date.UTC(2026, 4, 20, 12, 0, 0)
        const lockPath = path.join(makeTempDir(), 'overview-sync.lock')
        writeLock(lockPath, { pid: 123, process: 'watcher', startedAt: '2026-05-20T11:58:00.000Z' })
        setMtime(lockPath, now - 120_000)

        const status = await readLockStatus(lockPath, {
            now: () => now,
            staleAfterMs: 60_000,
            isLockHolderAlive: () => true,
        })

        expect(status).toMatchObject({ state: 'active', pid: 123, process: 'watcher' })
    })

    test('readLockStatus retries unparseable JSON before classifying', async () => {
        const now = Date.UTC(2026, 4, 20, 12, 0, 0)
        const lockPath = path.join(makeTempDir(), 'overview-sync.lock')
        fs.mkdirSync(path.dirname(lockPath), { recursive: true })
        fs.writeFileSync(lockPath, '{not json')
        setTimeout(() => {
            writeLock(lockPath, { pid: 456, process: 'standalone', startedAt: '2026-05-20T12:00:00.000Z' })
            setMtime(lockPath, now)
        }, 1)

        const status = await readLockStatus(lockPath, {
            now: () => now + 1_000,
            retryDelayMs: 20,
            isLockHolderAlive: () => false,
        })

        expect(status).toMatchObject({ state: 'active', pid: 456, process: 'standalone' })
    })

    test('readLockStatus returns stale when unparseable JSON remains after retry', async () => {
        const lockPath = path.join(makeTempDir(), 'overview-sync.lock')
        fs.mkdirSync(path.dirname(lockPath), { recursive: true })
        fs.writeFileSync(lockPath, '{not json')

        const status = await readLockStatus(lockPath, { retryDelayMs: 1 })

        expect(status.state).toBe('stale')
        expect(status.mtime).toBeInstanceOf(Date)
    })

    test('acquireLock and releaseLock still create and remove the lock file', async () => {
        const lockPath = path.join(makeTempDir(), 'overview-sync.lock')

        const handle = await acquireLock({ lockPath, processLabel: 'one-shot' })
        expect(fs.existsSync(lockPath)).toBe(true)
        expect(JSON.parse(fs.readFileSync(lockPath, 'utf8'))).toMatchObject({ pid: process.pid, process: 'one-shot' })

        await releaseLock(handle)
        expect(fs.existsSync(lockPath)).toBe(false)
    })
})
