import type { MouseEvent, ReactNode } from 'react'

import { parseTaskScope } from '../data/copyPreambles'
import { useTaskClassification } from '../hooks/useTaskClassification'
import type { OverviewData, OverviewTask, OverviewWarning, RunRecord } from '../types'
import { writeClipboard } from '../utils/clipboard'
import { buildCopyCommandText } from '../utils/copyCommand'
import { highlightMatches } from '../utils/searchHighlighting'
import { PHASE_TO_BADGE_TEXT } from '../utils/taskClassification'
import { linkBlockedOnHtml } from '../utils/warnings'
import { RunsLog } from './RunsLog'

const SCOPE_LABELS: Record<string, { text: string; title: string }> = {
    bookkeeping: {
        text: '📋 bookkeeping',
        title: 'Task legitimately edits dashboard/roadmap files — bookkeeping preamble skipped at Copy time.',
    },
    codexu: {
        text: '🟦 codexu',
        title: 'Codexu-side worktree preamble injected at Copy time (.worktrees/<task-id>/ on ralph/<task-id>).',
    },
    codex: {
        text: '🦀 codex',
        title: 'Codex-submodule worktree preamble injected at Copy time (.ralph/jobs/<task-id>/codex-worktree/).',
    },
}

const WORKSTREAM_LABELS: Record<string, string> = {
    perf: 'Performance',
    'codex-spec': 'Codex spec',
    'codex-parity': 'Codex parity',
    polish: 'Polish & fixes',
    cleanup: 'Cleanup',
    upstream: 'Upstream sync',
    'agent-arch': 'Agent architecture',
    tooling: 'Tooling',
}

interface TaskCommandProps {
    task: OverviewTask
    data: OverviewData
    taskIds: string[]
    childrenByParent: Record<string, string[]>
    changed?: boolean
    hidden?: boolean
    open: boolean
    onActivateWorkstream?: (workstream: string) => void
    onOpenChange: (id: string, open: boolean) => void
    onSelectTask?: (id: string, selected: boolean) => void
    query?: string
    selected?: boolean
}

function stopToggle(event: MouseEvent<HTMLElement>) {
    event.stopPropagation()
    event.preventDefault()
}

function escapeHtml(text: string): string {
    return text.replace(/[&<>"]/g, (char) => {
        if (char === '&') return '&amp;'
        if (char === '<') return '&lt;'
        if (char === '>') return '&gt;'
        return '&quot;'
    })
}

export function StatusBadge({ phase }: { phase?: string }) {
    const safePhase = phase || 'unknown'
    return <span className={`cmd-badge b-${safePhase}`}>{PHASE_TO_BADGE_TEXT[safePhase] || safePhase}</span>
}

export function ScopeChip({ scope }: { scope: string }) {
    const def = SCOPE_LABELS[scope]
    if (!def) return null
    return (
        <span className={`task-scope-chip ${scope}`} title={def.title}>
            {def.text}
        </span>
    )
}

export function BulkSelectCheckbox({ disabled, onSelectTask, selected, taskId }: { disabled?: boolean; onSelectTask?: (id: string, selected: boolean) => void; selected?: boolean; taskId: string }) {
    return (
        <input
            type="checkbox"
            className="cmd-select"
            aria-label={`Select ${taskId} for bulk copy`}
            checked={selected ?? false}
            disabled={disabled}
            readOnly={!onSelectTask}
            title={disabled ? 'No command to copy (closed / placeholder)' : undefined}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onSelectTask?.(taskId, event.currentTarget.checked)}
        />
    )
}

export function CopyNameButton({ taskId }: { taskId: string }) {
    return (
        <button
            type="button"
            className="copy-name-btn"
            title={`Copy task name "${taskId}" to clipboard`}
            data-copy-text={taskId}
            onClick={(event) => {
                stopToggle(event)
                void writeClipboard(taskId)
            }}
        >
            Copy Name
        </button>
    )
}

