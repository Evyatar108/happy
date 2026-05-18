import type { RefObject } from 'react'

import { useCopiedFeedback } from '../hooks/useCopiedFeedback'
import type { ShowToast } from '../hooks/useToast'
import { copyTextWithToast } from '../utils/copyFeedback'
import type { ActiveFilters, FilterAxis } from '../utils/filters'

const FILTER_GROUPS: Array<{ axis: FilterAxis; title: string; chips: Array<{ value: string; label: string }> }> = [
    { axis: 'status', title: 'Status', chips: [
        { value: 'ready', label: '⬜ ready' },
        { value: 'inprogress', label: '🟡 in progress' },
        { value: 'blocked', label: '🔒 blocked' },
        { value: 'paused', label: '⏸ paused' },
        { value: 'closed', label: '🚫 closed' },
    ] },
    { axis: 'workstream', title: 'Workstream', chips: [
        { value: 'perf', label: 'Performance' },
        { value: 'codex-spec', label: 'Codex spec' },
        { value: 'codex-parity', label: 'Codex parity' },
        { value: 'polish', label: 'Polish & fixes' },
        { value: 'cleanup', label: 'Cleanup' },
        { value: 'upstream', label: '🔄 Upstream sync' },
        { value: 'agent-arch', label: 'Agent architecture' },
        { value: 'tooling', label: '🛠 Tooling' },
    ] },
    { axis: 'cadence', title: 'Cadence', chips: [{ value: 'periodic', label: '🔄 Periodic only' }] },
    { axis: 'size', title: 'Size', chips: [
        { value: 'quick', label: 'Quick (<1h)' },
        { value: 'small', label: 'Small (1–4h)' },
        { value: 'medium', label: 'Medium (½–1d)' },
        { value: 'large', label: 'Large (1d+)' },
    ] },
    { axis: 'scope', title: 'Scope', chips: [
        { value: 'codexu', label: '🟦 codexu' },
        { value: 'codex', label: '🦀 codex' },
        { value: 'bookkeeping', label: '📋 bookkeeping' },
    ] },
]

export function SearchInput({ query, searchRef, setQuery }: { query: string; searchRef: RefObject<HTMLInputElement | null>; setQuery: (query: string) => void }) {
    return (
        <input
            ref={searchRef}
            type="search"
            id="search"
            placeholder="Search tasks…  (press / to focus, esc to clear)"
            aria-label="Filter tasks by name/description"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
                if (event.key === 'Escape') {
                    setQuery('')
                    event.currentTarget.blur()
                }
            }}
        />
    )
}

export function FilterChips({ activeFilters, onToggle }: { activeFilters: ActiveFilters; onToggle: (axis: FilterAxis, value: string) => void }) {
    return (
        <details className="toolbar-filters">
            <summary>Filter</summary>
            <div className="filter-popover">
                {FILTER_GROUPS.map((group) => (
                    <div key={group.axis} className="filter-group">
                        <h4>{group.title}</h4>
                        <div className="filter-chips" data-filter-axis={group.axis} aria-label={`Filter by ${group.axis}`}>
                            {group.chips.map((chip) => (
                                <button key={chip.value} className={`filter-chip ${activeFilters[group.axis].has(chip.value) ? 'active' : ''}`} data-filter-value={chip.value} type="button" onClick={() => onToggle(group.axis, chip.value)}>
                                    {chip.label}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </details>
    )
}

export function BulkCopyButton({ copyText, selectedCount, showToast }: { copyText: string; selectedCount: number; showToast?: ShowToast }) {
    const [copied, markCopied] = useCopiedFeedback()
    return (
        <button
            id="bulk-copy"
            className={`bulk-btn ${copied ? 'copied' : ''}`.trim()}
            type="button"
            disabled={selectedCount === 0}
            onClick={async () => {
                if (await copyTextWithToast({ label: `${selectedCount} selected`, text: copyText, showToast })) markCopied()
            }}
        >
            Copy {selectedCount} selected
        </button>
    )
}

export function Toolbar(props: { activeFilters: ActiveFilters; copyText: string; query: string; searchRef: RefObject<HTMLInputElement | null>; selectedCount: number; setQuery: (query: string) => void; showToast?: ShowToast; toggleFilter: (axis: FilterAxis, value: string) => void }) {
    return (
        <div className="toolbar" id="toolbar" role="search">
            <SearchInput query={props.query} searchRef={props.searchRef} setQuery={props.setQuery} />
            <FilterChips activeFilters={props.activeFilters} onToggle={props.toggleFilter} />
            <BulkCopyButton copyText={props.copyText} selectedCount={props.selectedCount} showToast={props.showToast} />
            <span className="kbd-hint" title="Press ? for keyboard shortcuts">?</span>
        </div>
    )
}
