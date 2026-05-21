import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { ProcessManager } from '../process-manager.js';
import { devServerLogs, clampTail } from '../tools/dev-server-logs.js';
import { devServerStart, parseViteReadyUrl } from '../tools/dev-server-start.js';
import { devServerStatus } from '../tools/dev-server-status.js';
import { devServerStop } from '../tools/dev-server-stop.js';

import type { ServerContext } from '../context.js';

describe('overview.dev_server tools', () => {
  it('matches Vite ready banners with ANSI stripping and arrow-prefixed or plain Local lines', () => {
    expect(parseViteReadyUrl('  \x1b[32m➜\x1b[39m  Local:   http://127.0.0.1:5173/')).toBe(
      'http://127.0.0.1:5173/',
    );
    expect(parseViteReadyUrl('Local: http://localhost:5173/')).toBe('http://localhost:5173/');
  });

  it('runs start, status, logs, and stop against the shared ProcessManager entry', async () => {
    const child = fakeChild(101);
    const manager = managerWithChildren([child]);
    const context = contextWithManager(manager);
    const started = devServerStart(context, { readyTimeoutMs: 200 });

    (child.stdout as PassThrough).write('booting\n  ➜  Local:   http://127.0.0.1:5173/\n');

    await expect(started).resolves.toMatchObject({
      ok: true,
      url: 'http://127.0.0.1:5173/',
      pid: 101,
    });
    expect(devServerStatus(context)).toMatchObject({
      running: true,
      status: 'running',
      url: 'http://127.0.0.1:5173/',
      pid: 101,
      lastLogTail: { stdout: ['booting', '  ➜  Local:   http://127.0.0.1:5173/'], stderr: [] },
    });
    expect(devServerLogs(context, { tail: 1, stream: 'stdout' })).toEqual({
      stdout: ['  ➜  Local:   http://127.0.0.1:5173/'],
    });

    await expect(devServerStop(context)).resolves.toMatchObject({ ok: true, pid: 101 });
    expect(devServerStatus(context)).toMatchObject({ running: false });
  });

  it('returns alreadyRunning when start is called after the server is ready', async () => {
    const child = fakeChild(102);
    const manager = managerWithChildren([child]);
    const context = contextWithManager(manager);
    const first = devServerStart(context, { readyTimeoutMs: 200 });
    (child.stdout as PassThrough).write('Local: http://127.0.0.1:5173/\n');
    await first;

    await expect(devServerStart(context, { readyTimeoutMs: 200 })).resolves.toMatchObject({
      ok: true,
      alreadyRunning: true,
      url: 'http://127.0.0.1:5173/',
      pid: 102,
    });
  });

  it('awaits readyPromise when a second start call arrives during startup', async () => {
    const child = fakeChild(103);
    let spawnCount = 0;
    const manager = managerWithChildren([child], () => {
      spawnCount += 1;
    });
    const context = contextWithManager(manager);

    const first = devServerStart(context, { readyTimeoutMs: 200 });
    const second = devServerStart(context, { readyTimeoutMs: 200 });
    (child.stderr as PassThrough).write('  ➜  Local:   http://127.0.0.1:5174/\n');

    await expect(first).resolves.toMatchObject({ ok: true, url: 'http://127.0.0.1:5174/' });
    await expect(second).resolves.toMatchObject({
      ok: true,
      alreadyRunning: true,
      url: 'http://127.0.0.1:5174/',
      pid: 103,
    });
    expect(spawnCount).toBe(1);
  });

  it('clears a failed startup handle so a retry can start fresh', async () => {
    const failed = fakeChild(104);
    const retry = fakeChild(105);
    const manager = managerWithChildren([failed, retry]);
    const context = contextWithManager(manager);

    const first = devServerStart(context, { readyTimeoutMs: 200 });
    (failed.stderr as PassThrough).write('startup failed\n');
    failed.emit('exit', 1, null);

    await expect(first).resolves.toMatchObject({
      ok: false,
      error: 'process exited before ready: code=1, signal=none',
      lastLogLines: { stderr: ['startup failed'] },
    });
    expect(manager.status('dev-server')).toBeNull();

    const second = devServerStart(context, { readyTimeoutMs: 200 });
    (retry.stdout as PassThrough).write('Local: http://127.0.0.1:5175/\n');

    await expect(second).resolves.toMatchObject({
      ok: true,
      url: 'http://127.0.0.1:5175/',
      pid: 105,
    });
  });

  it('clamps log tails to the ProcessManager ring-buffer range', () => {
    expect(clampTail(-10)).toBe(1);
    expect(clampTail(0)).toBe(1);
    expect(clampTail(1001)).toBe(1000);
  });
});

function managerWithChildren(children: ChildProcess[], onSpawn?: () => void): ProcessManager {
  const childByPid = new Map(children.map((child) => [child.pid, child]));
  return new ProcessManager({
    platform: 'linux',
    spawn: (cmd, args, options) => {
      onSpawn?.();
      expect(cmd).toBe('pnpm');
      expect(args).toEqual(['overview']);
      expect(options).toMatchObject({ shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
      return children.shift()!;
    },
    processKill: (pid, signal) => {
      queueMicrotask(() => childByPid.get(pid)?.emit('exit', null, signal));
    },
  });
}

function contextWithManager(processManager: ProcessManager): ServerContext {
  return {
    repoRoot: '/tmp/repo',
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
