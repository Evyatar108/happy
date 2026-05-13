import { describe, expect, it, vi } from "vitest";
import type { AgentTreeDelta } from "@slopus/happy-wire";
import type { ClientConnection, EventRouter } from "@/app/events/eventRouter";

const { getMetricsLabelsFromSocketMock } = vi.hoisted(() => ({
    getMetricsLabelsFromSocketMock: vi.fn(() => ({}))
}));

vi.mock("@/app/monitoring/metrics2", () => ({
    getMetricsLabelsFromSocket: getMetricsLabelsFromSocketMock,
    sessionAliveEventsCounter: { inc: vi.fn() },
    websocketEventsCounter: { inc: vi.fn() }
}));

vi.mock("@/app/presence/sessionCache", () => ({
    activityCache: {}
}));

vi.mock("@/storage/db", () => ({
    db: {}
}));

vi.mock("@/storage/seq", () => ({
    allocateSessionSeq: vi.fn(),
    allocateUserSeq: vi.fn()
}));

vi.mock("@/utils/lock", () => ({
    AsyncLock: class {
        async inLock<T>(fn: () => Promise<T>): Promise<T> {
            return fn();
        }
    }
}));

vi.mock("@/utils/log", () => ({
    log: vi.fn()
}));

vi.mock("@/utils/randomKeyNaked", () => ({
    randomKeyNaked: vi.fn(() => "random-key")
}));

vi.mock("@/app/push/pushNotifications", () => ({
    sendSessionPushEvent: vi.fn()
}));

import { sessionUpdateHandler } from "./sessionUpdateHandler";

type Handler = (data: unknown) => void | Promise<void>;

function createSocket() {
    const handlers = new Map<string, Handler>();
    return {
        id: "socket-1",
        handlers,
        on: vi.fn((eventName: string, handler: Handler) => {
            handlers.set(eventName, handler);
        })
    };
}

function createEventRouter(): EventRouter {
    return {
        addConnection: vi.fn(),
        removeConnection: vi.fn(),
        getReplayForConnection: vi.fn(() => ({ events: [], overflow: false, currentSeq: 0 })),
        emitUpdate: vi.fn(),
        emitEphemeral: vi.fn(),
        emitAgentTreeUpdate: vi.fn(),
        close: vi.fn()
    };
}

function createDelta(): AgentTreeDelta {
    return {
        type: "pending-spawn-started",
        seq: 1,
        callId: "call-1",
        parentThreadId: "root-thread",
        agentRole: "explorer",
        nickname: "A",
        startedAt: 1700000000000
    };
}

describe("sessionUpdateHandler agent-tree-update", () => {
    it("drops agent-tree-update from non-session-scoped connections", () => {
        const socket = createSocket();
        const eventRouter = createEventRouter();
        const connection: ClientConnection = {
            connectionType: "user-scoped",
            socket: socket as any,
            userId: "user-1"
        };

        sessionUpdateHandler("user-1", socket as any, connection, eventRouter);
        socket.handlers.get("agent-tree-update")?.({ delta: createDelta() });

        expect(eventRouter.emitAgentTreeUpdate).not.toHaveBeenCalled();
    });

    it("validates delta payloads and trusts the connection session id", () => {
        const socket = createSocket();
        const eventRouter = createEventRouter();
        const connection: ClientConnection = {
            connectionType: "session-scoped",
            socket: socket as any,
            userId: "user-1",
            sessionId: "trusted-session"
        };
        const delta = createDelta();

        sessionUpdateHandler("user-1", socket as any, connection, eventRouter);
        socket.handlers.get("agent-tree-update")?.({ sessionId: "forged-session", delta });
        socket.handlers.get("agent-tree-update")?.({ delta: { type: "unknown", seq: 2 } });

        expect(eventRouter.emitAgentTreeUpdate).toHaveBeenCalledTimes(1);
        expect(eventRouter.emitAgentTreeUpdate).toHaveBeenCalledWith({
            userId: "user-1",
            sessionId: "trusted-session",
            delta
        });
    });
});
