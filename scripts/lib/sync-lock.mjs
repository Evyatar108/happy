import fs from 'node:fs/promises'
import path from 'node:path'

export const DEFAULT_STALE_AFTER_MS = 60_000

export async function acquireLock({ lockPath, processLabel, staleAfterMs = DEFAULT_STALE_AFTER_MS }) {
    if (!lockPath || !processLabel) {
        throw new Error('acquireLock requires lockPath and processLabel')
    }

    const absoluteLockPath = path.resolve(lockPath)
    await fs.mkdir(path.dirname(absoluteLockPath), { recursive: true })

    const metadata = { pid: process.pid, process: processLabel, startedAt: new Date().toISOString() }
    try {
        await writeLockFile(absoluteLockPath, metadata, 'wx')
        return createHandle(absoluteLockPath, metadata)
    } catch (error) {
        if (error?.code !== 'EEXIST') {
            throw error
        }
    }

    return acquireExistingLock({ lockPath: absoluteLockPath, metadata, staleAfterMs })
}

export async function releaseLock(handle) {
    if (!handle) {
        return
    }
    await handle.release()
}

export async function touchLock(handle) {
    if (!handle) {
        return
    }
    await handle.touch()
}

async function acquireExistingLock({ lockPath, metadata, staleAfterMs }) {
    const existing = await readExistingLock(lockPath)
    const ageMs = Math.max(0, Date.now() - existing.mtimeMs)
    if (ageMs < staleAfterMs) {
        throw new Error(formatLockDiagnostic(existing.metadata))
    }

    if (isLockHolderAlive(existing.metadata.pid)) {
        throw new Error(formatLockDiagnostic(existing.metadata))
    }

    await fs.rm(lockPath, { force: true })
    warnStaleLockRemoved({ ageMs, pid: existing.metadata.pid })

    try {
        await writeLockFile(lockPath, metadata, 'wx')
        return createHandle(lockPath, metadata)
    } catch (error) {
        if (error?.code === 'EEXIST') {
            return acquireExistingLock({ lockPath, metadata, staleAfterMs })
        }
        throw error
    }
}

async function writeLockFile(lockPath, metadata, flag) {
    await fs.writeFile(lockPath, `${JSON.stringify(metadata)}\n`, { encoding: 'utf8', flag })
}

async function readExistingLock(lockPath) {
    const [stats, contents] = await Promise.all([fs.stat(lockPath), fs.readFile(lockPath, 'utf8').catch(() => '')])
    return { metadata: parseLockMetadata(contents), mtimeMs: stats.mtimeMs }
}

export function parseLockMetadata(contents) {
    try {
        const parsed = JSON.parse(Buffer.isBuffer(contents) ? contents.toString('utf8') : String(contents))
        return {
            pid: Number.isInteger(parsed?.pid) ? parsed.pid : undefined,
            process: typeof parsed?.process === 'string' ? parsed.process : undefined,
            startedAt: typeof parsed?.startedAt === 'string' ? parsed.startedAt : undefined,
        }
    } catch {
        return { pid: undefined, process: undefined, startedAt: undefined }
    }
}

export async function readLockStatus(lockPath, opts = {}) {
    const absoluteLockPath = path.resolve(lockPath)
    const staleAfterMs = opts.staleAfterMs ?? DEFAULT_STALE_AFTER_MS
    const retryDelayMs = opts.retryDelayMs ?? 50
    const now = opts.now ?? (() => Date.now())
    const isAlive = opts.isLockHolderAlive ?? isLockHolderAlive

    const firstRead = await readLockFileStatus(absoluteLockPath)
    if (firstRead.state === 'missing') {
        return { state: 'missing' }
    }
    if (firstRead.state === 'unparseable') {
        await delay(retryDelayMs)
        const retryRead = await readLockFileStatus(absoluteLockPath)
        if (retryRead.state === 'missing') {
            return { state: 'missing' }
        }
        if (retryRead.state === 'unparseable') {
            return { state: 'stale', mtime: retryRead.mtime }
        }
        return classifyParsedLock(retryRead, { staleAfterMs, now, isAlive })
    }
    return classifyParsedLock(firstRead, { staleAfterMs, now, isAlive })
}

