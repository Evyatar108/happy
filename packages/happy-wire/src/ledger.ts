import * as z from 'zod';

const payloadSchema = z.record(z.unknown()).optional();

const safePathComponent = z.string().regex(/^[A-Za-z0-9_-]+$/);

const baseLedgerRecordSchema = z.object({
  runId: safePathComponent,
  sessionId: safePathComponent,
  timestamp: z.string().datetime(),
  seqWithinSession: z.number().int().nonnegative().optional(),
});

export const LedgerErrorCodeSchema = z.enum([
  'spawn-failed',
  'wrong-account',
  'timeout',
  'crash',
  'ledger-write-failed',
  'monitor-failure',
]);
export type LedgerErrorCode = z.infer<typeof LedgerErrorCodeSchema>;

export const SpawnLedgerRecordSchema = baseLedgerRecordSchema.extend({
  eventType: z.literal('spawn'),
  agent: z.string().min(1),
  projectPath: z.string().min(1),
  worktreePath: z.string().min(1),
  branchName: z.string().min(1).optional(),
  payload: payloadSchema,
});

export const MessageSentLedgerRecordSchema = baseLedgerRecordSchema.extend({
  eventType: z.literal('message-sent'),
  direction: z.enum(['user-to-agent', 'agent-to-server']),
  messageId: z.string().min(1).optional(),
  messagePreview: z.string().optional(),
  payload: payloadSchema,
});

export const IdleReachedLedgerRecordSchema = baseLedgerRecordSchema.extend({
  eventType: z.literal('idle-reached'),
  queueDepth: z.number().int().nonnegative(),
  payload: payloadSchema,
});

export const PendingPermissionLedgerRecordSchema = baseLedgerRecordSchema.extend({
  eventType: z.literal('pending-permission'),
  requestIds: z.array(z.string().min(1)),
  payload: payloadSchema,
});

export const LastOutputSummaryLedgerRecordSchema = baseLedgerRecordSchema.extend({
  eventType: z.literal('last-output-summary'),
  summary: z.string(),
  heuristic: z.enum(['assistant-text', 'tool-result', 'server-summary']),
  payload: payloadSchema,
});

export const ValidationAttachedLedgerRecordSchema = baseLedgerRecordSchema.extend({
  eventType: z.literal('validation-attached'),
  testReference: z.string().min(1),
  verificationUrl: z.string().url(),
  payload: payloadSchema,
});

export const DoneLedgerRecordSchema = baseLedgerRecordSchema.extend({
  eventType: z.literal('done'),
  scopeSummary: z.string().min(1),
  testReference: z.string().min(1),
  verificationUrl: z.string().url(),
  caveats: z.array(z.string()),
  payload: payloadSchema,
});

export const ErrorLedgerRecordSchema = baseLedgerRecordSchema.extend({
  eventType: z.literal('error'),
  errorCode: LedgerErrorCodeSchema,
  errorMessage: z.string().min(1),
  payload: payloadSchema,
});

export const LedgerRecordSchema = z.discriminatedUnion('eventType', [
  SpawnLedgerRecordSchema,
  MessageSentLedgerRecordSchema,
  IdleReachedLedgerRecordSchema,
  PendingPermissionLedgerRecordSchema,
  LastOutputSummaryLedgerRecordSchema,
  ValidationAttachedLedgerRecordSchema,
  DoneLedgerRecordSchema,
  ErrorLedgerRecordSchema,
]);
export type LedgerRecord = z.infer<typeof LedgerRecordSchema>;

