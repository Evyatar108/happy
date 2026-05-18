import type { RunRecord } from '../types'

export function RunsLog({ runs }: { runs: RunRecord[] }) {
    if (runs.length === 0) return null
    const sorted = [...runs].sort((a, b) => Date.parse(b.ranAt ?? '') - Date.parse(a.ranAt ?? ''))
    return (
        <div className="run-history">
            <div className="run-history-label">Run history — {runs.length} {runs.length === 1 ? 'run' : 'runs'}</div>
            {sorted.map((run, index) => (
                <div key={run.id ?? `${run.taskId}-${run.ranAt}-${index}`} className={`run-entry outcome-${run.outcome || 'completed'}`}>
                    <span className="run-date">{(run.ranAt || '').slice(0, 10)}</span>
                    <span className="run-sha">{run.commits?.[0] ?? run.outcome ?? '—'}</span>
                    <span className="run-summary">{run.summary || ''}</span>
                </div>
            ))}
        </div>
    )
}
