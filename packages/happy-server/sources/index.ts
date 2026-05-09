import fastify, { type FastifyInstance } from "fastify";
import { mkdir } from "fs/promises";
import path from "path";

export interface HappyServerConfig {
    dataDir: string;
    port: number;
    machineKey: string | Uint8Array;
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
        process.env.PORT ??= String(config.port);
        if (!config.enablePrettyLogs) {
            process.env.HAPPY_SERVER_QUIET_LOGGER = "true";
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
        configureApi(app);
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
