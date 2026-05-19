import path from 'node:path'

import { watch } from 'chokidar'

import { compileIgnoredPatterns, matchesIgnored, resolveHeadShortSha, splitPath } from './path-utils.mjs'
import { loadConfig } from './resolve-config.mjs'
import { deriveAffectedTaskUpdate, mergeAndWrite, walkRalphState, writeSidecar } from './sync-core.mjs'
import { acquireLock, releaseLock } from './sync-lock.mjs'

const DEFAULT_DEBOUNCE_MS = 2_000
const HEARTBEAT_MS = 30_000
const RETAIN_WARNING_THRESHOLD = 10
const HEAD_WARNING = 'watch-ralph-state: could not resolve HEAD short SHA, using unknown'
const MAX_FLUSH_RETRIES = 3

export async function start({ repoRoot, configPath, debounceMs = DEFAULT_DEBOUNCE_MS, processLabel = 'watcher', onWrite, onError } = {}) {
    if (!repoRoot) {
        throw new Error('watch-ralph-state start requires repoRoot')
    }

    const absoluteRepoRoot = path.resolve(repoRoot)
    const config = loadConfig({ repoRoot: absoluteRepoRoot, configPath })
    const generatedFromCommit = resolveHeadShortSha(absoluteRepoRoot, {
        onError: () => {
            process.stderr.write(`${HEAD_WARNING}\n`)
        },
    })
    const lockHandle = await acquireLock({ lockPath: config.lockFile, processLabel })
    const roots = getWatchRoots(config)
    // F-007: precompile ignored patterns once and reuse via the chokidar `ignored`
    // callback + the in-process matchesIgnored helper.
    const compiledIgnored = compileIgnoredPatterns(config.watcher?.ignored ?? [])
    const pendingChanges = new Map()
    const consecutiveFailures = new Map()
    const repeatedWarnings = new Set()
    const flushRetryCounts = new Map()
    let currentState
    let debounceTimer
    let stopped = false
    let closing = false
    let watcher
    let heartbeatTimer
    let lastTickAt
    let coldStartReady = false
    // Buffer events that arrive before cold-start completes (F-004 option B variant).
    const earlyEventBuffer = []

    const status = {
        // F-005/F-011: plan-AC shape { running, pendingSlugs, queueDepth, lastTickAt? }
        // plus legacy fields kept for backwards compatibility with existing tests
        // and downstream debug callers.
        get running() {
            return !stopped
        },
        get pendingSlugs() {
            return [...pendingChanges.keys()]
        },
        get queueDepth() {
            return pendingChanges.size
        },
        get lastTickAt() {
            return lastTickAt
        },
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
        // F-004: if cold-start has not completed yet, defer flush. The flush will be
        // re-triggered after writeSidecar resolves in the cold-start path.
        if (!coldStartReady || !currentState) {
            scheduleFlush()
            return
        }
        const changes = [...pendingChanges.values()]
        pendingChanges.clear()
        try {
            const updates = changes.map(({ kind, slug }) =>
                deriveAffectedTaskUpdate({ repoRoot: absoluteRepoRoot, config, kind, slug, currentState, generatedFromCommit }),
            )
            const writableUpdates = []
            const retainUpdates = []
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
                    retainUpdates.push(update)
                    continue
                }
                consecutiveFailures.delete(key)
                repeatedWarnings.delete(key)
                writableUpdates.push(update)
            }
            // F-001/F-013: retain updates still need to flow through mergeAndWrite so
            // unmatched / unmatchedSummary refresh with the parse-error fragment even
            // when byTaskId is unchanged.
            const allUpdates = [...writableUpdates, ...retainUpdates]
            if (allUpdates.length === 0) {
                return
            }
            const result = await mergeAndWrite({
                repoRoot: absoluteRepoRoot,
                config,
                currentState,
                updates: allUpdates,
                generatedFromCommit,
            })
            currentState = result.state
            lastTickAt = result.writtenAt
            // Reset retry counter for changes that just landed.
            for (const change of changes) {
                flushRetryCounts.delete(changeKey(change.kind, change.slug))
            }
            await lockHandle.touch()
            // Suppress onWrite if no taskIds actually changed (retain-only flush).
            if (writableUpdates.length > 0 || result.changedTaskIds.length > 0) {
                onWrite?.({ writtenAt: result.writtenAt, changedTaskIds: result.changedTaskIds })
            }
        } catch (error) {
            // F-010: re-enqueue failed changes so the next debounce retries; cap to
            // MAX_FLUSH_RETRIES per (kind, slug) to avoid an infinite loop on persistent
            // failures (e.g., disk full).
            for (const change of changes) {
                const key = changeKey(change.kind, change.slug)
                const retries = (flushRetryCounts.get(key) ?? 0) + 1
                if (retries > MAX_FLUSH_RETRIES) {
                    flushRetryCounts.delete(key)
                    process.stderr.write(
                        `watcher: dropping ${change.kind}/${change.slug} after ${MAX_FLUSH_RETRIES} failed flush attempts: ${error?.message ?? error}\n`,
                    )
                    continue
                }
                flushRetryCounts.set(key, retries)
                if (!pendingChanges.has(key)) {
                    pendingChanges.set(key, change)
                }
            }
            if (pendingChanges.size > 0) {
                scheduleFlush()
            }
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
            ignored: (filePath) => matchesIgnored(filePath, absoluteRepoRoot, compiledIgnored),
            awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
            ignoreInitial: true,
        })
        watcher.on('all', (eventName, changedPath) => {
            const change = parseWatchedPath(changedPath, roots, eventName)
            if (!change) {
                return
            }
            // F-004: if cold-start hasn't completed yet, buffer the event for replay.
            if (!coldStartReady) {
                earlyEventBuffer.push(change)
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
        lastTickAt = currentState.generatedAt
        await lockHandle.touch()
        // F-004: cold-start complete — drain any events that arrived during walkRalphState
        // / writeSidecar into pendingChanges and schedule a reconciling debounce tick.
        coldStartReady = true
        for (const change of earlyEventBuffer.splice(0)) {
            pendingChanges.set(changeKey(change.kind, change.slug), change)
        }
        if (pendingChanges.size > 0) {
            scheduleFlush()
        }
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

function parseWatchedPath(filePath, roots, eventName) {
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
        // F-003/F-014: directory-level events (unlinkDir, addDir) arrive with
        // parts.length === 1. Allow them through for all kinds so brainstorm /
        // job / group slug-directory deletions get re-derived. For nested file
        // events under brainstorm, only enqueue when the touched file is
        // brainstorm.json (selected-direction.md and other artefacts are ignored).
        if (kind === 'brainstorm' && parts.length > 1 && parts[1] !== 'brainstorm.json') {
            return undefined
        }
        // eventName is reserved for future filtering (e.g., add vs unlink) but is not
        // persisted on the pendingChanges entry to keep its shape stable for callers.
        void eventName
        return { kind, slug }
    }
    return undefined
}

function changeKey(kind, slug) {
    return `${kind}:${slug}`
}
