import * as z from 'zod';

declare const MessageMetaSchema: z.ZodObject<{
    sentFrom: z.ZodOptional<z.ZodString>;
    permissionMode: z.ZodOptional<z.ZodEnum<["default", "acceptEdits", "bypassPermissions", "plan", "read-only", "safe-yolo", "yolo"]>>;
    model: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    fallbackModel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    customSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    appendSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    allowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
    disallowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
    displayText: z.ZodOptional<z.ZodString>;
    contextBoundaryFallback: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    sentFrom?: string | undefined;
    permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
    model?: string | null | undefined;
    fallbackModel?: string | null | undefined;
    customSystemPrompt?: string | null | undefined;
    appendSystemPrompt?: string | null | undefined;
    allowedTools?: string[] | null | undefined;
    disallowedTools?: string[] | null | undefined;
    displayText?: string | undefined;
    contextBoundaryFallback?: boolean | undefined;
}, {
    sentFrom?: string | undefined;
    permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
    model?: string | null | undefined;
    fallbackModel?: string | null | undefined;
    customSystemPrompt?: string | null | undefined;
    appendSystemPrompt?: string | null | undefined;
    allowedTools?: string[] | null | undefined;
    disallowedTools?: string[] | null | undefined;
    displayText?: string | undefined;
    contextBoundaryFallback?: boolean | undefined;
}>;
type MessageMeta = z.infer<typeof MessageMetaSchema>;

declare const SessionMessageContentSchema: z.ZodObject<{
    c: z.ZodString;
    t: z.ZodLiteral<"encrypted">;
}, "strip", z.ZodTypeAny, {
    c: string;
    t: "encrypted";
}, {
    c: string;
    t: "encrypted";
}>;
type SessionMessageContent = z.infer<typeof SessionMessageContentSchema>;
declare const SessionMessageSchema: z.ZodObject<{
    id: z.ZodString;
    seq: z.ZodNumber;
    localId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    content: z.ZodObject<{
        c: z.ZodString;
        t: z.ZodLiteral<"encrypted">;
    }, "strip", z.ZodTypeAny, {
        c: string;
        t: "encrypted";
    }, {
        c: string;
        t: "encrypted";
    }>;
    createdAt: z.ZodNumber;
    updatedAt: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    content: {
        c: string;
        t: "encrypted";
    };
    id: string;
    seq: number;
    createdAt: number;
    updatedAt: number;
    localId?: string | null | undefined;
}, {
    content: {
        c: string;
        t: "encrypted";
    };
    id: string;
    seq: number;
    createdAt: number;
    updatedAt: number;
    localId?: string | null | undefined;
}>;
type SessionMessage = z.infer<typeof SessionMessageSchema>;

