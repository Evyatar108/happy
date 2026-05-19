import Ajv from 'ajv'
import { describe, expect, test } from 'vitest'

import { SNAPSHOT_SCHEMA } from './emit-snapshot-schema.mjs'

describe('emit-snapshot-schema', () => {
    test('compiles and validates a sample Snapshot instance', () => {
        const ajv = new Ajv()
        const validate = ajv.compile(SNAPSHOT_SCHEMA)

        const snapshot = {
            generatedAt: '2026-05-19T14:30:00.000Z',
            generatedFromCommit: 'abc1234',
            schemaVersion: 1,
            tasks: [
                {
                    id: 'TASK-001',
                    scope: 'pipeline',
                    command: { descriptionHtml: 'Run the command' },
                    ralph: {
                        stage: 'implementing',
                        artifacts: { jobDir: '.ralph/jobs/task-one' },
                        storyCompletion: { total: 2, passed: 1, blocked: 0, remaining: 1 },
                        crewSessions: [{ id: 'future-plan-extension' }],
                    },
                },
            ],
            runs: [{ id: 'run-1', taskId: 'TASK-001', ranAt: '2026-05-19T14:31:00.000Z', outcome: 'pass' }],
            recommendations: [{ taskId: 'TASK-001', score: 0.9, rationale: 'ready' }],
            dependencyGraph: { nodes: [{ id: 'TASK-001' }], edges: [{ from: 'TASK-001', to: 'TASK-002' }] },
            runDurations: { 'run-1': 42 },
            unmatched: [{ kind: 'job', slug: 'orphan-job', reason: 'no-matching-task-id' }],
            unmatchedSummary: { 'no-matching-task-id': 1 },
        }

        expect(SNAPSHOT_SCHEMA.properties.schemaVersion.const).toBe(1)
        expect(SNAPSHOT_SCHEMA.$defs.RalphPipelineState.additionalProperties).toBe(true)
        expect(validate(snapshot), JSON.stringify(validate.errors, null, 2)).toBe(true)
    })
})
