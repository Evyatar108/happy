import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { z } from "zod";
import type { TofuHandshakeConfig } from "../api";

ed.hashes.sha512 = (message: Uint8Array) => sha512(message);

export const TunnelClaimSchema = z.object({
    sub: z.string(),
    iat: z.number(),
    accountId: z.number().optional(),
}).passthrough();

export type TunnelClaim = z.infer<typeof TunnelClaimSchema>;

export type TunnelClaimResult =
    | { ok: true; payload: TunnelClaim }
    | { ok: false; reason: "missing_tunnel_authorization" | "invalid_tunnel_claim" | "tunnel_claim_expired" | "tunnel_verification_unavailable" };

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
    if (Math.floor(Date.now() / 1000) - claim.iat > 86400) {
        return { ok: false, reason: "tunnel_claim_expired" };
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
