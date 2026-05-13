import * as ed from "@noble/ed25519";
import { mkdtemp, readFile, readdir } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureApi, createApi, type TofuHandshakeConfig } from "../api";
import { verifyTunnelClaim } from "../auth/tunnelClaim";

async function createTofuConfig(): Promise<TofuHandshakeConfig> {
    const secretKey = ed.utils.randomSecretKey();
    const publicKey = await ed.getPublicKeyAsync(secretKey);
    return {
        localUserId: "local-user",
        publicUrl: "https://happy-local.devtunnels.ms",
        tofuPublicKeys: {
            ed25519PublicKey: Buffer.from(publicKey).toString("base64"),
            x25519PublicKey: "unused",
        },
        ed25519SecretKey: secretKey,
    };
}

function jsonResponse(body: unknown) {
    return {
        ok: true,
        json: async () => body,
    };
}

describe("pairRoutes", () => {
    const originalGithubClientId = process.env.GITHUB_CLIENT_ID;
    const originalExpectedOwner = process.env.HAPPY_TUNNEL_GITHUB_OWNER;
    const apps: ReturnType<typeof createApi>[] = [];

    beforeEach(() => {
        process.env.GITHUB_CLIENT_ID = "github-client-id";
        delete process.env.HAPPY_TUNNEL_GITHUB_OWNER;
    });

    afterEach(async () => {
        process.env.GITHUB_CLIENT_ID = originalGithubClientId;
        process.env.HAPPY_TUNNEL_GITHUB_OWNER = originalExpectedOwner;
        vi.unstubAllGlobals();
        await Promise.all(apps.splice(0).map(app => app.close()));
    });

    it("issues a /pair/status tunnel claim with accountId and writes profile.json atomically", async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), "happy-pair-profile-"));
        const profilePath = path.join(dir, "profile.json");
        const tofuConfig = await createTofuConfig();
        const app = createApi();
        apps.push(app);
        configureApi(app, tofuConfig, { paths: { profile: profilePath } });
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse({ access_token: "github-token" }))
            .mockResolvedValueOnce(jsonResponse({ login: "octocat", id: 42, name: "Octo Cat", avatar_url: "https://example.test/avatar.png" }))
            .mockResolvedValueOnce(jsonResponse([]));
        vi.stubGlobal("fetch", fetchMock);

        const response = await app.inject({
            method: "POST",
            url: "/pair/status",
            payload: { device_code: "device-code" },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        const claim = body.machines[0].tunnelClaim;
        await expect(verifyTunnelClaim(`tunnel ${claim}`, tofuConfig)).resolves.toEqual({
            ok: true,
            payload: expect.objectContaining({ sub: "local-user", accountId: 42 }),
        });
        await expect(readFile(profilePath, "utf-8").then(JSON.parse)).resolves.toEqual({
            githubUserId: 42,
            githubLogin: "octocat",
            name: "Octo Cat",
            avatarUrl: "https://example.test/avatar.png",
            updatedAt: expect.any(String),
        });
        await expect(readdir(dir)).resolves.toEqual(["profile.json"]);
    });

    it("derives accountId from GitHub identity without a Dev Tunnels JWT", async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), "happy-pair-profile-"));
        const tofuConfig = await createTofuConfig();
        const app = createApi();
        apps.push(app);
        configureApi(app, tofuConfig, { paths: { profile: path.join(dir, "profile.json") } });
        vi.stubGlobal("fetch", vi.fn()
            .mockResolvedValueOnce(jsonResponse({ access_token: "github-token" }))
            .mockResolvedValueOnce(jsonResponse({ login: "legacy-client", id: 84, name: null, avatar_url: null }))
            .mockResolvedValueOnce(jsonResponse([])));

        const response = await app.inject({
            method: "POST",
            url: "/pair/status",
            payload: { device_code: "device-code" },
        });

        expect(response.statusCode).toBe(200);
        await expect(verifyTunnelClaim(`tunnel ${response.json().machines[0].tunnelClaim}`, tofuConfig)).resolves.toEqual({
            ok: true,
            payload: expect.objectContaining({ sub: "local-user", accountId: 84 }),
        });
    });
});
