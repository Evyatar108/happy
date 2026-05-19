import fs, { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { pickMostRecentByMtime, walkRalphState, writeSidecar } from '../../../../scripts/lib/sync-core.mjs'
import type { RalphOverviewConfig } from '../../../../scripts/lib/default-config.mjs'

const fixtureRoots: string[] = []

afterEach(() => {
    vi.restoreAllMocks()
    for (const fixtureRoot of fixtureRoots.splice(0)) {
        rmSync(fixtureRoot, { recursive: true, force: true })
    }
})

describe('walkRalphState', () => {
    it('applies job-over-brainstorm cross-kind precedence before stage derivation', async () => {
        const fixture = makeRepoFixture({ tasks: ['same'] })
        writeJson(path.join(fixture.repoRoot, '.ralph/jobs/same/job-state.json'), {
            updatedAt: '2026-05-01T00:00:00Z',
            orchestrator: { phase: '3', terminal: false },
        })
        writeJson(path.join(fixture.repoRoot, '.ralph/brainstorms/same/brainstorm.json'), {
            recommendedDirection: 'plan',
        })

        const state = await walkRalphState({
            repoRoot: fixture.repoRoot,
            config: fixture.config,
            generatedFromCommit: 'abc1234',
        })

        expect(Object.keys(state.byTaskId)).toEqual(['same'])
        expect(state.byTaskId.same.stage).toBe('implementing')
        expect(state.byTaskId.same.jobSlug).toBe('same')
        expect(state.unmatched).toContainEqual({ kind: 'brainstorm', slug: 'same', reason: 'shadowed-by-job' })
        expect(state.generatedFromCommit).toBe('abc1234')
    })

    it('picks the most recent within-kind duplicate using directory mtime fallback', async () => {
        const fixture = makeRepoFixture({ tasks: ['target'], ralphOverrides: { older: 'target', newer: 'target' } })
        const olderDir = path.join(fixture.repoRoot, '.ralph/jobs/older')
        const newerDir = path.join(fixture.repoRoot, '.ralph/jobs/newer')
        mkdirSync(olderDir, { recursive: true })
        mkdirSync(newerDir, { recursive: true })
        utimesSync(olderDir, new Date('2026-05-01T00:00:00Z'), new Date('2026-05-01T00:00:00Z'))
        utimesSync(newerDir, new Date('2026-05-02T00:00:00Z'), new Date('2026-05-02T00:00:00Z'))

        const state = await walkRalphState({
            repoRoot: fixture.repoRoot,
            config: fixture.config,
            generatedFromCommit: 'abc1234',
        })

        expect(state.byTaskId.target.jobSlug).toBe('newer')
        expect(state.byTaskId.target.matchSource).toBe('override')
        expect(state.unmatched).toContainEqual({ kind: 'job', slug: 'older', reason: 'duplicate-resolution' })
        expect(
            pickMostRecentByMtime([
                { kind: 'job', slug: 'a', dirMtimeMs: 1 },
                { kind: 'job', slug: 'b', dirMtimeMs: 2 },
            ]).slug,
        ).toBe('b')
        expect(
            pickMostRecentByMtime([
                { kind: 'job', slug: 'old-state', dirMtimeMs: 3, jobState: { updatedAt: '2026-05-01T00:00:00Z' } },
                { kind: 'job', slug: 'new-state', dirMtimeMs: 1, jobState: { updatedAt: '2026-05-03T00:00:00Z' } },
            ]).slug,
        ).toBe('new-state')
    })

    it('skips malformed job-state.json without deriving a stage from sibling files', async () => {
        const fixture = makeRepoFixture({ tasks: ['broken'] })
        mkdirSync(path.join(fixture.repoRoot, '.ralph/jobs/broken'), { recursive: true })
        writeFileSync(path.join(fixture.repoRoot, '.ralph/jobs/broken/job-state.json'), '{ bad json')
        writeJson(path.join(fixture.repoRoot, '.ralph/jobs/broken/prd.json'), { userStories: [] })
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})

        const state = await walkRalphState({
            repoRoot: fixture.repoRoot,
            config: fixture.config,
            generatedFromCommit: 'abc1234',
        })

        expect(state.byTaskId.broken).toBeUndefined()
        expect(state.unmatched).toContainEqual({ kind: 'job', slug: 'broken', reason: 'parse-error' })
        expect(error).toHaveBeenCalledWith(expect.stringContaining('failed to parse'))
    })

    it('skips malformed prd.json without deriving a stage from sibling files', async () => {
        const fixture = makeRepoFixture({ tasks: ['broken-prd'] })
        writeJson(path.join(fixture.repoRoot, '.ralph/jobs/broken-prd/job-state.json'), {
            orchestrator: { phase: '1', terminal: false },
        })
        writeFileSync(path.join(fixture.repoRoot, '.ralph/jobs/broken-prd/prd.json'), '{ bad json')
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})

        const state = await walkRalphState({
            repoRoot: fixture.repoRoot,
            config: fixture.config,
            generatedFromCommit: 'abc1234',
        })

        expect(state.byTaskId['broken-prd']).toBeUndefined()
        expect(state.unmatched).toContainEqual({ kind: 'job', slug: 'broken-prd', reason: 'parse-error' })
        expect(error).toHaveBeenCalledWith(expect.stringContaining('failed to parse'))
    })

    it('resolves slug-default and ralphOverrides matches', async () => {
        const fixture = makeRepoFixture({ tasks: ['direct', 'target'], ralphOverrides: { aliased: 'target' } })
        writeJson(path.join(fixture.repoRoot, '.ralph/jobs/direct/job-state.json'), {
            orchestrator: { phase: '1', terminal: false },
        })
        writeJson(path.join(fixture.repoRoot, '.ralph/jobs/aliased/job-state.json'), {
            orchestrator: { phase: '2', terminal: false },
        })

        const state = await walkRalphState({
            repoRoot: fixture.repoRoot,
            config: fixture.config,
            generatedFromCommit: 'abc1234',
        })

        expect(Object.keys(state.byTaskId)).toEqual(['direct', 'target'])
        expect(state.byTaskId.direct.matchSource).toBe('slug-default')
        expect(state.byTaskId.target.matchSource).toBe('override')
        expect(state.byTaskId.target.jobSlug).toBe('aliased')
    })

    it('treats a group directory as a top-level job and ignores nested member files', async () => {
        const fixture = makeRepoFixture({ tasks: ['member', 'parallel'] })
        writeJson(path.join(fixture.repoRoot, '.ralph/job-groups/parallel/group.json'), { name: 'parallel' })
        writeJson(path.join(fixture.repoRoot, '.ralph/job-groups/parallel/job-state.json'), {
            orchestrator: { terminal: true, terminalReason: 'complete' },
        })
        writeJson(path.join(fixture.repoRoot, '.ralph/job-groups/parallel/member/job-state.json'), {
            orchestrator: { phase: '3', terminal: false },
        })

        const state = await walkRalphState({
            repoRoot: fixture.repoRoot,
            config: fixture.config,
            generatedFromCommit: 'abc1234',
        })

        expect(state.byTaskId.parallel.stage).toBe('shipped')
        expect(state.byTaskId.parallel.groupSlug).toBe('parallel')
        expect(state.byTaskId.parallel.isParallel).toBe(true)
        expect(state.byTaskId.member).toBeUndefined()
    })

    it('keeps missing review findings absent instead of coercing them to zero', async () => {
        const fixture = makeRepoFixture({ tasks: ['reviewing'] })
        writeJson(path.join(fixture.repoRoot, '.ralph/jobs/reviewing/job-state.json'), {
            orchestrator: { phase: '5a', terminal: false },
        })

        const state = await walkRalphState({
            repoRoot: fixture.repoRoot,
            config: fixture.config,
            generatedFromCommit: 'abc1234',
        })

        expect(state.byTaskId.reviewing.stage).toBe('reviewing')
        expect(state.byTaskId.reviewing.reviewOpenCount).toEqual({})
        expect(state.byTaskId.reviewing.reviewOpenCount?.code).toBeUndefined()
    })

    it('does not walk outside the configured Ralph root or into ignored paths', async () => {
        const fixture = makeRepoFixture({ tasks: ['visible', 'hidden'] })
        writeJson(path.join(fixture.repoRoot, '.ralph/jobs/visible/job-state.json'), {
            orchestrator: { phase: '3', terminal: false },
        })
        writeJson(path.join(fixture.repoRoot, '.worktrees/hidden/.ralph/jobs/hidden/job-state.json'), {
            orchestrator: { phase: '3', terminal: false },
        })
        writeJson(path.join(fixture.repoRoot, '.ralph/jobs/.staging/job-state.json'), {
            orchestrator: { phase: '3', terminal: false },
        })

        const state = await walkRalphState({
            repoRoot: fixture.repoRoot,
            config: fixture.config,
            generatedFromCommit: 'abc1234',
        })

        expect(Object.keys(state.byTaskId)).toEqual(['visible'])
        expect(state.unmatched).toEqual([])
    })
})

