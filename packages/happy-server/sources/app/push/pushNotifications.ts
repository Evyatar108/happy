import { db } from "@/storage/db";
import { log } from "@/utils/log";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export interface RegisterPushTokenInput {
    machineId: string;
    deviceId: string;
    expoPushToken: string;
}

export interface SessionPushEventInput {
    machineId: string;
    sessionId: string;
    kind: "new-session" | "status-change" | "agent-message" | "codex-finish";
    summary?: string | null;
}

export type PushFetch = (url: string, init: {
    method: string;
    headers: Record<string, string>;
    body: string;
}) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export async function registerPushToken(input: RegisterPushTokenInput) {
    const now = new Date();
    return db.pushToken.upsert({
        where: {
            machineId_deviceId: {
                machineId: input.machineId,
                deviceId: input.deviceId,
            },
        },
        create: {
            machineId: input.machineId,
            deviceId: input.deviceId,
            expoPushToken: input.expoPushToken,
            createdAt: now,
            updatedAt: now,
        },
        update: {
            expoPushToken: input.expoPushToken,
            updatedAt: now,
        },
    });
}

export async function unregisterPushToken(machineId: string, expoPushToken: string): Promise<void> {
    await db.pushToken.deleteMany({
        where: {
            machineId,
            expoPushToken,
        },
    });
}

export async function listPushTokens(machineId: string) {
    return db.pushToken.findMany({
        where: { machineId },
        orderBy: { createdAt: "desc" },
    });
}

function titleForPushKind(kind: SessionPushEventInput["kind"]): string {
    switch (kind) {
        case "new-session":
            return "New session";
        case "status-change":
            return "Session updated";
        case "agent-message":
            return "New agent message";
        case "codex-finish":
            return "It's ready!";
    }
}

export async function sendSessionPushEvent(input: SessionPushEventInput, fetchImpl: PushFetch = fetch): Promise<void> {
    const tokens = await listPushTokens(input.machineId);
    if (tokens.length === 0) {
        return;
    }

    const body = input.summary?.trim() || "Session";
    await Promise.all(tokens.map(async (token) => {
        try {
            const response = await fetchImpl(EXPO_PUSH_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    to: token.expoPushToken,
                    title: titleForPushKind(input.kind),
                    body,
                    data: {
                        machineId: input.machineId,
                        sessionId: input.sessionId,
                        summary: body,
                        kind: input.kind,
                        url: `/session/${encodeURIComponent(input.machineId + ":" + input.sessionId)}`,
                    },
                    sound: "default",
                    priority: "high",
                }),
            });

            if (!response.ok) {
                log({ module: "push", machineId: input.machineId, sessionId: input.sessionId, status: response.status }, await response.text());
            }
        } catch (error) {
            log({ module: "push", machineId: input.machineId, sessionId: input.sessionId }, String(error));
        }
    }));
}
