import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
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

function fanoutDeps(): SpawnInWorktreeDeps & { createdWorktrees: Set<string> } {
  let sessionCounter = 0;
  const createdWorktrees = new Set<string>();

  const testDeps = deps({
    runGit: vi.fn(async (_cwd, args) => {
      if (args[0] === 'worktree' && args[1] === 'add') {
        const worktreePath = args[4];
        if (createdWorktrees.has(worktreePath)) {
          throw new Error(`worktree path already exists: ${worktreePath}`);
        }
        createdWorktrees.add(worktreePath);
      }
      return '';
    }),
    spawnTrackedHappyProcess: vi.fn(async ({ onProcessSpawned }) => {
      const sessionNumber = ++sessionCounter;
      await onProcessSpawned?.(4000 + sessionNumber);
      return { type: 'success' as const, sessionId: `session-${sessionNumber}` };
    }),
  });

  return Object.assign(testDeps, { createdWorktrees });
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

  it('handles two concurrent new-worktree spawns within 100ms without path or session collisions across ten trials', async () => {
    for (let trial = 0; trial < 10; trial++) {
      const repoPath = mkdtempSync(join(tmpdir(), 'happy-repo-pair-'));
      const testDeps = fanoutDeps();
      const issuedAt: number[] = [];

      const first = (() => {
        issuedAt.push(performance.now());
        return spawnInWorktree({ machineId: 'machine-1', repoPath, runId: `run-pair-${trial}`, agent: 'codex' }, testDeps);
      })();
      const second = (() => {
        issuedAt.push(performance.now());
        return spawnInWorktree({ machineId: 'machine-1', repoPath, runId: `run-pair-${trial}`, agent: 'codex' }, testDeps);
      })();

      const results = await Promise.all([first, second]);
      const successes = results.filter(result => result.type === 'success');
      const worktreePaths = successes.map(result => result.worktreePath);
      const sessionIds = successes.map(result => result.sessionId);

      expect(Math.max(...issuedAt) - Math.min(...issuedAt)).toBeLessThan(100);
      expect(successes).toHaveLength(2);
      expect(new Set(worktreePaths).size).toBe(2);
      expect(new Set(sessionIds).size).toBe(2);
      expect(testDeps.createdWorktrees.size).toBe(2);
    }
  });

  it('handles a ten-spawn burst within one second without generated-name collisions', async () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'happy-repo-burst-'));
    const testDeps = fanoutDeps();
    const issuedAt: number[] = [];

    const results = await Promise.all(Array.from({ length: 10 }, (_value, index) => {
      issuedAt.push(performance.now());
      return spawnInWorktree({ machineId: 'machine-1', repoPath, runId: 'run-burst', agent: index % 2 === 0 ? 'codex' : 'claude' }, testDeps);
    }));

    const successes = results.filter(result => result.type === 'success');
    const worktreePaths = successes.map(result => result.worktreePath);

    expect(Math.max(...issuedAt) - Math.min(...issuedAt)).toBeLessThan(1000);
    expect(successes).toHaveLength(10);
    expect(new Set(worktreePaths).size).toBe(10);
    expect(testDeps.createdWorktrees.size).toBe(10);
  });
});
