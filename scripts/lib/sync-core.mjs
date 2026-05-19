import fs from 'node:fs'
import path from 'node:path'

import { deriveRalphStage } from './derive-ralph-stage.mjs'

const FINDINGS_FILES = Object.freeze([
    ['code', 'code-review-findings.json'],
    ['docs', 'docs-review-findings.json'],
])
const KIND_PRECEDENCE = Object.freeze(['job', 'group', 'brainstorm'])
const MEDIUM_PLUS = new Set(['Medium', 'High', 'Critical'])
const TRANSIENT_RENAME_ERRORS = new Set(['EBUSY', 'EACCES', 'EPERM'])
const RENAME_RETRY_LIMIT = 3
const RENAME_RETRY_DELAY_MS = 100

export async function walkRalphState({ repoRoot, config, generatedFromCommit }) {
    if (!repoRoot || !config) {
        throw new Error('walkRalphState requires repoRoot and config')
    }

    const absoluteRepoRoot = path.resolve(repoRoot)
    const normalizedConfig = normalizeConfigPaths(config, absoluteRepoRoot)
    const overviewData = loadOverviewData(normalizedConfig.dataFile)
    const taskIds = new Set((overviewData.tasks ?? []).map((task) => task.id).filter(Boolean))
    const ralphOverrides = overviewData.ralphOverrides ?? {}
    const unmatched = []

    const bundles = [
        ...readJobLikeBundles({
            repoRoot: absoluteRepoRoot,
            rootDir: normalizedConfig.ralphSubdirs.jobs,
            ralphRoot: normalizedConfig.ralphRoot,
            ignored: normalizedConfig.watcher.ignored,
            kind: 'job',
        }),
        ...readJobLikeBundles({
            repoRoot: absoluteRepoRoot,
            rootDir: normalizedConfig.ralphSubdirs.jobGroups,
            ralphRoot: normalizedConfig.ralphRoot,
            ignored: normalizedConfig.watcher.ignored,
            kind: 'group',
        }),
        ...readBrainstormBundles({
            repoRoot: absoluteRepoRoot,
            rootDir: normalizedConfig.ralphSubdirs.brainstorms,
            ralphRoot: normalizedConfig.ralphRoot,
            ignored: normalizedConfig.watcher.ignored,
        }),
    ]

    const validBundles = []
    for (const bundle of bundles) {
        if (bundle.parseError) {
            unmatched.push(unmatchedEntry(bundle, 'parse-error'))
            continue
        }

        const match = resolveTaskMatch({ slug: bundle.slug, ralphOverrides, taskIds })
        if (!match) {
            unmatched.push(unmatchedEntry(bundle, 'no-matching-task-id'))
            continue
        }

        validBundles.push({ ...bundle, taskId: match.taskId, matchSource: match.matchSource })
    }

    const withinKindWinners = []
    for (const sameKindBundles of groupBy(validBundles, (bundle) => `${bundle.kind}:${bundle.taskId}`).values()) {
        const winner = pickMostRecentByMtime(sameKindBundles)
        withinKindWinners.push(winner)
        for (const loser of sameKindBundles) {
            if (loser !== winner) {
                unmatched.push(unmatchedEntry(loser, 'duplicate-resolution'))
            }
        }
    }

    const byTaskId = {}
    for (const sameTaskBundles of groupBy(withinKindWinners, (bundle) => bundle.taskId).values()) {
        const { winner, shadowed } = resolveCrossKindPrecedence(sameTaskBundles)
        for (const loser of shadowed) {
            unmatched.push(unmatchedEntry(loser, `shadowed-by-${winner.kind}`))
        }
        byTaskId[winner.taskId] = toPipelineState(winner)
    }

    return {
        generatedAt: new Date().toISOString(),
        generatedFromCommit,
        byTaskId: sortObjectByKey(byTaskId),
        unmatched: sortUnmatched(unmatched),
        unmatchedSummary: summarizeUnmatched(unmatched),
    }
}

export function resolveCrossKindPrecedence(bundles) {
    const ordered = [...bundles].sort((a, b) => KIND_PRECEDENCE.indexOf(a.kind) - KIND_PRECEDENCE.indexOf(b.kind))
    return { winner: ordered[0], shadowed: ordered.slice(1) }
}

export function pickMostRecentByMtime(candidates) {
    return [...candidates].sort((a, b) => {
        const updatedDiff = getBundleTimestamp(b) - getBundleTimestamp(a)
        if (updatedDiff !== 0) {
            return updatedDiff
        }
        return String(a.slug).localeCompare(String(b.slug))
    })[0]
}

