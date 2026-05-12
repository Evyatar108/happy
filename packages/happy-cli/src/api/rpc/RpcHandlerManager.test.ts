import { describe, expect, it, vi } from 'vitest';

import { RpcHandlerManager } from './RpcHandlerManager';

describe('RpcHandlerManager', () => {
    it('passes plain params to handlers and returns plain results', async () => {
        const manager = new RpcHandlerManager({ scopePrefix: 'session-1' });
        const handler = vi.fn(async (params: unknown) => ({ echoed: params }));

        manager.registerHandler('echo', handler);

        const params = { value: 'hello' };
        const result = await manager.handleRequest({ method: 'session-1:echo', params });

        expect(handler).toHaveBeenCalledWith(params);
        expect(result).toEqual({ echoed: params });
    });

    it('returns plain error objects', async () => {
        const manager = new RpcHandlerManager({ scopePrefix: 'session-1' });
        manager.registerHandler('throws', async () => {
            throw new Error('boom');
        });

        await expect(manager.handleRequest({ method: 'session-1:missing', params: {} }))
            .resolves.toEqual({ error: 'Method not found' });
        await expect(manager.handleRequest({ method: 'session-1:throws', params: {} }))
            .resolves.toEqual({ error: 'boom' });
    });
});
