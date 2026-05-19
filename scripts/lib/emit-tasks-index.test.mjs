import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'vitest'

import { buildTasksIndex } from './emit-tasks-index.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('buildTasksIndex', () => {
    test('renders the tasks index markdown fixture', () => {
        const snapshot = {
            generatedAt: '2026-05-19T14:00:00.000Z',
            generatedFromCommit: 'abc1234',
            schemaVersion: 1,
            tasks: [
                {
                    id: 'TASK-001',
                    lastTouchedAt: '2026-05-18T09:00:00.000Z',
                    ralph: {
                        stage: 'implementing',
                        artifacts: { jobDir: '.ralph/jobs/task-one' },
                        lastUpdatedAt: '2026-05-18T12:00:00.000Z',
                    },
                },
                {
                    id: 'TASK-002',
                    ralph: {
                        stage: 'shipped',
                        artifacts: { jobDir: '.ralph/jobs/task-two' },
                    },
                },
                { id: 'TASK-003' },
            ],
            runs: [
                {
                    id: 'run-old',
                    taskId: 'TASK-001',
                    ranAt: '2026-05-18T10:00:00.000Z',
                    outcome: 'pass',
                    summary: 'older run',
                },
                {
                    id: 'run-new',
                    taskId: 'TASK-001',
                    ranAt: '2026-05-18T13:00:00.000Z',
                    outcome: 'pass',
                    summary: 'latest verification',
                },
            ],
            recommendations: [],
            dependencyGraph: { nodes: [], edges: [] },
            runDurations: {},
            unmatched: [],
            unmatchedSummary: {},
        }

        const fixturePath = path.join(__dirname, 'fixtures', 'emit-tasks-index.md')

        expect(buildTasksIndex(snapshot)).toBe(fs.readFileSync(fixturePath, 'utf8'))
    })
})
