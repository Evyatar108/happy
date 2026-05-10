import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  createWorktreeTransaction,
  readPendingWorktreeTransactions,
  readWorktreeTransaction,
  updateWorktreeTransaction,
} from './worktreeTransactions';

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
});
