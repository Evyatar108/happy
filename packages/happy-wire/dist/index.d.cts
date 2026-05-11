import * as z from 'zod';

declare const MessageMetaSchema: z.ZodObject<{
    sentFrom: z.ZodOptional<z.ZodString>;
    permissionMode: z.ZodOptional<z.ZodEnum<["default", "acceptEdits", "bypassPermissions", "plan", "read-only", "safe-yolo", "yolo"]>>;
    model: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    thinkingLevel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    fallbackModel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    customSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    appendSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    allowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
    disallowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
    displayText: z.ZodOptional<z.ZodString>;
    attachmentRefs: z.ZodOptional<z.ZodArray<z.ZodObject<{
        remotePath: z.ZodString;
        name: z.ZodString;
        size: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        name: string;
        size: number;
        remotePath: string;
    }, {
        name: string;
        size: number;
        remotePath: string;
    }>, "many">>;
    contextBoundaryFallback: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
    model?: string | null | undefined;
    thinkingLevel?: string | null | undefined;
    sentFrom?: string | undefined;
    fallbackModel?: string | null | undefined;
    customSystemPrompt?: string | null | undefined;
    appendSystemPrompt?: string | null | undefined;
    allowedTools?: string[] | null | undefined;
    disallowedTools?: string[] | null | undefined;
    displayText?: string | undefined;
    attachmentRefs?: {
        name: string;
        size: number;
        remotePath: string;
    }[] | undefined;
    contextBoundaryFallback?: boolean | undefined;
}, {
    permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
    model?: string | null | undefined;
    thinkingLevel?: string | null | undefined;
    sentFrom?: string | undefined;
    fallbackModel?: string | null | undefined;
    customSystemPrompt?: string | null | undefined;
    appendSystemPrompt?: string | null | undefined;
    allowedTools?: string[] | null | undefined;
    disallowedTools?: string[] | null | undefined;
    displayText?: string | undefined;
    attachmentRefs?: {
        name: string;
        size: number;
        remotePath: string;
    }[] | undefined;
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
    id: string;
    seq: number;
    content: {
        c: string;
        t: "encrypted";
    };
    createdAt: number;
    updatedAt: number;
    localId?: string | null | undefined;
}, {
    id: string;
    seq: number;
    content: {
        c: string;
        t: "encrypted";
    };
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
        id: string;
        seq: number;
        content: {
            c: string;
            t: "encrypted";
        };
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    }, {
        id: string;
        seq: number;
        content: {
            c: string;
            t: "encrypted";
        };
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
        id: string;
        seq: number;
        content: {
            c: string;
            t: "encrypted";
        };
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
        id: string;
        seq: number;
        content: {
            c: string;
            t: "encrypted";
        };
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
        role: z.ZodUnion<[z.ZodLiteral<"user">, z.ZodLiteral<"agent">]>;
        turn: z.ZodOptional<z.ZodString>;
        subagent: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        ev: z.ZodDiscriminatedUnion<"t", [z.ZodObject<{
            t: z.ZodLiteral<"text">;
            text: z.ZodString;
            thinking: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            t: "text";
            text: string;
            thinking?: boolean | undefined;
        }, {
            t: "text";
            text: string;
            thinking?: boolean | undefined;
        }>, z.ZodObject<{
            t: z.ZodLiteral<"service">;
            text: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            t: "service";
            text: string;
        }, {
            t: "service";
            text: string;
        }>, z.ZodObject<{
            t: z.ZodLiteral<"tool-call-start">;
            call: z.ZodString;
            name: z.ZodString;
            title: z.ZodString;
            description: z.ZodString;
            args: z.ZodRecord<z.ZodString, z.ZodUnknown>;
            permissionRequestId: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            t: "tool-call-start";
            call: string;
            name: string;
            title: string;
            description: string;
            args: Record<string, unknown>;
            permissionRequestId?: string | undefined;
        }, {
            t: "tool-call-start";
            call: string;
            name: string;
            title: string;
            description: string;
            args: Record<string, unknown>;
            permissionRequestId?: string | undefined;
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
            t: "turn-end";
            status: "completed" | "failed" | "cancelled";
        }, {
            t: "turn-end";
            status: "completed" | "failed" | "cancelled";
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
            t: "context-boundary";
            at: number;
            kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
            triggeredBy: "user" | "agent" | "system";
            summaryRef?: string | undefined;
            forkedFromSid?: string | undefined;
        }, {
            t: "context-boundary";
            at: number;
            kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
            triggeredBy: "user" | "agent" | "system";
            summaryRef?: string | undefined;
            forkedFromSid?: string | undefined;
        }>, z.ZodObject<{
            t: z.ZodLiteral<"agent-configuration-changed">;
            permissionMode: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            model: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            thinkingLevel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            sandbox: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            t: "agent-configuration-changed";
            permissionMode?: string | null | undefined;
            model?: string | null | undefined;
            thinkingLevel?: string | null | undefined;
            sandbox?: string | null | undefined;
        }, {
            t: "agent-configuration-changed";
            permissionMode?: string | null | undefined;
            model?: string | null | undefined;
            thinkingLevel?: string | null | undefined;
            sandbox?: string | null | undefined;
        }>, z.ZodObject<{
            t: z.ZodLiteral<"message-consumption">;
            messageId: z.ZodString;
            consumedAt: z.ZodNumber;
            agentFlavor: z.ZodEnum<["claude", "codex"]>;
        }, "strip", z.ZodTypeAny, {
            t: "message-consumption";
            messageId: string;
            consumedAt: number;
            agentFlavor: "claude" | "codex";
        }, {
            t: "message-consumption";
            messageId: string;
            consumedAt: number;
            agentFlavor: "claude" | "codex";
        }>]>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        role: "user" | "agent";
        time: number;
        ev: {
            t: "text";
            text: string;
            thinking?: boolean | undefined;
        } | {
            t: "service";
            text: string;
        } | {
            t: "tool-call-start";
            call: string;
            name: string;
            title: string;
            description: string;
            args: Record<string, unknown>;
            permissionRequestId?: string | undefined;
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
            t: "turn-end";
            status: "completed" | "failed" | "cancelled";
        } | {
            t: "stop";
        } | {
            t: "context-boundary";
            at: number;
            kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
            triggeredBy: "user" | "agent" | "system";
            summaryRef?: string | undefined;
            forkedFromSid?: string | undefined;
        } | {
            t: "agent-configuration-changed";
            permissionMode?: string | null | undefined;
            model?: string | null | undefined;
            thinkingLevel?: string | null | undefined;
            sandbox?: string | null | undefined;
        } | {
            t: "message-consumption";
            messageId: string;
            consumedAt: number;
            agentFlavor: "claude" | "codex";
        };
        turn?: string | undefined;
        subagent?: string | undefined;
    }, {
        id: string;
        role: "user" | "agent";
        time: number;
        ev: {
            t: "text";
            text: string;
            thinking?: boolean | undefined;
        } | {
            t: "service";
            text: string;
        } | {
            t: "tool-call-start";
            call: string;
            name: string;
            title: string;
            description: string;
            args: Record<string, unknown>;
            permissionRequestId?: string | undefined;
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
            t: "turn-end";
            status: "completed" | "failed" | "cancelled";
        } | {
            t: "stop";
        } | {
            t: "context-boundary";
            at: number;
            kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
            triggeredBy: "user" | "agent" | "system";
            summaryRef?: string | undefined;
            forkedFromSid?: string | undefined;
        } | {
            t: "agent-configuration-changed";
            permissionMode?: string | null | undefined;
            model?: string | null | undefined;
            thinkingLevel?: string | null | undefined;
            sandbox?: string | null | undefined;
        } | {
            t: "message-consumption";
            messageId: string;
            consumedAt: number;
            agentFlavor: "claude" | "codex";
        };
        turn?: string | undefined;
        subagent?: string | undefined;
    }>, {
        id: string;
        role: "user" | "agent";
        time: number;
        ev: {
            t: "text";
            text: string;
            thinking?: boolean | undefined;
        } | {
            t: "service";
            text: string;
        } | {
            t: "tool-call-start";
            call: string;
            name: string;
            title: string;
            description: string;
            args: Record<string, unknown>;
            permissionRequestId?: string | undefined;
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
            t: "turn-end";
            status: "completed" | "failed" | "cancelled";
        } | {
            t: "stop";
        } | {
            t: "context-boundary";
            at: number;
            kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
            triggeredBy: "user" | "agent" | "system";
            summaryRef?: string | undefined;
            forkedFromSid?: string | undefined;
        } | {
            t: "agent-configuration-changed";
            permissionMode?: string | null | undefined;
            model?: string | null | undefined;
            thinkingLevel?: string | null | undefined;
            sandbox?: string | null | undefined;
        } | {
            t: "message-consumption";
            messageId: string;
            consumedAt: number;
            agentFlavor: "claude" | "codex";
        };
        turn?: string | undefined;
        subagent?: string | undefined;
    }, {
        id: string;
        role: "user" | "agent";
        time: number;
        ev: {
            t: "text";
            text: string;
            thinking?: boolean | undefined;
        } | {
            t: "service";
            text: string;
        } | {
            t: "tool-call-start";
            call: string;
            name: string;
            title: string;
            description: string;
            args: Record<string, unknown>;
            permissionRequestId?: string | undefined;
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
            t: "turn-end";
            status: "completed" | "failed" | "cancelled";
        } | {
            t: "stop";
        } | {
            t: "context-boundary";
            at: number;
            kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
            triggeredBy: "user" | "agent" | "system";
            summaryRef?: string | undefined;
            forkedFromSid?: string | undefined;
        } | {
            t: "agent-configuration-changed";
            permissionMode?: string | null | undefined;
            model?: string | null | undefined;
            thinkingLevel?: string | null | undefined;
            sandbox?: string | null | undefined;
        } | {
            t: "message-consumption";
            messageId: string;
            consumedAt: number;
            agentFlavor: "claude" | "codex";
        };
        turn?: string | undefined;
        subagent?: string | undefined;
    }>;
    meta: z.ZodOptional<z.ZodObject<{
        sentFrom: z.ZodOptional<z.ZodString>;
        permissionMode: z.ZodOptional<z.ZodEnum<["default", "acceptEdits", "bypassPermissions", "plan", "read-only", "safe-yolo", "yolo"]>>;
        model: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        thinkingLevel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        fallbackModel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        appendSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        allowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        disallowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        displayText: z.ZodOptional<z.ZodString>;
        attachmentRefs: z.ZodOptional<z.ZodArray<z.ZodObject<{
            remotePath: z.ZodString;
            name: z.ZodString;
            size: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            name: string;
            size: number;
            remotePath: string;
        }, {
            name: string;
            size: number;
            remotePath: string;
        }>, "many">>;
        contextBoundaryFallback: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sentFrom?: string | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        attachmentRefs?: {
            name: string;
            size: number;
            remotePath: string;
        }[] | undefined;
        contextBoundaryFallback?: boolean | undefined;
    }, {
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sentFrom?: string | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        attachmentRefs?: {
            name: string;
            size: number;
            remotePath: string;
        }[] | undefined;
        contextBoundaryFallback?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    content: {
        id: string;
        role: "user" | "agent";
        time: number;
        ev: {
            t: "text";
            text: string;
            thinking?: boolean | undefined;
        } | {
            t: "service";
            text: string;
        } | {
            t: "tool-call-start";
            call: string;
            name: string;
            title: string;
            description: string;
            args: Record<string, unknown>;
            permissionRequestId?: string | undefined;
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
            t: "turn-end";
            status: "completed" | "failed" | "cancelled";
        } | {
            t: "stop";
        } | {
            t: "context-boundary";
            at: number;
            kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
            triggeredBy: "user" | "agent" | "system";
            summaryRef?: string | undefined;
            forkedFromSid?: string | undefined;
        } | {
            t: "agent-configuration-changed";
            permissionMode?: string | null | undefined;
            model?: string | null | undefined;
            thinkingLevel?: string | null | undefined;
            sandbox?: string | null | undefined;
        } | {
            t: "message-consumption";
            messageId: string;
            consumedAt: number;
            agentFlavor: "claude" | "codex";
        };
        turn?: string | undefined;
        subagent?: string | undefined;
    };
    role: "session";
    meta?: {
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sentFrom?: string | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        attachmentRefs?: {
            name: string;
            size: number;
            remotePath: string;
        }[] | undefined;
        contextBoundaryFallback?: boolean | undefined;
    } | undefined;
}, {
    content: {
        id: string;
        role: "user" | "agent";
        time: number;
        ev: {
            t: "text";
            text: string;
            thinking?: boolean | undefined;
        } | {
            t: "service";
            text: string;
        } | {
            t: "tool-call-start";
            call: string;
            name: string;
            title: string;
            description: string;
            args: Record<string, unknown>;
            permissionRequestId?: string | undefined;
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
            t: "turn-end";
            status: "completed" | "failed" | "cancelled";
        } | {
            t: "stop";
        } | {
            t: "context-boundary";
            at: number;
            kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
            triggeredBy: "user" | "agent" | "system";
            summaryRef?: string | undefined;
            forkedFromSid?: string | undefined;
        } | {
            t: "agent-configuration-changed";
            permissionMode?: string | null | undefined;
            model?: string | null | undefined;
            thinkingLevel?: string | null | undefined;
            sandbox?: string | null | undefined;
        } | {
            t: "message-consumption";
            messageId: string;
            consumedAt: number;
            agentFlavor: "claude" | "codex";
        };
        turn?: string | undefined;
        subagent?: string | undefined;
    };
    role: "session";
    meta?: {
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sentFrom?: string | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        attachmentRefs?: {
            name: string;
            size: number;
            remotePath: string;
        }[] | undefined;
        contextBoundaryFallback?: boolean | undefined;
    } | undefined;
}>;
type SessionProtocolMessage = z.infer<typeof SessionProtocolMessageSchema>;
declare const MessageContentSchema: z.ZodDiscriminatedUnion<"role", [z.ZodObject<{
    role: z.ZodLiteral<"user">;
    content: z.ZodObject<{
        type: z.ZodLiteral<"text">;
        text: z.ZodString;
        attachments: z.ZodOptional<z.ZodArray<z.ZodObject<{
            type: z.ZodLiteral<"image">;
            ref: z.ZodString;
            mimeType: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            type: "image";
            ref: string;
            mimeType?: string | undefined;
        }, {
            type: "image";
            ref: string;
            mimeType?: string | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        type: "text";
        text: string;
        attachments?: {
            type: "image";
            ref: string;
            mimeType?: string | undefined;
        }[] | undefined;
    }, {
        type: "text";
        text: string;
        attachments?: {
            type: "image";
            ref: string;
            mimeType?: string | undefined;
        }[] | undefined;
    }>;
    localKey: z.ZodOptional<z.ZodString>;
    meta: z.ZodOptional<z.ZodObject<{
        sentFrom: z.ZodOptional<z.ZodString>;
        permissionMode: z.ZodOptional<z.ZodEnum<["default", "acceptEdits", "bypassPermissions", "plan", "read-only", "safe-yolo", "yolo"]>>;
        model: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        thinkingLevel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        fallbackModel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        appendSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        allowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        disallowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        displayText: z.ZodOptional<z.ZodString>;
        attachmentRefs: z.ZodOptional<z.ZodArray<z.ZodObject<{
            remotePath: z.ZodString;
            name: z.ZodString;
            size: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            name: string;
            size: number;
            remotePath: string;
        }, {
            name: string;
            size: number;
            remotePath: string;
        }>, "many">>;
        contextBoundaryFallback: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sentFrom?: string | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        attachmentRefs?: {
            name: string;
            size: number;
            remotePath: string;
        }[] | undefined;
        contextBoundaryFallback?: boolean | undefined;
    }, {
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sentFrom?: string | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        attachmentRefs?: {
            name: string;
            size: number;
            remotePath: string;
        }[] | undefined;
        contextBoundaryFallback?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    content: {
        type: "text";
        text: string;
        attachments?: {
            type: "image";
            ref: string;
            mimeType?: string | undefined;
        }[] | undefined;
    };
    role: "user";
    meta?: {
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sentFrom?: string | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        attachmentRefs?: {
            name: string;
            size: number;
            remotePath: string;
        }[] | undefined;
        contextBoundaryFallback?: boolean | undefined;
    } | undefined;
    localKey?: string | undefined;
}, {
    content: {
        type: "text";
        text: string;
        attachments?: {
            type: "image";
            ref: string;
            mimeType?: string | undefined;
        }[] | undefined;
    };
    role: "user";
    meta?: {
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sentFrom?: string | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        attachmentRefs?: {
            name: string;
            size: number;
            remotePath: string;
        }[] | undefined;
        contextBoundaryFallback?: boolean | undefined;
    } | undefined;
    localKey?: string | undefined;
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
        thinkingLevel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        fallbackModel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        appendSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        allowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        disallowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        displayText: z.ZodOptional<z.ZodString>;
        attachmentRefs: z.ZodOptional<z.ZodArray<z.ZodObject<{
            remotePath: z.ZodString;
            name: z.ZodString;
            size: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            name: string;
            size: number;
            remotePath: string;
        }, {
            name: string;
            size: number;
            remotePath: string;
        }>, "many">>;
        contextBoundaryFallback: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sentFrom?: string | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        attachmentRefs?: {
            name: string;
            size: number;
            remotePath: string;
        }[] | undefined;
        contextBoundaryFallback?: boolean | undefined;
    }, {
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sentFrom?: string | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        attachmentRefs?: {
            name: string;
            size: number;
            remotePath: string;
        }[] | undefined;
        contextBoundaryFallback?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    content: {
        type: string;
    } & {
        [k: string]: unknown;
    };
    role: "agent";
    meta?: {
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sentFrom?: string | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        attachmentRefs?: {
            name: string;
            size: number;
            remotePath: string;
        }[] | undefined;
        contextBoundaryFallback?: boolean | undefined;
    } | undefined;
}, {
    content: {
        type: string;
    } & {
        [k: string]: unknown;
    };
    role: "agent";
    meta?: {
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sentFrom?: string | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        attachmentRefs?: {
            name: string;
            size: number;
            remotePath: string;
        }[] | undefined;
        contextBoundaryFallback?: boolean | undefined;
    } | undefined;
}>, z.ZodObject<{
    role: z.ZodLiteral<"session">;
    content: z.ZodEffects<z.ZodObject<{
        id: z.ZodString;
        time: z.ZodNumber;
        role: z.ZodUnion<[z.ZodLiteral<"user">, z.ZodLiteral<"agent">]>;
        turn: z.ZodOptional<z.ZodString>;
        subagent: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        ev: z.ZodDiscriminatedUnion<"t", [z.ZodObject<{
            t: z.ZodLiteral<"text">;
            text: z.ZodString;
            thinking: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            t: "text";
            text: string;
            thinking?: boolean | undefined;
        }, {
            t: "text";
            text: string;
            thinking?: boolean | undefined;
        }>, z.ZodObject<{
            t: z.ZodLiteral<"service">;
            text: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            t: "service";
            text: string;
        }, {
            t: "service";
            text: string;
        }>, z.ZodObject<{
            t: z.ZodLiteral<"tool-call-start">;
            call: z.ZodString;
            name: z.ZodString;
            title: z.ZodString;
            description: z.ZodString;
            args: z.ZodRecord<z.ZodString, z.ZodUnknown>;
            permissionRequestId: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            t: "tool-call-start";
            call: string;
            name: string;
            title: string;
            description: string;
            args: Record<string, unknown>;
            permissionRequestId?: string | undefined;
        }, {
            t: "tool-call-start";
            call: string;
            name: string;
            title: string;
            description: string;
            args: Record<string, unknown>;
            permissionRequestId?: string | undefined;
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
            t: "turn-end";
            status: "completed" | "failed" | "cancelled";
        }, {
            t: "turn-end";
            status: "completed" | "failed" | "cancelled";
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
            t: "context-boundary";
            at: number;
            kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
            triggeredBy: "user" | "agent" | "system";
            summaryRef?: string | undefined;
            forkedFromSid?: string | undefined;
        }, {
            t: "context-boundary";
            at: number;
            kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
            triggeredBy: "user" | "agent" | "system";
            summaryRef?: string | undefined;
            forkedFromSid?: string | undefined;
        }>, z.ZodObject<{
            t: z.ZodLiteral<"agent-configuration-changed">;
            permissionMode: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            model: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            thinkingLevel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            sandbox: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            t: "agent-configuration-changed";
            permissionMode?: string | null | undefined;
            model?: string | null | undefined;
            thinkingLevel?: string | null | undefined;
            sandbox?: string | null | undefined;
        }, {
            t: "agent-configuration-changed";
            permissionMode?: string | null | undefined;
            model?: string | null | undefined;
            thinkingLevel?: string | null | undefined;
            sandbox?: string | null | undefined;
        }>, z.ZodObject<{
            t: z.ZodLiteral<"message-consumption">;
            messageId: z.ZodString;
            consumedAt: z.ZodNumber;
            agentFlavor: z.ZodEnum<["claude", "codex"]>;
        }, "strip", z.ZodTypeAny, {
            t: "message-consumption";
            messageId: string;
            consumedAt: number;
            agentFlavor: "claude" | "codex";
        }, {
            t: "message-consumption";
            messageId: string;
            consumedAt: number;
            agentFlavor: "claude" | "codex";
        }>]>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        role: "user" | "agent";
        time: number;
        ev: {
            t: "text";
            text: string;
            thinking?: boolean | undefined;
        } | {
            t: "service";
            text: string;
        } | {
            t: "tool-call-start";
            call: string;
            name: string;
            title: string;
            description: string;
            args: Record<string, unknown>;
            permissionRequestId?: string | undefined;
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
            t: "turn-end";
            status: "completed" | "failed" | "cancelled";
        } | {
            t: "stop";
        } | {
            t: "context-boundary";
            at: number;
            kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
            triggeredBy: "user" | "agent" | "system";
            summaryRef?: string | undefined;
            forkedFromSid?: string | undefined;
        } | {
            t: "agent-configuration-changed";
            permissionMode?: string | null | undefined;
            model?: string | null | undefined;
            thinkingLevel?: string | null | undefined;
            sandbox?: string | null | undefined;
        } | {
            t: "message-consumption";
            messageId: string;
            consumedAt: number;
            agentFlavor: "claude" | "codex";
        };
        turn?: string | undefined;
        subagent?: string | undefined;
    }, {
        id: string;
        role: "user" | "agent";
        time: number;
        ev: {
            t: "text";
            text: string;
            thinking?: boolean | undefined;
        } | {
            t: "service";
            text: string;
        } | {
            t: "tool-call-start";
            call: string;
            name: string;
            title: string;
            description: string;
            args: Record<string, unknown>;
            permissionRequestId?: string | undefined;
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
            t: "turn-end";
            status: "completed" | "failed" | "cancelled";
        } | {
            t: "stop";
        } | {
            t: "context-boundary";
            at: number;
            kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
            triggeredBy: "user" | "agent" | "system";
            summaryRef?: string | undefined;
            forkedFromSid?: string | undefined;
        } | {
            t: "agent-configuration-changed";
            permissionMode?: string | null | undefined;
            model?: string | null | undefined;
            thinkingLevel?: string | null | undefined;
            sandbox?: string | null | undefined;
        } | {
            t: "message-consumption";
            messageId: string;
            consumedAt: number;
            agentFlavor: "claude" | "codex";
        };
        turn?: string | undefined;
        subagent?: string | undefined;
    }>, {
        id: string;
        role: "user" | "agent";
        time: number;
        ev: {
            t: "text";
            text: string;
            thinking?: boolean | undefined;
        } | {
            t: "service";
            text: string;
        } | {
            t: "tool-call-start";
            call: string;
            name: string;
            title: string;
            description: string;
            args: Record<string, unknown>;
            permissionRequestId?: string | undefined;
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
            t: "turn-end";
            status: "completed" | "failed" | "cancelled";
        } | {
            t: "stop";
        } | {
            t: "context-boundary";
            at: number;
            kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
            triggeredBy: "user" | "agent" | "system";
            summaryRef?: string | undefined;
            forkedFromSid?: string | undefined;
        } | {
            t: "agent-configuration-changed";
            permissionMode?: string | null | undefined;
            model?: string | null | undefined;
            thinkingLevel?: string | null | undefined;
            sandbox?: string | null | undefined;
        } | {
            t: "message-consumption";
            messageId: string;
            consumedAt: number;
            agentFlavor: "claude" | "codex";
        };
        turn?: string | undefined;
        subagent?: string | undefined;
    }, {
        id: string;
        role: "user" | "agent";
        time: number;
        ev: {
            t: "text";
            text: string;
            thinking?: boolean | undefined;
        } | {
            t: "service";
            text: string;
        } | {
            t: "tool-call-start";
            call: string;
            name: string;
            title: string;
            description: string;
            args: Record<string, unknown>;
            permissionRequestId?: string | undefined;
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
            t: "turn-end";
            status: "completed" | "failed" | "cancelled";
        } | {
            t: "stop";
        } | {
            t: "context-boundary";
            at: number;
            kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
            triggeredBy: "user" | "agent" | "system";
            summaryRef?: string | undefined;
            forkedFromSid?: string | undefined;
        } | {
            t: "agent-configuration-changed";
            permissionMode?: string | null | undefined;
            model?: string | null | undefined;
            thinkingLevel?: string | null | undefined;
            sandbox?: string | null | undefined;
        } | {
            t: "message-consumption";
            messageId: string;
            consumedAt: number;
            agentFlavor: "claude" | "codex";
        };
        turn?: string | undefined;
        subagent?: string | undefined;
    }>;
    meta: z.ZodOptional<z.ZodObject<{
        sentFrom: z.ZodOptional<z.ZodString>;
        permissionMode: z.ZodOptional<z.ZodEnum<["default", "acceptEdits", "bypassPermissions", "plan", "read-only", "safe-yolo", "yolo"]>>;
        model: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        thinkingLevel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        fallbackModel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        appendSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        allowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        disallowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        displayText: z.ZodOptional<z.ZodString>;
        attachmentRefs: z.ZodOptional<z.ZodArray<z.ZodObject<{
            remotePath: z.ZodString;
            name: z.ZodString;
            size: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            name: string;
            size: number;
            remotePath: string;
        }, {
            name: string;
            size: number;
            remotePath: string;
        }>, "many">>;
        contextBoundaryFallback: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sentFrom?: string | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        attachmentRefs?: {
            name: string;
            size: number;
            remotePath: string;
        }[] | undefined;
        contextBoundaryFallback?: boolean | undefined;
    }, {
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sentFrom?: string | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        attachmentRefs?: {
            name: string;
            size: number;
            remotePath: string;
        }[] | undefined;
        contextBoundaryFallback?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    content: {
        id: string;
        role: "user" | "agent";
        time: number;
        ev: {
            t: "text";
            text: string;
            thinking?: boolean | undefined;
        } | {
            t: "service";
            text: string;
        } | {
            t: "tool-call-start";
            call: string;
            name: string;
            title: string;
            description: string;
            args: Record<string, unknown>;
            permissionRequestId?: string | undefined;
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
            t: "turn-end";
            status: "completed" | "failed" | "cancelled";
        } | {
            t: "stop";
        } | {
            t: "context-boundary";
            at: number;
            kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
            triggeredBy: "user" | "agent" | "system";
            summaryRef?: string | undefined;
            forkedFromSid?: string | undefined;
        } | {
            t: "agent-configuration-changed";
            permissionMode?: string | null | undefined;
            model?: string | null | undefined;
            thinkingLevel?: string | null | undefined;
            sandbox?: string | null | undefined;
        } | {
            t: "message-consumption";
            messageId: string;
            consumedAt: number;
            agentFlavor: "claude" | "codex";
        };
        turn?: string | undefined;
        subagent?: string | undefined;
    };
    role: "session";
    meta?: {
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sentFrom?: string | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        attachmentRefs?: {
            name: string;
            size: number;
            remotePath: string;
        }[] | undefined;
        contextBoundaryFallback?: boolean | undefined;
    } | undefined;
}, {
    content: {
        id: string;
        role: "user" | "agent";
        time: number;
        ev: {
            t: "text";
            text: string;
            thinking?: boolean | undefined;
        } | {
            t: "service";
            text: string;
        } | {
            t: "tool-call-start";
            call: string;
            name: string;
            title: string;
            description: string;
            args: Record<string, unknown>;
            permissionRequestId?: string | undefined;
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
            t: "turn-end";
            status: "completed" | "failed" | "cancelled";
        } | {
            t: "stop";
        } | {
            t: "context-boundary";
            at: number;
            kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
            triggeredBy: "user" | "agent" | "system";
            summaryRef?: string | undefined;
            forkedFromSid?: string | undefined;
        } | {
            t: "agent-configuration-changed";
            permissionMode?: string | null | undefined;
            model?: string | null | undefined;
            thinkingLevel?: string | null | undefined;
            sandbox?: string | null | undefined;
        } | {
            t: "message-consumption";
            messageId: string;
            consumedAt: number;
            agentFlavor: "claude" | "codex";
        };
        turn?: string | undefined;
        subagent?: string | undefined;
    };
    role: "session";
    meta?: {
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sentFrom?: string | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        attachmentRefs?: {
            name: string;
            size: number;
            remotePath: string;
        }[] | undefined;
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
        id: string;
        seq: number;
        content: {
            c: string;
            t: "encrypted";
        };
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    }, {
        id: string;
        seq: number;
        content: {
            c: string;
            t: "encrypted";
        };
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    t: "new-message";
    message: {
        id: string;
        seq: number;
        content: {
            c: string;
            t: "encrypted";
        };
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    };
    sid: string;
}, {
    t: "new-message";
    message: {
        id: string;
        seq: number;
        content: {
            c: string;
            t: "encrypted";
        };
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    };
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
        id: string;
        seq: number;
        content: {
            c: string;
            t: "encrypted";
        };
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    }, {
        id: string;
        seq: number;
        content: {
            c: string;
            t: "encrypted";
        };
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    t: "new-message";
    message: {
        id: string;
        seq: number;
        content: {
            c: string;
            t: "encrypted";
        };
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    };
    sid: string;
}, {
    t: "new-message";
    message: {
        id: string;
        seq: number;
        content: {
            c: string;
            t: "encrypted";
        };
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    };
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
            id: string;
            seq: number;
            content: {
                c: string;
                t: "encrypted";
            };
            createdAt: number;
            updatedAt: number;
            localId?: string | null | undefined;
        }, {
            id: string;
            seq: number;
            content: {
                c: string;
                t: "encrypted";
            };
            createdAt: number;
            updatedAt: number;
            localId?: string | null | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        t: "new-message";
        message: {
            id: string;
            seq: number;
            content: {
                c: string;
                t: "encrypted";
            };
            createdAt: number;
            updatedAt: number;
            localId?: string | null | undefined;
        };
        sid: string;
    }, {
        t: "new-message";
        message: {
            id: string;
            seq: number;
            content: {
                c: string;
                t: "encrypted";
            };
            createdAt: number;
            updatedAt: number;
            localId?: string | null | undefined;
        };
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
        t: "new-message";
        message: {
            id: string;
            seq: number;
            content: {
                c: string;
                t: "encrypted";
            };
            createdAt: number;
            updatedAt: number;
            localId?: string | null | undefined;
        };
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
        t: "new-message";
        message: {
            id: string;
            seq: number;
            content: {
                c: string;
                t: "encrypted";
            };
            createdAt: number;
            updatedAt: number;
            localId?: string | null | undefined;
        };
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
    id: string;
    seq: number;
    content: {
        c: string;
        t: "encrypted";
    };
    createdAt: number;
    updatedAt: number;
    localId?: string | null | undefined;
}, {
    id: string;
    seq: number;
    content: {
        c: string;
        t: "encrypted";
    };
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
        id: string;
        seq: number;
        content: {
            c: string;
            t: "encrypted";
        };
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    }, {
        id: string;
        seq: number;
        content: {
            c: string;
            t: "encrypted";
        };
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    t: "new-message";
    message: {
        id: string;
        seq: number;
        content: {
            c: string;
            t: "encrypted";
        };
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    };
    sid: string;
}, {
    t: "new-message";
    message: {
        id: string;
        seq: number;
        content: {
            c: string;
            t: "encrypted";
        };
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    };
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
        id: string;
        seq: number;
        content: {
            c: string;
            t: "encrypted";
        };
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    }, {
        id: string;
        seq: number;
        content: {
            c: string;
            t: "encrypted";
        };
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    t: "new-message";
    message: {
        id: string;
        seq: number;
        content: {
            c: string;
            t: "encrypted";
        };
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    };
    sid: string;
}, {
    t: "new-message";
    message: {
        id: string;
        seq: number;
        content: {
            c: string;
            t: "encrypted";
        };
        createdAt: number;
        updatedAt: number;
        localId?: string | null | undefined;
    };
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
            id: string;
            seq: number;
            content: {
                c: string;
                t: "encrypted";
            };
            createdAt: number;
            updatedAt: number;
            localId?: string | null | undefined;
        }, {
            id: string;
            seq: number;
            content: {
                c: string;
                t: "encrypted";
            };
            createdAt: number;
            updatedAt: number;
            localId?: string | null | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        t: "new-message";
        message: {
            id: string;
            seq: number;
            content: {
                c: string;
                t: "encrypted";
            };
            createdAt: number;
            updatedAt: number;
            localId?: string | null | undefined;
        };
        sid: string;
    }, {
        t: "new-message";
        message: {
            id: string;
            seq: number;
            content: {
                c: string;
                t: "encrypted";
            };
            createdAt: number;
            updatedAt: number;
            localId?: string | null | undefined;
        };
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
        t: "new-message";
        message: {
            id: string;
            seq: number;
            content: {
                c: string;
                t: "encrypted";
            };
            createdAt: number;
            updatedAt: number;
            localId?: string | null | undefined;
        };
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
        t: "new-message";
        message: {
            id: string;
            seq: number;
            content: {
                c: string;
                t: "encrypted";
            };
            createdAt: number;
            updatedAt: number;
            localId?: string | null | undefined;
        };
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
        attachments: z.ZodOptional<z.ZodArray<z.ZodObject<{
            type: z.ZodLiteral<"image">;
            ref: z.ZodString;
            mimeType: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            type: "image";
            ref: string;
            mimeType?: string | undefined;
        }, {
            type: "image";
            ref: string;
            mimeType?: string | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        type: "text";
        text: string;
        attachments?: {
            type: "image";
            ref: string;
            mimeType?: string | undefined;
        }[] | undefined;
    }, {
        type: "text";
        text: string;
        attachments?: {
            type: "image";
            ref: string;
            mimeType?: string | undefined;
        }[] | undefined;
    }>;
    localKey: z.ZodOptional<z.ZodString>;
    meta: z.ZodOptional<z.ZodObject<{
        sentFrom: z.ZodOptional<z.ZodString>;
        permissionMode: z.ZodOptional<z.ZodEnum<["default", "acceptEdits", "bypassPermissions", "plan", "read-only", "safe-yolo", "yolo"]>>;
        model: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        thinkingLevel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        fallbackModel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        appendSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        allowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        disallowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        displayText: z.ZodOptional<z.ZodString>;
        attachmentRefs: z.ZodOptional<z.ZodArray<z.ZodObject<{
            remotePath: z.ZodString;
            name: z.ZodString;
            size: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            name: string;
            size: number;
            remotePath: string;
        }, {
            name: string;
            size: number;
            remotePath: string;
        }>, "many">>;
        contextBoundaryFallback: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sentFrom?: string | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        attachmentRefs?: {
            name: string;
            size: number;
            remotePath: string;
        }[] | undefined;
        contextBoundaryFallback?: boolean | undefined;
    }, {
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sentFrom?: string | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        attachmentRefs?: {
            name: string;
            size: number;
            remotePath: string;
        }[] | undefined;
        contextBoundaryFallback?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    content: {
        type: "text";
        text: string;
        attachments?: {
            type: "image";
            ref: string;
            mimeType?: string | undefined;
        }[] | undefined;
    };
    role: "user";
    meta?: {
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sentFrom?: string | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        attachmentRefs?: {
            name: string;
            size: number;
            remotePath: string;
        }[] | undefined;
        contextBoundaryFallback?: boolean | undefined;
    } | undefined;
    localKey?: string | undefined;
}, {
    content: {
        type: "text";
        text: string;
        attachments?: {
            type: "image";
            ref: string;
            mimeType?: string | undefined;
        }[] | undefined;
    };
    role: "user";
    meta?: {
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sentFrom?: string | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        attachmentRefs?: {
            name: string;
            size: number;
            remotePath: string;
        }[] | undefined;
        contextBoundaryFallback?: boolean | undefined;
    } | undefined;
    localKey?: string | undefined;
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
        thinkingLevel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        fallbackModel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        appendSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        allowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        disallowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        displayText: z.ZodOptional<z.ZodString>;
        attachmentRefs: z.ZodOptional<z.ZodArray<z.ZodObject<{
            remotePath: z.ZodString;
            name: z.ZodString;
            size: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            name: string;
            size: number;
            remotePath: string;
        }, {
            name: string;
            size: number;
            remotePath: string;
        }>, "many">>;
        contextBoundaryFallback: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sentFrom?: string | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        attachmentRefs?: {
            name: string;
            size: number;
            remotePath: string;
        }[] | undefined;
        contextBoundaryFallback?: boolean | undefined;
    }, {
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sentFrom?: string | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        attachmentRefs?: {
            name: string;
            size: number;
            remotePath: string;
        }[] | undefined;
        contextBoundaryFallback?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    content: {
        type: string;
    } & {
        [k: string]: unknown;
    };
    role: "agent";
    meta?: {
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sentFrom?: string | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        attachmentRefs?: {
            name: string;
            size: number;
            remotePath: string;
        }[] | undefined;
        contextBoundaryFallback?: boolean | undefined;
    } | undefined;
}, {
    content: {
        type: string;
    } & {
        [k: string]: unknown;
    };
    role: "agent";
    meta?: {
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sentFrom?: string | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        attachmentRefs?: {
            name: string;
            size: number;
            remotePath: string;
        }[] | undefined;
        contextBoundaryFallback?: boolean | undefined;
    } | undefined;
}>;
type AgentMessage = z.infer<typeof AgentMessageSchema>;
declare const LegacyMessageContentSchema: z.ZodDiscriminatedUnion<"role", [z.ZodObject<{
    role: z.ZodLiteral<"user">;
    content: z.ZodObject<{
        type: z.ZodLiteral<"text">;
        text: z.ZodString;
        attachments: z.ZodOptional<z.ZodArray<z.ZodObject<{
            type: z.ZodLiteral<"image">;
            ref: z.ZodString;
            mimeType: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            type: "image";
            ref: string;
            mimeType?: string | undefined;
        }, {
            type: "image";
            ref: string;
            mimeType?: string | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        type: "text";
        text: string;
        attachments?: {
            type: "image";
            ref: string;
            mimeType?: string | undefined;
        }[] | undefined;
    }, {
        type: "text";
        text: string;
        attachments?: {
            type: "image";
            ref: string;
            mimeType?: string | undefined;
        }[] | undefined;
    }>;
    localKey: z.ZodOptional<z.ZodString>;
    meta: z.ZodOptional<z.ZodObject<{
        sentFrom: z.ZodOptional<z.ZodString>;
        permissionMode: z.ZodOptional<z.ZodEnum<["default", "acceptEdits", "bypassPermissions", "plan", "read-only", "safe-yolo", "yolo"]>>;
        model: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        thinkingLevel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        fallbackModel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        appendSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        allowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        disallowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        displayText: z.ZodOptional<z.ZodString>;
        attachmentRefs: z.ZodOptional<z.ZodArray<z.ZodObject<{
            remotePath: z.ZodString;
            name: z.ZodString;
            size: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            name: string;
            size: number;
            remotePath: string;
        }, {
            name: string;
            size: number;
            remotePath: string;
        }>, "many">>;
        contextBoundaryFallback: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sentFrom?: string | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        attachmentRefs?: {
            name: string;
            size: number;
            remotePath: string;
        }[] | undefined;
        contextBoundaryFallback?: boolean | undefined;
    }, {
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sentFrom?: string | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        attachmentRefs?: {
            name: string;
            size: number;
            remotePath: string;
        }[] | undefined;
        contextBoundaryFallback?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    content: {
        type: "text";
        text: string;
        attachments?: {
            type: "image";
            ref: string;
            mimeType?: string | undefined;
        }[] | undefined;
    };
    role: "user";
    meta?: {
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sentFrom?: string | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        attachmentRefs?: {
            name: string;
            size: number;
            remotePath: string;
        }[] | undefined;
        contextBoundaryFallback?: boolean | undefined;
    } | undefined;
    localKey?: string | undefined;
}, {
    content: {
        type: "text";
        text: string;
        attachments?: {
            type: "image";
            ref: string;
            mimeType?: string | undefined;
        }[] | undefined;
    };
    role: "user";
    meta?: {
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sentFrom?: string | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        attachmentRefs?: {
            name: string;
            size: number;
            remotePath: string;
        }[] | undefined;
        contextBoundaryFallback?: boolean | undefined;
    } | undefined;
    localKey?: string | undefined;
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
        thinkingLevel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        fallbackModel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        appendSystemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        allowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        disallowedTools: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        displayText: z.ZodOptional<z.ZodString>;
        attachmentRefs: z.ZodOptional<z.ZodArray<z.ZodObject<{
            remotePath: z.ZodString;
            name: z.ZodString;
            size: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            name: string;
            size: number;
            remotePath: string;
        }, {
            name: string;
            size: number;
            remotePath: string;
        }>, "many">>;
        contextBoundaryFallback: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sentFrom?: string | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        attachmentRefs?: {
            name: string;
            size: number;
            remotePath: string;
        }[] | undefined;
        contextBoundaryFallback?: boolean | undefined;
    }, {
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sentFrom?: string | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        attachmentRefs?: {
            name: string;
            size: number;
            remotePath: string;
        }[] | undefined;
        contextBoundaryFallback?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    content: {
        type: string;
    } & {
        [k: string]: unknown;
    };
    role: "agent";
    meta?: {
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sentFrom?: string | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        attachmentRefs?: {
            name: string;
            size: number;
            remotePath: string;
        }[] | undefined;
        contextBoundaryFallback?: boolean | undefined;
    } | undefined;
}, {
    content: {
        type: string;
    } & {
        [k: string]: unknown;
    };
    role: "agent";
    meta?: {
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sentFrom?: string | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
        displayText?: string | undefined;
        attachmentRefs?: {
            name: string;
            size: number;
            remotePath: string;
        }[] | undefined;
        contextBoundaryFallback?: boolean | undefined;
    } | undefined;
}>]>;
type LegacyMessageContent = z.infer<typeof LegacyMessageContentSchema>;

declare const sessionRoleSchema: z.ZodUnion<[z.ZodLiteral<"user">, z.ZodLiteral<"agent">]>;
type SessionRole = z.infer<typeof sessionRoleSchema>;
declare const sessionTextEventSchema: z.ZodObject<{
    t: z.ZodLiteral<"text">;
    text: z.ZodString;
    thinking: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    t: "text";
    text: string;
    thinking?: boolean | undefined;
}, {
    t: "text";
    text: string;
    thinking?: boolean | undefined;
}>;
declare const sessionServiceMessageEventSchema: z.ZodObject<{
    t: z.ZodLiteral<"service">;
    text: z.ZodString;
}, "strip", z.ZodTypeAny, {
    t: "service";
    text: string;
}, {
    t: "service";
    text: string;
}>;
declare const sessionToolCallStartEventSchema: z.ZodObject<{
    t: z.ZodLiteral<"tool-call-start">;
    call: z.ZodString;
    name: z.ZodString;
    title: z.ZodString;
    description: z.ZodString;
    args: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    permissionRequestId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    t: "tool-call-start";
    call: string;
    name: string;
    title: string;
    description: string;
    args: Record<string, unknown>;
    permissionRequestId?: string | undefined;
}, {
    t: "tool-call-start";
    call: string;
    name: string;
    title: string;
    description: string;
    args: Record<string, unknown>;
    permissionRequestId?: string | undefined;
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
    t: "turn-end";
    status: "completed" | "failed" | "cancelled";
}, {
    t: "turn-end";
    status: "completed" | "failed" | "cancelled";
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
    t: "context-boundary";
    at: number;
    kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
    triggeredBy: "user" | "agent" | "system";
    summaryRef?: string | undefined;
    forkedFromSid?: string | undefined;
}, {
    t: "context-boundary";
    at: number;
    kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
    triggeredBy: "user" | "agent" | "system";
    summaryRef?: string | undefined;
    forkedFromSid?: string | undefined;
}>;
type SessionContextBoundaryEvent = z.infer<typeof sessionContextBoundaryEventSchema>;
declare const sessionAgentConfigurationChangedEventSchema: z.ZodObject<{
    t: z.ZodLiteral<"agent-configuration-changed">;
    permissionMode: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    model: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    thinkingLevel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    sandbox: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    t: "agent-configuration-changed";
    permissionMode?: string | null | undefined;
    model?: string | null | undefined;
    thinkingLevel?: string | null | undefined;
    sandbox?: string | null | undefined;
}, {
    t: "agent-configuration-changed";
    permissionMode?: string | null | undefined;
    model?: string | null | undefined;
    thinkingLevel?: string | null | undefined;
    sandbox?: string | null | undefined;
}>;
type SessionAgentConfigurationChangedEvent = z.infer<typeof sessionAgentConfigurationChangedEventSchema>;
declare const sessionMessageConsumptionEventSchema: z.ZodObject<{
    t: z.ZodLiteral<"message-consumption">;
    messageId: z.ZodString;
    consumedAt: z.ZodNumber;
    agentFlavor: z.ZodEnum<["claude", "codex"]>;
}, "strip", z.ZodTypeAny, {
    t: "message-consumption";
    messageId: string;
    consumedAt: number;
    agentFlavor: "claude" | "codex";
}, {
    t: "message-consumption";
    messageId: string;
    consumedAt: number;
    agentFlavor: "claude" | "codex";
}>;
type SessionMessageConsumptionEvent = z.infer<typeof sessionMessageConsumptionEventSchema>;
declare const sessionEventSchema: z.ZodDiscriminatedUnion<"t", [z.ZodObject<{
    t: z.ZodLiteral<"text">;
    text: z.ZodString;
    thinking: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    t: "text";
    text: string;
    thinking?: boolean | undefined;
}, {
    t: "text";
    text: string;
    thinking?: boolean | undefined;
}>, z.ZodObject<{
    t: z.ZodLiteral<"service">;
    text: z.ZodString;
}, "strip", z.ZodTypeAny, {
    t: "service";
    text: string;
}, {
    t: "service";
    text: string;
}>, z.ZodObject<{
    t: z.ZodLiteral<"tool-call-start">;
    call: z.ZodString;
    name: z.ZodString;
    title: z.ZodString;
    description: z.ZodString;
    args: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    permissionRequestId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    t: "tool-call-start";
    call: string;
    name: string;
    title: string;
    description: string;
    args: Record<string, unknown>;
    permissionRequestId?: string | undefined;
}, {
    t: "tool-call-start";
    call: string;
    name: string;
    title: string;
    description: string;
    args: Record<string, unknown>;
    permissionRequestId?: string | undefined;
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
    t: "turn-end";
    status: "completed" | "failed" | "cancelled";
}, {
    t: "turn-end";
    status: "completed" | "failed" | "cancelled";
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
    t: "context-boundary";
    at: number;
    kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
    triggeredBy: "user" | "agent" | "system";
    summaryRef?: string | undefined;
    forkedFromSid?: string | undefined;
}, {
    t: "context-boundary";
    at: number;
    kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
    triggeredBy: "user" | "agent" | "system";
    summaryRef?: string | undefined;
    forkedFromSid?: string | undefined;
}>, z.ZodObject<{
    t: z.ZodLiteral<"agent-configuration-changed">;
    permissionMode: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    model: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    thinkingLevel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    sandbox: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    t: "agent-configuration-changed";
    permissionMode?: string | null | undefined;
    model?: string | null | undefined;
    thinkingLevel?: string | null | undefined;
    sandbox?: string | null | undefined;
}, {
    t: "agent-configuration-changed";
    permissionMode?: string | null | undefined;
    model?: string | null | undefined;
    thinkingLevel?: string | null | undefined;
    sandbox?: string | null | undefined;
}>, z.ZodObject<{
    t: z.ZodLiteral<"message-consumption">;
    messageId: z.ZodString;
    consumedAt: z.ZodNumber;
    agentFlavor: z.ZodEnum<["claude", "codex"]>;
}, "strip", z.ZodTypeAny, {
    t: "message-consumption";
    messageId: string;
    consumedAt: number;
    agentFlavor: "claude" | "codex";
}, {
    t: "message-consumption";
    messageId: string;
    consumedAt: number;
    agentFlavor: "claude" | "codex";
}>]>;
type SessionEvent = z.infer<typeof sessionEventSchema>;
declare const sessionEnvelopeSchema: z.ZodEffects<z.ZodObject<{
    id: z.ZodString;
    time: z.ZodNumber;
    role: z.ZodUnion<[z.ZodLiteral<"user">, z.ZodLiteral<"agent">]>;
    turn: z.ZodOptional<z.ZodString>;
    subagent: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    ev: z.ZodDiscriminatedUnion<"t", [z.ZodObject<{
        t: z.ZodLiteral<"text">;
        text: z.ZodString;
        thinking: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        t: "text";
        text: string;
        thinking?: boolean | undefined;
    }, {
        t: "text";
        text: string;
        thinking?: boolean | undefined;
    }>, z.ZodObject<{
        t: z.ZodLiteral<"service">;
        text: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        t: "service";
        text: string;
    }, {
        t: "service";
        text: string;
    }>, z.ZodObject<{
        t: z.ZodLiteral<"tool-call-start">;
        call: z.ZodString;
        name: z.ZodString;
        title: z.ZodString;
        description: z.ZodString;
        args: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        permissionRequestId: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        t: "tool-call-start";
        call: string;
        name: string;
        title: string;
        description: string;
        args: Record<string, unknown>;
        permissionRequestId?: string | undefined;
    }, {
        t: "tool-call-start";
        call: string;
        name: string;
        title: string;
        description: string;
        args: Record<string, unknown>;
        permissionRequestId?: string | undefined;
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
        t: "turn-end";
        status: "completed" | "failed" | "cancelled";
    }, {
        t: "turn-end";
        status: "completed" | "failed" | "cancelled";
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
        t: "context-boundary";
        at: number;
        kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
        triggeredBy: "user" | "agent" | "system";
        summaryRef?: string | undefined;
        forkedFromSid?: string | undefined;
    }, {
        t: "context-boundary";
        at: number;
        kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
        triggeredBy: "user" | "agent" | "system";
        summaryRef?: string | undefined;
        forkedFromSid?: string | undefined;
    }>, z.ZodObject<{
        t: z.ZodLiteral<"agent-configuration-changed">;
        permissionMode: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        model: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        thinkingLevel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        sandbox: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        t: "agent-configuration-changed";
        permissionMode?: string | null | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sandbox?: string | null | undefined;
    }, {
        t: "agent-configuration-changed";
        permissionMode?: string | null | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sandbox?: string | null | undefined;
    }>, z.ZodObject<{
        t: z.ZodLiteral<"message-consumption">;
        messageId: z.ZodString;
        consumedAt: z.ZodNumber;
        agentFlavor: z.ZodEnum<["claude", "codex"]>;
    }, "strip", z.ZodTypeAny, {
        t: "message-consumption";
        messageId: string;
        consumedAt: number;
        agentFlavor: "claude" | "codex";
    }, {
        t: "message-consumption";
        messageId: string;
        consumedAt: number;
        agentFlavor: "claude" | "codex";
    }>]>;
}, "strip", z.ZodTypeAny, {
    id: string;
    role: "user" | "agent";
    time: number;
    ev: {
        t: "text";
        text: string;
        thinking?: boolean | undefined;
    } | {
        t: "service";
        text: string;
    } | {
        t: "tool-call-start";
        call: string;
        name: string;
        title: string;
        description: string;
        args: Record<string, unknown>;
        permissionRequestId?: string | undefined;
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
        t: "turn-end";
        status: "completed" | "failed" | "cancelled";
    } | {
        t: "stop";
    } | {
        t: "context-boundary";
        at: number;
        kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
        triggeredBy: "user" | "agent" | "system";
        summaryRef?: string | undefined;
        forkedFromSid?: string | undefined;
    } | {
        t: "agent-configuration-changed";
        permissionMode?: string | null | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sandbox?: string | null | undefined;
    } | {
        t: "message-consumption";
        messageId: string;
        consumedAt: number;
        agentFlavor: "claude" | "codex";
    };
    turn?: string | undefined;
    subagent?: string | undefined;
}, {
    id: string;
    role: "user" | "agent";
    time: number;
    ev: {
        t: "text";
        text: string;
        thinking?: boolean | undefined;
    } | {
        t: "service";
        text: string;
    } | {
        t: "tool-call-start";
        call: string;
        name: string;
        title: string;
        description: string;
        args: Record<string, unknown>;
        permissionRequestId?: string | undefined;
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
        t: "turn-end";
        status: "completed" | "failed" | "cancelled";
    } | {
        t: "stop";
    } | {
        t: "context-boundary";
        at: number;
        kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
        triggeredBy: "user" | "agent" | "system";
        summaryRef?: string | undefined;
        forkedFromSid?: string | undefined;
    } | {
        t: "agent-configuration-changed";
        permissionMode?: string | null | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sandbox?: string | null | undefined;
    } | {
        t: "message-consumption";
        messageId: string;
        consumedAt: number;
        agentFlavor: "claude" | "codex";
    };
    turn?: string | undefined;
    subagent?: string | undefined;
}>, {
    id: string;
    role: "user" | "agent";
    time: number;
    ev: {
        t: "text";
        text: string;
        thinking?: boolean | undefined;
    } | {
        t: "service";
        text: string;
    } | {
        t: "tool-call-start";
        call: string;
        name: string;
        title: string;
        description: string;
        args: Record<string, unknown>;
        permissionRequestId?: string | undefined;
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
        t: "turn-end";
        status: "completed" | "failed" | "cancelled";
    } | {
        t: "stop";
    } | {
        t: "context-boundary";
        at: number;
        kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
        triggeredBy: "user" | "agent" | "system";
        summaryRef?: string | undefined;
        forkedFromSid?: string | undefined;
    } | {
        t: "agent-configuration-changed";
        permissionMode?: string | null | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sandbox?: string | null | undefined;
    } | {
        t: "message-consumption";
        messageId: string;
        consumedAt: number;
        agentFlavor: "claude" | "codex";
    };
    turn?: string | undefined;
    subagent?: string | undefined;
}, {
    id: string;
    role: "user" | "agent";
    time: number;
    ev: {
        t: "text";
        text: string;
        thinking?: boolean | undefined;
    } | {
        t: "service";
        text: string;
    } | {
        t: "tool-call-start";
        call: string;
        name: string;
        title: string;
        description: string;
        args: Record<string, unknown>;
        permissionRequestId?: string | undefined;
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
        t: "turn-end";
        status: "completed" | "failed" | "cancelled";
    } | {
        t: "stop";
    } | {
        t: "context-boundary";
        at: number;
        kind: "clear" | "compact" | "autocompact" | "plan-mode-enter" | "plan-mode-exit" | "session-fork-resume";
        triggeredBy: "user" | "agent" | "system";
        summaryRef?: string | undefined;
        forkedFromSid?: string | undefined;
    } | {
        t: "agent-configuration-changed";
        permissionMode?: string | null | undefined;
        model?: string | null | undefined;
        thinkingLevel?: string | null | undefined;
        sandbox?: string | null | undefined;
    } | {
        t: "message-consumption";
        messageId: string;
        consumedAt: number;
        agentFlavor: "claude" | "codex";
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

declare const TofuPublicKeysSchema: z.ZodObject<{
    ed25519PublicKey: z.ZodString;
    x25519PublicKey: z.ZodString;
    ed25519Fingerprint: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    ed25519PublicKey: string;
    x25519PublicKey: string;
    ed25519Fingerprint?: string | undefined;
}, {
    ed25519PublicKey: string;
    x25519PublicKey: string;
    ed25519Fingerprint?: string | undefined;
}>;
type TofuPublicKeys = z.infer<typeof TofuPublicKeysSchema>;
declare const TofuPubkeysEventSchema: z.ZodObject<{
    t: z.ZodLiteral<"tofu-pubkeys">;
    keys: z.ZodObject<{
        ed25519PublicKey: z.ZodString;
        x25519PublicKey: z.ZodString;
        ed25519Fingerprint: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        ed25519PublicKey: string;
        x25519PublicKey: string;
        ed25519Fingerprint?: string | undefined;
    }, {
        ed25519PublicKey: string;
        x25519PublicKey: string;
        ed25519Fingerprint?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    t: "tofu-pubkeys";
    keys: {
        ed25519PublicKey: string;
        x25519PublicKey: string;
        ed25519Fingerprint?: string | undefined;
    };
}, {
    t: "tofu-pubkeys";
    keys: {
        ed25519PublicKey: string;
        x25519PublicKey: string;
        ed25519Fingerprint?: string | undefined;
    };
}>;
type TofuPubkeysEvent = z.infer<typeof TofuPubkeysEventSchema>;
declare const TofuSessionKeyExchangeSchema: z.ZodObject<{
    t: z.ZodLiteral<"tofu-session-key">;
    machineId: z.ZodString;
    mobileX25519PublicKey: z.ZodString;
    serverX25519PublicKey: z.ZodString;
    sessionKey: z.ZodString;
    firstSeenAt: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    t: "tofu-session-key";
    machineId: string;
    mobileX25519PublicKey: string;
    serverX25519PublicKey: string;
    sessionKey: string;
    firstSeenAt: number;
}, {
    t: "tofu-session-key";
    machineId: string;
    mobileX25519PublicKey: string;
    serverX25519PublicKey: string;
    sessionKey: string;
    firstSeenAt: number;
}>;
type TofuSessionKeyExchange = z.infer<typeof TofuSessionKeyExchangeSchema>;
declare const TofuHandshakeMessageSchema: z.ZodDiscriminatedUnion<"t", [z.ZodObject<{
    t: z.ZodLiteral<"tofu-pubkeys">;
    keys: z.ZodObject<{
        ed25519PublicKey: z.ZodString;
        x25519PublicKey: z.ZodString;
        ed25519Fingerprint: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        ed25519PublicKey: string;
        x25519PublicKey: string;
        ed25519Fingerprint?: string | undefined;
    }, {
        ed25519PublicKey: string;
        x25519PublicKey: string;
        ed25519Fingerprint?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    t: "tofu-pubkeys";
    keys: {
        ed25519PublicKey: string;
        x25519PublicKey: string;
        ed25519Fingerprint?: string | undefined;
    };
}, {
    t: "tofu-pubkeys";
    keys: {
        ed25519PublicKey: string;
        x25519PublicKey: string;
        ed25519Fingerprint?: string | undefined;
    };
}>, z.ZodObject<{
    t: z.ZodLiteral<"tofu-session-key">;
    machineId: z.ZodString;
    mobileX25519PublicKey: z.ZodString;
    serverX25519PublicKey: z.ZodString;
    sessionKey: z.ZodString;
    firstSeenAt: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    t: "tofu-session-key";
    machineId: string;
    mobileX25519PublicKey: string;
    serverX25519PublicKey: string;
    sessionKey: string;
    firstSeenAt: number;
}, {
    t: "tofu-session-key";
    machineId: string;
    mobileX25519PublicKey: string;
    serverX25519PublicKey: string;
    sessionKey: string;
    firstSeenAt: number;
}>]>;
type TofuHandshakeMessage = z.infer<typeof TofuHandshakeMessageSchema>;

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

interface RawClaudeMessageMatchInput {
    type: string;
    message: {
        content: unknown;
    };
}
interface ReceiverRegexFactory {
    buildInlineRe(): RegExp;
    buildStandaloneLineRe(): RegExp;
}
interface NonRenderableEntry {
    name: string;
    senderPredicate?: (raw: RawClaudeMessageMatchInput) => boolean;
    receiverRegexes?: ReceiverRegexFactory;
    receiverPrefix?: RegExp;
    receiverMatchSite: 'skill-body-prefix' | 'wrapped-tag';
}
declare function makeWrappedTagEntry(tagName: string, opts?: {
    enableSender?: boolean;
}): NonRenderableEntry;
declare const skillBodyEntry: NonRenderableEntry;
declare const localCommandCaveatEntry: NonRenderableEntry;
declare const systemReminderEntry: NonRenderableEntry;
declare const forkBoilerplateEntry: NonRenderableEntry;
declare const nonRenderableEntries: readonly NonRenderableEntry[];
declare function findSenderDropEntry(raw: unknown): NonRenderableEntry | null;

export { AgentMessageSchema, ApiMessageSchema, ApiUpdateMachineStateSchema, ApiUpdateNewMessageSchema, ApiUpdateSessionStateSchema, CoreUpdateBodySchema, CoreUpdateContainerSchema, LegacyMessageContentSchema, MessageContentSchema, MessageMetaSchema, SessionMessageContentSchema, SessionMessageRangeRequestSchema, SessionMessageRangeResponseSchema, SessionMessageSchema, SessionProtocolMessageSchema, TofuHandshakeMessageSchema, TofuPubkeysEventSchema, TofuPublicKeysSchema, TofuSessionKeyExchangeSchema, UpdateBodySchema, UpdateMachineBodySchema, UpdateNewMessageBodySchema, UpdateSchema, UpdateSessionBodySchema, UserMessageSchema, VersionedEncryptedValueSchema, VersionedMachineEncryptedValueSchema, VersionedNullableEncryptedValueSchema, VoiceConversationDeniedSchema, VoiceConversationGrantedSchema, VoiceConversationResponseSchema, VoiceUsageResponseSchema, createEnvelope, findSenderDropEntry, forkBoilerplateEntry, localCommandCaveatEntry, makeWrappedTagEntry, nonRenderableEntries, sessionAgentConfigurationChangedEventSchema, sessionContextBoundaryEventSchema, sessionContextBoundaryKindSchema, sessionContextBoundaryTriggeredBySchema, sessionEnvelopeSchema, sessionEventSchema, sessionFileEventSchema, sessionMessageConsumptionEventSchema, sessionRoleSchema, sessionServiceMessageEventSchema, sessionStartEventSchema, sessionStopEventSchema, sessionTextEventSchema, sessionToolCallEndEventSchema, sessionToolCallStartEventSchema, sessionTurnEndEventSchema, sessionTurnEndStatusSchema, sessionTurnStartEventSchema, skillBodyEntry, systemReminderEntry };
export type { AgentMessage, ApiMessage, ApiUpdateMachineState, ApiUpdateNewMessage, ApiUpdateSessionState, CoreUpdateBody, CoreUpdateContainer, CreateEnvelopeOptions, LegacyMessageContent, MessageContent, MessageMeta, NonRenderableEntry, RawClaudeMessageMatchInput, ReceiverRegexFactory, SessionAgentConfigurationChangedEvent, SessionContextBoundaryEvent, SessionContextBoundaryKind, SessionContextBoundaryTriggeredBy, SessionEnvelope, SessionEvent, SessionMessage, SessionMessageConsumptionEvent, SessionMessageContent, SessionMessageRangeRequest, SessionMessageRangeResponse, SessionProtocolMessage, SessionRole, SessionTurnEndStatus, TofuHandshakeMessage, TofuPubkeysEvent, TofuPublicKeys, TofuSessionKeyExchange, Update, UpdateBody, UpdateMachineBody, UpdateNewMessageBody, UpdateSessionBody, UserMessage, VersionedEncryptedValue, VersionedMachineEncryptedValue, VersionedNullableEncryptedValue, VoiceConversationResponse, VoiceUsageResponse };
