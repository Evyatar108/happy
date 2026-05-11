import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import * as ed from "@noble/ed25519";

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

import { configureRedisStreamsAdapter, createSocketAuthMiddleware } from "./socket";
import { encodeTunnelClaim } from "./auth/tunnelClaim";

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

async function createTunnelConfig() {
    const secretKey = ed.utils.randomSecretKey();
    const publicKey = await ed.getPublicKeyAsync(secretKey);
    return {
        localUserId: "test-user",
        tofuPublicKeys: {
            ed25519PublicKey: Buffer.from(publicKey).toString("base64"),
            x25519PublicKey: "unused",
        },
        ed25519SecretKey: secretKey,
    };
}

function fakeSocket(headers: Record<string, string> = {}, auth: Record<string, unknown> = {}) {
    return {
        handshake: { headers, auth },
        data: {} as Record<string, unknown>,
    };
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

    it("loopback: rejects a tunnel-claim header (cross-presented)", async () => {
        const tunnelConfig = await createTunnelConfig();
        const claim = await encodeTunnelClaim(
            { sub: tunnelConfig.localUserId, iat: Math.floor(Date.now() / 1000) },
            tunnelConfig.ed25519SecretKey
        );
        const middleware = createSocketAuthMiddleware({ localUserId: "daemon-user" }, {
            auth: "loopback",
            paths: { loopbackCap: capabilityPath },
        });
        const socket = fakeSocket({ "x-tunnel-authorization": `tunnel ${claim}` });
        const next = vi.fn();

        await middleware(socket, next);

        expect(next).toHaveBeenCalledWith(new Error("Unauthorized"));
    });

    it("tunnel: accepts a valid tunnel claim", async () => {
        const tunnelConfig = await createTunnelConfig();
        const claim = await encodeTunnelClaim(
            { sub: tunnelConfig.localUserId, iat: Math.floor(Date.now() / 1000) },
            tunnelConfig.ed25519SecretKey
        );
        const middleware = createSocketAuthMiddleware(tunnelConfig, { auth: "tunnel" });
        const socket = fakeSocket({ "x-tunnel-authorization": `tunnel ${claim}` });
        const next = vi.fn();

        await middleware(socket, next);

        expect(next).toHaveBeenCalledWith();
        expect(socket.data.userId).toBe(tunnelConfig.localUserId);
    });

    it("tunnel: rejects a capability header (cross-presented)", async () => {
        const tunnelConfig = await createTunnelConfig();
        const middleware = createSocketAuthMiddleware(tunnelConfig, { auth: "tunnel" });
        const socket = fakeSocket({ "x-loopback-capability": capabilityToken });
        const next = vi.fn();

        await middleware(socket, next);

        expect(next).toHaveBeenCalledWith(new Error("Unauthorized"));
    });
});
