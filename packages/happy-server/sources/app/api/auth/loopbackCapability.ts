import { readFile, stat } from "fs/promises";

export interface LoopbackCapabilityPaths {
    loopbackCap?: string;
}

export function makeLoopbackTokenReader(paths: LoopbackCapabilityPaths = {}) {
    let cachedToken: string | null = null;
    let cachedMtimeMs: number | null = null;

    return async function readCapability(): Promise<string | null> {
        if (!paths.loopbackCap) {
            return null;
        }
        const fileStat = await stat(paths.loopbackCap);
        if (cachedToken !== null && cachedMtimeMs === fileStat.mtimeMs) {
            return cachedToken;
        }
        cachedToken = (await readFile(paths.loopbackCap, "utf-8")).trim();
        cachedMtimeMs = fileStat.mtimeMs;
        return cachedToken;
    };
}

export function verifyLoopbackCapability(paths: LoopbackCapabilityPaths = {}, localUserId: string = "") {
    const readCapability = makeLoopbackTokenReader(paths);

    return async function verifyLoopbackCapabilityDecorator(request: any, reply: any) {
        const expectedToken = await readCapability();
        const actualToken = request.headers["x-loopback-capability"] as string | undefined;
        if (!expectedToken || !actualToken || actualToken !== expectedToken) {
            return reply.code(401).send({ error: "invalid_loopback_capability" });
        }
        request.userId = localUserId;
    };
}

