import type { TrackedSession } from './types';

type Signal = 'SIGTERM' | 'SIGKILL';

export const STOP_SESSION_ID_MAX_LENGTH = 256;
export const STOP_SESSION_PID_SUFFIX_SHAPE = /^[0-9]{1,10}$/;

export function validateStopSessionId(sessionId: unknown): { ok: true; sessionId: string } | { ok: false; error: string } {
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    return { ok: false, error: 'sessionId must be a non-empty string' };
  }
  if (sessionId.length > STOP_SESSION_ID_MAX_LENGTH) {
    return { ok: false, error: `sessionId must be at most ${STOP_SESSION_ID_MAX_LENGTH} characters` };
  }
  if (sessionId.startsWith('PID-')) {
    const suffix = sessionId.slice('PID-'.length);
    if (!STOP_SESSION_PID_SUFFIX_SHAPE.test(suffix)) {
      return { ok: false, error: 'sessionId with PID- prefix must have a 1-10 digit numeric suffix' };
    }
  }
  return { ok: true, sessionId };
}

export interface StopTrackedSessionOptions {
  sessionId: string;
  sessions: Map<number, TrackedSession>;
  sigtermTimeoutMs?: number;
  pollIntervalMs?: number;
  killProcess?: (pid: number, signal: Signal | 0) => boolean;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}

export interface StopTrackedSessionResult {
  stopped: boolean;
  escalated: boolean;
  alive: boolean;
}

function matchesSession(sessionId: string, pid: number, session: TrackedSession): boolean {
  return session.happySessionId === sessionId
    || (sessionId.startsWith('PID-') && pid === Number.parseInt(sessionId.replace('PID-', ''), 10));
}

function sendSignal(
  pid: number,
  session: TrackedSession,
  signal: Signal,
  killProcess: (pid: number, signal: Signal | 0) => boolean,
): boolean {
  if (session.startedBy === 'daemon' && session.childProcess) {
    return session.childProcess.kill(signal);
  }
  return killProcess(pid, signal);
}

async function waitForChildExit(
  session: TrackedSession,
  timeoutMs: number,
  setTimer: typeof setTimeout,
  clearTimer: typeof clearTimeout,
): Promise<boolean> {
  const child = session.childProcess;
  if (!child) return false;
  if (child.exitCode !== null || child.signalCode !== null) return true;

  return new Promise((resolve) => {
    let settled = false;
    const done = (exited: boolean) => {
      if (settled) return;
      settled = true;
      clearTimer(timeout);
      child.off('exit', onExit);
      child.off('close', onExit);
      resolve(exited);
    };
    const onExit = () => done(true);
    const timeout = setTimer(() => done(false), timeoutMs);
    child.once('exit', onExit);
    child.once('close', onExit);
  });
}

async function waitForExternalExit(
  pid: number,
  timeoutMs: number,
  pollIntervalMs: number,
  killProcess: (pid: number, signal: Signal | 0) => boolean,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      killProcess(pid, 0);
    } catch {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  return false;
}

async function waitForExit(
  pid: number,
  session: TrackedSession,
  timeoutMs: number,
  pollIntervalMs: number,
  killProcess: (pid: number, signal: Signal | 0) => boolean,
  setTimer: typeof setTimeout,
  clearTimer: typeof clearTimeout,
): Promise<boolean> {
  if (session.childProcess) {
    return waitForChildExit(session, timeoutMs, setTimer, clearTimer);
  }
  return waitForExternalExit(pid, timeoutMs, pollIntervalMs, killProcess);
}

export async function stopTrackedSession({
  sessionId,
  sessions,
  sigtermTimeoutMs = 5_000,
  pollIntervalMs = 100,
  killProcess = process.kill,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}: StopTrackedSessionOptions): Promise<StopTrackedSessionResult> {
  for (const [pid, session] of sessions.entries()) {
    if (!matchesSession(sessionId, pid, session)) continue;

    try {
      sendSignal(pid, session, 'SIGTERM', killProcess);
    } catch {
      sessions.delete(pid);
      return { stopped: true, escalated: false, alive: false };
    }

    const exitedAfterTerm = await waitForExit(
      pid,
      session,
      sigtermTimeoutMs,
      pollIntervalMs,
      killProcess,
      setTimer,
      clearTimer,
    );
    if (exitedAfterTerm) {
      if (!session.childProcess) sessions.delete(pid);
      return { stopped: true, escalated: false, alive: false };
    }

    try {
      sendSignal(pid, session, 'SIGKILL', killProcess);
    } catch {
      sessions.delete(pid);
      return { stopped: true, escalated: true, alive: false };
    }

    const exitedAfterKill = await waitForExit(
      pid,
      session,
      Math.max(1_000, pollIntervalMs),
      pollIntervalMs,
      killProcess,
      setTimer,
      clearTimer,
    );
    if (exitedAfterKill && !session.childProcess) sessions.delete(pid);
    return { stopped: exitedAfterKill, escalated: true, alive: !exitedAfterKill };
  }

  return { stopped: false, escalated: false, alive: false };
}
