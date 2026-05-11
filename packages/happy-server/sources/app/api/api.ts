import fastify from "fastify";
import { log, logger } from "@/utils/log";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "fastify-type-provider-zod";
import { onShutdown } from "@/utils/shutdown";
import { Fastify } from "./types";
import { pushRoutes } from "./routes/pushRoutes";
import { sessionRoutes } from "./routes/sessionRoutes";
import { pairRoutes } from "./routes/pairRoutes";
import { startSocket } from "./socket";
import { machinesRoutes } from "./routes/machinesRoutes";
import { devRoutes } from "./routes/devRoutes";
import { versionRoutes } from "./routes/versionRoutes";
import { voiceRoutes } from "./routes/voiceRoutes";
import { artifactsRoutes } from "./routes/artifactsRoutes";
import { accessKeysRoutes } from "./routes/accessKeysRoutes";
import { enableMonitoring } from "./utils/enableMonitoring";
import { enableErrorHandlers } from "./utils/enableErrorHandlers";
import { userRoutes } from "./routes/userRoutes";
import { feedRoutes } from "./routes/feedRoutes";
import { kvRoutes } from "./routes/kvRoutes";
import { v3SessionRoutes } from "./routes/v3SessionRoutes";
import { isLocalStorage, getLocalFilesDir } from "@/storage/files";
import type { EventRouter } from "@/app/events/eventRouter";
import { verifyLoopbackCapability, type LoopbackCapabilityPaths } from "./auth/loopbackCapability";
import { verifyTunnelClaim, type TunnelClaimResult } from "./auth/tunnelClaim";
import * as path from "path";
import * as fs from "fs";

export interface TofuHandshakeConfig {
    localUserId: string;
    tofuPublicKeys?: {
        ed25519PublicKey: string;
        x25519PublicKey: string;
        ed25519Fingerprint?: string;
    };
    ed25519SecretKey?: Uint8Array;
    x25519SecretKey?: Uint8Array;
    publicUrl?: string;
}

export { verifyTunnelClaim, type TunnelClaimResult };

export function createApi() {
    return fastify({
        loggerInstance: logger,
        bodyLimit: 1024 * 1024 * 100, // 100MB
    });
}

function parseCorsOrigins(): string[] {
    const raw = process.env.HAPPY_CORS_ORIGINS;
    if (!raw) {
        return [];
    }
    return raw.split(',').map(o => o.trim()).filter(o => o.length > 0);
}

export interface ConfigureApiOptions {
    auth?: "tunnel" | "loopback";
    paths?: LoopbackCapabilityPaths;
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
    typed.decorate('verifyLoopbackCapability', verifyLoopbackCapability(options.paths));
    typed.decorate('authenticateTunnelClaim', async function (request: any, reply: any) {
        const authHeader = request.headers['x-tunnel-authorization'] as string | undefined;
        const result = await verifyTunnelClaim(authHeader, tofuConfig);
        if (!result.ok) {
            const status = result.reason === 'tunnel_verification_unavailable' ? 503 : 401;
            return reply.code(status).send({ error: result.reason });
        }
        request.userId = result.payload.sub;
        request.accountId = result.payload.accountId;
        request.devTunnelsIdentity = result.devTunnelsIdentity;
    });
    typed.decorate('authenticate', options.auth === "loopback" ? typed.verifyLoopbackCapability : typed.authenticateTunnelClaim);

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

    const eventRouter = startSocket(typed, tofuConfig);
    options.onEventRouter?.(eventRouter);

    // Routes
    pairRoutes(typed, tofuConfig);
    pushRoutes(typed, tofuConfig);
    sessionRoutes(typed, eventRouter);
    machinesRoutes(typed, eventRouter);
    artifactsRoutes(typed, eventRouter);
    accessKeysRoutes(typed);
    devRoutes(typed);
    versionRoutes(typed);
    voiceRoutes(typed);
    userRoutes(typed);
    feedRoutes(typed);
    kvRoutes(typed, eventRouter);
    v3SessionRoutes(typed, eventRouter);

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
