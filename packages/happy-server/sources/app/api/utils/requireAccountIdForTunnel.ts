/**
 * Returns a Fastify preHandler that enforces accountId presence when the
 * listener is in tunnel-auth mode. In loopback mode the gate is a no-op
 * because loopback callers are local and cannot supply a GitHub identity.
 */
export function requireAccountIdForTunnel(auth: "tunnel" | "loopback") {
    return async function requireAccountIdForTunnelRoute(request: any, reply: any) {
        if (auth === "tunnel" && typeof request.accountId !== "number") {
            return reply.code(401).send({ error: "account_id_required" });
        }
    };
}
