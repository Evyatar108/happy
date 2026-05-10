import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { appendLedgerRecord } from './writer';

let tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'happy-agent-ledger-'));
  tempRoots.push(root);
  return root;
}

describe('happy-agent ledger writer', () => {
  afterEach(async () => {
    await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
    tempRoots = [];
  });

  it('appends validated ledger records to the run/session JSONL file', async () => {
    const root = await createTempRoot();
    const previousCwd = process.cwd();
    process.chdir(root);
    try {
      await appendLedgerRecord('run-1', 'session-1', {
        runId: 'run-1',
        sessionId: 'session-1',
        timestamp: '2026-05-10T23:30:00.000Z',
        eventType: 'validation-attached',
        testReference: 'pnpm --filter happy-agent exec vitest run src/ledger/writer.test.ts',
        verificationUrl: 'https://example.com/verify',
      });
    } finally {
      process.chdir(previousCwd);
    }

    const jsonl = await readFile(join(root, '.ralph', 'state', 'run-1', 'session-1.jsonl'), 'utf8');
    expect(JSON.parse(jsonl).eventType).toBe('validation-attached');
  });

  it('returns schema errors to the caller', async () => {
    const root = await createTempRoot();
    const previousCwd = process.cwd();
    process.chdir(root);
    try {
      await expect(appendLedgerRecord('run-1', 'session-1', {
        runId: 'run-1',
        sessionId: 'session-1',
        timestamp: '2026-05-10T23:30:00.000Z',
        eventType: 'done',
        scopeSummary: 'missing verification URL',
        testReference: 'pnpm test',
        caveats: [],
      } as any)).rejects.toThrow();
    } finally {
      process.chdir(previousCwd);
    }
  });
});

