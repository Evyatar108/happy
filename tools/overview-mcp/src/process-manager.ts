import { spawn as nodeSpawn } from 'node:child_process';
import type { ChildProcess, SpawnOptions } from 'node:child_process';

import treeKill from 'tree-kill';

const MAX_LOG_LINES = 1000;
const DEFAULT_STOP_TIMEOUT_MS = 5000;

export type ManagedProcessStatus = 'starting' | 'running' | 'stopping' | 'exited';
export type ProcessStream = 'stdout' | 'stderr';

export interface ReadyInfo {
  url: string;
  pid: number;
  startedAt: Date;
}

export interface ManagedProcessSnapshot {
  name: string;
  status: ManagedProcessStatus;
  pid?: number;
  url?: string;
  startedAt: Date;
  lastReadyAt?: Date;
  exitedAt?: Date;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  command: string;
  args: string[];
  cwd?: string;
}

export interface ManagedProcessLogs {
  stdout: string[];
  stderr: string[];
}

export type ReadyPredicate = (line: string, stream: ProcessStream) => string | { url: string } | false | null | undefined;

export interface SpawnManagedProcessOptions {
  name: string;
  cmd: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  oneShot?: boolean;
}

export interface StopOptions {
  timeoutMs?: number;
  remove?: boolean;
}

export interface ProcessManagerOptions {
  spawn?: SpawnFunction;
  treeKill?: TreeKill;
  processKill?: (pid: number, signal: NodeJS.Signals) => void;
  platform?: NodeJS.Platform;
}

export type TreeKill = (pid: number, signal: NodeJS.Signals | string, callback?: (error?: Error) => void) => void;
export type SpawnFunction = (command: string, args: string[] | undefined, options: SpawnOptions) => ChildProcess;

interface ReadyWaiter {
  predicate: ReadyPredicate;
  resolve: (ready: ReadyInfo) => void;
  reject: (err: Error) => void;
  timer?: NodeJS.Timeout;
  settled: boolean;
}

export class AlreadyRunningError extends Error {
  constructor(public readonly process: ManagedProcess) {
    super(`process already running: ${process.name}`);
    this.name = 'AlreadyRunningError';
  }
}

export class StopFailedError extends Error {
  constructor(name: string) {
    super(`StopFailed: process "${name}" did not exit within timeout`);
    this.name = 'StopFailedError';
  }
}

export class ManagedProcess {
  readonly stdout: string[] = [];
  readonly stderr: string[] = [];
  readonly startedAt = new Date();
  readonly readyPromise: Promise<ReadyInfo>;
  status: ManagedProcessStatus = 'starting';
  pid?: number;
  exitedAt?: Date;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  child?: ChildProcess;
  readyInfo?: ReadyInfo;
  lastReadyAt?: Date;

  private stdoutCarry = '';
  private stderrCarry = '';
  private readyWaiters: ReadyWaiter[] = [];
  private resolveReady!: (ready: ReadyInfo) => void;
  private rejectReady!: (err: Error) => void;
  private readySettled = false;

  constructor(
    readonly name: string,
    readonly command: string,
    readonly args: string[],
    readonly cwd: string | undefined,
    readonly oneShot: boolean,
  ) {
    this.readyPromise = new Promise<ReadyInfo>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    this.readyPromise.catch(() => undefined);
  }

  attachChild(child: ChildProcess): void {
    this.child = child;
    this.pid = child.pid;

    child.stdout?.on('data', (chunk: Buffer | string) => {
      this.appendLog('stdout', chunk);
    });
    child.stderr?.on('data', (chunk: Buffer | string) => {
      this.appendLog('stderr', chunk);
    });
    child.on('error', (err) => {
      this.rejectPendingReady(err instanceof Error ? err : new Error(String(err)));
    });
    child.on('exit', (code, signal) => {
      this.status = 'exited';
      this.exitedAt = new Date();
      this.exitCode = code;
      this.signal = signal;
      this.rejectPendingReady(new Error(`process exited before ready: code=${code}, signal=${signal ?? 'none'}`));
    });
  }

  onReady(predicate: ReadyPredicate, options: { timeoutMs?: number } = {}): Promise<ReadyInfo> {
    const existing = this.findReadyMatch(predicate);
    if (existing) {
      this.markReady(existing);
      return Promise.resolve(existing);
    }
    if (this.status === 'exited') {
      return Promise.reject(new Error('process exited before ready'));
    }

    return new Promise<ReadyInfo>((resolve, reject) => {
      const waiter: ReadyWaiter = { predicate, resolve, reject, settled: false };
      if (options.timeoutMs !== undefined) {
        waiter.timer = setTimeout(() => {
          this.settleWaiter(waiter, undefined, new Error(`process did not become ready within ${options.timeoutMs}ms`));
        }, options.timeoutMs);
      }
      this.readyWaiters.push(waiter);
    });
  }

