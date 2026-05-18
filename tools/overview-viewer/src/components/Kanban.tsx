import type { CSSProperties, MouseEvent } from 'react'

import type { KanbanColumnName, OverviewData, OverviewTask } from '../types'
import { parseInlineStyle } from '../utils/inlineStyleParser'
import { countKanbanCards, orderedKanbanCardsByColumn, type OrderedKanbanCard } from '../utils/kanbanOrdering'
import { Legend } from './TopLevelSurfaces'

const COLUMN_META: Record<KanbanColumnName, { id: string; title: string; badge: string; badgeClass: string }> = {
    ready: { id: 'kanban-ready', title: 'Ready now', badge: 'assignable', badgeClass: 'b-now' },
    soon: { id: 'kanban-soon', title: 'Unblocked, needs re-read', badge: 'soon', badgeClass: 'b-soon' },
    blocked: { id: 'kanban-blocked', title: 'Blocked / operator-only / upstream', badge: 'blocked', badgeClass: 'b-block' },
}

function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function injectKanbanPhasePill(html: string, task: OverviewTask): string {
    if (!task.phase || html.includes('kanban-phase-pill')) return html

    const phaseText = task.phase.replace(/-/g, ' ')
    const pill = `<span class="cmd-badge b-${escapeHtml(task.phase)} kanban-phase-pill" title="Task phase: ${escapeHtml(phaseText)}">${escapeHtml(phaseText)}</span>`
    return html.replace(/(<div class="card-meta"[^>]*>)/, `$1${pill}`)
}

function linkKanbanToCmds(html: string, taskId: string): string {
    if (html.includes(`href="#cmd-${taskId}"`)) return html

    const link = `<a href="#cmd-${escapeHtml(taskId)}" class="xref-link" title="Jump to ${escapeHtml(taskId)} ralph command">→ command</a>`
    return html.replace(/(<div class="card-title"[^>]*>[\s\S]*?)(<\/div>)/, `$1${link}$2`)
}

function kanbanCardHtml(item: OrderedKanbanCard): string {
    return linkKanbanToCmds(injectKanbanPhasePill(item.card.html, item.task), item.task.id)
}

function shouldNavigateFromClick(event: MouseEvent<HTMLDivElement>, taskId: string): boolean {
    const target = event.target instanceof Element ? event.target : null
    const anchor = target?.closest('a')
    if (!anchor) return true

    const href = anchor.getAttribute('href') ?? ''
    return href === `#cmd-${taskId}`
}

export function KanbanCard({ data, hidden = false, item, onJumpToCommand }: { data: OverviewData; hidden?: boolean; item: OrderedKanbanCard; onJumpToCommand: (taskId: string) => void }) {
    const { task, card } = item
    const workstream = data.workstream?.[task.id]

    return (
        <div
            className={`card${card.cardClass ? ` ${card.cardClass}` : ''}${hidden ? ' card-hidden' : ''}`}
            style={parseInlineStyle(card.inlineStyle) as CSSProperties | undefined}
            data-task-id={task.id}
            data-rendered-task="true"
            data-workstream={workstream}
            onClick={(event) => {
                if (!shouldNavigateFromClick(event, task.id)) return
                event.preventDefault()
                onJumpToCommand(task.id)
            }}
            dangerouslySetInnerHTML={{ __html: kanbanCardHtml(item) }}
        />
    )
}

export function KanbanColumn({ data, column, cards, onJumpToCommand, visibleTaskIds }: { data: OverviewData; column: KanbanColumnName; cards: OrderedKanbanCard[]; onJumpToCommand: (taskId: string) => void; visibleTaskIds?: Set<string> }) {
    const meta = COLUMN_META[column]
    return (
        <div className="col" id={meta.id}>
            <div className="col-head">
                <h3>{meta.title}</h3>
                <span className={`badge ${meta.badgeClass}`}>{meta.badge}</span>
            </div>
            {cards.map((item, index) => (
                <KanbanCard key={`${item.task.id}-${index}`} data={data} item={item} hidden={visibleTaskIds ? !visibleTaskIds.has(item.task.id) : false} onJumpToCommand={onJumpToCommand} />
            ))}
        </div>
    )
}

export function Kanban({ data, onJumpToCommand, visibleTaskIds }: { data: OverviewData; onJumpToCommand: (taskId: string) => void; visibleTaskIds?: Set<string> }) {
    const tasks = data.tasks ?? []
    const columns = orderedKanbanCardsByColumn(tasks)
    const count = countKanbanCards(tasks)

    return (
        <details className="section sec-kanban">
            <summary className="section-head">
                <span className="sec-glyph" aria-hidden="true">
                    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                        <rect x="2" y="3" width="3.5" height="12" />
                        <rect x="7.25" y="3" width="3.5" height="8" />
                        <rect x="12.5" y="3" width="3.5" height="10" />
                    </svg>
                </span>
                Kanban — assignable now <span className="section-counts" id="counts-kanban">({count} cards)</span>
            </summary>
            <Legend />
            <div className="kanban">
                <KanbanColumn data={data} column="ready" cards={columns.ready} onJumpToCommand={onJumpToCommand} visibleTaskIds={visibleTaskIds} />
                <KanbanColumn data={data} column="soon" cards={columns.soon} onJumpToCommand={onJumpToCommand} visibleTaskIds={visibleTaskIds} />
                <KanbanColumn data={data} column="blocked" cards={columns.blocked} onJumpToCommand={onJumpToCommand} visibleTaskIds={visibleTaskIds} />
            </div>
        </details>
    )
}