describe('writeSidecar', () => {
    it('writes byte-identical escaped JS and JSON sidecars idempotently', async () => {
        const fixture = makeRepoFixture({ tasks: [] })
        const state = makeSidecarState({ slug: 'bad</script>slug' })

        await writeSidecar({ repoRoot: fixture.repoRoot, config: fixture.config, state })

        const jsPath = path.join(fixture.repoRoot, fixture.config.outputs.sidecarJs)
        const jsonPath = path.join(fixture.repoRoot, fixture.config.outputs.sidecarJson)
        const js = readFileSync(jsPath, 'utf8')
        const json = readFileSync(jsonPath, 'utf8')
        const prefix = 'window.OVERVIEW_RALPH_STATE = '
        const strippedJs = js.slice(prefix.length, -1)

        expect(js).toBe(`${prefix}${json};`)
        expect(strippedJs).toBe(json)
        expect(js).not.toContain('</script')
        expect(JSON.parse(json).unmatched[0].slug).toBe('bad</script>slug')
        expect(existsSync(`${jsPath}.tmp`)).toBe(false)

        await writeSidecar({ repoRoot: fixture.repoRoot, config: fixture.config, state })
        expect(readFileSync(jsPath, 'utf8')).toBe(js)
        expect(readFileSync(jsonPath, 'utf8')).toBe(json)
    })

    it('retries Windows-transient rename failures', async () => {
        const fixture = makeRepoFixture({ tasks: [] })
        const state = makeSidecarState({ slug: 'retry' })
        const jsPath = path.join(fixture.repoRoot, fixture.config.outputs.sidecarJs)
        const originalRenameSync = fs.renameSync.bind(fs)
        let jsRenameAttempts = 0
        const renameSync = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
            if (to === jsPath) {
                jsRenameAttempts += 1
                if (jsRenameAttempts < 3) {
                    throw Object.assign(new Error('busy'), { code: 'EBUSY' })
                }
            }
            return originalRenameSync(from, to)
        })

        await expect(writeSidecar({ repoRoot: fixture.repoRoot, config: fixture.config, state })).resolves.toBeUndefined()

        expect(jsRenameAttempts).toBe(3)
        expect(renameSync).toHaveBeenCalledTimes(4)
        expect(readFileSync(jsPath, 'utf8')).toContain('window.OVERVIEW_RALPH_STATE = ')
    })

    it('rejects after the third Windows-transient rename failure', async () => {
        const fixture = makeRepoFixture({ tasks: [] })
        const state = makeSidecarState({ slug: 'retry-fails' })
        const jsPath = path.join(fixture.repoRoot, fixture.config.outputs.sidecarJs)
        const originalRenameSync = fs.renameSync.bind(fs)
        let jsRenameAttempts = 0
        vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
            if (to === jsPath) {
                jsRenameAttempts += 1
                throw Object.assign(new Error('busy'), { code: 'EBUSY' })
            }
            return originalRenameSync(from, to)
        })

        await expect(writeSidecar({ repoRoot: fixture.repoRoot, config: fixture.config, state })).rejects.toThrow('busy')

        expect(jsRenameAttempts).toBe(3)
        expect(existsSync(`${jsPath}.tmp`)).toBe(false)
    })
})

