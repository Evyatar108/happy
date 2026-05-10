'use strict';

var z = require('zod');
var cuid2 = require('@paralleldrive/cuid2');

function _interopNamespaceDefault(e) {
  var n = Object.create(null);
  if (e) {
    Object.keys(e).forEach(function (k) {
      if (k !== 'default') {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () { return e[k]; }
        });
      }
    });
  }
  n.default = e;
  return Object.freeze(n);
}

var z__namespace = /*#__PURE__*/_interopNamespaceDefault(z);

const sessionRoleSchema = z__namespace.union([z__namespace.literal("user"), z__namespace.literal("agent")]);
const sessionTextEventSchema = z__namespace.object({
  t: z__namespace.literal("text"),
  text: z__namespace.string(),
  thinking: z__namespace.boolean().optional()
});
const sessionServiceMessageEventSchema = z__namespace.object({
  t: z__namespace.literal("service"),
  text: z__namespace.string()
});
const sessionToolCallStartEventSchema = z__namespace.object({
  t: z__namespace.literal("tool-call-start"),
  call: z__namespace.string(),
  name: z__namespace.string(),
  title: z__namespace.string(),
  description: z__namespace.string(),
  args: z__namespace.record(z__namespace.string(), z__namespace.unknown())
});
const sessionToolCallEndEventSchema = z__namespace.object({
  t: z__namespace.literal("tool-call-end"),
  call: z__namespace.string()
});
const sessionFileEventSchema = z__namespace.object({
  t: z__namespace.literal("file"),
  ref: z__namespace.string(),
  name: z__namespace.string(),
  size: z__namespace.number(),
  mimeType: z__namespace.string().optional(),
  image: z__namespace.object({
    width: z__namespace.number(),
    height: z__namespace.number(),
    thumbhash: z__namespace.string()
  }).optional()
});
const sessionTurnStartEventSchema = z__namespace.object({
  t: z__namespace.literal("turn-start")
});
const sessionStartEventSchema = z__namespace.object({
  t: z__namespace.literal("start"),
  title: z__namespace.string().optional()
});
const sessionTurnEndStatusSchema = z__namespace.enum(["completed", "failed", "cancelled"]);
const sessionTurnEndEventSchema = z__namespace.object({
  t: z__namespace.literal("turn-end"),
  status: sessionTurnEndStatusSchema
});
const sessionStopEventSchema = z__namespace.object({
  t: z__namespace.literal("stop")
});
const sessionContextBoundaryKindSchema = z__namespace.enum([
  "clear",
  "compact",
  "autocompact",
  "plan-mode-enter",
  "plan-mode-exit",
  "session-fork-resume"
]);
const sessionContextBoundaryTriggeredBySchema = z__namespace.enum(["user", "agent", "system"]);
const sessionContextBoundaryEventSchema = z__namespace.object({
  t: z__namespace.literal("context-boundary"),
  kind: sessionContextBoundaryKindSchema,
  at: z__namespace.number(),
  /**
   * Boundary source mapping: 'user' for explicit user commands such as /clear,
   * 'agent' for model/agent-initiated lifecycle transitions, and 'system' for
   * Happy runtime or synchronization events.
   */
  triggeredBy: sessionContextBoundaryTriggeredBySchema,
  summaryRef: z__namespace.string().optional(),
  forkedFromSid: z__namespace.string().optional()
});
const sessionAgentConfigurationChangedEventSchema = z__namespace.object({
  t: z__namespace.literal("agent-configuration-changed"),
  permissionMode: z__namespace.string().nullable().optional(),
  model: z__namespace.string().nullable().optional(),
  thinkingLevel: z__namespace.string().nullable().optional(),
  sandbox: z__namespace.string().nullable().optional()
});
const sessionMessageConsumptionEventSchema = z__namespace.object({
  t: z__namespace.literal("message-consumption"),
  messageId: z__namespace.string(),
  consumedAt: z__namespace.number(),
  agentFlavor: z__namespace.enum(["claude", "codex"])
});
const sessionEventSchema = z__namespace.discriminatedUnion("t", [
  sessionTextEventSchema,
  sessionServiceMessageEventSchema,
  sessionToolCallStartEventSchema,
  sessionToolCallEndEventSchema,
  sessionFileEventSchema,
  sessionTurnStartEventSchema,
  sessionStartEventSchema,
  sessionTurnEndEventSchema,
  sessionStopEventSchema,
  sessionContextBoundaryEventSchema,
  sessionAgentConfigurationChangedEventSchema,
  sessionMessageConsumptionEventSchema
]);
const sessionEnvelopeSchema = z__namespace.object({
  id: z__namespace.string(),
  time: z__namespace.number(),
  role: sessionRoleSchema,
  turn: z__namespace.string().optional(),
  subagent: z__namespace.string().refine((value) => cuid2.isCuid(value), {
    message: "subagent must be a cuid2 value"
  }).optional(),
  ev: sessionEventSchema
}).superRefine((envelope, ctx) => {
  if (envelope.ev.t === "service" && envelope.role !== "agent") {
    ctx.addIssue({
      code: z__namespace.ZodIssueCode.custom,
      message: 'service events must use role "agent"',
      path: ["role"]
    });
  }
  if ((envelope.ev.t === "start" || envelope.ev.t === "stop") && envelope.role !== "agent") {
    ctx.addIssue({
      code: z__namespace.ZodIssueCode.custom,
      message: `${envelope.ev.t} events must use role "agent"`,
      path: ["role"]
    });
  }
});
function createEnvelope(role, ev, opts = {}) {
  return sessionEnvelopeSchema.parse({
    id: opts.id ?? cuid2.createId(),
    time: opts.time ?? Date.now(),
    role,
    ...opts.turn ? { turn: opts.turn } : {},
    ...opts.subagent ? { subagent: opts.subagent } : {},
    ev
  });
}

