import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { appendJournalEntry, appendJournalNote, assertSafeTaskId, formatJournalLine } from './append-journal.mjs'

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

describe('appendJournalNote', () => {
    test('appends a single-line note', () => {
        appendJournalNote({
            repoRoot,
            taskId: 'US-005',
            ts: '2026-05-20T08:25:00.000Z',
            note: 'recorded by the MCP server',
        })

        expect(readJournal('US-005')).toBe('- 2026-05-20T08:25:00.000Z  note: recorded by the MCP server\n')
    })

    test('appends a multi-line note with continuation indentation', () => {
        appendJournalNote({
            repoRoot,
            taskId: 'US-006',
            ts: '2026-05-20T08:26:00.000Z',
            note: 'first line\nsecond line\nthird line',
        })

        expect(readJournal('US-006')).toBe(
            '- 2026-05-20T08:26:00.000Z  note: first line\n  second line\n  third line\n',
        )
    })

    test('preserves special characters in note text', () => {
        appendJournalNote({
            repoRoot,
            taskId: 'US-007',
            ts: '2026-05-20T08:27:00.000Z',
            note: 'symbols: <>&"\' ` $PATH \\ slash',
        })

        expect(readJournal('US-007')).toBe('- 2026-05-20T08:27:00.000Z  note: symbols: <>&"\' ` $PATH \\ slash\n')
    })

    test('creates task directory idempotently and appends duplicate notes by design', () => {
        const entry = {
            repoRoot,
            taskId: 'US-008',
            ts: '2026-05-20T08:28:00.000Z',
            note: 'same note',
        }

        appendJournalNote(entry)
        appendJournalNote(entry)

        expect(readJournal('US-008')).toBe(
            '- 2026-05-20T08:28:00.000Z  note: same note\n' +
                '- 2026-05-20T08:28:00.000Z  note: same note\n',
        )
    })

    test('fsyncs appended note writes', () => {
        const fsyncSpy = vi.spyOn(fs, 'fsyncSync')

        appendJournalNote({
            repoRoot,
            taskId: 'US-009',
            ts: '2026-05-20T08:29:00.000Z',
            note: 'durable write',
        })

        expect(fsyncSpy).toHaveBeenCalledTimes(1)
        fsyncSpy.mockRestore()
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

describe('assertSafeTaskId', () => {
    test('is exported for callers that need to validate before filesystem reads', () => {
        expect(() => assertSafeTaskId('US-010')).not.toThrow()
        expect(() => assertSafeTaskId('../US-010')).toThrow(/invalid taskId/)
    })
})

function readJournal(taskId) {
    return fs.readFileSync(path.join(repoRoot, 'tasks', taskId, 'journal.md'), 'utf8')
}
