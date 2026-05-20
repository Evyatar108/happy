import { describe, expect, test, vi } from 'vitest'

import { deriveDependencyGraph } from './derive-dependency-graph.mjs'

describe('deriveDependencyGraph', () => {
    test('emits every edge type from dependent to prerequisite', () => {
        const graph = deriveDependencyGraph({
            byTaskId: {
                parent: { stage: 'shipped' },
                child: { stage: 'implementing' },
                blocker: { stage: 'plan-ready' },
                blocked: { stage: 'planning' },
                depends: { stage: 'planning' },
                prerequisite: { stage: 'shipped' },
            },
            overviewData: {
                tasks: [{ id: 'blocker', blocks: ['blocked'] }],
                spawnedFrom: { child: 'parent' },
            },
            prdsByTaskId: {
                depends: { userStories: [], dependencies: ['prerequisite'] },
                storyTask: { userStories: [{ id: 'US-002', dependencies: ['US-001'] }, { id: 'US-001' }] },
            },
        })

        expect(graph.edges).toEqual(
            expect.arrayContaining([
                { from: 'storyTask:US-002', to: 'storyTask:US-001', type: 'depends-on-story' },
                { from: 'child', to: 'parent', type: 'spawn' },
                { from: 'blocked', to: 'blocker', type: 'blocks' },
                { from: 'depends', to: 'prerequisite', type: 'depends-on-task' },
            ]),
        )
        expect(graph.edges.map((edge) => edge.type)).toEqual(['depends-on-story', 'spawn', 'blocks', 'depends-on-task'])
    })

    test('keeps duplicate story ids unique per task and targets the owning task', () => {
        const graph = deriveDependencyGraph({
            byTaskId: { alpha: { stage: 'planning' }, beta: { stage: 'planning' } },
            prdsByTaskId: {
                alpha: { userStories: [{ id: 'US-001' }, { id: 'US-002', dependencies: ['US-001'] }] },
                beta: { userStories: [{ id: 'US-001' }, { id: 'US-002', dependencies: ['US-001'] }] },
            },
        })

        expect(graph.nodes).toEqual(
            expect.arrayContaining([
                { id: 'alpha:US-001', type: 'story', taskId: 'alpha', storyId: 'US-001' },
                { id: 'beta:US-001', type: 'story', taskId: 'beta', storyId: 'US-001' },
            ]),
        )
        expect(graph.edges).toEqual(
            expect.arrayContaining([
                { from: 'alpha:US-002', to: 'alpha:US-001', type: 'depends-on-story' },
                { from: 'beta:US-002', to: 'beta:US-001', type: 'depends-on-story' },
            ]),
        )
    })

    test('preserves already-qualified story dependencies', () => {
        const graph = deriveDependencyGraph({
            prdsByTaskId: {
                alpha: { userStories: [{ id: 'US-003', dependencies: ['beta:US-001'] }] },
                beta: { userStories: [{ id: 'US-001' }] },
            },
        })

        expect(graph.edges).toContainEqual({ from: 'alpha:US-003', to: 'beta:US-001', type: 'depends-on-story' })
    })

    test('de-duplicates identical edges', () => {
        const graph = deriveDependencyGraph({
            overviewData: { tasks: [{ id: 'blocker', blocks: ['blocked', 'blocked'] }] },
            prdsByTaskId: {
                task: { userStories: [{ id: 'US-002', dependencies: ['US-001', 'US-001'] }, { id: 'US-001' }] },
            },
        })

        expect(graph.edges.filter((edge) => edge.from === 'task:US-002' && edge.to === 'task:US-001')).toHaveLength(1)
        expect(graph.edges.filter((edge) => edge.from === 'blocked' && edge.to === 'blocker')).toHaveLength(1)
    })

    test('produces an acyclic representative graph', () => {
        const graph = deriveDependencyGraph({
            byTaskId: { root: { stage: 'shipped' }, child: { stage: 'implementing' }, leaf: { stage: 'planning' } },
            overviewData: {
                tasks: [{ id: 'root', blocks: ['child'] }, { id: 'child', blocks: ['leaf'] }],
                spawnedFrom: { child: 'root', leaf: 'child' },
            },
            prdsByTaskId: {
                child: { userStories: [{ id: 'US-002', dependencies: ['US-001'] }, { id: 'US-001' }] },
            },
        })

        expect(hasCycle(graph)).toBe(false)
    })

    test('returns task nodes only for empty dependency inputs', () => {
        const graph = deriveDependencyGraph({
            byTaskId: { alpha: { stage: 'planning' }, beta: { stage: 'reviewing' } },
            overviewData: { tasks: [{ id: 'alpha' }, { id: 'beta' }] },
            prdsByTaskId: {},
        })

        expect(graph).toEqual({
            nodes: [
                { id: 'alpha', type: 'task', taskId: 'alpha', stage: 'planning' },
                { id: 'beta', type: 'task', taskId: 'beta', stage: 'reviewing' },
            ],
            edges: [],
        })
    })

    test('ignores metadata keys prefixed with _ in spawnedFrom', () => {
        const graph = deriveDependencyGraph({
            overviewData: {
                spawnedFrom: {
                    _comment: 'Map of childTaskId -> parentTaskId. Populated when a research task lands.',
                    child: 'parent',
                },
            },
        })

        const nodeIds = graph.nodes.map((n) => n.id)
        expect(nodeIds).not.toContain('_comment')
        expect(nodeIds).not.toContain('Map of childTaskId -> parentTaskId. Populated when a research task lands.')
        expect(graph.edges.every((e) => e.from !== '_comment' && e.to !== '_comment')).toBe(true)
        expect(graph.edges).toContainEqual({ from: 'child', to: 'parent', type: 'spawn' })
    })

    test('stays side-effect free', () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
        const graph = deriveDependencyGraph({ generatedFromCommit: 'abc123' })

        expect(graph).toEqual({ nodes: [], edges: [] })
        expect(consoleSpy).not.toHaveBeenCalled()

        consoleSpy.mockRestore()
    })
})

function hasCycle(graph) {
    const outgoing = new Map()
    for (const edge of graph.edges) {
        if (!outgoing.has(edge.from)) {
            outgoing.set(edge.from, [])
        }
        outgoing.get(edge.from).push(edge.to)
    }

    const visiting = new Set()
    const visited = new Set()
    for (const node of graph.nodes) {
        if (visit(node.id, outgoing, visiting, visited)) {
            return true
        }
    }
    return false
}

function visit(nodeId, outgoing, visiting, visited) {
    if (visited.has(nodeId)) {
        return false
    }
    if (visiting.has(nodeId)) {
        return true
    }
    visiting.add(nodeId)
    for (const next of outgoing.get(nodeId) ?? []) {
        if (visit(next, outgoing, visiting, visited)) {
            return true
        }
    }
    visiting.delete(nodeId)
    visited.add(nodeId)
    return false
}
