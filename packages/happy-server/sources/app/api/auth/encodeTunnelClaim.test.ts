import * as ed from "@noble/ed25519";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { __TUNNEL_CLAIM_TESTING__, __resetTunnelClaimReplayCacheForTests, encodeTunnelClaim, verifyTunnelClaim } from "./tunnelClaim";

function devTunnelsJwt(payload: Record<string, unknown>) {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `tunnel ${header}.${body}.signature`;
}

async function createConfig() {
    const secretKey = ed.utils.randomSecretKey();
    const publicKey = await ed.getPublicKeyAsync(secretKey);
    return {
        localUserId: "local-user",
        tofuPublicKeys: {
            ed25519PublicKey: Buffer.from(publicKey).toString("base64"),
            x25519PublicKey: "unused",
        },
        ed25519SecretKey: secretKey,
    };
}

describe("encodeTunnelClaim", () => {
    beforeEach(() => {
        __resetTunnelClaimReplayCacheForTests();
    });

    it("round-trips a claim with accountId", async () => {
        const config = await createConfig();
        const claim = await encodeTunnelClaim({ sub: "local-user", iat: Math.floor(Date.now() / 1000), accountId: 42 }, config.ed25519SecretKey);

        await expect(verifyTunnelClaim(`tunnel ${claim}`, config)).resolves.toEqual({
            ok: true,
            payload: { sub: "local-user", iat: expect.any(Number), accountId: 42 },
        });
    });

    it("round-trips a legacy claim without accountId", async () => {
        const config = await createConfig();
        const claim = await encodeTunnelClaim({ sub: "local-user", iat: Math.floor(Date.now() / 1000) }, config.ed25519SecretKey);

        await expect(verifyTunnelClaim(`tunnel ${claim}`, config)).resolves.toEqual({
            ok: true,
            payload: { sub: "local-user", iat: expect.any(Number) },
        });
    });

    it("round-trips a claim with exp and jti", async () => {
        const config = await createConfig();
        const issuedAt = Math.floor(Date.now() / 1000);
        const claim = await encodeTunnelClaim(
            { sub: "local-user", iat: issuedAt, exp: issuedAt + 3600, jti: "test-jti-1", accountId: 42 },
            config.ed25519SecretKey,
        );

        await expect(verifyTunnelClaim(`tunnel ${claim}`, config)).resolves.toEqual({
            ok: true,
            payload: { sub: "local-user", iat: issuedAt, exp: issuedAt + 3600, jti: "test-jti-1", accountId: 42 },
        });
    });

    it("rejects a claim past its exp", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-05-11T12:00:00Z"));
        const config = await createConfig();
        const issuedAt = Math.floor(Date.now() / 1000);
        const claim = await encodeTunnelClaim(
            { sub: "local-user", iat: issuedAt, exp: issuedAt + 60, jti: "exp-test" },
            config.ed25519SecretKey,
        );

        vi.setSystemTime(new Date(Date.now() + 120_000));
        await expect(verifyTunnelClaim(`tunnel ${claim}`, config)).resolves.toEqual({
            ok: false,
            reason: "tunnel_claim_expired",
        });
        vi.useRealTimers();
    });

    it("rejects a replayed claim with the same jti", async () => {
        const config = await createConfig();
        const issuedAt = Math.floor(Date.now() / 1000);
        const claim = await encodeTunnelClaim(
            { sub: "local-user", iat: issuedAt, exp: issuedAt + 3600, jti: "replay-jti" },
            config.ed25519SecretKey,
        );

        await expect(verifyTunnelClaim(`tunnel ${claim}`, config)).resolves.toMatchObject({ ok: true });
        await expect(verifyTunnelClaim(`tunnel ${claim}`, config)).resolves.toEqual({
            ok: false,
            reason: "tunnel_claim_replayed",
        });
    });

    it("rejects a claim whose exp - iat exceeds the max claim lifetime", async () => {
        const config = await createConfig();
        const issuedAt = Math.floor(Date.now() / 1000);
        const claim = await encodeTunnelClaim(
            { sub: "local-user", iat: issuedAt, exp: issuedAt + __TUNNEL_CLAIM_TESTING__.MAX_CLAIM_LIFETIME_SECONDS + 1, jti: "too-long-lifetime" },
            config.ed25519SecretKey,
        );

        await expect(verifyTunnelClaim(`tunnel ${claim}`, config)).resolves.toEqual({
            ok: false,
            reason: "invalid_tunnel_claim",
        });
    });

    it("evicts the oldest jti once the replay cache cap is exceeded", async () => {
        const config = await createConfig();
        const issuedAt = Math.floor(Date.now() / 1000);
        const farFutureExpiry = issuedAt + 3600;

        for (let i = 0; i < __TUNNEL_CLAIM_TESTING__.MAX_SEEN_JTI_ENTRIES; i++) {
            __TUNNEL_CLAIM_TESTING__.seenJti.set(`filler-${i}`, farFutureExpiry);
        }
        expect(__TUNNEL_CLAIM_TESTING__.seenJti.size).toBe(__TUNNEL_CLAIM_TESTING__.MAX_SEEN_JTI_ENTRIES);
        expect(__TUNNEL_CLAIM_TESTING__.seenJti.has("filler-0")).toBe(true);

        const claim = await encodeTunnelClaim(
            { sub: "local-user", iat: issuedAt, exp: farFutureExpiry, jti: "newest-jti" },
            config.ed25519SecretKey,
        );

        await expect(verifyTunnelClaim(`tunnel ${claim}`, config)).resolves.toMatchObject({ ok: true });

        expect(__TUNNEL_CLAIM_TESTING__.seenJti.size).toBeLessThanOrEqual(__TUNNEL_CLAIM_TESTING__.MAX_SEEN_JTI_ENTRIES);
        expect(__TUNNEL_CLAIM_TESTING__.seenJti.has("filler-0")).toBe(false);
        expect(__TUNNEL_CLAIM_TESTING__.seenJti.has("newest-jti")).toBe(true);
    });

    it("rejects a Dev Tunnels JWT regardless of any identity fields it carries", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-05-11T12:00:00Z"));
        const config = await createConfig();

        await expect(verifyTunnelClaim(devTunnelsJwt({
            iat: 1778500790,
            exp: 1778500810,
            login: "octocat",
            id: 42,
        }), config)).resolves.toEqual({
            ok: false,
            reason: "invalid_tunnel_claim",
        });
        vi.useRealTimers();
    });
});
