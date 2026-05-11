import { describe, expect, it, vi } from "vitest";
import { verifyDevTunnelsConnect } from "./devTunnelsClaim";

function jwt(payload: Record<string, unknown>) {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `tunnel ${header}.${body}.signature`;
}

describe("verifyDevTunnelsConnect", () => {
    it("accepts a valid Dev Tunnels JWT and exposes any GitHub identity claims", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-05-11T12:00:00Z"));

        const result = await verifyDevTunnelsConnect(jwt({
            tunnelId: "happy-machine",
            clusterId: "use2",
            scp: "connect",
            iat: 1778500790,
            exp: 1778500810,
            login: "octocat",
            id: 42,
        }));

        expect(result).toEqual({
            ok: true,
            payload: expect.objectContaining({ tunnelId: "happy-machine", clusterId: "use2", scp: "connect" }),
            identity: { login: "octocat", id: 42 },
        });

        vi.useRealTimers();
    });

    it("rejects invalid or missing JWTs", async () => {
        await expect(verifyDevTunnelsConnect(undefined)).resolves.toEqual({
            ok: false,
            reason: "missing_tunnel_authorization",
        });
        await expect(verifyDevTunnelsConnect("tunnel not-a-jwt")).resolves.toEqual({
            ok: false,
            reason: "invalid_dev_tunnels_jwt",
        });
    });
});
