import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { discoverCrewSessions } from './crews-cross-walk.mjs'

let tempRoot
let repoRoot
let crewsRoot
let warnings

beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'crews-cross-walk-'))
    repoRoot = path.join(tempRoot, 'repo')
    crewsRoot = path.join(tempRoot, '.crews')
    warnings = []
    fs.mkdirSync(repoRoot, { recursive: true })
})

afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true })
})

describe('discoverCrewSessions', () => {
    test('matches a manifest lastSummary to a task and assigns the current Ralph stage', () => {
        writeManifest('crew-a', 'members', 'alice', {
            name: 'alice',
            crew: 'crew-a',
            cwd: repoRoot,
            startedAt: '2026-05-20T10:00:00.000Z',
            sessionId: 'session-a',
            transcriptPath: 'C:\\Users\\evmitran\\session-a.jsonl',
            lastHeartbeatAt: '2026-05-20T10:05:00.000Z',
            lastSummary: 'Working on TASK-123 now.',
        })

        const result = discover()

        expect(result.get('TASK-123')).toEqual({
            implementing: [
                {
                    crewName: 'crew-a',
                    memberName: 'alice',
                    startedAt: '2026-05-20T10:00:00.000Z',
                    sessionId: 'session-a',
                    transcriptPath: 'C:\\Users\\evmitran\\session-a.jsonl',
                    summary: 'Working on TASK-123 now.',
                    cwd: repoRoot,
                },
            ],
        })
    })

    test('walks member and lead manifests and dedupes by sessionId', () => {
        const manifest = {
            crew: 'crew-a',
            cwd: repoRoot,
            startedAt: '2026-05-20T10:00:00.000Z',
            sessionId: 'same-session',
            lastHeartbeatAt: '2026-05-20T10:05:00.000Z',
            lastSummary: 'TASK-123',
        }
        writeManifest('crew-a', 'members', 'alice', { ...manifest, name: 'alice' })
        writeManifest('crew-a', 'leads', 'lead-a', { ...manifest, name: 'lead-a', sessionId: 'lead-session' })
        writeManifest('crew-a', 'leads', 'alice', { ...manifest, name: 'alice' })

        const result = discover()

        expect(result.get('TASK-123').implementing).toHaveLength(2)
        expect(result.get('TASK-123').implementing.map((entry) => entry.memberName).sort()).toEqual(['alice', 'lead-a'])
    })

    test('accepts cwd equal to repo root and Windows case-normalized paths', () => {
        writeManifest('crew-a', 'members', 'alice', {
            name: 'alice',
            crew: 'crew-a',
            cwd: 'd:\\repo',
            startedAt: '2026-05-20T10:00:00.000Z',
            lastSummary: 'TASK-123',
        })

        const result = discover({ repoRoot: 'D:\\Repo' })

        expect(result.get('TASK-123').implementing[0]).toMatchObject({ crewName: 'crew-a', memberName: 'alice' })
    })

    test('rejects prefix attacks such as D:\\repo vs D:\\repo2', () => {
        writeManifest('crew-a', 'members', 'alice', {
            name: 'alice',
            crew: 'crew-a',
            cwd: 'D:\\repo2',
            startedAt: '2026-05-20T10:00:00.000Z',
            lastSummary: 'TASK-123',
        })

        const result = discover({ repoRoot: 'D:\\repo' })

        expect(result.size).toBe(0)
        expect(warnings.join('\n')).toContain('outside repo cwd')
    })

    test('falls back to the latest matching spawn-launcher prompt', () => {
        writeManifest('crew-a', 'members', 'alice', {
            name: 'alice',
            crew: 'crew-a',
            cwd: repoRoot,
            startedAt: '2026-05-20T10:00:00.000Z',
            lastSummary: null,
        })
        writeLauncher('alice-100.ps1', 'crew-a', 'alice', 'No task here.')
        writeLauncher('alice-200.ps1', 'crew-a', 'alice', 'Please work on TASK-123.')

        const result = discover()

        expect(result.get('TASK-123').implementing[0]).toMatchObject({ crewName: 'crew-a', memberName: 'alice' })
    })

    test('picks the longest task ID match from lastSummary', () => {
        writeManifest('crew-a', 'members', 'alice', {
            name: 'alice',
            crew: 'crew-a',
            cwd: repoRoot,
            startedAt: '2026-05-20T10:00:00.000Z',
            lastSummary: 'TASK-1 and TASK-123 both appear; prefer the longer ID.',
        })

        const result = discover({ taskIds: ['TASK-1', 'TASK-123'] })

        expect(result.has('TASK-1')).toBe(false)
        expect(result.get('TASK-123').implementing[0].memberName).toBe('alice')
    })

    test('logs ambiguous same-length multi-task matches and skips the entry', () => {
        writeManifest('crew-a', 'members', 'alice', {
            name: 'alice',
            crew: 'crew-a',
            cwd: repoRoot,
            startedAt: '2026-05-20T10:00:00.000Z',
            lastSummary: 'TASK-111 and TASK-222 are both plausible.',
        })

        const result = discover({ taskIds: ['TASK-111', 'TASK-222'] })

        expect(result.size).toBe(0)
        expect(warnings.join('\n')).toContain('ambiguous task match')
    })

    test('sets stale sessions to stopped once and preserves that outcome on later ticks', () => {
        writeManifest('crew-a', 'members', 'alice', {
            name: 'alice',
            crew: 'crew-a',
            cwd: repoRoot,
            startedAt: '2026-05-20T10:00:00.000Z',
            sessionId: 'session-a',
            lastHeartbeatAt: '2026-05-20T10:59:00.000Z',
            lastSummary: 'TASK-123',
        })

        const first = discover({ now: '2026-05-20T13:00:00.000Z' })
        const firstEntry = first.get('TASK-123').implementing[0]
        expect(firstEntry).toMatchObject({ outcome: 'stopped', endedAt: '2026-05-20T10:59:00.000Z' })

        writeManifest('crew-a', 'members', 'alice', {
            name: 'alice',
            crew: 'crew-a',
            cwd: repoRoot,
            startedAt: '2026-05-20T10:00:00.000Z',
            sessionId: 'session-a',
            lastHeartbeatAt: '2026-05-20T12:59:00.000Z',
            lastSummary: 'TASK-123',
        })
        const rerun = discover({ existingCrewSessions: { implementing: [firstEntry] }, now: '2026-05-20T13:00:00.000Z' })

        expect(rerun.get('TASK-123').implementing[0]).toMatchObject({ outcome: 'stopped', endedAt: '2026-05-20T10:59:00.000Z' })
    })

    test('keeps an existing entry in its recorded stage even when the task advances', () => {
        writeManifest('crew-a', 'members', 'alice', {
            name: 'alice',
            crew: 'crew-a',
            cwd: repoRoot,
            startedAt: '2026-05-20T10:00:00.000Z',
            sessionId: 'session-a',
            lastHeartbeatAt: '2026-05-20T10:05:00.000Z',
            lastSummary: 'TASK-123',
        })

        const result = discover({ stage: 'reviewing', existingCrewSessions: { implementing: [{ crewName: 'crew-a', memberName: 'alice', startedAt: '2026-05-20T10:00:00.000Z', sessionId: 'session-a' }] } })

        expect(result.get('TASK-123')).toHaveProperty('implementing')
        expect(result.get('TASK-123')).not.toHaveProperty('reviewing')
    })

    test('tolerates actor directories without manifest files and logs unmatched sessions', () => {
        fs.mkdirSync(path.join(crewsRoot, 'crews', 'crew-a', 'members', 'missing-manifest'), { recursive: true })
        writeManifest('crew-a', 'members', 'alice', {
            name: 'alice',
            crew: 'crew-a',
            cwd: repoRoot,
            startedAt: '2026-05-20T10:00:00.000Z',
            lastSummary: 'No task ID here.',
        })

        const result = discover()

        expect(result.size).toBe(0)
        expect(warnings.join('\n')).toContain('unmatched crew session')
    })
})

