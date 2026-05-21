import fs from 'node:fs/promises';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SnapshotReader } from '../snapshot-reader.js';
import { listTasks } from '../tools/read-only.js';

import type { ServerContext } from '../context.js';
import { makeContext, setupTempRoot, snapshotWithTasks, writeOverviewData, writeSnapshot } from './helpers.js';

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

describe('overview.list_tasks', () => {
  it('filters tasks and returns fallback plaintext titles; missing snapshot errors', async () => {
    const context = await createContext();
    await writeSnapshot(context.config.outputs.snapshot, snapshotWithTasks());
    await writeOverviewData(context.config.dataFile, { workstream: { 'TASK-1': 'core', 'TASK-2': 'docs' } });

    await expect(
      listTasks(context, { filter: { stage: 'implementing', scope: 'app', workstream: 'core', hasOpenFindings: true } }),
    ).resolves.toEqual({
      ok: true,
      data: [
        {
          taskId: 'TASK-1',
          title: 'Alpha & beta',
          stage: 'implementing',
          jobSlug: 'job-alpha',
          lastUpdatedAt: '2026-05-20T01:00:00.000Z',
        },
      ],
    });

    const missingContext = await createContext('missing');
    await expect(listTasks(missingContext, {})).resolves.toEqual({ ok: false, error: 'missing snapshot' });
  });
});
