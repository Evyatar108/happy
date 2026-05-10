import { describe, expect, it, vi } from 'vitest';

import { registerKillSessionHandler } from './registerKillSessionHandler';

vi.mock('@/lib', () => ({
    logger: {
        debug: vi.fn(),
    },
}));

describe('registerKillSessionHandler', () => {
    it('returns success only after cleanup completes', async () => {
        let resolveCleanup!: () => void;
        const cleanup = vi.fn(() => new Promise<void>((resolve) => {
            resolveCleanup = resolve;
        }));
        let handler!: () => Promise<{ success: boolean; message: string }>;
        const rpcHandlerManager = {
            registerHandler: vi.fn((_name: string, registered: typeof handler) => {
                handler = registered;
            }),
        };

        registerKillSessionHandler(rpcHandlerManager as any, cleanup);

        let settled = false;
        const resultPromise = handler().then((result) => {
            settled = true;
            return result;
        });

        await Promise.resolve();
        expect(cleanup).toHaveBeenCalledTimes(1);
        expect(settled).toBe(false);

        resolveCleanup();
        await expect(resultPromise).resolves.toEqual({
            success: true,
            message: 'Killing happy-cli process',
        });
        expect(settled).toBe(true);
    });
});