const MessageMetaSchema = z__namespace.object({
  sentFrom: z__namespace.string().optional(),
  permissionMode: z__namespace.enum(["default", "acceptEdits", "bypassPermissions", "plan", "read-only", "safe-yolo", "yolo"]).optional(),
  model: z__namespace.string().nullable().optional(),
  thinkingLevel: z__namespace.string().nullable().optional(),
  fallbackModel: z__namespace.string().nullable().optional(),
  customSystemPrompt: z__namespace.string().nullable().optional(),
  appendSystemPrompt: z__namespace.string().nullable().optional(),
  allowedTools: z__namespace.array(z__namespace.string()).nullable().optional(),
  disallowedTools: z__namespace.array(z__namespace.string()).nullable().optional(),
  displayText: z__namespace.string().optional(),
  contextBoundaryFallback: z__namespace.boolean().optional()
});

const UserMessageSchema = z__namespace.object({
  role: z__namespace.literal("user"),
  content: z__namespace.object({
    type: z__namespace.literal("text"),
    text: z__namespace.string()
  }),
  localKey: z__namespace.string().optional(),
  meta: MessageMetaSchema.optional()
});
const AgentMessageSchema = z__namespace.object({
  role: z__namespace.literal("agent"),
  content: z__namespace.object({
    type: z__namespace.string()
  }).passthrough(),
  meta: MessageMetaSchema.optional()
});
const LegacyMessageContentSchema = z__namespace.discriminatedUnion("role", [UserMessageSchema, AgentMessageSchema]);

