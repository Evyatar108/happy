import { afterEach, describe, expect, test, vi } from 'vitest'

afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('./lib/append-journal.mjs')
    vi.doUnmock('./lib/emit-activity.mjs')
    vi.doUnmock('./lib/path-utils.mjs')
    vi.doUnmock('./lib/sync-core.mjs')
    vi.doUnmock('./lib/sync-lock.mjs')
    vi.resetModules()
})

describe('sync-ralph-state one-shot journal events', () => {
    test('appends one journal entry per stage-changed activity event before releasing the lock', async () => {
        const order = []
        const appendJournalEntry = vi.fn(() => {
            order.push('journal')
        })
        const appendActivity = vi.fn((_repoRoot, event) => {
            order.push(`activity:${event.ts}`)
        })
        const activityEvents = [
            {
                ts: '2026-05-20T11:00:00.000Z',
                slug: 'task-a',
                kind: 'job',
                taskId: 'task-a',
                prevStage: 'planning',
                newStage: 'implementing',
                changedFields: ['stage'],
                reason: 'sync',
            },
            {
                ts: '2026-05-20T11:00:01.000Z',
                slug: 'task-a',
                kind: 'job',
                taskId: 'task-a',
                prevStage: 'implementing',
                newStage: 'implementing',
                changedFields: ['storyCompletion'],
                reason: 'sync',
            },
        ]
        vi.doMock('./lib/append-journal.mjs', () => ({ appendJournalEntry }))
        vi.doMock('./lib/emit-activity.mjs', () => ({ appendActivity }))
        vi.doMock('./lib/path-utils.mjs', () => ({
            resolveHeadShortSha: vi.fn(() => 'abc1234'),
        }))
        vi.doMock('./lib/sync-core.mjs', () => ({
            deriveActivityEvents: vi.fn(() => activityEvents),
            walkRalphState: vi.fn(async () => ({
                generatedAt: '2026-05-20T11:00:00.000Z',
                byTaskId: { 'task-a': { stage: 'implementing' } },
                unmatched: [],
                unmatchedSummary: {},
            })),
            writeSidecar: vi.fn(async () => {}),
        }))
        vi.doMock('./lib/sync-lock.mjs', () => ({
            acquireLock: vi.fn(async () => ({ lockPath: 'lock' })),
            releaseLock: vi.fn(async () => {
                order.push('release')
            }),
        }))
        const { runOneShot } = await import('./sync-ralph-state.mjs')

        await runOneShot({
            repoRoot: '/repo',
            config: {
                lockFile: '/repo/.ralph/overview-sync.lock',
                outputs: {
                    activity: '/repo/plans/overview-activity.jsonl',
                    activityBackup: '/repo/plans/overview-activity.previous.jsonl',
                    activityMaxLines: 1000,
                    sidecarJson: '/repo/plans/overview-ralph-state.json',
                },
            },
        })

        expect(appendActivity).toHaveBeenCalledTimes(2)
        expect(appendJournalEntry).toHaveBeenCalledTimes(1)
        expect(appendJournalEntry).toHaveBeenCalledWith({
            repoRoot: '/repo',
            taskId: 'task-a',
            ts: '2026-05-20T11:00:00.000Z',
            prevStage: 'planning',
            newStage: 'implementing',
            slug: 'task-a',
        })
        expect(order).toEqual(['activity:2026-05-20T11:00:00.000Z', 'journal', 'activity:2026-05-20T11:00:01.000Z', 'release'])
    })
})
