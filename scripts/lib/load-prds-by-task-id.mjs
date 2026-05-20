import fs from 'node:fs'
import path from 'node:path'

import { resolveTaskMatch } from './task-match.mjs'

/**
 * Loads Ralph PRD carriers keyed by overview task id.
 *
 * Plugin schema 5.41.0 declares userStories[].id, userStories[].dependencies,
 * and userStories[].passes. It does not declare a PRD-level dependencies field,
 * but the schema allows additional root properties. The depends-on-task graph
 * fallback is not schema-guaranteed; this helper only preserves a root
 * dependencies array when one is already present.
 */
export function loadPrdsByTaskId({ repoRoot, config, overviewData } = {}) {
    if (!repoRoot || !config) {
        throw new Error('loadPrdsByTaskId requires repoRoot and config')
    }

    const absoluteRepoRoot = path.resolve(repoRoot)
    const normalized = normalizeConfigPaths(config, absoluteRepoRoot)
    const data = overviewData ?? loadOverviewData(normalized.dataFile)
    const taskIds = new Set((data.tasks ?? []).map((task) => task?.id).filter(Boolean))
    const ralphOverrides = data.ralphOverrides ?? {}
    const winners = new Map()

    for (const candidate of enumeratePrdCandidates(normalized)) {
        const match = resolveTaskMatch({ slug: candidate.slug, ralphOverrides, taskIds })
        if (!match) {
            continue
        }
        const carrier = readPrdCarrier(candidate.prdPath)
        if (!carrier) {
            continue
        }
        const current = winners.get(match.taskId)
        if (!current || candidate.mtimeMs >= current.mtimeMs) {
            winners.set(match.taskId, { mtimeMs: candidate.mtimeMs, carrier })
        }
    }

    return Object.fromEntries(
        [...winners.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([taskId, value]) => [taskId, value.carrier]),
    )
}

function enumeratePrdCandidates(config) {
    return [
        ...readJobPrds(config.ralphSubdirs.jobs),
        ...readGroupMemberPrds(config.ralphSubdirs.jobGroups),
    ]
}

function readJobPrds(jobsDir) {
    if (!fs.existsSync(jobsDir)) {
        return []
    }
    return fs.readdirSync(jobsDir, { withFileTypes: true }).flatMap((entry) => {
        if (!entry.isDirectory() || entry.isSymbolicLink()) {
            return []
        }
        const prdPath = path.join(jobsDir, entry.name, 'prd.json')
        if (!fs.existsSync(prdPath)) {
            return []
        }
        return [{ slug: entry.name, prdPath, mtimeMs: fs.statSync(prdPath).mtimeMs }]
    })
}

function readGroupMemberPrds(jobGroupsDir) {
    if (!fs.existsSync(jobGroupsDir)) {
        return []
    }
    const candidates = []
    for (const groupEntry of fs.readdirSync(jobGroupsDir, { withFileTypes: true })) {
        if (!groupEntry.isDirectory() || groupEntry.isSymbolicLink()) {
            continue
        }
        const groupPath = path.join(jobGroupsDir, groupEntry.name)
        for (const memberEntry of fs.readdirSync(groupPath, { withFileTypes: true })) {
            if (!memberEntry.isDirectory() || memberEntry.isSymbolicLink()) {
                continue
            }
            const prdPath = path.join(groupPath, memberEntry.name, 'prd.json')
            if (fs.existsSync(prdPath)) {
                candidates.push({ slug: memberEntry.name, prdPath, mtimeMs: fs.statSync(prdPath).mtimeMs })
            }
        }
    }
    return candidates
}

function readPrdCarrier(prdPath) {
    let prd
    try {
        prd = JSON.parse(fs.readFileSync(prdPath, 'utf8'))
    } catch (error) {
        process.stderr.write(`[load-prds-by-task-id] failed to parse ${prdPath}: ${error.message}\n`)
        return null
    }

    const carrier = {
        userStories: Array.isArray(prd?.userStories) ? prd.userStories.map(toStoryCarrier).filter(Boolean) : [],
    }
    if (Array.isArray(prd?.dependencies)) {
        carrier.dependencies = prd.dependencies.filter((dependency) => typeof dependency === 'string')
    }
    return carrier
}

function toStoryCarrier(story) {
    if (!story || typeof story.id !== 'string') {
        return null
    }
    const carrier = { id: story.id }
    if (Array.isArray(story.dependencies)) {
        carrier.dependencies = story.dependencies.filter((dependency) => typeof dependency === 'string')
    }
    if (typeof story.passes === 'boolean' || typeof story.passes === 'string') {
        carrier.passes = story.passes
    }
    return carrier
}

function loadOverviewData(dataFile) {
    if (!fs.existsSync(dataFile)) {
        return {}
    }
    const windowValue = {}
    new Function('window', fs.readFileSync(dataFile, 'utf8'))(windowValue)
    return windowValue.OVERVIEW_DATA ?? {}
}

function normalizeConfigPaths(config, repoRoot) {
    const ralphRoot = resolveMaybeAbsolute(repoRoot, config.ralphRoot)
    return {
        dataFile: resolveMaybeAbsolute(repoRoot, config.dataFile),
        ralphSubdirs: {
            jobs: resolveMaybeAbsolute(ralphRoot, config.ralphSubdirs.jobs),
            jobGroups: resolveMaybeAbsolute(ralphRoot, config.ralphSubdirs.jobGroups),
        },
    }
}

function resolveMaybeAbsolute(base, value) {
    return path.isAbsolute(value) ? path.normalize(value) : path.resolve(base, value)
}
