import * as ed from "@noble/ed25519";
import { mkdtemp, writeFile } from "fs/promises";
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
        publicUrl: "https://58l8c10h-51371.usw2.devtunnels.ms",
        tofuPublicKeys: {
            ed25519PublicKey: Buffer.from(publicKey).toString("base64"),
            x25519PublicKey: "unused",
        },
        ed25519SecretKey: secretKey,
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
        vi.unstubAllGlobals();
        await Promise.all(apps.splice(0).map(app => app.close()));
    });

    it("mints a signed tunnel claim with accountId from local profile.json", async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), "happy-pair-profile-"));
        const profilePath = path.join(dir, "profile.json");
        await writeTestProfile(profilePath);

        const tofuConfig = await createTofuConfig();
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
        const verified = await verifyTunnelClaim(`tunnel ${body.machine.tunnelClaim}`, tofuConfig);
        expect(verified.ok).toBe(true);
        if (verified.ok) {
            expect(verified.payload.sub).toBe("local-user");
            expect(verified.payload.accountId).toBe(42);
        }
    });

    it("returns 503 local_profile_unavailable when profile.json is missing", async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), "happy-pair-noprofile-"));
        const tofuConfig = await createTofuConfig();
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
