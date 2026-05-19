import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { codexuDefaultConfig } from '../../../../scripts/lib/default-config.mjs'
import { loadConfig } from '../../../../scripts/lib/resolve-config.mjs'

const previousOverviewConfigPath = process.env.OVERVIEW_CONFIG_PATH
const fixtureRoots: string[] = []

afterEach(() => {
    vi.restoreAllMocks()
    if (previousOverviewConfigPath === undefined) {
        delete process.env.OVERVIEW_CONFIG_PATH
    } else {
        process.env.OVERVIEW_CONFIG_PATH = previousOverviewConfigPath
    }
    for (const fixtureRoot of fixtureRoots.splice(0)) {
        rmSync(fixtureRoot, { recursive: true, force: true })
    }
})

describe('Ralph overview config', () => {
    it('keeps the default config frozen with Plan 05 output keys', () => {
        expect(Object.isFrozen(codexuDefaultConfig)).toBe(true)
        expect(Object.isFrozen(codexuDefaultConfig.outputs)).toBe(true)
        expect(Object.isFrozen(codexuDefaultConfig.ralphSubdirs)).toBe(true)
        expect(Object.isFrozen(codexuDefaultConfig.watcher)).toBe(true)
        expect(Object.keys(codexuDefaultConfig).sort()).toEqual([
            'dataFile',
            'lockFile',
            'outputs',
            'ralphRoot',
            'ralphSubdirs',
            'watcher',
        ])
        expect(codexuDefaultConfig.outputs.activityMaxLines).toBe(1000)
    })

    it('loads committed config with local overlay and resolves paths absolutely', () => {
        const repoRoot = makeRepoFixture()
        const committedPath = path.join(repoRoot, 'configs', 'redirected.json')
        writeJson(committedPath, {
            dataFile: 'custom/overview-data.js',
            outputs: {
                sidecarJs: 'custom/state.js',
                snapshot: 'custom/overview-snapshot.json',
                activityMaxLines: 25,
            },
            watcher: { ignored: ['committed/**'] },
        })
        writeJson(path.join(repoRoot, 'configs', 'redirected.local.json'), {
            outputs: {
                sidecarJson: 'local/state.json',
                activity: 'local/overview-activity.jsonl',
            },
            watcher: { ignored: ['local/**'] },
        })

        process.env.OVERVIEW_CONFIG_PATH = committedPath
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

        const config = loadConfig({ repoRoot })

        expect(config.dataFile).toBe(path.join(repoRoot, 'custom', 'overview-data.js'))
        expect(config.outputs.sidecarJs).toBe(path.join(repoRoot, 'custom', 'state.js'))
        expect(config.outputs.sidecarJson).toBe(path.join(repoRoot, 'local', 'state.json'))
        expect(config.outputs.snapshot).toBe(path.join(repoRoot, 'custom', 'overview-snapshot.json'))
        expect(config.outputs.activity).toBe(path.join(repoRoot, 'local', 'overview-activity.jsonl'))
        expect(config.outputs.activityBackup).toBe(path.join(repoRoot, 'plans', 'overview-activity.1.jsonl'))
        expect(config.outputs.dataJson).toBe(path.join(repoRoot, 'plans', 'overview-data.json'))
        expect(config.outputs.snapshotSchema).toBe(path.join(repoRoot, 'plans', 'overview-snapshot.schema.json'))
        expect(config.outputs.tasksIndex).toBe(path.join(repoRoot, 'tasks', 'INDEX.md'))
        expect(config.outputs.activityMaxLines).toBe(25)
        expect(Number.isInteger(config.outputs.activityMaxLines)).toBe(true)
        expect(config.ralphRoot).toBe(path.join(repoRoot, '.ralph'))
        expect(config.ralphSubdirs.jobs).toBe(path.join(repoRoot, '.ralph', 'jobs'))
        expect(config.watcher.ignored).toEqual(['local/**'])
        expect(Object.isFrozen(config)).toBe(true)
        expect(Object.isFrozen(config.outputs)).toBe(true)
        expect(Object.isFrozen(config.ralphSubdirs)).toBe(true)
        expect(Object.isFrozen(config.watcher)).toBe(true)
        expect(warn).not.toHaveBeenCalled()
    })

    it('lets configPath override OVERVIEW_CONFIG_PATH', () => {
        const repoRoot = makeRepoFixture()
        const envConfigPath = path.join(repoRoot, 'configs', 'env.json')
        const argConfigPath = path.join(repoRoot, 'configs', 'arg.json')
        writeJson(envConfigPath, { dataFile: 'env-data.js' })
        writeJson(argConfigPath, { dataFile: 'arg-data.js' })
        process.env.OVERVIEW_CONFIG_PATH = envConfigPath
        vi.spyOn(console, 'warn').mockImplementation(() => {})

        const config = loadConfig({ repoRoot, configPath: argConfigPath })

        expect(config.dataFile).toBe(path.join(repoRoot, 'arg-data.js'))
    })

    it('warns instead of throwing when configured Ralph subdirectories are missing', () => {
        const repoRoot = makeEmptyRalphFixture()
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

        expect(() => loadConfig({ repoRoot })).not.toThrow()
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing ralphSubdirs.jobs directory'))
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing ralphSubdirs.jobGroups directory'))
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing ralphSubdirs.brainstorms directory'))
    })

    it('passes through unknown root keys and unknown nested keys in outputs after resolution', () => {
        const repoRoot = makeRepoFixture()
        const committedPath = path.join(repoRoot, 'configs', 'future.json')
        writeJson(committedPath, {
            futureRootKey: 'root-value',
            outputs: { futureOutputKey: 'custom/snapshot.json' },
        })
        process.env.OVERVIEW_CONFIG_PATH = committedPath
        vi.spyOn(console, 'warn').mockImplementation(() => {})

        const config = loadConfig({ repoRoot }) as Record<string, unknown> & {
            outputs: Record<string, unknown>
        }

        expect(config.futureRootKey).toBe('root-value')
        expect(config.outputs.futureOutputKey).toBe('custom/snapshot.json')
        expect(Object.isFrozen(config)).toBe(true)
        expect(Object.isFrozen(config.outputs)).toBe(true)
    })

    it('keeps the committed config populated with the Plan 05 output keys', () => {
        const config = JSON.parse(readFileSync(path.resolve(process.cwd(), '../..', '.ralph/overview-config.json'), 'utf8'))
        const schema = JSON.parse(readFileSync(path.resolve(process.cwd(), '../..', '.ralph/overview-config.schema.json'), 'utf8'))

        expect(config.outputs).toMatchObject({
            snapshot: 'plans/overview-snapshot.json',
            activity: 'plans/overview-activity.jsonl',
            activityBackup: 'plans/overview-activity.1.jsonl',
            dataJson: 'plans/overview-data.json',
            snapshotSchema: 'plans/overview-snapshot.schema.json',
            tasksIndex: 'tasks/INDEX.md',
            activityMaxLines: 1000,
        })
        expect(schema.properties.outputs.properties.activityMaxLines).toMatchObject({
            type: 'integer',
            minimum: 1,
            default: 1000,
        })
    })

    it('keeps the committed config as parseable JSON with a schema reference', () => {
        const config = JSON.parse(readFileSync(path.resolve(process.cwd(), '../..', '.ralph/overview-config.json'), 'utf8'))
        const schema = JSON.parse(readFileSync(path.resolve(process.cwd(), '../..', '.ralph/overview-config.schema.json'), 'utf8'))

        expect(config.$schema).toBe('./overview-config.schema.json')
        expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    })
})

function makeRepoFixture(): string {
    const repoRoot = mkdtempSync(path.join(tmpdir(), 'codexu-overview-config-'))
    fixtureRoots.push(repoRoot)
    mkdirSync(path.join(repoRoot, 'configs'), { recursive: true })
    mkdirSync(path.join(repoRoot, '.ralph', 'jobs'), { recursive: true })
    mkdirSync(path.join(repoRoot, '.ralph', 'job-groups'), { recursive: true })
    mkdirSync(path.join(repoRoot, '.ralph', 'brainstorms'), { recursive: true })
    return repoRoot
}

function makeEmptyRalphFixture(): string {
    const repoRoot = mkdtempSync(path.join(tmpdir(), 'codexu-overview-config-empty-'))
    fixtureRoots.push(repoRoot)
    mkdirSync(path.join(repoRoot, '.ralph'), { recursive: true })
    return repoRoot
}

function writeJson(filePath: string, value: unknown): void {
    writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}
