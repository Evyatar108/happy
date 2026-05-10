import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

import type { TrackedSession } from './types';
import type { StopTrackedSessionResult } from './stopTrackedSession';
import { stopTrackedSession, validateStopSessionId, STOP_SESSION_ID_MAX_LENGTH } from './stopTrackedSession';

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

describe('validateStopSessionId', () => {
  it('accepts a normal happySessionId string', () => {
    expect(validateStopSessionId('happy-session-123')).toEqual({ ok: true, sessionId: 'happy-session-123' });
  });

  it('accepts a well-formed PID- prefixed sessionId', () => {
    expect(validateStopSessionId('PID-1234')).toEqual({ ok: true, sessionId: 'PID-1234' });
    expect(validateStopSessionId('PID-9999999999')).toEqual({ ok: true, sessionId: 'PID-9999999999' });
    expect(validateStopSessionId('PID-0')).toEqual({ ok: true, sessionId: 'PID-0' });
  });

  it('rejects non-string and empty sessionIds', () => {
    expect(validateStopSessionId(undefined).ok).toBe(false);
    expect(validateStopSessionId(null).ok).toBe(false);
    expect(validateStopSessionId(123).ok).toBe(false);
    expect(validateStopSessionId('').ok).toBe(false);
  });

  it('rejects sessionId longer than 256 characters', () => {
    const tooLong = 'a'.repeat(STOP_SESSION_ID_MAX_LENGTH + 1);
    const result = validateStopSessionId(tooLong);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/256/);
    }
  });

  it('accepts sessionId at exactly 256 characters', () => {
    const atLimit = 'a'.repeat(STOP_SESSION_ID_MAX_LENGTH);
    expect(validateStopSessionId(atLimit)).toEqual({ ok: true, sessionId: atLimit });
  });

  it('rejects PID- prefix with non-numeric suffix', () => {
    expect(validateStopSessionId('PID-NaN').ok).toBe(false);
    expect(validateStopSessionId('PID-abc').ok).toBe(false);
    expect(validateStopSessionId('PID-1e9').ok).toBe(false);
    expect(validateStopSessionId('PID--1').ok).toBe(false);
    expect(validateStopSessionId('PID-').ok).toBe(false);
    expect(validateStopSessionId('PID- 123').ok).toBe(false);
  });

  it('rejects PID- prefix with overflow-length numeric suffix', () => {
    expect(validateStopSessionId('PID-12345678901').ok).toBe(false);
    expect(validateStopSessionId('PID-99999999999999').ok).toBe(false);
  });
});

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
      const result = await stopped;
      expect(result).toMatchObject<StopTrackedSessionResult>({ stopped: true, escalated: true, alive: false });

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
      const result = await stopped;
      expect(result).toMatchObject<StopTrackedSessionResult>({ stopped: true, escalated: true, alive: false });

      expect(killProcess).toHaveBeenCalledWith(4321, 'SIGTERM');
      expect(killProcess).toHaveBeenCalledWith(4321, 'SIGKILL');
      expect(sessions.has(4321)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns stopped: false when the child ignores both SIGTERM and SIGKILL', async () => {
    vi.useFakeTimers();
    try {
      const child = new EventEmitter() as any;
      child.exitCode = null;
      child.signalCode = null;
      child.kill = vi.fn((_signal: NodeJS.Signals) => true);

      const sessions = new Map<number, TrackedSession>([[
        5678,
        {
          startedBy: 'daemon',
          happySessionId: 'session-3',
          pid: 5678,
          childProcess: child,
        } as TrackedSession,
      ]]);

      const stopped = stopTrackedSession({
        sessionId: 'session-3',
        sessions,
        sigtermTimeoutMs: 5_000,
        pollIntervalMs: 100,
      });

      // SIGTERM timeout elapses — child still alive
      await vi.advanceTimersByTimeAsync(5_000);

      // SIGKILL grace period elapses — child still alive
      await vi.advanceTimersByTimeAsync(1_000);

      const result = await stopped;
      expect(result.stopped).toBe(false);
      expect(result.escalated).toBe(true);
      expect(result.alive).toBe(true);

      expect(child.kill).toHaveBeenCalledWith('SIGTERM');
      expect(child.kill).toHaveBeenCalledWith('SIGKILL');
      // Session tracking is retained because the process is still alive
      expect(sessions.has(5678)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
