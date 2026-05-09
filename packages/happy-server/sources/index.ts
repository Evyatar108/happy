import fastify, { type FastifyInstance } from "fastify";
import { mkdir } from "fs/promises";
import path from "path";

export interface HappyServerConfig {
    dataDir: string;
    port: number;
    machineKey: string | Uint8Array;
}

export interface HappyServerHandle {
    app: FastifyInstance;
    start: () => Promise<void>;
    stop: () => Promise<void>;
}

export function createHappyServer(config: HappyServerConfig): HappyServerHandle {
    const app = fastify({ logger: false });
    const serverDataDir = path.join(config.dataDir, "happy-server");
    const machineKeyLength = typeof config.machineKey === "string"
        ? config.machineKey.length
        : config.machineKey.byteLength;

    app.get("/", async () => ({
        ok: true,
        machineKeyLength,
    }));

    return {
        app,
        async start() {
            await mkdir(serverDataDir, { recursive: true });
            await app.listen({ port: config.port, host: "127.0.0.1" });
        },
        async stop() {
            await app.close();
        },
    };
}
