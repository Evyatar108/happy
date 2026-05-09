import fastify, { type FastifyInstance } from "fastify";
import { mkdir } from "fs/promises";
import path from "path";

export interface TofuPublicKeys {
    ed25519PublicKey: string | Uint8Array;
    x25519PublicKey: string | Uint8Array;
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
    enablePrettyLogs?: boolean;
}

export interface HappyServerHandle {
    app: FastifyInstance;
    start: () => Promise<void>;
    stop: () => Promise<void>;
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

export function createHappyServer(config: HappyServerConfig): HappyServerHandle {
    const app = fastify({ logger: false });
    let isConfigured = false;
    let isStarted = false;

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
        });
        isConfigured = true;
    }

    return {
        app,
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
