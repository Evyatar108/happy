import fs from 'node:fs/promises';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SnapshotReader } from '../snapshot-reader.js';
import { listBlockers } from '../tools/read-only.js';

import type { ServerContext } from '../context.js';
import { makeContext, setupTempRoot, snapshotWithTasks, writeSnapshot } from './helpers.js';

let tempRoot: string;
const readerRef: { current: SnapshotReader | null } = { current: null };

function createContext(name = 'repo'): Promise<ServerContext> {
  return makeContext(tempRoot, readerRef, name);
}

beforeEach(async () => {
  tempRoot = await setupTempRoot();
  readerRef.current = null;
});

afterEach(async () => {
  await readerRef.current?.close();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('overview.list_blockers', () => {
  it('returns tasks blocked by stage, findings, or deferred questions; missing snapshot errors', async () => {
    const context = await createContext();
    await writeSnapshot(context.config.outputs.snapshot, snapshotWithTasks());

    const blockers = await listBlockers(context);
    expect(blockers).toMatchObject({
      ok: true,
      data: [{ id: 'TASK-1' }, { id: 'TASK-2' }, { id: 'TASK-3' }],
    });

    const missingContext = await createContext('missing-blockers');
    await expect(listBlockers(missingContext)).resolves.toEqual({ ok: false, error: 'missing snapshot' });
  });
});
