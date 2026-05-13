import fastify from "fastify";
import { log, logger } from "@/utils/log";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "fastify-type-provider-zod";
import { onShutdown } from "@/utils/shutdown";
import { Fastify } from "./types";
import { pushRoutes } from "./routes/pushRoutes";
import { sessionRoutes } from "./routes/sessionRoutes";
import { pairRoutes } from "./routes/pairRoutes";
import { startSocket } from "./socket";
import { devRoutes } from "./routes/devRoutes";
import { versionRoutes } from "./routes/versionRoutes";
import { enableMonitoring } from "./utils/enableMonitoring";
import { enableErrorHandlers } from "./utils/enableErrorHandlers";
import { parseCorsOrigins } from "./utils/parseCorsOrigins";
import { v3SessionRoutes } from "./routes/v3SessionRoutes";
import { accountRoutes } from "./routes/accountRoutes";
import { machineSelfRoutes, type MachineSelfState } from "./routes/machineSelfRoutes";
import { isLocalStorage, getLocalFilesDir } from "@/storage/files";
import type { EventRouter } from "@/app/events/eventRouter";
import { verifyLoopbackCapability, type LoopbackCapabilityPaths } from "./auth/loopbackCapability";
import * as path from "path";
import * as fs from "fs";

export interface ApiPaths extends LoopbackCapabilityPaths {
    profile?: string;
    accountSettings?: string;
}

export type MachineStateGetter = () => MachineSelfState | Promise<MachineSelfState>;

export interface TofuHandshakeConfig {
    localUserId: string;
    tofuPublicKeys?: {
        ed25519PublicKey: string;
        x25519PublicKey: string;
        ed25519Fingerprint?: string;
    };
    x25519SecretKey?: Uint8Array;
    publicUrl?: string;
}

export function createApi() {
    return fastify({
        loggerInstance: logger,
        bodyLimit: 1024 * 1024 * 100, // 100MB
    });
}

export interface ConfigureApiOptions {
    auth?: "tunnel" | "loopback";
    paths?: ApiPaths;
    machineState?: MachineStateGetter;
    onEventRouter?: (eventRouter: EventRouter) => void;
}

export function configureApi(app: any, tofuConfig: TofuHandshakeConfig = { localUserId: "local-user" }, options: ConfigureApiOptions = {}) {
    const fastifyApp = app as ReturnType<typeof createApi>;
    const allowedOrigins = parseCorsOrigins();
    fastifyApp.register(import('@fastify/cors'), {
        origin: allowedOrigins.length === 0 ? false : allowedOrigins,
        allowedHeaders: ['X-Tunnel-Authorization', 'X-Loopback-Capability', 'X-Happy-Client', 'Content-Type'],
        methods: ['GET', 'POST', 'PUT', 'DELETE']
    });
    fastifyApp.get('/', function (request, reply) {
        reply.send('Welcome to Happy Server!');
    });

    // Create typed provider
    fastifyApp.setValidatorCompiler(validatorCompiler);
    fastifyApp.setSerializerCompiler(serializerCompiler);
    const typed = fastifyApp.withTypeProvider<ZodTypeProvider>() as unknown as Fastify;

    // Enable features
    enableMonitoring(typed);
    enableErrorHandlers(typed);
    typed.decorate('verifyLoopbackCapability', verifyLoopbackCapability(options.paths, tofuConfig.localUserId));
    typed.decorate('authenticateTunnel', async function (request: any) {
        request.userId = tofuConfig.localUserId;
    });
    typed.decorate('authenticate', options.auth === "loopback" ? typed.verifyLoopbackCapability : typed.authenticateTunnel);

    // Serve local files when using local storage
    if (isLocalStorage()) {
        fastifyApp.get('/files/*', function (request, reply) {
            const filePath = (request.params as any)['*'];
            const baseDir = path.resolve(getLocalFilesDir());
            const fullPath = path.resolve(baseDir, filePath);
            if (!fullPath.startsWith(baseDir + path.sep)) {
                reply.code(403).send('Forbidden');
                return;
            }
            if (!fs.existsSync(fullPath)) {
                reply.code(404).send('Not found');
                return;
            }
            const stream = fs.createReadStream(fullPath);
            reply.send(stream);
        });
    }

    const eventRouter = startSocket(typed, tofuConfig, { auth: options.auth, paths: options.paths });
    options.onEventRouter?.(eventRouter);

    // Routes available on both tunnel and loopback listeners
    accountRoutes(typed, { paths: options.paths });
    machineSelfRoutes(typed, { machineState: options.machineState });

    // Routes only available on the tunnel listener (not loopback)
    if (options.auth !== "loopback") {
        pairRoutes(typed, tofuConfig, options.paths);
        pushRoutes(typed, tofuConfig);
        sessionRoutes(typed, eventRouter);
        devRoutes(typed);
        versionRoutes(typed);
        v3SessionRoutes(typed, eventRouter);
    }

    return typed;
}

export async function startApi() {

    // Configure
    log('Starting API...');

    // Start API
    const app = createApi();
    configureApi(app);

    // Start HTTP
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3005;
    const host = process.env.HAPPY_API_HOST ?? '127.0.0.1';
    await app.listen({ port, host });
    onShutdown('api', async () => {
        await app.close();
    });

    // End
    log('API ready on port http://localhost:' + port);

    return app;
}
