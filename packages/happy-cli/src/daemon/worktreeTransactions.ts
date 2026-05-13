import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { configuration } from '@/configuration';
import { logger } from '@/ui/logger';

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

export interface RecoverPendingDeps {
  runGit?: (cwd: string, args: string[]) => Promise<string>;
  isPidAlive?: (pid: number) => Promise<boolean>;
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

function execFileUtf8(command: string, args: string[], options: { cwd?: string } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { ...options, encoding: 'utf8', windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve(stdout);
      }
    });
  });
}

async function defaultRunGit(cwd: string, args: string[]): Promise<string> {
  return execFileUtf8('git', args, { cwd });
}

async function defaultIsPidAlive(pid: number): Promise<boolean> {
  if (process.platform === 'win32') {
    const output = await execFileUtf8('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']);
    return new RegExp(`\\b${pid}\\b`).test(output);
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

async function removeTransactionFile(daemonHome: string, txId: string): Promise<void> {
  try {
    await unlink(worktreeTransactionPath(daemonHome, txId));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

async function cleanupWorktreeRecord(
  daemonHome: string,
  record: WorktreeTransactionRecord,
  runGit: (cwd: string, args: string[]) => Promise<string>,
): Promise<void> {
  try {
    await runGit(record.repoPath, ['worktree', 'remove', '--force', record.worktreePath]);
  } catch (error) {
    logger.debug(`[DAEMON WORKTREE] Failed to recover-remove worktree ${record.worktreePath}: ${error instanceof Error ? error.message : error}`);
  }

  try {
    await runGit(record.repoPath, ['branch', '-D', record.branchName]);
  } catch (error) {
    logger.debug(`[DAEMON WORKTREE] Failed to recover-delete branch ${record.branchName}: ${error instanceof Error ? error.message : error}`);
  }

  await removeTransactionFile(daemonHome, record.txId);
}

export async function recoverPending(daemonHome = configuration.happyHomeDir, deps: RecoverPendingDeps = {}): Promise<void> {
  const runGit = deps.runGit ?? defaultRunGit;
  const isPidAlive = deps.isPidAlive ?? defaultIsPidAlive;
  const records = await readPendingWorktreeTransactions(daemonHome);

  for (const record of records) {
    if (record.state === 'sessionRegistered') {
      continue;
    }

    if (record.state === 'pending') {
      await cleanupWorktreeRecord(daemonHome, record, runGit);
      continue;
    }

    if (record.state === 'worktreeCreated') {
      await cleanupWorktreeRecord(daemonHome, record, runGit);
      continue;
    }

    if (record.state === 'processSpawned') {
      if (record.pid !== undefined && await isPidAlive(record.pid)) {
        logger.warn(`[DAEMON WORKTREE] Leaving live orphan worktree transaction ${record.txId} for PID ${record.pid}: ${record.worktreePath}`);
        continue;
      }

      await cleanupWorktreeRecord(daemonHome, record, runGit);
    }
  }
}
