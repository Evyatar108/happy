// This file is intentionally duplicated with the sibling in packages/happy-agent/src/ledger/writer.ts; keep them in sync.
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { LedgerRecordSchema, type LedgerRecord } from '@slopus/happy-wire';

export async function appendLedgerRecord(runId: string, sessionId: string, record: LedgerRecord): Promise<void> {
  const parsed = LedgerRecordSchema.parse(record);
  if (parsed.runId !== runId || parsed.sessionId !== sessionId) {
    throw new Error('Ledger record identity does not match target ledger path');
  }

  const ledgerDir = join(process.env.HAPPY_PROJECT_PATH ?? process.cwd(), '.ralph', 'state', runId);
  await mkdir(ledgerDir, { recursive: true });
  await appendFile(join(ledgerDir, `${sessionId}.jsonl`), `${JSON.stringify(parsed)}\n`, 'utf8');
}

