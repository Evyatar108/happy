import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, writeFile } from "fs/promises";
import os from "os";
import path from "path";

const {
    redisConstructorMock,
    createAdapterMock,
    adapterFactoryMock,
    logMock,
    serverConstructorMock,
    createEventRouterMock,
    buildMachineActivityEphemeralMock
} = vi.hoisted(() => ({
    redisConstructorMock: vi.fn(),
    createAdapterMock: vi.fn(),
    adapterFactoryMock: vi.fn(),
    logMock: vi.fn(),
    serverConstructorMock: vi.fn(),
    createEventRouterMock: vi.fn(),
    buildMachineActivityEphemeralMock: vi.fn()
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

vi.mock("socket.io", () => ({
    Server: serverConstructorMock
}));

vi.mock("@/app/events/eventRouter", () => ({
    buildMachineActivityEphemeral: buildMachineActivityEphemeralMock,
    createEventRouter: createEventRouterMock
}));

import { configureRedisStreamsAdapter, createSocketAuthMiddleware, startSocket } from "./socket";
import type { ReplayResult, UpdatePayload } from "@/app/events/eventRouter";

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

function fakeSocket(headers: Record<string, string> = {}, auth: Record<string, unknown> = {}) {
    return {
        handshake: { headers, auth },
        data: {} as Record<string, unknown>,
    };
}

function createFakeIoForStartSocket() {
    const namespaceAdapter = { onRawMessage: vi.fn() };
    return {
        adapter: vi.fn(),
        close: vi.fn(async () => undefined),
        of: vi.fn(() => ({ adapter: namespaceAdapter })),
        on: vi.fn(),
        use: vi.fn(),
        to: vi.fn(() => ({ emit: vi.fn() })),
    };
}

function createFakeConnectedSocket(auth: Record<string, unknown> = {}) {
    return {
        id: "socket-1",
        data: {
            userId: "user-1",
            clientType: "user-scoped",
            happyClient: "test-client/1.0.0",
        },
        handshake: {
            auth,
            headers: {},
        },
        emit: vi.fn(),
        join: vi.fn(),
        leave: vi.fn(),
        on: vi.fn(),
        broadcast: { to: vi.fn(() => ({ emit: vi.fn() })) },
    };
}

function createFakeEventRouter() {
    return {
        addConnection: vi.fn(),
        removeConnection: vi.fn(),
        getReplayForConnection: vi.fn<(lastSeenSeq: number, connection: unknown) => ReplayResult>(() => ({ events: [], overflow: false, currentSeq: 0 })),
        emitEphemeral: vi.fn(),
        emitUpdate: vi.fn(),
        close: vi.fn(),
    };
}

function connectWithReplay(auth: Record<string, unknown>, eventRouter = createFakeEventRouter()) {
    const io = createFakeIoForStartSocket();
    serverConstructorMock.mockReturnValueOnce(io);
    createEventRouterMock.mockReturnValueOnce(eventRouter);

    startSocket({ server: {} } as any);

    const connectionHandler = io.on.mock.calls.find(([eventName]) => eventName === "connection")?.[1];
    expect(connectionHandler).toBeTypeOf("function");
    const socket = createFakeConnectedSocket(auth);

    connectionHandler(socket);

    return { eventRouter, socket };
}

describe("createSocketAuthMiddleware — AC-A10 loopback vs tunnel auth", () => {
    let capabilityPath: string;
    const capabilityToken = "loopback-secret-token";

    beforeEach(async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), "happy-socket-auth-"));
        capabilityPath = path.join(dir, "loopback.cap");
        await writeFile(capabilityPath, capabilityToken + "\n", { mode: 0o600 });
    });

    it("loopback: accepts valid X-Loopback-Capability header", async () => {
        const tofuConfig = { localUserId: "daemon-user" };
        const middleware = createSocketAuthMiddleware(tofuConfig, {
            auth: "loopback",
            paths: { loopbackCap: capabilityPath },
        });
        const socket = fakeSocket({ "x-loopback-capability": capabilityToken });
        const next = vi.fn();

        await middleware(socket, next);

        expect(next).toHaveBeenCalledWith();
        expect(socket.data.userId).toBe("daemon-user");
    });

    it("loopback: rejects a tunnel auth header (cross-presented)", async () => {
        const middleware = createSocketAuthMiddleware({ localUserId: "daemon-user" }, {
            auth: "loopback",
            paths: { loopbackCap: capabilityPath },
        });
        const socket = fakeSocket({ "x-tunnel-authorization": "tunnel gateway-token" });
        const next = vi.fn();

        await middleware(socket, next);

        expect(next).toHaveBeenCalledWith(new Error("Unauthorized"));
    });

    it("tunnel: accepts without a Happy tunnel claim", async () => {
        const tunnelConfig = { localUserId: "test-user" };
        const middleware = createSocketAuthMiddleware(tunnelConfig, { auth: "tunnel" });
        const socket = fakeSocket();
        const next = vi.fn();

        await middleware(socket, next);

        expect(next).toHaveBeenCalledWith();
        expect(socket.data.userId).toBe(tunnelConfig.localUserId);
    });

    it("tunnel: ignores a capability header", async () => {
        const tunnelConfig = { localUserId: "test-user" };
        const middleware = createSocketAuthMiddleware(tunnelConfig, { auth: "tunnel" });
        const socket = fakeSocket({ "x-loopback-capability": capabilityToken });
        const next = vi.fn();

        await middleware(socket, next);

        expect(next).toHaveBeenCalledWith();
        expect(socket.data.userId).toBe(tunnelConfig.localUserId);
    });
});

