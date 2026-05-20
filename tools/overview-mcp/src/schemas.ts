import { z } from 'zod/v3';

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

export const listRecommendationsInputSchema = {
  limit: z.number().int().min(0).max(100).optional(),
  stageFilter: ralphStageSchema.optional(),
};

export const listBlockersInputSchema = {};

export const addJournalEntryInputSchema = {
  taskId: z.string().min(1),
  note: z.string(),
  ts: z.string().optional(),
};

export const listTasksSchema = z.object(listTasksInputSchema);
export const getTaskSchema = z.object(getTaskInputSchema);
export const nextCommandSchema = z.object(nextCommandInputSchema);
export const listRecommendationsSchema = z.object(listRecommendationsInputSchema);
export const listBlockersSchema = z.object(listBlockersInputSchema);
export const addJournalEntrySchema = z.object(addJournalEntryInputSchema);

export type ListTasksInput = z.infer<typeof listTasksSchema>;
export type GetTaskInput = z.infer<typeof getTaskSchema>;
export type NextCommandInput = z.infer<typeof nextCommandSchema>;
export type ListRecommendationsInput = z.infer<typeof listRecommendationsSchema>;
export type ListBlockersInput = z.infer<typeof listBlockersSchema>;
export type AddJournalEntryInput = z.infer<typeof addJournalEntrySchema>;
