import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_SPAWN_MEMBER_CLI = 'D:/ai-developer-toolkit/plugins/crews/tools/spawn-member.js'
const DEFAULT_POLL_TIMEOUT_MS = 10_000
const DEFAULT_POLL_INTERVAL_MS = 500
const WATCHER_LOCK_PROCESSES = new Set(['standalone', 'vite-plugin', 'watcher'])

export async function runWorkOnViaCrew({
    repoRoot,
    config,
    taskId,
    stage,
    crewName,
    now = () => new Date(),
    execFileSyncImpl = execFileSync,
    spawnSyncImpl = spawnSync,
    sleep = defaultSleep,
    stdout = process.stdout,
    pollTimeoutMs = DEFAULT_POLL_TIMEOUT_MS,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    memberName = generateMemberName(taskId, now()),
    spawnMemberCli = DEFAULT_SPAWN_MEMBER_CLI,
} = {}) {
    if (!repoRoot || !config || !taskId || !stage || !crewName) {
        throw new Error('runWorkOnViaCrew requires repoRoot, config, taskId, stage, and crewName')
    }

    preflightWatcherLock(config.lockFile)
    const startedAt = now().toISOString()
    const nextCommand = derivePrompt({ repoRoot, taskId, execFileSyncImpl })
    const prompt = nextCommand?.command
    if (typeof prompt !== 'string' || prompt.length === 0) {
        throw new Error(`cannot derive crew prompt for task ${taskId}`)
    }

    const mainRepoRoot = resolveMainRepoRoot(repoRoot, config)
    runChecked(spawnSyncImpl, process.execPath, [spawnMemberCli, memberName, '--crew', crewName, '--cwd', mainRepoRoot, '--', prompt], {
        cwd: repoRoot,
        encoding: 'utf8',
    })

    const manifest = await pollMemberManifest({ crewsRoot: config.crewsRoot, crewName, memberName, timeoutMs: pollTimeoutMs, intervalMs: pollIntervalMs, sleep })
    const ref = pruneUndefined({
        crewName,
        memberName,
        cwd: mainRepoRoot,
        startedAt,
        sessionId: manifest?.sessionId,
        transcriptPath: manifest?.transcriptPath,
    })

    runChecked(spawnSyncImpl, process.execPath, ['scripts/sync-ralph-state.mjs', '--update-crew-session', taskId, stage, '--json', JSON.stringify(ref)], {
        cwd: repoRoot,
        encoding: 'utf8',
    })

    const sessionLabel = ref.sessionId ?? 'pending'
    stdout.write(`Spawned ${crewName}/${memberName} for ${taskId}:${stage}; session=${sessionLabel}\n`)
    return { crewName, memberName, stage, taskId, sessionId: ref.sessionId ?? null, ref }
}

export function preflightWatcherLock(lockFile) {
    if (!lockFile || !fs.existsSync(lockFile)) {
        return
    }

    const metadata = readLockMetadata(lockFile)
    if (!WATCHER_LOCK_PROCESSES.has(metadata.process)) {
        return
    }
    if (isLiveProcess(metadata.pid)) {
        throw new Error(formatLockDiagnostic(metadata))
    }
}

export async function pollMemberManifest({ crewsRoot, crewName, memberName, timeoutMs = DEFAULT_POLL_TIMEOUT_MS, intervalMs = DEFAULT_POLL_INTERVAL_MS, sleep = defaultSleep }) {
    const manifestPath = path.join(crewsRoot, 'crews', crewName, 'members', memberName, 'manifest.json')
    const deadline = Date.now() + timeoutMs
    do {
        const manifest = readManifest(manifestPath)
        if (manifest?.sessionId && manifest?.transcriptPath) {
            return manifest
        }
        if (Date.now() >= deadline) {
            return manifest
        }
        await sleep(intervalMs)
    } while (Date.now() <= deadline)
    return null
}

export function generateMemberName(taskId, date = new Date()) {
    const safeTask = String(taskId).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'task'
    return `${safeTask}-${date.getTime()}`
}

function derivePrompt({ repoRoot, taskId, execFileSyncImpl }) {
    const stdout = execFileSyncImpl(process.execPath, ['scripts/lib/derive-next-command-cli.mjs', taskId], { cwd: repoRoot, encoding: 'utf8' })
    return JSON.parse(stdout)
}

function runChecked(spawnSyncImpl, command, args, options) {
    const result = spawnSyncImpl(command, args, options)
    if (result?.error) {
        throw result.error
    }
    if (result?.status !== 0) {
        const stderr = typeof result?.stderr === 'string' ? result.stderr.trim() : ''
        throw new Error(stderr || `${path.basename(command)} exited with status ${result?.status}`)
    }
    return result
}

function resolveMainRepoRoot(repoRoot, config) {
    const crewsRoot = path.resolve(config.crewsRoot)
    return path.basename(crewsRoot).toLowerCase() === '.crews' ? path.dirname(crewsRoot) : repoRoot
}

function readLockMetadata(lockFile) {
    try {
        const parsed = JSON.parse(fs.readFileSync(lockFile, 'utf8'))
        return {
            pid: Number.isInteger(parsed?.pid) ? parsed.pid : undefined,
            process: typeof parsed?.process === 'string' ? parsed.process : undefined,
            startedAt: typeof parsed?.startedAt === 'string' ? parsed.startedAt : undefined,
        }
    } catch {
        return { pid: undefined, process: undefined, startedAt: undefined }
    }
}

function readManifest(manifestPath) {
    try {
        const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
        return null
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
        return error?.code !== 'ESRCH'
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

function pruneUndefined(value) {
    return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined))
}

function defaultSleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}
