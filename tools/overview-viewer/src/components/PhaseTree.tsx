import type { OverviewData, OverviewTask, PhaseTreeEntry, PhaseTreeNodeData } from '../types'

function tasksById(tasks: OverviewTask[] | undefined): Map<string, OverviewTask> {
    return new Map((tasks ?? []).filter((task) => task.id).map((task) => [task.id, task]))
}

export function derivePhaseTreeStateClass(task: OverviewTask): string {
    if (task.phase === 'shipped') return 'donefade'
    if (task.phase === 'closed') return 'closed'
    if (task.status === 'blocked' || task.status === 'paused') return 'deferred'
    return 'open'
}

export function PhaseTreeNode({ node, taskById }: { node: PhaseTreeNodeData; taskById: Map<string, OverviewTask> }) {
    if (node.kind === 'sub-phase') {
        return <PhaseTreeBlock phase={node} taskById={taskById} />
    }

    if (node.kind === 'raw') {
        return <li dangerouslySetInnerHTML={{ __html: node.html ?? '' }} />
    }

    const task = node.taskId ? taskById.get(node.taskId) : undefined
    if (!task) return null

    return (
        <li>
            <span className={`item-name ${derivePhaseTreeStateClass(task)}`}>{node.visibleText || task.id}</span>
            {node.trailingHtml ? <span dangerouslySetInnerHTML={{ __html: node.trailingHtml }} /> : null}
        </li>
    )
}

export function PhaseTreeBlock({ phase, taskById }: { phase: PhaseTreeEntry; taskById: Map<string, OverviewTask> }) {
    const body = (
        <ul>
            {(phase.nodes ?? []).map((node, index) => (
                <PhaseTreeNode key={`${node.kind}-${index}`} node={node} taskById={taskById} />
            ))}
        </ul>
    )

    return (
        <div className="phase" data-phase-id={phase.id}>
            <div className="phase-head" dangerouslySetInnerHTML={phase.headerHtml ? { __html: phase.headerHtml } : undefined}>
                {phase.headerHtml ? null : phase.title || ''}
            </div>
            {phase.collapsible ? (
                <details className="phase-subdetails">
                    <summary>{phase.collapsibleSummary || ''}</summary>
                    {body}
                </details>
            ) : (
                body
            )}
        </div>
    )
}

export function PhaseTree({ data }: { data: OverviewData }) {
    const taskById = tasksById(data.tasks)
    const phases = data.phaseTree ?? []

    return (
        <details className="section sec-roadmap">
            <summary className="section-head">
                <span className="sec-glyph" aria-hidden="true">
                    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                        <line x1="2" y1="9" x2="16" y2="9" />
                        <circle cx="4.5" cy="9" r="1.8" fill="currentColor" />
                        <circle cx="9" cy="9" r="1.8" fill="currentColor" />
                        <circle cx="13.5" cy="9" r="1.8" fill="currentColor" />
                    </svg>
                </span>
                Codex specialization roadmap — phase-by-phase status
            </summary>
            <div className="sub" style={{ marginBottom: 12 }}>
                Compact view of <code>plans/codexu-roadmap.md</code> Phases 1-7. Strike-through = done.
            </div>
            <div id="phase-tree">
                <div className="phase-grid">
                    {phases.map((phase, index) => (
                        <PhaseTreeBlock key={phase.id ?? index} phase={phase} taskById={taskById} />
                    ))}
                </div>
            </div>
        </details>
    )
}
