import { EventEmitter, once } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { AlreadyRunningError, ProcessManager } from '../process-manager.js';

describe('ProcessManager', () => {
  it('spawns with isolated stdio and captures stdout/stderr logs', async () => {
    const child = fakeChild(101);
    const manager = new ProcessManager({
      spawn: (_cmd, _args, options) => {
        expect(options).toMatchObject({ shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
        queueMicrotask(() => {
          (child.stdout as PassThrough).write('out\n');
          (child.stderr as PassThrough).write('err\n');
          child.emit('exit', 0, null);
        });
        return child;
      },
    });
    const parentWrites: string[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      parentWrites.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;

    try {
      const managed = manager.spawn({
        name: 'logs',
        cmd: 'node',
      });
      await once(managed.child!, 'exit');

      expect(manager.logs('logs')).toEqual({ stdout: ['out'], stderr: ['err'] });
      expect(parentWrites).toEqual([]);
    } finally {
      process.stdout.write = originalWrite;
      await manager.stopAll({ timeoutMs: 5 });
    }
  });

  it('resolves onReady from stdout and exposes the shared readyPromise', async () => {
    const child = fakeChild(102);
    const manager = new ProcessManager({
      platform: 'linux',
      spawn: () => child,
      processKill: (_pid, signal) => queueMicrotask(() => child.emit('exit', null, signal)),
    });
    const managed = manager.spawn({
      name: 'ready-stdout',
      cmd: 'node',
    });
    queueMicrotask(() => {
      (child.stdout as PassThrough).write('Local: http://127.0.0.1:5173/\n');
    });

    const ready = await managed.onReady((line) => line.match(/Local: (\S+)/)?.[1], { timeoutMs: 500 });
    await expect(managed.readyPromise).resolves.toEqual(ready);
    expect(ready).toMatchObject({ url: 'http://127.0.0.1:5173/', pid: managed.pid });
    expect(manager.status('ready-stdout')).toMatchObject({ status: 'running' });

    await manager.stop('ready-stdout', { timeoutMs: 500 });
  });

  it('resolves onReady from stderr ring-buffer lines', async () => {
    const child = fakeChild(103);
    const manager = new ProcessManager({
      platform: 'linux',
      spawn: () => child,
      processKill: (_pid, signal) => queueMicrotask(() => child.emit('exit', null, signal)),
    });
    const managed = manager.spawn({
      name: 'ready-stderr',
      cmd: 'node',
    });
    queueMicrotask(() => {
      (child.stderr as PassThrough).write('Local: http://127.0.0.1:5174/\n');
    });

    const ready = await managed.onReady((line, stream) => {
      if (stream !== 'stderr') {
        return null;
      }
      return line.match(/Local: (\S+)/)?.[1];
    });

    expect(ready.url).toBe('http://127.0.0.1:5174/');
    await manager.stop('ready-stderr', { timeoutMs: 500 });
  });

  it('uses tree-kill for SIGTERM and SIGKILL on Windows', async () => {
    const child = fakeChild(111);
    const signals: string[] = [];
    const manager = new ProcessManager({
      platform: 'win32',
      spawn: () => child,
      treeKill: (_pid, signal, callback) => {
        signals.push(String(signal));
        if (signal === 'SIGKILL') {
          queueMicrotask(() => child.emit('exit', null, signal));
        }
        callback?.();
      },
    });

    manager.spawn({ name: 'windows-stop', cmd: 'node' });
    await manager.stop('windows-stop', { timeoutMs: 5 });

    expect(signals).toEqual(['SIGTERM', 'SIGKILL']);
  });

  it('stops all long-lived and transient processes', async () => {
    const children = [fakeChild(201), fakeChild(202), fakeChild(203)];
    const killed: number[] = [];
    const manager = new ProcessManager({
      platform: 'linux',
      spawn: () => children.shift()!,
      processKill: (pid, signal) => {
        killed.push(pid);
        const child = [201, 202, 203].includes(pid) ? fakeChildrenByPid.get(pid) : undefined;
        queueMicrotask(() => child?.emit('exit', null, signal));
      },
    });
    const fakeChildrenByPid = new Map<number, ChildProcess>();
    for (const child of children) {
      fakeChildrenByPid.set(child.pid!, child);
    }

    manager.spawn({ name: 'dev-server', cmd: 'node' });
    manager.spawn({ name: 'build', cmd: 'node', oneShot: true });
    manager.spawn({ name: 'sync-now', cmd: 'node', oneShot: true });

    const stopped = await manager.stopAll({ timeoutMs: 20 });

    expect(stopped.map((entry) => entry.name).sort()).toEqual(['build', 'dev-server', 'sync-now']);
    expect(killed.sort()).toEqual([201, 202, 203]);
    expect(manager.status()).toMatchObject([{ name: 'dev-server', status: 'exited' }]);
  });

  it('stopAll continues stopping remaining processes when one rejects', async () => {
    const childA = fakeChild(221);
    const childB = fakeChild(222);
    let spawnCount = 0;
    const stoppedPids: number[] = [];
    const manager = new ProcessManager({
      platform: 'win32',
      spawn: () => (spawnCount++ === 0 ? childA : childB),
      treeKill: (pid, signal, callback) => {
        if (pid === 221) {
          callback?.(new Error('OS error stopping 221'));
          return;
        }
        stoppedPids.push(pid);
        if (signal === 'SIGKILL') {
          queueMicrotask(() => childB.emit('exit', null, signal));
        }
        callback?.();
      },
    });

    manager.spawn({ name: 'hanging', cmd: 'node' });
    manager.spawn({ name: 'normal', cmd: 'node' });

    const consoleErrors: unknown[] = [];
    const originalError = console.error.bind(console);
    console.error = (...args: unknown[]) => consoleErrors.push(args);
    try {
      const snapshots = await manager.stopAll({ timeoutMs: 20 });
      expect(snapshots.map((s) => s.name).sort()).toEqual(['hanging', 'normal']);
      expect(stoppedPids).toContain(222);
      expect(consoleErrors.length).toBeGreaterThan(0);
      expect(String(consoleErrors[0])).toMatch(/hanging/);
    } finally {
      console.error = originalError;
    }
  });

  it('guards already-running names and preserves the original handle', () => {
    const child = fakeChild(301);
    const manager = new ProcessManager({ spawn: () => child });
    const first = manager.spawn({ name: 'same', cmd: 'node' });

    expect(() => manager.spawn({ name: 'same', cmd: 'node' })).toThrow(AlreadyRunningError);
    try {
      manager.spawn({ name: 'same', cmd: 'node' });
    } catch (err) {
      expect(err).toBeInstanceOf(AlreadyRunningError);
      expect((err as AlreadyRunningError).process).toBe(first);
    }
  });

  it('registers a starting record before invoking child_process.spawn', () => {
    let manager!: ProcessManager;
    const child = fakeChild(401);
    manager = new ProcessManager({
      spawn: () => {
        expect(manager.status('race')).toMatchObject({ name: 'race', status: 'starting' });
        return child;
      },
    });

    manager.spawn({ name: 'race', cmd: 'node' });
  });

  it('can stop a process while it is still starting', async () => {
    const child = fakeChild(501);
    const manager = new ProcessManager({
      platform: 'linux',
      spawn: () => child,
      processKill: (_pid, signal) => {
        queueMicrotask(() => child.emit('exit', null, signal));
      },
    });

    manager.spawn({ name: 'starting', cmd: 'node' });
    const stopped = await manager.stop('starting', { timeoutMs: 20 });

    expect(stopped).toMatchObject({ name: 'starting', status: 'exited' });
  });

  it('caps each stream ring buffer at 1000 lines and drops the oldest', () => {
    const child = fakeChild(601);
    const manager = new ProcessManager({ spawn: () => child });
    manager.spawn({ name: 'overflow', cmd: 'node' });

    (child.stdout as PassThrough).write(Array.from({ length: 1005 }, (_, index) => `line-${index}`).join('\n') + '\n');

    const logs = manager.logs('overflow')!;
    expect(logs.stdout).toHaveLength(1000);
    expect(logs.stdout[0]).toBe('line-5');
    expect(logs.stdout.at(-1)).toBe('line-1004');
  });

  it('normalizes CRLF and CR line endings before splitting', () => {
    const child = fakeChild(701);
    const manager = new ProcessManager({ spawn: () => child });
    manager.spawn({ name: 'crlf', cmd: 'node' });

    (child.stdout as PassThrough).write('a\r\nb\rc\n');

    expect(manager.logs('crlf')?.stdout).toEqual(['a', 'b', 'c']);
  });
});

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
