import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

import { LedgerRecordSchema } from '@slopus/happy-wire';
import { afterEach, describe, expect, it } from 'vitest';

import { appendLedgerRecord } from './writer';

const execFileAsync = promisify(execFile);
const testDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(testDir, '..', '..');
const writerUrl = pathToFileURL(resolve(testDir, 'writer.ts')).href;

let tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'happy-ledger-'));
  tempRoots.push(root);
  return root;
}

describe('happy-cli ledger writer', () => {
  afterEach(async () => {
    await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
    tempRoots = [];
  });

  it('validates records before appending JSONL', async () => {
    const root = await createTempRoot();
    const previousCwd = process.cwd();
    process.chdir(root);
    try {
      await appendLedgerRecord('run-1', 'session-1', {
        runId: 'run-1',
        sessionId: 'session-1',
        timestamp: '2026-05-10T23:30:00.000Z',
        eventType: 'done',
        scopeSummary: 'implemented ledger writer',
        testReference: 'pnpm --filter happy exec vitest run src/ledger/writer.test.ts',
        verificationUrl: 'https://example.com/verify',
        caveats: [],
      });
    } finally {
      process.chdir(previousCwd);
    }

    const jsonl = await readFile(join(root, '.ralph', 'state', 'run-1', 'session-1.jsonl'), 'utf8');
    const lines = jsonl.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(LedgerRecordSchema.parse(JSON.parse(lines[0]))).toMatchObject({ eventType: 'done' });
  });

  it('rejects invalid done records before writing', async () => {
    const root = await createTempRoot();
    const previousCwd = process.cwd();
    process.chdir(root);
    try {
      await expect(appendLedgerRecord('run-1', 'session-1', {
        runId: 'run-1',
        sessionId: 'session-1',
        timestamp: '2026-05-10T23:30:00.000Z',
        eventType: 'done',
        scopeSummary: 'missing required fields',
        verificationUrl: 'https://example.com/verify',
        caveats: [],
      } as any)).rejects.toThrow();
    } finally {
      process.chdir(previousCwd);
    }
  });

  it('writes ledger to HAPPY_PROJECT_PATH root regardless of process cwd', async () => {
    const repoRoot = await createTempRoot();
    const runId = 'run-fanout';
    const sessionId = 'session-fanout';

    const childCode = `
      const { appendLedgerRecord } = await import(process.env.WRITER_URL);
      await appendLedgerRecord(process.env.RUN_ID, process.env.SESSION_ID, {
        runId: process.env.RUN_ID,
        sessionId: process.env.SESSION_ID,
        timestamp: '2026-05-10T23:30:00.000Z',
        eventType: 'idle-reached',
        queueDepth: 0,
      });
    `;

    await execFileAsync(
      process.execPath,
      ['--import', 'tsx', '-e', childCode],
      {
        cwd: packageRoot,
        env: {
          ...process.env,
          HAPPY_PROJECT_PATH: repoRoot,
          WRITER_URL: writerUrl,
          RUN_ID: runId,
          SESSION_ID: sessionId,
        },
      },
    );

    const jsonl = await readFile(join(repoRoot, '.ralph', 'state', runId, `${sessionId}.jsonl`), 'utf8');
    expect(LedgerRecordSchema.parse(JSON.parse(jsonl.trim()))).toMatchObject({ eventType: 'idle-reached' });
  });

  it('is byte-for-byte identical to the happy-agent copy (modulo the sibling-package name in the sync comment)', () => {
    const normalize = (src: string) =>
      src.replace(
        /\/\/ This file is intentionally duplicated with the sibling in packages\/[^/]+\/src\/ledger\/writer\.ts/,
        '// This file is intentionally duplicated with the sibling in packages/<other>/src/ledger/writer.ts',
      );
    const cliWriter = readFileSync(resolve(testDir, 'writer.ts'), 'utf8');
    const agentWriter = readFileSync(resolve(testDir, '..', '..', '..', 'happy-agent', 'src', 'ledger', 'writer.ts'), 'utf8');
    expect(normalize(cliWriter)).toBe(normalize(agentWriter));
  });

  it('keeps 10 concurrent process writers parseable with all 1000 records present', async () => {
    const root = await createTempRoot();
    const runId = 'run-concurrent';
    const childCode = `
      process.chdir(process.env.LEDGER_ROOT);
      const { appendLedgerRecord } = await import(process.env.WRITER_URL);
      const runId = process.env.RUN_ID;
      const sessionId = process.env.SESSION_ID;
      for (let i = 0; i < 100; i++) {
        await appendLedgerRecord(runId, sessionId, {
          runId,
          sessionId,
          timestamp: new Date(1770000000000 + i).toISOString(),
          seqWithinSession: i,
          eventType: 'message-sent',
          direction: 'user-to-agent',
          messageId: sessionId + '-' + i,
          messagePreview: 'message ' + i
        });
      }
    `;

    await Promise.all(Array.from({ length: 10 }, (_, index) => execFileAsync(
      process.execPath,
      ['--import', 'tsx', '-e', childCode],
      {
        cwd: packageRoot,
        env: {
          ...process.env,
          LEDGER_ROOT: root,
          WRITER_URL: writerUrl,
          RUN_ID: runId,
          SESSION_ID: `session-${index}`,
        },
      },
    )));

    let recordCount = 0;
    let parseErrors = 0;
    for (let index = 0; index < 10; index++) {
      const content = await readFile(join(root, '.ralph', 'state', runId, `session-${index}.jsonl`), 'utf8');
      for (const line of content.trim().split('\n')) {
        try {
          LedgerRecordSchema.parse(JSON.parse(line));
          recordCount++;
        } catch {
          parseErrors++;
        }
      }
    }

    expect(parseErrors).toBe(0);
    expect(recordCount).toBe(1000);
  });
});

