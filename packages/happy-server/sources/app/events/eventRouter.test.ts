import { EventEmitter } from "events";
import { readFileSync } from "fs";
import { resolve } from "path";
import { beforeEach, describe, expect, it } from "vitest";
import {
    __forceEventRouterReplayStateForTests,
    __getEventRouterReplayStateForTests,
    __resetEventRouterReplayStateForTests,
    createEventRouter
} from "./eventRouter";
import type { ClientConnection, RecipientFilter, UpdatePayload } from "./eventRouter";

// Producer coverage for US-005b: route handler (v3SessionRoutes) and socket
// handler (machineUpdateHandler) receive EventRouter via parameters; this file
// verifies the shared sink/bus semantics they depend on.

type FakeSocket = {
    id: string;
    rooms: Set<string>;
    received: Array<{ eventName: string; payload: unknown }>;
    join: (room: string) => void;
    broadcast: {
        to: (rooms: string[]) => { emit: (eventName: string, payload: unknown) => void };
    };
};

function createSocket(id: string, io: FakeIo): FakeSocket {
    const socket: FakeSocket = {
        id,
        rooms: new Set(),
        received: [],
        join(room) {
            socket.rooms.add(room);
        },
        broadcast: {
            to(rooms) {
                return {
                    emit(eventName, payload) {
                        io.emitToRooms(rooms, eventName, payload, socket);
                    }
                };
            }
        }
    };
    io.sockets.push(socket);
    return socket;
}

class FakeIo {
    sockets: FakeSocket[] = [];

    to(rooms: string[]) {
        return {
            emit: (eventName: string, payload: unknown) => {
                this.emitToRooms(rooms, eventName, payload);
            }
        };
    }

    emitToRooms(rooms: string[], eventName: string, payload: unknown, skip?: FakeSocket) {
        const roomSet = new Set(rooms);
        for (const socket of this.sockets) {
            if (socket === skip) {
                continue;
            }
            if ([...socket.rooms].some((room) => roomSet.has(room))) {
                socket.received.push({ eventName, payload });
            }
        }
    }
}

function createUpdatePayload(seq: number): UpdatePayload {
    return {
        id: `update-${seq}`,
        seq,
        body: { t: "update-account", userId: "user-1" },
        createdAt: 1700000000000 + seq
    };
}

function userConnection(socket: FakeSocket): ClientConnection {
    return {
        connectionType: "user-scoped",
        socket: socket as any,
        userId: "user-1"
    };
}

function sessionConnection(socket: FakeSocket, sessionId: string): ClientConnection {
    return {
        connectionType: "session-scoped",
        socket: socket as any,
        userId: "user-1",
        sessionId
    };
}

function machineConnection(socket: FakeSocket, machineId: string): ClientConnection {
    return {
        connectionType: "machine-scoped",
        socket: socket as any,
        userId: "user-1",
        machineId
    };
}

