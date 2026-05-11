import { z } from "zod";
import { type Fastify } from "../types";
import { requireAccountIdForTunnel } from "../utils/requireAccountIdForTunnel";

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

export function machineSelfRoutes(app: Fastify, options: MachineSelfRoutesOptions) {
    const accountIdGate = requireAccountIdForTunnel(options.auth);

    app.get('/v2/me/machine', {
        preHandler: [app.authenticate, accountIdGate],
        schema: {
            response: {
                200: MachineSelfSchema,
                401: z.object({ error: z.string() }),
                503: z.object({ error: z.string() }),
            },
        },
    }, async (_request, reply) => {
        if (!options.machineState) {
            return reply.code(503).send({ error: "machine_state_unavailable" });
        }
        return reply.send(MachineSelfSchema.parse(await options.machineState()));
    });
}
