#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { deriveNextCommand } from './derive-next-command.mjs'

main()

function main() {
    const args = parseArgs(process.argv.slice(2))
    if (!args.task) {
        fail('missing required --task <id>')
    }

    const repoRoot = resolveRepoRoot()
    const snapshotPath = args.snapshot ? path.resolve(process.cwd(), args.snapshot) : path.join(repoRoot, 'plans', 'overview-snapshot.json')
    const snapshot = readJson(snapshotPath)
    const tasks = Array.isArray(snapshot.tasks) ? snapshot.tasks : []
    const task = tasks.find((candidate) => typeof candidate?.id === 'string' && candidate.id.toLowerCase() === args.task.toLowerCase())

    if (!task) {
        fail(`no task '${args.task}' found in ${snapshotPath}`)
    }

    const command = deriveNextCommand(task.ralph, task, { repoRoot })
    process.stdout.write(`${JSON.stringify(command)}\n`)
}

function parseArgs(argv) {
    const parsed = { task: null, snapshot: null }
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index]
        if (arg === '--task') {
            parsed.task = readFlagValue(argv, index, '--task')
            index += 1
            continue
        }
        if (arg === '--snapshot') {
            parsed.snapshot = readFlagValue(argv, index, '--snapshot')
            index += 1
            continue
        }
        fail(`unknown argument: ${arg}`)
    }
    return parsed
}

function readFlagValue(argv, index, flag) {
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
        fail(`missing value for ${flag}`)
    }
    return value
}

function resolveRepoRoot() {
    try {
        return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim().replace(/\\/g, '/')
    } catch (error) {
        fail(`could not resolve repo root with git rev-parse --show-toplevel: ${error.message}`)
    }
}

function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch (error) {
        fail(`could not read snapshot ${filePath}: ${error.message}`)
    }
}

function fail(message) {
    process.stderr.write(`${message}\n`)
    process.exit(1)
}
