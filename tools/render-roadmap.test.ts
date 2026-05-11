import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { readLedgerRecords, renderRunMarkdown } from './render-roadmap';

const base = {
  runId: 'run-abc123',
  sessionId: 'session-abc123',
  timestamp: '2026-05-10T12:00:00.000Z',
};

const validSpawnLine = JSON.stringify({
  ...base,
  eventType: 'spawn',
  agent: 'codex',
  projectPath: '/repo',
  worktreePath: '/repo/.dev/worktree/run-abc123',
});

const validErrorLine = JSON.stringify({
  ...base,
  eventType: 'error',
  errorCode: 'spawn-failed',
  errorMessage: 'git worktree add failed',
});

const malformedLine = '{this is not valid json';

const schemaMalformedLine = JSON.stringify({
  ...base,
  eventType: 'done',
});

describe('readLedgerRecords', () => {
  it('continues past malformed lines and synthesizes error rows', async () => {
    const rootDir = join(tmpdir(), `render-roadmap-test-${Date.now()}`);
    const runId = 'run-abc123';
    const ledgerDir = join(rootDir, '.ralph', 'state', runId);
    await mkdir(ledgerDir, { recursive: true });

    const validLines = [validSpawnLine, validErrorLine];
    const content = [...validLines, malformedLine].join('\n');
    await writeFile(join(ledgerDir, 'session-abc123.jsonl'), content, 'utf8');

    try {
      const records = await readLedgerRecords(rootDir, runId);

      expect(records).toHaveLength(validLines.length + 1);

      const errorRecord = records.find(
        (r) => r.eventType === 'error' && r.errorMessage.includes('malformed record'),
      );
      expect(errorRecord).toBeDefined();
      expect(errorRecord?.errorCode).toBe('ledger-write-failed');

      const rendered = renderRunMarkdown(runId, records);
      const tableRows = rendered
        .split('\n')
        .filter((line) => line.startsWith('|') && !line.startsWith('|---'));
      const dataRows = tableRows.slice(1);
      expect(dataRows).toHaveLength(validLines.length + 1);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it('continues past schema-invalid lines and synthesizes error rows', async () => {
    const rootDir = join(tmpdir(), `render-roadmap-test-schema-${Date.now()}`);
    const runId = 'run-abc123';
    const ledgerDir = join(rootDir, '.ralph', 'state', runId);
    await mkdir(ledgerDir, { recursive: true });

    const validLines = [validSpawnLine];
    const content = [...validLines, schemaMalformedLine].join('\n');
    await writeFile(join(ledgerDir, 'session-abc123.jsonl'), content, 'utf8');

    try {
      const records = await readLedgerRecords(rootDir, runId);

      expect(records).toHaveLength(validLines.length + 1);

      const errorRecord = records.find(
        (r) => r.eventType === 'error' && r.errorMessage.includes('malformed record'),
      );
      expect(errorRecord).toBeDefined();
      expect(errorRecord?.errorCode).toBe('ledger-write-failed');
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
