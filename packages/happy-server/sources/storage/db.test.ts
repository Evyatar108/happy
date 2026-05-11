import { afterEach, describe, expect, it, vi } from "vitest";

const { prismaClients, PrismaClientMock } = vi.hoisted(() => {
    const prismaClients: any[] = [];
    const PrismaClientMock = vi.fn(() => {
        const client = {
            $disconnect: vi.fn(async () => undefined),
        };
        prismaClients.push(client);
        return client;
    });

    return { prismaClients, PrismaClientMock };
});

vi.mock("@prisma/client", () => ({
    PrismaClient: PrismaClientMock,
}));

describe("configureDb", () => {
    afterEach(async () => {
        const { disconnectDb } = await import("./db");
        await disconnectDb();
        vi.resetModules();
        prismaClients.length = 0;
        PrismaClientMock.mockClear();
    });

    it("returns the same client when called more than once", async () => {
        const { configureDb } = await import("./db");

        const firstClient = configureDb({ provider: "postgres" });
        const secondClient = configureDb({ provider: "postgres" });

        expect(firstClient).toBe(prismaClients[0]);
        expect(secondClient).toBe(firstClient);
        expect(PrismaClientMock).toHaveBeenCalledTimes(1);
    });
});
