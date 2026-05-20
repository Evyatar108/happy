import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import Ajv from 'ajv'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { start } from './watch-ralph-state.mjs'

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const fixtureRoots = []
const openHandles = []

afterEach(async () => {
    for (const handle of openHandles.splice(0)) {
        await handle.stop()
    }
    for (const fixtureRoot of fixtureRoots.splice(0)) {
        fs.rmSync(fixtureRoot, { recursive: true, force: true })
    }
})

describe('Plan 05 end-to-end acceptance', () => {
    test('one-shot sync produces all durable artifacts and generated snapshot validates against generated schema', () => {
        const fixture = makeRepoFixture({ taskId: 'e2e-task', phase: '1' })

        const result = runOneShotSync(fixture)

        expect(result.status).toBe(0)
        expect(fs.existsSync(path.join(fixture, 'plans/overview-snapshot.json'))).toBe(true)
        expect(fs.existsSync(path.join(fixture, 'plans/overview-data.json'))).toBe(true)
        expect(fs.existsSync(path.join(fixture, 'plans/overview-activity.jsonl'))).toBe(true)
        expect(fs.existsSync(path.join(fixture, 'plans/overview-snapshot.schema.json'))).toBe(true)
        expect(fs.existsSync(path.join(fixture, 'tasks/INDEX.md'))).toBe(true)
        const firstRunEvents = readJsonLines(path.join(fixture, 'plans/overview-activity.jsonl'))
        expect(firstRunEvents.length).toBeGreaterThanOrEqual(1)
        expect(firstRunEvents[0]).toMatchObject({ taskId: 'e2e-task', changedFields: ['stage'], prevStage: null })

        const schema = readJson(path.join(fixture, 'plans/overview-snapshot.schema.json'))
        const snapshot = readJson(path.join(fixture, 'plans/overview-snapshot.json'))
        const validate = new Ajv().compile(schema)
        expect(validate(snapshot)).toBe(true)
        expect(validate.errors).toBeNull()
        expect(snapshot.tasks[0]).toMatchObject({ id: 'e2e-task', ralph: { stage: 'implementing' } })
    })

    test('watcher stage flip appends one activity event within one debounce', async () => {
        const fixture = makeRepoFixture({ taskId: 'e2e-task', phase: '1' })
        const handle = await start({ repoRoot: fixture, debounceMs: 25, processLabel: 'plan05-acceptance' })
        openHandles.push(handle)

        writeJobState(fixture, 'e2e-task', { orchestrator: { phase: '5a', terminal: false } })

        await vi.waitFor(() => {
            const events = readJsonLines(path.join(fixture, 'plans/overview-activity.jsonl'))
            expect(events).toHaveLength(1)
            expect(events[0]).toMatchObject({ taskId: 'e2e-task', changedFields: ['stage'] })
            expect(events[0].prevStage).not.toBe(events[0].newStage)
        }, { timeout: 3_000 })
    })

    test('rerunning one-shot sync rotates an over-limit activity log', () => {
        const fixture = makeRepoFixture({ taskId: 'e2e-task', phase: '1' })
        expect(runOneShotSync(fixture).status).toBe(0)

        const activityPath = path.join(fixture, 'plans/overview-activity.jsonl')
        const backupPath = path.join(fixture, 'plans/overview-activity.1.jsonl')
        fs.writeFileSync(activityPath, Array.from({ length: 1001 }, (_, index) => JSON.stringify({ index })).join('\n') + '\n')

        const result = runOneShotSync(fixture)

        expect(result.status).toBe(0)
        expect(fs.existsSync(backupPath)).toBe(true)
        expect(readJsonLines(backupPath)).toHaveLength(1001)
        expect(fs.existsSync(activityPath)).toBe(true)
        expect(fs.statSync(activityPath).size).toBe(0)
    })
})

function makeRepoFixture({ taskId, phase }) {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'plan05-acceptance-'))
    fixtureRoots.push(fixture)
    for (const dir of ['plans', '.ralph/jobs', '.ralph/job-groups', '.ralph/brainstorms', '.crews/crews', '.crews/sessions-configs']) {
        fs.mkdirSync(path.join(fixture, dir), { recursive: true })
    }
    fs.writeFileSync(
        path.join(fixture, 'plans/overview-data.js'),
        `window.OVERVIEW_DATA = ${JSON.stringify({ tasks: [{ id: taskId, title: 'E2E task' }] }, null, 2)};\n`,
    )
    writeJobState(fixture, taskId, { orchestrator: { phase, terminal: false } })
    return fixture
}

function writeJobState(fixture, taskId, value) {
    const jobDir = path.join(fixture, '.ralph/jobs', taskId)
    fs.mkdirSync(jobDir, { recursive: true })
    fs.writeFileSync(path.join(jobDir, 'job-state.json'), `${JSON.stringify(value, null, 2)}\n`)
}

function runOneShotSync(fixture) {
    return spawnSync('pnpm', ['sync-ralph-state', '--repo', fixture], {
        cwd: repoRoot,
        encoding: 'utf8',
        shell: true,
    })
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function readJsonLines(filePath) {
    if (!fs.existsSync(filePath)) {
        return []
    }
    return fs
        .readFileSync(filePath, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
}