export async function writeSidecar({ repoRoot, config, state }) {
    if (!repoRoot || !config || !state) {
        throw new Error('writeSidecar requires repoRoot, config, and state')
    }

    const absoluteRepoRoot = path.resolve(repoRoot)
    const json = JSON.stringify(state).replace(/<\/(script)/gi, '<\\/$1')
    const outputs = config.outputs ?? {}
    await atomicWriteFile(resolveMaybeAbsolute(absoluteRepoRoot, outputs.sidecarJson), json)
    await atomicWriteFile(resolveMaybeAbsolute(absoluteRepoRoot, outputs.sidecarJs), `window.OVERVIEW_RALPH_STATE = ${json};`)
}

async function atomicWriteFile(finalPath, contents) {
    if (!finalPath) {
        throw new Error('writeSidecar requires configured output paths')
    }
    fs.mkdirSync(path.dirname(finalPath), { recursive: true })
    const tmpPath = `${finalPath}.tmp`
    let fd
    try {
        fd = fs.openSync(tmpPath, 'w')
        fs.writeFileSync(fd, contents)
        fs.fsyncSync(fd)
    } finally {
        if (fd !== undefined) {
            fs.closeSync(fd)
        }
    }

    try {
        await renameWithRetry(tmpPath, finalPath)
    } catch (error) {
        fs.rmSync(tmpPath, { force: true })
        throw error
    }
}

async function renameWithRetry(tmpPath, finalPath) {
    for (let attempt = 1; attempt <= RENAME_RETRY_LIMIT; attempt += 1) {
        try {
            fs.renameSync(tmpPath, finalPath)
            return
        } catch (error) {
            if (!TRANSIENT_RENAME_ERRORS.has(error?.code) || attempt === RENAME_RETRY_LIMIT) {
                throw error
            }
            await delay(RENAME_RETRY_DELAY_MS)
        }
    }
}

function delay(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

function readJobLikeBundles({ repoRoot, rootDir, ralphRoot, ignored, kind }) {
    const bundles = []
    for (const entry of readDirectChildDirs({ repoRoot, rootDir, ralphRoot, ignored })) {
        const slug = entry.name
        const dir = entry.path
        const artifacts = kind === 'group' ? { groupDir: relativePath(repoRoot, dir) } : { jobDir: relativePath(repoRoot, dir) }
        const jobStateResult = readJsonFile(path.join(dir, 'job-state.json'))

        if (jobStateResult.error) {
            console.error(`sync-core: failed to parse ${path.join(dir, 'job-state.json')}: ${jobStateResult.error.message}`)
            bundles.push({ kind, slug, dir, dirMtimeMs: entry.mtimeMs, artifacts, parseError: true })
            continue
        }

        const prdResult = readJsonFile(path.join(dir, 'prd.json'))
        const reviewOpenCount = readReviewOpenCount(dir)
        const bundle = {
            kind,
            slug,
            dir,
            dirMtimeMs: entry.mtimeMs,
            artifacts: {
                ...artifacts,
                ...(prdResult.value ? { prdFile: relativePath(repoRoot, path.join(dir, 'prd.json')) } : {}),
                ...(kind === 'group' && fs.existsSync(path.join(dir, 'group.json'))
                    ? { planFile: relativePath(repoRoot, path.join(dir, 'group.json')) }
                    : {}),
            },
            jobState: jobStateResult.value,
            prd: prdResult.value,
            reviewOpenCount,
            jobDirMarker: true,
        }
        bundles.push(bundle)
    }
    return bundles
}

function readBrainstormBundles({ repoRoot, rootDir, ralphRoot, ignored }) {
    const bundles = []
    for (const entry of readDirectChildDirs({ repoRoot, rootDir, ralphRoot, ignored })) {
        const brainstormPath = path.join(entry.path, 'brainstorm.json')
        const brainstormResult = readJsonFile(brainstormPath)
        if (!brainstormResult.value) {
            continue
        }
        bundles.push({
            kind: 'brainstorm',
            slug: entry.name,
            dir: entry.path,
            dirMtimeMs: entry.mtimeMs,
            brainstormJson: brainstormResult.value,
            artifacts: { brainstormDir: relativePath(repoRoot, entry.path) },
        })
    }
    return bundles
}

function readDirectChildDirs({ repoRoot, rootDir, ralphRoot, ignored }) {
    if (!isPathInside(rootDir, ralphRoot) || !fs.existsSync(rootDir)) {
        return []
    }

    return fs.readdirSync(rootDir, { withFileTypes: true }).flatMap((entry) => {
        const childPath = path.join(rootDir, entry.name)
        if (entry.isSymbolicLink() || !entry.isDirectory()) {
            return []
        }
        if (matchesIgnored(childPath, repoRoot, ignored)) {
            return []
        }
        return [{ name: entry.name, path: childPath, mtimeMs: fs.statSync(childPath).mtimeMs }]
    })
}

function readReviewOpenCount(dir) {
    const counts = {}
    for (const [key, fileName] of FINDINGS_FILES) {
        const result = readJsonFile(path.join(dir, fileName))
        if (!result.value) {
            continue
        }
        counts[key] = countOpenMediumPlus(result.value)
    }
    return counts
}

function countOpenMediumPlus(value) {
    const findings = Array.isArray(value?.findings) ? value.findings : Array.isArray(value) ? value : []
    return findings.filter((finding) => finding?.status === 'open' && MEDIUM_PLUS.has(finding?.severity)).length
}

function resolveTaskMatch({ slug, ralphOverrides, taskIds }) {
    const overrideTaskId = ralphOverrides[slug]
    if (overrideTaskId) {
        return { taskId: overrideTaskId, matchSource: 'override' }
    }
    if (taskIds.has(slug)) {
        return { taskId: slug, matchSource: 'slug-default' }
    }
    return null
}

function toPipelineState(bundle) {
    const stage = deriveRalphStage({
        jobState: bundle.jobState,
        prd: bundle.prd,
        brainstormJson: bundle.brainstormJson,
        reviewOpenCount: bundle.reviewOpenCount,
        jobDirMarker: bundle.jobDirMarker,
    })
    const orchestrator = asRecord(asRecord(bundle.jobState)?.orchestrator)

    return pruneUndefined({
        stage,
        entryPath: bundle.kind === 'brainstorm' ? 'brainstorm-first' : undefined,
        artifacts: bundle.artifacts,
        jobSlug: bundle.kind === 'job' ? bundle.slug : undefined,
        groupSlug: bundle.kind === 'group' ? bundle.slug : undefined,
        isParallel: bundle.kind === 'group' ? true : undefined,
        matchSource: bundle.matchSource,
        storyCompletion: asRecord(bundle.jobState)?.storyCompletion,
        reviewOpenCount: bundle.reviewOpenCount,
        terminalReason: orchestrator?.terminalReason,
        lastUpdatedAt: asRecord(bundle.jobState)?.updatedAt,
    })
}

function loadOverviewData(dataFile) {
    if (!fs.existsSync(dataFile)) {
        return {}
    }
    const windowValue = {}
    new Function('window', fs.readFileSync(dataFile, 'utf8'))(windowValue)
    return windowValue.OVERVIEW_DATA ?? {}
}

function readJsonFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return { value: undefined }
    }
    try {
        return { value: JSON.parse(fs.readFileSync(filePath, 'utf8')) }
    } catch (error) {
        return { value: undefined, error }
    }
}

