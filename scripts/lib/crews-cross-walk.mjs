import fs from 'node:fs'
import path from 'node:path'

import { parseSpawnLauncher } from './parse-spawn-launcher.mjs'

const CREW_ROLES = Object.freeze(['members', 'leads'])
const STALE_AFTER_MS = 60 * 60 * 1000

export function discoverCrewSessions({ repoRoot, ralphState, overviewData, crewsRoot, now, logger } = {}) {
    if (!repoRoot || !ralphState || !overviewData || !crewsRoot) {
        throw new Error('discoverCrewSessions requires repoRoot, ralphState, overviewData, and crewsRoot')
    }

    const absoluteRepoRoot = path.resolve(repoRoot)
    const absoluteCrewsRoot = path.resolve(crewsRoot)
    const taskIds = collectTaskIds({ ralphState, overviewData })
    const launcherIndex = indexSpawnLaunchers(path.join(absoluteCrewsRoot, 'spawn-launchers'), logger)
    const discovered = new Map()
    const nowMs = dateMs(now ?? new Date())

    for (const manifestPath of findManifestPaths(path.join(absoluteCrewsRoot, 'crews'))) {
        const manifest = readJson(manifestPath, logger)
        if (!manifest) {
            continue
        }

        if (!isManifestCwdInsideRepo({ repoRoot: absoluteRepoRoot, manifestCwd: manifest.cwd ?? manifest.stateCwd })) {
            log(logger, `[crews-cross-walk] unmatched manifest outside repo cwd: ${manifestPath}`)
            continue
        }

        const crewName = asNonEmptyString(manifest.crew) ?? path.basename(path.dirname(path.dirname(path.dirname(manifestPath))))
        const memberName = asNonEmptyString(manifest.name) ?? path.basename(path.dirname(manifestPath))
        const summaryMatch = matchTaskId(asNonEmptyString(manifest.lastSummary), taskIds)
        const launcher = launcherIndex.get(sessionKey(crewName, memberName))
        const launcherMatch = summaryMatch.taskId ? { taskId: null, ambiguous: [] } : matchTaskId(launcher?.initialPrompt, taskIds)
        const taskId = summaryMatch.taskId ?? launcherMatch.taskId
        const ambiguous = summaryMatch.ambiguous.length > 0 ? summaryMatch.ambiguous : launcherMatch.ambiguous

        if (ambiguous.length > 0) {
            log(logger, `[crews-cross-walk] ambiguous task match for ${crewName}/${memberName}: ${ambiguous.join(', ')}`)
            continue
        }
        if (!taskId) {
            log(logger, `[crews-cross-walk] unmatched crew session for ${crewName}/${memberName}`)
            continue
        }

        const taskState = ralphState.byTaskId?.[taskId]
        const existing = findExistingCrewSession(taskState?.crewSessions, { crewName, memberName, sessionId: asNonEmptyString(manifest.sessionId) })
        const stage = existing?.stage ?? taskState?.stage
        if (!stage) {
            log(logger, `[crews-cross-walk] unmatched crew session for ${crewName}/${memberName}: task ${taskId} has no Ralph stage`)
            continue
        }

        const entry = buildCrewSessionRef({ manifest, crewName, memberName, existing: existing?.entry, nowMs })
        addDiscovered(discovered, taskId, stage, entry)
    }

    return discovered
}

function collectTaskIds({ ralphState, overviewData }) {
    return [...new Set([...(overviewData.tasks ?? []).map((task) => task?.id), ...Object.keys(ralphState.byTaskId ?? {})].filter(Boolean))]
}

function findManifestPaths(crewsDir) {
    if (!fs.existsSync(crewsDir)) {
        return []
    }

    const manifests = []
    for (const crewEntry of readDirs(crewsDir)) {
        for (const role of CREW_ROLES) {
            const roleDir = path.join(crewEntry.path, role)
            for (const actorEntry of readDirs(roleDir)) {
                const manifestPath = path.join(actorEntry.path, 'manifest.json')
                if (fs.existsSync(manifestPath)) {
                    manifests.push(manifestPath)
                }
            }
        }
    }
    return manifests.sort((a, b) => a.localeCompare(b))
}

function readDirs(dir) {
    if (!fs.existsSync(dir)) {
        return []
    }
    return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
        .map((entry) => ({ name: entry.name, path: path.join(dir, entry.name) }))
}

function readJson(filePath, logger) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch (error) {
        log(logger, `[crews-cross-walk] failed to read ${filePath}: ${error.message}`)
        return null
    }
}

function isManifestCwdInsideRepo({ repoRoot, manifestCwd }) {
    if (!asNonEmptyString(manifestCwd)) {
        return false
    }

    const pathImpl = usesWin32Path(repoRoot) || usesWin32Path(manifestCwd) ? path.win32 : path
    const normalizedRepoRoot = normalizeForCompare(pathImpl.resolve(repoRoot), pathImpl)
    const normalizedManifestCwd = normalizeForCompare(pathImpl.resolve(manifestCwd), pathImpl)
    const relative = pathImpl.relative(normalizedRepoRoot, normalizedManifestCwd)
    return relative === '' || (!relative.startsWith('..') && !pathImpl.isAbsolute(relative))
}

