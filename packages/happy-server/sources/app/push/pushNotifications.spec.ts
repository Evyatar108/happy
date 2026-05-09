import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => {
    const pushToken = {
        findMany: vi.fn(),
        upsert: vi.fn(),
        deleteMany: vi.fn(),
    };
    return {
        dbMock: { pushToken },
    };
});

vi.mock("@/storage/db", () => ({
    db: dbMock,
}));

vi.mock("@/utils/log", () => ({
    log: vi.fn(),
}));

import { registerPushToken, sendSessionPushEvent } from "./pushNotifications";

describe("pushNotifications", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("stores push registrations by machine and device", async () => {
        dbMock.pushToken.upsert.mockResolvedValue({ id: "token-1" });

        await registerPushToken({
            machineId: "machine-a",
            deviceId: "device-a",
            expoPushToken: "ExponentPushToken[token-a]",
        });

        expect(dbMock.pushToken.upsert).toHaveBeenCalledWith(expect.objectContaining({
            where: {
                machineId_deviceId: {
                    machineId: "machine-a",
                    deviceId: "device-a",
                },
            },
            create: expect.objectContaining({
                machineId: "machine-a",
                deviceId: "device-a",
                expoPushToken: "ExponentPushToken[token-a]",
            }),
            update: expect.objectContaining({
                expoPushToken: "ExponentPushToken[token-a]",
            }),
        }));
    });

    it("posts codex-finish notifications directly to Expo with machine/session summary data", async () => {
        dbMock.pushToken.findMany.mockResolvedValue([{ expoPushToken: "ExponentPushToken[token-a]" }]);
        const fetchMock = vi.fn(async () => ({
            ok: true,
            status: 200,
            text: async () => "ok",
        }));

        await sendSessionPushEvent({
            machineId: "machine-a",
            sessionId: "session-a",
            kind: "codex-finish",
            summary: "Review finished",
        }, fetchMock);

        expect(fetchMock).toHaveBeenCalledOnce();
        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
        expect(url).toBe("https://exp.host/--/api/v2/push/send");
        const body = JSON.parse(init.body);
        expect(body).toMatchObject({
            to: "ExponentPushToken[token-a]",
            title: "It's ready!",
            body: "Review finished",
            data: {
                machineId: "machine-a",
                sessionId: "session-a",
                summary: "Review finished",
                kind: "codex-finish",
            },
        });
    });
});
