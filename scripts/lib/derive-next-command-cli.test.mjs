import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'vitest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const cliPath = path.join(__dirname, 'derive-next-command-cli.mjs')
const fixturePath = path.join(__dirname, 'fixtures', 'derive-next-command-snapshot.json')

describe('derive-next-command-cli', () => {
    test('returns the expected command for a task in a fixture snapshot', () => {
        const result = runCli(['--task', 'TASK-CLI', '--snapshot', fixturePath])

        expect(result.status).toBe(0)
        expect(result.stderr).toBe('')
        expect(JSON.parse(result.stdout)).toEqual({
            label: 'Resume implementation',
            command: '/implement-with-ralph resume fixture-cli-job',
            icon: '⚙️',
        })
    })

    test('uses --snapshot to read a custom snapshot file', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'derive-next-command-cli-test-'))
        const snapshotPath = path.join(tempDir, 'custom-snapshot.json')
        fs.writeFileSync(
            snapshotPath,
            JSON.stringify({
                tasks: [
                    {
                        id: 'CUSTOM-TASK',
                        ralph: {
                            stage: 'plan-ready',
                            artifacts: { jobDir: '.ralph/jobs/custom-task' },
                        },
                    },
                ],
            }),
        )

        try {
            const result = runCli(['--task', 'CUSTOM-TASK', '--snapshot', snapshotPath])

            expect(result.status).toBe(0)
            expect(JSON.parse(result.stdout)).toEqual({
                label: 'Start implementation',
                command: '/implement-with-ralph --from-plan .ralph/jobs/custom-task/plan.md',
                icon: '🚀',
            })
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true })
        }
    })

    test('passes repoRoot to the predicate for parallel group commands', () => {
        const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim().replace(/\\/g, '/')
        const result = runCli(['--task', 'TASK-PARALLEL', '--snapshot', fixturePath])

        expect(result.status).toBe(0)
        expect(JSON.parse(result.stdout)).toEqual({
            label: 'Resume implementation',
            command: `/implement-with-ralph --run-only --job ${repoRoot}/.ralph/jobs/fixture-cli-job/groups/fixture-group`,
            icon: '⚙️',
        })
    })

    test('exits non-zero and names the missing task id', () => {
        const result = runCli(['--task', 'MISSING-TASK', '--snapshot', fixturePath])

        expect(result.status).not.toBe(0)
        expect(result.stderr).toContain("MISSING-TASK")
    })
})

function runCli(args) {
    return spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8' })
}
