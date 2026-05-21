import fs from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { syncWatchStatus } from '../tools/sync-watch-status.js';

import type { ServerContext } from '../context.js';
import { setupTempRoot } from './helpers.js';

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('overview.sync.watch_status tool', () => {
  it('reports not running when the lock is missing', async () => {
    const context = await contextWithLock();

    await expect(syncWatchStatus(context)).resolves.toEqual({ running: false });
  });

  it('reports active lock metadata', async () => {
    const context = await contextWithLock();
    await writeLock(context, { pid: 999999, process: 'standalone', startedAt: '2026-05-20T20:41:00.000Z' });

    await expect(syncWatchStatus(context)).resolves.toMatchObject({
      running: true,
      lockHolderPid: 999999,
      lockHolderProcess: 'standalone',
      startedAt: '2026-05-20T20:41:00.000Z',
    });
  });

  it('reports stale when the lock mtime is old and the pid is dead', async () => {
    const context = await contextWithLock();
    await writeLock(context, { pid: 999999, process: 'standalone', startedAt: '2026-05-20T20:42:00.000Z' });
    await touchOld(context.config.lockFile);

    await expect(syncWatchStatus(context)).resolves.toMatchObject({
      running: false,
      staleLock: true,
      lockHolderPid: 999999,
      lockHolderProcess: 'standalone',
    });
  });

  it('reports stale for unparseable lock JSON', async () => {
    const context = await contextWithLock();
    await fs.writeFile(context.config.lockFile, '{not json', 'utf8');

    await expect(syncWatchStatus(context)).resolves.toMatchObject({ running: false, staleLock: true });
  });

  it('reports active when old lock mtime belongs to a live pid', async () => {
    const context = await contextWithLock();
    await writeLock(context, { pid: process.pid, process: 'vite-plugin', startedAt: '2026-05-20T20:43:00.000Z' });
    await touchOld(context.config.lockFile);

    await expect(syncWatchStatus(context)).resolves.toMatchObject({
      running: true,
      lockHolderPid: process.pid,
      lockHolderProcess: 'vite-plugin',
      startedAt: '2026-05-20T20:43:00.000Z',
    });
  });
});

async function contextWithLock(): Promise<ServerContext> {
  const repoRoot = await setupTempRoot();
  tempRoots.push(repoRoot);
  const lockFile = path.join(repoRoot, '.ralph', 'overview-sync.lock');
  await fs.mkdir(path.dirname(lockFile), { recursive: true });
  return {
    repoRoot,
    config: { lockFile } as ServerContext['config'],
    snapshotReader: {} as ServerContext['snapshotReader'],
    processManager: {} as ServerContext['processManager'],
  };
}

async function writeLock(context: ServerContext, metadata: { pid: number; process: string; startedAt: string }): Promise<void> {
  await fs.writeFile(context.config.lockFile, `${JSON.stringify(metadata)}\n`, 'utf8');
}

async function touchOld(lockFile: string): Promise<void> {
  const old = new Date(Date.now() - 120_000);
  await fs.utimes(lockFile, old, old);
}
