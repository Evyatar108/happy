import { z } from "zod";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { type Fastify } from "../types";
import { type ApiPaths } from "../api";

const ProfileSchema = z.object({
    githubUserId: z.number(),
    githubLogin: z.string(),
    name: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    updatedAt: z.string(),
});

const SettingsSchema = z.record(z.unknown());

export interface AccountRoutesOptions {
    auth: "tunnel" | "loopback";
    paths?: ApiPaths;
}

function defaultProfilePath(): string {
    return path.join(os.homedir(), ".happy", "profile.json");
}

function defaultAccountSettingsPath(): string {
    return path.join(os.homedir(), ".happy", "account-settings.json");
}

async function readJsonFile<T>(filePath: string, schema: z.ZodType<T>): Promise<T | null> {
    try {
        return schema.parse(JSON.parse(await fs.readFile(filePath, "utf-8")));
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return null;
        }
        throw error;
    }
}

async function writeJsonAtomically(filePath: string, value: unknown) {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const tempPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
    try {
        await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
        await fs.rename(tempPath, filePath);
        if (process.platform !== "win32") {
            await fs.chmod(filePath, 0o600);
        }
    } catch (error) {
        await fs.unlink(tempPath).catch(() => undefined);
        throw error;
    }
}

function requireAccountIdForTunnel(auth: AccountRoutesOptions["auth"]) {
    return async function requireAccountIdForTunnelRoute(request: any, reply: any) {
        if (auth === "tunnel" && typeof request.accountId !== "number") {
            return reply.code(401).send({ error: "account_id_required" });
        }
    };
}

export function accountRoutes(app: Fastify, options: AccountRoutesOptions) {
    const profilePath = options.paths?.profile ?? defaultProfilePath();
    const accountSettingsPath = options.paths?.accountSettings ?? defaultAccountSettingsPath();
    const accountIdGate = requireAccountIdForTunnel(options.auth);

    app.get('/v2/me/profile', {
        preHandler: [app.authenticate, accountIdGate],
        schema: {
            response: {
                200: ProfileSchema,
                404: z.object({ error: z.literal("profile_not_found") }),
                401: z.object({ error: z.string() }),
            },
        },
    }, async (_request, reply) => {
        const profile = await readJsonFile(profilePath, ProfileSchema);
        if (!profile) {
            return reply.code(404).send({ error: "profile_not_found" });
        }
        return reply.send(profile);
    });

    app.get('/v2/me/settings', {
        preHandler: [app.authenticate, accountIdGate],
        schema: {
            response: {
                200: SettingsSchema,
                401: z.object({ error: z.string() }),
            },
        },
    }, async (_request, reply) => {
        return reply.send(await readJsonFile(accountSettingsPath, SettingsSchema) ?? {});
    });

    app.put('/v2/me/settings', {
        preHandler: [app.authenticate, accountIdGate],
        bodyLimit: 1024 * 1024,
        schema: {
            body: SettingsSchema,
            response: {
                200: SettingsSchema,
                401: z.object({ error: z.string() }),
            },
        },
    }, async (request, reply) => {
        await writeJsonAtomically(accountSettingsPath, request.body);
        return reply.send(request.body);
    });
}
