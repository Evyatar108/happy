import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { appendJournalEntry } from './lib/append-journal.mjs'
import { appendActivity } from './lib/emit-activity.mjs'
import { resolveHeadShortSha as sharedResolveHeadShortSha } from './lib/path-utils.mjs'
import { loadConfig } from './lib/resolve-config.mjs'
import { deriveActivityEvents, walkRalphState, writeSidecar } from './lib/sync-core.mjs'
import { acquireLock, releaseLock } from './lib/sync-lock.mjs'
import { start } from './lib/watch-ralph-state.mjs'

const HEAD_WARNING = 'sync-ralph-state: could not resolve HEAD short SHA, using unknown'
const MIN_DEBOUNCE_MS = 500
const MAX_DEBOUNCE_MS = 30_000

async function main() {
    try {
        const args = parseArgs(process.argv.slice(2))
        const repoRoot = args.repo ? path.resolve(args.repo) : resolveRepoRoot()
        const config = loadConfig({ repoRoot, configPath: args.config })

        if (args.watch) {
            await runWatchMode({ repoRoot, configPath: args.config, debounceMs: args.debounceMs })
            return
        }

        await runOneShot({ repoRoot, config })
    } catch (error) {
        console.error(`sync-ralph-state: ${error?.message ?? error}`)
        process.exitCode = 1
    }
}

async function runOneShot({ repoRoot, config }) {
    const generatedFromCommit = resolveHeadShortSha(repoRoot)
    const lockHandle = await acquireLock({ lockPath: config.lockFile, processLabel: 'standalone-oneshot' })
    try {
        const priorByTaskId = readPriorByTaskId(config)
        const state = await walkRalphState({ repoRoot, config, generatedFromCommit })

        for (const entry of state.unmatched ?? []) {
            console.error(`sync-ralph-state: unmatched ${entry.kind}/${entry.slug}: ${entry.reason}`)
        }

        await writeSidecar({ repoRoot, config, state })

        const activityEvents = deriveActivityEvents({
            previousByTaskId: priorByTaskId,
            nextByTaskId: state.byTaskId,
            ts: state.generatedAt,
        })
        for (const event of activityEvents) {
            appendActivity(repoRoot, event, {
                activityPath: config.outputs.activity,
                activityBackupPath: config.outputs.activityBackup,
                maxLines: config.outputs.activityMaxLines,
            })
            appendJournalForStageEvent({ repoRoot, event })
        }
    } finally {
        await releaseLock(lockHandle)
    }
}

function readPriorByTaskId(config) {
    const sidecarPath = config.outputs.sidecarJson
    if (!fs.existsSync(sidecarPath)) {
        return {}
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'))
        return parsed?.byTaskId ?? {}
    } catch {
        return {}
    }
}

async function runWatchMode({ repoRoot, configPath, debounceMs }) {
    const handle = await start({ repoRoot, configPath, debounceMs, processLabel: 'standalone' })
    let stopping = false
    const stopAndExit = () => {
        if (stopping) {
            return
        }
        stopping = true
        void handle.stop().finally(() => {
            process.exit(0)
        })
    }
    process.once('SIGINT', stopAndExit)
    process.once('SIGTERM', stopAndExit)
    process.stdin.resume()
}

function parseArgs(argv) {
    const parsed = { watch: false }
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index]
        if (arg === '--repo' || arg === '--config') {
            const value = argv[index + 1]
            if (!value || value.startsWith('--')) {
                throw new Error(`${arg} requires a value`)
            }
            parsed[arg.slice(2)] = value
            index += 1
            continue
        }
        if (arg === '--watch') {
            parsed.watch = true
            continue
        }
        if (arg === '--debounce-ms') {
            const value = argv[index + 1]
            if (!value || value.startsWith('--')) {
                throw new Error('--debounce-ms requires a value')
            }
            parsed.debounceMs = parseDebounceMs(value)
            index += 1
            continue
        }
        throw new Error(`unknown argument: ${arg}`)
    }
    return parsed
}

function parseDebounceMs(value) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) {
        throw new Error(`--debounce-ms must be a number: ${value}`)
    }
    return Math.min(MAX_DEBOUNCE_MS, Math.max(MIN_DEBOUNCE_MS, Math.trunc(parsed)))
}

function resolveRepoRoot() {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
}

function resolveHeadShortSha(repoRoot) {
    return sharedResolveHeadShortSha(repoRoot, {
        onError: () => {
            console.error(HEAD_WARNING)
        },
    })
}

function appendJournalForStageEvent({ repoRoot, event }) {
    if (!event?.changedFields?.includes('stage')) {
        return
    }
    appendJournalEntry({
        repoRoot,
        taskId: event.taskId,
        ts: event.ts,
        prevStage: event.prevStage,
        newStage: event.newStage,
        slug: event.slug,
    })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await main()
}

export { main, parseArgs, parseDebounceMs, runOneShot, runWatchMode }
