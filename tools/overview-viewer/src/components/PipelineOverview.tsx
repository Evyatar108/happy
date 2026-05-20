import type { Dispatch, SetStateAction } from 'react'

import type { OverviewRalphState, RalphStage } from '../types'
import { cloneFilters, type ActiveFilters } from '../utils/filters'
import { RALPH_STAGE_ORDER } from '../utils/ralphStages'

export function PipelineOverview({
    filters,
    ralphState,
    setFilters,
}: {
    ralphState: OverviewRalphState
    filters: ActiveFilters
    setFilters: Dispatch<SetStateAction<ActiveFilters>>
}) {
    const counts = Object.values(ralphState.byTaskId).reduce<Record<RalphStage, number>>(
        (acc, entry) => {
            acc[entry.stage] += 1
            return acc
        },
        Object.fromEntries(RALPH_STAGE_ORDER.map((stage) => [stage, 0])) as Record<RalphStage, number>,
    )

    if (Object.keys(ralphState.byTaskId).length === 0) {
        return (
            <section className="pipeline-overview" aria-label="Ralph pipeline overview">
                <div className="pipeline-overview-empty">
                    No Ralph state tracked yet — run <code>pnpm sync-ralph-state</code> or check unmatched in stderr
                </div>
            </section>
        )
    }

    return (
        <section className="pipeline-overview" aria-label="Ralph pipeline overview">
            {RALPH_STAGE_ORDER.map((stage) => {
                const active = filters.ralphStage.has(stage)
                return (
                    <button
                        key={stage}
                        type="button"
                        className={`pipeline-overview-chip ralph-stage-chip stage-${stage} ${active ? 'active' : ''}`.trim()}
                        aria-pressed={active}
                        onClick={() => {
                            setFilters((current) => {
                                const next = cloneFilters(current)
                                next.ralphStage = current.ralphStage.has(stage) ? new Set() : new Set([stage])
                                return next
                            })
                        }}
                    >
                        {stage} · {counts[stage]}
                    </button>
                )
            })}
        </section>
    )
}

