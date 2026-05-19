import fs from 'node:fs'
import path from 'node:path'

import { deriveRalphStage, IMPLEMENTING_PHASES, REVIEW_PHASES } from './derive-ralph-stage.mjs'
import { rotateActivity } from './emit-activity.mjs'
import { buildSnapshot } from './emit-snapshot.mjs'
import { SNAPSHOT_SCHEMA } from './emit-snapshot-schema.mjs'
import { buildTasksIndex } from './emit-tasks-index.mjs'
import { matchesIgnored as sharedMatchesIgnored, toPosix as sharedToPosix } from './path-utils.mjs'

const KNOWN_ORCHESTRATOR_PHASES = new Set([...REVIEW_PHASES, ...IMPLEMENTING_PHASES])
const _warnedUnknownPhases = new Set()

export function _resetUnknownPhaseWarnings() {
    _warnedUnknownPhases.clear()
}

function warnUnknownPhase(slug, phase) {
    const key = `${slug}::${phase}`
    if (_warnedUnknownPhases.has(key)) {
        return
    }
    _warnedUnknownPhases.add(key)
    process.stderr.write(
        `[sync-ralph-state] unknown orchestrator.phase="${phase}" for job ${slug} — derived stage=implementing (schema drift?)\n`,
    )
}

const FINDINGS_FILES = Object.freeze([
    ['code', 'code-review-findings.json'],
    ['docs', 'docs-review-findings.json'],
])
const KIND_PRECEDENCE = Object.freeze(['job', 'group', 'brainstorm'])
const MEDIUM_PLUS = new Set(['Medium', 'High', 'Critical'])
const TRANSIENT_RENAME_ERRORS = new Set(['EBUSY', 'EACCES', 'EPERM'])
const RENAME_RETRY_LIMIT = 3
const RENAME_RETRY_DELAY_MS = 100
const PLAN_04_RECOMMENDATIONS_PATH = 'plans/overview-recommendations.json'
const PLAN_04_DEPENDENCY_GRAPH_PATH = 'plans/overview-dependency-graph.json'

export async function walkRalphState({ repoRoot, config, generatedFromCommit }) {
    if (!repoRoot || !config) {
        throw new Error('walkRalphState requires repoRoot and config')
    }

    const absoluteRepoRoot = path.resolve(repoRoot)
    const normalizedConfig = normalizeConfigPaths(config, absoluteRepoRoot)
    const bundles = readAllBundles({ repoRoot: absoluteRepoRoot, config: normalizedConfig })

    return assembleStateFromBundles({ bundles, repoRoot: absoluteRepoRoot, config: normalizedConfig, generatedFromCommit })
}

export function readBundleForSlug({ repoRoot, config, kind, slug }) {
    if (!repoRoot || !config || !kind || !slug) {
        throw new Error('readBundleForSlug requires repoRoot, config, kind, and slug')
    }

    const absoluteRepoRoot = path.resolve(repoRoot)
    const normalizedConfig = normalizeConfigPaths(config, absoluteRepoRoot)
    const rootDir = getRootDirForKind(normalizedConfig, kind)
    if (!rootDir) {
        throw new Error(`unknown Ralph bundle kind: ${kind}`)
    }
    const dir = path.join(rootDir, slug)
    if (!isPathInside(dir, normalizedConfig.ralphRoot) || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        return undefined
    }
    if (matchesIgnored(dir, absoluteRepoRoot, normalizedConfig.watcher.ignored)) {
        return undefined
    }

    const [bundle] =
        kind === 'brainstorm'
            ? readBrainstormBundles({
                  repoRoot: absoluteRepoRoot,
                  rootDir,
                  ralphRoot: normalizedConfig.ralphRoot,
                  ignored: normalizedConfig.watcher.ignored,
                  slugs: new Set([slug]),
              })
            : readJobLikeBundles({
                  repoRoot: absoluteRepoRoot,
                  rootDir,
                  ralphRoot: normalizedConfig.ralphRoot,
                  ignored: normalizedConfig.watcher.ignored,
                  kind,
                  slugs: new Set([slug]),
              })
    return bundle
}

