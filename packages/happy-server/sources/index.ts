import fastify, { type FastifyInstance } from "fastify";
import { mkdir } from "fs/promises";
import path from "path";
import type { EventRouter } from "./app/events/eventRouter";
import type { ApiPaths, MachineStateGetter } from "./app/api/api";
import { decodeBase64 } from "privacy-kit";
import { db, getPGlite } from "./storage/db";

export { encodeTunnelClaim } from "./app/api/auth/tunnelClaim";

export interface TofuPublicKeys {
    ed25519PublicKey: string | Uint8Array;
    ed25519SecretKey?: Uint8Array;
    x25519PublicKey: string | Uint8Array;
    x25519SecretKey?: Uint8Array;
    ed25519Fingerprint?: string;
}

export interface HappyServerConfig {
    dataDir: string;
    port: number;
    machineKey: string | Uint8Array;
    localUserId?: string;
    tofuPublicKeys?: TofuPublicKeys;
    host?: string;
    publicUrl?: string;
    auth?: "tunnel" | "loopback";
    paths?: ApiPaths;
    machineState?: MachineStateGetter;
    enablePrettyLogs?: boolean;
}

export interface HappyServerSharedContext {
    dataDir: string;
    machineKey: string | Uint8Array;
    localUserId?: string;
    tofuPublicKeys?: TofuPublicKeys;
    publicUrl?: string;
    enablePrettyLogs?: boolean;
}

export interface CreateAppConfig extends HappyServerSharedContext {
    port: number;
    host?: string;
    auth?: "tunnel" | "loopback";
    paths?: ApiPaths;
    machineState?: MachineStateGetter;
}

export interface HappyServerHandle {
    app: FastifyInstance;
    eventRouter: EventRouter;
    start: () => Promise<void>;
    stop: () => Promise<void>;
}

export interface BootstrapMachineForEmbeddedInput {
    machineId: string;
    metadata: string;
    daemonState: string | null;
    dataEncryptionKeyBase64?: string | null;
}

export async function bootstrapMachineForEmbedded(input: BootstrapMachineForEmbeddedInput): Promise<void> {
    if (!getPGlite()) {
        throw new Error("Embedded PGlite database is not configured; call createApp(...).start() before bootstrapMachineForEmbedded().");
    }

    await db.machine.upsert({
        where: { id: input.machineId },
        create: {
            id: input.machineId,
            metadata: input.metadata,
            metadataVersion: 1,
            daemonState: input.daemonState,
            daemonStateVersion: 1,
            dataEncryptionKey: input.dataEncryptionKeyBase64
                ? decodeBase64(input.dataEncryptionKeyBase64)
                : null,
        },
        update: {},
    });
}

function machineKeyToSeed(machineKey: string | Uint8Array) {
    if (typeof machineKey === "string") {
        return machineKey;
    }
    return Buffer.from(machineKey).toString("base64");
}

function publicKeyToBase64(publicKey: string | Uint8Array): string {
    if (typeof publicKey === "string") {
        return publicKey;
    }
    return Buffer.from(publicKey).toString("base64");
}

export function createApp(config: CreateAppConfig): HappyServerHandle {
    const app = fastify({ logger: false });
    let isConfigured = false;
    let isStarted = false;
    let eventRouter: EventRouter | null = null;

    async function configure() {
        if (isConfigured) {
            return;
        }
        const serverDataDir = path.join(config.dataDir, "happy-server");
        await mkdir(serverDataDir, { recursive: true });

        process.env.HANDY_MASTER_SECRET ??= machineKeyToSeed(config.machineKey);
        if (!config.enablePrettyLogs) {
            process.env.HAPPY_SERVER_QUIET_LOGGER = "true";
        }
        if (!process.env.GITHUB_CLIENT_ID) {
            console.warn("GITHUB_CLIENT_ID not set — mobile pairing routes will return 500. Set GITHUB_CLIENT_ID to enable pairing.");
        }

        const [{ configureDb, db }, { configureFiles, loadFiles }, { configureApi }, { auth }, { initEncrypt }, { initGithub }, { startActivityCache }] = await Promise.all([
            import("./storage/db"),
            import("./storage/files"),
            import("./app/api/api"),
            import("./app/auth/auth"),
            import("./modules/encrypt"),
            import("./modules/github"),
            import("./app/presence/sessionCache"),
        ]);

        configureDb({ provider: "pglite", pgliteDir: path.join(serverDataDir, "pglite") });
        configureFiles({
            dataDir: serverDataDir,
            publicUrl: config.publicUrl || `http://${config.host || "127.0.0.1"}:${config.port}`,
        });

        await db.$connect();
        await initEncrypt();
        await initGithub();
        await loadFiles();
        await auth.init();
        startActivityCache();
        configureApi(app, {
            localUserId: config.localUserId ?? "local-user",
            publicUrl: config.publicUrl,
            tofuPublicKeys: config.tofuPublicKeys ? {
                ed25519PublicKey: publicKeyToBase64(config.tofuPublicKeys.ed25519PublicKey),
                x25519PublicKey: publicKeyToBase64(config.tofuPublicKeys.x25519PublicKey),
                ed25519Fingerprint: config.tofuPublicKeys.ed25519Fingerprint,
            } : undefined,
            ed25519SecretKey: config.tofuPublicKeys?.ed25519SecretKey,
            x25519SecretKey: config.tofuPublicKeys?.x25519SecretKey,
        }, {
            auth: config.auth,
            paths: config.paths,
            machineState: config.machineState,
            onEventRouter: (router) => {
                eventRouter = router;
            },
        });
        isConfigured = true;
    }

    return {
        app,
        get eventRouter() {
            if (!eventRouter) {
                throw new Error("Happy server event router is not configured yet");
            }
            return eventRouter;
        },
        async start() {
            if (isStarted) {
                return;
            }
            await configure();
            await app.listen({ port: config.port, host: config.host || "127.0.0.1" });
            isStarted = true;
        },
        async stop() {
            if (!isStarted && !isConfigured) {
                return;
            }
            await app.close();
            const [{ disconnectDb }, { activityCache }, { auth }, { shutdownLogger }] = await Promise.all([
                import("./storage/db"),
                import("./app/presence/sessionCache"),
                import("./app/auth/auth"),
                import("./utils/log"),
            ]);
            auth.shutdown();
            activityCache.shutdown();
            await disconnectDb();
            shutdownLogger();
            isStarted = false;
        },
    };
}

export function createHappyServer(config: HappyServerConfig): HappyServerHandle {
    return createApp(config);
}
