import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { loadPrdsByTaskId } from './load-prds-by-task-id.mjs'

let tempRoot
let stderrLines

beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'load-prds-test-'))
    stderrLines = []
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
        stderrLines.push(String(chunk))
        return true
    })
})

afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(tempRoot, { recursive: true, force: true })
})

describe('loadPrdsByTaskId', () => {
    test('returns an empty map when prd.json files are missing', () => {
        writeOverviewData({ tasks: [{ id: 'missing' }] })

        expect(loadPrdsByTaskId({ repoRoot: tempRoot, config: buildConfig() })).toEqual({})
    })

    test('logs malformed JSON and skips the file without throwing', () => {
        writeOverviewData({ tasks: [{ id: 'broken' }] })
        const prdPath = path.join(tempRoot, '.ralph', 'jobs', 'broken', 'prd.json')
        fs.mkdirSync(path.dirname(prdPath), { recursive: true })
        fs.writeFileSync(prdPath, '{ bad json')

        expect(() => loadPrdsByTaskId({ repoRoot: tempRoot, config: buildConfig() })).not.toThrow()
        expect(loadPrdsByTaskId({ repoRoot: tempRoot, config: buildConfig() })).toEqual({})
        expect(stderrLines.some((line) => line.startsWith(`[load-prds-by-task-id] failed to parse ${prdPath}:`))).toBe(true)
    })

    test('resolves ralphOverrides matches', () => {
        writeOverviewData({ tasks: [{ id: 'target' }], ralphOverrides: { 'job-slug': 'target' } })
        writePrd('.ralph/jobs/job-slug/prd.json', { userStories: [{ id: 'US-001', passes: true }] })

        expect(loadPrdsByTaskId({ repoRoot: tempRoot, config: buildConfig() })).toEqual({
            target: { userStories: [{ id: 'US-001', passes: true }] },
        })
    })

    test('loads group member PRDs from .ralph/job-groups/<group>/<member>/prd.json', () => {
        writeOverviewData({ tasks: [{ id: 'member-task' }] })
        writePrd('.ralph/job-groups/group-a/member-task/prd.json', { userStories: [{ id: 'US-001', dependencies: ['US-000'] }] })

        expect(loadPrdsByTaskId({ repoRoot: tempRoot, config: buildConfig() })).toEqual({
            'member-task': { userStories: [{ id: 'US-001', dependencies: ['US-000'] }] },
        })
    })

    test('uses the most recently modified PRD for duplicate task matches', () => {
        writeOverviewData({ tasks: [{ id: 'target' }], ralphOverrides: { older: 'target', newer: 'target' } })
        const olderPath = writePrd('.ralph/jobs/older/prd.json', { userStories: [{ id: 'US-OLD' }] })
        const newerPath = writePrd('.ralph/jobs/newer/prd.json', { userStories: [{ id: 'US-NEW' }] })
        fs.utimesSync(olderPath, new Date('2026-05-01T00:00:00Z'), new Date('2026-05-01T00:00:00Z'))
        fs.utimesSync(newerPath, new Date('2026-05-02T00:00:00Z'), new Date('2026-05-02T00:00:00Z'))

        expect(loadPrdsByTaskId({ repoRoot: tempRoot, config: buildConfig() })).toEqual({
            target: { userStories: [{ id: 'US-NEW' }] },
        })
    })

    test('preserves story passes and PRD-level dependencies', () => {
        writeOverviewData({ tasks: [{ id: 'task' }] })
        writePrd('.ralph/jobs/task/prd.json', {
            dependencies: ['base-task'],
            userStories: [{ id: 'US-001', dependencies: ['US-000'], passes: 'true' }],
        })

        expect(loadPrdsByTaskId({ repoRoot: tempRoot, config: buildConfig() })).toEqual({
            task: {
                userStories: [{ id: 'US-001', dependencies: ['US-000'], passes: 'true' }],
                dependencies: ['base-task'],
            },
        })
    })
})

function buildConfig() {
    return {
        dataFile: 'plans/overview-data.js',
        ralphRoot: '.ralph',
        ralphSubdirs: { jobs: 'jobs', jobGroups: 'job-groups' },
    }
}

function writeOverviewData(data) {
    const dataPath = path.join(tempRoot, 'plans', 'overview-data.js')
    fs.mkdirSync(path.dirname(dataPath), { recursive: true })
    fs.writeFileSync(dataPath, `window.OVERVIEW_DATA = ${JSON.stringify(data, null, 2)};\n`)
}

function writePrd(relativePath, value) {
    const filePath = path.join(tempRoot, relativePath)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
    return filePath
}