export function CopyCommandButton({ task }: { task: OverviewTask }) {
    const raw = task.command?.planPrompt ?? ''
    if (task.command?.planPrompt === null || task.command?.planPrompt === undefined) return null
    return (
        <button
            type="button"
            className="copy-btn"
            onClick={(event) => {
                stopToggle(event)
                void writeClipboard(buildCopyCommandText(raw, task.scope))
            }}
        >
            Copy Command
        </button>
    )
}

function latestRunForTask(runs: RunRecord[] | undefined, taskId: string): RunRecord | undefined {
    return (runs ?? [])
        .filter((run) => run.taskId === taskId && run.ranAt)
        .sort((a, b) => String(b.ranAt).localeCompare(String(a.ranAt)))[0]
}

function periodicTitle(data: OverviewData, taskId: string): string {
    const meta = data.periodic?.[taskId] ?? {}
    const titleParts = ['Periodic task']
    if (meta.intervalDays) titleParts.push(`cadence ~${meta.intervalDays} days`)
    if (meta.nextDueAt) titleParts.push(`next due ${meta.nextDueAt.slice(0, 10)}`)
    const lastRun = latestRunForTask(data.runs, taskId)
    if (lastRun?.ranAt) {
        const daysAgo = Math.round((Date.now() - Date.parse(lastRun.ranAt)) / 864e5)
        titleParts.push(`last run ${daysAgo} d ago`)
    }
    return titleParts.join(' · ')
}

function cadenceChip(data: OverviewData, taskId: string): ReactNode {
    const meta = data.periodic?.[taskId] ?? {}
    const lastRun = latestRunForTask(data.runs, taskId)
    const title = periodicTitle(data, taskId)

    if (!lastRun || !meta.nextDueAt) {
        return (
            <span className="cadence-chip first-run" title={title}>
                first run pending
            </span>
        )
    }

    const daysUntil = Math.round((Date.parse(meta.nextDueAt) - Date.now()) / 864e5)
    if (daysUntil < 0) {
        return (
            <span className="cadence-chip overdue" title={title}>
                overdue {Math.abs(daysUntil)}d
            </span>
        )
    }

    return (
        <span className={`cadence-chip ${daysUntil <= 7 ? 'due-soon' : 'due-far'}`} title={title}>
            due in {daysUntil}d
        </span>
    )
}

export function WorkstreamPill({ task, data, onActivateWorkstream }: { task: OverviewTask; data: OverviewData; onActivateWorkstream?: (workstream: string) => void }) {
    const taskId = task.id
    const workstream = data.workstream?.[taskId]
    if (!workstream) return null

    const cadence = data.cadence?.[taskId] ?? 'one-shot'
    const size = data.sizeBucket?.[taskId]
    const label = WORKSTREAM_LABELS[workstream] || workstream

    return (
        <>
            {cadence === 'periodic' ? (
                <>
                    <span className="cadence-icon" title={periodicTitle(data, taskId)}>
                        🔄
                    </span>
                    {cadenceChip(data, taskId)}
                </>
            ) : null}
            <a
                className="pill-workstream"
                href="#"
                data-workstream={workstream}
                title={`Filter to ${label} workstream${size ? ` (size: ${size})` : ''}`}
                onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    onActivateWorkstream?.(workstream)
                }}
            >
                {label}
            </a>
        </>
    )
}

export function Warning({ warning, taskIds }: { warning: OverviewWarning; taskIds: string[] }) {
    return (
        <div
            className={warning.className || 'cmd-warn'}
            dangerouslySetInnerHTML={{ __html: linkBlockedOnHtml(warning.html, taskIds) }}
        />
    )
}

export function SpawnedFromPill({ parentId }: { parentId?: string }) {
    if (!parentId || parentId.startsWith('_')) return null
    return (
        <a className="pill-spawned-from" href={`#cmd-${parentId}`} title={`Spawned from ${parentId} (click to jump)`}>
            <span className="from-arrow">↗</span>from {parentId}
        </a>
    )
}

