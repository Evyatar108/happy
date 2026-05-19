import fs from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_STALE_AFTER_MS = 60_000

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

    if (isLiveProcess(existing.metadata.pid)) {
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

function parseLockMetadata(contents) {
    try {
        const parsed = JSON.parse(contents)
        return {
            pid: Number.isInteger(parsed?.pid) ? parsed.pid : undefined,
            process: typeof parsed?.process === 'string' ? parsed.process : undefined,
            startedAt: typeof parsed?.startedAt === 'string' ? parsed.startedAt : undefined,
        }
    } catch {
        return { pid: undefined, process: undefined, startedAt: undefined }
    }
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

function isLiveProcess(pid) {
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

