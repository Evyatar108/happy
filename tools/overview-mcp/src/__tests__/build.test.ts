import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

import { ProcessManager } from '../process-manager.js';
import { overviewBuild } from '../tools/build.js';

import type { ServerContext } from '../context.js';
import { setupTempRoot } from './helpers.js';

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('overview.build tool', () => {
  it('runs pnpm overview:build and returns the generated artifact size', async () => {
    const repoRoot = await makeRepoRoot();
    const child = fakeChild(201);
    const manager = managerWithChildren([child], repoRoot);
    const result = overviewBuild(contextWithManager(repoRoot, manager));

    expect(manager.status('build')).toMatchObject({ name: 'build', status: 'starting', command: 'pnpm' });
    await fs.writeFile(path.join(repoRoot, 'plans', 'overview.html'), '<!doctype html>overview</html>', 'utf8');
    (child.stdout as PassThrough).write('built overview\n');
    child.emit('exit', 0, null);

    await expect(result).resolves.toMatchObject({
      ok: true,
      outputPath: path.join(repoRoot, 'plans', 'overview.html'),
      sizeBytes: 30,
    });
    await expect(result).resolves.toHaveProperty('durationMs');
    expect(manager.status('build')).toBeNull();
  });

  it('returns stderr tail on non-zero build exit', async () => {
    const repoRoot = await makeRepoRoot();
    const child = fakeChild(202);
    const manager = managerWithChildren([child], repoRoot);
    const result = overviewBuild(contextWithManager(repoRoot, manager));

    (child.stderr as PassThrough).write(Array.from({ length: 35 }, (_, index) => `err-${index}`).join('\n') + '\n');
    child.emit('exit', 2, null);

    await expect(result).resolves.toEqual({
      ok: false,
      error: 'build failed with exit code 2',
      lastLogLines: Array.from({ length: 30 }, (_, index) => `err-${index + 5}`),
    });
  });

  it('rejects concurrent builds through the ProcessManager single-flight guard', async () => {
    const repoRoot = await makeRepoRoot();
    const child = fakeChild(203);
    const manager = managerWithChildren([child], repoRoot);
    const first = overviewBuild(contextWithManager(repoRoot, manager));

    await expect(overviewBuild(contextWithManager(repoRoot, manager))).resolves.toEqual({
      ok: false,
      error: 'another build in progress',
    });

    child.emit('exit', 1, null);
    await first;
  });

  it('keeps an in-flight build registered so stopAll can terminate it', async () => {
    const repoRoot = await makeRepoRoot();
    const child = fakeChild(204);
    const killed: Array<{ pid: number; signal: NodeJS.Signals }> = [];
    const manager = managerWithChildren([child], repoRoot, (pid, signal) => {
      killed.push({ pid, signal });
      queueMicrotask(() => child.emit('exit', null, signal));
    });
    const result = overviewBuild(contextWithManager(repoRoot, manager));

    expect(manager.status('build')).toMatchObject({ name: 'build', pid: 204 });
    await manager.stopAll({ timeoutMs: 20 });

    expect(killed).toEqual([{ pid: 204, signal: 'SIGTERM' }]);
    await expect(result).resolves.toMatchObject({ ok: false, error: 'build failed with exit code null' });
  });
});

async function makeRepoRoot(): Promise<string> {
  const repoRoot = await setupTempRoot();
  tempRoots.push(repoRoot);
  await fs.mkdir(path.join(repoRoot, 'plans'), { recursive: true });
  return repoRoot;
}

function managerWithChildren(
  children: ChildProcess[],
  expectedCwd: string,
  processKill?: (pid: number, signal: NodeJS.Signals) => void,
): ProcessManager {
  return new ProcessManager({
    platform: 'linux',
    spawn: (cmd, args, options) => {
      expect(cmd).toBe('pnpm');
      expect(args).toEqual(['overview:build']);
      expect(options).toMatchObject({ cwd: expectedCwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
      return children.shift()!;
    },
    processKill,
  });
}

function contextWithManager(repoRoot: string, processManager: ProcessManager): ServerContext {
  return {
    repoRoot,
    config: {} as ServerContext['config'],
    snapshotReader: {} as ServerContext['snapshotReader'],
    processManager,
  };
}

function fakeChild(pid: number): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  Object.defineProperties(child, {
    pid: { value: pid, configurable: true },
    stdout: { value: new PassThrough(), configurable: true },
    stderr: { value: new PassThrough(), configurable: true },
    stdin: { value: null, configurable: true },
  });
  return child;
}