export function SpawnedChildren({ taskId, childrenByParent }: { taskId: string; childrenByParent: Record<string, string[]> }) {
    const children = childrenByParent[taskId] ?? []
    if (children.length === 0) return null
    return (
        <div className="spawned-children">
            <span className="sc-label">Spawned follow-ups ({children.length})</span>
            {children.map((childId) => (
                <a key={childId} className="sc-chip" href={`#cmd-${childId}`} title={`Jump to ${childId}`}>
                    {childId}
                </a>
            ))}
        </div>
    )
}

export function TaskCommand({ task, data, taskIds, childrenByParent, changed = false, hidden = false, open, onActivateWorkstream, onOpenChange, onSelectTask, query = '', selected = false }: TaskCommandProps) {
    const { orderBucket } = useTaskClassification(task)
    const command = task.command
    const scopes = parseTaskScope(task.scope)
    const workstream = data.workstream?.[task.id]
    const size = data.sizeBucket?.[task.id]
    const cadence = data.cadence?.[task.id] ?? 'one-shot'
    const parentId = data.spawnedFrom?.[task.id]
    const commandNameHtml = highlightMatches(escapeHtml(command?.name || task.id), query)
    const descriptionHtml = highlightMatches(command?.descriptionHtml ?? '', query)

    return (
        <details
            className={`cmd ${hidden ? 'cmd-hidden' : ''} ${changed ? 'cmd-changed' : ''}`.trim()}
            id={`cmd-${task.id}`}
            data-task-id={task.id}
            data-task-scope={task.scope}
            data-task-phase={task.phase}
            data-task-status={task.status}
            data-plan-only={task.planOnly ? 'true' : undefined}
            data-merge-commit={task.mergeCommit}
            data-cmd-status={orderBucket}
            data-workstream={workstream}
            data-size-bucket={size}
            data-cadence={cadence}
            open={open}
            onToggle={(event) => onOpenChange(task.id, event.currentTarget.open)}
        >
            <summary>
                <BulkSelectCheckbox
                    taskId={task.id}
                    selected={selected}
                    disabled={command?.planPrompt === null || command?.planPrompt === undefined}
                    onSelectTask={onSelectTask}
                />
                <span className="cmd-name" dangerouslySetInnerHTML={{ __html: commandNameHtml }} />
                <span className="cmd-scope-cluster">
                    {scopes.length === 0 ? (
                        <span
                            className="task-scope-chip missing"
                            title="This cmd row has no data-task-scope attribute. Declare bookkeeping, codexu, codex, or a `|`-delimited combo so the right copy-time preambles inject."
                        >
                            ⚠ missing scope
                        </span>
                    ) : (
                        ['bookkeeping', 'codexu', 'codex'].map((scope) => (scopes.includes(scope) ? <ScopeChip key={scope} scope={scope} /> : null))
                    )}
                    <StatusBadge phase={task.phase} />
                    {task.status === 'blocked' || task.status === 'paused' ? (
                        <span className={`cmd-status-mod ${task.status}`}>{task.status}</span>
                    ) : null}
                </span>
                <span className="cmd-desc" dangerouslySetInnerHTML={{ __html: descriptionHtml }} />
                <WorkstreamPill task={task} data={data} onActivateWorkstream={onActivateWorkstream} />
                {changed ? <span className="new-badge" title={`Changed since your last visit (${data.lastTouched?.[task.id] ?? task.lastTouchedAt ?? ''})`}>NEW</span> : null}
                <SpawnedFromPill parentId={parentId} />
                <div className="cmd-actions">
                    <CopyCommandButton task={task} />
                    <CopyNameButton taskId={task.id} />
                </div>
            </summary>
            <div className="cmd-body">
                <div className="cmd-body-inner">
                    {(command?.warnings ?? []).map((warning, index) => (
                        <Warning key={index} warning={warning} taskIds={taskIds} />
                    ))}
                    {command?.planPrompt !== null && command?.planPrompt !== undefined ? <pre className="cmd-pre">{command.planPrompt || ''}</pre> : null}
                    <RunsLog runs={(data.runs ?? []).filter((run) => run.taskId === task.id)} />
                    <SpawnedChildren taskId={task.id} childrenByParent={childrenByParent} />
                </div>
            </div>
        </details>
    )
}
