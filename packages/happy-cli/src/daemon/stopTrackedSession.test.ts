import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

import type { TrackedSession } from './types';
import { stopTrackedSession } from './stopTrackedSession';

function createChildProcess() {
  const child = new EventEmitter() as any;
  child.exitCode = null;
  child.signalCode = null;
  child.kill = vi.fn((signal: NodeJS.Signals) => {
    if (signal === 'SIGKILL') {
      queueMicrotask(() => {
        child.signalCode = 'SIGKILL';
        child.emit('exit', null, 'SIGKILL');
      });
    }
    return true;
  });
  return child;
}

describe('stopTrackedSession', () => {
  it('waits for SIGTERM and escalates to SIGKILL when a daemon child ignores it', async () => {
    vi.useFakeTimers();
    try {
      const child = createChildProcess();
      const sessions = new Map<number, TrackedSession>([[
        1234,
        {
          startedBy: 'daemon',
          happySessionId: 'session-1',
          pid: 1234,
          childProcess: child,
        } as TrackedSession,
      ]]);

      const stopped = stopTrackedSession({
        sessionId: 'session-1',
        sessions,
        sigtermTimeoutMs: 5_000,
      });

      await vi.advanceTimersByTimeAsync(4_999);
      expect(child.kill).toHaveBeenCalledTimes(1);
      expect(child.kill).toHaveBeenCalledWith('SIGTERM');
      expect(sessions.has(1234)).toBe(true);

      await vi.advanceTimersByTimeAsync(1);
      await expect(stopped).resolves.toBe(true);

      expect(child.kill).toHaveBeenCalledWith('SIGKILL');
      expect(child.kill).toHaveBeenCalledTimes(2);
      expect(sessions.has(1234)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('removes external PID tracking only after the process is gone', async () => {
    vi.useFakeTimers();
    try {
      let alive = true;
      const killProcess = vi.fn((pid: number, signal: NodeJS.Signals | 0) => {
        if (pid !== 4321) throw new Error('unexpected pid');
        if (signal === 'SIGKILL') {
          alive = false;
          return true;
        }
        if (signal === 0 && !alive) throw new Error('dead');
        return true;
      });
      const sessions = new Map<number, TrackedSession>([[
        4321,
        {
          startedBy: 'happy directly - likely by user from terminal',
          happySessionId: 'session-2',
          pid: 4321,
        },
      ]]);

      const stopped = stopTrackedSession({
        sessionId: 'session-2',
        sessions,
        sigtermTimeoutMs: 5_000,
        pollIntervalMs: 100,
        killProcess,
      });

      await vi.advanceTimersByTimeAsync(4_999);
      expect(sessions.has(4321)).toBe(true);
      expect(killProcess).not.toHaveBeenCalledWith(4321, 'SIGKILL');

      await vi.advanceTimersByTimeAsync(101);
      await expect(stopped).resolves.toBe(true);

      expect(killProcess).toHaveBeenCalledWith(4321, 'SIGTERM');
      expect(killProcess).toHaveBeenCalledWith(4321, 'SIGKILL');
      expect(sessions.has(4321)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
