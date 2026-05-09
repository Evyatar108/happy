import { z } from "zod";
import nacl from "tweetnacl";
import { type Fastify } from "../types";
import { type TofuHandshakeConfig } from "../api";

type DeviceCodeResponse = {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete?: string;
    expires_in: number;
    interval: number;
};

type AccessTokenResponse = {
    access_token?: string;
    error?: string;
};

type GitHubUser = {
    login: string;
};

function getGitHubClientId(): string {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
        throw new Error("GITHUB_CLIENT_ID is required for mobile pairing");
    }
    return clientId;
}

// Produces an unsigned base64url-encoded JSON claim (not a signed JWT).
// Named "claim" deliberately — callers must not assume cryptographic verification.
function encodeTunnelClaim(payload: unknown): string {
    return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

async function fetchGitHubUser(accessToken: string): Promise<GitHubUser> {
    const response = await fetch("https://api.github.com/user", {
        headers: {
            // GitHub device-flow OAuth access token; not a Happy relay credential.
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
        },
    });
    if (!response.ok) {
        throw new Error(`GitHub user fetch failed: ${response.status}`);
    }
    return await response.json() as GitHubUser;
}

export function pairRoutes(app: Fastify, tofuConfig: TofuHandshakeConfig) {
    app.get('/pair/start', {
        schema: {
            response: {
                200: z.object({
                    device_code: z.string(),
                    user_code: z.string(),
                    verification_uri: z.string(),
                    verification_uri_complete: z.string().optional(),
                    expires_in: z.number(),
                    interval: z.number(),
                }),
            },
        },
    }, async () => {
        const body = new URLSearchParams({
            client_id: getGitHubClientId(),
            scope: "read:user",
        });
        const response = await fetch("https://github.com/login/device/code", {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: body.toString(),
        });
        if (!response.ok) {
            throw new Error(`GitHub device flow start failed: ${response.status}`);
        }
        return await response.json() as DeviceCodeResponse;
    });

    app.post('/pair/status', {
        schema: {
            body: z.object({
                device_code: z.string(),
                mobileEcdhPublicKey: z.string().optional(),
            }),
        },
    }, async (request, reply) => {
        const githubBody = new URLSearchParams({
            client_id: getGitHubClientId(),
            device_code: request.body.device_code,
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        });
        const response = await fetch("https://github.com/login/oauth/access_token", {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: githubBody.toString(),
        });
        if (!response.ok) {
            throw new Error(`GitHub device flow poll failed: ${response.status}`);
        }

        const tokenData = await response.json() as AccessTokenResponse;
        if (!tokenData.access_token) {
            if (tokenData.error === "authorization_pending" || tokenData.error === "slow_down") {
                return { status: "pending" as const };
            }
            return reply.code(401).send({ error: tokenData.error ?? "github_authorization_failed" });
        }

        const githubUser = await fetchGitHubUser(tokenData.access_token);
        const expectedOwner = process.env.HAPPY_TUNNEL_GITHUB_OWNER;
        if (expectedOwner && expectedOwner.toLowerCase() !== githubUser.login.toLowerCase()) {
            return reply.code(403).send({ error: "github_identity_does_not_own_tunnel" });
        }

        if (!tofuConfig.tofuPublicKeys) {
            return reply.code(503).send({ error: "tofu_public_keys_unavailable" });
        }

        if (request.body.mobileEcdhPublicKey && tofuConfig.x25519SecretKey) {
            const mobilePublicKeyBytes = Buffer.from(request.body.mobileEcdhPublicKey, "base64");
            tofuConfig.mobileSharedSecret = nacl.box.before(mobilePublicKeyBytes, tofuConfig.x25519SecretKey);
        }

        const tunnelUrl = tofuConfig.publicUrl || process.env.PUBLIC_URL || `http://127.0.0.1:${process.env.PORT ?? "3005"}`;
        return {
            status: "authorized" as const,
            githubLogin: githubUser.login,
            machines: [{
                machineId: tofuConfig.localUserId,
                tunnelUrl,
                ed25519PublicKey: tofuConfig.tofuPublicKeys.ed25519PublicKey,
                x25519PublicKey: tofuConfig.tofuPublicKeys.x25519PublicKey,
                ed25519Fingerprint: tofuConfig.tofuPublicKeys.ed25519Fingerprint,
                tunnelClaim: encodeTunnelClaim({ sub: tofuConfig.localUserId, gh: githubUser.login, iat: Math.floor(Date.now() / 1000) }),
            }],
        };
    });
}
