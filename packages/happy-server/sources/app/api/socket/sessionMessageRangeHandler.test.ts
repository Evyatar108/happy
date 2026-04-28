import { beforeEach, describe, expect, it, vi } from "vitest";

type SessionRecord = {
    id: string;
    accountId: string;
};

type MessageRecord = {
    id: string;
    sessionId: string;
    seq: number;
    localId: string | null;
    content: unknown;
    createdAt: Date;
    updatedAt: Date;
};

const {
    state,
    dbMock,
    sessionFindFirst,
    sessionFindUnique,
    sessionMessageFindMany,
    sessionMessageCount,
    resetState,
    seedSession,
    seedMessage
} = vi.hoisted(() => {
    const state = {
        sessions: [] as SessionRecord[],
        messages: [] as MessageRecord[],
        nextMessageId: 1,
        nowMs: 1700000000000
    };

    const resetState = () => {
        state.sessions = [];
        state.messages = [];
        state.nextMessageId = 1;
        state.nowMs = 1700000000000;
    };

    const seedSession = (input: SessionRecord) => {
        state.sessions.push({ id: input.id, accountId: input.accountId });
    };

    const seedMessage = (input: {
        sessionId: string;
        seq: number;
        localId?: string | null;
        content?: unknown;
    }) => {
        const createdAt = new Date(state.nowMs);
        state.nowMs += 1;
        state.messages.push({
            id: `seed-${state.nextMessageId}`,
            sessionId: input.sessionId,
            seq: input.seq,
            localId: input.localId ?? null,
            content: input.content ?? { t: "encrypted", c: `c-${input.seq}` },
            createdAt,
            updatedAt: createdAt
        });
        state.nextMessageId += 1;
    };

    const selectFields = <T extends Record<string, unknown>>(row: T, select?: Record<string, boolean>) => {
        if (!select) {
            return { ...row };
        }
        const picked: Record<string, unknown> = {};
        for (const [key, enabled] of Object.entries(select)) {
            if (enabled) {
                picked[key] = row[key];
            }
        }
        return picked;
    };

    const sessionFindFirst = vi.fn(async (args: any) => {
        const row = state.sessions.find((session) => (
            session.id === args?.where?.id &&
            session.accountId === args?.where?.accountId
        ));
        if (!row) {
            return null;
        }
        return selectFields(row as unknown as Record<string, unknown>, args?.select) as Partial<SessionRecord>;
    });

    // Spy that MUST never be called by the handler — wrong-owner and
    // never-existed must both collapse via findFirst alone.
    const sessionFindUnique = vi.fn(async () => {
        throw new Error("session.findUnique must not be invoked by sessionMessageRangeHandler");
    });

    const sessionMessageFindMany = vi.fn(async (args: any) => {
        let rows = [...state.messages];
        if (args?.where?.sessionId) {
            rows = rows.filter((message) => message.sessionId === args.where.sessionId);
        }
        const seqWhere = args?.where?.seq;
        if (seqWhere) {
            if (typeof seqWhere.gte === "number") {
                rows = rows.filter((message) => message.seq >= seqWhere.gte);
            }
            if (typeof seqWhere.lte === "number") {
                rows = rows.filter((message) => message.seq <= seqWhere.lte);
            }
            if (typeof seqWhere.gt === "number") {
                rows = rows.filter((message) => message.seq > seqWhere.gt);
            }
        }
        if (args?.orderBy?.seq === "asc") {
            rows.sort((a, b) => a.seq - b.seq);
        }
        if (typeof args?.take === "number") {
            rows = rows.slice(0, args.take);
        }
        return rows.map((row) => selectFields(row as unknown as Record<string, unknown>, args?.select));
    });

    // Spy that MUST never be called: empty-result short-circuit forbids any
    // follow-up count/existence query.
    const sessionMessageCount = vi.fn(async () => {
        throw new Error("sessionMessage.count must not be invoked by sessionMessageRangeHandler");
    });

    const dbMock = {
        session: {
            findFirst: sessionFindFirst,
            findUnique: sessionFindUnique
        },
        sessionMessage: {
            findMany: sessionMessageFindMany,
            count: sessionMessageCount
        }
    };

    return {
        state,
        dbMock,
        sessionFindFirst,
        sessionFindUnique,
        sessionMessageFindMany,
        sessionMessageCount,
        resetState,
        seedSession,
        seedMessage
    };
});

