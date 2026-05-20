import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import Ajv2020 from 'ajv/dist/2020.js'
import { afterEach, describe, expect, test } from 'vitest'

import { loadConfig } from './resolve-config.mjs'

const fixtureRoots = []

afterEach(() => {
    for (const fixtureRoot of fixtureRoots.splice(0)) {
        fs.rmSync(fixtureRoot, { recursive: true, force: true })
    }
})

describe('resolve-config crewsRoot', () => {
    test('schema accepts a top-level crewsRoot value', () => {
        const schemaPath = path.resolve('.ralph', 'overview-config.schema.json')
        const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'))
        const validate = new Ajv2020().compile(schema)

        expect(validate({ crewsRoot: '.crews' }), JSON.stringify(validate.errors, null, 2)).toBe(true)
    })

    test('preserves absolute crewsRoot overrides', () => {
        const repoRoot = makeRepoFixture()
        const crewsRoot = path.join(repoRoot, 'external-crews')
        writeConfig(repoRoot, { crewsRoot })

        expect(loadConfig({ repoRoot }).crewsRoot).toBe(path.normalize(crewsRoot))
    })

    test('resolves relative crewsRoot overrides against the repo root', () => {
        const repoRoot = makeRepoFixture()
        writeConfig(repoRoot, { crewsRoot: 'local-crews' })

        expect(loadConfig({ repoRoot }).crewsRoot).toBe(path.join(repoRoot, 'local-crews'))
    })

    test('resolves the default .crews directory to the main repo root in a linked worktree', () => {
        const mainRoot = makeRepoFixture('resolve-config-main-')
        const worktreeRoot = path.join(os.tmpdir(), `resolve-config-worktree-${Date.now()}-${Math.random().toString(16).slice(2)}`)
        fixtureRoots.push(worktreeRoot)
        initializeGitRepo(mainRoot)
        execFileSync('git', ['-C', mainRoot, 'worktree', 'add', '--detach', worktreeRoot, 'HEAD'], { stdio: 'ignore' })
        ensureRalphSubdirs(worktreeRoot)

        expect(loadConfig({ repoRoot: worktreeRoot }).crewsRoot).toBe(path.join(mainRoot, '.crews'))
    })

    test('resolves relative crewsRoot overrides against the main repo root in a linked worktree', () => {
        const mainRoot = makeRepoFixture('resolve-config-main-')
        const worktreeRoot = path.join(os.tmpdir(), `resolve-config-worktree-${Date.now()}-${Math.random().toString(16).slice(2)}`)
        fixtureRoots.push(worktreeRoot)
        initializeGitRepo(mainRoot)
        execFileSync('git', ['-C', mainRoot, 'worktree', 'add', '--detach', worktreeRoot, 'HEAD'], { stdio: 'ignore' })
        ensureRalphSubdirs(worktreeRoot)
        writeConfig(worktreeRoot, { crewsRoot: 'custom-crews' })

        expect(loadConfig({ repoRoot: worktreeRoot }).crewsRoot).toBe(path.join(mainRoot, 'custom-crews'))
    })
})

function makeRepoFixture(prefix = 'resolve-config-test-') {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
    fixtureRoots.push(repoRoot)
    ensureRalphSubdirs(repoRoot)
    return repoRoot
}

function ensureRalphSubdirs(repoRoot) {
    for (const dir of ['.ralph/jobs', '.ralph/job-groups', '.ralph/brainstorms']) {
        fs.mkdirSync(path.join(repoRoot, dir), { recursive: true })
    }
}

function writeConfig(repoRoot, config) {
    const configPath = path.join(repoRoot, '.ralph', 'overview-config.json')
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    fs.writeFileSync(configPath, JSON.stringify(config))
}

function initializeGitRepo(repoRoot) {
    execFileSync('git', ['-C', repoRoot, 'init'], { stdio: 'ignore' })
    execFileSync('git', ['-C', repoRoot, 'config', 'user.email', 'test@example.com'], { stdio: 'ignore' })
    execFileSync('git', ['-C', repoRoot, 'config', 'user.name', 'Test User'], { stdio: 'ignore' })
    fs.writeFileSync(path.join(repoRoot, 'README.md'), 'fixture\n')
    execFileSync('git', ['-C', repoRoot, 'add', 'README.md'], { stdio: 'ignore' })
    execFileSync('git', ['-C', repoRoot, 'commit', '-m', 'init'], { stdio: 'ignore' })
}
