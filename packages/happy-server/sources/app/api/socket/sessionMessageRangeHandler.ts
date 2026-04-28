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
 * Mirrors the ownership and pagination semantics of v3SessionRoutes.ts:
 *  - account-scoped findFirst({ id, accountId }) — single lookup. Wrong-owner
 *    AND never-existed both collapse to a byte-identical session_not_found
 *    response so the handler does not leak information about session
 *    existence (no global-by-id lookup is ever performed).
 *  - take: limit + 1 / hasMore = rows.length > limit pagination pattern.
 *  - Empty-result short-circuit: when the primary message-fetch returns zero
 *    rows we resolve to { ok: true, messages: [], hasMore: false } directly
 *    without issuing a separate count or existence query.
 *  - Returns encrypted blobs as-is; never decrypts.
 *
 * Validation is performed by SessionMessageRangeRequestSchema from
 * @slopus/happy-wire so the wire shape stays in lock-step with the client.
 * Range validation failures (toSeq < fromSeq, limit outside 1..200) collapse
 * to a single invalid_range error code.
 */
export function sessionMessageRangeHandler(userId: string, socket: Socket) {
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

            // Account-scoped lookup ONLY. Wrong-owner and never-existed both
            // resolve to byte-identical session_not_found.
            const session = await db.session.findFirst({
                where: {
                    id: sessionId,
                    accountId: userId
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

            // Empty-result invariant: short-circuit, no follow-up count query.
            if (rows.length === 0) {
                callback({
                    ok: true,
                    requestId,
                    sessionId,
                    fromSeq,
                    toSeq,
                    messages: [],
                    hasMore: false
                });
                return;
            }

            const hasMore = rows.length > limit;
            const page = hasMore ? rows.slice(0, limit) : rows;

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
