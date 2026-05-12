import { EventEmitter } from "events";
import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { createEventRouter } from "./eventRouter";

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

describe("createEventRouter", () => {
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
});