const SessionMessageContentSchema = z__namespace.object({
  c: z__namespace.string(),
  t: z__namespace.literal("encrypted")
});
const SessionMessageSchema = z__namespace.object({
  id: z__namespace.string(),
  seq: z__namespace.number(),
  localId: z__namespace.string().nullish(),
  content: SessionMessageContentSchema,
  createdAt: z__namespace.number(),
  updatedAt: z__namespace.number()
});
const SessionMessageRangeRequestSchema = z__namespace.object({
  requestId: z__namespace.string(),
  sessionId: z__namespace.string(),
  fromSeq: z__namespace.number().int().min(0),
  toSeq: z__namespace.number().int(),
  limit: z__namespace.number().int().min(1).max(200)
}).refine((request) => request.toSeq >= request.fromSeq, {
  path: ["toSeq"],
  message: "toSeq must be greater than or equal to fromSeq"
});
const SessionMessageRangeResponseSchema = z__namespace.discriminatedUnion("ok", [
  z__namespace.object({
    ok: z__namespace.literal(true),
    requestId: z__namespace.string(),
    sessionId: z__namespace.string(),
    fromSeq: z__namespace.number().int(),
    toSeq: z__namespace.number().int(),
    messages: z__namespace.array(SessionMessageSchema),
    hasMore: z__namespace.boolean()
  }),
  z__namespace.object({
    ok: z__namespace.literal(false),
    requestId: z__namespace.string(),
    error: z__namespace.object({
      code: z__namespace.enum(["session_not_found", "invalid_range", "rate_limited", "internal"]),
      message: z__namespace.string()
    })
  })
]);
const SessionProtocolMessageSchema = z__namespace.object({
  role: z__namespace.literal("session"),
  content: sessionEnvelopeSchema,
  meta: MessageMetaSchema.optional()
});
const MessageContentSchema = z__namespace.discriminatedUnion("role", [
  UserMessageSchema,
  AgentMessageSchema,
  SessionProtocolMessageSchema
]);
const VersionedEncryptedValueSchema = z__namespace.object({
  version: z__namespace.number(),
  value: z__namespace.string()
});
const VersionedNullableEncryptedValueSchema = z__namespace.object({
  version: z__namespace.number(),
  value: z__namespace.string().nullable()
});
const UpdateNewMessageBodySchema = z__namespace.object({
  t: z__namespace.literal("new-message"),
  sid: z__namespace.string(),
  message: SessionMessageSchema
});
const UpdateSessionBodySchema = z__namespace.object({
  t: z__namespace.literal("update-session"),
  id: z__namespace.string(),
  metadata: VersionedEncryptedValueSchema.nullish(),
  agentState: VersionedNullableEncryptedValueSchema.nullish()
});
const VersionedMachineEncryptedValueSchema = z__namespace.object({
  version: z__namespace.number(),
  value: z__namespace.string()
});
const UpdateMachineBodySchema = z__namespace.object({
  t: z__namespace.literal("update-machine"),
  machineId: z__namespace.string(),
  metadata: VersionedMachineEncryptedValueSchema.nullish(),
  daemonState: VersionedMachineEncryptedValueSchema.nullish(),
  active: z__namespace.boolean().optional(),
  activeAt: z__namespace.number().optional()
});
const CoreUpdateBodySchema = z__namespace.discriminatedUnion("t", [
  UpdateNewMessageBodySchema,
  UpdateSessionBodySchema,
  UpdateMachineBodySchema
]);
const CoreUpdateContainerSchema = z__namespace.object({
  id: z__namespace.string(),
  seq: z__namespace.number(),
  body: CoreUpdateBodySchema,
  createdAt: z__namespace.number()
});
const ApiMessageSchema = SessionMessageSchema;
const ApiUpdateNewMessageSchema = UpdateNewMessageBodySchema;
const ApiUpdateSessionStateSchema = UpdateSessionBodySchema;
const ApiUpdateMachineStateSchema = UpdateMachineBodySchema;
const UpdateBodySchema = UpdateNewMessageBodySchema;
const UpdateSchema = CoreUpdateContainerSchema;

const TofuPublicKeysSchema = z__namespace.object({
  ed25519PublicKey: z__namespace.string().min(1),
  x25519PublicKey: z__namespace.string().min(1),
  ed25519Fingerprint: z__namespace.string().min(1).optional()
});
const TofuPubkeysEventSchema = z__namespace.object({
  t: z__namespace.literal("tofu-pubkeys"),
  keys: TofuPublicKeysSchema
});
const TofuSessionKeyExchangeSchema = z__namespace.object({
  t: z__namespace.literal("tofu-session-key"),
  machineId: z__namespace.string().min(1),
  mobileX25519PublicKey: z__namespace.string().min(1),
  serverX25519PublicKey: z__namespace.string().min(1),
  sessionKey: z__namespace.string().min(1),
  firstSeenAt: z__namespace.number()
});
const TofuHandshakeMessageSchema = z__namespace.discriminatedUnion("t", [
  TofuPubkeysEventSchema,
  TofuSessionKeyExchangeSchema
]);

