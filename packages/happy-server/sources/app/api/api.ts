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
import * as path from "path";
import * as fs from "fs";

export interface TofuHandshakeConfig {
    localUserId: string;
    tofuPublicKeys?: {
        ed25519PublicKey: string;
        x25519PublicKey: string;
        ed25519Fingerprint?: string;
    };
    x25519SecretKey?: Uint8Array;
    mobileSharedSecret?: Uint8Array;
    publicUrl?: string;
}

export function createApi() {
    return fastify({
        loggerInstance: logger,
        bodyLimit: 1024 * 1024 * 100, // 100MB
    });
}

export function configureApi(app: any, tofuConfig: TofuHandshakeConfig = { localUserId: "local-user" }) {
    const fastifyApp = app as ReturnType<typeof createApi>;
    fastifyApp.register(import('@fastify/cors'), {
        origin: '*',
        allowedHeaders: '*',
        methods: ['GET', 'POST', 'DELETE']
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
    typed.decorate('authenticate', async function (request: any, reply: any) {
        const authHeader = request.headers['x-tunnel-authorization'] as string | undefined;
        if (!authHeader || !authHeader.startsWith('tunnel ')) {
            return reply.code(401).send({ error: 'missing_tunnel_authorization' });
        }
        const encoded = authHeader.slice('tunnel '.length);
        let payload: unknown;
        try {
            payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8'));
        } catch {
            return reply.code(401).send({ error: 'invalid_tunnel_claim' });
        }
        if (
            !payload ||
            typeof payload !== 'object' ||
            (payload as Record<string, unknown>).sub !== tofuConfig.localUserId
        ) {
            return reply.code(401).send({ error: 'invalid_tunnel_claim' });
        }
        const iat = (payload as Record<string, unknown>).iat;
        if (typeof iat !== 'number' || Math.floor(Date.now() / 1000) - iat > 86400) {
            return reply.code(401).send({ error: 'tunnel_claim_expired' });
        }
        request.userId = tofuConfig.localUserId;
    });

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

    // Routes
    pairRoutes(typed, tofuConfig);
    pushRoutes(typed, tofuConfig);
    sessionRoutes(typed);
    machinesRoutes(typed);
    artifactsRoutes(typed);
    accessKeysRoutes(typed);
    devRoutes(typed);
    versionRoutes(typed);
    voiceRoutes(typed);
    userRoutes(typed);
    feedRoutes(typed);
    kvRoutes(typed);
    v3SessionRoutes(typed);

    // Start Socket
    startSocket(typed, tofuConfig);

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
    await app.listen({ port, host: '0.0.0.0' });
    onShutdown('api', async () => {
        await app.close();
    });

    // End
    log('API ready on port http://localhost:' + port);

    return app;
}
