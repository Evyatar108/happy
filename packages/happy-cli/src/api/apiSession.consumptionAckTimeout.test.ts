import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('socket.io-client', () => ({
    io: vi.fn(() => ({
        on: vi.fn(),
        off: vi.fn(),
        emit: vi.fn(),
        connect: vi.fn(),
        close: vi.fn(),
        volatile: { emit: vi.fn() },
        emitWithAck: vi.fn(async () => ({ result: 'error' })),
        connected: false,
    }))
}));

vi.mock('axios', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn()
    }
}));

vi.mock('@/configuration', () => ({
    configuration: {
        serverUrl: 'https://server.test'
    }
}));

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
        debugLargeJson: vi.fn()
    }
}));

vi.mock('@/api/rpc/RpcHandlerManager', () => ({
    RpcHandlerManager: class {
        onSocketConnect = vi.fn();
        onSocketDisconnect = vi.fn();
        handleRequest = vi.fn(async () => '');
    }
}));

vi.mock('@/modules/common/registerCommonHandlers', () => ({
    registerCommonHandlers: vi.fn()
}));

vi.mock('@/utils/time', () => ({
    backoff: vi.fn(),
    delay: vi.fn(async () => undefined)
}));

async function importWithEnv(value: string | undefined): Promise<{ MessageConsumptionTimeoutError: typeof import('./apiSession').MessageConsumptionTimeoutError }> {
    vi.resetModules();
    if (value === undefined) {
        delete process.env.HAPPY_CONSUMPTION_ACK_TIMEOUT_MS;
    } else {
        process.env.HAPPY_CONSUMPTION_ACK_TIMEOUT_MS = value;
    }
    return await import('./apiSession');
}

function extractTimeoutMs(error: Error): number {
    const match = /timed out after (\d+)ms/.exec(error.message);
    if (!match) {
        throw new Error(`unexpected error message format: ${error.message}`);
    }
    return Number(match[1]);
}

describe('CONSUMPTION_ACK_TIMEOUT_MS env var validation', () => {
    const originalValue = process.env.HAPPY_CONSUMPTION_ACK_TIMEOUT_MS;

    beforeEach(() => {
        delete process.env.HAPPY_CONSUMPTION_ACK_TIMEOUT_MS;
    });

    afterEach(() => {
        if (originalValue === undefined) {
            delete process.env.HAPPY_CONSUMPTION_ACK_TIMEOUT_MS;
        } else {
            process.env.HAPPY_CONSUMPTION_ACK_TIMEOUT_MS = originalValue;
        }
        vi.resetModules();
    });

    it('falls back to 60_000 when env var is unset', async () => {
        const { MessageConsumptionTimeoutError } = await importWithEnv(undefined);
        const error = new MessageConsumptionTimeoutError('msg-1');
        expect(extractTimeoutMs(error)).toBe(60_000);
    });

    it('falls back to 60_000 when env var is non-numeric (\'abc\')', async () => {
        const { MessageConsumptionTimeoutError } = await importWithEnv('abc');
        const error = new MessageConsumptionTimeoutError('msg-2');
        expect(extractTimeoutMs(error)).toBe(60_000);
    });

    it('falls back to 60_000 when env var is \'0\'', async () => {
        const { MessageConsumptionTimeoutError } = await importWithEnv('0');
        const error = new MessageConsumptionTimeoutError('msg-3');
        expect(extractTimeoutMs(error)).toBe(60_000);
    });

    it('falls back to 60_000 when env var is negative', async () => {
        const { MessageConsumptionTimeoutError } = await importWithEnv('-1500');
        const error = new MessageConsumptionTimeoutError('msg-4');
        expect(extractTimeoutMs(error)).toBe(60_000);
    });

    it('falls back to 60_000 when env var is empty string', async () => {
        const { MessageConsumptionTimeoutError } = await importWithEnv('');
        const error = new MessageConsumptionTimeoutError('msg-5');
        expect(extractTimeoutMs(error)).toBe(60_000);
    });

    it('uses parsed value when env var is a positive integer', async () => {
        const { MessageConsumptionTimeoutError } = await importWithEnv('12345');
        const error = new MessageConsumptionTimeoutError('msg-6');
        expect(extractTimeoutMs(error)).toBe(12345);
    });
});
