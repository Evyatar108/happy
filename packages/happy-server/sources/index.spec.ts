import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp } from "fs/promises";
import os from "os";
import path from "path";
import { encodeBase64 } from "privacy-kit";
import { bootstrapMachineForEmbedded, createApp, type HappyServerHandle } from "./index";
import { db, getPGlite } from "./storage/db";
import { machineUpdateHandler } from "./app/api/socket/machineUpdateHandler";

async function createMachineTable() {
    const pglite = getPGlite();
    if (!pglite) {
        throw new Error("PGlite was not configured");
    }

    await pglite.exec(`
        CREATE TABLE IF NOT EXISTS "Machine" (
            "id" TEXT PRIMARY KEY,
            "metadata" TEXT NOT NULL,
            "metadataVersion" INTEGER NOT NULL DEFAULT 0,
            "daemonState" TEXT,
            "daemonStateVersion" INTEGER NOT NULL DEFAULT 0,
            "dataEncryptionKey" BYTEA,
            "seq" INTEGER NOT NULL DEFAULT 0,
            "active" BOOLEAN NOT NULL DEFAULT true,
            "lastActiveAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    `);
}

describe("bootstrapMachineForEmbedded", () => {
    let server: HappyServerHandle | null = null;

    afterEach(async () => {
        await server?.stop();
        server = null;
    });

    it("throws a descriptive error before the embedded PGlite database is configured", async () => {
        await expect(bootstrapMachineForEmbedded({
            machineId: "machine-before-start",
            metadata: "encrypted-metadata",
            daemonState: "encrypted-daemon-state",
        })).rejects.toThrow("Embedded PGlite database is not configured; call createApp(...).start() before bootstrapMachineForEmbedded().");
    });

    it("upserts an embedded Machine row with encrypted payload versions and data key", async () => {
        const dataDir = await mkdtemp(path.join(os.tmpdir(), "happy-server-embedded-"));
        server = createApp({
            dataDir,
            port: 0,
            machineKey: "test-machine-key",
            localUserId: "local-user",
        });
        await server.start();
        await createMachineTable();

        const dataEncryptionKey = new Uint8Array([1, 2, 3, 4]);
        await bootstrapMachineForEmbedded({
            machineId: "machine-1",
            metadata: "encrypted-metadata",
            daemonState: "encrypted-daemon-state",
            dataEncryptionKeyBase64: encodeBase64(dataEncryptionKey),
        });
        await bootstrapMachineForEmbedded({
            machineId: "machine-1",
            metadata: "ignored-on-existing-row",
            daemonState: "ignored-on-existing-row",
            dataEncryptionKeyBase64: encodeBase64(new Uint8Array([9, 9, 9])),
        });

        const row = await db.machine.findUniqueOrThrow({ where: { id: "machine-1" } });
        expect(row).toMatchObject({
            id: "machine-1",
            metadata: "encrypted-metadata",
            metadataVersion: 1,
            daemonState: "encrypted-daemon-state",
            daemonStateVersion: 1,
        });
        expect(Array.from(row.dataEncryptionKey ?? [])).toEqual([1, 2, 3, 4]);
    }, 20_000);

    it("allows machine-update-state after embedded bootstrap for data-key and legacy machines", async () => {
        const dataDir = await mkdtemp(path.join(os.tmpdir(), "happy-server-embedded-"));
        server = createApp({
            dataDir,
            port: 0,
            machineKey: "test-machine-key",
            localUserId: "local-user",
        });
        await server.start();
        await createMachineTable();

        await bootstrapMachineForEmbedded({
            machineId: "machine-data-key",
            metadata: "encrypted-metadata",
            daemonState: "encrypted-daemon-state",
            dataEncryptionKeyBase64: encodeBase64(new Uint8Array([1, 2, 3, 4])),
        });
        await bootstrapMachineForEmbedded({
            machineId: "machine-legacy",
            metadata: "encrypted-metadata",
            daemonState: "encrypted-daemon-state",
            dataEncryptionKeyBase64: null,
        });

        await expect(triggerMachineUpdateState("machine-data-key", "next-state", 1)).resolves.toEqual({
            result: "success",
            version: 2,
            daemonState: "next-state",
        });
        await expect(triggerMachineUpdateState("machine-legacy", "legacy-next-state", 1)).resolves.toEqual({
            result: "success",
            version: 2,
            daemonState: "legacy-next-state",
        });
    }, 20_000);
});

async function triggerMachineUpdateState(machineId: string, encryptedDaemonState: string, expectedVersion: number) {
    const handlers = new Map<string, (...args: any[]) => void>();
    const socket = {
        data: { happyClient: "cli-daemon/test" },
        on: (event: string, handler: (...args: any[]) => void) => handlers.set(event, handler),
    } as any;
    const eventRouter = { emitEphemeral: () => undefined, emitUpdate: () => undefined } as any;
    machineUpdateHandler("local-user", socket, eventRouter);
    const handler = handlers.get("machine-update-state");
    if (!handler) throw new Error("machine-update-state handler was not registered");

    return await new Promise(resolve => {
        handler({ machineId, daemonState: encryptedDaemonState, expectedVersion }, resolve);
    });
}
