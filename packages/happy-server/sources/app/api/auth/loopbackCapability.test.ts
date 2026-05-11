import fastify from "fastify";
import { mkdtemp, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyLoopbackCapability } from "./loopbackCapability";

describe("verifyLoopbackCapability", () => {
    let app: ReturnType<typeof fastify>;
    let capabilityPath: string;

    beforeEach(async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), "happy-loopback-cap-"));
        capabilityPath = path.join(dir, "loopback-cap.txt");
        await writeFile(capabilityPath, "secret-token\n", { mode: 0o600 });
        app = fastify({ logger: false });
        app.decorate("verifyLoopbackCapability", verifyLoopbackCapability({ loopbackCap: capabilityPath }));
        app.get("/loopback", { preHandler: app.verifyLoopbackCapability }, async () => ({ ok: true }));
    });

    afterEach(async () => {
        await app.close();
    });

    it("accepts a valid X-Loopback-Capability header matching the file contents", async () => {
        const response = await app.inject({
            method: "GET",
            url: "/loopback",
            headers: { "X-Loopback-Capability": "secret-token" },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ ok: true });
    });

    it("rejects invalid or missing X-Loopback-Capability headers", async () => {
        const missing = await app.inject({ method: "GET", url: "/loopback" });
        const invalid = await app.inject({
            method: "GET",
            url: "/loopback",
            headers: { "X-Loopback-Capability": "wrong-token" },
        });

        expect(missing.statusCode).toBe(401);
        expect(missing.json()).toEqual({ error: "invalid_loopback_capability" });
        expect(invalid.statusCode).toBe(401);
        expect(invalid.json()).toEqual({ error: "invalid_loopback_capability" });
    });
});

