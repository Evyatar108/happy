import { mkdtemp, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { configureApi, createApi, type TofuHandshakeConfig } from "../api";

function createTofuConfig(): TofuHandshakeConfig {
    return {
        localUserId: "local-user",
        publicUrl: "https://58l8c10h-51371.usw2.devtunnels.ms",
        tofuPublicKeys: {
            ed25519PublicKey: "unused",
            x25519PublicKey: "unused",
        },
    };
}

async function writeTestProfile(profilePath: string): Promise<void> {
    await writeFile(profilePath, JSON.stringify({
        githubUserId: 42,
        githubLogin: "octocat",
        name: "Octo Cat",
        avatarUrl: "https://example.test/avatar.png",
        updatedAt: "2026-05-13T00:00:00.000Z",
    }), "utf-8");
}

describe("pairRoutes /pair/complete", () => {
    const apps: ReturnType<typeof createApi>[] = [];

    afterEach(async () => {
        await Promise.all(apps.splice(0).map(app => app.close()));
    });

    it("returns pair metadata without a server-minted tunnel claim", async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), "happy-pair-profile-"));
        const profilePath = path.join(dir, "profile.json");
        await writeTestProfile(profilePath);

        const tofuConfig = createTofuConfig();
        const app = createApi();
        apps.push(app);
        configureApi(app, tofuConfig, { paths: { profile: profilePath } });

        const response = await app.inject({
            method: "POST",
            url: "/pair/complete",
            headers: { "Content-Type": "application/json" },
            body: {},
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.githubLogin).toBe("octocat");
        expect(body.machine.machineId).toBe("local-user");
        expect(body.machine.tunnelUrl).toBe("https://58l8c10h-51371.usw2.devtunnels.ms");
        expect(body.machine).not.toHaveProperty("tunnelClaim");
    });

    it("returns 503 local_profile_unavailable when profile.json is missing", async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), "happy-pair-noprofile-"));
        const tofuConfig = createTofuConfig();
        const app = createApi();
        apps.push(app);
        configureApi(app, tofuConfig, { paths: { profile: path.join(dir, "profile.json") } });

        const response = await app.inject({
            method: "POST",
            url: "/pair/complete",
            headers: { "Content-Type": "application/json" },
            body: {},
        });

        expect(response.statusCode).toBe(503);
        expect(response.json()).toEqual({ error: "local_profile_unavailable" });
    });
});
