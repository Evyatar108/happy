import { appendJournalNote, assertSafeTaskId } from '../../../../scripts/lib/append-journal.mjs';

import type { ServerContext } from '../context.js';
import type { AddJournalEntryInput } from '../schemas.js';
import type { ToolEnvelope } from './read-only.js';

export interface AddJournalEntryResult {
  taskId: string;
  ts: string;
}

export function addJournalEntry(
  context: ServerContext,
  input: AddJournalEntryInput,
): ToolEnvelope<AddJournalEntryResult> {
  try {
    assertSafeTaskId(input.taskId);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'invalid taskId' };
  }

  const ts = input.ts ?? new Date().toISOString();
  appendJournalNote({ repoRoot: context.repoRoot, taskId: input.taskId, ts, note: input.note });
  return { ok: true, data: { taskId: input.taskId, ts } };
}