  snapshot(): ManagedProcessSnapshot {
    return {
      name: this.name,
      status: this.status,
      pid: this.pid,
      url: this.readyInfo?.url,
      startedAt: this.startedAt,
      lastReadyAt: this.lastReadyAt,
      exitedAt: this.exitedAt,
      exitCode: this.exitCode,
      signal: this.signal,
      command: this.command,
      args: [...this.args],
      cwd: this.cwd,
    };
  }

  logs(): ManagedProcessLogs {
    return { stdout: [...this.stdout], stderr: [...this.stderr] };
  }

  private appendLog(stream: ProcessStream, chunk: Buffer | string): void {
    const text = String(chunk).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const carryKey = stream === 'stdout' ? 'stdoutCarry' : 'stderrCarry';
    const lines = (this[carryKey] + text).split('\n');
    this[carryKey] = lines.pop() ?? '';

    for (const line of lines) {
      this.pushLine(stream, line);
      this.checkReadyWaiters(line, stream);
    }
  }

  private pushLine(stream: ProcessStream, line: string): void {
    const buffer = stream === 'stdout' ? this.stdout : this.stderr;
    buffer.push(line);
    if (buffer.length > MAX_LOG_LINES) {
      buffer.splice(0, buffer.length - MAX_LOG_LINES);
    }
  }

  private checkReadyWaiters(line: string, stream: ProcessStream): void {
    for (const waiter of [...this.readyWaiters]) {
      if (waiter.settled) {
        continue;
      }
      const ready = this.toReadyInfo(waiter.predicate(line, stream));
      if (ready) {
        this.settleWaiter(waiter, ready);
      }
    }
  }

  private findReadyMatch(predicate: ReadyPredicate): ReadyInfo | null {
    for (const stream of ['stdout', 'stderr'] as const) {
      const buffer = stream === 'stdout' ? this.stdout : this.stderr;
      for (const line of buffer) {
        const ready = this.toReadyInfo(predicate(line, stream));
        if (ready) {
          return ready;
        }
      }
    }
    return null;
  }

  private toReadyInfo(match: ReturnType<ReadyPredicate>): ReadyInfo | null {
    if (!match || !this.pid) {
      return null;
    }
    const url = typeof match === 'string' ? match : match.url;
    return { url, pid: this.pid, startedAt: this.startedAt };
  }

  private settleWaiter(waiter: ReadyWaiter, ready?: ReadyInfo, err?: Error): void {
    waiter.settled = true;
    if (waiter.timer) {
      clearTimeout(waiter.timer);
    }
    this.readyWaiters = this.readyWaiters.filter((candidate) => candidate !== waiter);
    if (ready) {
      this.markReady(ready);
      waiter.resolve(ready);
      return;
    }
    waiter.reject(err ?? new Error('process did not become ready'));
  }

  private markReady(ready: ReadyInfo): void {
    if (this.status === 'starting') {
      this.status = 'running';
    }
    this.readyInfo = ready;
    this.lastReadyAt = new Date();
    if (!this.readySettled) {
      this.readySettled = true;
      this.resolveReady(ready);
    }
  }

  private rejectPendingReady(err: Error): void {
    for (const waiter of [...this.readyWaiters]) {
      this.settleWaiter(waiter, undefined, err);
    }
    if (!this.readySettled) {
      this.readySettled = true;
      this.rejectReady(err);
    }
  }
}

export class ProcessManager {
  private readonly processes = new Map<string, ManagedProcess>();
  private readonly spawnImpl: SpawnFunction;
  private readonly treeKillImpl: TreeKill;
  private readonly processKillImpl: (pid: number, signal: NodeJS.Signals) => void;
  private readonly platform: NodeJS.Platform;

  constructor(options: ProcessManagerOptions = {}) {
    this.spawnImpl = options.spawn ?? (nodeSpawn as SpawnFunction);
    this.treeKillImpl = options.treeKill ?? treeKill;
    this.processKillImpl = options.processKill ?? process.kill;
    this.platform = options.platform ?? process.platform;
  }

