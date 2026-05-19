import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { appendActivity, rotateActivity } from './emit-activity.mjs'

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'emit-activity-test-'))
}

function buildEvent(overrides = {}) {
    return {
        ts: '2026-05-19T14:00:00.000Z',
        slug: 'TASK-001',
        taskId: 'TASK-001',
        prevStage: 'planning',
        newStage: 'implementing',
        changedFields: ['stage'],
        reason: 'sync',
        ...overrides,
    }
}

function readEventsToleratingTornFinalLine(filePath) {
    return fs
        .readFileSync(filePath, 'utf8')
        .split('\n')
        .filter((line) => line.length > 0)
        .flatMap((line, index, lines) => {
            try {
                return [JSON.parse(line)]
            } catch (error) {
                if (index === lines.length - 1) {
                    return []
                }
                throw error
            }
        })
}

let tempRoot
let activityPath
let activityBackupPath

beforeEach(() => {
    tempRoot = makeTempDir()
    activityPath = path.join(tempRoot, 'plans', 'overview-activity.jsonl')
    activityBackupPath = path.join(tempRoot, 'plans', 'overview-activity.1.jsonl')
})

afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(tempRoot, { recursive: true, force: true })
})

describe('appendActivity', () => {
    test('appends one JSON line with a single writeSync call and fsyncs it', () => {
        const writeSpy = vi.spyOn(fs, 'writeSync')
        const fsyncSpy = vi.spyOn(fs, 'fsyncSync')
        const event = buildEvent()

        appendActivity(tempRoot, event, { activityPath, activityBackupPath })

        expect(writeSpy).toHaveBeenCalledTimes(1)
        expect(fsyncSpy).toHaveBeenCalledTimes(1)
        expect(readEventsToleratingTornFinalLine(activityPath)).toEqual([event])
    })

    test('rotates before append when current file has maxLines entries', () => {
        fs.mkdirSync(path.dirname(activityPath), { recursive: true })
        fs.writeFileSync(activityPath, `${JSON.stringify(buildEvent({ slug: 'old-1' }))}\n${JSON.stringify(buildEvent({ slug: 'old-2' }))}\n`)
        fs.writeFileSync(activityBackupPath, 'stale backup\n')

        const event = buildEvent({ slug: 'new-event' })
        appendActivity(tempRoot, event, { activityPath, activityBackupPath, maxLines: 2 })

        expect(readEventsToleratingTornFinalLine(activityPath)).toEqual([event])
        expect(readEventsToleratingTornFinalLine(activityBackupPath).map((entry) => entry.slug)).toEqual(['old-1', 'old-2'])
    })

    test('rejects activity lines larger than 4KB', () => {
        const event = buildEvent({ changedFields: ['x'.repeat(4096)] })

        expect(() => appendActivity(tempRoot, event, { activityPath, activityBackupPath })).toThrow(/exceeds 4096 bytes/)
        expect(fs.existsSync(activityPath)).toBe(false)
    })

    test('does not write for a retain update with zero activity events', () => {
        const events = []
        for (const event of events) {
            appendActivity(tempRoot, event, { activityPath, activityBackupPath })
        }

        expect(fs.existsSync(activityPath)).toBe(false)
    })

    test('appends storyCompletion, removal, and first-observation event shapes', () => {
        const events = [
            buildEvent({ changedFields: ['storyCompletion'] }),
            buildEvent({ changedFields: ['stage'], newStage: null }),
            buildEvent({ changedFields: ['stage'], prevStage: null }),
        ]

        for (const event of events) {
            appendActivity(tempRoot, event, { activityPath, activityBackupPath })
        }

        expect(readEventsToleratingTornFinalLine(activityPath)).toEqual(events)
    })

    test('activity readers can skip a torn final line', () => {
        fs.mkdirSync(path.dirname(activityPath), { recursive: true })
        const event = buildEvent()
        fs.writeFileSync(activityPath, `${JSON.stringify(event)}\n{"ts":"torn"`)

        expect(readEventsToleratingTornFinalLine(activityPath)).toEqual([event])
    })
})

describe('rotateActivity', () => {
    test('renames the activity file over any previous backup', () => {
        fs.mkdirSync(path.dirname(activityPath), { recursive: true })
        fs.writeFileSync(activityPath, 'fresh\n')
        fs.writeFileSync(activityBackupPath, 'stale\n')

        rotateActivity(activityPath, activityBackupPath)

        expect(fs.existsSync(activityPath)).toBe(false)
        expect(fs.readFileSync(activityBackupPath, 'utf8')).toBe('fresh\n')
    })
})
