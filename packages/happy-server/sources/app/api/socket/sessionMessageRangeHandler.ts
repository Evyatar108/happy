import { Socket } from "socket.io";
import {
    SessionMessageRangeRequestSchema,
    type SessionMessageRangeResponse
} from "@slopus/happy-wire";
import { db } from "@/storage/db";
import { log } from "@/utils/log";

/**
 * session-message-range socket handler.
 *
 * Responds with the encrypted-blob range [fromSeq, toSeq] for a session.
 * Mirrors the single-tenant pagination semantics of v3SessionRoutes.ts:
 *  - session existence is checked through findFirst({ id }) before querying
 *    messages, and no global findUnique fallback is performed.
 *  - hasMore semantics: hasMore === true iff messages exist with seq strictly
 *    less than `fromSeq` for this session. The client's window is always at
 *    most `limit` messages wide, so row-count overflow inside the queried
 *    [fromSeq, toSeq] range is NOT a reliable signal — we explicitly probe
 *    seq < fromSeq via a secondary findFirst when fromSeq > 0.
 *  - Empty-result short-circuit: when the primary message-fetch returns zero
 *    rows AND fromSeq === 0 (no possible older history), we resolve to
 *    { ok: true, messages: [], hasMore: false } directly without issuing a
 *    secondary query. When fromSeq > 0 we still probe for older history so
 *    a sparse server (range hole + unloaded older edge) reports correctly.
 *  - Returns encrypted blobs as-is; never decrypts.
 *
 * Validation is performed by SessionMessageRangeRequestSchema from
 * @slopus/happy-wire so the wire shape stays in lock-step with the client.
 * Range validation failures (toSeq < fromSeq, limit outside 1..200) collapse
 * to a single invalid_range error code.
 */
export function sessionMessageRangeHandler(_userId: string, socket: Socket) {
    socket.on('session-message-range', async (data: unknown, callback?: (response: SessionMessageRangeResponse) => void) => {
        if (typeof callback !== 'function') {
            return;
        }

        // Best-effort requestId extraction so invalid_range / internal errors
        // can echo the caller's requestId even when full validation fails.
        const fallbackRequestId = (() => {
            if (data && typeof data === 'object' && 'requestId' in data) {
                const raw = (data as { requestId: unknown }).requestId;
                if (typeof raw === 'string') {
                    return raw;
                }
            }
            return '';
        })();

        try {
            const parsed = SessionMessageRangeRequestSchema.safeParse(data);
            if (!parsed.success) {
                callback({
                    ok: false,
                    requestId: fallbackRequestId,
                    error: {
                        code: 'invalid_range',
                        message: 'Invalid session-message-range request'
                    }
                });
                return;
            }

            const { requestId, sessionId, fromSeq, toSeq, limit } = parsed.data;

            const session = await db.session.findFirst({
                where: {
                    id: sessionId,
                },
                select: { id: true }
            });

            if (!session) {
                callback({
                    ok: false,
                    requestId,
                    error: {
                        code: 'session_not_found',
                        message: 'Session not found'
                    }
                });
                return;
            }

            const rows = await db.sessionMessage.findMany({
                where: {
                    sessionId,
                    seq: { gte: fromSeq, lte: toSeq }
                },
                orderBy: { seq: 'asc' },
                take: limit + 1,
                select: {
                    id: true,
                    seq: true,
                    content: true,
                    localId: true,
                    createdAt: true,
                    updatedAt: true
                }
            });

            // hasMore semantics: "messages exist with seq strictly less than
            // fromSeq". When fromSeq === 0, nothing can be < 0, so hasMore is
            // unconditionally false. Otherwise probe with a single index lookup.
            const hasMore = fromSeq > 0
                ? Boolean(await db.sessionMessage.findFirst({
                    where: {
                        sessionId,
                        seq: { lt: fromSeq }
                    },
                    select: { id: true }
                }))
                : false;

            // Empty-result short-circuit: no rows in [fromSeq, toSeq], echo
            // the (possibly true) hasMore from the secondary probe so a
            // sparse range hole still drives further pagination.
            if (rows.length === 0) {
                callback({
                    ok: true,
                    requestId,
                    sessionId,
                    fromSeq,
                    toSeq,
                    messages: [],
                    hasMore
                });
                return;
            }

            // Slice to exactly `limit` rows. The `take: limit + 1` overflow
            // exists so a future change can re-introduce row-count-based
            // signaling without re-issuing the query, but it is NOT used to
            // derive hasMore — see contract above.
            const page = rows.length > limit ? rows.slice(0, limit) : rows;

            callback({
                ok: true,
                requestId,
                sessionId,
                fromSeq,
                toSeq,
                messages: page.map((row) => ({
                    id: row.id,
                    seq: row.seq,
                    localId: row.localId,
                    content: row.content as { t: 'encrypted'; c: string },
                    createdAt: row.createdAt.getTime(),
                    updatedAt: row.updatedAt.getTime()
                })),
                hasMore
            });
        } catch (error) {
            log({ module: 'websocket', level: 'error' }, `Error in session-message-range: ${error}`);
            callback({
                ok: false,
                requestId: fallbackRequestId,
                error: {
                    code: 'internal',
                    message: 'Internal error handling session-message-range'
                }
            });
        }
    });
}
