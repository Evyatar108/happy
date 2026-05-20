import type { NextCommand, OverviewTask, RalphPipelineState } from '../../tools/overview-viewer/src/types'

export interface DeriveNextCommandOptions {
    repoRoot?: string
}

export function deriveNextCommand(
    state: RalphPipelineState | undefined,
    task: OverviewTask | undefined,
    options?: DeriveNextCommandOptions,
): NextCommand | null
