import * as z from 'zod';
import { isCuid, createId } from '@paralleldrive/cuid2';

const sessionRoleSchema = z.union([z.literal("user"), z.literal("agent")]);
const sessionTextEventSchema = z.object({
  t: z.literal("text"),
  text: z.string(),
  thinking: z.boolean().optional()
});
const sessionServiceMessageEventSchema = z.object({
  t: z.literal("service"),
  text: z.string()
});
const sessionToolCallStartEventSchema = z.object({
  t: z.literal("tool-call-start"),
  call: z.string(),
  name: z.string(),
  title: z.string(),
  description: z.string(),
  args: z.record(z.string(), z.unknown()),
  permissionRequestId: z.string().optional()
});
const sessionToolCallEndEventSchema = z.object({
  t: z.literal("tool-call-end"),
  call: z.string()
});
const sessionFileEventSchema = z.object({
  t: z.literal("file"),
  ref: z.string(),
  name: z.string(),
  size: z.number(),
  mimeType: z.string().optional(),
  image: z.object({
    width: z.number(),
    height: z.number(),
    thumbhash: z.string()
  }).optional()
});
const sessionTurnStartEventSchema = z.object({
  t: z.literal("turn-start")
});
const sessionStartEventSchema = z.object({
  t: z.literal("start"),
  title: z.string().optional()
});
const sessionTurnEndStatusSchema = z.enum(["completed", "failed", "cancelled"]);
const sessionTurnEndEventSchema = z.object({
  t: z.literal("turn-end"),
  status: sessionTurnEndStatusSchema
});
const sessionStopEventSchema = z.object({
  t: z.literal("stop")
});
const sessionContextBoundaryKindSchema = z.enum([
  "clear",
  "compact",
  "autocompact",
  "plan-mode-enter",
  "plan-mode-exit",
  "session-fork-resume"
]);
const sessionContextBoundaryTriggeredBySchema = z.enum(["user", "agent", "system"]);
const sessionContextBoundaryEventSchema = z.object({
  t: z.literal("context-boundary"),
  kind: sessionContextBoundaryKindSchema,
  at: z.number(),
  /**
   * Boundary source mapping: 'user' for explicit user commands such as /clear,
   * 'agent' for model/agent-initiated lifecycle transitions, and 'system' for
   * Happy runtime or synchronization events.
   */
  triggeredBy: sessionContextBoundaryTriggeredBySchema,
  summaryRef: z.string().optional(),
  forkedFromSid: z.string().optional()
});
const sessionAgentConfigurationChangedEventSchema = z.object({
  t: z.literal("agent-configuration-changed"),
  permissionMode: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  thinkingLevel: z.string().nullable().optional(),
  sandbox: z.string().nullable().optional()
});
const sessionMessageConsumptionEventSchema = z.object({
  t: z.literal("message-consumption"),
  messageId: z.string(),
  consumedAt: z.number(),
  agentFlavor: z.enum(["claude", "codex"])
});
const sessionEventSchema = z.discriminatedUnion("t", [
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
const sessionEnvelopeSchema = z.object({
  id: z.string(),
  time: z.number(),
  role: sessionRoleSchema,
  turn: z.string().optional(),
  subagent: z.string().refine((value) => isCuid(value), {
    message: "subagent must be a cuid2 value"
  }).optional(),
  ev: sessionEventSchema
}).superRefine((envelope, ctx) => {
  if (envelope.ev.t === "service" && envelope.role !== "agent") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'service events must use role "agent"',
      path: ["role"]
    });
  }
  if ((envelope.ev.t === "start" || envelope.ev.t === "stop") && envelope.role !== "agent") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${envelope.ev.t} events must use role "agent"`,
      path: ["role"]
    });
  }
});
function createEnvelope(role, ev, opts = {}) {
  return sessionEnvelopeSchema.parse({
    id: opts.id ?? createId(),
    time: opts.time ?? Date.now(),
    role,
    ...opts.turn ? { turn: opts.turn } : {},
    ...opts.subagent ? { subagent: opts.subagent } : {},
    ev
  });
}

const MessageMetaSchema = z.object({
  sentFrom: z.string().optional(),
  permissionMode: z.enum(["default", "acceptEdits", "bypassPermissions", "plan", "read-only", "safe-yolo", "yolo"]).optional(),
  model: z.string().nullable().optional(),
  thinkingLevel: z.string().nullable().optional(),
  fallbackModel: z.string().nullable().optional(),
  customSystemPrompt: z.string().nullable().optional(),
  appendSystemPrompt: z.string().nullable().optional(),
  allowedTools: z.array(z.string()).nullable().optional(),
  disallowedTools: z.array(z.string()).nullable().optional(),
  displayText: z.string().optional(),
  attachmentRefs: z.array(z.object({
    remotePath: z.string(),
    name: z.string(),
    size: z.number()
  })).optional(),
  contextBoundaryFallback: z.boolean().optional()
});

const UserMessageAttachmentSchema = z.object({
  type: z.literal("image"),
  ref: z.string(),
  mimeType: z.string().optional()
});
const UserMessageSchema = z.object({
  role: z.literal("user"),
  content: z.object({
    type: z.literal("text"),
    text: z.string(),
    attachments: z.array(UserMessageAttachmentSchema).optional()
  }),
  localKey: z.string().optional(),
  meta: MessageMetaSchema.optional()
});
const AgentMessageSchema = z.object({
  role: z.literal("agent"),
  content: z.object({
    type: z.string()
  }).passthrough(),
  meta: MessageMetaSchema.optional()
});
const LegacyMessageContentSchema = z.discriminatedUnion("role", [UserMessageSchema, AgentMessageSchema]);

const SessionMessageContentSchema = z.object({
  c: z.string(),
  t: z.literal("encrypted")
});
const SessionMessageSchema = z.object({
  id: z.string(),
  seq: z.number(),
  localId: z.string().nullish(),
  content: SessionMessageContentSchema,
  createdAt: z.number(),
  updatedAt: z.number()
});
const SessionMessageRangeRequestSchema = z.object({
  requestId: z.string(),
  sessionId: z.string(),
  fromSeq: z.number().int().min(0),
  toSeq: z.number().int(),
  limit: z.number().int().min(1).max(200)
}).refine((request) => request.toSeq >= request.fromSeq, {
  path: ["toSeq"],
  message: "toSeq must be greater than or equal to fromSeq"
});
const SessionMessageRangeResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    requestId: z.string(),
    sessionId: z.string(),
    fromSeq: z.number().int(),
    toSeq: z.number().int(),
    messages: z.array(SessionMessageSchema),
    hasMore: z.boolean()
  }),
  z.object({
    ok: z.literal(false),
    requestId: z.string(),
    error: z.object({
      code: z.enum(["session_not_found", "invalid_range", "rate_limited", "internal"]),
      message: z.string()
    })
  })
]);
const SessionProtocolMessageSchema = z.object({
  role: z.literal("session"),
  content: sessionEnvelopeSchema,
  meta: MessageMetaSchema.optional()
});
const MessageContentSchema = z.discriminatedUnion("role", [
  UserMessageSchema,
  AgentMessageSchema,
  SessionProtocolMessageSchema
]);
const VersionedEncryptedValueSchema = z.object({
  version: z.number(),
  value: z.string()
});
const VersionedNullableEncryptedValueSchema = z.object({
  version: z.number(),
  value: z.string().nullable()
});
const UpdateNewMessageBodySchema = z.object({
  t: z.literal("new-message"),
  sid: z.string(),
  message: SessionMessageSchema
});
const UpdateSessionBodySchema = z.object({
  t: z.literal("update-session"),
  id: z.string(),
  metadata: VersionedEncryptedValueSchema.nullish(),
  agentState: VersionedNullableEncryptedValueSchema.nullish()
});
const VersionedMachineEncryptedValueSchema = z.object({
  version: z.number(),
  value: z.string()
});
const UpdateMachineBodySchema = z.object({
  t: z.literal("update-machine"),
  machineId: z.string(),
  metadata: VersionedMachineEncryptedValueSchema.nullish(),
  daemonState: VersionedMachineEncryptedValueSchema.nullish(),
  active: z.boolean().optional(),
  activeAt: z.number().optional()
});
const CoreUpdateBodySchema = z.discriminatedUnion("t", [
  UpdateNewMessageBodySchema,
  UpdateSessionBodySchema,
  UpdateMachineBodySchema
]);
const CoreUpdateContainerSchema = z.object({
  id: z.string(),
  seq: z.number(),
  body: CoreUpdateBodySchema,
  createdAt: z.number()
});
const ApiMessageSchema = SessionMessageSchema;
const ApiUpdateNewMessageSchema = UpdateNewMessageBodySchema;
const ApiUpdateSessionStateSchema = UpdateSessionBodySchema;
const ApiUpdateMachineStateSchema = UpdateMachineBodySchema;
const UpdateBodySchema = UpdateNewMessageBodySchema;
const UpdateSchema = CoreUpdateContainerSchema;

const TofuPublicKeysSchema = z.object({
  ed25519PublicKey: z.string().min(1),
  x25519PublicKey: z.string().min(1),
  ed25519Fingerprint: z.string().min(1).optional()
});
const TofuPubkeysEventSchema = z.object({
  t: z.literal("tofu-pubkeys"),
  keys: TofuPublicKeysSchema
});
const TofuSessionKeyExchangeSchema = z.object({
  t: z.literal("tofu-session-key"),
  machineId: z.string().min(1),
  mobileX25519PublicKey: z.string().min(1),
  serverX25519PublicKey: z.string().min(1),
  sessionKey: z.string().min(1),
  firstSeenAt: z.number()
});
const TofuHandshakeMessageSchema = z.discriminatedUnion("t", [
  TofuPubkeysEventSchema,
  TofuSessionKeyExchangeSchema
]);

const VoiceConversationGrantedSchema = z.object({
  allowed: z.literal(true),
  conversationToken: z.string(),
  conversationId: z.string(),
  agentId: z.string(),
  elevenUserId: z.string(),
  usedSeconds: z.number(),
  limitSeconds: z.number()
});
const VoiceConversationDeniedSchema = z.object({
  allowed: z.literal(false),
  reason: z.enum(["voice_hard_limit_reached", "subscription_required", "voice_conversation_limit_reached"]),
  usedSeconds: z.number(),
  limitSeconds: z.number(),
  agentId: z.string()
});
const VoiceConversationResponseSchema = z.discriminatedUnion("allowed", [
  VoiceConversationGrantedSchema,
  VoiceConversationDeniedSchema
]);
const VoiceUsageResponseSchema = z.object({
  usedSeconds: z.number(),
  limitSeconds: z.number(),
  conversationCount: z.number(),
  conversationLimit: z.number(),
  elevenUserId: z.string()
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

const payloadSchema = z.record(z.unknown()).optional();
const safePathComponent = z.string().regex(/^[A-Za-z0-9_-]+$/);
const baseLedgerRecordSchema = z.object({
  runId: safePathComponent,
  sessionId: safePathComponent,
  timestamp: z.string().datetime(),
  seqWithinSession: z.number().int().nonnegative().optional()
});
const LedgerErrorCodeSchema = z.enum([
  "spawn-failed",
  "wrong-account",
  "timeout",
  "crash",
  "ledger-write-failed",
  "monitor-failure"
]);
const SpawnLedgerRecordSchema = baseLedgerRecordSchema.extend({
  eventType: z.literal("spawn"),
  agent: z.string().min(1),
  projectPath: z.string().min(1),
  worktreePath: z.string().min(1),
  branchName: z.string().min(1).optional(),
  payload: payloadSchema
});
const MessageSentLedgerRecordSchema = baseLedgerRecordSchema.extend({
  eventType: z.literal("message-sent"),
  direction: z.enum(["user-to-agent", "agent-to-server"]),
  messageId: z.string().min(1).optional(),
  messagePreview: z.string().optional(),
  payload: payloadSchema
});
const IdleReachedLedgerRecordSchema = baseLedgerRecordSchema.extend({
  eventType: z.literal("idle-reached"),
  queueDepth: z.number().int().nonnegative(),
  payload: payloadSchema
});
const PendingPermissionLedgerRecordSchema = baseLedgerRecordSchema.extend({
  eventType: z.literal("pending-permission"),
  requestIds: z.array(z.string().min(1)),
  payload: payloadSchema
});
const LastOutputSummaryLedgerRecordSchema = baseLedgerRecordSchema.extend({
  eventType: z.literal("last-output-summary"),
  summary: z.string(),
  heuristic: z.enum(["assistant-text", "tool-result", "server-summary"]),
  payload: payloadSchema
});
const ValidationAttachedLedgerRecordSchema = baseLedgerRecordSchema.extend({
  eventType: z.literal("validation-attached"),
  testReference: z.string().min(1),
  verificationUrl: z.string().url(),
  payload: payloadSchema
});
const DoneLedgerRecordSchema = baseLedgerRecordSchema.extend({
  eventType: z.literal("done"),
  scopeSummary: z.string().min(1),
  testReference: z.string().min(1),
  verificationUrl: z.string().url(),
  caveats: z.array(z.string()),
  payload: payloadSchema
});
const ErrorLedgerRecordSchema = baseLedgerRecordSchema.extend({
  eventType: z.literal("error"),
  errorCode: LedgerErrorCodeSchema,
  errorMessage: z.string().min(1),
  payload: payloadSchema
});
const LedgerRecordSchema = z.discriminatedUnion("eventType", [
  SpawnLedgerRecordSchema,
  MessageSentLedgerRecordSchema,
  IdleReachedLedgerRecordSchema,
  PendingPermissionLedgerRecordSchema,
  LastOutputSummaryLedgerRecordSchema,
  ValidationAttachedLedgerRecordSchema,
  DoneLedgerRecordSchema,
  ErrorLedgerRecordSchema
]);

const MachineTunnelSchema = z.object({
  machineId: z.string(),
  tunnelId: z.string(),
  url: z.string(),
  tags: z.array(z.string()),
  lastSeenAt: z.union([z.number(), z.string().datetime()]),
  owner: z.string()
});

export { AgentMessageSchema, ApiMessageSchema, ApiUpdateMachineStateSchema, ApiUpdateNewMessageSchema, ApiUpdateSessionStateSchema, CoreUpdateBodySchema, CoreUpdateContainerSchema, DoneLedgerRecordSchema, ErrorLedgerRecordSchema, IdleReachedLedgerRecordSchema, LastOutputSummaryLedgerRecordSchema, LedgerErrorCodeSchema, LedgerRecordSchema, LegacyMessageContentSchema, MachineTunnelSchema, MessageContentSchema, MessageMetaSchema, MessageSentLedgerRecordSchema, PendingPermissionLedgerRecordSchema, SessionMessageContentSchema, SessionMessageRangeRequestSchema, SessionMessageRangeResponseSchema, SessionMessageSchema, SessionProtocolMessageSchema, SpawnLedgerRecordSchema, TofuHandshakeMessageSchema, TofuPubkeysEventSchema, TofuPublicKeysSchema, TofuSessionKeyExchangeSchema, UpdateBodySchema, UpdateMachineBodySchema, UpdateNewMessageBodySchema, UpdateSchema, UpdateSessionBodySchema, UserMessageSchema, ValidationAttachedLedgerRecordSchema, VersionedEncryptedValueSchema, VersionedMachineEncryptedValueSchema, VersionedNullableEncryptedValueSchema, VoiceConversationDeniedSchema, VoiceConversationGrantedSchema, VoiceConversationResponseSchema, VoiceUsageResponseSchema, createEnvelope, findSenderDropEntry, forkBoilerplateEntry, localCommandCaveatEntry, makeWrappedTagEntry, nonRenderableEntries, sessionAgentConfigurationChangedEventSchema, sessionContextBoundaryEventSchema, sessionContextBoundaryKindSchema, sessionContextBoundaryTriggeredBySchema, sessionEnvelopeSchema, sessionEventSchema, sessionFileEventSchema, sessionMessageConsumptionEventSchema, sessionRoleSchema, sessionServiceMessageEventSchema, sessionStartEventSchema, sessionStopEventSchema, sessionTextEventSchema, sessionToolCallEndEventSchema, sessionToolCallStartEventSchema, sessionTurnEndEventSchema, sessionTurnEndStatusSchema, sessionTurnStartEventSchema, skillBodyEntry, systemReminderEntry };
