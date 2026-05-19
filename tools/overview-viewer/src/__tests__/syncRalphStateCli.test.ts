import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { parseArgs } from '../../../../scripts/sync-ralph-state.mjs'

const fixtureRoots: string[] = []
const repoRoot = path.resolve(fileURLToPath(new URL('../../../../', import.meta.url)))
const scriptPath = path.join(repoRoot, 'scripts/sync-ralph-state.mjs')

afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('../../../../scripts/lib/watch-ralph-state.mjs')
    vi.resetModules()
    for (const fixtureRoot of fixtureRoots.splice(0)) {
        rmSync(fixtureRoot, { recursive: true, force: true })
    }
})

describe('sync-ralph-state CLI', () => {
    it('fails one-shot sync before writing sidecars when another fresh lock exists', () => {
        const fixture = makeRepoFixture({ tasks: ['task'] })
        writeLock(path.join(fixture, '.ralph/overview-sync.lock'), {
            pid: process.pid,
            process: 'standalone',
            startedAt: '2026-05-19T09:59:59.000Z',
        })

        const result = runCliExpectFailure(['--repo', fixture])

        expect(result.status).not.toBe(0)
        expect(result.stderr).toContain(
            `sync-ralph-state: another sync in progress (pid ${process.pid}, process standalone, started 2026-05-19T09:59:59.000Z)`,
        )
        expect(existsSync(path.join(fixture, 'plans/overview-ralph-state.json'))).toBe(false)
        expect(existsSync(path.join(fixture, 'plans/overview-ralph-state.js'))).toBe(false)
    })

    it('parses watch mode and clamps debounce values to the supported range', () => {
        expect(parseArgs(['--watch', '--debounce-ms', '1'])).toMatchObject({ watch: true, debounceMs: 500 })
        expect(parseArgs(['--watch', '--debounce-ms', '45000'])).toMatchObject({ watch: true, debounceMs: 30_000 })
        expect(parseArgs(['--watch', '--debounce-ms', '2000'])).toMatchObject({ watch: true, debounceMs: 2_000 })
        expect(() => parseArgs(['--watch', '--debounce-ms', 'nope'])).toThrow('--debounce-ms must be a number: nope')
    })

    it('rejects invalid debounce input from the command line with a clear error', () => {
        const result = runCliExpectFailure(['--watch', '--debounce-ms', 'nope'])

        expect(result.status).not.toBe(0)
        expect(result.stderr).toContain('sync-ralph-state: --debounce-ms must be a number: nope')
    })

    it('starts watch mode as standalone and stops cleanly on SIGINT', async () => {
        const stop = vi.fn().mockResolvedValue(undefined)
        const start = vi.fn().mockResolvedValue({ stop, status: {} })
        const signalHandlers = new Map<string, (...args: unknown[]) => void>()
        vi.doMock('../../../../scripts/lib/watch-ralph-state.mjs', () => ({ start }))
        vi.spyOn(process.stdin, 'resume').mockImplementation(() => process.stdin)
        vi.spyOn(process, 'once').mockImplementation((eventName, handler) => {
            signalHandlers.set(String(eventName), handler as (...args: unknown[]) => void)
            return process
        })
        const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
        const { runWatchMode } = await import('../../../../scripts/sync-ralph-state.mjs')

        await runWatchMode({ repoRoot: 'repo', configPath: 'config.json', debounceMs: 500 })
        signalHandlers.get('SIGINT')?.()
        await flushPromises()

        expect(start).toHaveBeenCalledWith({ repoRoot: 'repo', configPath: 'config.json', debounceMs: 500, processLabel: 'standalone' })
        expect(process.stdin.resume).toHaveBeenCalledTimes(1)
        expect(stop).toHaveBeenCalledTimes(1)
        expect(exit).toHaveBeenCalledWith(0)
    })
})

function makeRepoFixture({ tasks }: { tasks: string[] }): string {
    const fixture = mkdtempSync(path.join(tmpdir(), 'codexu-sync-cli-'))
    fixtureRoots.push(fixture)
    for (const dir of ['plans', '.ralph/jobs', '.ralph/job-groups', '.ralph/brainstorms']) {
        mkdirSync(path.join(fixture, dir), { recursive: true })
    }
    writeFileSync(
        path.join(fixture, 'plans/overview-data.js'),
        `window.OVERVIEW_DATA = ${JSON.stringify({ tasks: tasks.map((id) => ({ id })) }, null, 2)};\n`,
    )
    return fixture
}

function writeLock(lockPath: string, metadata: unknown): void {
    mkdirSync(path.dirname(lockPath), { recursive: true })
    writeFileSync(lockPath, `${JSON.stringify(metadata)}\n`)
}

function runCliExpectFailure(args: string[]): { status: number | null; stderr: string; stdout: string } {
    try {
        const stdout = execFileSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
        return { status: 0, stderr: '', stdout }
    } catch (error) {
        const failure = error as { status?: number; stderr?: unknown; stdout?: unknown }
        return {
            status: typeof failure.status === 'number' ? failure.status : null,
            stderr: String(failure.stderr ?? ''),
            stdout: String(failure.stdout ?? ''),
        }
    }
}

async function flushPromises(): Promise<void> {
    await Promise.resolve()
    await Promise.resolve()
}
