import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  configuration: {
    happyHomeDir: '',
  },
  readSettings: vi.fn(),
  readMachineState: vi.fn(),
  createConnection: vi.fn(),
  ensureDaemonRunning: vi.fn(),
  tcpReady: true,
}));

vi.mock('@/configuration', () => ({
  configuration: mocks.configuration,
}));

vi.mock('@/persistence', () => ({
  readSettings: mocks.readSettings,
  readMachineState: mocks.readMachineState,
}));

vi.mock('node:net', () => ({
  createConnection: mocks.createConnection,
}));

vi.mock('./ensureDaemonRunning', () => ({
  ensureDaemonRunning: mocks.ensureDaemonRunning,
}));

function response(status: number): Response {
  return new Response('{}', { status, headers: { 'Content-Type': 'application/json' } });
}

async function loadClient(homeDir: string) {
  mocks.configuration.happyHomeDir = homeDir;
  mocks.readSettings.mockResolvedValue({ machineId: 'machine-1' });
  mocks.readMachineState.mockResolvedValue({
    machineId: 'machine-1',
    tunnelPort: 62000,
    loopbackPort: 62001,
    tunnelId: 'tunnel-1',
    lastTunnelUrl: 'https://example.devtunnels.ms',
  });
  const client = await import('./daemonClient');
  client.__resetDaemonClientForTests();
  return client;
}

describe('daemonClient', () => {
  const tmpDirs: string[] = [];

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    mocks.readSettings.mockReset();
    mocks.readMachineState.mockReset();
    mocks.createConnection.mockReset();
    mocks.ensureDaemonRunning.mockReset();
    mocks.ensureDaemonRunning.mockResolvedValue(undefined);
    mocks.tcpReady = true;
    mocks.createConnection.mockImplementation(() => {
      const socket = new EventEmitter() as EventEmitter & { setTimeout: () => void; destroy: () => void };
      socket.setTimeout = vi.fn();
      socket.destroy = vi.fn();
      process.nextTick(() => {
        socket.emit(mocks.tcpReady ? 'connect' : 'error', new Error('not listening'));
      });
      return socket;
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const dir of tmpDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  async function makeHome(): Promise<string> {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'happy-daemon-client-'));
    tmpDirs.push(dir);
    await writeFile(path.join(dir, 'loopback-cap.txt'), 'cap-old\n');
    return dir;
  }

  it('returns tunnel Socket.IO object auth without extraHeaders', async () => {
    const client = await loadClient(await makeHome());

    const options = await client.tunnelSocketIOOptions();

    expect(options.url).toBe('http://127.0.0.1:62000');
    expect(options).toEqual({
      url: 'http://127.0.0.1:62000',
      auth: {},
    });
    expect('extraHeaders' in options).toBe(false);
  });

  it('re-reads a rotated loopback capability after one 401', async () => {
    const homeDir = await makeHome();
    const client = await loadClient(homeDir);
    const seenCaps: string[] = [];
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      seenCaps.push(new Headers(init?.headers).get('X-Loopback-Capability') ?? '');
      if (seenCaps.length === 1) {
        await writeFile(path.join(homeDir, 'loopback-cap.txt'), 'cap-new\n');
        return response(401);
      }
      return response(200);
    });

    await expect(client.loopbackFetch('/v2/me/settings')).resolves.toMatchObject({ status: 200 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(seenCaps).toEqual(['cap-old', 'cap-new']);
  });

  it('surfaces a second loopback 401 as a hard error', async () => {
    const client = await loadClient(await makeHome());
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(401));

    await expect(client.loopbackFetch('/v2/me/settings')).rejects.toThrow('capability refresh');
  });

  it('sends tunnel fetches without the retired Happy claim header', async () => {
    const client = await loadClient(await makeHome());
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(200));

    await expect(client.tunnelFetch('/v1/sessions')).resolves.toMatchObject({ status: 200 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get('X-Codexu-Authorization')).toBeNull();
  });

  it('calls ensureDaemonRunning before polling so cold-start auto-spawns the daemon', async () => {
    const client = await loadClient(await makeHome());

    await client.ensureDaemonReady();

    expect(mocks.ensureDaemonRunning).toHaveBeenCalledTimes(1);
  });

  it('times out clearly when the daemon ports are down', async () => {
    const client = await loadClient(await makeHome());
    mocks.tcpReady = false;

    await expect(client.ensureDaemonReady({ timeoutMs: 1, pollIntervalMs: 1 })).rejects.toThrow('run happy daemon start');
  });

  it('treats invalid machine.json as not ready without parsing it locally', async () => {
    const homeDir = await makeHome();
    await writeFile(path.join(homeDir, 'machine.json'), '{not-json');
    const client = await loadClient(homeDir);
    mocks.readMachineState.mockResolvedValue(null);

    await expect(client.ensureDaemonReady({ timeoutMs: 1, pollIntervalMs: 1 })).rejects.toThrow('run happy daemon start');
    await expect(readFile(path.join(homeDir, 'machine.json'), 'utf-8')).resolves.toBe('{not-json');
  });
});
