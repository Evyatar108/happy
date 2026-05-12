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
  loadOrCreateTofuKeypairs: vi.fn(),
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

vi.mock('@/tofu/keypairManager', () => ({
  loadOrCreateTofuKeypairs: mocks.loadOrCreateTofuKeypairs,
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

function decodeJti(claim: string): string {
  const encoded = claim.slice('tunnel '.length);
  const envelope = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as { p: string };
  const payload = JSON.parse(Buffer.from(envelope.p, 'base64url').toString('utf-8')) as { jti: string };
  return payload.jti;
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
  mocks.loadOrCreateTofuKeypairs.mockResolvedValue({
    ed25519PrivateKey: new Uint8Array(32).fill(7),
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
    mocks.loadOrCreateTofuKeypairs.mockReset();
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
      auth: { tunnelAuthorization: expect.stringMatching(/^tunnel /) },
    });
    expect('extraHeaders' in options).toBe(false);
  });

  it('mints a fresh claim every time while loading key material once', async () => {
    const client = await loadClient(await makeHome());

    const claims = await Promise.all(Array.from({ length: 10 }, () => client.mintTunnelClaim()));
    const jtis = claims.map(decodeJti);

    expect(new Set(jtis).size).toBe(10);
    expect(mocks.loadOrCreateTofuKeypairs).toHaveBeenCalledTimes(1);
    expect(mocks.readSettings).toHaveBeenCalledTimes(1);
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

  it('retries tunnel fetch with a freshly minted claim after one 401', async () => {
    const client = await loadClient(await makeHome());
    const seenJtis: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      seenJtis.push(decodeJti(new Headers(init?.headers).get('X-Tunnel-Authorization') ?? ''));
      return response(seenJtis.length === 1 ? 401 : 200);
    });

    await expect(client.tunnelFetch('/v1/sessions')).resolves.toMatchObject({ status: 200 });

    expect(seenJtis).toHaveLength(2);
    expect(seenJtis[0]).not.toBe(seenJtis[1]);
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
