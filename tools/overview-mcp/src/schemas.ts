import { z } from 'zod';
import type { ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js';

export const ralphStageSchema = z.enum([
  'brainstorming',
  'brainstorm-ready',
  'planning',
  'plan-ready',
  'implementing',
  'reviewing',
  'review-fix',
  'replan-pending',
  'shipped',
  'blocked',
]);

export const listTasksInputSchema = {
  filter: z
    .object({
      stage: ralphStageSchema.optional(),
      scope: z.string().optional(),
      workstream: z.string().optional(),
      hasDeferredQuestions: z.boolean().optional(),
      hasOpenFindings: z.boolean().optional(),
    })
    .optional(),
};

export const getTaskInputSchema = {
  taskId: z.string().min(1),
};

export const nextCommandInputSchema = {
  taskId: z.string().min(1),
};

export const invokeNextInputSchema = {
  taskId: z.string().min(1),
  viaCrewMember: z
    .object({
      crewName: z.string().min(1),
      memberName: z.string().min(1).optional(),
    })
    .optional(),
};

export const listRecommendationsInputSchema = {
  limit: z.number().int().min(0).max(100).optional(),
  stageFilter: ralphStageSchema.optional(),
};

export const listBlockersInputSchema = {};

export const listCrewSessionsInputSchema = {
  taskId: z.string().min(1).optional(),
};

export const getTranscriptInputSchema = {
  sessionId: z.string().min(1),
  lastN: z.number().int().min(0).max(100).optional(),
  includeToolEvents: z.boolean().optional(),
};

export const addJournalEntryInputSchema = {
  taskId: z.string().min(1),
  note: z.string(),
};

export const setOverrideInputSchema = {
  slug: z.string().min(1),
  taskId: z.string().min(1),
};

export const devServerStartInputSchema = {};
export const devServerStopInputSchema = {};
export const devServerStatusInputSchema = {};
export const devServerLogsInputSchema = {
  tail: z.number().int().optional(),
  stream: z.enum(['stdout', 'stderr', 'both']).optional(),
};

export const listTasksSchema = z.object(listTasksInputSchema);
export const getTaskSchema = z.object(getTaskInputSchema);
export const nextCommandSchema = z.object(nextCommandInputSchema);
export const invokeNextSchema = z.object(invokeNextInputSchema);
export const listRecommendationsSchema = z.object(listRecommendationsInputSchema);
export const listBlockersSchema = z.object(listBlockersInputSchema);
export const listCrewSessionsSchema = z.object(listCrewSessionsInputSchema);
export const getTranscriptSchema = z.object(getTranscriptInputSchema);
export const addJournalEntrySchema = z.object(addJournalEntryInputSchema);
export const setOverrideSchema = z.object(setOverrideInputSchema);
export const devServerStartSchema = z.object(devServerStartInputSchema);
export const devServerStopSchema = z.object(devServerStopInputSchema);
export const devServerStatusSchema = z.object(devServerStatusInputSchema);
export const devServerLogsSchema = z.object(devServerLogsInputSchema);

export type ListTasksInput = z.infer<typeof listTasksSchema>;
export type GetTaskInput = z.infer<typeof getTaskSchema>;
export type NextCommandInput = z.infer<typeof nextCommandSchema>;
export type InvokeNextInput = z.infer<typeof invokeNextSchema>;
export type ListRecommendationsInput = z.infer<typeof listRecommendationsSchema>;
export type ListBlockersInput = z.infer<typeof listBlockersSchema>;
export type ListCrewSessionsInput = z.infer<typeof listCrewSessionsSchema>;
export type GetTranscriptInput = z.infer<typeof getTranscriptSchema>;
export type AddJournalEntryInput = z.infer<typeof addJournalEntrySchema>;
export type SetOverrideInput = z.infer<typeof setOverrideSchema>;
export type DevServerStartInput = z.infer<typeof devServerStartSchema>;
export type DevServerStopInput = z.infer<typeof devServerStopSchema>;
export type DevServerStatusInput = z.infer<typeof devServerStatusSchema>;
export type DevServerLogsInput = z.infer<typeof devServerLogsSchema>;

// Cast plain zod v4 shape objects to the SDK's ZodRawShapeCompat union type.
export function asSdkInputSchema(schema: object): ZodRawShapeCompat {
  return schema as unknown as ZodRawShapeCompat;
}
