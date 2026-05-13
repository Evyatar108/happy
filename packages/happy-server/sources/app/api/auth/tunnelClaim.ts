import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { z } from "zod";
import type { TofuHandshakeConfig } from "../api";

ed.hashes.sha512 = (message: Uint8Array) => sha512(message);

export const TunnelClaimSchema = z.object({
    sub: z.string(),
    iat: z.number(),
    exp: z.number().optional(),
    jti: z.string().optional(),
    accountId: z.number().optional(),
}).passthrough();

export type TunnelClaim = z.infer<typeof TunnelClaimSchema>;

export type TunnelClaimResult =
    | { ok: true; payload: TunnelClaim }
    | { ok: false; reason: "missing_tunnel_authorization" | "invalid_tunnel_claim" | "tunnel_claim_expired" | "tunnel_claim_replayed" | "tunnel_verification_unavailable" };

const MAX_CLAIM_LIFETIME_SECONDS = 3600;
const MAX_SEEN_JTI_ENTRIES = 100_000;
const PRUNE_THRESHOLD = MAX_SEEN_JTI_ENTRIES / 2;

const seenJti = new Map<string, number>();

function pruneSeenJti(nowSeconds: number): void {
    for (const [jti, expiry] of seenJti) {
        if (expiry <= nowSeconds) {
            seenJti.delete(jti);
        }
    }
}

function evictOldestSeenJti(): void {
    while (seenJti.size >= MAX_SEEN_JTI_ENTRIES) {
        const oldest = seenJti.keys().next();
        if (oldest.done) {
            return;
        }
        seenJti.delete(oldest.value);
    }
}

export function __resetTunnelClaimReplayCacheForTests(): void {
    seenJti.clear();
}

export const __TUNNEL_CLAIM_TESTING__ = {
    MAX_CLAIM_LIFETIME_SECONDS,
    MAX_SEEN_JTI_ENTRIES,
    seenJti,
    evictOldestSeenJti,
};

export async function encodeTunnelClaim(payload: unknown, ed25519SecretKey: Uint8Array): Promise<string> {
    const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = await ed.signAsync(Buffer.from(payloadEncoded), ed25519SecretKey);
    const envelope = { p: payloadEncoded, s: Buffer.from(signature).toString("hex") };
    return Buffer.from(JSON.stringify(envelope)).toString("base64url");
}

async function verifyHappyEnvelope(encoded: string, tofuConfig: TofuHandshakeConfig): Promise<TunnelClaimResult> {
    let envelope: unknown;
    try {
        envelope = JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8"));
    } catch {
        return { ok: false, reason: "invalid_tunnel_claim" };
    }
    if (!envelope || typeof envelope !== "object") {
        return { ok: false, reason: "invalid_tunnel_claim" };
    }
    const { p: payloadEncoded, s: signatureHex } = envelope as Record<string, unknown>;
    if (typeof payloadEncoded !== "string" || typeof signatureHex !== "string") {
        return { ok: false, reason: "invalid_tunnel_claim" };
    }
    const ed25519PublicKeyBase64 = tofuConfig.tofuPublicKeys?.ed25519PublicKey;
    if (!ed25519PublicKeyBase64) {
        return { ok: false, reason: "tunnel_verification_unavailable" };
    }

    let signatureValid = false;
    try {
        const payloadBytes = Buffer.from(payloadEncoded, "base64url");
        const payloadEncodedBytes = Buffer.from(payloadEncoded);
        const signatureBytes = Buffer.from(signatureHex, "hex");
        const publicKeyBytes = Buffer.from(ed25519PublicKeyBase64, "base64");
        signatureValid = await ed.verifyAsync(signatureBytes, payloadBytes, publicKeyBytes)
            || await ed.verifyAsync(signatureBytes, payloadEncodedBytes, publicKeyBytes);
    } catch {
        return { ok: false, reason: "invalid_tunnel_claim" };
    }
    if (!signatureValid) {
        return { ok: false, reason: "invalid_tunnel_claim" };
    }

    let claim: TunnelClaim;
    try {
        claim = TunnelClaimSchema.parse(JSON.parse(Buffer.from(payloadEncoded, "base64url").toString("utf-8")));
    } catch {
        return { ok: false, reason: "invalid_tunnel_claim" };
    }
    if (claim.sub !== tofuConfig.localUserId) {
        return { ok: false, reason: "invalid_tunnel_claim" };
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (typeof claim.exp === "number") {
        if (claim.exp - claim.iat > MAX_CLAIM_LIFETIME_SECONDS) {
            return { ok: false, reason: "invalid_tunnel_claim" };
        }
        if (nowSeconds > claim.exp) {
            return { ok: false, reason: "tunnel_claim_expired" };
        }
    } else if (nowSeconds - claim.iat > 86400) {
        return { ok: false, reason: "tunnel_claim_expired" };
    }
    if (typeof claim.jti === "string" && claim.jti.length > 0) {
        if (seenJti.size > PRUNE_THRESHOLD) {
            pruneSeenJti(nowSeconds);
        }
        const existing = seenJti.get(claim.jti);
        if (existing !== undefined && existing > nowSeconds) {
            return { ok: false, reason: "tunnel_claim_replayed" };
        }
        if (existing !== undefined) {
            seenJti.delete(claim.jti);
        }
        const ttlBase = typeof claim.exp === "number" ? claim.exp : claim.iat + MAX_CLAIM_LIFETIME_SECONDS;
        const expiry = ttlBase > nowSeconds ? ttlBase : nowSeconds + 1;
        if (seenJti.size >= MAX_SEEN_JTI_ENTRIES) {
            evictOldestSeenJti();
        }
        seenJti.set(claim.jti, expiry);
    }
    return { ok: true, payload: claim };
}

export async function verifyTunnelClaim(
    authHeader: string | undefined,
    tofuConfig: TofuHandshakeConfig
): Promise<TunnelClaimResult> {
    if (!authHeader || !authHeader.startsWith("tunnel ")) {
        return { ok: false, reason: "missing_tunnel_authorization" };
    }

    const encoded = authHeader.slice("tunnel ".length);
    // Only the signed Happy envelope is accepted. The Dev Tunnels connect-JWT
    // fallback was disabled in Sprint A: real Dev Tunnels connect JWTs do not
    // carry GitHub identity (per the US-001 spike), and decoding the payload
    // without verifying the ES256 signature against the Dev Tunnels JWKS would
    // accept forged tokens with caller-controlled identity. A JWKS-backed
    // verification path is deferred until after the B+C+D cutover.
    return verifyHappyEnvelope(encoded, tofuConfig);
}
