import { z } from "zod";
import nacl from "tweetnacl";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { type Fastify } from "../types";
import { type TofuHandshakeConfig } from "../api";
import { encodeTunnelClaim } from "../auth/tunnelClaim";

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

const GitHubUserSchema = z.object({
    login: z.string(),
    id: z.number().optional(),
    name: z.string().nullable().optional(),
    avatar_url: z.string().nullable().optional(),
}).passthrough();

type GitHubUser = z.infer<typeof GitHubUserSchema>;

type DevTunnelItem = {
    clusterId: string;
    tunnelId: string;
    status?: { value: string };
};

export interface PairRoutePaths {
    profile?: string;
}

function defaultProfilePath(): string {
    return path.join(os.homedir(), ".happy", "profile.json");
}

async function writeProfileAtomically(profilePath: string, profile: unknown) {
    const dir = path.dirname(profilePath);
    await fs.mkdir(dir, { recursive: true });
    const tempPath = path.join(dir, `.${path.basename(profilePath)}.${process.pid}.${Date.now()}.tmp`);
    try {
        await fs.writeFile(tempPath, `${JSON.stringify(profile, null, 2)}\n`, { mode: 0o600 });
        await fs.rename(tempPath, profilePath);
        if (process.platform !== "win32") {
            await fs.chmod(profilePath, 0o600);
        }
    } catch (error) {
        await fs.unlink(tempPath).catch(() => undefined);
        throw error;
    }
}

async function fetchHappyTunnels(githubToken: string, excludeTunnelId: string | null): Promise<DevTunnelItem[]> {
    try {
        const response = await fetch(
            "https://global.rel.tunnels.api.visualstudio.com/tunnels?includePorts=true&global=true&api-version=2023-09-27-preview",
            {
                headers: {
                    // GitHub OAuth token from device flow; not a Happy relay credential.
                    Authorization: `github ${githubToken}`,
                    "X-Tunnel-User-Agent": "happy-server/1.0",
                    Accept: "application/json",
                },
            }
        );
        if (!response.ok) return [];
        const tunnels = await response.json() as DevTunnelItem[];
        if (!Array.isArray(tunnels)) return [];
        return tunnels.filter(
            t => typeof t.tunnelId === "string"
                && t.tunnelId.startsWith("happy-")
                && t.tunnelId !== excludeTunnelId
        );
    } catch {
        return [];
    }
}

function parseTunnelIdFromUrl(url: string): string | null {
    try {
        const hostname = new URL(url).hostname;
        return hostname.split(".")[0] ?? null;
    } catch {
        return null;
    }
}

function displayNameFromTunnelId(tunnelId: string): string {
    // happy-<hostname>-<machineId> → extract hostname
    const withoutPrefix = tunnelId.replace(/^happy-/, "");
    const lastDash = withoutPrefix.lastIndexOf("-");
    return lastDash > 0 ? withoutPrefix.slice(0, lastDash) : withoutPrefix;
}

function getGitHubClientId(): string {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
        throw new Error("GITHUB_CLIENT_ID is required for mobile pairing");
    }
    return clientId;
}

const PAIR_RATE_LIMIT_MAX = 5;
const PAIR_RATE_LIMIT_WINDOW_MS = 60_000;
const pairRateBuckets = new Map<string, { count: number; windowStart: number }>();

function isPairRateLimited(ip: string, now: number): boolean {
    const bucket = pairRateBuckets.get(ip);
    if (!bucket || now - bucket.windowStart >= PAIR_RATE_LIMIT_WINDOW_MS) {
        pairRateBuckets.set(ip, { count: 1, windowStart: now });
        if (pairRateBuckets.size > 1024) {
            for (const [key, value] of pairRateBuckets) {
                if (now - value.windowStart >= PAIR_RATE_LIMIT_WINDOW_MS) {
                    pairRateBuckets.delete(key);
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
    return GitHubUserSchema.parse(await response.json());
}

export function pairRoutes(app: Fastify, tofuConfig: TofuHandshakeConfig, paths: PairRoutePaths = {}) {
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
                429: z.object({ error: z.string() }),
            },
        },
    }, async (request, reply) => {
        if (isPairRateLimited(request.ip, Date.now())) {
            return reply.code(429).send({ error: "rate_limited" });
        }
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
        if (isPairRateLimited(request.ip, Date.now())) {
            return reply.code(429).send({ error: "rate_limited" });
        }
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
        if (typeof githubUser.id !== "number") {
            return reply.code(502).send({ error: "github_identity_missing_id" });
        }
        const expectedOwner = process.env.HAPPY_TUNNEL_GITHUB_OWNER;
        if (expectedOwner && expectedOwner.toLowerCase() !== githubUser.login.toLowerCase()) {
            return reply.code(403).send({ error: "github_identity_does_not_own_tunnel" });
        }

        if (!tofuConfig.tofuPublicKeys) {
            return reply.code(503).send({ error: "tofu_public_keys_unavailable" });
        }
        if (!tofuConfig.ed25519SecretKey) {
            return reply.code(503).send({ error: "tunnel_signing_key_unavailable" });
        }

        let mobileSharedSecret: string | undefined;
        if (request.body.mobileEcdhPublicKey && tofuConfig.x25519SecretKey) {
            const mobilePublicKeyBytes = Buffer.from(request.body.mobileEcdhPublicKey, "base64");
            const sharedSecret = nacl.box.before(mobilePublicKeyBytes, tofuConfig.x25519SecretKey);
            mobileSharedSecret = Buffer.from(sharedSecret).toString("base64");
        }

        const tunnelUrl = tofuConfig.publicUrl || process.env.PUBLIC_URL || `http://127.0.0.1:${process.env.PORT ?? "3005"}`;
        const issuedAt = Math.floor(Date.now() / 1000);
        const tunnelClaim = await encodeTunnelClaim(
            { sub: tofuConfig.localUserId, gh: githubUser.login, iat: issuedAt, accountId: githubUser.id },
            tofuConfig.ed25519SecretKey,
        );
        await writeProfileAtomically(paths.profile ?? defaultProfilePath(), {
            githubUserId: githubUser.id,
            githubLogin: githubUser.login,
            name: githubUser.name ?? null,
            avatarUrl: githubUser.avatar_url ?? null,
            updatedAt: new Date(issuedAt * 1000).toISOString(),
        });

        const currentTunnelId = parseTunnelIdFromUrl(tunnelUrl);
        const otherTunnels = await fetchHappyTunnels(tokenData.access_token, currentTunnelId);
        const discoveredMachines = otherTunnels.map(t => ({
            tunnelId: t.tunnelId,
            tunnelUrl: `https://${t.tunnelId}.devtunnels.ms`,
            displayName: displayNameFromTunnelId(t.tunnelId),
            isOnline: t.status?.value === "host-connected",
        }));

        return {
            status: "authorized" as const,
            githubLogin: githubUser.login,
            githubToken: tokenData.access_token,
            machines: [{
                machineId: tofuConfig.localUserId,
                tunnelUrl,
                ed25519PublicKey: tofuConfig.tofuPublicKeys.ed25519PublicKey,
                x25519PublicKey: tofuConfig.tofuPublicKeys.x25519PublicKey,
                ed25519Fingerprint: tofuConfig.tofuPublicKeys.ed25519Fingerprint,
                tunnelClaim,
                mobileSharedSecret,
            }],
            discoveredMachines,
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
            { sub: tofuConfig.localUserId, iat: Math.floor(Date.now() / 1000) },
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