function discover({ taskIds = ['TASK-123'], stage = 'implementing', existingCrewSessions, now = '2026-05-20T10:30:00.000Z', repoRoot: root = repoRoot } = {}) {
    return discoverCrewSessions({
        repoRoot: root,
        crewsRoot,
        now,
        logger: { warn: (message) => warnings.push(message) },
        overviewData: { tasks: taskIds.map((id) => ({ id })) },
        ralphState: {
            generatedAt: '2026-05-20T10:00:00.000Z',
            generatedFromCommit: 'abc1234',
            byTaskId: Object.fromEntries(taskIds.map((id) => [id, { stage, ...(existingCrewSessions ? { crewSessions: existingCrewSessions } : {}) }])),
        },
    })
}

function writeManifest(crewName, role, memberName, manifest) {
    const manifestPath = path.join(crewsRoot, 'crews', crewName, role, memberName, 'manifest.json')
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true })
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
}

function writeLauncher(filename, crewName, memberName, prompt) {
    const launcherPath = path.join(crewsRoot, 'spawn-launchers', filename)
    fs.mkdirSync(path.dirname(launcherPath), { recursive: true })
    fs.writeFileSync(
        launcherPath,
        `# Auto-generated by crews plugin (spawnMember).
# name: ${memberName}   crew: ${crewName}
$env:CREWS_ROLE = 'member'
$env:CREWS_NAME = '${memberName}'
$env:CREWS_CREW = '${crewName}'
claude --name '${memberName}' '${prompt}'
`,
    )
}
