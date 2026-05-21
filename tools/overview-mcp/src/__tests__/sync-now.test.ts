import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

import { repoRoot } from './helpers.js';
import { ProcessManager } from '../process-manager.js';
import { syncNow } from '../tools/sync-now.js';

import type { ServerContext } from '../context.js';

const fixtureRoots: string[] = [];
const syncScript = path.join(repoRoot, 'scripts', 'sync-ralph-state.mjs');

afterEach(() => {
  for (const fixtureRoot of fixtureRoots.splice(0)) {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

describe('overview.sync.now script integration', () => {
  it('spawns the real one-shot sync script and emits a parseable stdout summary', () => {
    const fixture = makeRepoFixture({ taskId: 'sync-summary-task' });

    const result = spawnSync(process.execPath, [syncScript, '--repo', fixture], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    const stdoutLines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
    expect(stdoutLines).toHaveLength(1);
    expect(stdoutLines[0]).toMatch(/^sync: matched=1, unmatched=0, duration=\d+ms$/);
  });
});

describe('overview.sync.now tool', () => {
  it('parses the stdout summary line into structured counts', async () => {
    const fixture = makeRepoFixture({ taskId: 'tool-summary-task' });
    const child = fakeChild(301);
    const manager = managerWithChildren([child], fixture);
    const result = syncNow(contextWithManager(fixture, manager));

    (child.stdout as PassThrough).write('sync: matched=7, unmatched=2, duration=34ms\n');
    child.emit('exit', 0, null);

    await expect(result).resolves.toEqual({
      ok: true,
      summary: { tasksMatched: 7, unmatchedCount: 2, durationMs: 34 },
    });
    expect(manager.status('sync-now')).toBeNull();
  });

  it('returns lock holder metadata when the one-shot script reports a held sync lock', async () => {
    const fixture = makeRepoFixture({ taskId: 'lock-held-task' });
    const child = fakeChild(302);
    const manager = managerWithChildren([child], fixture);
    const result = syncNow(contextWithManager(fixture, manager));

    writeLock(fixture, { pid: process.pid, process: 'vite-plugin', startedAt: '2026-05-20T20:40:00.000Z' });
    (child.stderr as PassThrough).write(
      'sync-ralph-state: another sync in progress (pid 123, process vite-plugin, started now)\n',
    );
    child.emit('exit', 1, null);

    await expect(result).resolves.toEqual({
      ok: false,
      error: 'sync lock held by vite-plugin',
      lockHolderProcess: 'vite-plugin',
      lockHolderPid: process.pid,
    });
  });

  it('rejects concurrent sync calls through the ProcessManager single-flight guard', async () => {
    const fixture = makeRepoFixture({ taskId: 'concurrent-task' });
    const child = fakeChild(303);
    const manager = managerWithChildren([child], fixture);
    const first = syncNow(contextWithManager(fixture, manager));

    await expect(syncNow(contextWithManager(fixture, manager))).resolves.toEqual({
      ok: false,
      error: 'another sync in progress',
    });

    child.emit('exit', 1, null);
    await first;
  });

  it('returns stderr tail for non-lock sync failures', async () => {
    const fixture = makeRepoFixture({ taskId: 'failure-task' });
    const child = fakeChild(304);
    const manager = managerWithChildren([child], fixture);
    const result = syncNow(contextWithManager(fixture, manager));

    (child.stderr as PassThrough).write(Array.from({ length: 35 }, (_, index) => `err-${index}`).join('\n') + '\n');
    child.emit('exit', 3, null);

    await expect(result).resolves.toEqual({
      ok: false,
      error: 'sync failed with exit code 3',
      lastLogLines: Array.from({ length: 30 }, (_, index) => `err-${index + 5}`),
    });
  });
});

function makeRepoFixture({ taskId }: { taskId: string }): string {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'overview-sync-now-'));
  fixtureRoots.push(fixture);
  const dirs = ['plans', '.ralph/jobs', '.ralph/job-groups', '.ralph/brainstorms', '.crews/crews', '.crews/sessions-configs'];
  for (const dir of dirs) {
    fs.mkdirSync(path.join(fixture, dir), { recursive: true });
  }
  fs.writeFileSync(
    path.join(fixture, 'plans', 'overview-data.js'),
    `window.OVERVIEW_DATA = ${JSON.stringify({ tasks: [{ id: taskId, title: 'Sync summary task' }] }, null, 2)};\n`,
  );
  writeJobState(fixture, taskId, { orchestrator: { phase: '1', terminal: false } });
  return fixture;
}

function writeJobState(fixture: string, taskId: string, value: object): void {
  const jobDir = path.join(fixture, '.ralph', 'jobs', taskId);
  fs.mkdirSync(jobDir, { recursive: true });
  fs.writeFileSync(path.join(jobDir, 'job-state.json'), `${JSON.stringify(value, null, 2)}\n`);
}

function writeLock(fixture: string, metadata: { pid: number; process: string; startedAt: string }): void {
  const lockPath = path.join(fixture, '.ralph', 'overview-sync.lock');
  fs.writeFileSync(lockPath, `${JSON.stringify(metadata)}\n`, 'utf8');
}

function managerWithChildren(children: ChildProcess[], expectedRepoRoot: string): ProcessManager {
  return new ProcessManager({
    platform: 'linux',
    spawn: (cmd, args, options) => {
      expect(cmd).toBe('node');
      expect(args).toEqual([path.join(expectedRepoRoot, 'scripts', 'sync-ralph-state.mjs'), '--repo', expectedRepoRoot]);
      expect(options).toMatchObject({ cwd: expectedRepoRoot, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
      return children.shift()!;
    },
  });
}

function contextWithManager(fixture: string, processManager: ProcessManager): ServerContext {
  return {
    repoRoot: fixture,
    config: { lockFile: path.join(fixture, '.ralph', 'overview-sync.lock') } as ServerContext['config'],
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
