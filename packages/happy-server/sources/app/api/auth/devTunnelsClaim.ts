import { z } from "zod";

const DevTunnelsJwtPayloadSchema = z.object({
    exp: z.number().optional(),
    iat: z.number().optional(),
    nbf: z.number().optional(),
    sub: z.string().optional(),
    tunnelId: z.string().optional(),
    clusterId: z.string().optional(),
    scp: z.union([z.string(), z.array(z.string())]).optional(),
}).passthrough();

export interface DevTunnelsIdentity {
    login: string;
    id: number;
}

export type DevTunnelsConnectResult =
    | {
        ok: true;
        payload: z.infer<typeof DevTunnelsJwtPayloadSchema>;
        identity?: DevTunnelsIdentity;
    }
    | { ok: false; reason: "missing_tunnel_authorization" | "invalid_dev_tunnels_jwt" | "dev_tunnels_jwt_expired" };

function decodeBase64UrlJson(value: string): unknown {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf-8"));
}

function readString(payload: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
        const value = payload[key];
        if (typeof value === "string" && value.length > 0) {
            return value;
        }
    }
    return undefined;
}

function readNumber(payload: Record<string, unknown>, keys: string[]): number | undefined {
    for (const key of keys) {
        const value = payload[key];
        if (typeof value === "number" && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === "string" && /^\d+$/.test(value)) {
            return Number(value);
        }
    }
    return undefined;
}

function identityFromPayload(payload: Record<string, unknown>): DevTunnelsIdentity | undefined {
    const login = readString(payload, ["login", "githubLogin", "github_login", "preferred_username"]);
    const id = readNumber(payload, ["id", "githubUserId", "github_user_id", "accountId"]);
    if (!login || id === undefined) {
        return undefined;
    }
    return { login, id };
}

// This stays a helper: verifyTunnelClaim uses it only as the migration fallback
// for Dev Tunnels connect JWTs, and future routes may opt in explicitly. The
// /pair/status accountId path uses its in-scope api.github.com/user result.
export async function verifyDevTunnelsConnect(authHeader: string | undefined): Promise<DevTunnelsConnectResult> {
    if (!authHeader || !authHeader.startsWith("tunnel ")) {
        return { ok: false, reason: "missing_tunnel_authorization" };
    }

    const token = authHeader.slice("tunnel ".length);
    const parts = token.split(".");
    if (parts.length < 2) {
        return { ok: false, reason: "invalid_dev_tunnels_jwt" };
    }

    let payload: z.infer<typeof DevTunnelsJwtPayloadSchema>;
    try {
        payload = DevTunnelsJwtPayloadSchema.parse(decodeBase64UrlJson(parts[1]));
    } catch {
        return { ok: false, reason: "invalid_dev_tunnels_jwt" };
    }

    const now = Math.floor(Date.now() / 1000);
    if (payload.nbf !== undefined && payload.nbf > now) {
        return { ok: false, reason: "invalid_dev_tunnels_jwt" };
    }
    if (payload.exp !== undefined && payload.exp <= now) {
        return { ok: false, reason: "dev_tunnels_jwt_expired" };
    }

    return {
        ok: true,
        payload,
        identity: identityFromPayload(payload),
    };
}