function makeRepoFixture({
    tasks,
    ralphOverrides = {},
}: {
    tasks: string[]
    ralphOverrides?: Record<string, string>
}): { repoRoot: string; config: RalphOverviewConfig } {
    const repoRoot = mkdtempSync(path.join(tmpdir(), 'codexu-sync-core-'))
    fixtureRoots.push(repoRoot)
    for (const dir of [
        'plans',
        '.ralph/jobs',
        '.ralph/job-groups',
        '.ralph/brainstorms',
        '.worktrees/hidden/.ralph/jobs/hidden',
    ]) {
        mkdirSync(path.join(repoRoot, dir), { recursive: true })
    }
    writeFileSync(
        path.join(repoRoot, 'plans/overview-data.js'),
        `window.OVERVIEW_DATA = ${JSON.stringify({ tasks: tasks.map((id) => ({ id })), ralphOverrides }, null, 2)};\n`,
    )

    return {
        repoRoot,
        config: {
            dataFile: 'plans/overview-data.js',
            ralphRoot: '.ralph',
            ralphSubdirs: { jobs: 'jobs', jobGroups: 'job-groups', brainstorms: 'brainstorms' },
            outputs: { sidecarJs: 'plans/overview-ralph-state.js', sidecarJson: 'plans/overview-ralph-state.json' },
            lockFile: '.ralph/overview-sync.lock',
            watcher: {
                ignored: [
                    '.worktrees/**',
                    '**/.git/**',
                    '.ralph/jobs/*/worktree/**',
                    '.ralph/jobs/.staging/**',
                    '.ralph/telemetry/**',
                    '.crews/logs/**',
                    '.crews/spawn-launchers/**',
                ],
            },
        },
    }
}

function writeJson(filePath: string, value: unknown): void {
    mkdirSync(path.dirname(filePath), { recursive: true })
    writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function makeSidecarState({ slug }: { slug: string }) {
    return {
        generatedAt: '2026-05-18T00:00:00.000Z',
        generatedFromCommit: 'abc1234',
        byTaskId: {
            task: {
                stage: 'implementing' as const,
                artifacts: { jobDir: '.ralph/jobs/task' },
                jobSlug: 'task',
                matchSource: 'slug-default' as const,
            },
        },
        unmatched: [{ kind: 'job' as const, slug, reason: 'no-matching-task-id' }],
        unmatchedSummary: { 'no-matching-task-id': 1 },
    }
}
