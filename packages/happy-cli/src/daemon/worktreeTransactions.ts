import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { configuration } from '@/configuration';

export type WorktreeTransactionState = 'pending' | 'worktreeCreated' | 'processSpawned' | 'sessionRegistered';

export interface WorktreeTransactionRecord {
  txId: string;
  state: WorktreeTransactionState;
  worktreePath: string;
  branchName: string;
  repoPath: string;
  machineId: string;
  runId: string;
  pid?: number;
  sessionId?: string;
  createdAt: string;
  updatedAt: string;
}

export function pendingWorktreeDir(daemonHome = configuration.happyHomeDir): string {
  return join(daemonHome, 'pending-worktrees');
}

export function worktreeTransactionPath(daemonHome: string, txId: string): string {
  return join(pendingWorktreeDir(daemonHome), `${txId}.json`);
}

async function writeRecord(daemonHome: string, record: WorktreeTransactionRecord): Promise<void> {
  const dir = pendingWorktreeDir(daemonHome);
  await mkdir(dir, { recursive: true });
  const target = worktreeTransactionPath(daemonHome, record.txId);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  await rename(tmp, target);
}

export async function createWorktreeTransaction(
  daemonHome: string,
  input: Omit<WorktreeTransactionRecord, 'state' | 'createdAt' | 'updatedAt'>,
): Promise<WorktreeTransactionRecord> {
  const now = new Date().toISOString();
  const record: WorktreeTransactionRecord = {
    ...input,
    state: 'pending',
    createdAt: now,
    updatedAt: now,
  };
  await writeRecord(daemonHome, record);
  return record;
}

export async function updateWorktreeTransaction(
  daemonHome: string,
  record: WorktreeTransactionRecord,
  patch: Partial<Omit<WorktreeTransactionRecord, 'txId' | 'createdAt'>>,
): Promise<WorktreeTransactionRecord> {
  const updated: WorktreeTransactionRecord = {
    ...record,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await writeRecord(daemonHome, updated);
  return updated;
}

export async function readWorktreeTransaction(daemonHome: string, txId: string): Promise<WorktreeTransactionRecord> {
  return JSON.parse(await readFile(worktreeTransactionPath(daemonHome, txId), 'utf8')) as WorktreeTransactionRecord;
}

export async function readPendingWorktreeTransactions(daemonHome = configuration.happyHomeDir): Promise<WorktreeTransactionRecord[]> {
  const dir = pendingWorktreeDir(daemonHome);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const records: WorktreeTransactionRecord[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    records.push(JSON.parse(await readFile(join(dir, entry), 'utf8')) as WorktreeTransactionRecord);
  }
  return records;
}
