import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('machine state persistence', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  async function loadPersistence(dir: string) {
    vi.doMock('@/configuration', () => ({
      configuration: {
        happyHomeDir: dir,
        logsDir: path.join(dir, 'logs'),
        settingsFile: path.join(dir, 'settings.json'),
        machineFile: path.join(dir, 'machine.json'),
        privateKeyFile: path.join(dir, 'access.key'),
        daemonStateFile: path.join(dir, 'daemon.state.json'),
        daemonLockFile: path.join(dir, 'daemon.state.json.lock'),
        sessionsFile: path.join(dir, 'sessions.json'),
        isDaemonProcess: false,
      },
    }));
    return import('./persistence');
  }

  it('migrates old { port, tunnelUrl } state into the new machine shape', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'happy-machine-state-'));
    await writeFile(path.join(dir, 'machine.json'), JSON.stringify({ port: 62000, tunnelUrl: 'https://old.devtunnels.ms' }));
    const { readMachineState } = await loadPersistence(dir);

    await expect(readMachineState('machine-1')).resolves.toEqual({
      machineId: 'machine-1',
      tunnelPort: 62000,
      loopbackPort: 62000,
      tunnelId: '',
      lastTunnelUrl: 'https://old.devtunnels.ms',
    });
    await expect(readFile(path.join(dir, 'machine.json'), 'utf-8').then(JSON.parse)).resolves.toEqual({
      machineId: 'machine-1',
      tunnelPort: 62000,
      loopbackPort: 62000,
      tunnelId: '',
      lastTunnelUrl: 'https://old.devtunnels.ms',
    });
  });

  it('writes machine.json atomically with the new persisted shape', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'happy-machine-state-'));
    const { writeMachineState } = await loadPersistence(dir);

    await writeMachineState({
      machineId: 'machine-1',
      tunnelPort: 62000,
      loopbackPort: 62001,
      tunnelId: 'happy-machine-1',
      lastTunnelUrl: 'https://happy-machine-1.devtunnels.ms',
    });

    await expect(readFile(path.join(dir, 'machine.json'), 'utf-8').then(JSON.parse)).resolves.toEqual({
      machineId: 'machine-1',
      tunnelPort: 62000,
      loopbackPort: 62001,
      tunnelId: 'happy-machine-1',
      lastTunnelUrl: 'https://happy-machine-1.devtunnels.ms',
    });
  });
});