  spawn(options: SpawnManagedProcessOptions): ManagedProcess {
    const existing = this.processes.get(options.name);
    if (existing && existing.status !== 'exited') {
      throw new AlreadyRunningError(existing);
    }

    const managed = new ManagedProcess(options.name, options.cmd, options.args ?? [], options.cwd, options.oneShot ?? false);
    this.processes.set(options.name, managed);

    try {
      const child = this.spawnImpl(options.cmd, options.args ?? [], this.toSpawnOptions(options));
      managed.attachChild(child);
      child.on('exit', () => {
        if (managed.oneShot) {
          this.processes.delete(managed.name);
        }
      });
      return managed;
    } catch (err) {
      this.processes.delete(options.name);
      throw err;
    }
  }

  async stop(name: string, options: StopOptions = {}): Promise<ManagedProcessSnapshot | null> {
    const managed = this.processes.get(name);
    if (!managed) {
      return null;
    }
    await this.stopManagedProcess(managed, options.timeoutMs ?? DEFAULT_STOP_TIMEOUT_MS);
    if (options.remove === true) {
      this.processes.delete(name);
    }
    return managed.snapshot();
  }

  status(name?: string): ManagedProcessSnapshot | ManagedProcessSnapshot[] | null {
    if (name) {
      return this.processes.get(name)?.snapshot() ?? null;
    }
    return [...this.processes.values()].map((managed) => managed.snapshot());
  }

  logs(name: string): ManagedProcessLogs | null {
    return this.processes.get(name)?.logs() ?? null;
  }

  async stopAll(options: StopOptions = {}): Promise<ManagedProcessSnapshot[]> {
    const managedProcesses = [...this.processes.values()];
    const results = await Promise.allSettled(
      managedProcesses.map(async (managed) => {
        await this.stopManagedProcess(managed, options.timeoutMs ?? DEFAULT_STOP_TIMEOUT_MS);
        return managed.snapshot();
      }),
    );
    if (options.remove === true) {
      for (const managed of managedProcesses) {
        this.processes.delete(managed.name);
      }
    }
    const snapshots: ManagedProcessSnapshot[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        snapshots.push(result.value);
      } else {
        const managed = managedProcesses[i];
        console.error(`[ProcessManager] stopAll: failed to stop "${managed.name}":`, result.reason);
        snapshots.push(managed.snapshot());
      }
    }
    return snapshots;
  }

  get(name: string): ManagedProcess | undefined {
    return this.processes.get(name);
  }

  private toSpawnOptions(options: SpawnManagedProcessOptions): SpawnOptions {
    return {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    };
  }

  private async stopManagedProcess(managed: ManagedProcess, timeoutMs: number): Promise<void> {
    if (managed.status === 'exited') {
      return;
    }
    managed.status = 'stopping';
    const child = managed.child;
    if (!child || !managed.pid) {
      managed.status = 'exited';
      managed.exitedAt = new Date();
      return;
    }

    await this.killAndWait(managed, 'SIGTERM', timeoutMs);
    if ((managed.status as ManagedProcessStatus) !== 'exited') {
      await this.killAndWait(managed, 'SIGKILL', timeoutMs);
    }
    if ((managed.status as ManagedProcessStatus) !== 'exited') {
      throw new StopFailedError(managed.name);
    }
  }

  private async killAndWait(managed: ManagedProcess, signal: NodeJS.Signals, timeoutMs: number): Promise<void> {
    if (!managed.pid) {
      return;
    }

    const exitPromise = new Promise<void>((resolve) => {
      managed.child?.once('exit', () => resolve());
    });

    await this.killPid(managed.pid, signal);
    await Promise.race([
      exitPromise,
      new Promise<void>((resolve) => {
        setTimeout(resolve, timeoutMs);
      }),
    ]);
  }

  private killPid(pid: number, signal: NodeJS.Signals): Promise<void> {
    if (this.platform === 'win32') {
      return new Promise((resolve, reject) => {
        this.treeKillImpl(pid, signal, (err) => {
          if (err) {
            if (isMissingProcessError(err)) {
              resolve();
              return;
            }
            reject(err);
            return;
          }
          resolve();
        });
      });
    }
    try {
      this.processKillImpl(pid, signal);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ESRCH') {
        throw err;
      }
    }
    return Promise.resolve();
  }
}

function isMissingProcessError(err: Error): boolean {
  const code = (err as NodeJS.ErrnoException).code;
  return code === 'ESRCH' || /not found|no running instance|does not exist/i.test(err.message);
}
