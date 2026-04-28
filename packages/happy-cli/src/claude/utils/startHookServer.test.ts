import { afterEach, describe, expect, it, vi } from 'vitest';
import { startHookServer, type HookServer } from './startHookServer';

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
    },
}));

let server: HookServer | null = null;

async function postHook(port: number, path: string, body: Record<string, unknown>): Promise<Response> {
    return fetch(`http://127.0.0.1:${port}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

describe('startHookServer', () => {
    afterEach(() => {
        server?.stop();
        server = null;
    });

    it('dispatches session hooks with a session id', async () => {
        const onSessionHook = vi.fn();
        server = await startHookServer({ onSessionHook });

        const response = await postHook(server.port, '/hook/session-start', {
            hook_event_name: 'SessionStart',
            session_id: 'claude-session-1',
            source: 'startup',
        });

        expect(response.status).toBe(200);
        expect(onSessionHook).toHaveBeenCalledWith('claude-session-1', expect.objectContaining({
            hook_event_name: 'SessionStart',
            source: 'startup',
        }));
    });

    it('dispatches PostCompact hook data separately from session updates', async () => {
        const onSessionHook = vi.fn();
        const onCompactHook = vi.fn();
        server = await startHookServer({ onSessionHook, onCompactHook });

        const response = await postHook(server.port, '/hook/session-start', {
            hook_event_name: 'PostCompact',
            session_id: 'claude-session-2',
            trigger: 'auto',
            compact_summary: 'summary text',
        });

        expect(response.status).toBe(200);
        expect(onCompactHook).toHaveBeenCalledWith(expect.objectContaining({
            hook_event_name: 'PostCompact',
            trigger: 'auto',
            compact_summary: 'summary text',
        }));
        expect(onSessionHook).toHaveBeenCalledWith('claude-session-2', expect.any(Object));
    });

    it('dispatches UserPromptSubmit and Stop hooks to dedicated callbacks', async () => {
        const onSessionHook = vi.fn();
        const onUserPromptSubmitHook = vi.fn();
        const onStopHook = vi.fn();
        server = await startHookServer({ onSessionHook, onUserPromptSubmitHook, onStopHook });

        const submitResponse = await postHook(server.port, '/hook/user-prompt-submit', {
            hook_event_name: 'UserPromptSubmit',
            session_id: 'claude-session-3',
        });
        const stopResponse = await postHook(server.port, '/hook/stop', {
            hook_event_name: 'Stop',
            session_id: 'claude-session-3',
        });

        expect(submitResponse.status).toBe(200);
        expect(stopResponse.status).toBe(200);
        expect(onUserPromptSubmitHook).toHaveBeenCalledWith(expect.objectContaining({
            hook_event_name: 'UserPromptSubmit',
        }));
        expect(onStopHook).toHaveBeenCalledWith(expect.objectContaining({
            hook_event_name: 'Stop',
        }));
        expect(onSessionHook).not.toHaveBeenCalled();
    });
});
