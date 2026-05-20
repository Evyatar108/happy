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
const RALPH_STAGES = new Set([
    'brainstorming',
    'brainstorm-ready',
    'planning',
    'plan-ready',
    'implementing',
    'reviewing',
    'review-fix',
    'replan-pending',
    'shipped',
    'blocked',
])
const CREW_OUTCOMES = new Set(['completed', 'handed-off', 'stopped', 'failed'])

async function main() {
    try {
        const args = parseArgs(process.argv.slice(2))
        const repoRoot = args.repo ? path.resolve(args.repo) : resolveRepoRoot()
        const config = loadConfig({ repoRoot, configPath: args.config })

        if (args.command === 'updateCrewSession') {
            await runUpdateCrewSession({ repoRoot, config, taskId: args.taskId, stage: args.stage, refJson: args.refJson })
            return
        }

        if (args.command === 'finalizeCrewSession') {
            await runFinalizeCrewSession({
                repoRoot,
                config,
                taskId: args.taskId,
                stage: args.stage,
                memberName: args.memberName,
                crewName: args.crewName,
                sessionId: args.sessionId,
                outcome: args.outcome,
                summary: args.summary,
            })
            return
        }

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

async function runUpdateCrewSession({ repoRoot, config, taskId, stage, refJson }) {
    validateStage(stage)
    const incoming = parseCrewSessionRef(refJson)
    const lockHandle = await acquireLock({ lockPath: config.lockFile, processLabel: 'crew-session-update' })
    try {
        const state = readSidecarState({ repoRoot, config })
        if (!state.byTaskId?.[taskId]) {
            throw new Error(`unknown taskId: ${taskId}`)
        }
        const taskState = ensureTaskState(state, taskId, stage)
        const crewSessions = { ...(taskState.crewSessions ?? {}) }
        const entries = [...(crewSessions[stage] ?? [])]
        const explicitRef = pruneUndefined({ ...incoming, _isExplicit: true })
        const existingIndex = entries.findIndex((entry) => sameCrewSession(entry, explicitRef))
        if (existingIndex === -1) {
            entries.push(explicitRef)
        } else {
            entries[existingIndex] = pruneUndefined({ ...entries[existingIndex], ...explicitRef, _isExplicit: true })
        }
        crewSessions[stage] = entries
        state.byTaskId[taskId] = { ...taskState, crewSessions: pruneEmptyCrewStages(crewSessions) }
        state.generatedAt = new Date().toISOString()
        await writeSidecar({ repoRoot, config, state })
    } finally {
        await releaseLock(lockHandle)
    }
}

async function runFinalizeCrewSession({ repoRoot, config, taskId, stage, memberName, crewName, sessionId, outcome, summary }) {
    validateStage(stage)
    validateOutcome(outcome)
    const lockHandle = await acquireLock({ lockPath: config.lockFile, processLabel: 'crew-session-finalize' })
    try {
        const state = readSidecarState({ repoRoot, config })
        const taskState = state.byTaskId?.[taskId]
        const entries = [...(taskState?.crewSessions?.[stage] ?? [])]
        const matchIndexes = findFinalizeMatches(entries, { memberName, crewName, sessionId })
        if (matchIndexes.length === 0) {
            throw new Error(`no crew session found for ${taskId}:${stage} member ${memberName}`)
        }
        if (matchIndexes.length > 1) {
            throw new Error(`multiple crew sessions match ${taskId}:${stage} member ${memberName}; pass --crew or --session-id`)
        }

        const matchIndex = matchIndexes[0]
        entries[matchIndex] = pruneUndefined({
            ...entries[matchIndex],
            endedAt: new Date().toISOString(),
            outcome,
            summary,
            _isExplicit: true,
        })
        const crewSessions = { ...(taskState.crewSessions ?? {}), [stage]: entries }
        state.byTaskId[taskId] = { ...taskState, crewSessions: pruneEmptyCrewStages(crewSessions) }
        state.generatedAt = new Date().toISOString()
        await writeSidecar({ repoRoot, config, state })
    } finally {
        await releaseLock(lockHandle)
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
        if (arg === '--update-crew-session') {
            ensureNoCommand(parsed, arg)
            parsed.command = 'updateCrewSession'
            parsed.taskId = readValue(argv, index + 1, '<taskId>')
            parsed.stage = readValue(argv, index + 2, '<stage>')
            index += 2
            continue
        }
        if (arg === '--finalize-crew-session') {
            ensureNoCommand(parsed, arg)
            parsed.command = 'finalizeCrewSession'
            parsed.taskId = readValue(argv, index + 1, '<taskId>')
            parsed.stage = readValue(argv, index + 2, '<stage>')
            index += 2
            continue
        }
        if (arg === '--json') {
            parsed.refJson = readValue(argv, index + 1, '--json')
            index += 1
            continue
        }
        if (arg === '--member') {
            parsed.memberName = readValue(argv, index + 1, '--member')
            index += 1
            continue
        }
        if (arg === '--crew') {
            parsed.crewName = readValue(argv, index + 1, '--crew')
            index += 1
            continue
        }
        if (arg === '--session-id') {
            parsed.sessionId = readValue(argv, index + 1, '--session-id')
            index += 1
            continue
        }
        if (arg === '--outcome') {
            parsed.outcome = readValue(argv, index + 1, '--outcome')
            index += 1
            continue
        }
        if (arg === '--summary') {
            parsed.summary = readValue(argv, index + 1, '--summary')
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
    validateParsedArgs(parsed)
    return parsed
}

function readValue(argv, index, label) {
    const value = argv[index]
    if (!value || value.startsWith('--')) {
        throw new Error(`${label} requires a value`)
    }
    return value
}

function ensureNoCommand(parsed, arg) {
    if (parsed.command) {
        throw new Error(`${arg} cannot be combined with another subcommand`)
    }
}

function validateParsedArgs(parsed) {
    if (parsed.watch && parsed.command) {
        throw new Error('--watch cannot be combined with crew-session subcommands')
    }
    if (parsed.command === 'updateCrewSession' && !parsed.refJson) {
        throw new Error('--update-crew-session requires --json')
    }
    if (parsed.command === 'finalizeCrewSession') {
        if (!parsed.memberName && !parsed.sessionId) {
            throw new Error('--finalize-crew-session requires --member or --session-id')
        }
        if (!parsed.outcome) {
            throw new Error('--finalize-crew-session requires --outcome')
        }
    }
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

function readSidecarState({ repoRoot, config }) {
    const sidecarPath = resolveMaybeAbsolute(repoRoot, config.outputs?.sidecarJson)
    if (!fs.existsSync(sidecarPath)) {
        return { generatedAt: new Date().toISOString(), generatedFromCommit: resolveHeadShortSha(repoRoot), byTaskId: {} }
    }
    const parsed = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'))
    return {
        generatedAt: typeof parsed?.generatedAt === 'string' ? parsed.generatedAt : new Date().toISOString(),
        generatedFromCommit: typeof parsed?.generatedFromCommit === 'string' ? parsed.generatedFromCommit : resolveHeadShortSha(repoRoot),
        byTaskId: parsed?.byTaskId && typeof parsed.byTaskId === 'object' ? parsed.byTaskId : {},
        unmatched: parsed?.unmatched,
        unmatchedSummary: parsed?.unmatchedSummary,
    }
}

function ensureTaskState(state, taskId, stage) {
    state.byTaskId = state.byTaskId ?? {}
    const taskState = state.byTaskId[taskId]
    if (taskState) {
        return taskState
    }
    return { stage }
}

function parseCrewSessionRef(refJson) {
    let parsed
    try {
        parsed = JSON.parse(refJson)
    } catch (error) {
        throw new Error(`--json must be valid JSON: ${error.message}`)
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('--json must be a CrewSessionRef object')
    }
    for (const field of ['crewName', 'memberName', 'startedAt']) {
        if (typeof parsed[field] !== 'string' || parsed[field].length === 0) {
            throw new Error(`--json CrewSessionRef.${field} must be a non-empty string`)
        }
    }
    return parsed
}

function validateStage(stage) {
    if (!RALPH_STAGES.has(stage)) {
        throw new Error(`invalid Ralph stage: ${stage}`)
    }
}

function validateOutcome(outcome) {
    if (!CREW_OUTCOMES.has(outcome)) {
        throw new Error(`invalid crew session outcome: ${outcome}`)
    }
}

function findFinalizeMatches(entries, { memberName, crewName, sessionId }) {
    return entries.flatMap((entry, index) => {
        if (sessionId) {
            return entry.sessionId === sessionId ? [index] : []
        }
        if (entry.memberName !== memberName) {
            return []
        }
        if (crewName && entry.crewName !== crewName) {
            return []
        }
        return [index]
    })
}

function sameCrewSession(entry, identity) {
    if (entry.sessionId && identity.sessionId) {
        return entry.sessionId === identity.sessionId
    }
    return entry.crewName === identity.crewName && entry.memberName === identity.memberName
}

function pruneEmptyCrewStages(crewSessions) {
    return Object.fromEntries(Object.entries(crewSessions).filter(([, entries]) => entries.length > 0))
}

function pruneUndefined(value) {
    return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined))
}

function resolveMaybeAbsolute(base, value) {
    return path.isAbsolute(value) ? value : path.resolve(base, value)
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

export { main, parseArgs, parseDebounceMs, runFinalizeCrewSession, runOneShot, runUpdateCrewSession, runWatchMode }
