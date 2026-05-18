import * as Dialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'

import type { OverviewData } from '../types'
import { clearTasksParam } from '../utils/urlFilter'
import { relativeSnapshotAge, shortSha } from '../utils/freshness'
import { lastVisitLabel, type ChangedTask } from '../utils/whatsNew'
import { writeClipboard } from '../utils/clipboard'

export function FreshnessHint({ data }: { data: OverviewData }) {
    return (
        <div className="sub">
            Generated against <code>main</code> HEAD <code id="gen-sha">{shortSha(data.generatedFromCommit)}</code>. <span id="freshness-hint" className="sub">{relativeSnapshotAge(data.generatedAt)}</span>{' '}
            Sources: <code>plans/codexu-roadmap.md</code> (Phases 1-7 + Sprint E), <code>plans/realtime-sync-perf.md</code>, devtunnels-E notepad (F-* findings).
        </div>
    )
}

export function WhatsNewBanner({ changedTasks, lastVisit, markAllSeen }: { changedTasks: ChangedTask[]; lastVisit: string | null; markAllSeen: () => void }) {
    if (!lastVisit || changedTasks.length === 0) return null
    return (
        <div className="whatsnew-banner">
            <span className="wn-label">🆕 {changedTasks.length} task{changedTasks.length === 1 ? '' : 's'} changed since your last visit ({lastVisitLabel(lastVisit)})</span>
            {changedTasks.map((task) => (
                <a key={task.id} href={`#cmd-${task.id}`} className="chip chip-ready">{task.id}</a>
            ))}
            <button className="wn-dismiss" type="button" onClick={markAllSeen}>Mark all seen</button>
        </div>
    )
}

export function UrlFilterBanner({ taskIdFilter }: { taskIdFilter: Set<string> | null }) {
    if (!taskIdFilter) return null
    const ids = Array.from(taskIdFilter)
    return (
        <div id="url-filter-banner" className="url-filter-banner active" role="status" aria-live="polite">
            <span className="ufb-label">URL filter active</span>
            <span className="ufb-summary">Showing {ids.length} pinned task{ids.length === 1 ? '' : 's'}</span>
            <span className="ufb-ids">{ids.join(', ')}</span>
            <button type="button" className="ufb-copy" title="Copy this URL to clipboard" onClick={() => void writeClipboard(window.location.href)}>Copy link</button>
            <button type="button" className="ufb-clear" title="Show all tasks" onClick={() => { window.location.href = clearTasksParam(window.location.href) }}>Clear filter</button>
        </div>
    )
}

export function KeyboardHelp({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Trigger asChild>
                <button className="kbd-hint" type="button" title="Press ? for keyboard shortcuts" aria-label="Keyboard shortcuts">?</button>
            </Dialog.Trigger>
            <Dialog.Portal>
                <Dialog.Overlay className="kbd-backdrop" id="kbd-backdrop" />
                <Dialog.Content className="kbd-help" id="kbd-help" aria-label="Keyboard shortcuts">
                    <Dialog.Title asChild>
                        <h3>Keyboard shortcuts</h3>
                    </Dialog.Title>
                    <Dialog.Description className="sr-only">Keyboard shortcuts for overview navigation</Dialog.Description>
                    <Dialog.Close className="kbd-close" type="button" aria-label="Close keyboard shortcuts" title="Close keyboard shortcuts">x</Dialog.Close>
                    <table>
                        <tbody>
                            <tr><td><kbd>/</kbd></td><td>Focus search</td></tr>
                            <tr><td><kbd>Esc</kbd></td><td>Clear search / close help</td></tr>
                            <tr><td><kbd>e</kbd></td><td>Expand all sections</td></tr>
                            <tr><td><kbd>c</kbd></td><td>Collapse all sections</td></tr>
                            <tr><td><kbd>?</kbd></td><td>Toggle this help</td></tr>
                        </tbody>
                    </table>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    )
}

export function Legend() {
    return (
        <section className="sec-legend">
            <div className="legend">
                <span className="pill area-app">happy-app</span>
                <span className="pill area-server">happy-server</span>
                <span className="pill area-cli">happy-cli</span>
                <span className="pill area-codex">codex / plugin</span>
                <span className="pill area-multi">multi-package</span>
                <span className="pill p-low">low risk</span>
                <span className="pill p-med">medium risk</span>
                <span className="pill p-high">high risk</span>
            </div>
        </section>
    )
}

export function Layout({ children }: { children: ReactNode }) {
    return <main>{children}</main>
}
