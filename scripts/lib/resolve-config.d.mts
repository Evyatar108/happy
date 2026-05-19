import type { RalphOverviewConfig } from './default-config.mjs'

export function loadConfig(options: { repoRoot: string; configPath?: string }): Readonly<RalphOverviewConfig>

