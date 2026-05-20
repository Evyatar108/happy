import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { appendJournalEntry, formatJournalLine } from './append-journal.mjs'

let repoRoot

beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'append-journal-'))
})

afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true })
})

describe('appendJournalEntry', () => {
    test('appends a journal line with semantic inputs', () => {
        appendJournalEntry({
            repoRoot,
            taskId: 'US-003',
            ts: '2026-05-20T08:20:00.000Z',
            prevStage: 'planned',
            newStage: 'implementing',
            slug: 'ralph-pipeline-07-context',
        })

        expect(readJournal('US-003')).toBe(
            '- 2026-05-20T08:20:00.000Z  stage: planned → implementing  (job: ralph-pipeline-07-context)\n',
        )
    })

    test('creates the task directory idempotently', () => {
        const entry = {
            repoRoot,
            taskId: 'US-004',
            ts: '2026-05-20T08:21:00.000Z',
            prevStage: 'implementing',
            newStage: 'reviewing',
            slug: 'ralph-pipeline-07-context',
        }

        appendJournalEntry(entry)
        appendJournalEntry({ ...entry, ts: '2026-05-20T08:22:00.000Z' })

        expect(readJournal('US-004')).toBe(
            '- 2026-05-20T08:21:00.000Z  stage: implementing → reviewing  (job: ralph-pipeline-07-context)\n' +
                '- 2026-05-20T08:22:00.000Z  stage: implementing → reviewing  (job: ralph-pipeline-07-context)\n',
        )
    })

    test('rejects path-traversal task ids', () => {
        expect(() =>
            appendJournalEntry({
                repoRoot,
                taskId: '../etc/passwd',
                ts: '2026-05-20T08:23:00.000Z',
                prevStage: 'planned',
                newStage: 'implementing',
                slug: 'ralph-pipeline-07-context',
            }),
        ).toThrow(/invalid taskId/)
    })
})

describe('formatJournalLine', () => {
    test('formats the exact journal line', () => {
        expect(
            formatJournalLine({
                ts: '2026-05-20T08:24:00.000Z',
                prevStage: 'reviewing',
                newStage: 'shipped',
                slug: 'ralph-pipeline-07-context',
            }),
        ).toBe('- 2026-05-20T08:24:00.000Z  stage: reviewing → shipped  (job: ralph-pipeline-07-context)\n')
    })
})

function readJournal(taskId) {
    return fs.readFileSync(path.join(repoRoot, 'tasks', taskId, 'journal.md'), 'utf8')
}
