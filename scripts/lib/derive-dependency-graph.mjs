const EDGE_TYPE_ORDER = Object.freeze({
    'depends-on-story': 0,
    spawn: 1,
    blocks: 2,
    'depends-on-task': 3,
})

/**
 * Builds the Plan 04 dependency graph with a single direction convention:
 * every edge points from the dependent item to its prerequisite. For example,
 * { from: 'A', to: 'B', type: 'depends-on-story' } means A depends on B.
 */
export function deriveDependencyGraph({ byTaskId = {}, overviewData = {}, prdsByTaskId = {}, generatedFromCommit } = {}) {
    const nodes = new Map()
    const edges = new Map()
    const tasksById = new Map((overviewData.tasks ?? []).filter((task) => task?.id).map((task) => [task.id, task]))
    const taskIds = collectTaskIds(byTaskId, tasksById, prdsByTaskId, overviewData)

    for (const taskId of taskIds) {
        addTaskNode(nodes, taskId, byTaskId[taskId]?.stage)
    }

    for (const [taskId, prd] of Object.entries(prdsByTaskId)) {
        const stories = Array.isArray(prd?.userStories) ? prd.userStories : []
        for (const story of stories) {
            if (!story?.id) {
                continue
            }
            const storyNodeId = storyNodeIdFor(taskId, story.id)
            addStoryNode(nodes, storyNodeId, taskId, story.id)
            for (const dependency of stringItems(story.dependencies)) {
                const prerequisiteId = resolveStoryDependencyId(taskId, dependency)
                addStoryNodeForComposite(nodes, prerequisiteId)
                addEdge(edges, storyNodeId, prerequisiteId, 'depends-on-story')
            }
        }

        if (stories.length === 0) {
            for (const dependencyTaskId of stringItems(prd?.dependencies)) {
                addTaskNode(nodes, taskId, byTaskId[taskId]?.stage)
                addTaskNode(nodes, dependencyTaskId, byTaskId[dependencyTaskId]?.stage)
                addEdge(edges, taskId, dependencyTaskId, 'depends-on-task')
            }
        }
    }

    for (const [childTaskId, parentTaskId] of Object.entries(overviewData.spawnedFrom ?? {})) {
        if (childTaskId.startsWith('_') || typeof parentTaskId !== 'string') {
            continue
        }
        addTaskNode(nodes, childTaskId, byTaskId[childTaskId]?.stage)
        addTaskNode(nodes, parentTaskId, byTaskId[parentTaskId]?.stage)
        addEdge(edges, childTaskId, parentTaskId, 'spawn')
    }

    for (const task of tasksById.values()) {
        for (const blockedTaskId of stringItems(task.blocks)) {
            addTaskNode(nodes, task.id, byTaskId[task.id]?.stage)
            addTaskNode(nodes, blockedTaskId, byTaskId[blockedTaskId]?.stage)
            addEdge(edges, blockedTaskId, task.id, 'blocks')
        }
    }

    return {
        nodes: [...nodes.values()].sort(compareNodes),
        edges: [...edges.values()].sort(compareEdges),
    }
}

function collectTaskIds(byTaskId, tasksById, prdsByTaskId, overviewData) {
    const taskIds = new Set([...Object.keys(byTaskId), ...tasksById.keys(), ...Object.keys(prdsByTaskId)])
    for (const [childTaskId, parentTaskId] of Object.entries(overviewData.spawnedFrom ?? {})) {
        if (childTaskId.startsWith('_')) {
            continue
        }
        taskIds.add(childTaskId)
        if (typeof parentTaskId === 'string') {
            taskIds.add(parentTaskId)
        }
    }
    for (const task of tasksById.values()) {
        for (const blockedTaskId of stringItems(task.blocks)) {
            taskIds.add(blockedTaskId)
        }
    }
    return [...taskIds].sort((a, b) => a.localeCompare(b))
}

function addTaskNode(nodes, taskId, stage) {
    if (!taskId || nodes.has(taskId)) {
        return
    }
    nodes.set(taskId, stage ? { id: taskId, type: 'task', taskId, stage } : { id: taskId, type: 'task', taskId })
}

function addStoryNode(nodes, id, taskId, storyId) {
    if (!id || nodes.has(id)) {
        return
    }
    nodes.set(id, { id, type: 'story', taskId, storyId })
}

function addStoryNodeForComposite(nodes, id) {
    if (!id || nodes.has(id)) {
        return
    }
    const separator = id.indexOf(':')
    if (separator === -1) {
        nodes.set(id, { id, type: 'story', storyId: id })
        return
    }
    nodes.set(id, { id, type: 'story', taskId: id.slice(0, separator), storyId: id.slice(separator + 1) })
}

function addEdge(edges, from, to, type) {
    if (!from || !to) {
        return
    }
    edges.set(`${from}\u0000${to}\u0000${type}`, { from, to, type })
}

function resolveStoryDependencyId(taskId, dependency) {
    return dependency.includes(':') ? dependency : storyNodeIdFor(taskId, dependency)
}

function storyNodeIdFor(taskId, storyId) {
    return `${taskId}:${storyId}`
}

function stringItems(value) {
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.length > 0) : []
}

function compareNodes(a, b) {
    return a.id.localeCompare(b.id)
}

function compareEdges(a, b) {
    return EDGE_TYPE_ORDER[a.type] - EDGE_TYPE_ORDER[b.type] || a.from.localeCompare(b.from) || a.to.localeCompare(b.to)
}
