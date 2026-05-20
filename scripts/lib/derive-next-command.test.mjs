import { describe, expect, test } from 'vitest'

import { deriveNextCommand } from './derive-next-command.mjs'

describe('deriveNextCommand', () => {
    test.each([
        {
            stage: 'brainstorming',
            state: { stage: 'brainstorming', artifacts: { brainstormDir: '.ralph/brainstorms/login-flow' } },
            expected: { label: 'Resume brainstorm', command: '/brainstorm-with-ralph login-flow', icon: '💡' },
        },
        {
            stage: 'brainstorm-ready',
            state: { stage: 'brainstorm-ready', artifacts: { brainstormDir: '.ralph/brainstorms/login-flow' } },
            expected: {
                label: 'Plan from brainstorm',
                command: '/plan-with-ralph --from-brainstorm .ralph/brainstorms/login-flow',
                icon: '📋',
            },
        },
        {
            stage: 'planning',
            state: { stage: 'planning', artifacts: { planDraftFile: '.ralph/jobs/login-flow/plan-draft.md' } },
            expected: {
                label: 'Continue planning',
                command: '/plan-with-ralph --improve .ralph/jobs/login-flow/plan-draft.md',
                icon: '📝',
            },
        },
        {
            stage: 'plan-ready',
            state: { stage: 'plan-ready', artifacts: { jobDir: '.ralph/jobs/login-flow' } },
            expected: {
                label: 'Start implementation',
                command: '/implement-with-ralph --from-plan .ralph/jobs/login-flow/plan.md',
                icon: '🚀',
            },
        },
        {
            stage: 'implementing',
            state: { stage: 'implementing', jobSlug: 'login-flow' },
            expected: { label: 'Resume implementation', command: '/implement-with-ralph resume login-flow', icon: '⚙️' },
        },
        {
            stage: 'reviewing',
            state: { stage: 'reviewing', jobSlug: 'login-flow' },
            expected: { label: 'Continue review', command: '/implement-with-ralph resume login-flow', icon: '🔍' },
        },
        {
            stage: 'review-fix',
            state: { stage: 'review-fix', jobSlug: 'login-flow' },
            expected: { label: 'Continue review', command: '/implement-with-ralph resume login-flow', icon: '🔍' },
        },
        {
            stage: 'replan-pending',
            state: { stage: 'replan-pending', artifacts: { jobDir: '.ralph/jobs/login-flow' } },
            expected: { label: 'Replan next cycle', command: '/plan-with-ralph --improve .ralph/jobs/login-flow/plan.md', icon: '🔄' },
        },
        {
            stage: 'blocked',
            state: { stage: 'blocked', jobSlug: 'login-flow' },
            expected: { label: 'Retry after fix', command: '/implement-with-ralph resume login-flow', icon: '🛠' },
        },
    ])('derives the $stage command', ({ state, expected }) => {
        expect(deriveNextCommand(state, { id: 'TASK-001' })).toEqual(expected)
    })

    test('returns null for shipped tasks', () => {
        expect(deriveNextCommand({ stage: 'shipped', jobSlug: 'login-flow' }, { id: 'TASK-001' })).toBeNull()
    })

    test('uses planFile before planDraftFile before jobDir fallback', () => {
        expect(
            deriveNextCommand(
                {
                    stage: 'planning',
                    artifacts: {
                        planFile: '.ralph/jobs/login-flow/plan.md',
                        planDraftFile: '.ralph/jobs/login-flow/plan-draft.md',
                        jobDir: '.ralph/jobs/login-flow',
                    },
                },
                { id: 'TASK-001' },
            )?.command,
        ).toBe('/plan-with-ralph --improve .ralph/jobs/login-flow/plan.md')

        expect(
            deriveNextCommand({ stage: 'planning', artifacts: { jobDir: '.ralph/jobs/login-flow' } }, { id: 'TASK-001' })
                ?.command,
        ).toBe('/plan-with-ralph --improve .ralph/jobs/login-flow/plan.md')
    })

    test('adds parallel decomposition flags for parallel plan-ready tasks', () => {
        expect(
            deriveNextCommand(
                { stage: 'plan-ready', isParallel: true, artifacts: { jobDir: '.ralph/jobs/login-flow' } },
                { id: 'TASK-001' },
            ),
        ).toEqual({
            label: 'Start implementation',
            command:
                '/implement-with-ralph --from-plan .ralph/jobs/login-flow/plan.md --parallel --suggested-decomposition .ralph/jobs/login-flow/suggested-decomposition.json',
            icon: '🚀',
        })
    })

    test('absolutizes parallel group implementation with repoRoot', () => {
        expect(
            deriveNextCommand(
                {
                    stage: 'implementing',
                    isParallel: true,
                    groupSlug: 'login-flow-group',
                    artifacts: { groupDir: '.ralph/jobs/login-flow/groups/login-flow-group' },
                },
                { id: 'TASK-001' },
                { repoRoot: 'D:/harness-efforts/codexu' },
            ),
        ).toEqual({
            label: 'Resume implementation',
            command:
                '/implement-with-ralph --run-only --job D:/harness-efforts/codexu/.ralph/jobs/login-flow/groups/login-flow-group',
            icon: '⚙️',
        })
    })

    test('returns the relative groupDir when repoRoot is omitted', () => {
        expect(
            deriveNextCommand(
                {
                    stage: 'implementing',
                    isParallel: true,
                    groupSlug: 'login-flow-group',
                    artifacts: { groupDir: '.ralph/jobs/login-flow/groups/login-flow-group' },
                },
                { id: 'TASK-001' },
            )?.command,
        ).toBe('/implement-with-ralph --run-only --job .ralph/jobs/login-flow/groups/login-flow-group')
    })

    test('returns null when required artifacts are missing', () => {
        expect(deriveNextCommand({ stage: 'brainstorming', artifacts: {} }, { id: 'TASK-001' })).toBeNull()
        expect(deriveNextCommand({ stage: 'brainstorm-ready', artifacts: {} }, { id: 'TASK-001' })).toBeNull()
        expect(deriveNextCommand({ stage: 'planning', artifacts: {} }, { id: 'TASK-001' })).toBeNull()
        expect(deriveNextCommand({ stage: 'plan-ready', artifacts: {} }, { id: 'TASK-001' })).toBeNull()
        expect(deriveNextCommand({ stage: 'implementing' }, { id: 'TASK-001' })).toBeNull()
        expect(deriveNextCommand({ stage: 'reviewing' }, { id: 'TASK-001' })).toBeNull()
        expect(deriveNextCommand({ stage: 'blocked' }, { id: 'TASK-001' })).toBeNull()
    })
})