describe("createEventRouter", () => {
    beforeEach(() => {
        __resetEventRouterReplayStateForTests();
    });

    it("fans events from one listener sink to both listener sinks through the shared bus", () => {
        const bus = new EventEmitter();
        const io1 = new FakeIo();
        const io2 = new FakeIo();
        const router1 = createEventRouter(io1 as any, bus);
        const router2 = createEventRouter(io2 as any, bus);
        const socket1 = createSocket("listener-1-user", io1);
        const socket2 = createSocket("listener-2-user", io2);

        router1.addConnection("user-1", {
            connectionType: "user-scoped",
            socket: socket1 as any,
            userId: "user-1"
        });
        router2.addConnection("user-1", {
            connectionType: "user-scoped",
            socket: socket2 as any,
            userId: "user-1"
        });

        router1.emitUpdate({
            userId: "user-1",
            payload: {
                id: "update-1",
                seq: 1,
                body: { t: "update-account", userId: "user-1" },
                createdAt: 1700000000000
            },
            recipientFilter: { type: "user-scoped-only" }
        });

        expect(socket1.received).toHaveLength(1);
        expect(socket2.received).toHaveLength(1);
        expect(socket1.received[0].eventName).toBe("update");
        expect(socket2.received[0].payload).toEqual(socket1.received[0].payload);

        router1.close();
        router2.close();
    });

    it("applies skipSenderConnection only on the originating listener sink", () => {
        const bus = new EventEmitter();
        const io1 = new FakeIo();
        const io2 = new FakeIo();
        const router1 = createEventRouter(io1 as any, bus);
        const router2 = createEventRouter(io2 as any, bus);
        const sender = createSocket("sender", io1);
        const peer = createSocket("peer", io1);
        const remote = createSocket("remote", io2);

        for (const [router, socket] of [[router1, sender], [router1, peer], [router2, remote]] as const) {
            router.addConnection("user-1", {
                connectionType: "user-scoped",
                socket: socket as any,
                userId: "user-1"
            });
        }

        router1.emitEphemeral({
            userId: "user-1",
            payload: { type: "usage", id: "session-1", key: "tokens", tokens: {}, cost: {}, timestamp: 1700000000000 },
            recipientFilter: { type: "user-scoped-only" },
            skipSenderConnection: {
                connectionType: "user-scoped",
                socket: sender as any,
                userId: "user-1"
            }
        });

        expect(sender.received).toHaveLength(0);
        expect(peer.received).toHaveLength(1);
        expect(remote.received).toHaveLength(1);

        router1.close();
        router2.close();
    });

    it("keeps representative route and socket producers on injected routers", () => {
        const root = resolve(__dirname, "../..");
        const v3SessionRoutes = readFileSync(resolve(root, "app/api/routes/v3SessionRoutes.ts"), "utf8");
        const machineUpdateHandler = readFileSync(resolve(root, "app/api/socket/machineUpdateHandler.ts"), "utf8");

        expect(v3SessionRoutes).toContain("export function v3SessionRoutes(app: Fastify, eventRouter: EventRouter)");
        expect(machineUpdateHandler).toContain("export function machineUpdateHandler(userId: string, socket: Socket, eventRouter: EventRouter)");
        expect(v3SessionRoutes).not.toContain("import { buildNewMessageUpdate, eventRouter }");
        expect(machineUpdateHandler).not.toContain("import { eventRouter }");
    });

    it("replays buffered default-filter updates without publishing to existing sockets", () => {
        const bus = new EventEmitter();
        const io = new FakeIo();
        const router = createEventRouter(io as any, bus);
        const attached = createSocket("attached", io);
        const reconnecting = createSocket("reconnecting", io);

        router.addConnection("user-1", userConnection(attached));

        for (let seq = 1; seq <= 10; seq += 1) {
            router.emitUpdate({
                userId: "user-1",
                payload: createUpdatePayload(seq)
            });
        }

        expect(attached.received).toHaveLength(10);

        const replay = router.getReplayForConnection(5, userConnection(reconnecting));

        expect(replay.overflow).toBe(false);
        expect(replay.currentSeq).toBe(10);
        expect(replay.events.map((event) => event.seq)).toEqual([6, 7, 8, 9, 10]);
        expect(attached.received).toHaveLength(10);
        expect(reconnecting.received).toHaveLength(0);

        router.close();
    });

    it("caps the replay buffer at 1024 entries and overflows when the resume seq is older than the buffer", () => {
        const router = createEventRouter(new FakeIo() as any, new EventEmitter());
        const reconnecting = createSocket("reconnecting", new FakeIo());

        for (let seq = 1; seq <= 2000; seq += 1) {
            router.emitUpdate({
                userId: "user-1",
                payload: createUpdatePayload(seq)
            });
        }

        const state = __getEventRouterReplayStateForTests();
        expect(state.replayBuffer).toHaveLength(1024);
        expect(state.replayBuffer[0].payload.seq).toBe(977);
        expect(state.currentSeq).toBe(2000);

        const replay = router.getReplayForConnection(0, userConnection(reconnecting));
        expect(replay).toEqual({ events: [], overflow: true, currentSeq: 2000 });

        router.close();
    });

    it("matches replay entries with the same recipient-filter matrix as live routing", () => {
        const router = createEventRouter(new FakeIo() as any, new EventEmitter());
        const filters: RecipientFilter[] = [
            { type: "all-user-authenticated-connections" },
            { type: "user-scoped-only" },
            { type: "all-interested-in-session", sessionId: "s1" },
            { type: "machine-scoped-only", machineId: "m1" }
        ];

        router.emitUpdate({ userId: "user-1", payload: createUpdatePayload(1) });
        filters.forEach((recipientFilter, index) => {
            router.emitUpdate({
                userId: "user-1",
                payload: createUpdatePayload(index + 2),
                recipientFilter
            });
        });

        const io = new FakeIo();
        const cases: Array<{ connection: ClientConnection; expectedSeqs: number[] }> = [
            { connection: userConnection(createSocket("user", io)), expectedSeqs: [2, 3, 4, 5] },
            { connection: sessionConnection(createSocket("session-s1", io), "s1"), expectedSeqs: [2, 4] },
            { connection: sessionConnection(createSocket("session-s2", io), "s2"), expectedSeqs: [2] },
            { connection: machineConnection(createSocket("machine-m1", io), "m1"), expectedSeqs: [2, 5] },
            { connection: machineConnection(createSocket("machine-m2", io), "m2"), expectedSeqs: [2] }
        ];

        for (const item of cases) {
            const replay = router.getReplayForConnection(1, item.connection);
            expect(replay.overflow).toBe(false);
            expect(replay.events.map((event) => event.seq)).toEqual(item.expectedSeqs);
        }

        router.close();
    });

    it("detects daemon-restart replay shapes without treating a fresh daemon as overflow", () => {
        const io = new FakeIo();
        const connection = userConnection(createSocket("reconnecting", io));
        const router = createEventRouter(io as any, new EventEmitter());

        __forceEventRouterReplayStateForTests({
            replayBuffer: [{ payload: createUpdatePayload(10), recipientFilter: { type: "all-user-authenticated-connections" }, createdAt: 1700000000010 }],
            currentSeq: 10
        });
        expect(router.getReplayForConnection(11, connection)).toEqual({ events: [], overflow: true, currentSeq: 10 });

        __forceEventRouterReplayStateForTests({ replayBuffer: [], currentSeq: 10 });
        expect(router.getReplayForConnection(11, connection)).toEqual({ events: [], overflow: true, currentSeq: 10 });

        __resetEventRouterReplayStateForTests();
        expect(router.getReplayForConnection(10, connection)).toEqual({ events: [], overflow: false, currentSeq: 0 });

        router.close();
    });
});
