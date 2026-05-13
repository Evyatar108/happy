import { z } from "zod";
import nacl from "tweetnacl";
import * as os from "os";
import * as path from "path";
import { randomUUID } from "crypto";
import { type Fastify } from "../types";
import { type TofuHandshakeConfig } from "../api";
import { encodeTunnelClaim } from "../auth/tunnelClaim";

export interface PairRoutePaths {
    profile?: string;
}

function defaultProfilePath(): string {
    return path.join(os.homedir(), ".happy", "profile.json");
}

const ProfileSchema = z.object({
    githubUserId: z.number(),
    githubLogin: z.string(),
    name: z.string().nullable().optional(),
    avatarUrl: z.string().nullable().optional(),
});

type ProfileData = z.infer<typeof ProfileSchema>;

async function readProfile(profilePath: string): Promise<ProfileData | null> {
    try {
        const fs = await import("fs/promises");
        const text = await fs.readFile(profilePath, "utf-8");
        return ProfileSchema.parse(JSON.parse(text));
    } catch {
        return null;
    }
}

/** Build the payload for a signed tunnel claim. Providing `accountId` links the
 *  claim to a GitHub account (present after a GitHub device-flow grant). */
function buildTunnelClaimPayload(localUserId: string, accountId?: number): {
    sub: string;
    iat: number;
    exp: number;
    jti: string;
    accountId?: number;
} {
    const iat = Math.floor(Date.now() / 1000);
    return { sub: localUserId, iat, exp: iat + 3600, jti: randomUUID(), ...(accountId !== undefined ? { accountId } : {}) };
}

const PAIR_RATE_LIMIT_MAX = 30;
const PAIR_RATE_LIMIT_WINDOW_MS = 60_000;
const pairRateBuckets = new Map<string, { count: number; windowStart: number }>();

function isPairRateLimited(ip: string, now: number): boolean {
    const bucket = pairRateBuckets.get(ip);
    if (!bucket || now - bucket.windowStart >= PAIR_RATE_LIMIT_WINDOW_MS) {
        pairRateBuckets.set(ip, { count: 1, windowStart: now });
        if (pairRateBuckets.size > 1024) {
            for (const [k, value] of pairRateBuckets) {
                if (now - value.windowStart >= PAIR_RATE_LIMIT_WINDOW_MS) {
                    pairRateBuckets.delete(k);
                }
            }
        }
        return false;
    }
    if (bucket.count >= PAIR_RATE_LIMIT_MAX) {
        return true;
    }
    bucket.count += 1;
    return false;
}

export function pairRoutes(app: Fastify, tofuConfig: TofuHandshakeConfig, paths: PairRoutePaths = {}) {
    // POST /pair/complete — single-step pair + refresh. Gateway X-Tunnel-Authorization
    // (Dev Tunnels connect token) is the identity gate; the per-machine GitHub device
    // flow that Sprint A originally specified was redundant on a personal fork because
    // ownership of the tunnel already proves the caller is the operator. Identity is
    // read from the locally-onboarded profile.json (written by `happy auth login --force`).
    app.post('/pair/complete', {
        schema: {
            body: z.object({
                mobileEcdhPublicKey: z.string().optional(),
            }),
            response: {
                200: z.object({
                    githubLogin: z.string(),
                    machine: z.object({
                        machineId: z.string(),
                        tunnelUrl: z.string(),
                        ed25519PublicKey: z.string(),
                        x25519PublicKey: z.string(),
                        ed25519Fingerprint: z.string().optional(),
                        tunnelClaim: z.string(),
                        mobileSharedSecret: z.string().optional(),
                    }),
                }),
                429: z.object({ error: z.string() }),
                503: z.object({ error: z.string() }),
            },
        },
    }, async (request, reply) => {
        if (isPairRateLimited(request.ip, Date.now())) {
            return reply.code(429).send({ error: "rate_limited" });
        }
        if (!tofuConfig.tofuPublicKeys) {
            return reply.code(503).send({ error: "tofu_public_keys_unavailable" });
        }
        if (!tofuConfig.ed25519SecretKey) {
            return reply.code(503).send({ error: "tunnel_signing_key_unavailable" });
        }

        const profile = await readProfile(paths.profile ?? defaultProfilePath());
        if (!profile) {
            return reply.code(503).send({ error: "local_profile_unavailable" });
        }

        let mobileSharedSecret: string | undefined;
        if (request.body.mobileEcdhPublicKey && tofuConfig.x25519SecretKey) {
            const mobilePublicKeyBytes = Buffer.from(request.body.mobileEcdhPublicKey, "base64");
            const sharedSecret = nacl.box.before(mobilePublicKeyBytes, tofuConfig.x25519SecretKey);
            mobileSharedSecret = Buffer.from(sharedSecret).toString("base64");
        }

        const tunnelUrl = tofuConfig.publicUrl || process.env.PUBLIC_URL || `http://127.0.0.1:${process.env.PORT ?? "3005"}`;
        const claimPayload = buildTunnelClaimPayload(tofuConfig.localUserId, profile.githubUserId);
        const tunnelClaim = await encodeTunnelClaim(claimPayload, tofuConfig.ed25519SecretKey);

        return {
            githubLogin: profile.githubLogin,
            machine: {
                machineId: tofuConfig.localUserId,
                tunnelUrl,
                ed25519PublicKey: tofuConfig.tofuPublicKeys.ed25519PublicKey,
                x25519PublicKey: tofuConfig.tofuPublicKeys.x25519PublicKey,
                ed25519Fingerprint: tofuConfig.tofuPublicKeys.ed25519Fingerprint,
                tunnelClaim,
                mobileSharedSecret,
            },
        };
    });

    // /pair/connect — tunnel-level auth (X-Tunnel-Authorization with real Dev Tunnels connect JWT)
    // is the security gate. No GitHub token required here — Dev Tunnels already verified identity.
    app.post("/pair/connect", {
        schema: {
            body: z.object({
                mobileEcdhPublicKey: z.string().optional(),
            }),
        },
    }, async (request, reply) => {
        if (!tofuConfig.tofuPublicKeys || !tofuConfig.ed25519SecretKey) {
            return reply.code(503).send({ error: "tofu_public_keys_unavailable" });
        }

        let mobileSharedSecret: string | undefined;
        if (request.body.mobileEcdhPublicKey && tofuConfig.x25519SecretKey) {
            const mobilePublicKeyBytes = Buffer.from(request.body.mobileEcdhPublicKey, "base64");
            const sharedSecret = nacl.box.before(mobilePublicKeyBytes, tofuConfig.x25519SecretKey);
            mobileSharedSecret = Buffer.from(sharedSecret).toString("base64");
        }

        const tunnelUrl = tofuConfig.publicUrl || process.env.PUBLIC_URL || `http://127.0.0.1:${process.env.PORT ?? "3005"}`;
        const tunnelClaim = await encodeTunnelClaim(
            buildTunnelClaimPayload(tofuConfig.localUserId),
            tofuConfig.ed25519SecretKey,
        );
        return {
            machineId: tofuConfig.localUserId,
            tunnelUrl,
            ed25519PublicKey: tofuConfig.tofuPublicKeys.ed25519PublicKey,
            x25519PublicKey: tofuConfig.tofuPublicKeys.x25519PublicKey,
            ed25519Fingerprint: tofuConfig.tofuPublicKeys.ed25519Fingerprint,
            tunnelClaim,
            mobileSharedSecret,
        };
    });
}
