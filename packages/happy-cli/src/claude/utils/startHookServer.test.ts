import { afterEach, describe, expect, it, vi } from 'vitest';
import { startHookServer, type HookServer } from './startHookServer';

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
    },
}));

let server: HookServer | null = null;

async function postHook(port: number, body: Record<string, unknown>): Promise<Response> {
    return fetch(`http://127.0.0.1:${port}/hook/session-start`, {
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

        const response = await postHook(server.port, {
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

        const response = await postHook(server.port, {
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
});
