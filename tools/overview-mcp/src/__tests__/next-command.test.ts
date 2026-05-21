import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SnapshotReader } from '../snapshot-reader.js';
import { nextCommand } from '../tools/read-only.js';

import type { ServerContext } from '../context.js';
import { makeContext, repoRoot, setupTempRoot, snapshotWithTasks, writeSnapshot } from './helpers.js';

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

describe('overview.next_command', () => {
  it('matches derive-next-command-cli output; unknown task errors', async () => {
    const context = await createContext();
    await writeSnapshot(context.config.outputs.snapshot, snapshotWithTasks());

    const fromTool = await nextCommand(context, { taskId: 'TASK-1' });
    const fromCli = JSON.parse(
      execFileSync('node', ['scripts/lib/derive-next-command-cli.mjs', '--task', 'TASK-1', '--snapshot', context.config.outputs.snapshot], {
        cwd: repoRoot,
        encoding: 'utf8',
      }),
    );

    expect(fromTool).toEqual({ ok: true, data: fromCli });
    await expect(nextCommand(context, { taskId: 'NOPE' })).resolves.toEqual({ ok: false, error: 'unknown task' });
  });
});
