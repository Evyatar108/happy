import { describe, it, expect, vi } from 'vitest';
import { PermissionHandler } from './permissionHandler';
import { SessionAllowlist } from './sessionAllowlist';
import type { Session } from '../session';
import type { EnhancedMode, PermissionMode } from '../loop';
import type { AgentState } from '@/api/types';

vi.mock('@/lib', () => ({
    logger: {
        debug: vi.fn(),
    },
}));

type PermissionRpcResponse = {
    id: string;
    approved: boolean;
    reason?: string;
    mode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
    decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort';
    allowTools?: string[];
};

function createStubSession(sessionId = 'test-session', initialState: AgentState = {}): {
    session: Session;
    getState: () => AgentState;
    permissionHandler: (response: PermissionRpcResponse) => Promise<void>;
} {
    let state = initialState;
    let permissionHandler: ((response: PermissionRpcResponse) => Promise<void>) | undefined;
    const session = {
        client: {
            rpcHandlerManager: {
                registerHandler: vi.fn((method: string, handler: (response: PermissionRpcResponse) => Promise<void>) => {
                    if (method === 'permission') {
                        permissionHandler = handler;
                    }
                }),
            },
            updateAgentState: vi.fn((updater: (currentState: AgentState) => AgentState) => {
                state = updater(state);
            }),
            sendPushEvent: vi.fn(),
            sessionId,
            getMetadata: vi.fn().mockReturnValue({}),
            getAgentState: vi.fn(() => state),
        },
        api: {
            push: () => ({
                sendSessionNotification: vi.fn(),
            }),
        },
        permissionAllowlist: new SessionAllowlist(),
    } as unknown as Session;

    return {
        session,
        getState: () => state,
        permissionHandler: async (response) => {
            if (!permissionHandler) {
                throw new Error('permission handler not registered');
            }
            await permissionHandler(response);
        },
    };
}

function callTool(handler: PermissionHandler, toolName: string, mode: PermissionMode, options?: { input?: unknown; toolUseID?: string }) {
    const enhancedMode: EnhancedMode = { permissionMode: mode };
    return handler.handleToolCall(
        toolName,
        options?.input ?? { command: 'rm -rf /' },
        enhancedMode,
        { signal: new AbortController().signal, toolUseID: options?.toolUseID ?? 'tool-call-1' },
    );
}

async function expectPending<T>(promise: Promise<T>) {
    const settled = await Promise.race([
        promise.then(() => 'resolved'),
        new Promise<string>((r) => setTimeout(() => r('pending'), 20)),
    ]);

    expect(settled).toBe('pending');
}

describe('PermissionHandler mode mapping', () => {
    it('auto-allows tool calls when mode is yolo (Codex alias for bypassPermissions)', async () => {
        const { session } = createStubSession();
        const handler = new PermissionHandler(session);
        handler.handleModeChange('yolo');

        const result = await callTool(handler, 'Bash', 'yolo');

        expect(result.behavior).toBe('allow');
    });

    it('auto-allows tool calls when mode is bypassPermissions (native Claude)', async () => {
        const { session } = createStubSession();
        const handler = new PermissionHandler(session);
        handler.handleModeChange('bypassPermissions');

        const result = await callTool(handler, 'Bash', 'bypassPermissions');

        expect(result.behavior).toBe('allow');
    });

    it('does not auto-allow when mode is safe-yolo (maps to default -> ask)', async () => {
        const { session } = createStubSession();
        const handler = new PermissionHandler(session);
        handler.handleModeChange('safe-yolo');

        const promise = callTool(handler, 'Bash', 'safe-yolo');

        await expectPending(promise);
    });

    it('does not auto-allow when mode is read-only (maps to default -> ask)', async () => {
        const { session } = createStubSession();
        const handler = new PermissionHandler(session);
        handler.handleModeChange('read-only');

        const promise = callTool(handler, 'Bash', 'read-only');

        await expectPending(promise);
    });

    it('auto-allows edits when mode is acceptEdits', async () => {
        const { session } = createStubSession();
        const handler = new PermissionHandler(session);
        handler.handleModeChange('acceptEdits');

        const result = await handler.handleToolCall(
            'Edit',
            { file_path: '/tmp/x', old_string: 'a', new_string: 'b' },
            { permissionMode: 'acceptEdits' },
            { signal: new AbortController().signal, toolUseID: 'tool-call-2' },
        );

        expect(result.behavior).toBe('allow');
    });
});

