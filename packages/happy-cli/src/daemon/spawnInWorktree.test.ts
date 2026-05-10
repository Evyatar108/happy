import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { readPendingWorktreeTransactions } from './worktreeTransactions';
import { spawnInWorktree, type SpawnInWorktreeDeps } from './spawnInWorktree';

function deps(overrides: Partial<SpawnInWorktreeDeps> = {}): SpawnInWorktreeDeps {
  return {
    daemonHome: mkdtempSync(join(tmpdir(), 'happy-spawn-worktree-')),
    machineId: 'machine-1',
    baseEnv: { PATH: '/bin' },
    stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
    realpath: vi.fn(async (path: string) => path),
    runGit: vi.fn(async () => ''),
    spawnTrackedHappyProcess: vi.fn(async ({ onProcessSpawned }) => {
      await onProcessSpawned?.(4242);
      return { type: 'success' as const, sessionId: 'session-1' };
    }),
    sleep: vi.fn(async () => undefined),
    killProcess: vi.fn(),
    ...overrides,
  };
}

describe('spawnInWorktree', () => {
  it('creates a worktree, tracks transaction transitions, and returns rich spawn metadata', async () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'happy-repo-'));
    const worktreePath = join(repoPath, '.dev', 'worktree', 'ralph-explicit');
    const testDeps = deps();

    const result = await spawnInWorktree({
      machineId: 'machine-1',
      repoPath,
      worktreePath,
      runId: 'run-1',
      agent: 'codex',
    }, testDeps);

    expect(result).toEqual({
      type: 'success',
      sessionId: 'session-1',
      worktreePath,
      branchName: 'ralph-explicit',
      runId: 'run-1',
    });
    expect(testDeps.runGit).toHaveBeenCalledWith(repoPath, ['worktree', 'add', '-b', 'ralph-explicit', worktreePath]);
    expect(testDeps.spawnTrackedHappyProcess).toHaveBeenCalledWith(expect.objectContaining({
      args: ['codex', '--happy-starting-mode', 'remote', '--started-by', 'daemon'],
      cwd: worktreePath,
      env: expect.objectContaining({
        HAPPY_PROJECT_PATH: repoPath,
        HAPPY_WORKTREE_PATH: worktreePath,
        HAPPY_SPAWN_RUN_ID: 'run-1',
      }),
    }));
    expect(await readPendingWorktreeTransactions(testDeps.daemonHome)).toMatchObject([{ state: 'sessionRegistered', pid: 4242, sessionId: 'session-1' }]);
  });

  it('delays after worktree creation when the race-injection env var is set', async () => {
    const oldDelay = process.env.HAPPY_DAEMON_DELAY_AFTER_WORKTREE_CREATE_MS;
    process.env.HAPPY_DAEMON_DELAY_AFTER_WORKTREE_CREATE_MS = '25';
    const testDeps = deps();
    const repoPath = mkdtempSync(join(tmpdir(), 'happy-repo-'));

    try {
      await spawnInWorktree({ machineId: 'machine-1', repoPath, runId: 'run-1', agent: 'claude' }, testDeps);
      expect(testDeps.sleep).toHaveBeenCalledWith(25);
    } finally {
      if (oldDelay === undefined) {
        delete process.env.HAPPY_DAEMON_DELAY_AFTER_WORKTREE_CREATE_MS;
      } else {
        process.env.HAPPY_DAEMON_DELAY_AFTER_WORKTREE_CREATE_MS = oldDelay;
      }
    }
  });

  it('rolls back the worktree and branch when spawning fails after worktree creation', async () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'happy-repo-'));
    const worktreePath = join(repoPath, '.dev', 'worktree', 'ralph-fail');
    const testDeps = deps({
      spawnTrackedHappyProcess: vi.fn(async ({ onProcessSpawned }) => {
        await onProcessSpawned?.(4242);
        return { type: 'error' as const, errorMessage: 'Session webhook timeout for PID 4242' };
      }),
    });

    const result = await spawnInWorktree({ machineId: 'machine-1', repoPath, worktreePath, runId: 'run-1', agent: 'gemini' }, testDeps);

    expect(result).toEqual({ type: 'error', errorMessage: 'Session webhook timeout for PID 4242' });
    expect(testDeps.killProcess).toHaveBeenCalledWith(4242);
    expect(testDeps.runGit).toHaveBeenCalledWith(repoPath, ['worktree', 'remove', '--force', worktreePath]);
    expect(testDeps.runGit).toHaveBeenCalledWith(repoPath, ['branch', '-D', 'ralph-fail']);
  });

  it('rejects RPCs targeted at another machine before creating a transaction', async () => {
    const testDeps = deps();
    const repoPath = mkdtempSync(join(tmpdir(), 'happy-repo-'));

    const result = await spawnInWorktree({ machineId: 'other-machine', repoPath, runId: 'run-1', agent: 'openclaw' }, testDeps);

    expect(result).toMatchObject({ type: 'error', errorMessage: expect.stringContaining('Machine mismatch') });
    expect(testDeps.runGit).not.toHaveBeenCalled();
    expect(await readPendingWorktreeTransactions(testDeps.daemonHome)).toEqual([]);
  });
});
