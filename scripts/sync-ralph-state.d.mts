import type { RalphOverviewConfig } from './lib/default-config.mjs'

export function main(): Promise<void>

export function parseArgs(argv: string[]): {
    repo?: string
    config?: string
    watch: boolean
    debounceMs?: number
}

export function parseDebounceMs(value: string): number

export function runOneShot(options: { repoRoot: string; config: RalphOverviewConfig }): Promise<void>

export function runWatchMode(options: { repoRoot: string; configPath?: string; debounceMs?: number }): Promise<void>