export function assembleStateFromBundles({ bundles, repoRoot, config, generatedFromCommit }) {
    const absoluteRepoRoot = path.resolve(repoRoot)
    const normalizedConfig = normalizeConfigPaths(config, absoluteRepoRoot)
    const overviewData = loadOverviewData(normalizedConfig.dataFile)
    const taskIds = new Set((overviewData.tasks ?? []).map((task) => task.id).filter(Boolean))
    const ralphOverrides = overviewData.ralphOverrides ?? {}
    const unmatched = []

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

export function deriveAffectedTaskUpdate({ repoRoot, config, kind, slug, currentState, generatedFromCommit }) {
    if (!repoRoot || !config || !kind || !slug) {
        throw new Error('deriveAffectedTaskUpdate requires repoRoot, config, kind, and slug')
    }

    const absoluteRepoRoot = path.resolve(repoRoot)
    const normalizedConfig = normalizeConfigPaths(config, absoluteRepoRoot)
    const touched = getFullTouchedEntries(currentState)
    addTouched(touched, { kind, slug })

    // TODO(F-006/F-012): plan Architecture calls for reading ONLY the touched bundle +
    // cross-kind candidates competing for the same taskId. A per-slug refactor was
    // prototyped but breaks plan AC #4: orphan slugs that were newly created during
    // the debounce window need to surface as `no-matching-task-id` unmatched entries
    // in the merged state, and the only discovery path for an unmatched-no-taskId
    // slug is a full walk of the corresponding subdir. Punting to a follow-up plan
    // that either (a) tracks "newly observed slugs" via chokidar `add`/`addDir` and
    // injects them into the touched set, or (b) accepts a small relaxation of AC #4
    // for the rare "new orphan slug" case. For now, behavior is correct (full walk
    // preserves the equivalence invariant) at the cost of one fs.readdirSync per
    // debounce tick.
    const allBundles = readAllBundles({ repoRoot: absoluteRepoRoot, config: normalizedConfig })

    // F-016: detect parse-error directly from the readAllBundles result instead of
    // making a separate readBundleForSlug fs read. The bundle list already includes
    // any parse-error entry for the touched (kind, slug); short-circuit when found
    // so we retain the prior byTaskId entry but refresh unmatched + unmatchedSummary
    // with a fresh parse-error fragment (matches F-001/F-013 retain semantics).
    const directBundle = allBundles.find((bundle) => bundle.kind === kind && bundle.slug === slug)
    if (directBundle?.parseError) {
        return {
            action: 'retain',
            taskId: findCurrentTaskIdForSlug(currentState, kind, slug) ?? resolveTaskIdForSlug(normalizedConfig, slug),
            kind,
            slug,
            touched: sortTouched(touched),
            unmatchedFragment: [unmatchedEntry(directBundle, 'parse-error')],
            error: directBundle.parseErrorMessage ?? `failed to parse ${kind} ${slug}`,
        }
    }

    const fragment = assembleStateFromBundles({
        bundles: allBundles,
        repoRoot: absoluteRepoRoot,
        config: normalizedConfig,
        generatedFromCommit: generatedFromCommit ?? currentState?.generatedFromCommit,
    })
    for (const entry of fragment.unmatched ?? []) {
        addTouched(touched, entry)
    }

    const taskIds = new Set()
    const matchedTaskId = resolveTaskIdForSlug(normalizedConfig, slug)
    if (matchedTaskId) {
        taskIds.add(matchedTaskId)
    }
    const currentTaskId = findCurrentTaskIdForSlug(currentState, kind, slug)
    if (currentTaskId) {
        taskIds.add(currentTaskId)
    }
    for (const taskId of Object.keys(fragment.byTaskId)) {
        const entry = fragment.byTaskId[taskId]
        if (entryMatchesSlug(entry, kind, slug) || taskIds.has(taskId)) {
            taskIds.add(taskId)
        }
    }

    const fragmentByTaskId = Object.fromEntries([...taskIds].flatMap((taskId) => (fragment.byTaskId[taskId] ? [[taskId, fragment.byTaskId[taskId]]] : [])))
    const primaryTaskId = [...taskIds][0]

    if (Object.keys(fragmentByTaskId).length > 0) {
        return {
            action: 'upsert',
            taskId: primaryTaskId,
            kind,
            slug,
            touched: sortTouched(touched),
            byTaskId: sortObjectByKey(fragmentByTaskId),
            newPipelineState: primaryTaskId ? fragmentByTaskId[primaryTaskId] : undefined,
            unmatchedFragment: fragment.unmatched ?? [],
        }
    }

    return {
        action: 'remove',
        taskId: primaryTaskId,
        kind,
        slug,
        touched: sortTouched(touched),
        unmatchedFragment: fragment.unmatched ?? [],
    }
}

export async function mergeAndWrite({ repoRoot, config, currentState, updates, generatedFromCommit }) {
    if (!repoRoot || !config || !currentState || !Array.isArray(updates)) {
        throw new Error('mergeAndWrite requires repoRoot, config, currentState, and updates')
    }

    const byTaskId = { ...(currentState.byTaskId ?? {}) }
    let unmatched = [...(currentState.unmatched ?? [])]
    const changedTaskIds = new Set()

    for (const update of updates) {
        if (update.action !== 'retain') {
            for (const taskId of update.taskId ? [update.taskId] : []) {
                delete byTaskId[taskId]
                changedTaskIds.add(taskId)
            }
            for (const [taskId, pipelineState] of Object.entries(update.byTaskId ?? {})) {
                byTaskId[taskId] = pipelineState
                changedTaskIds.add(taskId)
            }
        }
        // F-001/F-013: retain updates still refresh unmatched + unmatchedSummary
        // so parse-error entries get reflected on every write. byTaskId is preserved
        // (no mutations above when action === 'retain'), but the unmatched slice is
        // re-derived from the touched (kind, slug) set + the fresh unmatchedFragment.
        if (Array.isArray(update.touched) && Array.isArray(update.unmatchedFragment)) {
            unmatched = dropTouchedUnmatched(unmatched, update.touched)
            unmatched.push(...update.unmatchedFragment)
        }
    }

    const state = {
        generatedAt: new Date().toISOString(),
        generatedFromCommit: generatedFromCommit ?? currentState.generatedFromCommit,
        byTaskId: sortObjectByKey(byTaskId),
        unmatched: sortUnmatched(dedupeUnmatched(unmatched)),
        unmatchedSummary: summarizeUnmatched(unmatched),
    }
    state.unmatchedSummary = summarizeUnmatched(state.unmatched)
    const activityEvents = deriveActivityEvents({ previousByTaskId: currentState.byTaskId ?? {}, nextByTaskId: state.byTaskId, ts: state.generatedAt })
    await writeSidecar({ repoRoot, config, state })
    return { state, writtenAt: state.generatedAt, changedTaskIds: [...changedTaskIds].sort(), activityEvents }
}

function deriveActivityEvents({ previousByTaskId, nextByTaskId, ts }) {
    const taskIds = new Set([...Object.keys(previousByTaskId), ...Object.keys(nextByTaskId)])
    return [...taskIds].sort().flatMap((taskId) => {
        const previous = previousByTaskId[taskId]
        const next = nextByTaskId[taskId]
        const changedFields = []

        if (previous?.stage !== next?.stage) {
            changedFields.push('stage')
        }
        if (previous && next && !sameStoryCompletion(previous.storyCompletion, next.storyCompletion)) {
            changedFields.push('storyCompletion')
        }
        if (changedFields.length === 0) {
            return []
        }

        return [
            {
                ts,
                slug: activitySlug(next ?? previous, taskId),
                kind: activityKind(next ?? previous),
                taskId,
                prevStage: previous?.stage ?? null,
                newStage: next?.stage ?? null,
                changedFields,
                reason: 'sync',
            },
        ]
    })
}

function sameStoryCompletion(previous, next) {
    const previousValue = previous ?? null
    const nextValue = next ?? null
    return JSON.stringify(previousValue) === JSON.stringify(nextValue)
}

function activitySlug(entry, taskId) {
    return entry?.jobSlug ?? entry?.groupSlug ?? slugFromArtifacts(entry?.artifacts) ?? taskId
}

function activityKind(entry) {
    if (entry?.jobSlug != null) return 'job'
    if (entry?.groupSlug != null) return 'group'
    if (entry?.artifacts?.brainstormDir != null) return 'brainstorm'
    return 'job'
}

function slugFromArtifacts(artifacts) {
    const artifactPath = artifacts?.jobDir ?? artifacts?.groupDir ?? artifacts?.brainstormDir
    return typeof artifactPath === 'string' ? artifactPath.split('/').filter(Boolean).at(-1) : undefined
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
    await emitAgentArtifacts({ repoRoot: absoluteRepoRoot, config, state })

    const json = JSON.stringify(state).replace(/<\/(script)/gi, '<\\/$1')
    const outputs = config.outputs ?? {}
    await atomicWriteFile(resolveMaybeAbsolute(absoluteRepoRoot, outputs.sidecarJson), json)
    await atomicWriteFile(resolveMaybeAbsolute(absoluteRepoRoot, outputs.sidecarJs), `window.OVERVIEW_RALPH_STATE = ${json};`)
}

async function emitAgentArtifacts({ repoRoot, config, state }) {
    const outputs = config.outputs ?? {}
    const overviewData = loadOverviewData(resolveMaybeAbsolute(repoRoot, config.dataFile))
    const snapshot = buildSnapshot({
        ralphState: state,
        overviewData,
        recommendations: readJsonFile(path.join(repoRoot, PLAN_04_RECOMMENDATIONS_PATH)).value ?? [],
        dependencyGraph: readJsonFile(path.join(repoRoot, PLAN_04_DEPENDENCY_GRAPH_PATH)).value ?? { nodes: [], edges: [] },
        runDurations: state.runDurations ?? {},
    })

    await atomicWriteFile(resolveMaybeAbsolute(repoRoot, outputs.snapshotSchema), `${JSON.stringify(SNAPSHOT_SCHEMA, null, 2)}\n`)
    await atomicWriteFile(resolveMaybeAbsolute(repoRoot, outputs.snapshot), `${JSON.stringify(snapshot, null, 2)}\n`)
    await atomicWriteFile(resolveMaybeAbsolute(repoRoot, outputs.dataJson), `${JSON.stringify(overviewData, null, 2)}\n`)
    await atomicWriteFile(resolveMaybeAbsolute(repoRoot, outputs.tasksIndex), buildTasksIndex(snapshot))
    ensureActivityFile({
        activityPath: resolveMaybeAbsolute(repoRoot, outputs.activity),
        activityBackupPath: resolveMaybeAbsolute(repoRoot, outputs.activityBackup),
        maxLines: outputs.activityMaxLines,
    })
}

function ensureActivityFile({ activityPath, activityBackupPath, maxLines }) {
    if (countLines(activityPath) >= maxLines) {
        rotateActivity(activityPath, activityBackupPath)
    }
    if (fs.existsSync(activityPath)) {
        return
    }
    fs.mkdirSync(path.dirname(activityPath), { recursive: true })
    fs.closeSync(fs.openSync(activityPath, 'w'))
}

function countLines(filePath) {
    if (!fs.existsSync(filePath)) {
        return 0
    }
    const contents = fs.readFileSync(filePath, 'utf8')
    if (!contents) {
        return 0
    }
    return contents.split('\n').filter((line) => line.length > 0).length
}

export async function atomicWriteFile(finalPath, contents) {
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

function readAllBundles({ repoRoot, config }) {
    return [
        ...readJobLikeBundles({
            repoRoot,
            rootDir: config.ralphSubdirs.jobs,
            ralphRoot: config.ralphRoot,
            ignored: config.watcher.ignored,
            kind: 'job',
        }),
        ...readJobLikeBundles({
            repoRoot,
            rootDir: config.ralphSubdirs.jobGroups,
            ralphRoot: config.ralphRoot,
            ignored: config.watcher.ignored,
            kind: 'group',
        }),
        ...readBrainstormBundles({
            repoRoot,
            rootDir: config.ralphSubdirs.brainstorms,
            ralphRoot: config.ralphRoot,
            ignored: config.watcher.ignored,
        }),
    ]
}

function getRootDirForKind(config, kind) {
    if (kind === 'job') {
        return config.ralphSubdirs.jobs
    }
    if (kind === 'group') {
        return config.ralphSubdirs.jobGroups
    }
    if (kind === 'brainstorm') {
        return config.ralphSubdirs.brainstorms
    }
    return undefined
}

function readJobLikeBundles({ repoRoot, rootDir, ralphRoot, ignored, kind, slugs }) {
    const bundles = []
    for (const entry of readDirectChildDirs({ repoRoot, rootDir, ralphRoot, ignored })) {
        if (slugs && !slugs.has(entry.name)) {
            continue
        }
        const slug = entry.name
        const dir = entry.path
        const artifacts = kind === 'group' ? { groupDir: relativePath(repoRoot, dir) } : { jobDir: relativePath(repoRoot, dir) }
        const jobStateResult = readJsonFile(path.join(dir, 'job-state.json'))

        if (jobStateResult.error) {
            console.error(`sync-core: failed to parse ${path.join(dir, 'job-state.json')}: ${jobStateResult.error.message}`)
            bundles.push({ kind, slug, dir, dirMtimeMs: entry.mtimeMs, artifacts, parseError: true, parseErrorMessage: jobStateResult.error.message })
            continue
        }

        const prdResult = readJsonFile(path.join(dir, 'prd.json'))
        if (prdResult.error) {
            console.error(`sync-core: failed to parse ${path.join(dir, 'prd.json')}: ${prdResult.error.message}`)
            bundles.push({ kind, slug, dir, dirMtimeMs: entry.mtimeMs, artifacts, parseError: true, parseErrorMessage: prdResult.error.message })
            continue
        }

        const { counts: reviewOpenCount, parseErrors: reviewParseErrors } = readReviewOpenCount(dir)
        for (const { fileName, error } of reviewParseErrors) {
            console.error(`sync-core: failed to parse ${path.join(dir, fileName)}: ${error.message}`)
            bundles.push({ kind, slug, dir, dirMtimeMs: entry.mtimeMs, artifacts, parseError: true, parseErrorFile: fileName, parseErrorMessage: error.message })
        }
        if (reviewParseErrors.length > 0) {
            continue
        }

        const groupJsonPath = path.join(dir, 'group.json')
        const groupJsonResult = kind === 'group' && fs.existsSync(groupJsonPath) ? readJsonFile(groupJsonPath) : {}

        const bundle = {
            kind,
            slug,
            dir,
            dirMtimeMs: entry.mtimeMs,
            artifacts: {
                ...artifacts,
                ...(prdResult.value ? { prdFile: relativePath(repoRoot, path.join(dir, 'prd.json')) } : {}),
                ...(kind === 'group' && fs.existsSync(groupJsonPath)
                    ? { planFile: relativePath(repoRoot, groupJsonPath) }
                    : {}),
            },
            jobState: jobStateResult.value,
            prd: prdResult.value,
            groupJson: groupJsonResult.value,
            reviewOpenCount,
            jobDirMarker: true,
        }
        bundles.push(bundle)
    }
    return bundles
}

function readBrainstormBundles({ repoRoot, rootDir, ralphRoot, ignored, slugs }) {
    const bundles = []
    for (const entry of readDirectChildDirs({ repoRoot, rootDir, ralphRoot, ignored })) {
        if (slugs && !slugs.has(entry.name)) {
            continue
        }
        const brainstormPath = path.join(entry.path, 'brainstorm.json')
        const brainstormResult = readJsonFile(brainstormPath)
        if (brainstormResult.error) {
            console.error(`sync-core: failed to parse ${brainstormPath}: ${brainstormResult.error.message}`)
            bundles.push({
                kind: 'brainstorm',
                slug: entry.name,
                dir: entry.path,
                dirMtimeMs: entry.mtimeMs,
                artifacts: { brainstormDir: relativePath(repoRoot, entry.path) },
                parseError: true,
                parseErrorMessage: brainstormResult.error.message,
            })
            continue
        }
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
    const parseErrors = []
    for (const [key, fileName] of FINDINGS_FILES) {
        const result = readJsonFile(path.join(dir, fileName))
        if (result.error) {
            parseErrors.push({ fileName, error: result.error })
            continue
        }
        if (!result.value) {
            continue
        }
        counts[key] = countOpenMediumPlus(result.value)
    }
    return { counts, parseErrors }
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

function deriveIsParallel(groupJson) {
    if (!groupJson || !Array.isArray(groupJson.jobs) || groupJson.jobs.length === 0) {
        return true
    }
    const concurrency = groupJson.concurrency
    if (typeof concurrency === 'number') {
        return concurrency > 1
    }
    const phases = groupJson.jobs.map((j) => j.phase)
    return phases.length !== new Set(phases).size
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
    const phase = typeof orchestrator?.phase === 'string' ? orchestrator.phase : undefined
    if (phase !== undefined && !KNOWN_ORCHESTRATOR_PHASES.has(phase)) {
        warnUnknownPhase(bundle.slug, phase)
    }

    return pruneUndefined({
        stage,
        entryPath: bundle.kind === 'brainstorm' ? 'brainstorm-first' : undefined,
        artifacts: bundle.artifacts,
        jobSlug: bundle.kind === 'job' ? bundle.slug : undefined,
        groupSlug: bundle.kind === 'group' ? bundle.slug : undefined,
        isParallel: bundle.kind === 'group' ? deriveIsParallel(bundle.groupJson) : undefined,
        matchSource: bundle.matchSource,
        storyCompletion: asRecord(bundle.jobState)?.storyCompletion,
        reviewOpenCount: bundle.reviewOpenCount,
        hasPrdWorthy: orchestrator?.hasPrdWorthy === true ? true : undefined,
        terminalReason: orchestrator?.terminalReason,
        lastUpdatedAt: asRecord(bundle.jobState)?.updatedAt,
    })
}

export function loadOverviewData(dataFile) {
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
    return sharedMatchesIgnored(filePath, repoRoot, ignored)
}

function isPathInside(child, parent) {
    const relative = path.relative(parent, child)
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function relativePath(repoRoot, filePath) {
    return toPosix(path.relative(repoRoot, filePath))
}

function toPosix(value) {
    return sharedToPosix(value)
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

function resolveTaskIdForSlug(config, slug) {
    const overviewData = loadOverviewData(config.dataFile)
    const overrideTaskId = overviewData.ralphOverrides?.[slug]
    if (overrideTaskId) {
        return overrideTaskId
    }
    return (overviewData.tasks ?? []).some((task) => task?.id === slug) ? slug : undefined
}

function findCurrentTaskIdForSlug(currentState, kind, slug) {
    for (const [taskId, entry] of Object.entries(currentState?.byTaskId ?? {})) {
        if (entryMatchesSlug(entry, kind, slug)) {
            return taskId
        }
    }
    return undefined
}

function entryMatchesSlug(entry, kind, slug) {
    if (!entry) {
        return false
    }
    if (kind === 'job') {
        return entry.jobSlug === slug || entry.artifacts?.jobDir?.endsWith(`/jobs/${slug}`)
    }
    if (kind === 'group') {
        return entry.groupSlug === slug || entry.artifacts?.groupDir?.endsWith(`/job-groups/${slug}`)
    }
    if (kind === 'brainstorm') {
        return entry.artifacts?.brainstormDir?.endsWith(`/brainstorms/${slug}`)
    }
    return false
}

function getFullTouchedEntries(currentState) {
    const touched = new Map()
    for (const entry of currentState?.unmatched ?? []) {
        addTouched(touched, entry)
    }
    for (const pipelineState of Object.values(currentState?.byTaskId ?? {})) {
        if (pipelineState.jobSlug) {
            addTouched(touched, { kind: 'job', slug: pipelineState.jobSlug })
        }
        if (pipelineState.groupSlug) {
            addTouched(touched, { kind: 'group', slug: pipelineState.groupSlug })
        }
        const brainstormSlug = slugFromArtifact(pipelineState.artifacts?.brainstormDir)
        if (brainstormSlug) {
            addTouched(touched, { kind: 'brainstorm', slug: brainstormSlug })
        }
    }
    return touched
}

function slugFromArtifact(artifactPath) {
    if (!artifactPath) {
        return undefined
    }
    return toPosix(artifactPath).split('/').filter(Boolean).at(-1)
}

function addTouched(touched, entry) {
    if (!entry?.kind || !entry?.slug) {
        return
    }
    touched.set(`${entry.kind}:${entry.slug}`, { kind: entry.kind, slug: entry.slug })
}

function sortTouched(touched) {
    return [...touched.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.slug.localeCompare(b.slug))
}

function dropTouchedUnmatched(unmatched, touched) {
    const touchedKeys = new Set(touched.map((entry) => `${entry.kind}:${entry.slug}`))
    return unmatched.filter((entry) => !touchedKeys.has(`${entry.kind}:${entry.slug}`))
}

function dedupeUnmatched(unmatched) {
    return [...new Map(unmatched.map((entry) => [`${entry.kind}:${entry.slug}:${entry.reason}`, entry])).values()]
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