const VoiceConversationGrantedSchema = z__namespace.object({
  allowed: z__namespace.literal(true),
  conversationToken: z__namespace.string(),
  conversationId: z__namespace.string(),
  agentId: z__namespace.string(),
  elevenUserId: z__namespace.string(),
  usedSeconds: z__namespace.number(),
  limitSeconds: z__namespace.number()
});
const VoiceConversationDeniedSchema = z__namespace.object({
  allowed: z__namespace.literal(false),
  reason: z__namespace.enum(["voice_hard_limit_reached", "subscription_required", "voice_conversation_limit_reached"]),
  usedSeconds: z__namespace.number(),
  limitSeconds: z__namespace.number(),
  agentId: z__namespace.string()
});
const VoiceConversationResponseSchema = z__namespace.discriminatedUnion("allowed", [
  VoiceConversationGrantedSchema,
  VoiceConversationDeniedSchema
]);
const VoiceUsageResponseSchema = z__namespace.object({
  usedSeconds: z__namespace.number(),
  limitSeconds: z__namespace.number(),
  conversationCount: z__namespace.number(),
  conversationLimit: z__namespace.number(),
  elevenUserId: z__namespace.string()
});

const SKILL_BODY_PREFIX_RE = /^Base directory for this skill: \S[^\r\n]*\r?\n\r?\n# /;
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function isMatchInput(raw) {
  return isRecord(raw) && typeof raw.type === "string" && isRecord(raw.message) && "content" in raw.message;
}
function getUserContentShape(raw) {
  if (raw.type !== "user") {
    return null;
  }
  const { content } = raw.message;
  if (typeof content === "string") {
    return { shape: "string", text: content };
  }
  if (Array.isArray(content) && content.length === 1) {
    const [block] = content;
    if (isRecord(block) && block.type === "text" && typeof block.text === "string") {
      return { shape: "array1", text: block.text };
    }
  }
  return null;
}
function makeWrappedTagEntry(tagName, opts) {
  const inlineSource = `<${tagName}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tagName}>`;
  const standaloneLineSource = `(^|\\n)<${tagName}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tagName}>(\\n|$)`;
  const entry = {
    name: tagName,
    receiverMatchSite: "wrapped-tag",
    receiverRegexes: {
      buildInlineRe: () => new RegExp(inlineSource, "gi"),
      buildStandaloneLineRe: () => new RegExp(standaloneLineSource, "gi")
    }
  };
  if (opts?.enableSender) {
    const fullStringRe = new RegExp("^\\s*" + inlineSource + "\\s*$", "i");
    entry.senderPredicate = (raw) => {
      const shaped = getUserContentShape(raw);
      return shaped !== null && shaped.shape === "string" && fullStringRe.test(shaped.text);
    };
  }
  return entry;
}
const skillBodyEntry = {
  name: "skill-body",
  receiverMatchSite: "skill-body-prefix",
  receiverPrefix: SKILL_BODY_PREFIX_RE,
  senderPredicate: (raw) => {
    const shaped = getUserContentShape(raw);
    return shaped !== null && shaped.shape === "array1" && SKILL_BODY_PREFIX_RE.test(shaped.text);
  }
};
const localCommandCaveatEntry = makeWrappedTagEntry("local-command-caveat", { enableSender: true });
const systemReminderEntry = makeWrappedTagEntry("system-reminder");
const forkBoilerplateEntry = makeWrappedTagEntry("fork-boilerplate");
const nonRenderableEntries = [
  skillBodyEntry,
  localCommandCaveatEntry,
  systemReminderEntry,
  forkBoilerplateEntry
];
function findSenderDropEntry(raw) {
  if (!isMatchInput(raw)) {
    return null;
  }
  return nonRenderableEntries.find((entry) => entry.senderPredicate?.(raw)) ?? null;
}

