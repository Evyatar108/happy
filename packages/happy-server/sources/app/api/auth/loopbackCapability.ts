import { readFile } from "fs/promises";

export interface LoopbackCapabilityPaths {
    loopbackCap?: string;
}

export function verifyLoopbackCapability(paths: LoopbackCapabilityPaths = {}) {
    let cachedToken: string | null = null;

    async function readCapability(): Promise<string | null> {
        if (cachedToken !== null) {
            return cachedToken;
        }
        if (!paths.loopbackCap) {
            return null;
        }
        cachedToken = (await readFile(paths.loopbackCap, "utf-8")).trim();
        return cachedToken;
    }

    return async function verifyLoopbackCapabilityDecorator(request: any, reply: any) {
        const expectedToken = await readCapability();
        const actualToken = request.headers["x-loopback-capability"] as string | undefined;
        if (!expectedToken || !actualToken || actualToken !== expectedToken) {
            return reply.code(401).send({ error: "invalid_loopback_capability" });
        }
    };
}