async function readLockFileStatus(lockPath) {
    let stats
    try {
        stats = await fs.stat(lockPath)
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return { state: 'missing' }
        }
        throw error
    }

    const contents = await fs.readFile(lockPath)
    const parsed = parseLockFile(contents)
    if (!parsed.ok) {
        return { state: 'unparseable', mtime: stats.mtime }
    }
    return { state: 'parsed', metadata: parsed.metadata, mtime: stats.mtime }
}

function classifyParsedLock(read, { staleAfterMs, now, isAlive }) {
    const metadata = read.metadata
    if (!hasCompleteLockMetadata(metadata)) {
        return {
            state: 'stale',
            pid: metadata.pid,
            process: metadata.process,
            startedAt: metadata.startedAt,
            mtime: read.mtime,
        }
    }

    const ageMs = Math.max(0, now() - read.mtime.getTime())
    const holderAlive = isAlive(metadata.pid)
    if (ageMs < staleAfterMs || holderAlive) {
        return {
            state: 'active',
            pid: metadata.pid,
            process: metadata.process,
            startedAt: metadata.startedAt,
            mtime: read.mtime,
        }
    }
    return {
        state: 'stale',
        pid: metadata.pid,
        process: metadata.process,
        startedAt: metadata.startedAt,
        mtime: read.mtime,
    }
}

function hasCompleteLockMetadata(metadata) {
    return Number.isInteger(metadata.pid) && typeof metadata.process === 'string' && typeof metadata.startedAt === 'string'
}

function parseLockFile(contents) {
    try {
        JSON.parse(Buffer.isBuffer(contents) ? contents.toString('utf8') : String(contents))
        return { ok: true, metadata: parseLockMetadata(contents) }
    } catch {
        return { ok: false }
    }
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function createHandle(lockPath, metadata) {
    return {
        lockPath,
        metadata,
        async release() {
            await fs.rm(lockPath, { force: true })
        },
        async touch() {
            const now = new Date()
            try {
                await fs.utimes(lockPath, now, now)
            } catch (error) {
                if (error?.code !== 'ENOENT') {
                    throw error
                }
            }
        },
    }
}

/**
 * Probe whether `pid` corresponds to a live process via the zero-signal trick.
 *
 * Returns true when:
 *   - `process.kill(pid, 0)` succeeds (signal accepted — process exists and is reachable);
 *   - the call throws with a non-`ESRCH` code (e.g., `EPERM` on Linux when the process
 *     exists but is owned by another user). We treat EPERM as "alive" because the only
 *     wrong-answer mode here (false-positive alive) preserves the existing lock —
 *     conservative and safe for the watcher contention diagnostic.
 *
 * Returns false only on `ESRCH` (no such process) or when pid is invalid.
 *
 * Residual risk (documented in plan.md Risk Areas #2): PID reuse on the same OS after
 * the watcher crashes can lead `isLockHolderAlive` to return true for an unrelated new
 * process that happens to inherit the recycled PID. This is tolerated because the
 * peer still sees the canonical fresh-lock diagnostic and a human operator can stat
 * the lock to confirm. On Windows specifically, `process.kill(pid, 0)` may report
 * success even when the wrong owner holds the PID — same residual.
 */
export function isLockHolderAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0) {
        return false
    }
    try {
        process.kill(pid, 0)
        return true
    } catch (error) {
        if (error?.code === 'ESRCH') {
            return false
        }
        return true
    }
}

function formatLockDiagnostic(metadata) {
    return `another sync in progress (pid ${formatMetadataValue(metadata.pid)}, process ${formatMetadataValue(
        metadata.process,
    )}, started ${formatMetadataValue(metadata.startedAt)})`
}

function formatMetadataValue(value) {
    return value ?? 'unknown'
}

function warnStaleLockRemoved({ ageMs, pid }) {
    process.stderr.write(`stale lock removed (mtime ${Math.round(ageMs)} ms, pid ${formatMetadataValue(pid)} not alive)\n`)
}

