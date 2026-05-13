import { mkdtemp, readFile, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { configureApi, createApi, type TofuHandshakeConfig } from "../api";

function createTofuConfig(): TofuHandshakeConfig {
    return {
        localUserId: "local-user",
        publicUrl: "https://happy-local.devtunnels.ms",
        tofuPublicKeys: {
            ed25519PublicKey: "unused",
            x25519PublicKey: "unused",
        },
    };
}

describe("/v2/me routes", () => {
    const apps: ReturnType<typeof createApi>[] = [];

    afterEach(async () => {
        await Promise.all(apps.splice(0).map(app => app.close()));
    });

    it("serves profile, settings, and machine self-info through tunnel and loopback listener auth", async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), "happy-me-routes-"));
        const profilePath = path.join(dir, "profile.json");
        const accountSettingsPath = path.join(dir, "account-settings.json");
        const loopbackCap = path.join(dir, "loopback-cap.txt");
        await writeFile(profilePath, JSON.stringify({
            githubUserId: 42,
            githubLogin: "octocat",
            name: "Octo Cat",
            avatarUrl: "https://example.test/avatar.png",
            updatedAt: "2026-05-11T12:00:00.000Z",
        }));
        await writeFile(accountSettingsPath, JSON.stringify({ theme: "plain", alerts: true }));
        await writeFile(loopbackCap, "capability-token\n");

        const tofuConfig = createTofuConfig();
        const machineState = {
            machineId: "machine-1",
            hostname: "devbox",
            tunnelPort: 3005,
            loopbackPort: 3305,
            tunnelUrl: "https://machine-1.devtunnels.ms",
            lastSeenAt: "2026-05-11T12:01:00.000Z",
            owner: "octocat",
        };
        const options = { paths: { profile: profilePath, accountSettings: accountSettingsPath, loopbackCap }, machineState: () => machineState };
        const tunnelApp = createApi();
        const loopbackApp = createApi();
        apps.push(tunnelApp, loopbackApp);
        configureApi(tunnelApp, tofuConfig, { ...options, auth: "tunnel" });
        configureApi(loopbackApp, tofuConfig, { ...options, auth: "loopback" });

        const tunnelHeaders = {};
        const loopbackHeaders = { "X-Loopback-Capability": "capability-token" };

        await expect(tunnelApp.inject({ method: "GET", url: "/v2/me/profile", headers: tunnelHeaders }).then(r => r.json())).resolves.toEqual({
            githubUserId: 42,
            githubLogin: "octocat",
            name: "Octo Cat",
            avatarUrl: "https://example.test/avatar.png",
            updatedAt: "2026-05-11T12:00:00.000Z",
        });
        await expect(tunnelApp.inject({ method: "GET", url: "/v2/me/settings", headers: tunnelHeaders }).then(r => r.json())).resolves.toEqual({ theme: "plain", alerts: true });
        await expect(tunnelApp.inject({ method: "GET", url: "/v2/me/machine", headers: tunnelHeaders }).then(r => r.json())).resolves.toEqual(machineState);

        const settingsUpdate = await loopbackApp.inject({
            method: "PUT",
            url: "/v2/me/settings",
            headers: loopbackHeaders,
            payload: { theme: "contrast", fontScale: 1.2 },
        });
        expect(settingsUpdate.statusCode).toBe(200);
        expect(settingsUpdate.json()).toEqual({ theme: "contrast", fontScale: 1.2 });
        await expect(readFile(accountSettingsPath, "utf-8").then(JSON.parse)).resolves.toEqual({ theme: "contrast", fontScale: 1.2 });

        await expect(loopbackApp.inject({ method: "GET", url: "/v2/me/profile", headers: loopbackHeaders }).then(r => r.json())).resolves.toEqual(expect.objectContaining({ githubUserId: 42 }));
        await expect(loopbackApp.inject({ method: "GET", url: "/v2/me/settings", headers: loopbackHeaders }).then(r => r.json())).resolves.toEqual({ theme: "contrast", fontScale: 1.2 });
        await expect(loopbackApp.inject({ method: "GET", url: "/v2/me/machine", headers: loopbackHeaders }).then(r => r.json())).resolves.toEqual(machineState);
    });

    it("rejects PUT /v2/me/settings bodies larger than the route-local limit with 413", async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), "happy-me-routes-"));
        const accountSettingsPath = path.join(dir, "account-settings.json");
        const loopbackCap = path.join(dir, "loopback-cap.txt");
        await writeFile(loopbackCap, "capability-token\n");

        const tofuConfig = createTofuConfig();
        const options = {
            paths: { accountSettings: accountSettingsPath, loopbackCap },
            machineState: () => ({
                machineId: "machine-1",
                hostname: "devbox",
                tunnelPort: 3005,
                loopbackPort: 3305,
                tunnelUrl: "https://machine-1.devtunnels.ms",
                lastSeenAt: "2026-05-11T12:01:00.000Z",
                owner: "octocat",
            }),
        };
        const tunnelApp = createApi();
        apps.push(tunnelApp);
        configureApi(tunnelApp, tofuConfig, { ...options, auth: "tunnel" });

        const oversized = { blob: "x".repeat(5 * 1024 * 1024) };
        const response = await tunnelApp.inject({
            method: "PUT",
            url: "/v2/me/settings",
            headers: { "Content-Type": "application/json" },
            payload: JSON.stringify(oversized),
        });
        expect(response.statusCode).toBe(413);
    });

    it("keeps loopback capability enforcement separate from tunnel auth", async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), "happy-me-routes-"));
        const loopbackCap = path.join(dir, "loopback-cap.txt");
        await writeFile(path.join(dir, "profile.json"), JSON.stringify({
            githubUserId: 42,
            githubLogin: "octocat",
            name: null,
            avatarUrl: null,
            updatedAt: "2026-05-11T12:00:00.000Z",
        }));
        await writeFile(loopbackCap, "capability-token\n");

        const tofuConfig = createTofuConfig();
        const options = {
            paths: { profile: path.join(dir, "profile.json"), accountSettings: path.join(dir, "account-settings.json"), loopbackCap },
            machineState: () => ({
                machineId: "machine-1",
                hostname: "devbox",
                tunnelPort: 3005,
                loopbackPort: 3305,
                tunnelUrl: "https://machine-1.devtunnels.ms",
                lastSeenAt: 123,
                owner: "octocat",
            }),
        };
        const tunnelApp = createApi();
        const loopbackApp = createApi();
        apps.push(tunnelApp, loopbackApp);
        configureApi(tunnelApp, tofuConfig, { ...options, auth: "tunnel" });
        configureApi(loopbackApp, tofuConfig, { ...options, auth: "loopback" });

        const tunnelResponse = await tunnelApp.inject({
            method: "GET",
            url: "/v2/me/profile",
        });
        expect(tunnelResponse.statusCode).toBe(200);
        expect(tunnelResponse.json()).toEqual(expect.objectContaining({ githubUserId: 42 }));

        const tunnelClaimOnLoopback = await loopbackApp.inject({
            method: "GET",
            url: "/v2/me/profile",
            headers: { "X-Codexu-Authorization": "tunnel obsolete-claim" },
        });
        expect(tunnelClaimOnLoopback.statusCode).toBe(401);
        expect(tunnelClaimOnLoopback.json()).toEqual({ error: "invalid_loopback_capability" });
    });
});