exports.AgentMessageSchema = AgentMessageSchema;
exports.ApiMessageSchema = ApiMessageSchema;
exports.ApiUpdateMachineStateSchema = ApiUpdateMachineStateSchema;
exports.ApiUpdateNewMessageSchema = ApiUpdateNewMessageSchema;
exports.ApiUpdateSessionStateSchema = ApiUpdateSessionStateSchema;
exports.CoreUpdateBodySchema = CoreUpdateBodySchema;
exports.CoreUpdateContainerSchema = CoreUpdateContainerSchema;
exports.LegacyMessageContentSchema = LegacyMessageContentSchema;
exports.MessageContentSchema = MessageContentSchema;
exports.MessageMetaSchema = MessageMetaSchema;
exports.SessionMessageContentSchema = SessionMessageContentSchema;
exports.SessionMessageRangeRequestSchema = SessionMessageRangeRequestSchema;
exports.SessionMessageRangeResponseSchema = SessionMessageRangeResponseSchema;
exports.SessionMessageSchema = SessionMessageSchema;
exports.SessionProtocolMessageSchema = SessionProtocolMessageSchema;
exports.TofuHandshakeMessageSchema = TofuHandshakeMessageSchema;
exports.TofuPubkeysEventSchema = TofuPubkeysEventSchema;
exports.TofuPublicKeysSchema = TofuPublicKeysSchema;
exports.TofuSessionKeyExchangeSchema = TofuSessionKeyExchangeSchema;
exports.UpdateBodySchema = UpdateBodySchema;
exports.UpdateMachineBodySchema = UpdateMachineBodySchema;
exports.UpdateNewMessageBodySchema = UpdateNewMessageBodySchema;
exports.UpdateSchema = UpdateSchema;
exports.UpdateSessionBodySchema = UpdateSessionBodySchema;
exports.UserMessageSchema = UserMessageSchema;
exports.VersionedEncryptedValueSchema = VersionedEncryptedValueSchema;
exports.VersionedMachineEncryptedValueSchema = VersionedMachineEncryptedValueSchema;
exports.VersionedNullableEncryptedValueSchema = VersionedNullableEncryptedValueSchema;
exports.VoiceConversationDeniedSchema = VoiceConversationDeniedSchema;
exports.VoiceConversationGrantedSchema = VoiceConversationGrantedSchema;
exports.VoiceConversationResponseSchema = VoiceConversationResponseSchema;
exports.VoiceUsageResponseSchema = VoiceUsageResponseSchema;
exports.createEnvelope = createEnvelope;
exports.findSenderDropEntry = findSenderDropEntry;
exports.forkBoilerplateEntry = forkBoilerplateEntry;
exports.localCommandCaveatEntry = localCommandCaveatEntry;
exports.makeWrappedTagEntry = makeWrappedTagEntry;
exports.nonRenderableEntries = nonRenderableEntries;
exports.sessionAgentConfigurationChangedEventSchema = sessionAgentConfigurationChangedEventSchema;
exports.sessionContextBoundaryEventSchema = sessionContextBoundaryEventSchema;
exports.sessionContextBoundaryKindSchema = sessionContextBoundaryKindSchema;
exports.sessionContextBoundaryTriggeredBySchema = sessionContextBoundaryTriggeredBySchema;
exports.sessionEnvelopeSchema = sessionEnvelopeSchema;
exports.sessionEventSchema = sessionEventSchema;
exports.sessionFileEventSchema = sessionFileEventSchema;
exports.sessionMessageConsumptionEventSchema = sessionMessageConsumptionEventSchema;
exports.sessionRoleSchema = sessionRoleSchema;
exports.sessionServiceMessageEventSchema = sessionServiceMessageEventSchema;
exports.sessionStartEventSchema = sessionStartEventSchema;
exports.sessionStopEventSchema = sessionStopEventSchema;
exports.sessionTextEventSchema = sessionTextEventSchema;
exports.sessionToolCallEndEventSchema = sessionToolCallEndEventSchema;
exports.sessionToolCallStartEventSchema = sessionToolCallStartEventSchema;
exports.sessionTurnEndEventSchema = sessionTurnEndEventSchema;
exports.sessionTurnEndStatusSchema = sessionTurnEndStatusSchema;
exports.sessionTurnStartEventSchema = sessionTurnStartEventSchema;
exports.skillBodyEntry = skillBodyEntry;
exports.systemReminderEntry = systemReminderEntry;
