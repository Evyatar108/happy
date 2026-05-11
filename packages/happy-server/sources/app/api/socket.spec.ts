import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
    redisConstructorMock,
    createAdapterMock,
    adapterFactoryMock,
    logMock
} = vi.hoisted(() => ({
    redisConstructorMock: vi.fn(),
    createAdapterMock: vi.fn(),
    adapterFactoryMock: vi.fn(),
    logMock: vi.fn()
}));

vi.mock("ioredis", () => ({
    Redis: redisConstructorMock
}));

vi.mock("@socket.io/redis-streams-adapter", () => ({
    createAdapter: createAdapterMock
}));

vi.mock("@/utils/log", () => ({
    log: logMock
}));

import { configureRedisStreamsAdapter } from "./socket";

function createFakeIo() {
    const namespaceAdapter = {
        onRawMessage: vi.fn()
    };
    const io = {
        adapter: vi.fn(),
        of: vi.fn(() => ({ adapter: namespaceAdapter }))
    };
    return { io, namespaceAdapter };
}

describe("configureRedisStreamsAdapter", () => {
    const originalRedisUrl = process.env.REDIS_URL;

    beforeEach(() => {
        delete process.env.REDIS_URL;
        redisConstructorMock.mockClear();
        redisConstructorMock.mockImplementation(() => ({
            xinfo: vi.fn(async () => ["last-generated-id", "1700000000000-0"])
        }));
        createAdapterMock.mockClear();
        createAdapterMock.mockReturnValue(adapterFactoryMock);
        adapterFactoryMock.mockClear();
        logMock.mockClear();
    });

    afterEach(() => {
        if (originalRedisUrl === undefined) {
            delete process.env.REDIS_URL;
        } else {
            process.env.REDIS_URL = originalRedisUrl;
        }
    });

    it("skips Redis entirely for embedded mode when REDIS_URL is absent", () => {
        const { io } = createFakeIo();

        const client = configureRedisStreamsAdapter(io as any);

        expect(client).toBeUndefined();
        expect(redisConstructorMock).not.toHaveBeenCalled();
        expect(createAdapterMock).not.toHaveBeenCalled();
        expect(io.adapter).not.toHaveBeenCalled();
        expect(logMock).not.toHaveBeenCalled();
    });

    it("attaches the Redis streams adapter when REDIS_URL is set", () => {
        process.env.REDIS_URL = "redis://127.0.0.1:6379";
        const { io, namespaceAdapter } = createFakeIo();
        const originalOnRawMessage = namespaceAdapter.onRawMessage;

        const client = configureRedisStreamsAdapter(io as any);

        expect(client).toBe(redisConstructorMock.mock.results[0].value);
        expect(redisConstructorMock).toHaveBeenCalledWith("redis://127.0.0.1:6379");
        expect(createAdapterMock).toHaveBeenCalledWith(client, { maxLen: 200000, readCount: 2000 });
        expect(io.adapter).toHaveBeenCalledWith(adapterFactoryMock);
        expect(logMock).toHaveBeenCalledWith({ module: "websocket" }, "Redis streams adapter enabled for multi-process support");
        expect(namespaceAdapter.onRawMessage).not.toBe(originalOnRawMessage);

        namespaceAdapter.onRawMessage({ id: "message" }, "1700000000000-0");
        expect(originalOnRawMessage).toHaveBeenCalledWith({ id: "message" }, "1700000000000-0");
    });
});
