import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerKillSessionHandler } from './registerKillSessionHandler';

vi.mock('@/lib', () => ({
    logger: {
        debug: vi.fn(),
    },
}));

describe('registerKillSessionHandler', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let originalSetImmediate: typeof setImmediate;
    const capturedSetImmediateCalls: Array<() => void> = [];

    beforeEach(() => {
        capturedSetImmediateCalls.length = 0;
        originalSetImmediate = globalThis.setImmediate;
        // Replace setImmediate so tests can assert it was scheduled without firing process.exit
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).setImmediate = (fn: () => void) => {
            capturedSetImmediateCalls.push(fn);
            return 0 as unknown as NodeJS.Immediate;
        };
    });

    afterEach(() => {
        globalThis.setImmediate = originalSetImmediate;
    });

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

    it('resolves with success before process.exit is called', async () => {
        const cleanup = vi.fn(() => Promise.resolve());
        let handler!: () => Promise<{ success: boolean; message: string }>;
        const rpcHandlerManager = {
            registerHandler: vi.fn((_name: string, registered: typeof handler) => {
                handler = registered;
            }),
        };

        registerKillSessionHandler(rpcHandlerManager as any, cleanup);

        const result = await handler();

        expect(result).toEqual({ success: true, message: 'Killing happy-cli process' });
        // process.exit was NOT called synchronously — only scheduled via setImmediate
        expect(capturedSetImmediateCalls).toHaveLength(1);
    });
});