vi.mock("@/storage/db", () => ({
    db: dbMock
}));

vi.mock("@/utils/log", () => ({
    log: vi.fn()
}));

import { sessionMessageRangeHandler } from "./sessionMessageRangeHandler";

interface FakeSocket {
    listeners: Map<string, (data: unknown, callback?: (response: unknown) => void) => void>;
    on: (event: string, listener: (data: unknown, callback?: (response: unknown) => void) => void) => void;
}

function createSocket(): FakeSocket {
    const listeners = new Map<string, (data: unknown, callback?: (response: unknown) => void) => void>();
    return {
        listeners,
        on: (event, listener) => {
            listeners.set(event, listener);
        }
    };
}

async function callHandler(socket: FakeSocket, data: unknown): Promise<any> {
    const listener = socket.listeners.get("session-message-range");
    if (!listener) {
        throw new Error("session-message-range listener not registered");
    }
    return await new Promise<any>((resolve) => {
        listener(data, (response) => resolve(response));
    });
}

describe("sessionMessageRangeHandler", () => {
    let socket: FakeSocket;

    beforeEach(() => {
        resetState();
        sessionFindFirst.mockClear();
        sessionFindUnique.mockClear();
        sessionMessageFindMany.mockClear();
        sessionMessageCount.mockClear();
    });

    it("collapses wrong-owner and never-existed into byte-identical session_not_found, never invokes findUnique", async () => {
        // Account A owns session-1.
        seedSession({ id: "session-1", accountId: "user-A" });

        // Account B requests session-1 — wrong owner.
        socket = createSocket();
        sessionMessageRangeHandler("user-B", socket as any);
        const wrongOwner = await callHandler(socket, {
            requestId: "req-1",
            sessionId: "session-1",
            fromSeq: 0,
            toSeq: 100,
            limit: 50
        });

        // Same userId requests a sessionId that never existed.
        socket = createSocket();
        sessionMessageRangeHandler("user-B", socket as any);
        const neverExisted = await callHandler(socket, {
            requestId: "req-1",
            sessionId: "session-1",
            fromSeq: 0,
            toSeq: 100,
            limit: 50
        });

        expect(wrongOwner).toEqual({
            ok: false,
            requestId: "req-1",
            error: { code: "session_not_found", message: "Session not found" }
        });
        // Byte-identical payloads.
        expect(JSON.stringify(neverExisted)).toBe(JSON.stringify(wrongOwner));

        // Handler MUST NEVER perform a global-by-id lookup.
        expect(sessionFindUnique).not.toHaveBeenCalled();
        // findFirst MUST be account-scoped.
        for (const call of sessionFindFirst.mock.calls) {
            expect(call[0]?.where?.accountId).toBeDefined();
        }
    });

    it("empty-result range returns hasMore: false without issuing a separate count query", async () => {
        seedSession({ id: "session-1", accountId: "user-1" });
        // Seed messages outside the requested range.
        seedMessage({ sessionId: "session-1", seq: 200 });
        seedMessage({ sessionId: "session-1", seq: 201 });

        socket = createSocket();
        sessionMessageRangeHandler("user-1", socket as any);

        const response = await callHandler(socket, {
            requestId: "req-empty",
            sessionId: "session-1",
            fromSeq: 0,
            toSeq: 50,
            limit: 100
        });

        expect(response).toEqual({
            ok: true,
            requestId: "req-empty",
            sessionId: "session-1",
            fromSeq: 0,
            toSeq: 50,
            messages: [],
            hasMore: false
        });
        expect(sessionMessageFindMany).toHaveBeenCalledTimes(1);
        expect(sessionMessageCount).not.toHaveBeenCalled();
    });

    it("rejects invalid_range for toSeq < fromSeq, limit = 0, and limit = 201", async () => {
        seedSession({ id: "session-1", accountId: "user-1" });
        socket = createSocket();
        sessionMessageRangeHandler("user-1", socket as any);

        const cases: Array<{ label: string; payload: any }> = [
            {
                label: "toSeq < fromSeq",
                payload: {
                    requestId: "r-a",
                    sessionId: "session-1",
                    fromSeq: 100,
                    toSeq: 50,
                    limit: 50
                }
            },
            {
                label: "limit = 0",
                payload: {
                    requestId: "r-b",
                    sessionId: "session-1",
                    fromSeq: 0,
                    toSeq: 100,
                    limit: 0
                }
            },
            {
                label: "limit = 201",
                payload: {
                    requestId: "r-c",
                    sessionId: "session-1",
                    fromSeq: 0,
                    toSeq: 100,
                    limit: 201
                }
            }
        ];

        for (const { payload } of cases) {
            const response = await callHandler(socket, payload);
            expect(response.ok).toBe(false);
            expect(response.error.code).toBe("invalid_range");
            expect(response.requestId).toBe(payload.requestId);
        }

        // None of the invalid_range cases should reach Prisma.
        expect(sessionFindFirst).not.toHaveBeenCalled();
        expect(sessionMessageFindMany).not.toHaveBeenCalled();
    });

    it("happy path: returns sorted encrypted blobs and hasMore: true when rows.length > limit", async () => {
        seedSession({ id: "session-1", accountId: "user-1" });
        // Seed seq=1..10 in scrambled order to verify ordering.
        const order = [3, 7, 1, 9, 4, 10, 2, 8, 5, 6];
        for (const seq of order) {
            seedMessage({
                sessionId: "session-1",
                seq,
                localId: `l-${seq}`,
                content: { t: "encrypted", c: `enc-${seq}` }
            });
        }

        socket = createSocket();
        sessionMessageRangeHandler("user-1", socket as any);

        const response = await callHandler(socket, {
            requestId: "req-happy",
            sessionId: "session-1",
            fromSeq: 1,
            toSeq: 10,
            limit: 5
        });

        expect(response.ok).toBe(true);
        expect(response.requestId).toBe("req-happy");
        expect(response.sessionId).toBe("session-1");
        expect(response.fromSeq).toBe(1);
        expect(response.toSeq).toBe(10);
        expect(response.hasMore).toBe(true);
        expect(response.messages).toHaveLength(5);
        expect(response.messages.map((m: any) => m.seq)).toEqual([1, 2, 3, 4, 5]);
        // Server returned encrypted blobs as-is.
        expect(response.messages[0].content).toEqual({ t: "encrypted", c: "enc-1" });
        expect(response.messages[4].content).toEqual({ t: "encrypted", c: "enc-5" });

        // The fetch was issued with take: limit + 1.
        const findManyArgs = sessionMessageFindMany.mock.calls[0][0];
        expect(findManyArgs.take).toBe(6);
        expect(findManyArgs.where.seq).toEqual({ gte: 1, lte: 10 });
        expect(findManyArgs.orderBy).toEqual({ seq: "asc" });
    });

    it("happy path: returns hasMore: false when rows.length === limit (exactly fits)", async () => {
        seedSession({ id: "session-1", accountId: "user-1" });
        for (let seq = 1; seq <= 5; seq += 1) {
            seedMessage({ sessionId: "session-1", seq });
        }

        socket = createSocket();
        sessionMessageRangeHandler("user-1", socket as any);

        const response = await callHandler(socket, {
            requestId: "req-fit",
            sessionId: "session-1",
            fromSeq: 1,
            toSeq: 10,
            limit: 5
        });

        expect(response.ok).toBe(true);
        expect(response.hasMore).toBe(false);
        expect(response.messages).toHaveLength(5);
    });
});