declare const SessionMessageRangeRequestSchema: z.ZodEffects<z.ZodObject<{
    requestId: z.ZodString;
    sessionId: z.ZodString;
    fromSeq: z.ZodNumber;
    toSeq: z.ZodNumber;
    limit: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    requestId: string;
    sessionId: string;
    fromSeq: number;
    toSeq: number;
    limit: number;
}, {
    requestId: string;
    sessionId: string;
    fromSeq: number;
    toSeq: number;
    limit: number;
}>, {
    requestId: string;
    sessionId: string;
    fromSeq: number;
    toSeq: number;
    limit: number;
}, {
    requestId: string;
    sessionId: string;
    fromSeq: number;
    toSeq: number;
    limit: number;
}>;
type SessionMessageRangeRequest = z.infer<typeof SessionMessageRangeRequestSchema>;
declare const SessionMessageRangeResponseSchema: z.ZodDiscriminatedUnion<"ok", [z.ZodObject<{
    ok: z.ZodLiteral<true>;
    requestId: z.ZodString;
    sessionId: z.ZodString;
    fromSeq: z.ZodNumber;
    toSeq: z.ZodNumber;
    messages: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        seq: z.ZodNumber;
        localId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        content: z.ZodObject<{
            c: z.ZodString;
            t: z.ZodLiteral<"encrypted">;
        }, "strip", z.ZodTypeAny, {
            c: string;
            t: "encrypted";
        }, {
            c: string;
            t: "encrypted";
        }>;
        createdAt: z.ZodNumber;
        updatedAt: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        content: {
            c: string;
            t: "encrypted";
        };
        id: string;
        seq: number;
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    }, {
        content: {
            c: string;
            t: "encrypted";
        };
        id: string;
        seq: number;
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    }>, "many">;
    hasMore: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    requestId: string;
    sessionId: string;
    fromSeq: number;
    toSeq: number;
    ok: true;
    messages: {
        content: {
            c: string;
            t: "encrypted";
        };
        id: string;
        seq: number;
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    }[];
    hasMore: boolean;
}, {
    requestId: string;
    sessionId: string;
    fromSeq: number;
    toSeq: number;
    ok: true;
    messages: {
        content: {
            c: string;
            t: "encrypted";
        };
        id: string;
        seq: number;
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    }[];
    hasMore: boolean;
}>, z.ZodObject<{
    ok: z.ZodLiteral<false>;
    requestId: z.ZodString;
    error: z.ZodObject<{
        code: z.ZodEnum<["session_not_found", "invalid_range", "rate_limited", "internal"]>;
        message: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        code: "session_not_found" | "invalid_range" | "rate_limited" | "internal";
        message: string;
    }, {
        code: "session_not_found" | "invalid_range" | "rate_limited" | "internal";
        message: string;
    }>;
}, "strip", z.ZodTypeAny, {
    requestId: string;
    ok: false;
    error: {
        code: "session_not_found" | "invalid_range" | "rate_limited" | "internal";
        message: string;
    };
}, {
    requestId: string;
    ok: false;
    error: {
        code: "session_not_found" | "invalid_range" | "rate_limited" | "internal";
        message: string;
    };
}>]>;
type SessionMessageRangeResponse = z.infer<typeof SessionMessageRangeResponseSchema>;
declare const SessionProtocolMessageSchema: z.ZodObject<{
    role: z.ZodLiteral<"session">;
    content: z.ZodEffects<z.ZodObject<{
        id: z.ZodString;
        time: z.ZodNumber;
        role: z.ZodEnum<["user", "agent"]>;
        turn: z.ZodOptional<z.ZodString>;
        subagent: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        ev: z.ZodDiscriminatedUnion<"t", [z.ZodObject<{
            t: z.ZodLiteral<"text">;
            text: z.ZodString;
            thinking: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            text: string;
            t: "text";
            thinking?: boolean | undefined;
        }, {
            text: string;
            t: "text";
            thinking?: boolean | undefined;
        }>, z.ZodObject<{
            t: z.ZodLiteral<"service">;
            text: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            text: string;
            t: "service";
        }, {
            text: string;
            t: "service";
        }>, z.ZodObject<{
            t: z.ZodLiteral<"tool-call-start">;
            call: z.ZodString;
            name: z.ZodString;
            title: z.ZodString;
            description: z.ZodString;
            args: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, "strip", z.ZodTypeAny, {
            t: "tool-call-start";
            call: string;
            name: string;
            title: string;
            description: string;
            args: Record<string, unknown>;
        }, {
            t: "tool-call-start";
            call: string;
            name: string;
            title: string;
            description: string;
            args: Record<string, unknown>;
        }>, z.ZodObject<{
            t: z.ZodLiteral<"tool-call-end">;
            call: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            t: "tool-call-end";
            call: string;
        }, {
            t: "tool-call-end";
            call: string;
        }>, z.ZodObject<{
            t: z.ZodLiteral<"file">;
            ref: z.ZodString;
            name: z.ZodString;
            size: z.ZodNumber;
            mimeType: z.ZodOptional<z.ZodString>;
            image: z.ZodOptional<z.ZodObject<{
                width: z.ZodNumber;
                height: z.ZodNumber;
                thumbhash: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                width: number;
                height: number;
                thumbhash: string;
            }, {
                width: number;
                height: number;
                thumbhash: string;
            }>>;
        }, "strip", z.ZodTypeAny, {
            t: "file";
            name: string;
            ref: string;
            size: number;
            mimeType?: string | undefined;
            image?: {
                width: number;
                height: number;
                thumbhash: string;
            } | undefined;
        }, {
            t: "file";
            name: string;
            ref: string;
            size: number;
            mimeType?: string | undefined;
            image?: {
                width: number;
                height: number;
                thumbhash: string;
            } | undefined;
        }>, z.ZodObject<{
            t: z.ZodLiteral<"turn-start">;
        }, "strip", z.ZodTypeAny, {
            t: "turn-start";
        }, {
            t: "turn-start";
        }>, z.ZodObject<{
            t: z.ZodLiteral<"start">;
            title: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            t: "start";
            title?: string | undefined;
        }, {
            t: "start";
            title?: string | undefined;
        }>, z.ZodObject<{
            t: z.ZodLiteral<"turn-end">;
            status: z.ZodEnum<["completed", "failed", "cancelled"]>;
        }, "strip", z.ZodTypeAny, {
            status: "completed" | "failed" | "cancelled";
            t: "turn-end";
        }, {
            status: "completed" | "failed" | "cancelled";
            t: "turn-end";
        }>, z.ZodObject<{
            t: z.ZodLiteral<"stop">;
        }, "strip", z.ZodTypeAny, {
            t: "stop";
        }, {
            t: "stop";
        }>, z.ZodObject<{
            t: z.ZodLiteral<"context-boundary">;
            kind: z.ZodEnum<["clear", "compact", "autocompact", "plan-mode-enter", "plan-mode-exit", "session-fork-resume"]>;
            at: z.ZodNumber;
            triggeredBy: z.ZodEnum<["user", "agent", "system"]>;
            summaryRef: z.ZodOptional<z.ZodString>;
            forkedFromSid: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            at: number;
            t: "context-boundary";
            kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
            triggeredBy: "user" | "agent" | "system";
            summaryRef?: string | undefined;
            forkedFromSid?: string | undefined;
        }, {
            at: number;
            t: "context-boundary";
            kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
            triggeredBy: "user" | "agent" | "system";
            summaryRef?: string | undefined;
            forkedFromSid?: string | undefined;
        }>]>;
    }, "strip", z.ZodTypeAny, {
        role: "user" | "agent";
        id: string;
        time: number;
        ev: {
            text: string;
            t: "text";
            thinking?: boolean | undefined;
        } | {
            text: string;
            t: "service";
        } | {
            t: "tool-call-start";
            call: string;
            name: string;
            title: string;
            description: string;
            args: Record<string, unknown>;
        } | {
            t: "tool-call-end";
            call: string;
        } | {
            t: "file";
            name: string;
            ref: string;
            size: number;
            mimeType?: string | undefined;
            image?: {
                width: number;
                height: number;
                thumbhash: string;
            } | undefined;
        } | {
            t: "turn-start";
        } | {
            t: "start";
            title?: string | undefined;
        } | {
            status: "completed" | "failed" | "cancelled";
            t: "turn-end";
        } | {
            t: "stop";
        } | {
            at: number;
            t: "context-boundary";
            kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
            triggeredBy: "user" | "agent" | "system";
            summaryRef?: string | undefined;
            forkedFromSid?: string | undefined;
        };
        turn?: string | undefined;
        subagent?: string | undefined;
    }, {
        role: "user" | "agent";
        id: string;
        time: number;
        ev: {
            text: string;
            t: "text";
            thinking?: boolean | undefined;
        } | {
            text: string;
            t: "service";
        } | {
            t: "tool-call-start";
            call: string;
            name: string;
            title: string;
            description: string;
            args: Record<string, unknown>;
        } | {
            t: "tool-call-end";
            call: string;
        } | {
            t: "file";
            name: string;
            ref: string;
            size: number;
            mimeType?: string | undefined;
            image?: {
                width: number;
                height: number;
                thumbhash: string;
            } | undefined;
        } | {
            t: "turn-start";
        } | {
            t: "start";
            title?: string | undefined;
        } | {
            status: "completed" | "failed" | "cancelled";
            t: "turn-end";
        } | {
            t: "stop";
        } | {
            at: number;
            t: "context-boundary";
            kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
            triggeredBy: "user" | "agent" | "system";
            summaryRef?: string | undefined;
            forkedFromSid?: string | undefined;
        };
        turn?: string | undefined;
        subagent?: string | undefined;
    }>, {
        role: "user" | "agent";
        id: string;
        time: number;
        ev: {
            text: string;
            t: "text";
            thinking?: boolean | undefined;
        } | {
            text: string;
            t: "service";
        } | {
            t: "tool-call-start";
            call: string;
            name: string;
            title: string;
            description: string;
            args: Record<string, unknown>;
        } | {
            t: "tool-call-end";
            call: string;
        } | {
            t: "file";
            name: string;
            ref: string;
            size: number;
            mimeType?: string | undefined;
            image?: {
                width: number;
                height: number;
                thumbhash: string;
            } | undefined;
        } | {
            t: "turn-start";
        } | {
            t: "start";
            title?: string | undefined;
        } | {
            status: "completed" | "failed" | "cancelled";
            t: "turn-end";
        } | {
            t: "stop";
        } | {
            at: number;
            t: "context-boundary";
            kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
            triggeredBy: "user" | "agent" | "system";
            summaryRef?: string | undefined;
            forkedFromSid?: string | undefined;
        };
        turn?: string | undefined;
        subagent?: string | undefined;
    }, {
        role: "user" | "agent";
        id: string;
        time: number;
        ev: {
            text: string;
            t: "text";
            thinking?: boolean | undefined;
        } | {
            text: string;
            t: "service";
        } | {
            t: "tool-call-start";
            call: string;
            name: string;
            title: string;
            description: string;
            args: Record<string, unknown>;
        } | {
            t: "tool-call-end";
            call: string;
        } | {
            t: "file";
            name: string;
            ref: string;
            size: number;
            mimeType?: string | undefined;
            image?: {
                width: number;
                height: number;
                thumbhash: string;
            } | undefined;
        } | {
            t: "turn-start";
        } | {
            t: "start";
            title?: string | undefined;
        } | {
            status: "completed" | "failed" | "cancelled";
            t: "turn-end";
        } | {
            t: "stop";
        } | {
            at: number;
            t: "context-boundary";
            kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
            triggeredBy: "user" | "agent" | "system";
            summaryRef?: string | undefined;
            forkedFromSid?: string | undefined;
        };
        turn?: string | undefined;
        subagent?: string | undefined;
    }>;
    meta: z.ZodOptional<z.ZodObject<{
        sentFrom: z.ZodOptional<z.ZodString>;
        permissionMode: z.ZodOptional<z.ZodEnum<["default", "acceptEdits", "bypassPermissions", "plan", "read-only", "safe-yolo", "yolo"]>>;
        model: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        fallbackModel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        appendSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        allowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        disallowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        displayText: z.ZodOptional<z.ZodString>;
        contextBoundaryFallback: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        contextBoundaryFallback?: boolean | undefined;
    }, {
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        contextBoundaryFallback?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    role: "session";
    content: {
        role: "user" | "agent";
        id: string;
        time: number;
        ev: {
            text: string;
            t: "text";
            thinking?: boolean | undefined;
        } | {
            text: string;
            t: "service";
        } | {
            t: "tool-call-start";
            call: string;
            name: string;
            title: string;
            description: string;
            args: Record<string, unknown>;
        } | {
            t: "tool-call-end";
            call: string;
        } | {
            t: "file";
            name: string;
            ref: string;
            size: number;
            mimeType?: string | undefined;
            image?: {
                width: number;
                height: number;
                thumbhash: string;
            } | undefined;
        } | {
            t: "turn-start";
        } | {
            t: "start";
            title?: string | undefined;
        } | {
            status: "completed" | "failed" | "cancelled";
            t: "turn-end";
        } | {
            t: "stop";
        } | {
            at: number;
            t: "context-boundary";
            kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
            triggeredBy: "user" | "agent" | "system";
            summaryRef?: string | undefined;
            forkedFromSid?: string | undefined;
        };
        turn?: string | undefined;
        subagent?: string | undefined;
    };
    meta?: {
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        contextBoundaryFallback?: boolean | undefined;
    } | undefined;
}, {
    role: "session";
    content: {
        role: "user" | "agent";
        id: string;
        time: number;
        ev: {
            text: string;
            t: "text";
            thinking?: boolean | undefined;
        } | {
            text: string;
            t: "service";
        } | {
            t: "tool-call-start";
            call: string;
            name: string;
            title: string;
            description: string;
            args: Record<string, unknown>;
        } | {
            t: "tool-call-end";
            call: string;
        } | {
            t: "file";
            name: string;
            ref: string;
            size: number;
            mimeType?: string | undefined;
            image?: {
                width: number;
                height: number;
                thumbhash: string;
            } | undefined;
        } | {
            t: "turn-start";
        } | {
            t: "start";
            title?: string | undefined;
        } | {
            status: "completed" | "failed" | "cancelled";
            t: "turn-end";
        } | {
            t: "stop";
        } | {
            at: number;
            t: "context-boundary";
            kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
            triggeredBy: "user" | "agent" | "system";
            summaryRef?: string | undefined;
            forkedFromSid?: string | undefined;
        };
        turn?: string | undefined;
        subagent?: string | undefined;
    };
    meta?: {
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        contextBoundaryFallback?: boolean | undefined;
    } | undefined;
}>;
type SessionProtocolMessage = z.infer<typeof SessionProtocolMessageSchema>;
declare const MessageContentSchema: z.ZodDiscriminatedUnion<"role", [z.ZodObject<{
    role: z.ZodLiteral<"user">;
    content: z.ZodObject<{
        type: z.ZodLiteral<"text">;
        text: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "text";
        text: string;
    }, {
        type: "text";
        text: string;
    }>;
    localKey: z.ZodOptional<z.ZodString>;
    meta: z.ZodOptional<z.ZodObject<{
        sentFrom: z.ZodOptional<z.ZodString>;
        permissionMode: z.ZodOptional<z.ZodEnum<["default", "acceptEdits", "bypassPermissions", "plan", "read-only", "safe-yolo", "yolo"]>>;
        model: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        fallbackModel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        appendSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        allowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        disallowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        displayText: z.ZodOptional<z.ZodString>;
        contextBoundaryFallback: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        contextBoundaryFallback?: boolean | undefined;
    }, {
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        contextBoundaryFallback?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    role: "user";
    content: {
        type: "text";
        text: string;
    };
    localKey?: string | undefined;
    meta?: {
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        contextBoundaryFallback?: boolean | undefined;
    } | undefined;
}, {
    role: "user";
    content: {
        type: "text";
        text: string;
    };
    localKey?: string | undefined;
    meta?: {
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        contextBoundaryFallback?: boolean | undefined;
    } | undefined;
}>, z.ZodObject<{
    role: z.ZodLiteral<"agent">;
    content: z.ZodObject<{
        type: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>;
    meta: z.ZodOptional<z.ZodObject<{
        sentFrom: z.ZodOptional<z.ZodString>;
        permissionMode: z.ZodOptional<z.ZodEnum<["default", "acceptEdits", "bypassPermissions", "plan", "read-only", "safe-yolo", "yolo"]>>;
        model: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        fallbackModel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        appendSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        allowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        disallowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        displayText: z.ZodOptional<z.ZodString>;
        contextBoundaryFallback: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        contextBoundaryFallback?: boolean | undefined;
    }, {
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        contextBoundaryFallback?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    role: "agent";
    content: {
        type: string;
    } & {
        [k: string]: unknown;
    };
    meta?: {
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        contextBoundaryFallback?: boolean | undefined;
    } | undefined;
}, {
    role: "agent";
    content: {
        type: string;
    } & {
        [k: string]: unknown;
    };
    meta?: {
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        contextBoundaryFallback?: boolean | undefined;
    } | undefined;
}>, z.ZodObject<{
    role: z.ZodLiteral<"session">;
    content: z.ZodEffects<z.ZodObject<{
        id: z.ZodString;
        time: z.ZodNumber;
        role: z.ZodEnum<["user", "agent"]>;
        turn: z.ZodOptional<z.ZodString>;
        subagent: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        ev: z.ZodDiscriminatedUnion<"t", [z.ZodObject<{
            t: z.ZodLiteral<"text">;
            text: z.ZodString;
            thinking: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            text: string;
            t: "text";
            thinking?: boolean | undefined;
        }, {
            text: string;
            t: "text";
            thinking?: boolean | undefined;
        }>, z.ZodObject<{
            t: z.ZodLiteral<"service">;
            text: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            text: string;
            t: "service";
        }, {
            text: string;
            t: "service";
        }>, z.ZodObject<{
            t: z.ZodLiteral<"tool-call-start">;
            call: z.ZodString;
            name: z.ZodString;
            title: z.ZodString;
            description: z.ZodString;
            args: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, "strip", z.ZodTypeAny, {
            t: "tool-call-start";
            call: string;
            name: string;
            title: string;
            description: string;
            args: Record<string, unknown>;
        }, {
            t: "tool-call-start";
            call: string;
            name: string;
            title: string;
            description: string;
            args: Record<string, unknown>;
        }>, z.ZodObject<{
            t: z.ZodLiteral<"tool-call-end">;
            call: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            t: "tool-call-end";
            call: string;
        }, {
            t: "tool-call-end";
            call: string;
        }>, z.ZodObject<{
            t: z.ZodLiteral<"file">;
            ref: z.ZodString;
            name: z.ZodString;
            size: z.ZodNumber;
            mimeType: z.ZodOptional<z.ZodString>;
            image: z.ZodOptional<z.ZodObject<{
                width: z.ZodNumber;
                height: z.ZodNumber;
                thumbhash: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                width: number;
                height: number;
                thumbhash: string;
            }, {
                width: number;
                height: number;
                thumbhash: string;
            }>>;
        }, "strip", z.ZodTypeAny, {
            t: "file";
            name: string;
            ref: string;
            size: number;
            mimeType?: string | undefined;
            image?: {
                width: number;
                height: number;
                thumbhash: string;
            } | undefined;
        }, {
            t: "file";
            name: string;
            ref: string;
            size: number;
            mimeType?: string | undefined;
            image?: {
                width: number;
                height: number;
                thumbhash: string;
            } | undefined;
        }>, z.ZodObject<{
            t: z.ZodLiteral<"turn-start">;
        }, "strip", z.ZodTypeAny, {
            t: "turn-start";
        }, {
            t: "turn-start";
        }>, z.ZodObject<{
            t: z.ZodLiteral<"start">;
            title: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            t: "start";
            title?: string | undefined;
        }, {
            t: "start";
            title?: string | undefined;
        }>, z.ZodObject<{
            t: z.ZodLiteral<"turn-end">;
            status: z.ZodEnum<["completed", "failed", "cancelled"]>;
        }, "strip", z.ZodTypeAny, {
            status: "completed" | "failed" | "cancelled";
            t: "turn-end";
        }, {
            status: "completed" | "failed" | "cancelled";
            t: "turn-end";
        }>, z.ZodObject<{
            t: z.ZodLiteral<"stop">;
        }, "strip", z.ZodTypeAny, {
            t: "stop";
        }, {
            t: "stop";
        }>, z.ZodObject<{
            t: z.ZodLiteral<"context-boundary">;
            kind: z.ZodEnum<["clear", "compact", "autocompact", "plan-mode-enter", "plan-mode-exit", "session-fork-resume"]>;
            at: z.ZodNumber;
            triggeredBy: z.ZodEnum<["user", "agent", "system"]>;
            summaryRef: z.ZodOptional<z.ZodString>;
            forkedFromSid: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            at: number;
            t: "context-boundary";
            kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
            triggeredBy: "user" | "agent" | "system";
            summaryRef?: string | undefined;
            forkedFromSid?: string | undefined;
        }, {
            at: number;
            t: "context-boundary";
            kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
            triggeredBy: "user" | "agent" | "system";
            summaryRef?: string | undefined;
            forkedFromSid?: string | undefined;
        }>]>;
    }, "strip", z.ZodTypeAny, {
        role: "user" | "agent";
        id: string;
        time: number;
        ev: {
            text: string;
            t: "text";
            thinking?: boolean | undefined;
        } | {
            text: string;
            t: "service";
        } | {
            t: "tool-call-start";
            call: string;
            name: string;
            title: string;
            description: string;
            args: Record<string, unknown>;
        } | {
            t: "tool-call-end";
            call: string;
        } | {
            t: "file";
            name: string;
            ref: string;
            size: number;
            mimeType?: string | undefined;
            image?: {
                width: number;
                height: number;
                thumbhash: string;
            } | undefined;
        } | {
            t: "turn-start";
        } | {
            t: "start";
            title?: string | undefined;
        } | {
            status: "completed" | "failed" | "cancelled";
            t: "turn-end";
        } | {
            t: "stop";
        } | {
            at: number;
            t: "context-boundary";
            kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
            triggeredBy: "user" | "agent" | "system";
            summaryRef?: string | undefined;
            forkedFromSid?: string | undefined;
        };
        turn?: string | undefined;
        subagent?: string | undefined;
    }, {
        role: "user" | "agent";
        id: string;
        time: number;
        ev: {
            text: string;
            t: "text";
            thinking?: boolean | undefined;
        } | {
            text: string;
            t: "service";
        } | {
            t: "tool-call-start";
            call: string;
            name: string;
            title: string;
            description: string;
            args: Record<string, unknown>;
        } | {
            t: "tool-call-end";
            call: string;
        } | {
            t: "file";
            name: string;
            ref: string;
            size: number;
            mimeType?: string | undefined;
            image?: {
                width: number;
                height: number;
                thumbhash: string;
            } | undefined;
        } | {
            t: "turn-start";
        } | {
            t: "start";
            title?: string | undefined;
        } | {
            status: "completed" | "failed" | "cancelled";
            t: "turn-end";
        } | {
            t: "stop";
        } | {
            at: number;
            t: "context-boundary";
            kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
            triggeredBy: "user" | "agent" | "system";
            summaryRef?: string | undefined;
            forkedFromSid?: string | undefined;
        };
        turn?: string | undefined;
        subagent?: string | undefined;
    }>, {
        role: "user" | "agent";
        id: string;
        time: number;
        ev: {
            text: string;
            t: "text";
            thinking?: boolean | undefined;
        } | {
            text: string;
            t: "service";
        } | {
            t: "tool-call-start";
            call: string;
            name: string;
            title: string;
            description: string;
            args: Record<string, unknown>;
        } | {
            t: "tool-call-end";
            call: string;
        } | {
            t: "file";
            name: string;
            ref: string;
            size: number;
            mimeType?: string | undefined;
            image?: {
                width: number;
                height: number;
                thumbhash: string;
            } | undefined;
        } | {
            t: "turn-start";
        } | {
            t: "start";
            title?: string | undefined;
        } | {
            status: "completed" | "failed" | "cancelled";
            t: "turn-end";
        } | {
            t: "stop";
        } | {
            at: number;
            t: "context-boundary";
            kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
            triggeredBy: "user" | "agent" | "system";
            summaryRef?: string | undefined;
            forkedFromSid?: string | undefined;
        };
        turn?: string | undefined;
        subagent?: string | undefined;
    }, {
        role: "user" | "agent";
        id: string;
        time: number;
        ev: {
            text: string;
            t: "text";
            thinking?: boolean | undefined;
        } | {
            text: string;
            t: "service";
        } | {
            t: "tool-call-start";
            call: string;
            name: string;
            title: string;
            description: string;
            args: Record<string, unknown>;
        } | {
            t: "tool-call-end";
            call: string;
        } | {
            t: "file";
            name: string;
            ref: string;
            size: number;
            mimeType?: string | undefined;
            image?: {
                width: number;
                height: number;
                thumbhash: string;
            } | undefined;
        } | {
            t: "turn-start";
        } | {
            t: "start";
            title?: string | undefined;
        } | {
            status: "completed" | "failed" | "cancelled";
            t: "turn-end";
        } | {
            t: "stop";
        } | {
            at: number;
            t: "context-boundary";
            kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
            triggeredBy: "user" | "agent" | "system";
            summaryRef?: string | undefined;
            forkedFromSid?: string | undefined;
        };
        turn?: string | undefined;
        subagent?: string | undefined;
    }>;
    meta: z.ZodOptional<z.ZodObject<{
        sentFrom: z.ZodOptional<z.ZodString>;
        permissionMode: z.ZodOptional<z.ZodEnum<["default", "acceptEdits", "bypassPermissions", "plan", "read-only", "safe-yolo", "yolo"]>>;
        model: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        fallbackModel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        appendSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        allowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        disallowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        displayText: z.ZodOptional<z.ZodString>;
        contextBoundaryFallback: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        contextBoundaryFallback?: boolean | undefined;
    }, {
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        contextBoundaryFallback?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    role: "session";
    content: {
        role: "user" | "agent";
        id: string;
        time: number;
        ev: {
            text: string;
            t: "text";
            thinking?: boolean | undefined;
        } | {
            text: string;
            t: "service";
        } | {
            t: "tool-call-start";
            call: string;
            name: string;
            title: string;
            description: string;
            args: Record<string, unknown>;
        } | {
            t: "tool-call-end";
            call: string;
        } | {
            t: "file";
            name: string;
            ref: string;
            size: number;
            mimeType?: string | undefined;
            image?: {
                width: number;
                height: number;
                thumbhash: string;
            } | undefined;
        } | {
            t: "turn-start";
        } | {
            t: "start";
            title?: string | undefined;
        } | {
            status: "completed" | "failed" | "cancelled";
            t: "turn-end";
        } | {
            t: "stop";
        } | {
            at: number;
            t: "context-boundary";
            kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
            triggeredBy: "user" | "agent" | "system";
            summaryRef?: string | undefined;
            forkedFromSid?: string | undefined;
        };
        turn?: string | undefined;
        subagent?: string | undefined;
    };
    meta?: {
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        contextBoundaryFallback?: boolean | undefined;
    } | undefined;
}, {
    role: "session";
    content: {
        role: "user" | "agent";
        id: string;
        time: number;
        ev: {
            text: string;
            t: "text";
            thinking?: boolean | undefined;
        } | {
            text: string;
            t: "service";
        } | {
            t: "tool-call-start";
            call: string;
            name: string;
            title: string;
            description: string;
            args: Record<string, unknown>;
        } | {
            t: "tool-call-end";
            call: string;
        } | {
            t: "file";
            name: string;
            ref: string;
            size: number;
            mimeType?: string | undefined;
            image?: {
                width: number;
                height: number;
                thumbhash: string;
            } | undefined;
        } | {
            t: "turn-start";
        } | {
            t: "start";
            title?: string | undefined;
        } | {
            status: "completed" | "failed" | "cancelled";
            t: "turn-end";
        } | {
            t: "stop";
        } | {
            at: number;
            t: "context-boundary";
            kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
            triggeredBy: "user" | "agent" | "system";
            summaryRef?: string | undefined;
            forkedFromSid?: string | undefined;
        };
        turn?: string | undefined;
        subagent?: string | undefined;
    };
    meta?: {
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        contextBoundaryFallback?: boolean | undefined;
    } | undefined;
}>]>;
type MessageContent = z.infer<typeof MessageContentSchema>;
declare const VersionedEncryptedValueSchema: z.ZodObject<{
    version: z.ZodNumber;
    value: z.ZodString;
}, "strip", z.ZodTypeAny, {
    value: string;
    version: number;
}, {
    value: string;
    version: number;
}>;
type VersionedEncryptedValue = z.infer<typeof VersionedEncryptedValueSchema>;
declare const VersionedNullableEncryptedValueSchema: z.ZodObject<{
    version: z.ZodNumber;
    value: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    value: string | null;
    version: number;
}, {
    value: string | null;
    version: number;
}>;
type VersionedNullableEncryptedValue = z.infer<typeof VersionedNullableEncryptedValueSchema>;
declare const UpdateNewMessageBodySchema: z.ZodObject<{
    t: z.ZodLiteral<"new-message">;
    sid: z.ZodString;
    message: z.ZodObject<{
        id: z.ZodString;
        seq: z.ZodNumber;
        localId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        content: z.ZodObject<{
            c: z.ZodString;
            t: z.ZodLiteral<"encrypted">;
        }, "strip", z.ZodTypeAny, {
            c: string;
            t: "encrypted";
        }, {
            c: string;
            t: "encrypted";
        }>;
        createdAt: z.ZodNumber;
        updatedAt: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        content: {
            c: string;
            t: "encrypted";
        };
        id: string;
        seq: number;
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    }, {
        content: {
            c: string;
            t: "encrypted";
        };
        id: string;
        seq: number;
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    message: {
        content: {
            c: string;
            t: "encrypted";
        };
        id: string;
        seq: number;
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    };
    t: "new-message";
    sid: string;
}, {
    message: {
        content: {
            c: string;
            t: "encrypted";
        };
        id: string;
        seq: number;
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    };
    t: "new-message";
    sid: string;
}>;
type UpdateNewMessageBody = z.infer<typeof UpdateNewMessageBodySchema>;
declare const UpdateSessionBodySchema: z.ZodObject<{
    t: z.ZodLiteral<"update-session">;
    id: z.ZodString;
    metadata: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        version: z.ZodNumber;
        value: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        value: string;
        version: number;
    }, {
        value: string;
        version: number;
    }>>>;
    agentState: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        version: z.ZodNumber;
        value: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        value: string | null;
        version: number;
    }, {
        value: string | null;
        version: number;
    }>>>;
}, "strip", z.ZodTypeAny, {
    t: "update-session";
    id: string;
    metadata?: {
        value: string;
        version: number;
    } | null | undefined;
    agentState?: {
        value: string | null;
        version: number;
    } | null | undefined;
}, {
    t: "update-session";
    id: string;
    metadata?: {
        value: string;
        version: number;
    } | null | undefined;
    agentState?: {
        value: string | null;
        version: number;
    } | null | undefined;
}>;
type UpdateSessionBody = z.infer<typeof UpdateSessionBodySchema>;
declare const VersionedMachineEncryptedValueSchema: z.ZodObject<{
    version: z.ZodNumber;
    value: z.ZodString;
}, "strip", z.ZodTypeAny, {
    value: string;
    version: number;
}, {
    value: string;
    version: number;
}>;
type VersionedMachineEncryptedValue = z.infer<typeof VersionedMachineEncryptedValueSchema>;
declare const UpdateMachineBodySchema: z.ZodObject<{
    t: z.ZodLiteral<"update-machine">;
    machineId: z.ZodString;
    metadata: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        version: z.ZodNumber;
        value: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        value: string;
        version: number;
    }, {
        value: string;
        version: number;
    }>>>;
    daemonState: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        version: z.ZodNumber;
        value: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        value: string;
        version: number;
    }, {
        value: string;
        version: number;
    }>>>;
    active: z.ZodOptional<z.ZodBoolean>;
    activeAt: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    t: "update-machine";
    machineId: string;
    metadata?: {
        value: string;
        version: number;
    } | null | undefined;
    daemonState?: {
        value: string;
        version: number;
    } | null | undefined;
    active?: boolean | undefined;
    activeAt?: number | undefined;
}, {
    t: "update-machine";
    machineId: string;
    metadata?: {
        value: string;
        version: number;
    } | null | undefined;
    daemonState?: {
        value: string;
        version: number;
    } | null | undefined;
    active?: boolean | undefined;
    activeAt?: number | undefined;
}>;
type UpdateMachineBody = z.infer<typeof UpdateMachineBodySchema>;
declare const CoreUpdateBodySchema: z.ZodDiscriminatedUnion<"t", [z.ZodObject<{
    t: z.ZodLiteral<"new-message">;
    sid: z.ZodString;
    message: z.ZodObject<{
        id: z.ZodString;
        seq: z.ZodNumber;
        localId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        content: z.ZodObject<{
            c: z.ZodString;
            t: z.ZodLiteral<"encrypted">;
        }, "strip", z.ZodTypeAny, {
            c: string;
            t: "encrypted";
        }, {
            c: string;
            t: "encrypted";
        }>;
        createdAt: z.ZodNumber;
        updatedAt: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        content: {
            c: string;
            t: "encrypted";
        };
        id: string;
        seq: number;
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    }, {
        content: {
            c: string;
            t: "encrypted";
        };
        id: string;
        seq: number;
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    message: {
        content: {
            c: string;
            t: "encrypted";
        };
        id: string;
        seq: number;
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    };
    t: "new-message";
    sid: string;
}, {
    message: {
        content: {
            c: string;
            t: "encrypted";
        };
        id: string;
        seq: number;
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    };
    t: "new-message";
    sid: string;
}>, z.ZodObject<{
    t: z.ZodLiteral<"update-session">;
    id: z.ZodString;
    metadata: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        version: z.ZodNumber;
        value: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        value: string;
        version: number;
    }, {
        value: string;
        version: number;
    }>>>;
    agentState: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        version: z.ZodNumber;
        value: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        value: string | null;
        version: number;
    }, {
        value: string | null;
        version: number;
    }>>>;
}, "strip", z.ZodTypeAny, {
    t: "update-session";
    id: string;
    metadata?: {
        value: string;
        version: number;
    } | null | undefined;
    agentState?: {
        value: string | null;
        version: number;
    } | null | undefined;
}, {
    t: "update-session";
    id: string;
    metadata?: {
        value: string;
        version: number;
    } | null | undefined;
    agentState?: {
        value: string | null;
        version: number;
    } | null | undefined;
}>, z.ZodObject<{
    t: z.ZodLiteral<"update-machine">;
    machineId: z.ZodString;
    metadata: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        version: z.ZodNumber;
        value: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        value: string;
        version: number;
    }, {
        value: string;
        version: number;
    }>>>;
    daemonState: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        version: z.ZodNumber;
        value: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        value: string;
        version: number;
    }, {
        value: string;
        version: number;
    }>>>;
    active: z.ZodOptional<z.ZodBoolean>;
    activeAt: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    t: "update-machine";
    machineId: string;
    metadata?: {
        value: string;
        version: number;
    } | null | undefined;
    daemonState?: {
        value: string;
        version: number;
    } | null | undefined;
    active?: boolean | undefined;
    activeAt?: number | undefined;
}, {
    t: "update-machine";
    machineId: string;
    metadata?: {
        value: string;
        version: number;
    } | null | undefined;
    daemonState?: {
        value: string;
        version: number;
    } | null | undefined;
    active?: boolean | undefined;
    activeAt?: number | undefined;
}>]>;
type CoreUpdateBody = z.infer<typeof CoreUpdateBodySchema>;
declare const CoreUpdateContainerSchema: z.ZodObject<{
    id: z.ZodString;
    seq: z.ZodNumber;
    body: z.ZodDiscriminatedUnion<"t", [z.ZodObject<{
        t: z.ZodLiteral<"new-message">;
        sid: z.ZodString;
        message: z.ZodObject<{
            id: z.ZodString;
            seq: z.ZodNumber;
            localId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            content: z.ZodObject<{
                c: z.ZodString;
                t: z.ZodLiteral<"encrypted">;
            }, "strip", z.ZodTypeAny, {
                c: string;
                t: "encrypted";
            }, {
                c: string;
                t: "encrypted";
            }>;
            createdAt: z.ZodNumber;
            updatedAt: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            content: {
                c: string;
                t: "encrypted";
            };
            id: string;
            seq: number;
            createdAt: number;
            updatedAt: number;
            localId?: string | null | undefined;
        }, {
            content: {
                c: string;
                t: "encrypted";
            };
            id: string;
            seq: number;
            createdAt: number;
            updatedAt: number;
            localId?: string | null | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        message: {
            content: {
                c: string;
                t: "encrypted";
            };
            id: string;
            seq: number;
            createdAt: number;
            updatedAt: number;
            localId?: string | null | undefined;
        };
        t: "new-message";
        sid: string;
    }, {
        message: {
            content: {
                c: string;
                t: "encrypted";
            };
            id: string;
            seq: number;
            createdAt: number;
            updatedAt: number;
            localId?: string | null | undefined;
        };
        t: "new-message";
        sid: string;
    }>, z.ZodObject<{
        t: z.ZodLiteral<"update-session">;
        id: z.ZodString;
        metadata: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            version: z.ZodNumber;
            value: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            value: string;
            version: number;
        }, {
            value: string;
            version: number;
        }>>>;
        agentState: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            version: z.ZodNumber;
            value: z.ZodNullable<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            value: string | null;
            version: number;
        }, {
            value: string | null;
            version: number;
        }>>>;
    }, "strip", z.ZodTypeAny, {
        t: "update-session";
        id: string;
        metadata?: {
            value: string;
            version: number;
        } | null | undefined;
        agentState?: {
            value: string | null;
            version: number;
        } | null | undefined;
    }, {
        t: "update-session";
        id: string;
        metadata?: {
            value: string;
            version: number;
        } | null | undefined;
        agentState?: {
            value: string | null;
            version: number;
        } | null | undefined;
    }>, z.ZodObject<{
        t: z.ZodLiteral<"update-machine">;
        machineId: z.ZodString;
        metadata: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            version: z.ZodNumber;
            value: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            value: string;
            version: number;
        }, {
            value: string;
            version: number;
        }>>>;
        daemonState: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            version: z.ZodNumber;
            value: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            value: string;
            version: number;
        }, {
            value: string;
            version: number;
        }>>>;
        active: z.ZodOptional<z.ZodBoolean>;
        activeAt: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        t: "update-machine";
        machineId: string;
        metadata?: {
            value: string;
            version: number;
        } | null | undefined;
        daemonState?: {
            value: string;
            version: number;
        } | null | undefined;
        active?: boolean | undefined;
        activeAt?: number | undefined;
    }, {
        t: "update-machine";
        machineId: string;
        metadata?: {
            value: string;
            version: number;
        } | null | undefined;
        daemonState?: {
            value: string;
            version: number;
        } | null | undefined;
        active?: boolean | undefined;
        activeAt?: number | undefined;
    }>]>;
    createdAt: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    id: string;
    seq: number;
    createdAt: number;
    body: {
        message: {
            content: {
                c: string;
                t: "encrypted";
            };
            id: string;
            seq: number;
            createdAt: number;
            updatedAt: number;
            localId?: string | null | undefined;
        };
        t: "new-message";
        sid: string;
    } | {
        t: "update-session";
        id: string;
        metadata?: {
            value: string;
            version: number;
        } | null | undefined;
        agentState?: {
            value: string | null;
            version: number;
        } | null | undefined;
    } | {
        t: "update-machine";
        machineId: string;
        metadata?: {
            value: string;
            version: number;
        } | null | undefined;
        daemonState?: {
            value: string;
            version: number;
        } | null | undefined;
        active?: boolean | undefined;
        activeAt?: number | undefined;
    };
}, {
    id: string;
    seq: number;
    createdAt: number;
    body: {
        message: {
            content: {
                c: string;
                t: "encrypted";
            };
            id: string;
            seq: number;
            createdAt: number;
            updatedAt: number;
            localId?: string | null | undefined;
        };
        t: "new-message";
        sid: string;
    } | {
        t: "update-session";
        id: string;
        metadata?: {
            value: string;
            version: number;
        } | null | undefined;
        agentState?: {
            value: string | null;
            version: number;
        } | null | undefined;
    } | {
        t: "update-machine";
        machineId: string;
        metadata?: {
            value: string;
            version: number;
        } | null | undefined;
        daemonState?: {
            value: string;
            version: number;
        } | null | undefined;
        active?: boolean | undefined;
        activeAt?: number | undefined;
    };
}>;
type CoreUpdateContainer = z.infer<typeof CoreUpdateContainerSchema>;
declare const ApiMessageSchema: z.ZodObject<{
    id: z.ZodString;
    seq: z.ZodNumber;
    localId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    content: z.ZodObject<{
        c: z.ZodString;
        t: z.ZodLiteral<"encrypted">;
    }, "strip", z.ZodTypeAny, {
        c: string;
        t: "encrypted";
    }, {
        c: string;
        t: "encrypted";
    }>;
    createdAt: z.ZodNumber;
    updatedAt: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    content: {
        c: string;
        t: "encrypted";
    };
    id: string;
    seq: number;
    createdAt: number;
    updatedAt: number;
    localId?: string | null | undefined;
}, {
    content: {
        c: string;
        t: "encrypted";
    };
    id: string;
    seq: number;
    createdAt: number;
    updatedAt: number;
    localId?: string | null | undefined;
}>;
type ApiMessage = SessionMessage;
declare const ApiUpdateNewMessageSchema: z.ZodObject<{
    t: z.ZodLiteral<"new-message">;
    sid: z.ZodString;
    message: z.ZodObject<{
        id: z.ZodString;
        seq: z.ZodNumber;
        localId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        content: z.ZodObject<{
            c: z.ZodString;
            t: z.ZodLiteral<"encrypted">;
        }, "strip", z.ZodTypeAny, {
            c: string;
            t: "encrypted";
        }, {
            c: string;
            t: "encrypted";
        }>;
        createdAt: z.ZodNumber;
        updatedAt: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        content: {
            c: string;
            t: "encrypted";
        };
        id: string;
        seq: number;
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    }, {
        content: {
            c: string;
            t: "encrypted";
        };
        id: string;
        seq: number;
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    message: {
        content: {
            c: string;
            t: "encrypted";
        };
        id: string;
        seq: number;
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    };
    t: "new-message";
    sid: string;
}, {
    message: {
        content: {
            c: string;
            t: "encrypted";
        };
        id: string;
        seq: number;
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    };
    t: "new-message";
    sid: string;
}>;
type ApiUpdateNewMessage = UpdateNewMessageBody;
declare const ApiUpdateSessionStateSchema: z.ZodObject<{
    t: z.ZodLiteral<"update-session">;
    id: z.ZodString;
    metadata: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        version: z.ZodNumber;
        value: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        value: string;
        version: number;
    }, {
        value: string;
        version: number;
    }>>>;
    agentState: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        version: z.ZodNumber;
        value: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        value: string | null;
        version: number;
    }, {
        value: string | null;
        version: number;
    }>>>;
}, "strip", z.ZodTypeAny, {
    t: "update-session";
    id: string;
    metadata?: {
        value: string;
        version: number;
    } | null | undefined;
    agentState?: {
        value: string | null;
        version: number;
    } | null | undefined;
}, {
    t: "update-session";
    id: string;
    metadata?: {
        value: string;
        version: number;
    } | null | undefined;
    agentState?: {
        value: string | null;
        version: number;
    } | null | undefined;
}>;
type ApiUpdateSessionState = UpdateSessionBody;
declare const ApiUpdateMachineStateSchema: z.ZodObject<{
    t: z.ZodLiteral<"update-machine">;
    machineId: z.ZodString;
    metadata: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        version: z.ZodNumber;
        value: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        value: string;
        version: number;
    }, {
        value: string;
        version: number;
    }>>>;
    daemonState: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        version: z.ZodNumber;
        value: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        value: string;
        version: number;
    }, {
        value: string;
        version: number;
    }>>>;
    active: z.ZodOptional<z.ZodBoolean>;
    activeAt: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    t: "update-machine";
    machineId: string;
    metadata?: {
        value: string;
        version: number;
    } | null | undefined;
    daemonState?: {
        value: string;
        version: number;
    } | null | undefined;
    active?: boolean | undefined;
    activeAt?: number | undefined;
}, {
    t: "update-machine";
    machineId: string;
    metadata?: {
        value: string;
        version: number;
    } | null | undefined;
    daemonState?: {
        value: string;
        version: number;
    } | null | undefined;
    active?: boolean | undefined;
    activeAt?: number | undefined;
}>;
type ApiUpdateMachineState = UpdateMachineBody;
declare const UpdateBodySchema: z.ZodObject<{
    t: z.ZodLiteral<"new-message">;
    sid: z.ZodString;
    message: z.ZodObject<{
        id: z.ZodString;
        seq: z.ZodNumber;
        localId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        content: z.ZodObject<{
            c: z.ZodString;
            t: z.ZodLiteral<"encrypted">;
        }, "strip", z.ZodTypeAny, {
            c: string;
            t: "encrypted";
        }, {
            c: string;
            t: "encrypted";
        }>;
        createdAt: z.ZodNumber;
        updatedAt: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        content: {
            c: string;
            t: "encrypted";
        };
        id: string;
        seq: number;
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    }, {
        content: {
            c: string;
            t: "encrypted";
        };
        id: string;
        seq: number;
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    message: {
        content: {
            c: string;
            t: "encrypted";
        };
        id: string;
        seq: number;
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    };
    t: "new-message";
    sid: string;
}, {
    message: {
        content: {
            c: string;
            t: "encrypted";
        };
        id: string;
        seq: number;
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    };
    t: "new-message";
    sid: string;
}>;
type UpdateBody = UpdateNewMessageBody;
declare const UpdateSchema: z.ZodObject<{
    id: z.ZodString;
    seq: z.ZodNumber;
    body: z.ZodDiscriminatedUnion<"t", [z.ZodObject<{
        t: z.ZodLiteral<"new-message">;
        sid: z.ZodString;
        message: z.ZodObject<{
            id: z.ZodString;
            seq: z.ZodNumber;
            localId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            content: z.ZodObject<{
                c: z.ZodString;
                t: z.ZodLiteral<"encrypted">;
            }, "strip", z.ZodTypeAny, {
                c: string;
                t: "encrypted";
            }, {
                c: string;
                t: "encrypted";
            }>;
            createdAt: z.ZodNumber;
            updatedAt: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            content: {
                c: string;
                t: "encrypted";
            };
            id: string;
            seq: number;
            createdAt: number;
            updatedAt: number;
            localId?: string | null | undefined;
        }, {
            content: {
                c: string;
                t: "encrypted";
            };
            id: string;
            seq: number;
            createdAt: number;
            updatedAt: number;
            localId?: string | null | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        message: {
            content: {
                c: string;
                t: "encrypted";
            };
            id: string;
            seq: number;
            createdAt: number;
            updatedAt: number;
            localId?: string | null | undefined;
        };
        t: "new-message";
        sid: string;
    }, {
        message: {
            content: {
                c: string;
                t: "encrypted";
            };
            id: string;
            seq: number;
            createdAt: number;
            updatedAt: number;
            localId?: string | null | undefined;
        };
        t: "new-message";
        sid: string;
    }>, z.ZodObject<{
        t: z.ZodLiteral<"update-session">;
        id: z.ZodString;
        metadata: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            version: z.ZodNumber;
            value: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            value: string;
            version: number;
        }, {
            value: string;
            version: number;
        }>>>;
        agentState: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            version: z.ZodNumber;
            value: z.ZodNullable<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            value: string | null;
            version: number;
        }, {
            value: string | null;
            version: number;
        }>>>;
    }, "strip", z.ZodTypeAny, {
        t: "update-session";
        id: string;
        metadata?: {
            value: string;
            version: number;
        } | null | undefined;
        agentState?: {
            value: string | null;
            version: number;
        } | null | undefined;
    }, {
        t: "update-session";
        id: string;
        metadata?: {
            value: string;
            version: number;
        } | null | undefined;
        agentState?: {
            value: string | null;
            version: number;
        } | null | undefined;
    }>, z.ZodObject<{
        t: z.ZodLiteral<"update-machine">;
        machineId: z.ZodString;
        metadata: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            version: z.ZodNumber;
            value: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            value: string;
            version: number;
        }, {
            value: string;
            version: number;
        }>>>;
        daemonState: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            version: z.ZodNumber;
            value: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            value: string;
            version: number;
        }, {
            value: string;
            version: number;
        }>>>;
        active: z.ZodOptional<z.ZodBoolean>;
        activeAt: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        t: "update-machine";
        machineId: string;
        metadata?: {
            value: string;
            version: number;
        } | null | undefined;
        daemonState?: {
            value: string;
            version: number;
        } | null | undefined;
        active?: boolean | undefined;
        activeAt?: number | undefined;
    }, {
        t: "update-machine";
        machineId: string;
        metadata?: {
            value: string;
            version: number;
        } | null | undefined;
        daemonState?: {
            value: string;
            version: number;
        } | null | undefined;
        active?: boolean | undefined;
        activeAt?: number | undefined;
    }>]>;
    createdAt: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    id: string;
    seq: number;
    createdAt: number;
    body: {
        message: {
            content: {
                c: string;
                t: "encrypted";
            };
            id: string;
            seq: number;
            createdAt: number;
            updatedAt: number;
            localId?: string | null | undefined;
        };
        t: "new-message";
        sid: string;
    } | {
        t: "update-session";
        id: string;
        metadata?: {
            value: string;
            version: number;
        } | null | undefined;
        agentState?: {
            value: string | null;
            version: number;
        } | null | undefined;
    } | {
        t: "update-machine";
        machineId: string;
        metadata?: {
            value: string;
            version: number;
        } | null | undefined;
        daemonState?: {
            value: string;
            version: number;
        } | null | undefined;
        active?: boolean | undefined;
        activeAt?: number | undefined;
    };
}, {
    id: string;
    seq: number;
    createdAt: number;
    body: {
        message: {
            content: {
                c: string;
                t: "encrypted";
            };
            id: string;
            seq: number;
            createdAt: number;
            updatedAt: number;
            localId?: string | null | undefined;
        };
        t: "new-message";
        sid: string;
    } | {
        t: "update-session";
        id: string;
        metadata?: {
            value: string;
            version: number;
        } | null | undefined;
        agentState?: {
            value: string | null;
            version: number;
        } | null | undefined;
    } | {
        t: "update-machine";
        machineId: string;
        metadata?: {
            value: string;
            version: number;
        } | null | undefined;
        daemonState?: {
            value: string;
            version: number;
        } | null | undefined;
        active?: boolean | undefined;
        activeAt?: number | undefined;
    };
}>;
type Update = CoreUpdateContainer;

