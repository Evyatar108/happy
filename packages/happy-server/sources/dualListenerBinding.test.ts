import { mkdtemp, writeFile } from "fs/promises";
import http from "http";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { configureApi, createApi, type TofuHandshakeConfig } from "./app/api/api";

async function getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = http.createServer();
        server.on("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            if (!address || typeof address === "string") {
                server.close(() => reject(new Error("missing server address")));
                return;
            }
            const port = address.port;
            server.close(() => resolve(port));
        });
    });
}

function createTofuConfig(): TofuHandshakeConfig {
    return {
        localUserId: "machine-1",
        tofuPublicKeys: {
            ed25519PublicKey: "unused",
            x25519PublicKey: "unused",
        },
    };
}

describe("dual-listener network binding", () => {
    const handles: ReturnType<typeof createApi>[] = [];

    afterEach(async () => {
        await Promise.allSettled(handles.splice(0).map(handle => handle.close()));
    });

    it("binds tunnel and loopback listeners with non-crossing auth", async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), "happy-create-app-dual-"));
        const profile = path.join(dir, "profile.json");
        const accountSettings = path.join(dir, "account-settings.json");
        const loopbackCap = path.join(dir, "loopback-cap.txt");
        await writeFile(profile, JSON.stringify({
            githubUserId: 42,
            githubLogin: "octocat",
            name: "Octo Cat",
            avatarUrl: "https://example.test/avatar.png",
            updatedAt: "2026-05-11T12:00:00.000Z",
        }));
        await writeFile(accountSettings, JSON.stringify({ theme: "plain" }));
        await writeFile(loopbackCap, "capability-token\n");

        const tunnelPort = await getFreePort();
        const loopbackPort = await getFreePort();
        const config = createTofuConfig();
        const shared = {
            paths: { profile, accountSettings, loopbackCap },
            machineState: () => ({
                machineId: "machine-1",
                hostname: "devbox",
                tunnelPort,
                loopbackPort,
                tunnelUrl: "https://machine-1.devtunnels.ms",
                lastSeenAt: "2026-05-11T12:00:00.000Z",
                owner: "octocat",
            }),
        };
        const tunnel = createApi();
        const loopback = createApi();
        handles.push(tunnel, loopback);
        configureApi(tunnel, config, { ...shared, auth: "tunnel" });
        configureApi(loopback, config, { ...shared, auth: "loopback" });

        await tunnel.listen({ port: tunnelPort, host: "127.0.0.1" });
        await loopback.listen({ port: loopbackPort, host: "127.0.0.1" });

        const tunnelHeaders = {};
        const loopbackHeaders = { "X-Loopback-Capability": "capability-token" };

        await expect(fetch(`http://127.0.0.1:${tunnelPort}/v2/me/profile`, { headers: tunnelHeaders }).then(async response => ({ status: response.status, body: await response.json() }))).resolves.toEqual({
            status: 200,
            body: expect.objectContaining({ githubUserId: 42, githubLogin: "octocat" }),
        });
        await expect(fetch(`http://127.0.0.1:${loopbackPort}/v2/me/machine`, { headers: loopbackHeaders }).then(async response => ({ status: response.status, body: await response.json() }))).resolves.toEqual({
            status: 200,
            body: expect.objectContaining({ machineId: "machine-1", tunnelPort, loopbackPort }),
        });
        await expect(fetch(`http://127.0.0.1:${loopbackPort}/v2/me/profile`, { headers: tunnelHeaders }).then(response => response.status)).resolves.toBe(401);
        await expect(fetch(`http://127.0.0.1:${tunnelPort}/v2/me/profile`, { headers: loopbackHeaders }).then(response => response.status)).resolves.toBe(200);

        // /v1/* legacy routes must not be mounted on the loopback listener
        await expect(fetch(`http://127.0.0.1:${loopbackPort}/v1/machines`, { headers: loopbackHeaders }).then(response => response.status)).resolves.toBe(404);
    }, 30_000);

    it("errors when a second daemon attempts to bind the same machine ports", async () => {
        const port = await getFreePort();
        const first = createApi();
        const second = createApi();
        handles.push(first, second);

        await first.listen({ port, host: "127.0.0.1" });
        await expect(second.listen({ port, host: "127.0.0.1" })).rejects.toThrow();
    }, 30_000);
});
