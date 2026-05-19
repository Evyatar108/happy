import { execFileSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

import { loadConfig } from './lib/resolve-config.mjs'
import { walkRalphState, writeSidecar } from './lib/sync-core.mjs'

const HEAD_WARNING = 'sync-ralph-state: could not resolve HEAD short SHA, using unknown'

async function main() {
    try {
        const args = parseArgs(process.argv.slice(2))
        const repoRoot = args.repo ? path.resolve(args.repo) : resolveRepoRoot()
        const generatedFromCommit = resolveHeadShortSha(repoRoot)
        const config = loadConfig({ repoRoot, configPath: args.config })
        const state = await walkRalphState({ repoRoot, config, generatedFromCommit })

        for (const entry of state.unmatched ?? []) {
            console.error(`sync-ralph-state: unmatched ${entry.kind}/${entry.slug}: ${entry.reason}`)
        }

        await writeSidecar({ repoRoot, config, state })
    } catch (error) {
        console.error(`sync-ralph-state: ${error?.message ?? error}`)
        process.exitCode = 1
    }
}

function parseArgs(argv) {
    const parsed = {}
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index]
        if (arg === '--repo' || arg === '--config') {
            const value = argv[index + 1]
            if (!value || value.startsWith('--')) {
                throw new Error(`${arg} requires a value`)
            }
            parsed[arg.slice(2)] = value
            index += 1
            continue
        }
        throw new Error(`unknown argument: ${arg}`)
    }
    return parsed
}

function resolveRepoRoot() {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
}

function resolveHeadShortSha(repoRoot) {
    try {
        return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
            cwd: repoRoot,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim()
    } catch {
        console.error(HEAD_WARNING)
        return 'unknown'
    }
}

await main()
