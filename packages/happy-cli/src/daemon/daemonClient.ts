import { createConnection } from 'node:net';
import { readFile } from 'node:fs/promises';

import { configuration } from '@/configuration';
import { readMachineState, readSettings } from '@/persistence';

import { loopbackCapabilityPath } from './loopbackCapability';
import { ensureDaemonRunning } from './ensureDaemonRunning';

const DEFAULT_READY_TIMEOUT_MS = 10_000;
const READY_POLL_INTERVAL_MS = 100;
const TCP_PROBE_TIMEOUT_MS = 250;
const FETCH_TIMEOUT_MS = 30_000;

let cachedCapability: string | null = null;

export interface EnsureDaemonReadyOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function probeTcpPort(port: number): Promise<boolean> {
  return await new Promise(resolve => {
    const socket = createConnection({ host: '127.0.0.1', port });
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(TCP_PROBE_TIMEOUT_MS);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function machineState() {
  const settings = await readSettings();
  return await readMachineState(settings.machineId);
}

async function readyNow(): Promise<boolean> {
  const state = await machineState();
  if (!state) return false;
  try {
    const cap = await readCapability();
    if (!cap) return false;
  } catch {
    return false;
  }
  const [tunnelReady, loopbackReady] = await Promise.all([
    probeTcpPort(state.tunnelPort),
    probeTcpPort(state.loopbackPort),
  ]);
  return tunnelReady && loopbackReady;
}

export async function ensureDaemonReady(options: EnsureDaemonReadyOptions = {}): Promise<void> {
  await ensureDaemonRunning();
  const timeoutMs = options.timeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? READY_POLL_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (await readyNow()) return;
    await sleep(pollIntervalMs);
  }
  throw new Error('Happy daemon is not ready; run happy daemon start');
}

export async function getLoopbackBaseUrl(): Promise<string> {
  const state = await machineState();
  if (!state) {
    throw new Error('Happy daemon machine state is unavailable; run happy daemon start');
  }
  return `http://127.0.0.1:${state.loopbackPort}`;
}

export async function getTunnelLocalBaseUrl(): Promise<string> {
  const state = await machineState();
  if (!state) {
    throw new Error('Happy daemon machine state is unavailable; run happy daemon start');
  }
  return `http://127.0.0.1:${state.tunnelPort}`;
}

export async function readCapability(): Promise<string> {
  if (cachedCapability !== null) return cachedCapability;
  cachedCapability = (await readFile(loopbackCapabilityPath(configuration.happyHomeDir), 'utf-8')).trim();
  return cachedCapability;
}

export function invalidateCapability(): void {
  cachedCapability = null;
}

function mergeHeaders(init: RequestInit | undefined, headers: Record<string, string>): Headers {
  const merged = new Headers(init?.headers);
  for (const [name, value] of Object.entries(headers)) {
    merged.set(name, value);
  }
  return merged;
}

function appendPath(baseUrl: string, path: string): string {
  return new URL(path, baseUrl).toString();
}

export async function loopbackFetch(path: string, init: RequestInit = {}): Promise<Response> {
  await ensureDaemonReady();
  const baseUrl = await getLoopbackBaseUrl();
  const makeRequest = async () => await fetch(appendPath(baseUrl, path), {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: mergeHeaders(init, { 'X-Loopback-Capability': await readCapability() }),
  });

  let response = await makeRequest();
  if (response.status !== 401) return response;

  invalidateCapability();
  response = await makeRequest();
  if (response.status === 401) {
    throw new Error(`Loopback request failed after capability refresh: ${path}`);
  }
  return response;
}

export async function tunnelFetch(path: string, init: RequestInit = {}): Promise<Response> {
  await ensureDaemonReady();
  const baseUrl = await getTunnelLocalBaseUrl();
  return await fetch(appendPath(baseUrl, path), {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

export async function tunnelSocketIOOptions(): Promise<{ url: string; auth: Record<string, never> }> {
  await ensureDaemonReady();
  return {
    url: await getTunnelLocalBaseUrl(),
    auth: {},
  };
}

export function __resetDaemonClientForTests(): void {
  cachedCapability = null;
}
