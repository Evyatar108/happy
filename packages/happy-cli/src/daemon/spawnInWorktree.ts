import { randomUUID } from 'node:crypto';
import { isAbsolute, join } from 'node:path';

import type { SpawnInWorktreeOptions, SpawnSessionResult } from '@/modules/common/registerCommonHandlers';
import { logger } from '@/ui/logger';
import { generateWorktreeName } from './worktreeNames';
import {
  createWorktreeTransaction,
  updateWorktreeTransaction,
  type WorktreeTransactionRecord,
} from './worktreeTransactions';

export type SpawnInWorktreeDeps = {
  daemonHome: string;
  machineId: string;
  baseEnv: NodeJS.ProcessEnv;
  realpath: (path: string) => Promise<string>;
  stat: (path: string) => Promise<{ isDirectory(): boolean }>;
  runGit: (cwd: string, args: string[]) => Promise<string>;
  spawnTrackedHappyProcess: (options: {
    args: string[];
    cwd: string;
    env: NodeJS.ProcessEnv;
    onProcessSpawned?: (pid: number) => void | Promise<void>;
  }) => Promise<SpawnSessionResult>;
  sleep?: (ms: number) => Promise<void>;
  killProcess?: (pid: number) => void;
};

const MAX_WORKTREE_COLLISION_RETRIES = 3;

function isAlreadyExistsError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return /already exists|exists already|would overwrite/i.test(text);
}

async function safeRollback(deps: SpawnInWorktreeDeps, tx: WorktreeTransactionRecord, pid?: number): Promise<void> {
  if (pid !== undefined) {
    try {
      deps.killProcess?.(pid);
    } catch (error) {
      logger.debug(`[DAEMON WORKTREE] Failed to kill PID ${pid} during rollback: ${error instanceof Error ? error.message : error}`);
    }
  }

  if (tx.state === 'worktreeCreated' || tx.state === 'processSpawned') {
    try {
      await deps.runGit(tx.repoPath, ['worktree', 'remove', '--force', tx.worktreePath]);
    } catch (error) {
      logger.debug(`[DAEMON WORKTREE] Failed to remove worktree ${tx.worktreePath}: ${error instanceof Error ? error.message : error}`);
    }
    try {
      await deps.runGit(tx.repoPath, ['branch', '-D', tx.branchName]);
    } catch (error) {
      logger.debug(`[DAEMON WORKTREE] Failed to delete branch ${tx.branchName}: ${error instanceof Error ? error.message : error}`);
    }
  }
}

export async function spawnInWorktree(options: SpawnInWorktreeOptions, deps: SpawnInWorktreeDeps): Promise<SpawnSessionResult> {
  let tx: WorktreeTransactionRecord | null = null;
  let spawnedPid: number | undefined;

  try {
    if (options.machineId && options.machineId !== deps.machineId) {
      return { type: 'error', errorMessage: `Machine mismatch: RPC targeted ${options.machineId}, but this daemon is ${deps.machineId}.` };
    }
    if (!isAbsolute(options.repoPath)) {
      return { type: 'error', errorMessage: `repoPath must be an absolute path, got: ${options.repoPath}` };
    }

    const repoStat = await deps.stat(options.repoPath);
    if (!repoStat.isDirectory()) {
      return { type: 'error', errorMessage: `repoPath must be a directory: ${options.repoPath}` };
    }
    const repoPath = await deps.realpath(options.repoPath);
    await deps.runGit(repoPath, ['rev-parse', '--show-toplevel']);

    const runId = options.runId || randomUUID();
    const initialName = options.worktreePath ? options.worktreePath.split(/[\\/]/).filter(Boolean).at(-1)! : generateWorktreeName();
    let branchName = initialName;
    let worktreePath = options.worktreePath ? (isAbsolute(options.worktreePath) ? options.worktreePath : join(repoPath, options.worktreePath)) : join(repoPath, '.dev', 'worktree', branchName);

    tx = await createWorktreeTransaction(deps.daemonHome, {
      txId: randomUUID(),
      worktreePath,
      branchName,
      repoPath,
      machineId: deps.machineId,
      runId,
    });

    for (let attempt = 0; attempt <= MAX_WORKTREE_COLLISION_RETRIES; attempt++) {
      try {
        await deps.runGit(repoPath, ['worktree', 'add', '-b', branchName, worktreePath]);
        tx = { ...tx, state: 'worktreeCreated' };
        tx = await updateWorktreeTransaction(deps.daemonHome, tx, { state: 'worktreeCreated' });
        break;
      } catch (error) {
        if (attempt >= MAX_WORKTREE_COLLISION_RETRIES || options.worktreePath || !isAlreadyExistsError(error)) {
          throw error;
        }
        branchName = generateWorktreeName();
        worktreePath = join(repoPath, '.dev', 'worktree', branchName);
        tx = await updateWorktreeTransaction(deps.daemonHome, tx, { state: 'pending', branchName, worktreePath });
      }
    }

    const delayMs = Number.parseInt(process.env.HAPPY_DAEMON_DELAY_AFTER_WORKTREE_CREATE_MS || '', 10);
    if (Number.isFinite(delayMs) && delayMs > 0) {
      await (deps.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))))(delayMs);
    }

    const result = await deps.spawnTrackedHappyProcess({
      args: [options.agent, '--happy-starting-mode', 'remote', '--started-by', 'daemon'],
      cwd: tx.worktreePath,
      env: {
        ...deps.baseEnv,
        HAPPY_PROJECT_PATH: tx.repoPath,
        HAPPY_WORKTREE_PATH: tx.worktreePath,
        HAPPY_SPAWN_RUN_ID: tx.runId,
      },
      onProcessSpawned: async (pid) => {
        spawnedPid = pid;
        tx = { ...tx!, state: 'processSpawned', pid };
        tx = await updateWorktreeTransaction(deps.daemonHome, tx!, { state: 'processSpawned', pid });
      },
    });

    if (result.type !== 'success') {
      await safeRollback(deps, tx, spawnedPid);
      return result.type === 'error' ? result : { type: 'error', errorMessage: `Unexpected spawn-in-worktree result: ${result.type}` };
    }

    tx = await updateWorktreeTransaction(deps.daemonHome, tx, {
      state: 'sessionRegistered',
      pid: spawnedPid,
      sessionId: result.sessionId,
    });

    return {
      type: 'success',
      sessionId: result.sessionId,
      worktreePath: tx.worktreePath,
      branchName: tx.branchName,
      runId: tx.runId,
    };
  } catch (error) {
    if (tx) {
      await safeRollback(deps, tx, spawnedPid);
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.debug(`[DAEMON WORKTREE] Failed to spawn in worktree: ${errorMessage}`, error instanceof Error ? error.stack : undefined);
    return { type: 'error', errorMessage: `Failed to spawn in worktree: ${errorMessage}` };
  }
}
