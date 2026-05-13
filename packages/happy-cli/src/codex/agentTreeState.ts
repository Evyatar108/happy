import type { AgentTreeDelta, AgentTreeEdge, AgentTreeNode, AgentTreeSnapshot } from '@slopus/happy-wire';

type SpawnBeginEvent = {
    type: 'collab_agent_spawn_begin' | 'CollabAgentSpawnBegin' | 'CollabAgentSpawnBeginEvent' | 'collab-agent-spawn-begin';
    callId?: string;
    call_id?: string;
    parentThreadId?: string;
    parent_thread_id?: string;
    threadId?: string;
    thread_id?: string;
    agentRole?: string;
    agent_role?: string;
    role?: string;
    nickname?: string | null;
    taskMessage?: string;
    task_message?: string;
    message?: string;
    startedAt?: number;
    started_at?: number;
};

type SpawnEndEvent = {
    type: 'collab_agent_spawn_end' | 'CollabAgentSpawnEnd' | 'CollabAgentSpawnEndEvent' | 'collab-agent-spawn-end';
    callId?: string;
    call_id?: string;
    parentThreadId?: string;
    parent_thread_id?: string;
    parentThreadID?: string;
    threadId?: string;
    thread_id?: string;
    agentRole?: string;
    agent_role?: string;
    new_agent_role?: string;
    role?: string;
    nickname?: string | null;
    new_agent_nickname?: string | null;
    taskMessage?: string;
    task_message?: string;
    message?: string;
    spawnedAt?: number;
    spawned_at?: number;
};

type AgentToolEvent = {
    type:
        | 'collab_agent_tool_call'
        | 'collabAgentToolCall'
        | 'collab_agent_send_input'
        | 'collab_agent_wait'
        | 'collab_agent_close_agent'
        | 'collab_agent_resume_agent';
    tool?: string;
    phase?: string;
    status?: string;
    threadId?: string;
    thread_id?: string;
    targetThreadId?: string;
    target_thread_id?: string;
    agentThreadId?: string;
    agent_thread_id?: string;
    message?: string;
    input?: string;
    taskMessage?: string;
    task_message?: string;
};

type AgentMessageEvent = {
    type: 'agent_message';
    threadId?: string;
    thread_id?: string;
    message?: string;
};

export type AgentTreeEvent = SpawnBeginEvent | SpawnEndEvent | AgentToolEvent | AgentMessageEvent;

export type AgentTreeState = {
    applyEvent(evt: AgentTreeEvent): AgentTreeDelta[];
    snapshot(): AgentTreeSnapshot;
    clear(): void;
};

type PendingSpawn = {
    callId: string;
    parentThreadId: string;
    agentRole: string;
    nickname: string | null;
    taskMessage?: string;
    startedAt: number;
};