declare const UserMessageSchema: z.ZodObject<{
    role: z.ZodLiteral<"user">;
    content: z.ZodObject<{
        type: z.ZodLiteral<"text">;
        text: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "text";
        text: string;
    }, {
        type: "text";
        text: string;
    }>;
    localKey: z.ZodOptional<z.ZodString>;
    meta: z.ZodOptional<z.ZodObject<{
        sentFrom: z.ZodOptional<z.ZodString>;
        permissionMode: z.ZodOptional<z.ZodEnum<["default", "acceptEdits", "bypassPermissions", "plan", "read-only", "safe-yolo", "yolo"]>>;
        model: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        fallbackModel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        appendSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        allowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        disallowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        displayText: z.ZodOptional<z.ZodString>;
        contextBoundaryFallback: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        contextBoundaryFallback?: boolean | undefined;
    }, {
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        contextBoundaryFallback?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    role: "user";
    content: {
        type: "text";
        text: string;
    };
    localKey?: string | undefined;
    meta?: {
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        contextBoundaryFallback?: boolean | undefined;
    } | undefined;
}, {
    role: "user";
    content: {
        type: "text";
        text: string;
    };
    localKey?: string | undefined;
    meta?: {
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        contextBoundaryFallback?: boolean | undefined;
    } | undefined;
}>;
type UserMessage = z.infer<typeof UserMessageSchema>;
declare const AgentMessageSchema: z.ZodObject<{
    role: z.ZodLiteral<"agent">;
    content: z.ZodObject<{
        type: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>;
    meta: z.ZodOptional<z.ZodObject<{
        sentFrom: z.ZodOptional<z.ZodString>;
        permissionMode: z.ZodOptional<z.ZodEnum<["default", "acceptEdits", "bypassPermissions", "plan", "read-only", "safe-yolo", "yolo"]>>;
        model: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        fallbackModel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        appendSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        allowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        disallowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        displayText: z.ZodOptional<z.ZodString>;
        contextBoundaryFallback: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        contextBoundaryFallback?: boolean | undefined;
    }, {
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        contextBoundaryFallback?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    role: "agent";
    content: {
        type: string;
    } & {
        [k: string]: unknown;
    };
    meta?: {
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        contextBoundaryFallback?: boolean | undefined;
    } | undefined;
}, {
    role: "agent";
    content: {
        type: string;
    } & {
        [k: string]: unknown;
    };
    meta?: {
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        contextBoundaryFallback?: boolean | undefined;
    } | undefined;
}>;
type AgentMessage = z.infer<typeof AgentMessageSchema>;
declare const LegacyMessageContentSchema: z.ZodDiscriminatedUnion<"role", [z.ZodObject<{
    role: z.ZodLiteral<"user">;
    content: z.ZodObject<{
        type: z.ZodLiteral<"text">;
        text: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "text";
        text: string;
    }, {
        type: "text";
        text: string;
    }>;
    localKey: z.ZodOptional<z.ZodString>;
    meta: z.ZodOptional<z.ZodObject<{
        sentFrom: z.ZodOptional<z.ZodString>;
        permissionMode: z.ZodOptional<z.ZodEnum<["default", "acceptEdits", "bypassPermissions", "plan", "read-only", "safe-yolo", "yolo"]>>;
        model: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        fallbackModel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        appendSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        allowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        disallowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        displayText: z.ZodOptional<z.ZodString>;
        contextBoundaryFallback: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        contextBoundaryFallback?: boolean | undefined;
    }, {
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        contextBoundaryFallback?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    role: "user";
    content: {
        type: "text";
        text: string;
    };
    localKey?: string | undefined;
    meta?: {
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        contextBoundaryFallback?: boolean | undefined;
    } | undefined;
}, {
    role: "user";
    content: {
        type: "text";
        text: string;
    };
    localKey?: string | undefined;
    meta?: {
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        contextBoundaryFallback?: boolean | undefined;
    } | undefined;
}>, z.ZodObject<{
    role: z.ZodLiteral<"agent">;
    content: z.ZodObject<{
        type: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        type: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        type: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>;
    meta: z.ZodOptional<z.ZodObject<{
        sentFrom: z.ZodOptional<z.ZodString>;
        permissionMode: z.ZodOptional<z.ZodEnum<["default", "acceptEdits", "bypassPermissions", "plan", "read-only", "safe-yolo", "yolo"]>>;
        model: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        fallbackModel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        appendSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        allowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        disallowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        displayText: z.ZodOptional<z.ZodString>;
        contextBoundaryFallback: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        contextBoundaryFallback?: boolean | undefined;
    }, {
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        contextBoundaryFallback?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    role: "agent";
    content: {
        type: string;
    } & {
        [k: string]: unknown;
    };
    meta?: {
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        contextBoundaryFallback?: boolean | undefined;
    } | undefined;
}, {
    role: "agent";
    content: {
        type: string;
    } & {
        [k: string]: unknown;
    };
    meta?: {
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        contextBoundaryFallback?: boolean | undefined;
    } | undefined;
}>]>;
type LegacyMessageContent = z.infer<typeof LegacyMessageContentSchema>;

declare const sessionRoleSchema: z.ZodEnum<["user", "agent"]>;
type SessionRole = z.infer<typeof sessionRoleSchema>;
declare const sessionTextEventSchema: z.ZodObject<{
    t: z.ZodLiteral<"text">;
    text: z.ZodString;
    thinking: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    text: string;
    t: "text";
    thinking?: boolean | undefined;
}, {
    text: string;
    t: "text";
    thinking?: boolean | undefined;
}>;
declare const sessionServiceMessageEventSchema: z.ZodObject<{
    t: z.ZodLiteral<"service">;
    text: z.ZodString;
}, "strip", z.ZodTypeAny, {
    text: string;
    t: "service";
}, {
    text: string;
    t: "service";
}>;
declare const sessionToolCallStartEventSchema: z.ZodObject<{
    t: z.ZodLiteral<"tool-call-start">;
    call: z.ZodString;
    name: z.ZodString;
    title: z.ZodString;
    description: z.ZodString;
    args: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    t: "tool-call-start";
    call: string;
    name: string;
    title: string;
    description: string;
    args: Record<string, unknown>;
}, {
    t: "tool-call-start";
    call: string;
    name: string;
    title: string;
    description: string;
    args: Record<string, unknown>;
}>;
declare const sessionToolCallEndEventSchema: z.ZodObject<{
    t: z.ZodLiteral<"tool-call-end">;
    call: z.ZodString;
}, "strip", z.ZodTypeAny, {
    t: "tool-call-end";
    call: string;
}, {
    t: "tool-call-end";
    call: string;
}>;
declare const sessionFileEventSchema: z.ZodObject<{
    t: z.ZodLiteral<"file">;
    ref: z.ZodString;
    name: z.ZodString;
    size: z.ZodNumber;
    mimeType: z.ZodOptional<z.ZodString>;
    image: z.ZodOptional<z.ZodObject<{
        width: z.ZodNumber;
        height: z.ZodNumber;
        thumbhash: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        width: number;
        height: number;
        thumbhash: string;
    }, {
        width: number;
        height: number;
        thumbhash: string;
    }>>;
}, "strip", z.ZodTypeAny, {
    t: "file";
    name: string;
    ref: string;
    size: number;
    mimeType?: string | undefined;
    image?: {
        width: number;
        height: number;
        thumbhash: string;
    } | undefined;
}, {
    t: "file";
    name: string;
    ref: string;
    size: number;
    mimeType?: string | undefined;
    image?: {
        width: number;
        height: number;
        thumbhash: string;
    } | undefined;
}>;
declare const sessionTurnStartEventSchema: z.ZodObject<{
    t: z.ZodLiteral<"turn-start">;
}, "strip", z.ZodTypeAny, {
    t: "turn-start";
}, {
    t: "turn-start";
}>;
declare const sessionStartEventSchema: z.ZodObject<{
    t: z.ZodLiteral<"start">;
    title: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    t: "start";
    title?: string | undefined;
}, {
    t: "start";
    title?: string | undefined;
}>;
declare const sessionTurnEndStatusSchema: z.ZodEnum<["completed", "failed", "cancelled"]>;
type SessionTurnEndStatus = z.infer<typeof sessionTurnEndStatusSchema>;
declare const sessionTurnEndEventSchema: z.ZodObject<{
    t: z.ZodLiteral<"turn-end">;
    status: z.ZodEnum<["completed", "failed", "cancelled"]>;
}, "strip", z.ZodTypeAny, {
    status: "completed" | "failed" | "cancelled";
    t: "turn-end";
}, {
    status: "completed" | "failed" | "cancelled";
    t: "turn-end";
}>;
declare const sessionStopEventSchema: z.ZodObject<{
    t: z.ZodLiteral<"stop">;
}, "strip", z.ZodTypeAny, {
    t: "stop";
}, {
    t: "stop";
}>;
declare const sessionContextBoundaryKindSchema: z.ZodEnum<["clear", "compact", "autocompact", "plan-mode-enter", "plan-mode-exit", "session-fork-resume"]>;
type SessionContextBoundaryKind = z.infer<typeof sessionContextBoundaryKindSchema>;
declare const sessionContextBoundaryTriggeredBySchema: z.ZodEnum<["user", "agent", "system"]>;
type SessionContextBoundaryTriggeredBy = z.infer<typeof sessionContextBoundaryTriggeredBySchema>;
declare const sessionContextBoundaryEventSchema: z.ZodObject<{
    t: z.ZodLiteral<"context-boundary">;
    kind: z.ZodEnum<["clear", "compact", "autocompact", "plan-mode-enter", "plan-mode-exit", "session-fork-resume"]>;
    at: z.ZodNumber;
    /**
     * Boundary source mapping: 'user' for explicit user commands such as /clear,
     * 'agent' for model/agent-initiated lifecycle transitions, and 'system' for
     * Happy runtime or synchronization events.
     */
    triggeredBy: z.ZodEnum<["user", "agent", "system"]>;
    summaryRef: z.ZodOptional<z.ZodString>;
    forkedFromSid: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    at: number;
    t: "context-boundary";
    kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
    triggeredBy: "user" | "agent" | "system";
    summaryRef?: string | undefined;
    forkedFromSid?: string | undefined;
}, {
    at: number;
    t: "context-boundary";
    kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
    triggeredBy: "user" | "agent" | "system";
    summaryRef?: string | undefined;
    forkedFromSid?: string | undefined;
}>;
type SessionContextBoundaryEvent = z.infer<typeof sessionContextBoundaryEventSchema>;
declare const sessionEventSchema: z.ZodDiscriminatedUnion<"t", [z.ZodObject<{
    t: z.ZodLiteral<"text">;
    text: z.ZodString;
    thinking: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    text: string;
    t: "text";
    thinking?: boolean | undefined;
}, {
    text: string;
    t: "text";
    thinking?: boolean | undefined;
}>, z.ZodObject<{
    t: z.ZodLiteral<"service">;
    text: z.ZodString;
}, "strip", z.ZodTypeAny, {
    text: string;
    t: "service";
}, {
    text: string;
    t: "service";
}>, z.ZodObject<{
    t: z.ZodLiteral<"tool-call-start">;
    call: z.ZodString;
    name: z.ZodString;
    title: z.ZodString;
    description: z.ZodString;
    args: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    t: "tool-call-start";
    call: string;
    name: string;
    title: string;
    description: string;
    args: Record<string, unknown>;
}, {
    t: "tool-call-start";
    call: string;
    name: string;
    title: string;
    description: string;
    args: Record<string, unknown>;
}>, z.ZodObject<{
    t: z.ZodLiteral<"tool-call-end">;
    call: z.ZodString;
}, "strip", z.ZodTypeAny, {
    t: "tool-call-end";
    call: string;
}, {
    t: "tool-call-end";
    call: string;
}>, z.ZodObject<{
    t: z.ZodLiteral<"file">;
    ref: z.ZodString;
    name: z.ZodString;
    size: z.ZodNumber;
    mimeType: z.ZodOptional<z.ZodString>;
    image: z.ZodOptional<z.ZodObject<{
        width: z.ZodNumber;
        height: z.ZodNumber;
        thumbhash: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        width: number;
        height: number;
        thumbhash: string;
    }, {
        width: number;
        height: number;
        thumbhash: string;
    }>>;
}, "strip", z.ZodTypeAny, {
    t: "file";
    name: string;
    ref: string;
    size: number;
    mimeType?: string | undefined;
    image?: {
        width: number;
        height: number;
        thumbhash: string;
    } | undefined;
}, {
    t: "file";
    name: string;
    ref: string;
    size: number;
    mimeType?: string | undefined;
    image?: {
        width: number;
        height: number;
        thumbhash: string;
    } | undefined;
}>, z.ZodObject<{
    t: z.ZodLiteral<"turn-start">;
}, "strip", z.ZodTypeAny, {
    t: "turn-start";
}, {
    t: "turn-start";
}>, z.ZodObject<{
    t: z.ZodLiteral<"start">;
    title: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    t: "start";
    title?: string | undefined;
}, {
    t: "start";
    title?: string | undefined;
}>, z.ZodObject<{
    t: z.ZodLiteral<"turn-end">;
    status: z.ZodEnum<["completed", "failed", "cancelled"]>;
}, "strip", z.ZodTypeAny, {
    status: "completed" | "failed" | "cancelled";
    t: "turn-end";
}, {
    status: "completed" | "failed" | "cancelled";
    t: "turn-end";
}>, z.ZodObject<{
    t: z.ZodLiteral<"stop">;
}, "strip", z.ZodTypeAny, {
    t: "stop";
}, {
    t: "stop";
}>, z.ZodObject<{
    t: z.ZodLiteral<"context-boundary">;
    kind: z.ZodEnum<["clear", "compact", "autocompact", "plan-mode-enter", "plan-mode-exit", "session-fork-resume"]>;
    at: z.ZodNumber;
    /**
     * Boundary source mapping: 'user' for explicit user commands such as /clear,
     * 'agent' for model/agent-initiated lifecycle transitions, and 'system' for
     * Happy runtime or synchronization events.
     */
    triggeredBy: z.ZodEnum<["user", "agent", "system"]>;
    summaryRef: z.ZodOptional<z.ZodString>;
    forkedFromSid: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    at: number;
    t: "context-boundary";
    kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
    triggeredBy: "user" | "agent" | "system";
    summaryRef?: string | undefined;
    forkedFromSid?: string | undefined;
}, {
    at: number;
    t: "context-boundary";
    kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
    triggeredBy: "user" | "agent" | "system";
    summaryRef?: string | undefined;
    forkedFromSid?: string | undefined;
}>]>;
type SessionEvent = z.infer<typeof sessionEventSchema>;
declare const sessionEnvelopeSchema: z.ZodEffects<z.ZodObject<{
    id: z.ZodString;
    time: z.ZodNumber;
    role: z.ZodEnum<["user", "agent"]>;
    turn: z.ZodOptional<z.ZodString>;
    subagent: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    ev: z.ZodDiscriminatedUnion<"t", [z.ZodObject<{
        t: z.ZodLiteral<"text">;
        text: z.ZodString;
        thinking: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        text: string;
        t: "text";
        thinking?: boolean | undefined;
    }, {
        text: string;
        t: "text";
        thinking?: boolean | undefined;
    }>, z.ZodObject<{
        t: z.ZodLiteral<"service">;
        text: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        text: string;
        t: "service";
    }, {
        text: string;
        t: "service";
    }>, z.ZodObject<{
        t: z.ZodLiteral<"tool-call-start">;
        call: z.ZodString;
        name: z.ZodString;
        title: z.ZodString;
        description: z.ZodString;
        args: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        t: "tool-call-start";
        call: string;
        name: string;
        title: string;
        description: string;
        args: Record<string, unknown>;
    }, {
        t: "tool-call-start";
        call: string;
        name: string;
        title: string;
        description: string;
        args: Record<string, unknown>;
    }>, z.ZodObject<{
        t: z.ZodLiteral<"tool-call-end">;
        call: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        t: "tool-call-end";
        call: string;
    }, {
        t: "tool-call-end";
        call: string;
    }>, z.ZodObject<{
        t: z.ZodLiteral<"file">;
        ref: z.ZodString;
        name: z.ZodString;
        size: z.ZodNumber;
        mimeType: z.ZodOptional<z.ZodString>;
        image: z.ZodOptional<z.ZodObject<{
            width: z.ZodNumber;
            height: z.ZodNumber;
            thumbhash: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            width: number;
            height: number;
            thumbhash: string;
        }, {
            width: number;
            height: number;
            thumbhash: string;
        }>>;
    }, "strip", z.ZodTypeAny, {
        t: "file";
        name: string;
        ref: string;
        size: number;
        mimeType?: string | undefined;
        image?: {
            width: number;
            height: number;
            thumbhash: string;
        } | undefined;
    }, {
        t: "file";
        name: string;
        ref: string;
        size: number;
        mimeType?: string | undefined;
        image?: {
            width: number;
            height: number;
            thumbhash: string;
        } | undefined;
    }>, z.ZodObject<{
        t: z.ZodLiteral<"turn-start">;
    }, "strip", z.ZodTypeAny, {
        t: "turn-start";
    }, {
        t: "turn-start";
    }>, z.ZodObject<{
        t: z.ZodLiteral<"start">;
        title: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        t: "start";
        title?: string | undefined;
    }, {
        t: "start";
        title?: string | undefined;
    }>, z.ZodObject<{
        t: z.ZodLiteral<"turn-end">;
        status: z.ZodEnum<["completed", "failed", "cancelled"]>;
    }, "strip", z.ZodTypeAny, {
        status: "completed" | "failed" | "cancelled";
        t: "turn-end";
    }, {
        status: "completed" | "failed" | "cancelled";
        t: "turn-end";
    }>, z.ZodObject<{
        t: z.ZodLiteral<"stop">;
    }, "strip", z.ZodTypeAny, {
        t: "stop";
    }, {
        t: "stop";
    }>, z.ZodObject<{
        t: z.ZodLiteral<"context-boundary">;
        kind: z.ZodEnum<["clear", "compact", "autocompact", "plan-mode-enter", "plan-mode-exit", "session-fork-resume"]>;
        at: z.ZodNumber;
        /**
         * Boundary source mapping: 'user' for explicit user commands such as /clear,
         * 'agent' for model/agent-initiated lifecycle transitions, and 'system' for
         * Happy runtime or synchronization events.
         */
        triggeredBy: z.ZodEnum<["user", "agent", "system"]>;
        summaryRef: z.ZodOptional<z.ZodString>;
        forkedFromSid: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        at: number;
        t: "context-boundary";
        kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
        triggeredBy: "user" | "agent" | "system";
        summaryRef?: string | undefined;
        forkedFromSid?: string | undefined;
    }, {
        at: number;
        t: "context-boundary";
        kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
        triggeredBy: "user" | "agent" | "system";
        summaryRef?: string | undefined;
        forkedFromSid?: string | undefined;
    }>]>;
}, "strip", z.ZodTypeAny, {
    role: "user" | "agent";
    id: string;
    time: number;
    ev: {
        text: string;
        t: "text";
        thinking?: boolean | undefined;
    } | {
        text: string;
        t: "service";
    } | {
        t: "tool-call-start";
        call: string;
        name: string;
        title: string;
        description: string;
        args: Record<string, unknown>;
    } | {
        t: "tool-call-end";
        call: string;
    } | {
        t: "file";
        name: string;
        ref: string;
        size: number;
        mimeType?: string | undefined;
        image?: {
            width: number;
            height: number;
            thumbhash: string;
        } | undefined;
    } | {
        t: "turn-start";
    } | {
        t: "start";
        title?: string | undefined;
    } | {
        status: "completed" | "failed" | "cancelled";
        t: "turn-end";
    } | {
        t: "stop";
    } | {
        at: number;
        t: "context-boundary";
        kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
        triggeredBy: "user" | "agent" | "system";
        summaryRef?: string | undefined;
        forkedFromSid?: string | undefined;
    };
    turn?: string | undefined;
    subagent?: string | undefined;
}, {
    role: "user" | "agent";
    id: string;
    time: number;
    ev: {
        text: string;
        t: "text";
        thinking?: boolean | undefined;
    } | {
        text: string;
        t: "service";
    } | {
        t: "tool-call-start";
        call: string;
        name: string;
        title: string;
        description: string;
        args: Record<string, unknown>;
    } | {
        t: "tool-call-end";
        call: string;
    } | {
        t: "file";
        name: string;
        ref: string;
        size: number;
        mimeType?: string | undefined;
        image?: {
            width: number;
            height: number;
            thumbhash: string;
        } | undefined;
    } | {
        t: "turn-start";
    } | {
        t: "start";
        title?: string | undefined;
    } | {
        status: "completed" | "failed" | "cancelled";
        t: "turn-end";
    } | {
        t: "stop";
    } | {
        at: number;
        t: "context-boundary";
        kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
        triggeredBy: "user" | "agent" | "system";
        summaryRef?: string | undefined;
        forkedFromSid?: string | undefined;
    };
    turn?: string | undefined;
    subagent?: string | undefined;
}>, {
    role: "user" | "agent";
    id: string;
    time: number;
    ev: {
        text: string;
        t: "text";
        thinking?: boolean | undefined;
    } | {
        text: string;
        t: "service";
    } | {
        t: "tool-call-start";
        call: string;
        name: string;
        title: string;
        description: string;
        args: Record<string, unknown>;
    } | {
        t: "tool-call-end";
        call: string;
    } | {
        t: "file";
        name: string;
        ref: string;
        size: number;
        mimeType?: string | undefined;
        image?: {
            width: number;
            height: number;
            thumbhash: string;
        } | undefined;
    } | {
        t: "turn-start";
    } | {
        t: "start";
        title?: string | undefined;
    } | {
        status: "completed" | "failed" | "cancelled";
        t: "turn-end";
    } | {
        t: "stop";
    } | {
        at: number;
        t: "context-boundary";
        kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
        triggeredBy: "user" | "agent" | "system";
        summaryRef?: string | undefined;
        forkedFromSid?: string | undefined;
    };
    turn?: string | undefined;
    subagent?: string | undefined;
}, {
    role: "user" | "agent";
    id: string;
    time: number;
    ev: {
        text: string;
        t: "text";
        thinking?: boolean | undefined;
    } | {
        text: string;
        t: "service";
    } | {
        t: "tool-call-start";
        call: string;
        name: string;
        title: string;
        description: string;
        args: Record<string, unknown>;
    } | {
        t: "tool-call-end";
        call: string;
    } | {
        t: "file";
        name: string;
        ref: string;
        size: number;
        mimeType?: string | undefined;
        image?: {
            width: number;
            height: number;
            thumbhash: string;
        } | undefined;
    } | {
        t: "turn-start";
    } | {
        t: "start";
        title?: string | undefined;
    } | {
        status: "completed" | "failed" | "cancelled";
        t: "turn-end";
    } | {
        t: "stop";
    } | {
        at: number;
        t: "context-boundary";
        kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
        triggeredBy: "user" | "agent" | "system";
        summaryRef?: string | undefined;
        forkedFromSid?: string | undefined;
    };
    turn?: string | undefined;
    subagent?: string | undefined;
}>;
type SessionEnvelope = z.infer<typeof sessionEnvelopeSchema>;
type CreateEnvelopeOptions = {
    id?: string;
    time?: number;
    turn?: string;
    subagent?: string;
};
declare function createEnvelope(role: SessionRole, ev: SessionEvent, opts?: CreateEnvelopeOptions): SessionEnvelope;

declare const VoiceConversationGrantedSchema: z.ZodObject<{
    allowed: z.ZodLiteral<true>;
    conversationToken: z.ZodString;
    conversationId: z.ZodString;
    agentId: z.ZodString;
    elevenUserId: z.ZodString;
    usedSeconds: z.ZodNumber;
    limitSeconds: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    allowed: true;
    conversationToken: string;
    conversationId: string;
    agentId: string;
    elevenUserId: string;
    usedSeconds: number;
    limitSeconds: number;
}, {
    allowed: true;
    conversationToken: string;
    conversationId: string;
    agentId: string;
    elevenUserId: string;
    usedSeconds: number;
    limitSeconds: number;
}>;
declare const VoiceConversationDeniedSchema: z.ZodObject<{
    allowed: z.ZodLiteral<false>;
    reason: z.ZodEnum<["voice_hard_limit_reached", "subscription_required", "voice_conversation_limit_reached"]>;
    usedSeconds: z.ZodNumber;
    limitSeconds: z.ZodNumber;
    agentId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    allowed: false;
    agentId: string;
    usedSeconds: number;
    limitSeconds: number;
    reason: "voice_hard_limit_reached" | "subscription_required" | "voice_conversation_limit_reached";
}, {
    allowed: false;
    agentId: string;
    usedSeconds: number;
    limitSeconds: number;
    reason: "voice_hard_limit_reached" | "subscription_required" | "voice_conversation_limit_reached";
}>;
declare const VoiceConversationResponseSchema: z.ZodDiscriminatedUnion<"allowed", [z.ZodObject<{
    allowed: z.ZodLiteral<true>;
    conversationToken: z.ZodString;
    conversationId: z.ZodString;
    agentId: z.ZodString;
    elevenUserId: z.ZodString;
    usedSeconds: z.ZodNumber;
    limitSeconds: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    allowed: true;
    conversationToken: string;
    conversationId: string;
    agentId: string;
    elevenUserId: string;
    usedSeconds: number;
    limitSeconds: number;
}, {
    allowed: true;
    conversationToken: string;
    conversationId: string;
    agentId: string;
    elevenUserId: string;
    usedSeconds: number;
    limitSeconds: number;
}>, z.ZodObject<{
    allowed: z.ZodLiteral<false>;
    reason: z.ZodEnum<["voice_hard_limit_reached", "subscription_required", "voice_conversation_limit_reached"]>;
    usedSeconds: z.ZodNumber;
    limitSeconds: z.ZodNumber;
    agentId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    allowed: false;
    agentId: string;
    usedSeconds: number;
    limitSeconds: number;
    reason: "voice_hard_limit_reached" | "subscription_required" | "voice_conversation_limit_reached";
}, {
    allowed: false;
    agentId: string;
    usedSeconds: number;
    limitSeconds: number;
    reason: "voice_hard_limit_reached" | "subscription_required" | "voice_conversation_limit_reached";
}>]>;
type VoiceConversationResponse = z.infer<typeof VoiceConversationResponseSchema>;
declare const VoiceUsageResponseSchema: z.ZodObject<{
    usedSeconds: z.ZodNumber;
    limitSeconds: z.ZodNumber;
    conversationCount: z.ZodNumber;
    conversationLimit: z.ZodNumber;
    elevenUserId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    elevenUserId: string;
    usedSeconds: number;
    limitSeconds: number;
    conversationCount: number;
    conversationLimit: number;
}, {
    elevenUserId: string;
    usedSeconds: number;
    limitSeconds: number;
    conversationCount: number;
    conversationLimit: number;
}>;
type VoiceUsageResponse = z.infer<typeof VoiceUsageResponseSchema>;

export { AgentMessageSchema, ApiMessageSchema, ApiUpdateMachineStateSchema, ApiUpdateNewMessageSchema, ApiUpdateSessionStateSchema, CoreUpdateBodySchema, CoreUpdateContainerSchema, LegacyMessageContentSchema, MessageContentSchema, MessageMetaSchema, SessionMessageContentSchema, SessionMessageRangeRequestSchema, SessionMessageRangeResponseSchema, SessionMessageSchema, SessionProtocolMessageSchema, UpdateBodySchema, UpdateMachineBodySchema, UpdateNewMessageBodySchema, UpdateSchema, UpdateSessionBodySchema, UserMessageSchema, VersionedEncryptedValueSchema, VersionedMachineEncryptedValueSchema, VersionedNullableEncryptedValueSchema, VoiceConversationDeniedSchema, VoiceConversationGrantedSchema, VoiceConversationResponseSchema, VoiceUsageResponseSchema, createEnvelope, sessionContextBoundaryEventSchema, sessionContextBoundaryKindSchema, sessionContextBoundaryTriggeredBySchema, sessionEnvelopeSchema, sessionEventSchema, sessionFileEventSchema, sessionRoleSchema, sessionServiceMessageEventSchema, sessionStartEventSchema, sessionStopEventSchema, sessionTextEventSchema, sessionToolCallEndEventSchema, sessionToolCallStartEventSchema, sessionTurnEndEventSchema, sessionTurnEndStatusSchema, sessionTurnStartEventSchema };
export type { AgentMessage, ApiMessage, ApiUpdateMachineState, ApiUpdateNewMessage, ApiUpdateSessionState, CoreUpdateBody, CoreUpdateContainer, CreateEnvelopeOptions, LegacyMessageContent, MessageContent, MessageMeta, SessionContextBoundaryEvent, SessionContextBoundaryKind, SessionContextBoundaryTriggeredBy, SessionEnvelope, SessionEvent, SessionMessage, SessionMessageContent, SessionMessageRangeRequest, SessionMessageRangeResponse, SessionProtocolMessage, SessionRole, SessionTurnEndStatus, Update, UpdateBody, UpdateMachineBody, UpdateNewMessageBody, UpdateSessionBody, UserMessage, VersionedEncryptedValue, VersionedMachineEncryptedValue, VersionedNullableEncryptedValue, VoiceConversationResponse, VoiceUsageResponse };