function usesWin32Path(value) {
    return /^[A-Za-z]:[\\/]/.test(value) || value.includes('\\')
}

function normalizeForCompare(value, pathImpl) {
    const normalized = pathImpl.normalize(value)
    return pathImpl === path.win32 ? normalized.toLowerCase() : normalized
}

function indexSpawnLaunchers(launchersDir, logger) {
    const index = new Map()
    if (!fs.existsSync(launchersDir)) {
        return index
    }

    for (const entry of fs.readdirSync(launchersDir, { withFileTypes: true })) {
        if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.ps1') {
            continue
        }
        const launcherPath = path.join(launchersDir, entry.name)
        let parsed
        try {
            parsed = parseSpawnLauncher(launcherPath)
        } catch (error) {
            log(logger, `[crews-cross-walk] failed to parse launcher ${launcherPath}: ${error.message}`)
            continue
        }
        if (!parsed.crewName || !parsed.memberName) {
            continue
        }
        const timestamp = launcherTimestamp(entry.name)
        const key = sessionKey(parsed.crewName, parsed.memberName)
        const existing = index.get(key)
        if (!existing || timestamp > existing.timestamp) {
            index.set(key, { ...parsed, timestamp })
        }
    }
    return index
}

function launcherTimestamp(filename) {
    const match = path.basename(filename, path.extname(filename)).match(/-(\d+)$/)
    return match ? Number(match[1]) : 0
}

function matchTaskId(text, taskIds) {
    if (!asNonEmptyString(text)) {
        return { taskId: null, ambiguous: [] }
    }

    const matches = taskIds.filter((taskId) => taskIdRegex(taskId).test(text))
    if (matches.length === 0) {
        return { taskId: null, ambiguous: [] }
    }
    const longestLength = Math.max(...matches.map((taskId) => taskId.length))
    const longestMatches = matches.filter((taskId) => taskId.length === longestLength)
    if (longestMatches.length > 1) {
        return { taskId: null, ambiguous: longestMatches.sort() }
    }
    return { taskId: longestMatches[0], ambiguous: [] }
}

function taskIdRegex(taskId) {
    return new RegExp(`(?<![A-Za-z0-9_-])${escapeRegExp(taskId)}(?![A-Za-z0-9_-])`)
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findExistingCrewSession(crewSessions, identity) {
    for (const [stage, entries] of Object.entries(crewSessions ?? {})) {
        for (const entry of entries ?? []) {
            if (sameCrewSession(entry, identity)) {
                return { stage, entry }
            }
        }
    }
    return null
}

function sameCrewSession(entry, identity) {
    if (entry.sessionId && identity.sessionId) {
        return entry.sessionId === identity.sessionId
    }
    return entry.crewName === identity.crewName && entry.memberName === identity.memberName
}

function buildCrewSessionRef({ manifest, crewName, memberName, existing, nowMs }) {
    const sessionId = asNonEmptyString(manifest.sessionId)
    const transcriptPath = asNonEmptyString(manifest.transcriptPath)
    const lastHeartbeatAt = asNonEmptyString(manifest.lastHeartbeatAt)
    const heartbeatMs = lastHeartbeatAt ? dateMs(lastHeartbeatAt) : 0
    const stale = heartbeatMs > 0 && nowMs - heartbeatMs > STALE_AFTER_MS
    const outcome = existing?.outcome ?? (stale ? 'stopped' : undefined)
    const endedAt = existing?.endedAt ?? (stale && !existing?.outcome ? lastHeartbeatAt : undefined)

    return pruneUndefined({
        crewName,
        memberName,
        startedAt: asNonEmptyString(manifest.startedAt) ?? asNonEmptyString(manifest.lastSessionStartAt) ?? lastHeartbeatAt ?? new Date(nowMs).toISOString(),
        sessionId: existing?.sessionId ?? sessionId,
        transcriptPath: existing?.transcriptPath ?? transcriptPath,
        endedAt,
        outcome,
        summary: existing?.summary ?? asNonEmptyString(manifest.lastSummary),
        _isExplicit: existing?._isExplicit,
        cwd: asNonEmptyString(manifest.cwd) ?? asNonEmptyString(manifest.stateCwd),
    })
}

function addDiscovered(discovered, taskId, stage, entry) {
    const byStage = discovered.get(taskId) ?? {}
    const entries = byStage[stage] ?? []
    const existingIndex = entries.findIndex((candidate) => sameCrewSession(candidate, entry))
    if (existingIndex === -1) {
        byStage[stage] = [...entries, entry]
    } else {
        byStage[stage] = entries.map((candidate, index) => (index === existingIndex ? { ...candidate, ...entry } : candidate))
    }
    discovered.set(taskId, byStage)
}

function sessionKey(crewName, memberName) {
    return `${crewName}\0${memberName}`
}

function dateMs(value) {
    const parsed = value instanceof Date ? value.getTime() : Date.parse(value)
    return Number.isNaN(parsed) ? 0 : parsed
}

function asNonEmptyString(value) {
    return typeof value === 'string' && value.trim() ? value : null
}

function pruneUndefined(value) {
    return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined))
}

function log(logger, message) {
    if (logger?.warn) {
        logger.warn(message)
        return
    }
    process.stderr.write(`${message}\n`)
}
