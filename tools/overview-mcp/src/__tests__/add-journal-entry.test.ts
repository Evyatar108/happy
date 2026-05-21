import fs from 'node:fs/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SnapshotReader } from '../snapshot-reader.js';
import { addJournalEntry } from '../tools/add-journal-entry.js';

import type { ServerContext } from '../context.js';
import { makeContext, readJournal, setupTempRoot } from './helpers.js';

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

describe('overview.add_journal_entry', () => {
  it('appends a note with a server-derived timestamp and rejects unsafe task ids', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-20T02:00:00.000Z'));
    try {
      const context = await createContext();

      expect(addJournalEntry(context, { taskId: 'TASK-1', note: 'hello\nworld' })).toEqual({
        ok: true,
        data: { taskId: 'TASK-1', ts: '2026-05-20T02:00:00.000Z' },
      });
      expect(await readJournal(context.repoRoot, 'TASK-1')).toBe('- 2026-05-20T02:00:00.000Z  note: hello\n  world\n');

      expect(addJournalEntry(context, { taskId: '../TASK-1', note: 'bad' })).toEqual({
        ok: false,
        error: 'invalid taskId: ../TASK-1',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('defaults ts to the current ISO timestamp', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-20T03:04:05.006Z'));
    try {
      const context = await createContext();

      expect(addJournalEntry(context, { taskId: 'TASK-2', note: 'default timestamp' })).toEqual({
        ok: true,
        data: { taskId: 'TASK-2', ts: '2026-05-20T03:04:05.006Z' },
      });
      expect(await readJournal(context.repoRoot, 'TASK-2')).toBe(
        '- 2026-05-20T03:04:05.006Z  note: default timestamp\n',
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
