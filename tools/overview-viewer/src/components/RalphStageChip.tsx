import type { ReactNode } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'

import type { OverviewRalphState } from '../types'

export function RalphStageChip({ taskId, ralphState, tooltipExtras }: { taskId: string; ralphState: OverviewRalphState; tooltipExtras?: ReactNode }) {
    const ralph = ralphState.byTaskId[taskId]
    if (!ralph) return null

    const slug = ralph.jobSlug ?? ralph.groupSlug
    const className = [
        'ralph-stage-chip',
        `stage-${ralph.stage}`,
        ralph.matchSource === 'slug-default' ? 'match-slug-default' : '',
    ]
        .filter(Boolean)
        .join(' ')

    return (
        <Tooltip.Provider delayDuration={200} skipDelayDuration={0}>
            <Tooltip.Root>
                <Tooltip.Trigger asChild>
                    <span
                        className={className}
                        tabIndex={0}
                        aria-label={`Ralph stage: ${ralph.stage}`}
                        onClick={(event) => event.stopPropagation()}
                    >
                        {ralph.stage}
                    </span>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                    <Tooltip.Content className="tooltip-content" sideOffset={6}>
                        <div className="ralph-stage-tooltip">
                            <div>{ralph.stage}</div>
                            {slug ? <div>{slug}</div> : null}
                            {ralph.lastUpdatedAt ? <div>{ralph.lastUpdatedAt}</div> : null}
                            {tooltipExtras ? <div>{tooltipExtras}</div> : null}
                        </div>
                    </Tooltip.Content>
                </Tooltip.Portal>
            </Tooltip.Root>
        </Tooltip.Provider>
    )
}