describe("startSocket replay handshake", () => {
    beforeEach(() => {
        delete process.env.REDIS_URL;
        serverConstructorMock.mockReset();
        createEventRouterMock.mockReset();
        buildMachineActivityEphemeralMock.mockReset();
    });

    it("replays user-scoped updates after a finite lastSeenSeq", () => {
        const events: UpdatePayload[] = Array.from({ length: 5 }, (_, index) => ({
            id: `update-${index + 6}`,
            seq: index + 6,
            body: { t: "update-session", sessionId: "s1" },
            createdAt: 1700000000000 + index,
        }));
        const eventRouter = createFakeEventRouter();
        eventRouter.getReplayForConnection.mockReturnValue({ events, overflow: false, currentSeq: 10 });

        const { socket } = connectWithReplay({ lastSeenSeq: 5 }, eventRouter);

        expect(eventRouter.addConnection).toHaveBeenCalledOnce();
        const connection = eventRouter.addConnection.mock.calls[0][1];
        expect(eventRouter.getReplayForConnection).toHaveBeenCalledWith(5, connection);
        expect(socket.emit.mock.calls.filter(([eventName]) => eventName === "update").map(([, event]) => event.seq)).toEqual([6, 7, 8, 9, 10]);
        expect(socket.emit).not.toHaveBeenCalledWith("replay-overflow", expect.anything());
    });

    it("captures replay snapshot before joining rooms (getReplayForConnection before addConnection)", () => {
        const eventRouter = createFakeEventRouter();
        const callOrder: string[] = [];
        eventRouter.getReplayForConnection.mockImplementation(() => {
            callOrder.push("getReplayForConnection");
            return { events: [], overflow: false, currentSeq: 0 };
        });
        eventRouter.addConnection.mockImplementation(() => {
            callOrder.push("addConnection");
        });

        connectWithReplay({ lastSeenSeq: 5 }, eventRouter);

        expect(callOrder).toEqual(["getReplayForConnection", "addConnection"]);
    });

    it("skips replay when lastSeenSeq is missing or non-finite", () => {
        for (const auth of [{}, { lastSeenSeq: "5" }, { lastSeenSeq: Number.POSITIVE_INFINITY }, { lastSeenSeq: Number.NaN }]) {
            const eventRouter = createFakeEventRouter();

            const { socket } = connectWithReplay(auth, eventRouter);

            expect(eventRouter.getReplayForConnection).not.toHaveBeenCalled();
            expect(socket.emit).not.toHaveBeenCalledWith("replay-overflow", expect.anything());
        }
    });

    it("emits replay-overflow once without update events when the replay window is unavailable", () => {
        const eventRouter = createFakeEventRouter();
        eventRouter.getReplayForConnection.mockReturnValue({ events: [], overflow: true, currentSeq: 2000 });

        const { socket } = connectWithReplay({ lastSeenSeq: 5000 }, eventRouter);

        expect(socket.emit).toHaveBeenCalledWith("replay-overflow", { replayOverflow: true, currentSeq: 2000 });
        expect(socket.emit.mock.calls.filter(([eventName]) => eventName === "replay-overflow")).toHaveLength(1);
        expect(socket.emit.mock.calls.filter(([eventName]) => eventName === "update")).toHaveLength(0);
    });
});
