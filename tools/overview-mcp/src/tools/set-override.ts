import fs from 'node:fs/promises';

import { assertSafeTaskId } from '../../../../scripts/lib/append-journal.mjs';
import { atomicWriteFile } from '../../../../scripts/lib/atomic-write.mjs';

import type { ServerContext } from '../context.js';
import type { SetOverrideInput } from '../schemas.js';
import { editOverrides, parseOverviewDataAssignment } from '../utils/set-override-edit.js';

export async function setOverride(context: ServerContext, input: SetOverrideInput): Promise<SetOverrideResult> {
  try {
    assertSafeTaskId(input.taskId);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  let source: string;
  try {
    source = await fs.readFile(context.config.dataFile, 'utf8');
  } catch (error) {
    return { ok: false, error: `failed to read overview data: ${error instanceof Error ? error.message : String(error)}` };
  }

  const edited = editOverrides({ source, slug: input.slug, taskId: input.taskId });
  if (!edited.ok) {
    return { ok: false, error: edited.error };
  }

  const validation = parseOverviewDataAssignment(edited.source);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  if (edited.source !== source) {
    await atomicWriteFile(context.config.dataFile, edited.source);
  }

  return { ok: true, data: { slug: input.slug, taskId: input.taskId } };
}

type SetOverrideResult =
  | { ok: true; data: { slug: string; taskId: string } }
  | { ok: false; error: string };
