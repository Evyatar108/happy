import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import { buildSnapshot } from './emit-snapshot.mjs'

function buildRalphState(overrides = {}) {
    return {
        generatedAt: '2026-05-19T13:45:00.000Z',
        generatedFromCommit: 'abc1234',
        byTaskId: {},
        ...overrides,
    }
}

describe('buildSnapshot', () => {
    test('uses empty Plan 04 defaults when optional inputs are absent', () => {
        const snapshot = buildSnapshot({
            ralphState: buildRalphState(),
            overviewData: { tasks: [{ id: 'TASK-001', status: 'ready' }] },
        })

        expect(snapshot.schemaVersion).toBe(1)
        expect(snapshot.recommendations).toEqual([])
        expect(snapshot.dependencyGraph).toEqual({ nodes: [], edges: [] })
        expect(snapshot.runDurations).toEqual({})
        expect(snapshot.runs).toEqual([])
        expect(snapshot.unmatched).toEqual([])
        expect(snapshot.unmatchedSummary).toEqual({})
    })

    test('merges overview tasks with matching Ralph state and fixture-with-files inputs', () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emit-snapshot-test-'))
        const plansDir = path.join(tempRoot, 'plans')
        fs.mkdirSync(plansDir, { recursive: true })

        const ralphState = buildRalphState({
            byTaskId: {
                'TASK-001': {
                    stage: 'implementing',
                    artifacts: { jobDir: '.ralph/jobs/TASK-001' },
                    storyCompletion: { total: 3, passed: 1, blocked: 0, remaining: 2 },
                },
            },
            unmatched: [{ kind: 'job', slug: 'orphan-job', reason: 'no-matching-task-id' }],
            unmatchedSummary: { 'no-matching-task-id': 1 },
        })

        const recommendationsPath = path.join(plansDir, 'overview-recommendations.json')
        const dependencyGraphPath = path.join(plansDir, 'overview-dependency-graph.json')
        fs.writeFileSync(recommendationsPath, JSON.stringify([{ taskId: 'TASK-001', score: 0.9, rationale: 'ready' }]))
        fs.writeFileSync(
            dependencyGraphPath,
            JSON.stringify({ nodes: [{ id: 'TASK-001' }], edges: [{ from: 'TASK-001', to: 'TASK-002' }] }),
        )

        try {
            const snapshot = buildSnapshot({
                ralphState,
                overviewData: {
                    tasks: [
                        { id: 'TASK-001', scope: 'pipeline' },
                        { id: 'TASK-002', status: 'soon' },
                    ],
                    runs: [{ id: 'run-1', taskId: 'TASK-001', outcome: 'pass' }],
                },
                recommendations: JSON.parse(fs.readFileSync(recommendationsPath, 'utf8')),
                dependencyGraph: JSON.parse(fs.readFileSync(dependencyGraphPath, 'utf8')),
                runDurations: { 'run-1': 42 },
                generatedFromCommit: 'def5678',
            })

            expect(snapshot.generatedAt).toBe(ralphState.generatedAt)
            expect(snapshot.generatedFromCommit).toBe('def5678')
            expect(snapshot.tasks[0]).toEqual({
                id: 'TASK-001',
                scope: 'pipeline',
                ralph: ralphState.byTaskId['TASK-001'],
            })
            expect(snapshot.tasks[1]).toEqual({ id: 'TASK-002', status: 'soon' })
            expect(snapshot.runs).toEqual([{ id: 'run-1', taskId: 'TASK-001', outcome: 'pass' }])
            expect(snapshot.recommendations).toEqual([{ taskId: 'TASK-001', score: 0.9, rationale: 'ready' }])
            expect(snapshot.dependencyGraph).toEqual({
                nodes: [{ id: 'TASK-001' }],
                edges: [{ from: 'TASK-001', to: 'TASK-002' }],
            })
            expect(snapshot.runDurations).toEqual({ 'run-1': 42 })
            expect(snapshot.unmatchedSummary).toEqual({ 'no-matching-task-id': 1 })
        } finally {
            fs.rmSync(tempRoot, { recursive: true, force: true })
        }
    })
})
