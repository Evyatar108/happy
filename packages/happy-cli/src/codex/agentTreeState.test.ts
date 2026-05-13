import { describe, expect, it } from 'vitest';
import { createAgentTreeState } from './agentTreeState';

describe('agent tree state', () => {
    it('applies an ordered begin/end pair', () => {
        const state = createAgentTreeState();

        const begin = state.applyEvent({
            type: 'collab_agent_spawn_begin',
            call_id: 'call-a',
            parent_thread_id: 'root',
            agent_role: 'explorer',
            nickname: 'A',
            task_message: 'inspect files',
            started_at: 10,
        });
        const end = state.applyEvent({
            type: 'collab_agent_spawn_end',
            call_id: 'call-a',
            thread_id: 'thread-a',
        });

        expect(begin).toEqual([{
            type: 'pending-spawn-started',
            seq: 1,
            callId: 'call-a',
            parentThreadId: 'root',
            agentRole: 'explorer',
            nickname: 'A',
            taskMessage: 'inspect files',
            startedAt: 10,
        }]);
        expect(end).toEqual([{
            type: 'node-added',
            seq: 2,
            node: {
                threadId: 'thread-a',
                agentRole: 'explorer',
                nickname: 'A',
                status: 'running',
                lastTaskMessage: 'inspect files',
                spawnedAt: 10,
            },
            edge: { parent: 'root', child: 'thread-a' },
        }]);
        const snapshot = state.snapshot();
        expect(snapshot).toEqual({
            nodes: [{
                threadId: 'thread-a',
                agentRole: 'explorer',
                nickname: 'A',
                status: 'running',
                lastTaskMessage: 'inspect files',
                spawnedAt: 10,
            }],
            edges: [{ parent: 'root', child: 'thread-a' }],
            seq: 2,
        });
    });

    it('applies a nested begin/end pair', () => {
        const state = createAgentTreeState();

        state.applyEvent({ type: 'collab_agent_spawn_begin', callId: 'call-a', parentThreadId: 'root', agentRole: 'explorer', nickname: 'A', startedAt: 1 });
        state.applyEvent({ type: 'collab_agent_spawn_end', callId: 'call-a', threadId: 'thread-a' });
        state.applyEvent({ type: 'collab_agent_spawn_begin', callId: 'call-b', parentThreadId: 'thread-a', agentRole: 'worker', nickname: 'B', startedAt: 3 });
        state.applyEvent({ type: 'collab_agent_spawn_end', callId: 'call-b', threadId: 'thread-b' });

        expect(state.snapshot()).toMatchObject({
            nodes: [
                { threadId: 'thread-a', nickname: 'A' },
                { threadId: 'thread-b', nickname: 'B' },
            ],
            edges: [
                { parent: 'root', child: 'thread-a' },
                { parent: 'thread-a', child: 'thread-b' },
            ],
            seq: 4,
        });
    });

    it('emits status changes and last task updates', () => {
        const state = createAgentTreeState();
        state.applyEvent({ type: 'collab_agent_spawn_begin', callId: 'call-a', parentThreadId: 'root', agentRole: 'explorer', nickname: null, startedAt: 1 });
        state.applyEvent({ type: 'collab_agent_spawn_end', callId: 'call-a', threadId: 'thread-a' });

        const wait = state.applyEvent({ type: 'collab_agent_tool_call', tool: 'wait', threadId: 'thread-a' });
        const sendInput = state.applyEvent({ type: 'collabAgentToolCall', tool: 'sendInput', threadId: 'thread-a', input: 'continue' });
        const message = state.applyEvent({ type: 'agent_message', threadId: 'thread-a', message: 'working' });

        expect(wait).toEqual([{ type: 'node-status-changed', seq: 3, threadId: 'thread-a', status: 'waiting' }]);
        expect(sendInput).toEqual([{ type: 'node-status-changed', seq: 4, threadId: 'thread-a', status: 'running', lastTaskMessage: 'continue' }]);
        expect(message).toEqual([{ type: 'node-status-changed', seq: 5, threadId: 'thread-a', status: 'running', lastTaskMessage: 'working' }]);
        expect(state.snapshot().nodes[0]).toMatchObject({ status: 'running', lastTaskMessage: 'working' });
    });

    it('removes a node', () => {
        const state = createAgentTreeState();
        state.applyEvent({ type: 'collab_agent_spawn_begin', callId: 'call-a', parentThreadId: 'root', agentRole: 'explorer', nickname: null, startedAt: 1 });
        state.applyEvent({ type: 'collab_agent_spawn_end', callId: 'call-a', threadId: 'thread-a' });

        const removed = state.applyEvent({ type: 'collab_agent_close_agent', thread_id: 'thread-a' });

        expect(removed).toEqual([{ type: 'node-removed', seq: 3, threadId: 'thread-a' }]);
        expect(state.snapshot()).toEqual({ nodes: [], edges: [], seq: 3 });
    });

    it('deduplicates v2-first and legacy-second begin/end events while merging missing metadata', () => {
        const state = createAgentTreeState();

        expect(state.applyEvent({ type: 'collab-agent-spawn-begin', callId: 'call-a', parentThreadId: 'root', agentRole: 'agent', nickname: null, startedAt: 1 })).toHaveLength(1);
        expect(state.applyEvent({ type: 'collab_agent_spawn_begin', call_id: 'call-a', parent_thread_id: 'root', agent_role: 'explorer', nickname: 'A', started_at: 1 })).toEqual([]);
        expect(state.applyEvent({ type: 'collab-agent-spawn-end', callId: 'call-a', threadId: 'thread-a' })).toHaveLength(1);
        expect(state.applyEvent({ type: 'collab_agent_spawn_end', call_id: 'call-a', thread_id: 'thread-a', agent_role: 'explorer', nickname: 'A', task_message: 'legacy detail' })).toEqual([]);

        expect(state.snapshot()).toMatchObject({
            nodes: [{ threadId: 'thread-a', agentRole: 'explorer', nickname: 'A', lastTaskMessage: 'legacy detail' }],
            seq: 2,
        });
    });

    it('deduplicates legacy-first and v2-second begin/end events', () => {
        const state = createAgentTreeState();

        expect(state.applyEvent({ type: 'collab_agent_spawn_begin', call_id: 'call-a', parent_thread_id: 'root', agent_role: 'explorer', nickname: 'A', started_at: 1 })).toHaveLength(1);
        expect(state.applyEvent({ type: 'CollabAgentSpawnBegin', callId: 'call-a', parentThreadId: 'root', agentRole: 'explorer', nickname: 'A', startedAt: 1 })).toEqual([]);
        expect(state.applyEvent({ type: 'collab_agent_spawn_end', call_id: 'call-a', thread_id: 'thread-a' })).toHaveLength(1);
        expect(state.applyEvent({ type: 'CollabAgentSpawnEnd', callId: 'call-a', threadId: 'thread-a' })).toEqual([]);

        expect(state.snapshot().seq).toBe(2);
        expect(state.snapshot().nodes).toHaveLength(1);
    });

    it('keeps seq monotonic across array-returning closeAgent removal', () => {
        const state = createAgentTreeState();
        state.applyEvent({ type: 'collab_agent_spawn_begin', callId: 'call-a', parentThreadId: 'root', agentRole: 'explorer', nickname: 'A', startedAt: 1 });
        state.applyEvent({ type: 'collab_agent_spawn_end', callId: 'call-a', threadId: 'thread-a' });
        state.applyEvent({ type: 'collab_agent_spawn_begin', callId: 'call-b', parentThreadId: 'thread-a', agentRole: 'worker', nickname: 'B', startedAt: 3 });
        state.applyEvent({ type: 'collab_agent_spawn_end', callId: 'call-b', threadId: 'thread-b' });

        const removed = state.applyEvent({ type: 'collab_agent_tool_call', tool: 'closeAgent', threadId: 'thread-a' });

        expect(removed).toEqual([
            { type: 'node-removed', seq: 5, threadId: 'thread-b' },
            { type: 'node-removed', seq: 6, threadId: 'thread-a' },
        ]);
        expect(state.snapshot()).toEqual({ nodes: [], edges: [], seq: 6 });
    });

    it('clears all state and resets seq to zero', () => {
        const state = createAgentTreeState();
        state.applyEvent({ type: 'collab_agent_spawn_begin', callId: 'call-a', parentThreadId: 'root', agentRole: 'explorer', nickname: null, startedAt: 1 });
        state.applyEvent({ type: 'collab_agent_spawn_end', callId: 'call-a', threadId: 'thread-a' });

        state.clear();

        expect(state.snapshot()).toEqual({ nodes: [], edges: [], seq: 0 });
        expect(state.applyEvent({ type: 'collab_agent_spawn_begin', callId: 'call-b', parentThreadId: 'root', agentRole: 'worker', nickname: null, startedAt: 5 })).toMatchObject([{ seq: 1 }]);
    });

    it('does not remove node on closeAgent item/started (in-flight)', () => {
        const state = createAgentTreeState();
        state.applyEvent({ type: 'collab_agent_spawn_begin', callId: 'call-a', parentThreadId: 'root', agentRole: 'explorer', nickname: null, startedAt: 1 });
        state.applyEvent({ type: 'collab_agent_spawn_end', callId: 'call-a', threadId: 'thread-a' });

        const result = state.applyEvent({ type: 'collabAgentToolCall', tool: 'closeAgent', phase: 'started', status: 'running', threadId: 'thread-a' });

        expect(result).toEqual([]);
        expect(state.snapshot().nodes).toHaveLength(1);
    });

    it('does not remove node on closeAgent item/completed with failed status', () => {
        const state = createAgentTreeState();
        state.applyEvent({ type: 'collab_agent_spawn_begin', callId: 'call-a', parentThreadId: 'root', agentRole: 'explorer', nickname: null, startedAt: 1 });
        state.applyEvent({ type: 'collab_agent_spawn_end', callId: 'call-a', threadId: 'thread-a' });

        const result = state.applyEvent({ type: 'collabAgentToolCall', tool: 'closeAgent', phase: 'completed', status: 'failed', threadId: 'thread-a' });

        expect(result).toEqual([]);
        expect(state.snapshot().nodes).toHaveLength(1);
    });

    it('removes node on closeAgent item/completed with completed status', () => {
        const state = createAgentTreeState();
        state.applyEvent({ type: 'collab_agent_spawn_begin', callId: 'call-a', parentThreadId: 'root', agentRole: 'explorer', nickname: null, startedAt: 1 });
        state.applyEvent({ type: 'collab_agent_spawn_end', callId: 'call-a', threadId: 'thread-a' });

        const result = state.applyEvent({ type: 'collabAgentToolCall', tool: 'closeAgent', phase: 'completed', status: 'completed', threadId: 'thread-a' });

        expect(result).toEqual([{ type: 'node-removed', seq: 3, threadId: 'thread-a' }]);
        expect(state.snapshot().nodes).toHaveLength(0);
    });

    it('populates nickname and agentRole from new_agent_nickname / new_agent_role on a legacy spawn-end with no prior begin', () => {
        const state = createAgentTreeState();

        const deltas = state.applyEvent({
            type: 'collab_agent_spawn_end',
            call_id: 'call-legacy',
            parent_thread_id: 'parent-thread',
            thread_id: 'child-thread',
            new_agent_role: 'researcher',
            new_agent_nickname: 'Aria',
        });

        expect(deltas).toHaveLength(1);
        const delta = deltas[0];
        expect(delta.type).toBe('node-added');
        if (delta.type === 'node-added') {
            expect(delta.node.agentRole).toBe('researcher');
            expect(delta.node.nickname).toBe('Aria');
        }
    });

    it('merges new_agent_nickname / new_agent_role via mergeNodeMetadata on a duplicate spawn-end', () => {
        const state = createAgentTreeState();

        state.applyEvent({
            type: 'collab_agent_spawn_end',
            call_id: 'call-1',
            parent_thread_id: 'parent-thread',
            thread_id: 'child-thread',
        });

        state.applyEvent({
            type: 'collab_agent_spawn_end',
            call_id: 'call-2',
            parent_thread_id: 'parent-thread',
            thread_id: 'child-thread',
            new_agent_role: 'researcher',
            new_agent_nickname: 'Aria',
        });

        const snapshot = state.snapshot();
        const node = snapshot.nodes.find((n) => n.threadId === 'child-thread');
        expect(node?.agentRole).toBe('researcher');
        expect(node?.nickname).toBe('Aria');
    });

    it('prefers canonical nickname / agentRole fields over new_agent_* when both are present', () => {
        const state = createAgentTreeState();

        const deltas = state.applyEvent({
            type: 'collab_agent_spawn_end',
            call_id: 'call-1',
            parent_thread_id: 'parent-thread',
            thread_id: 'child-thread',
            agent_role: 'canonical-role',
            nickname: 'CanonicalName',
            new_agent_role: 'legacy-role',
            new_agent_nickname: 'LegacyName',
        });

        expect(deltas).toHaveLength(1);
        const delta = deltas[0];
        if (delta.type === 'node-added') {
            expect(delta.node.agentRole).toBe('canonical-role');
            expect(delta.node.nickname).toBe('CanonicalName');
        }
    });
});
