import { z } from "zod";
import * as os from "os";
import { type Fastify } from "../types";

const MachineSelfSchema = z.object({
    machineId: z.string(),
    hostname: z.string(),
    tunnelPort: z.number(),
    loopbackPort: z.number(),
    tunnelUrl: z.string(),
    lastSeenAt: z.union([z.number(), z.string()]),
    owner: z.string(),
});

export type MachineSelfState = z.infer<typeof MachineSelfSchema>;

export interface MachineSelfRoutesOptions {
    auth: "tunnel" | "loopback";
    machineState?: () => MachineSelfState | Promise<MachineSelfState>;
}

function defaultMachineState(): MachineSelfState {
    const tunnelPort = Number(process.env.PORT ?? 3005);
    return {
        machineId: "local-user",
        hostname: os.hostname(),
        tunnelPort,
        loopbackPort: tunnelPort,
        tunnelUrl: process.env.PUBLIC_URL ?? `http://127.0.0.1:${tunnelPort}`,
        lastSeenAt: Date.now(),
        owner: process.env.HAPPY_TUNNEL_GITHUB_OWNER ?? "",
    };
}

function requireAccountIdForTunnel(auth: MachineSelfRoutesOptions["auth"]) {
    return async function requireAccountIdForTunnelRoute(request: any, reply: any) {
        if (auth === "tunnel" && typeof request.accountId !== "number") {
            return reply.code(401).send({ error: "account_id_required" });
        }
    };
}

export function machineSelfRoutes(app: Fastify, options: MachineSelfRoutesOptions) {
    const accountIdGate = requireAccountIdForTunnel(options.auth);

    app.get('/v2/me/machine', {
        preHandler: [app.authenticate, accountIdGate],
        schema: {
            response: {
                200: MachineSelfSchema,
                401: z.object({ error: z.string() }),
            },
        },
    }, async (_request, reply) => {
        const machineState = options.machineState ? await options.machineState() : defaultMachineState();
        return reply.send(MachineSelfSchema.parse(machineState));
    });
}
