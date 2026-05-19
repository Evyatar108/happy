import { execFileSync } from 'node:child_process'
import path from 'node:path'

import { watch } from 'chokidar'

import { loadConfig } from './resolve-config.mjs'
import { deriveAffectedTaskUpdate, mergeAndWrite, walkRalphState, writeSidecar } from './sync-core.mjs'
import { acquireLock, releaseLock } from './sync-lock.mjs'

const DEFAULT_DEBOUNCE_MS = 2_000
const HEARTBEAT_MS = 30_000
const RETAIN_WARNING_THRESHOLD = 10
const HEAD_WARNING = 'watch-ralph-state: could not resolve HEAD short SHA, using unknown'

export async function start({ repoRoot, configPath, debounceMs = DEFAULT_DEBOUNCE_MS, processLabel = 'watcher', onWrite, onError } = {}) {
    if (!repoRoot) {
        throw new Error('watch-ralph-state start requires repoRoot')
    }

    const absoluteRepoRoot = path.resolve(repoRoot)
    const config = loadConfig({ repoRoot: absoluteRepoRoot, configPath })
    const generatedFromCommit = resolveHeadShortSha(absoluteRepoRoot)
    const lockHandle = await acquireLock({ lockPath: config.lockFile, processLabel })
    const roots = getWatchRoots(config)
    const pendingChanges = new Map()
    const consecutiveFailures = new Map()
    const repeatedWarnings = new Set()
    let currentState
    let debounceTimer
    let stopped = false
    let closing = false
    let watcher
    let heartbeatTimer

    const status = {
        get currentState() {
            return currentState
        },
        get pendingChanges() {
            return [...pendingChanges.values()].map((entry) => ({ ...entry }))
        },
        get consecutiveFailures() {
            return Object.fromEntries(consecutiveFailures)
        },
        get stopped() {
            return stopped
        },
    }

    const scheduleFlush = () => {
        if (stopped || pendingChanges.size === 0) {
            return
        }
        if (debounceTimer) {
            clearTimeout(debounceTimer)
        }
        debounceTimer = setTimeout(() => {
            debounceTimer = undefined
            void flushPending()
        }, debounceMs)
        debounceTimer.unref?.()
    }

    const flushPending = async () => {
        if (stopped || pendingChanges.size === 0) {
            return
        }
        const changes = [...pendingChanges.values()]
        pendingChanges.clear()
        try {
            const updates = changes.map(({ kind, slug }) =>
                deriveAffectedTaskUpdate({ repoRoot: absoluteRepoRoot, config, kind, slug, currentState, generatedFromCommit }),
            )
            const writableUpdates = []
            for (const update of updates) {
                const key = changeKey(update.kind, update.slug)
                if (update.action === 'retain') {
                    const count = (consecutiveFailures.get(key) ?? 0) + 1
                    consecutiveFailures.set(key, count)
                    process.stderr.write(`watcher: retained ${update.kind}/${update.slug}: ${update.error}\n`)
                    if (count >= RETAIN_WARNING_THRESHOLD && !repeatedWarnings.has(key)) {
                        repeatedWarnings.add(key)
                        process.stderr.write(`watcher: ${update.slug} failing repeatedly\n`)
                    }
                    continue
                }
                consecutiveFailures.delete(key)
                repeatedWarnings.delete(key)
                writableUpdates.push(update)
            }
            if (writableUpdates.length === 0) {
                return
            }
            const result = await mergeAndWrite({
                repoRoot: absoluteRepoRoot,
                config,
                currentState,
                updates: writableUpdates,
                generatedFromCommit,
            })
            currentState = result.state
            await lockHandle.touch()
            onWrite?.({ writtenAt: result.writtenAt, changedTaskIds: result.changedTaskIds })
        } catch (error) {
            onError?.(error)
            if (!onError) {
                process.stderr.write(`watcher: ${error?.message ?? error}\n`)
            }
        }
    }

    const stop = async () => {
        if (closing) {
            return
        }
        closing = true
        stopped = true
        if (debounceTimer) {
            clearTimeout(debounceTimer)
            debounceTimer = undefined
        }
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer)
            heartbeatTimer = undefined
        }
        try {
            await watcher?.close()
        } finally {
            await releaseLock(lockHandle)
        }
    }

    try {
        watcher = watch(roots, {
            ignored: (filePath) => matchesIgnored(filePath, absoluteRepoRoot, config.watcher.ignored),
            awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
            ignoreInitial: true,
        })
        watcher.on('all', (_eventName, changedPath) => {
            const change = parseWatchedPath(changedPath, roots)
            if (!change) {
                return
            }
            pendingChanges.set(changeKey(change.kind, change.slug), change)
            scheduleFlush()
        })
        watcher.on('error', (error) => {
            onError?.(error)
            if (!onError) {
                process.stderr.write(`watcher: ${error?.message ?? error}\n`)
            }
        })

        await new Promise((resolve, reject) => {
            watcher.on('ready', resolve)
            watcher.on('error', reject)
        })

        currentState = await walkRalphState({ repoRoot: absoluteRepoRoot, config, generatedFromCommit })
        await writeSidecar({ repoRoot: absoluteRepoRoot, config, state: currentState })
        await lockHandle.touch()
        heartbeatTimer = setInterval(() => {
            void lockHandle.touch().catch((error) => {
                onError?.(error)
            })
        }, HEARTBEAT_MS)
        heartbeatTimer.unref?.()
        return { stop, status }
    } catch (error) {
        await stop()
        throw error
    }
}

function getWatchRoots(config) {
    return [config.ralphSubdirs.jobs, config.ralphSubdirs.jobGroups, config.ralphSubdirs.brainstorms].map((dir) => path.resolve(dir))
}

function parseWatchedPath(filePath, roots) {
    const absolutePath = path.resolve(filePath)
    const rootEntries = [
        { kind: 'job', root: roots[0] },
        { kind: 'group', root: roots[1] },
        { kind: 'brainstorm', root: roots[2] },
    ]
    for (const { kind, root } of rootEntries) {
        const relative = path.relative(root, absolutePath)
        if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
            continue
        }
        const parts = splitPath(relative)
        const slug = parts[0]
        if (!slug || slug === '.staging') {
            return undefined
        }
        if (kind === 'brainstorm' && parts[1] !== 'brainstorm.json') {
            return undefined
        }
        return { kind, slug }
    }
    return undefined
}

function matchesIgnored(filePath, repoRoot, ignored) {
    const relative = toPosix(path.relative(repoRoot, filePath))
    return ignored.some((pattern) => globToRegExp(pattern).test(relative) || globToRegExp(pattern).test(`${relative}/`))
}

function globToRegExp(pattern) {
    const doubleStar = '__RALPH_DOUBLE_STAR__'
    const escaped = toPosix(pattern)
        .replace(/\*\*/g, doubleStar)
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[^/]*')
        .replaceAll(doubleStar, '.*')
    return new RegExp(`^${escaped}$`)
}

function splitPath(value) {
    return value.split(/[\\/]+/).filter(Boolean)
}

function toPosix(value) {
    return value.replace(/\\/g, '/')
}

function changeKey(kind, slug) {
    return `${kind}:${slug}`
}

function resolveHeadShortSha(repoRoot) {
    try {
        return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
            cwd: repoRoot,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim()
    } catch {
        process.stderr.write(`${HEAD_WARNING}\n`)
        return 'unknown'
    }
}