function normalizeConfigPaths(config, repoRoot) {
    const ralphRoot = resolveMaybeAbsolute(repoRoot, config.ralphRoot)
    return {
        ...config,
        dataFile: resolveMaybeAbsolute(repoRoot, config.dataFile),
        ralphRoot,
        ralphSubdirs: {
            jobs: resolveMaybeAbsolute(ralphRoot, config.ralphSubdirs.jobs),
            jobGroups: resolveMaybeAbsolute(ralphRoot, config.ralphSubdirs.jobGroups),
            brainstorms: resolveMaybeAbsolute(ralphRoot, config.ralphSubdirs.brainstorms),
        },
        watcher: { ignored: config.watcher?.ignored ?? [] },
    }
}

function resolveMaybeAbsolute(base, value) {
    return path.isAbsolute(value) ? path.normalize(value) : path.resolve(base, value)
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

function isPathInside(child, parent) {
    const relative = path.relative(parent, child)
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function relativePath(repoRoot, filePath) {
    return toPosix(path.relative(repoRoot, filePath))
}

function toPosix(value) {
    return value.split(path.sep).join('/')
}

function groupBy(values, getKey) {
    const grouped = new Map()
    for (const value of values) {
        const key = getKey(value)
        grouped.set(key, [...(grouped.get(key) ?? []), value])
    }
    return grouped
}

function getBundleTimestamp(bundle) {
    const updatedAt = asRecord(bundle.jobState)?.updatedAt
    const parsed = typeof updatedAt === 'string' ? Date.parse(updatedAt) : NaN
    return Number.isNaN(parsed) ? bundle.dirMtimeMs ?? 0 : parsed
}

function sortObjectByKey(value) {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
}

function sortUnmatched(unmatched) {
    return [...unmatched].sort((a, b) => a.kind.localeCompare(b.kind) || a.slug.localeCompare(b.slug) || a.reason.localeCompare(b.reason))
}

function summarizeUnmatched(unmatched) {
    return sortObjectByKey(
        unmatched.reduce((summary, entry) => {
            summary[entry.reason] = (summary[entry.reason] ?? 0) + 1
            return summary
        }, {}),
    )
}

function unmatchedEntry(bundle, reason) {
    return { kind: bundle.kind, slug: bundle.slug, reason }
}

function pruneUndefined(value) {
    return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined))
}

function asRecord(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value
    }
    return undefined
}
