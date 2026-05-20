import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'

import { runWorkOnViaCrew } from './work-on-via-crew.mjs'

const fixtureRoots = []

afterEach(() => {
    for (const fixtureRoot of fixtureRoots.splice(0)) {
        fs.rmSync(fixtureRoot, { recursive: true, force: true })
    }
})

describe('work-on via crew flow', () => {
    test('spawns a crew member, polls the manifest, writes the explicit session, and prints confirmation', async () => {
        const { repoRoot, config, mainRepoRoot } = makeFixture()
        const calls = []
        const stdout = { text: '', write(chunk) { this.text += chunk } }
        const execFileSyncImpl = mockDeriveCommand('/implement-with-ralph resume job-a')
        const spawnSyncImpl = (command, args, options) => {
            calls.push({ command, args, cwd: options.cwd })
            if (args[0].endsWith('spawn-member.js')) {
                writeManifest(config.crewsRoot, 'crew-a', 'member-a', {
                    sessionId: 'session-a',
                    transcriptPath: 'C:\\Users\\evmitran\\session-a.jsonl',
                })
            }
            return { status: 0, stdout: '', stderr: '' }
        }

        const result = await runWorkOnViaCrew({
            repoRoot,
            config,
            taskId: 'TASK-123',
            stage: 'implementing',
            crewName: 'crew-a',
            memberName: 'member-a',
            now: fixedNow,
            execFileSyncImpl,
            spawnSyncImpl,
            sleep: async () => {},
            stdout,
        })

        expect(calls[0]).toMatchObject({ cwd: repoRoot })
        expect(calls[0].args).toEqual([
            'D:/ai-developer-toolkit/plugins/crews/tools/spawn-member.js',
            'member-a',
            '--crew',
            'crew-a',
            '--cwd',
            mainRepoRoot,
            '--',
            '/implement-with-ralph resume job-a',
        ])
        expect(calls[1].args.slice(0, 5)).toEqual(['scripts/sync-ralph-state.mjs', '--update-crew-session', 'TASK-123', 'implementing', '--json'])
        expect(JSON.parse(calls[1].args[5])).toEqual({
            crewName: 'crew-a',
            memberName: 'member-a',
            cwd: mainRepoRoot,
            startedAt: '2026-05-20T13:00:00.000Z',
            sessionId: 'session-a',
            transcriptPath: 'C:\\Users\\evmitran\\session-a.jsonl',
        })
        expect(result.sessionId).toBe('session-a')
        expect(stdout.text).toBe('Spawned crew-a/member-a for TASK-123:implementing; session=session-a\n')
    })

    test('fails lock preflight before spawning when a watcher owns the lock', async () => {
        const { repoRoot, config } = makeFixture()
        writeJson(config.lockFile, { pid: process.pid, process: 'vite-plugin', startedAt: '2026-05-20T12:59:59.000Z' })
        const spawnSyncImpl = () => {
            throw new Error('spawn should not be called')
        }

        await expect(
            runWorkOnViaCrew({
                repoRoot,
                config,
                taskId: 'TASK-123',
                stage: 'implementing',
                crewName: 'crew-a',
                memberName: 'member-a',
                now: fixedNow,
                execFileSyncImpl: mockDeriveCommand('/implement-with-ralph resume job-a'),
                spawnSyncImpl,
            }),
        ).rejects.toThrow(`another sync in progress (pid ${process.pid}, process vite-plugin, started 2026-05-20T12:59:59.000Z)`)
    })

    test('continues polling when only one of sessionId or transcriptPath is present', async () => {
        const { repoRoot, config, mainRepoRoot } = makeFixture()
        const calls = []
        let tick = 0
        const spawnSyncImpl = (command, args) => {
            calls.push({ command, args })
            if (args[0]?.endsWith('spawn-member.js')) {
                writeManifest(config.crewsRoot, 'crew-a', 'member-a', { sessionId: 'session-b' })
            }
            return { status: 0, stdout: '', stderr: '' }
        }
        const sleep = async () => {
            tick++
            if (tick === 1) {
                writeManifest(config.crewsRoot, 'crew-a', 'member-a', {
                    sessionId: 'session-b',
                    transcriptPath: 'C:\\Users\\evmitran\\session-b.jsonl',
                })
            }
        }

        const result = await runWorkOnViaCrew({
            repoRoot,
            config,
            taskId: 'TASK-123',
            stage: 'implementing',
            crewName: 'crew-a',
            memberName: 'member-a',
            now: fixedNow,
            execFileSyncImpl: mockDeriveCommand('/implement-with-ralph resume job-a'),
            spawnSyncImpl,
            sleep,
            pollTimeoutMs: 10_000,
            stdout: { write() {} },
        })

        expect(result.sessionId).toBe('session-b')
        expect(JSON.parse(calls[1].args[5])).toMatchObject({
            sessionId: 'session-b',
            transcriptPath: 'C:\\Users\\evmitran\\session-b.jsonl',
        })
    })

    test('writes a partial crew ref when manifest polling times out', async () => {
        const { repoRoot, config, mainRepoRoot } = makeFixture()
        const calls = []
        const spawnSyncImpl = (command, args) => {
            calls.push({ command, args })
            return { status: 0, stdout: '', stderr: '' }
        }

        const result = await runWorkOnViaCrew({
            repoRoot,
            config,
            taskId: 'TASK-123',
            stage: 'implementing',
            crewName: 'crew-a',
            memberName: 'member-a',
            now: fixedNow,
            execFileSyncImpl: mockDeriveCommand('/implement-with-ralph resume job-a'),
            spawnSyncImpl,
            sleep: async () => {},
            pollTimeoutMs: 0,
            stdout: { write() {} },
        })

        expect(calls).toHaveLength(2)
        expect(JSON.parse(calls[1].args[5])).toEqual({
            crewName: 'crew-a',
            memberName: 'member-a',
            cwd: mainRepoRoot,
            startedAt: '2026-05-20T13:00:00.000Z',
        })
        expect(result.sessionId).toBeNull()
    })
})

function makeFixture() {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'work-on-via-crew-'))
    fixtureRoots.push(repoRoot)
    const mainRepoRoot = path.join(repoRoot, 'main')
    const config = {
        crewsRoot: path.join(mainRepoRoot, '.crews'),
        lockFile: path.join(repoRoot, '.ralph', 'overview-sync.lock'),
    }
    fs.mkdirSync(path.join(repoRoot, '.ralph'), { recursive: true })
    fs.mkdirSync(config.crewsRoot, { recursive: true })
    return { repoRoot, config, mainRepoRoot }
}

function writeManifest(crewsRoot, crewName, memberName, manifest) {
    writeJson(path.join(crewsRoot, 'crews', crewName, 'members', memberName, 'manifest.json'), manifest)
}

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(value))
}

function mockDeriveCommand(command) {
    return (_command, args, options) => {
        expect(args).toEqual(['scripts/lib/derive-next-command-cli.mjs', 'TASK-123'])
        expect(options.encoding).toBe('utf8')
        return `${JSON.stringify({ label: 'Resume implementation', command })}\n`
    }
}

function fixedNow() {
    return new Date('2026-05-20T13:00:00.000Z')
}