describe('PermissionHandler session allowlist', () => {
    it('persists approved_for_session allowTools across handler reset', async () => {
        const { session, permissionHandler } = createStubSession();
        const handler = new PermissionHandler(session);

        const pending = callTool(handler, 'Bash', 'default', {
            input: { command: 'npm test' },
            toolUseID: 'tool-call-allow-session',
        });

        await permissionHandler({
            id: 'tool-call-allow-session',
            approved: true,
            decision: 'approved_for_session',
            allowTools: ['Bash(npm test)'],
        });
        await expect(pending).resolves.toMatchObject({ behavior: 'allow' });

        handler.reset();

        const result = await callTool(handler, 'Bash', 'default', {
            input: { command: 'npm test' },
            toolUseID: 'tool-call-after-reset',
        });

        expect(result.behavior).toBe('allow');
    });

    it('does not carry approved_for_session allowTools across sessions', async () => {
        const sessionA = createStubSession('session-a');
        const handlerA = new PermissionHandler(sessionA.session);

        const pendingA = callTool(handlerA, 'Bash', 'default', {
            input: { command: 'npm test' },
            toolUseID: 'tool-call-session-a',
        });
        await sessionA.permissionHandler({
            id: 'tool-call-session-a',
            approved: true,
            decision: 'approved_for_session',
            allowTools: ['Bash(npm test)'],
        });
        await expect(pendingA).resolves.toMatchObject({ behavior: 'allow' });

        const sessionB = createStubSession('session-b');
        const handlerB = new PermissionHandler(sessionB.session);
        const pendingB = callTool(handlerB, 'Bash', 'default', {
            input: { command: 'npm test' },
            toolUseID: 'tool-call-session-b',
        });

        await expectPending(pendingB);
    });

    it('clears persisted allowlist when abort is received', async () => {
        const { session, permissionHandler } = createStubSession();
        const handler = new PermissionHandler(session);

        const pendingAllow = callTool(handler, 'Bash', 'default', {
            input: { command: 'npm test' },
            toolUseID: 'tool-call-allow-before-abort',
        });
        await permissionHandler({
            id: 'tool-call-allow-before-abort',
            approved: true,
            decision: 'approved_for_session',
            allowTools: ['Bash(npm test)'],
        });
        await expect(pendingAllow).resolves.toMatchObject({ behavior: 'allow' });

        const pendingAbort = callTool(handler, 'Write', 'default', {
            input: { file_path: '/tmp/file', content: 'x' },
            toolUseID: 'tool-call-abort',
        });
        await permissionHandler({ id: 'tool-call-abort', approved: false, decision: 'abort' });
        await expect(pendingAbort).resolves.toMatchObject({ behavior: 'deny' });

        const pendingAfterAbort = callTool(handler, 'Bash', 'default', {
            input: { command: 'npm test' },
            toolUseID: 'tool-call-after-abort',
        });
        await expectPending(pendingAfterAbort);
    });

    it('rehydrates session allowlist from agentState completedRequests', async () => {
        const allowlist = new SessionAllowlist();
        allowlist.rehydrateFromAgentState({
            completedRequests: {
                'previous-approval': {
                    tool: 'Bash',
                    arguments: { command: 'npm test' },
                    createdAt: 1,
                    completedAt: 2,
                    status: 'approved',
                    decision: 'approved_for_session',
                    allowTools: ['Bash(npm test)'],
                },
                'previous-edit-mode': {
                    tool: 'Edit',
                    arguments: { file_path: '/tmp/a', old_string: 'a', new_string: 'b' },
                    createdAt: 3,
                    completedAt: 4,
                    status: 'approved',
                    decision: 'approved_for_session',
                    mode: 'acceptEdits',
                },
            },
        });
        const { session } = createStubSession();
        const handler = new PermissionHandler(session, allowlist);

        const bashResult = await callTool(handler, 'Bash', 'default', {
            input: { command: 'npm test' },
            toolUseID: 'tool-call-rehydrated-bash',
        });
        const editResult = await handler.handleToolCall(
            'Edit',
            { file_path: '/tmp/a', old_string: 'a', new_string: 'b' },
            { permissionMode: 'default' },
            { signal: new AbortController().signal, toolUseID: 'tool-call-rehydrated-edit' },
        );

        expect(bashResult.behavior).toBe('allow');
        expect(editResult.behavior).toBe('allow');
    });

    it('returns negative permission results for denied decisions', async () => {
        const { session, permissionHandler, getState } = createStubSession();
        const handler = new PermissionHandler(session);

        const denied = callTool(handler, 'Write', 'default', {
            input: { file_path: '/tmp/file', content: 'x' },
            toolUseID: 'tool-call-denied',
        });
        await permissionHandler({ id: 'tool-call-denied', approved: false, decision: 'denied', reason: 'no' });

        await expect(denied).resolves.toMatchObject({ behavior: 'deny' });
        expect(handler.isAborted('tool-call-denied')).toBe(true);
        expect(getState().completedRequests?.['tool-call-denied']).toMatchObject({
            status: 'denied',
            decision: 'denied',
            reason: 'no',
        });
    });
});
