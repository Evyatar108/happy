import fs from 'node:fs/promises';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createServer } from '../server.js';
import { SnapshotReader } from '../snapshot-reader.js';

import type { ServerContext } from '../context.js';
import { makeContext, setupTempRoot } from './helpers.js';

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

describe('read-only tool registration', () => {
  it('registers read-only and operational tools', async () => {
    const context = await createContext();
    const server = createServer(context) as unknown as { _registeredTools: Record<string, unknown> };

    expect(Object.keys(server._registeredTools).sort()).toEqual([
      'overview.add_journal_entry',
      'overview.build',
      'overview.dev_server.logs',
      'overview.dev_server.start',
      'overview.dev_server.status',
      'overview.dev_server.stop',
      'overview.get_task',
      'overview.get_transcript',
      'overview.invoke_next',
      'overview.list_blockers',
      'overview.list_crew_sessions',
      'overview.list_recommendations',
      'overview.list_tasks',
      'overview.next_command',
      'overview.set_override',
      'overview.sync.now',
      'overview.sync.watch_status',
    ]);
  });
});
