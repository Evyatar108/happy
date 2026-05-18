import type { OverviewData, OverviewTask, RunRecord } from '../types'
import { filterBucketForTask } from '../utils/taskClassification'

interface TodayBuckets {
    brainstorm: string[]
    ready: string[]
    inprogress: string[]
    paused: string[]
    blocked: string[]
    closed: string[]
}

function buildTodayBuckets(tasks: OverviewTask[]): TodayBuckets {
    const buckets: TodayBuckets = { brainstorm: [], ready: [], inprogress: [], paused: [], blocked: [], closed: [] }
    tasks.forEach((task) => {
        const bucket = filterBucketForTask(task)
        if (bucket in buckets) buckets[bucket as keyof TodayBuckets].push(task.id)
    })
    return buckets
}

function recentRuns(runs: RunRecord[] | undefined, nowMs: number): RunRecord[] {
    const weekAgo = nowMs - 7 * 864e5
    return (runs ?? [])
        .filter((run) => run.ranAt && Date.parse(run.ranAt) >= weekAgo)
        .sort((a, b) => Date.parse(b.ranAt ?? '') - Date.parse(a.ranAt ?? ''))
}

function TodayChips({ names, chipClass }: { names: string[]; chipClass?: string }) {
    if (names.length === 0) return <span className="today-empty">—</span>
    return names.map((name) => (
        <a key={name} href={`#cmd-${name}`} className={`chip ${chipClass ?? ''}`} title={chipClass === 'chip-inprogress' ? `In progress — ${name}` : `Jump to ${name}`}>
            {name}
        </a>
    ))
}

export function TodayPanel({ data, nowMs = Date.now() }: { data: OverviewData; nowMs?: number }) {
    const tasks = data.tasks ?? []
    const buckets = buildTodayBuckets(tasks)
    const readyEffort = buckets.ready.reduce((total, taskId) => total + (typeof data.effort?.[taskId] === 'number' ? data.effort[taskId] : 0), 0)
    const capacity = readyEffort > 0 ? (readyEffort < 10 ? `≈ ${readyEffort.toFixed(1).replace(/\.0$/, '')} h ready` : `≈ ${Math.round(readyEffort)} h ready (~${Math.round(readyEffort / 8)} d)`) : ''
    const recent = recentRuns(data.runs, nowMs)

    return (
        <div id="today-panel" className="today-panel" aria-label="Today — running / ready / on hold">
            <span className="today-label">🟡 Running</span>
            <span className="today-chips" id="today-running"><TodayChips names={buckets.inprogress} chipClass="chip-inprogress" /></span>
            <span className="today-label">⬜ Ready</span>
            <span className="today-chips" id="today-ready"><TodayChips names={[...buckets.brainstorm, ...buckets.ready]} chipClass="chip-ready" /></span>
            <span className="today-label">🔒 On hold</span>
            <span className="today-chips" id="today-hold"><TodayChips names={[...buckets.paused, ...buckets.blocked]} /></span>
            <div className="today-footer" id="today-footer">
                {[capacity, `${buckets.closed.length} closed`].filter(Boolean).join('  ·  ')}
                {recent.length > 0 ? (
                    <div className="recently-shipped-line">
                        <span className="label">✅ Recently shipped (7d):</span>
                        {recent.map((run) => {
                            const daysAgo = Math.round((nowMs - Date.parse(run.ranAt ?? '')) / 864e5)
                            return (
                                <a key={run.id ?? `${run.taskId}-${run.ranAt}`} className="chip-shipped" href={`#cmd-${run.taskId}`} title={run.summary ? `${daysAgo} d ago · ${run.commits?.[0] ? `${run.commits[0]} · ` : ''}${run.summary}` : `${daysAgo} d ago`}>
                                    {run.taskId}
                                </a>
                            )
                        })}
                    </div>
                ) : null}
            </div>
        </div>
    )
}
