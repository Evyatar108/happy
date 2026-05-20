import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { _resetParseNotepadWarnings, parseNotepad } from './parse-notepad.mjs'

let stderrLines

beforeEach(() => {
    stderrLines = []
    _resetParseNotepadWarnings()
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
        stderrLines.push(String(chunk))
        return true
    })
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('parseNotepad', () => {
    test('returns zero counts for empty input', () => {
        expect(parseNotepad('')).toEqual({
            deferredQuestionsCount: 0,
            deferredQuestionsPreview: undefined,
            storyDoctorInterventions: 0,
        })
        expect(stderrLines).toEqual([])
    })

    test('returns zero counts when sections are absent', () => {
        expect(parseNotepad('# Notepad\n\n## Working Notes\n\nNo structured content.')).toEqual({
            deferredQuestionsCount: 0,
            deferredQuestionsPreview: undefined,
            storyDoctorInterventions: 0,
        })
        expect(stderrLines).toEqual([])
    })

    test('counts unanswered deferred questions and previews the first unanswered question', () => {
        const text = `# Notepad

## Deferred Questions

| Iter | Question | Answer | Auto-Resolved |
|------|----------|--------|---------------|
| 1 | What should happen to stale rows? | Delete them | No |
| 2 | Which branch should own the integration handoff? | | No |
| 3 | Should the helper parse HTML tables? | No | Yes |
`

        expect(parseNotepad(text)).toEqual({
            deferredQuestionsCount: 1,
            deferredQuestionsPreview: 'Which branch should own the integration handoff?',
            storyDoctorInterventions: 0,
        })
    })

    test('trims deferred question preview to 120 chars', () => {
        const longQuestion = 'A'.repeat(130)
        const text = `## Deferred Questions

| Question | Answer |
|----------|--------|
| ${longQuestion} | |
`

        expect(parseNotepad(text).deferredQuestionsPreview).toBe('A'.repeat(120))
    })

    test('malformed table returns zero counts and emits one deduped stderr warning', () => {
        const text = `## Deferred Questions

| Question | Answer |
| invalid separator |
| What failed? | |
`

        expect(parseNotepad(text)).toEqual({
            deferredQuestionsCount: 0,
            deferredQuestionsPreview: undefined,
            storyDoctorInterventions: 0,
        })
        expect(parseNotepad(text).deferredQuestionsCount).toBe(0)
        expect(stderrLines).toHaveLength(1)
        expect(stderrLines[0]).toContain('[parse-notepad] malformed table in Deferred Questions')
    })

    test('counts non-empty story doctor rows', () => {
        const text = `## Story Doctor Log

| Iter | Finding | Action |
|------|---------|--------|
| 1 | Split AC-6 | Accepted |
| 2 | Add browser fallback | Accepted |
`

        expect(parseNotepad(text)).toEqual({
            deferredQuestionsCount: 0,
            deferredQuestionsPreview: undefined,
            storyDoctorInterventions: 2,
        })
    })
})
