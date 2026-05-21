import fs from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SnapshotReader } from '../snapshot-reader.js';
import { getTask } from '../tools/read-only.js';

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

describe('overview.get_task', () => {
  it('returns a known task with the last three journal lines; unknown task errors', async () => {
    const context = await createContext();
    await writeSnapshot(context.config.outputs.snapshot, snapshotWithTasks());
    await fs.mkdir(path.join(context.repoRoot, 'tasks', 'TASK-1'), { recursive: true });
    await fs.writeFile(
      path.join(context.repoRoot, 'tasks', 'TASK-1', 'journal.md'),
      ['- one', '- two', '- three', '- four', ''].join('\n'),
      'utf8',
    );

    const found = await getTask(context, { taskId: 'task-1' });
    expect(found).toMatchObject({
      ok: true,
      data: { id: 'TASK-1', recentJournal: ['- two', '- three', '- four'] },
    });

    await expect(getTask(context, { taskId: '../TASK-1' })).resolves.toEqual({ ok: false, error: 'invalid taskId: ../TASK-1' });
  });
});
