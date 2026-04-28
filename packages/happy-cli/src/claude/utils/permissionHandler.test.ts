import { describe, it, expect, vi } from 'vitest';
import { PermissionHandler } from './permissionHandler';
import type { Session } from '../session';
import type { EnhancedMode, PermissionMode } from '../loop';

vi.mock('@/lib', () => ({
    logger: {
        debug: vi.fn(),
    },
}));

function createStubSession(): Session {
    return {
        client: {
            rpcHandlerManager: {
                registerHandler: vi.fn(),
            },
            updateAgentState: vi.fn(),
            sessionId: 'test-session',
            getMetadata: vi.fn().mockReturnValue({}),
        },
        api: {
            push: () => ({
                sendSessionNotification: vi.fn(),
            }),
        },
    } as unknown as Session;
}

function callTool(handler: PermissionHandler, toolName: string, mode: PermissionMode) {
    const enhancedMode: EnhancedMode = { permissionMode: mode };
    return handler.handleToolCall(
        toolName,
        { command: 'rm -rf /' },
        enhancedMode,
        { signal: new AbortController().signal, toolUseID: 'tool-call-1' },
    );
}

describe('PermissionHandler mode mapping', () => {
    it('auto-allows tool calls when mode is yolo (Codex alias for bypassPermissions)', async () => {
        const handler = new PermissionHandler(createStubSession());
        handler.handleModeChange('yolo');

        const result = await callTool(handler, 'Bash', 'yolo');

        expect(result.behavior).toBe('allow');
    });

    it('auto-allows tool calls when mode is bypassPermissions (native Claude)', async () => {
        const handler = new PermissionHandler(createStubSession());
        handler.handleModeChange('bypassPermissions');

        const result = await callTool(handler, 'Bash', 'bypassPermissions');

        expect(result.behavior).toBe('allow');
    });

    it('does not auto-allow when mode is safe-yolo (maps to default → ask)', async () => {
        const handler = new PermissionHandler(createStubSession());
        handler.handleModeChange('safe-yolo');

        const promise = callTool(handler, 'Bash', 'safe-yolo');
        const settled = await Promise.race([
            promise.then(() => 'resolved'),
            new Promise<string>((r) => setTimeout(() => r('pending'), 20)),
        ]);

        expect(settled).toBe('pending');
    });

    it('does not auto-allow when mode is read-only (maps to default → ask)', async () => {
        const handler = new PermissionHandler(createStubSession());
        handler.handleModeChange('read-only');

        const promise = callTool(handler, 'Bash', 'read-only');
        const settled = await Promise.race([
            promise.then(() => 'resolved'),
            new Promise<string>((r) => setTimeout(() => r('pending'), 20)),
        ]);

        expect(settled).toBe('pending');
    });

    it('auto-allows edits when mode is acceptEdits', async () => {
        const handler = new PermissionHandler(createStubSession());
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