function stringValue(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function callIdOf(evt: SpawnBeginEvent | SpawnEndEvent): string | undefined {
    return stringValue(evt.callId) ?? stringValue(evt.call_id);
}

function parentThreadIdOf(evt: SpawnBeginEvent | SpawnEndEvent): string | undefined {
    return stringValue(evt.parentThreadId)
        ?? stringValue(evt.parent_thread_id)
        ?? ('parentThreadID' in evt ? stringValue(evt.parentThreadID) : undefined);
}

function threadIdOf(evt: SpawnBeginEvent | SpawnEndEvent | AgentToolEvent | AgentMessageEvent): string | undefined {
    return stringValue(evt.threadId)
        ?? stringValue(evt.thread_id)
        ?? ('targetThreadId' in evt ? stringValue(evt.targetThreadId) : undefined)
        ?? ('target_thread_id' in evt ? stringValue(evt.target_thread_id) : undefined)
        ?? ('agentThreadId' in evt ? stringValue(evt.agentThreadId) : undefined)
        ?? ('agent_thread_id' in evt ? stringValue(evt.agent_thread_id) : undefined);
}

function agentRoleOf(evt: SpawnBeginEvent | SpawnEndEvent): string {
    return stringValue(evt.agentRole)
        ?? stringValue(evt.agent_role)
        ?? ('new_agent_role' in evt ? stringValue(evt.new_agent_role) : undefined)
        ?? stringValue(evt.role)
        ?? 'agent';
}

function taskMessageOf(evt: SpawnBeginEvent | SpawnEndEvent | AgentToolEvent | AgentMessageEvent): string | undefined {
    return ('taskMessage' in evt ? stringValue(evt.taskMessage) : undefined)
        ?? ('task_message' in evt ? stringValue(evt.task_message) : undefined)
        ?? stringValue(evt.message)
        ?? ('input' in evt ? stringValue(evt.input) : undefined);
}

function startedAtOf(evt: SpawnBeginEvent): number {
    return numberValue(evt.startedAt) ?? numberValue(evt.started_at) ?? Date.now();
}

function spawnedAtOf(evt: SpawnEndEvent, pending?: PendingSpawn): number {
    return numberValue(evt.spawnedAt) ?? numberValue(evt.spawned_at) ?? pending?.startedAt ?? Date.now();
}

function isBegin(evt: AgentTreeEvent): evt is SpawnBeginEvent {
    return evt.type === 'collab_agent_spawn_begin'
        || evt.type === 'CollabAgentSpawnBegin'
        || evt.type === 'CollabAgentSpawnBeginEvent'
        || evt.type === 'collab-agent-spawn-begin';
}

function isEnd(evt: AgentTreeEvent): evt is SpawnEndEvent {
    return evt.type === 'collab_agent_spawn_end'
        || evt.type === 'CollabAgentSpawnEnd'
        || evt.type === 'CollabAgentSpawnEndEvent'
        || evt.type === 'collab-agent-spawn-end';
}

function normalizedTool(evt: AgentToolEvent): string {
    if (evt.type === 'collab_agent_send_input') return 'sendInput';
    if (evt.type === 'collab_agent_wait') return 'wait';
    if (evt.type === 'collab_agent_close_agent') return 'closeAgent';
    if (evt.type === 'collab_agent_resume_agent') return 'resumeAgent';
    return stringValue(evt.tool) ?? '';
}

export function createAgentTreeState(): AgentTreeState {
    let seq = 0;
    const nodes = new Map<string, AgentTreeNode>();
    const edges = new Map<string, AgentTreeEdge>();
    const pendingByCallId = new Map<string, PendingSpawn>();
    const seenPhases = new Set<string>();

    const nextSeq = (): number => {
        seq += 1;
        return seq;
    };

    const mergeNodeMetadata = (threadId: string, evt: SpawnEndEvent, pending?: PendingSpawn): void => {
        const node = nodes.get(threadId);
        if (!node) return;

        const taskMessage = taskMessageOf(evt) ?? pending?.taskMessage;
        const agentRole = agentRoleOf(evt);
        const nickname = evt.nickname ?? evt.new_agent_nickname ?? pending?.nickname ?? node.nickname;
        nodes.set(threadId, {
            ...node,
            agentRole: node.agentRole === 'agent' ? agentRole : node.agentRole,
            nickname,
            ...(taskMessage && !node.lastTaskMessage ? { lastTaskMessage: taskMessage } : {}),
        });
    };

    const emitStatus = (threadId: string, status: string, lastTaskMessage?: string): AgentTreeDelta[] => {
        const node = nodes.get(threadId);
        if (!node) return [];
        if (node.status === status && (lastTaskMessage === undefined || node.lastTaskMessage === lastTaskMessage)) {
            return [];
        }

        const updated = {
            ...node,
            status,
            ...(lastTaskMessage !== undefined ? { lastTaskMessage } : {}),
        };
        nodes.set(threadId, updated);

        return [{
            type: 'node-status-changed',
            seq: nextSeq(),
            threadId,
            status,
            ...(lastTaskMessage !== undefined ? { lastTaskMessage } : {}),
        }];
    };

    const descendantFirst = (threadId: string): string[] => {
        const children = Array.from(edges.values())
            .filter((edge) => edge.parent === threadId)
            .map((edge) => edge.child);
        return [...children.flatMap(descendantFirst), threadId];
    };

    const removeSubtree = (threadId: string): AgentTreeDelta[] => {
        const threadIds = descendantFirst(threadId).filter((id) => nodes.has(id));
        const removed = new Set(threadIds);
        for (const id of threadIds) {
            nodes.delete(id);
        }
        for (const [key, edge] of edges) {
            if (removed.has(edge.parent) || removed.has(edge.child)) {
                edges.delete(key);
            }
        }
        for (const [callId, pending] of pendingByCallId) {
            if (removed.has(pending.parentThreadId)) {
                pendingByCallId.delete(callId);
            }
        }

        return threadIds.map((id) => ({
            type: 'node-removed',
            seq: nextSeq(),
            threadId: id,
        }));
    };

    return {
        applyEvent(evt: AgentTreeEvent): AgentTreeDelta[] {
            if (isBegin(evt)) {
                const callId = callIdOf(evt);
                const parentThreadId = parentThreadIdOf(evt) ?? threadIdOf(evt);
                if (!callId || !parentThreadId) return [];

                const phaseKey = `${callId}:begin`;
                if (seenPhases.has(phaseKey)) return [];
                seenPhases.add(phaseKey);

                const pending: PendingSpawn = {
                    callId,
                    parentThreadId,
                    agentRole: agentRoleOf(evt),
                    nickname: evt.nickname ?? null,
                    ...(taskMessageOf(evt) ? { taskMessage: taskMessageOf(evt) } : {}),
                    startedAt: startedAtOf(evt),
                };
                pendingByCallId.set(callId, pending);

                return [{
                    type: 'pending-spawn-started',
                    seq: nextSeq(),
                    callId,
                    parentThreadId,
                    agentRole: pending.agentRole,
                    nickname: pending.nickname,
                    ...(pending.taskMessage ? { taskMessage: pending.taskMessage } : {}),
                    startedAt: pending.startedAt,
                }];
            }

            if (isEnd(evt)) {
                const callId = callIdOf(evt);
                const threadId = threadIdOf(evt);
                if (!callId || !threadId) return [];

                const pending = pendingByCallId.get(callId);
                const phaseKey = `${callId}:end`;
                if (seenPhases.has(phaseKey)) {
                    mergeNodeMetadata(threadId, evt, pending);
                    return [];
                }

                const parentThreadId = pending?.parentThreadId ?? parentThreadIdOf(evt);
                if (!parentThreadId) return [];
                seenPhases.add(phaseKey);
                pendingByCallId.delete(callId);

                if (nodes.has(threadId)) {
                    mergeNodeMetadata(threadId, evt, pending);
                    return [];
                }

                const node: AgentTreeNode = {
                    threadId,
                    agentRole: pending?.agentRole ?? agentRoleOf(evt),
                    nickname: pending?.nickname ?? evt.nickname ?? evt.new_agent_nickname ?? null,
                    status: 'running',
                    ...(taskMessageOf(evt) ?? pending?.taskMessage ? { lastTaskMessage: taskMessageOf(evt) ?? pending?.taskMessage } : {}),
                    spawnedAt: spawnedAtOf(evt, pending),
                };
                const edge: AgentTreeEdge = { parent: parentThreadId, child: threadId };
                nodes.set(threadId, node);
                edges.set(`${parentThreadId}:${threadId}`, edge);

                return [{
                    type: 'node-added',
                    seq: nextSeq(),
                    node,
                    edge,
                }];
            }

            if (evt.type === 'agent_message') {
                const threadId = threadIdOf(evt);
                if (!threadId) return [];
                return emitStatus(threadId, nodes.get(threadId)?.status ?? 'running', taskMessageOf(evt));
            }

            const threadId = threadIdOf(evt);
            if (!threadId) return [];
            const tool = normalizedTool(evt);
            if (tool === 'closeAgent') {
                if (evt.phase !== undefined && (evt.phase !== 'completed' || evt.status !== 'completed')) return [];
                return removeSubtree(threadId);
            }
            if (tool === 'wait') return emitStatus(threadId, 'waiting');
            if (tool === 'resumeAgent') return emitStatus(threadId, 'running');
            if (tool === 'sendInput') return emitStatus(threadId, 'running', taskMessageOf(evt));
            return [];
        },

        snapshot(): AgentTreeSnapshot {
            return {
                nodes: Array.from(nodes.values()),
                edges: Array.from(edges.values()),
                seq,
            };
        },

        clear(): void {
            seq = 0;
            nodes.clear();
            edges.clear();
            pendingByCallId.clear();
            seenPhases.clear();
        },
    };
}
