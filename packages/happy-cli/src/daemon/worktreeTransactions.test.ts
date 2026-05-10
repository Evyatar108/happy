import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it, vi } from 'vitest';

import { logger } from '@/ui/logger';

import {
  createWorktreeTransaction,
  recoverPending,
  readPendingWorktreeTransactions,
  readWorktreeTransaction,
  updateWorktreeTransaction,
} from './worktreeTransactions';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  return stdout;
}

async function createGitRepo(): Promise<string> {
  const repoPath = mkdtempSync(join(tmpdir(), 'happy-worktree-recovery-repo-'));
  await git(repoPath, ['init']);
  await git(repoPath, ['config', 'user.email', 'happy@example.test']);
  await git(repoPath, ['config', 'user.name', 'Happy Test']);
  writeFileSync(join(repoPath, 'README.md'), 'test repo\n');
  await git(repoPath, ['add', 'README.md']);
  await git(repoPath, ['commit', '-m', 'initial']);
  return repoPath;
}

describe('worktreeTransactions', () => {
  it('persists state transitions and can recover partial records from disk', async () => {
    const daemonHome = mkdtempSync(join(tmpdir(), 'happy-worktree-tx-'));
    const tx = await createWorktreeTransaction(daemonHome, {
      txId: 'tx-1',
      worktreePath: '/repo/.dev/worktree/ralph-12345678',
      branchName: 'ralph-12345678',
      repoPath: '/repo',
      machineId: 'machine-1',
      runId: 'run-1',
    });

    expect((await readWorktreeTransaction(daemonHome, 'tx-1')).state).toBe('pending');

    const worktreeCreated = await updateWorktreeTransaction(daemonHome, tx, { state: 'worktreeCreated' });
    expect((await readWorktreeTransaction(daemonHome, 'tx-1')).state).toBe('worktreeCreated');

    const processSpawned = await updateWorktreeTransaction(daemonHome, worktreeCreated, { state: 'processSpawned', pid: 4242 });
    expect(await readWorktreeTransaction(daemonHome, 'tx-1')).toMatchObject({ state: 'processSpawned', pid: 4242 });

    await updateWorktreeTransaction(daemonHome, processSpawned, { state: 'sessionRegistered', sessionId: 'session-1' });
    expect(await readPendingWorktreeTransactions(daemonHome)).toMatchObject([{ txId: 'tx-1', state: 'sessionRegistered', sessionId: 'session-1' }]);
  });

  it('recovers worktreeCreated transactions with git cleanup tri-checks across ten trials', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const daemonHome = mkdtempSync(join(tmpdir(), 'happy-worktree-recovery-'));
    const repoPath = await createGitRepo();
    const worktreeRoot = join(repoPath, '.dev', 'worktree');
    mkdirSync(worktreeRoot, { recursive: true });

    try {
      for (let trial = 0; trial < 10; trial++) {
        if (trial < 3) {
          for (let i = 0; i < 5; i++) {
            const liveTx = await createWorktreeTransaction(daemonHome, {
              txId: `live-${trial}-${i}`,
              worktreePath: join(repoPath, '.dev', 'live', `external-live-${trial}-${i}`),
              branchName: `external-live-${trial}-${i}`,
              repoPath,
              machineId: 'machine-1',
              runId: 'run-1',
            });
            await updateWorktreeTransaction(daemonHome, liveTx, { state: 'processSpawned', pid: process.pid });
          }
        }

        const branchName = `ralph-${String(trial).padStart(8, '0')}`;
        const worktreePath = join(worktreeRoot, branchName);
        await git(repoPath, ['worktree', 'add', '-b', branchName, worktreePath]);
        const tx = await createWorktreeTransaction(daemonHome, {
          txId: `tx-${trial}`,
          worktreePath,
          branchName,
          repoPath,
          machineId: 'machine-1',
          runId: 'run-1',
        });
        await updateWorktreeTransaction(daemonHome, tx, { state: 'worktreeCreated' });

        await recoverPending(daemonHome, { isPidAlive: async (pid) => pid === process.pid });

        const ralphDirs = existsSync(worktreeRoot)
          ? readdirSync(worktreeRoot).filter(entry => entry.startsWith('ralph-'))
          : [];
        const worktreeList = await git(repoPath, ['worktree', 'list', '--porcelain']);
        const branchList = await git(repoPath, ['branch', '--list', 'ralph-*']);

        expect(ralphDirs).toEqual([]);
        expect(worktreeList).not.toContain(branchName);
        expect(branchList.trim()).toBe('');
      }
    } finally {
      warnSpy.mockRestore();
    }
  }, 30_000);

  it('cleans dead processSpawned records and leaves live processSpawned records intact', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const daemonHome = mkdtempSync(join(tmpdir(), 'happy-worktree-pid-recovery-'));
    const repoPath = '/repo';
    const runGit = vi.fn(async () => '');

    try {
      const deadTx = await createWorktreeTransaction(daemonHome, {
        txId: 'dead-tx',
        worktreePath: '/repo/.dev/worktree/ralph-dead0000',
        branchName: 'ralph-dead0000',
        repoPath,
        machineId: 'machine-1',
        runId: 'run-1',
      });
      await updateWorktreeTransaction(daemonHome, deadTx, { state: 'processSpawned', pid: 100 });

      const liveTx = await createWorktreeTransaction(daemonHome, {
        txId: 'live-tx',
        worktreePath: '/repo/.dev/worktree/ralph-live0000',
        branchName: 'ralph-live0000',
        repoPath,
        machineId: 'machine-1',
        runId: 'run-1',
      });
      await updateWorktreeTransaction(daemonHome, liveTx, { state: 'processSpawned', pid: 200 });

      await recoverPending(daemonHome, {
        runGit,
        isPidAlive: async (pid) => pid === 200,
      });

      expect(runGit).toHaveBeenCalledWith(repoPath, ['worktree', 'remove', '--force', '/repo/.dev/worktree/ralph-dead0000']);
      expect(runGit).toHaveBeenCalledWith(repoPath, ['branch', '-D', 'ralph-dead0000']);
      expect(runGit).not.toHaveBeenCalledWith(repoPath, ['worktree', 'remove', '--force', '/repo/.dev/worktree/ralph-live0000']);
      expect(await readPendingWorktreeTransactions(daemonHome)).toMatchObject([{ txId: 'live-tx', state: 'processSpawned', pid: 200 }]);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('leaves sessionRegistered records untouched during recovery', async () => {
    const daemonHome = mkdtempSync(join(tmpdir(), 'happy-worktree-session-recovery-'));
    const runGit = vi.fn(async () => '');
    const tx = await createWorktreeTransaction(daemonHome, {
      txId: 'session-tx',
      worktreePath: '/repo/.dev/worktree/ralph-session',
      branchName: 'ralph-session',
      repoPath: '/repo',
      machineId: 'machine-1',
      runId: 'run-1',
    });
    await updateWorktreeTransaction(daemonHome, tx, { state: 'sessionRegistered', pid: 300, sessionId: 'session-1' });

    await recoverPending(daemonHome, { runGit, isPidAlive: async () => false });

    expect(runGit).not.toHaveBeenCalled();
    expect(await readPendingWorktreeTransactions(daemonHome)).toMatchObject([{ txId: 'session-tx', state: 'sessionRegistered', sessionId: 'session-1' }]);
  });
});
